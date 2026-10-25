import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface RiderJoints {
  pelvis: THREE.Vector3;
  chest: THREE.Vector3;
  shoulders: [THREE.Vector3, THREE.Vector3];
  elbows: [THREE.Vector3, THREE.Vector3];
  wrists: [THREE.Vector3, THREE.Vector3];
  hips: [THREE.Vector3, THREE.Vector3];
  knees: [THREE.Vector3, THREE.Vector3];
  ankles: [THREE.Vector3, THREE.Vector3];
  lateral: THREE.Vector3;
  headPosition: THREE.Vector3;
  headQuaternion: THREE.Quaternion;
}

interface BindBone { key: string; bone: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
interface BoneTarget { position: THREE.Vector3; quaternion: THREE.Quaternion; scale?: THREE.Vector3 }
const MODEL_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
export type RiderAsset = 'quaternius' | 'imported';
const ACCURIG: Record<string, string> = {
  CC_Base_Hip: 'pelvis', CC_Base_Waist: 'spine_01', CC_Base_Spine01: 'spine_02', CC_Base_Spine02: 'spine_03',
  CC_Base_NeckTwist01: 'neck_01', CC_Base_Head: 'Head',
};
for (const side of ['L', 'R']) for (const [source, target] of [['Clavicle', 'clavicle'], ['Upperarm', 'upperarm'], ['Forearm', 'lowerarm'], ['Hand', 'hand'], ['Thigh', 'thigh'], ['Calf', 'calf'], ['Foot', 'foot']]) {
  ACCURIG[`CC_Base_${side}_${source}`] = `${target}_${side.toLowerCase()}`;
}

/** A continuous, weighted character mesh, driven by our contact IK.
 * Targets are in bicycle coordinates; bones retain the donor's bind transforms.
 * No animation clips or baked rider/bicycle translations are imported.
 */
export class RiderSkin {
  readonly root: THREE.Group;
  readonly meshes: THREE.SkinnedMesh[] = [];
  private readonly bones = new Map<string, BindBone>();
  private readonly order: BindBone[] = [];
  readonly dimensions = { upperArm: .255, forearm: .245, thigh: .429, shin: .459 };

  static async load(asset: RiderAsset = 'quaternius') {
    const file = asset === 'imported' ? 'imported-rider.glb' : 'base-rider.glb';
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/rider/${file}`);
    return new RiderSkin(gltf.scene, asset);
  }

  constructor(scene: THREE.Group, readonly asset: RiderAsset = 'quaternius') {
    this.root = scene;
    scene.name = asset === 'imported' ? 'supplied-accurig-rider' : 'quaternius-mtb-rider';
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      // glTF marks only weighted joints as Bone; AccuRig's unweighted main
      // controllers remain Object3D parents of the weighted twist joints.
      if (object instanceof THREE.Bone || (asset === 'imported' && object.name.startsWith('CC_Base_'))) {
        const key = asset === 'imported' ? ACCURIG[object.name] ?? object.name : object.name;
        const bind = { key, bone: object, position: object.getWorldPosition(new THREE.Vector3()), quaternion: object.getWorldQuaternion(new THREE.Quaternion()), scale: object.getWorldScale(new THREE.Vector3()) };
        this.bones.set(key, bind);
        this.order.push(bind);
      }
      if (object instanceof THREE.SkinnedMesh) {
        this.meshes.push(object);
        object.castShadow = true;
        object.receiveShadow = true;
        // Animated bounds change dramatically in a tuck. Avoid using T-pose bounds.
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) {
          material.roughness = .92;
          material.metalness = 0;
        }
      }
    });
    for (const required of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r']) {
      if (!this.bones.has(required)) throw new Error(`Rider asset is missing ${required}`);
    }
    if (asset === 'imported') {
      const distance = (a: string, b: string) => this.bones.get(a)!.position.distanceTo(this.bones.get(b)!.position);
      Object.assign(this.dimensions, { upperArm: distance('upperarm_l', 'lowerarm_l'), forearm: distance('lowerarm_l', 'hand_l'), thigh: distance('thigh_l', 'calf_l'), shin: distance('calf_l', 'foot_l') });
    }
  }

  apply(joints: RiderJoints) {
    const targets = new Map<string, BoneTarget>();
    const up = joints.chest.clone().sub(joints.pelvis).normalize();
    const lateral = joints.lateral.clone().addScaledVector(up, -joints.lateral.dot(up)).normalize();
    const forward = up.clone().cross(lateral).normalize();
    const bodyBasis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral.clone().negate(), up, forward));
    const imported = this.asset === 'imported';
    const origin = imported
      ? this.bones.get('thigh_l')!.position.clone().lerp(this.bones.get('thigh_r')!.position, .5).add(new THREE.Vector3(0, .025, 0))
      : this.bones.get('pelvis')!.position;
    const referenceShoulderHeight = imported ? this.bones.get('upperarm_l')!.position.y - origin.y : .506;
    const torsoScale = joints.chest.distanceTo(joints.pelvis) / referenceShoulderHeight;
    const bodyPosition = (point: THREE.Vector3) => {
      const relative = point.clone().sub(origin);
      relative.x *= imported ? .92 : .86;
      relative.y *= torsoScale;
      relative.z *= .95;
      return relative.applyQuaternion(bodyBasis).add(joints.pelvis);
    };
    const bodyTarget = (name: string) => {
      const bind = this.bones.get(name)!;
      targets.set(name, { position: bodyPosition(bind.position), quaternion: bodyBasis.clone().multiply(bind.quaternion) });
    };
    for (const name of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']) bodyTarget(name);

    const aim = (name: string, child: string, start: THREE.Vector3, end: THREE.Vector3, base = bodyBasis) => {
      const bind = this.bones.get(name)!, childBind = this.bones.get(child)!;
      const oldDirection = childBind.position.clone().sub(bind.position).normalize().applyQuaternion(base);
      const direction = end.clone().sub(start).normalize();
      const swing = new THREE.Quaternion().setFromUnitVectors(oldDirection, direction);
      targets.set(name, { position: start.clone(), quaternion: swing.multiply(base.clone().multiply(bind.quaternion)) });
    };
    // Fit each donor's head inside its helmet without moving the helmet away
    // from the solved neck. The imported head retains its textured face/hair.
    const headBase = joints.headPosition.clone().add(new THREE.Vector3(imported ? .030 : -.012, -.035, 0).applyQuaternion(joints.headQuaternion));
    const neckBase = bodyPosition(this.bones.get('neck_01')!.position);
    aim('neck_01', 'Head', neckBase, headBase);
    targets.set('Head', { position: headBase, quaternion: joints.headQuaternion.clone().multiply(MODEL_FORWARD).multiply(this.bones.get('Head')!.quaternion), scale: this.bones.get('Head')!.scale.clone().multiplyScalar(imported ? .85 : .78) });

    // The source faces +Z. Rotating it to +X places its right side on our +Z.
    for (const [index, side] of [[0, 'r'], [1, 'l']] as const) {
      aim(`upperarm_${side}`, `lowerarm_${side}`, joints.shoulders[index], joints.elbows[index], MODEL_FORWARD);
      aim(`lowerarm_${side}`, `hand_${side}`, joints.elbows[index], joints.wrists[index], MODEL_FORWARD);
      aim(`thigh_${side}`, `calf_${side}`, joints.hips[index], joints.knees[index], MODEL_FORWARD);
      aim(`calf_${side}`, `foot_${side}`, joints.knees[index], joints.ankles[index], MODEL_FORWARD);
      for (const [name, position] of [[`hand_${side}`, joints.wrists[index]], [`foot_${side}`, joints.ankles[index]]] as const) {
        const bind = this.bones.get(name)!;
        targets.set(name, { position: position.clone(), quaternion: MODEL_FORWARD.clone().multiply(bind.quaternion) });
      }
    }

    if (imported) {
      // AccuRig weights most of the sleeve/trouser surface to twist helpers.
      // Place those on the solved segments too; moving only the named joints
      // leaves the visible mesh pointing along its old T-pose limb lengths.
      const twist = (start: string, end: string, prefix: string) => {
        const a = this.bones.get(start)!, b = this.bones.get(end)!;
        const ta = targets.get(start)!, tb = targets.get(end)!;
        const axis = b.position.clone().sub(a.position);
        for (const helper of this.order.filter(item => item.bone.name.startsWith(prefix) && item.key !== start)) {
          const fraction = THREE.MathUtils.clamp(helper.position.clone().sub(a.position).dot(axis) / axis.lengthSq(), 0, 1);
          targets.set(helper.key, {
            position: ta.position.clone().lerp(tb.position, fraction),
            quaternion: ta.quaternion.clone().multiply(a.quaternion.clone().invert()).multiply(helper.quaternion),
          });
        }
      };
      for (const side of ['l', 'r']) {
        const upper = side.toUpperCase();
        for (const [start, end, source] of [['upperarm', 'lowerarm', 'Upperarm'], ['lowerarm', 'hand', 'Forearm'], ['thigh', 'calf', 'Thigh'], ['calf', 'foot', 'Calf']]) {
          twist(`${start}_${side}`, `${end}_${side}`, `CC_Base_${upper}_${source}Twist`);
        }
      }
      twist('neck_01', 'Head', 'CC_Base_NeckTwist');
    }

    // Apply parent before child, converting the desired rider-local transforms
    // through the actual parent matrix. Rider root can itself be rotated in air.
    this.root.updateWorldMatrix(true, true);
    const inverseRoot = this.root.matrixWorld.clone().invert();
    for (const bind of this.order) {
      const target = targets.get(bind.key);
      if (target) {
        const parentInRider = inverseRoot.clone().multiply(bind.bone.parent!.matrixWorld);
        const local = parentInRider.invert().multiply(new THREE.Matrix4().compose(target.position, target.quaternion, target.scale ?? bind.scale));
        local.decompose(bind.bone.position, bind.bone.quaternion, bind.bone.scale);
      }
      bind.bone.updateWorldMatrix(false, false);
    }
    for (const mesh of this.meshes) mesh.skeleton.update();
  }

  jointPosition(name: string) {
    const bone = this.bones.get(name)?.bone;
    return bone ? this.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())) : undefined;
  }
}
