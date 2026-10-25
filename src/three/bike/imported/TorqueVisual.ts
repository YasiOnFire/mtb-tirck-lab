import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TrickPose } from '../../../types';
import type { BikeAnchors } from '../kinematics';
import { clamp, mesh, v } from '../geometry';

export interface TorqueBindings { root: THREE.Group }
const Z = v(0, 0, 1), Y = v(0, 1, 0);
const SCALE = 1.12, CENTER = .98487, SAG = .04;
const FRONT = v(.567591, .315336), REAR = v(-.562449, .329290);
const MID = FRONT.clone().add(REAR).multiplyScalar(.5);
const LEVEL = -Math.atan2(FRONT.y - REAR.y, FRONT.x - REAR.x);
const native = (forward: number, up: number, side = CENTER) => fit(v(side, forward, up));

/** One rigid similarity transform for the complete source bicycle. */
function fit(p: THREE.Vector3) {
  return v(p.y - MID.x, p.z - MID.y, p.x - CENTER).multiplyScalar(SCALE).applyAxisAngle(Z, LEVEL).add(v(0, .37));
}

function selectGeometry(source: THREE.BufferGeometry, filter?: (p: THREE.Vector3) => boolean) {
  const pos = source.getAttribute('position'), index = source.getIndex();
  const vertices: number[] = [], indices: number[] = [], remap = new Map<number, number>();
  for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
    const center = v(0, 0, 0);
    ids.forEach(id => center.add(v(pos.getX(id), pos.getY(id), pos.getZ(id))));
    if (filter && !filter(center.multiplyScalar(1 / 3))) continue;
    ids.forEach(id => {
      let mapped = remap.get(id);
      if (mapped === undefined) {
        mapped = remap.size; remap.set(id, mapped);
        vertices.push(pos.getX(id), pos.getY(id), pos.getZ(id));
      }
      indices.push(mapped);
    });
  }
  if (!indices.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

interface DeformedPart { part: THREE.Mesh; rest: Float32Array; weights: Float32Array; kind: 'rear' | 'front' }

/** Native Canyon frame, linkage and materials, driven at their own pivots. */
export class TorqueVisual {
  readonly debug = {
    source: 'MatiDe / Canyon Torque 2018', sourceTriangles: 195681,
    geometry: 'uniform scale and rotation', uniformScale: SCALE,
    saddleDrop: .08, attachedParts: [] as string[], retainedProcedural: [] as string[],
  };
  private readonly frame = new THREE.Group();
  private readonly steering = new THREE.Group();
  private readonly lowerStay = new THREE.Group();
  private readonly upperStay = new THREE.Group();
  private readonly rocker = new THREE.Group();
  private readonly forkLower = new THREE.Group();
  private readonly crank = new THREE.Group();
  private readonly frontWheel = new THREE.Group();
  private readonly rearWheel = new THREE.Group();
  private readonly frontSpin = new THREE.Group();
  private readonly rearSpin = new THREE.Group();
  private readonly saddle = new THREE.Group();
  private readonly pedals: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  private readonly grips: [THREE.Object3D, THREE.Object3D] = [new THREE.Object3D(), new THREE.Object3D()];
  private readonly pivot = native(.2675, .8505);
  private readonly frontRest = native(FRONT.x, FRONT.y);
  private readonly rearRest = native(REAR.x, REAR.y);
  private readonly bb = native(-.173568, .296382);
  private readonly lowerPivot = native(-.191, .322);
  private readonly rockerPivot = native(-.169, .465);
  private readonly stayJoint = native(-.267, .473);
  private readonly shockTop = native(.060, .630);
  private readonly shockBottom = native(-.135, .529);
  private readonly forkAxis = native(.232, .915).sub(native(.303, .786)).normalize();
  private readonly shockUpper = new THREE.Group();
  private readonly shockLower = new THREE.Group();
  private readonly deformed: DeformedPart[] = [];
  private spring?: THREE.Mesh;
  private springMin = 0;
  private springSpan = 1;
  private readonly seatDrop = native(-.340, .852).sub(native(-.252, .695)).normalize().multiplyScalar(-.08);

  static async load(url: string) { return (await new GLTFLoader().loadAsync(url)).scene; }

  constructor(source: THREE.Group, private readonly rig: TorqueBindings) {
    // Keep the procedural rig available for the other version, but replace its
    // visible parts and contact/IK anchors with the source bicycle's own layout.
    rig.root.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.visible = false; });
    this.frame.position.copy(this.pivot); this.steering.position.copy(this.pivot);
    rig.root.add(this.frame, this.steering);
    const group = (parent: THREE.Group, child: THREE.Group, point: THREE.Vector3, origin: THREE.Vector3) => {
      child.position.copy(point).sub(origin); parent.add(child);
    };
    group(this.frame, this.lowerStay, this.lowerPivot, this.pivot);
    group(this.frame, this.upperStay, this.rearRest, this.pivot);
    group(this.frame, this.rocker, this.rockerPivot, this.pivot);
    group(this.frame, this.rearWheel, this.rearRest, this.pivot);
    group(this.steering, this.forkLower, this.frontRest, this.pivot);
    this.forkLower.add(this.frontWheel); this.frontWheel.add(this.frontSpin);
    this.rearWheel.add(this.rearSpin);
    this.frontSpin.name = 'front-wheel-spin'; this.rearSpin.name = 'rear-wheel-spin';
    group(this.frame, this.crank, this.bb, this.pivot);
    group(this.frame, this.saddle, native(-.3083855, .8727755).add(this.seatDrop), this.pivot);
    group(this.frame, this.shockUpper, this.shockTop, this.pivot);
    group(this.frame, this.shockLower, this.shockBottom, this.pivot);
    const postBase = native(-.252, .695), postAxis = native(-.340, .852).sub(postBase), postLength = postAxis.length();
    postAxis.normalize();
    for (const [i, side] of [[0, 1], [1, -1]] as const) {
      const pedalPoint = side > 0 ? native(-.010622, .296382, 1.10644) : native(-.335160, .296382, .8694875);
      group(this.crank, this.pedals[i], pedalPoint, this.bb);
      this.grips[i].position.copy(native(.235516, .990313, CENTER + side * .294461)).sub(this.pivot);
      this.steering.add(this.grips[i]);
    }
    rig.root.updateMatrixWorld(true);
    const materials = new Map<THREE.Material, THREE.Material>();
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = object.name;
      const original = Array.isArray(object.material) ? object.material[0]! : object.material;
      let material = materials.get(original);
      if (!material) { const copy = original.clone() as THREE.Material; materials.set(original, copy); material = copy; }
      const attach = (parent: THREE.Object3D, filter?: (p: THREE.Vector3) => boolean, modify?: (p: THREE.Vector3) => THREE.Vector3, suffix = '', deformation?: 'rear' | 'front') => {
        const geometry = selectGeometry(object.geometry, filter); if (!geometry) return;
        const pos = geometry.getAttribute('position'), weights = new Float32Array(pos.count);
        const inverse = parent.matrixWorld.clone().invert();
        for (let i = 0; i < pos.count; i++) {
          const raw = v(pos.getX(i), pos.getY(i), pos.getZ(i));
          weights[i] = deformation === 'rear' ? clamp((-.173568 - raw.y) / (-.173568 - REAR.x)) : clamp((.74 - raw.z) / .43);
          const point = fit(raw); if (modify) modify(point);
          point.applyMatrix4(inverse); pos.setXYZ(i, point.x, point.y, point.z);
        }
        geometry.computeVertexNormals(); geometry.computeBoundingSphere();
        const part = mesh(parent, geometry, material!); part.name = 'torque:' + name + suffix;
        this.debug.attachedParts.push(part.name);
        if (deformation) {
          part.frustumCulled = false;
          this.deformed.push({part, rest: new Float32Array(pos.array), weights, kind: deformation});
        }
        return part;
      };
      if (/^(Tires|Rims|Brake_Discs|Hubs|Spokes)_/.test(name)) {
        attach(this.frontSpin, p => p.y > 0, undefined, ':front');
        attach(this.rearSpin, p => p.y < 0, undefined, ':rear');
      } else if (name.startsWith('Cassette_')) attach(this.rearSpin);
      else if (name.startsWith('Back_Axle_') || name.startsWith('Brakes_Back_') || name.startsWith('Derailleur_')) attach(this.rearWheel);
      else if (name.startsWith('Front_Axle_') || /^Brakes\.?_Front_/.test(name) || name.startsWith('Rebound_')) attach(this.forkLower);
      else if (name === 'Fork_Cylinder') {
        attach(this.steering, p => p.z >= .72, undefined, ':crown');
        attach(this.forkLower, p => p.z < .72, undefined, ':lowers');
      } else if (name.startsWith('Fork2_') || name.startsWith('Compression_') || /^(Stem|Handlebars|Grips)_/.test(name)) attach(this.steering);
      else if (name.startsWith('Frame2_')) attach(this.lowerStay);
      else if (name.startsWith('Frame3_')) attach(this.upperStay);
      else if (name.startsWith('Frame4_') || name.startsWith('Frame5_')) attach(this.rocker);
      else if (name.startsWith('Cranks_') || name.startsWith('Sprocket_')) attach(this.crank);
      else if (name.startsWith('Pedals_')) {
        for (const [i, side] of [[0, 1], [1, -1]] as const) attach(this.pedals[i], p => (p.x - CENTER) * side > 0, undefined, ':' + side);
      } else if (name.startsWith('Seatpost_')) {
        attach(this.frame, undefined, p => p.addScaledVector(postAxis, -clamp(p.clone().sub(postBase).dot(postAxis) / postLength) * .08));
      } else if (name.startsWith('Seat_')) attach(this.saddle, undefined, p => p.add(this.seatDrop));
      else if (name.startsWith('Shock_Spring_')) this.makeSpring(object, material!);
      else if (name.startsWith('Damper_')) {
        const axis = v(-.195, -.101).normalize();
        const upper = (p: THREE.Vector3) => v(p.y - .060, p.z - .630).dot(axis) < .116;
        attach(this.shockUpper, upper, undefined, ':can');
        attach(this.shockLower, p => !upper(p), undefined, ':shaft');
      } else if (name.startsWith('Chain_')) attach(this.frame, undefined, undefined, '', 'rear');
      else if (name.startsWith('Cables_')) {
        attach(this.steering, p => p.y > .09, undefined, ':front', 'front');
        attach(this.frame, p => p.y <= .09, undefined, ':rear', 'rear');
      } else attach(this.frame);
    });
    this.update({frontCompression:SAG, rearCompression:SAG, steering:0, tailwhip:0, crankAngle:0, wheelAngle:0} as TrickPose);
  }

  private makeSpring(object: THREE.Mesh, material: THREE.Material) {
    const geometry = selectGeometry(object.geometry)!;
    const pos = geometry.getAttribute('position'), direction = this.shockBottom.clone().sub(this.shockTop).normalize();
    const normal = v(direction.y, -direction.x);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const q = fit(v(pos.getX(i), pos.getY(i), pos.getZ(i))).sub(this.shockTop);
      const along = q.dot(direction); min = Math.min(min, along); max = Math.max(max, along);
      pos.setXYZ(i, q.dot(normal), along, q.z);
    }
    this.springMin = min; this.springSpan = max - min;
    for (let i = 0; i < pos.count; i++) pos.setY(i, (pos.getY(i) - min) / this.springSpan);
    geometry.computeVertexNormals(); this.spring = mesh(this.frame, geometry, material);
    this.spring.name = 'torque:shock-coil'; this.debug.attachedParts.push(this.spring.name);
  }

  update(pose: TrickPose) {
    const rearCompression = clamp(pose.rearCompression, 0, .14), frontCompression = clamp(pose.frontCompression, 0, .15);
    const rear = this.rearRest.clone(); rear.y += rearCompression - SAG;
    const arm = this.rearRest.distanceTo(this.lowerPivot);
    rear.x = this.lowerPivot.x - Math.sqrt(Math.max(.0001, arm * arm - (rear.y - this.lowerPivot.y) ** 2));
    const lowerAngle = Math.atan2(rear.y - this.lowerPivot.y, rear.x - this.lowerPivot.x) - Math.atan2(this.rearRest.y - this.lowerPivot.y, this.rearRest.x - this.lowerPivot.x);
    this.lowerStay.rotation.z = lowerAngle;
    const delta = rear.clone().sub(this.rockerPivot), d = delta.length();
    const radius = this.stayJoint.distanceTo(this.rockerPivot), stayLength = this.stayJoint.distanceTo(this.rearRest);
    const along = (radius * radius - stayLength * stayLength + d * d) / (2 * d);
    const height = Math.sqrt(Math.max(0, radius * radius - along * along)), u = delta.multiplyScalar(1 / d);
    const joint = this.rockerPivot.clone().addScaledVector(u, along).addScaledVector(v(u.y, -u.x), height);
    const rockerAngle = Math.atan2(joint.y - this.rockerPivot.y, joint.x - this.rockerPivot.x) - Math.atan2(this.stayJoint.y - this.rockerPivot.y, this.stayJoint.x - this.rockerPivot.x);
    this.rocker.rotation.z = rockerAngle;
    this.upperStay.position.copy(rear).sub(this.pivot);
    this.upperStay.rotation.z = Math.atan2(joint.y - rear.y, joint.x - rear.x) - Math.atan2(this.stayJoint.y - this.rearRest.y, this.stayJoint.x - this.rearRest.x);
    this.rearWheel.position.copy(rear).sub(this.pivot);
    const shockEnd = this.shockBottom.clone().sub(this.rockerPivot).applyAxisAngle(Z, rockerAngle).add(this.rockerPivot);
    const shock = shockEnd.clone().sub(this.shockTop), oldShock = this.shockBottom.clone().sub(this.shockTop);
    const shockAngle = Math.atan2(shock.y, shock.x) - Math.atan2(oldShock.y, oldShock.x);
    this.shockUpper.rotation.z = shockAngle; this.shockLower.rotation.z = shockAngle;
    this.shockLower.position.copy(shockEnd).sub(this.pivot);
    if (this.spring) {
      const ratio = shock.length() / oldShock.length(), direction = shock.clone().normalize();
      this.spring.position.copy(this.shockTop).sub(this.pivot).addScaledVector(direction, this.springMin * ratio);
      this.spring.quaternion.setFromUnitVectors(Y, direction);
      this.spring.scale.y = this.springSpan * ratio;
    }
    const frontDelta = this.forkAxis.clone().multiplyScalar(frontCompression - SAG);
    this.forkLower.position.copy(this.frontRest).add(frontDelta).sub(this.pivot);
    const crank = Number.isFinite(pose.crankAngle) ? pose.crankAngle : 0;
    this.crank.rotation.z = -crank; this.pedals.forEach(p => p.rotation.z = crank);
    const wheel = Number.isFinite(pose.wheelAngle) ? pose.wheelAngle : 0;
    this.frontSpin.rotation.z = -(Number.isFinite(pose.frontWheelAngle) ? pose.frontWheelAngle! : wheel);
    this.rearSpin.rotation.z = -(Number.isFinite(pose.rearWheelAngle) ? pose.rearWheelAngle! : wheel);
    this.steering.quaternion.setFromAxisAngle(this.forkAxis, Number.isFinite(pose.steering) ? pose.steering : 0);
    this.frame.quaternion.setFromAxisAngle(this.forkAxis, Number.isFinite(pose.tailwhip) ? pose.tailwhip : 0);
    const rearDelta = rear.sub(this.rearRest);
    for (const item of this.deformed) {
      const pos = item.part.geometry.getAttribute('position'), motion = item.kind === 'rear' ? rearDelta : frontDelta;
      for (let i = 0; i < pos.count; i++) {
        const w = item.weights[i]!;
        pos.setXYZ(i, item.rest[i * 3]! + motion.x * w, item.rest[i * 3 + 1]! + motion.y * w, item.rest[i * 3 + 2]! + motion.z * w);
      }
      pos.needsUpdate = true;
    }
    this.rig.root.updateMatrixWorld(true);
  }

  private point(object: THREE.Object3D) { return this.rig.root.worldToLocal(object.getWorldPosition(new THREE.Vector3())); }
  getAnchors(): BikeAnchors {
    this.rig.root.updateWorldMatrix(true, true);
    return {hands:[this.point(this.grips[0]), this.point(this.grips[1])], feet:[this.point(this.pedals[0]), this.point(this.pedals[1])], seat:this.point(this.saddle)};
  }
  getContacts() {
    this.rig.root.updateWorldMatrix(true, true);
    return {front:this.point(this.frontWheel), rear:this.point(this.rearWheel)};
  }
}
