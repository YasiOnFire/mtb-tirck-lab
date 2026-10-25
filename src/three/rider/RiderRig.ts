import * as THREE from 'three';
import type { TrickPose } from '../../types';
import type { BikeAnchors } from '../bike/kinematics';
import { box, clamp, consolidateStaticMeshes, disposeObject, material, mesh, rod, sphere, tube, v } from '../bike/geometry';
import { solveTwoBone } from './ik';
import { helmetShell, shoeGeometry, SoftLimb, SoftTorso } from './softGeometry';
import { RiderSkin } from './RiderSkin';
import { ImportedHelmet } from './ImportedHelmet';

interface Limb { cloth: SoftLimb; pad: THREE.Group; end: THREE.Group }
const Y = v(0, 1, 0), X = v(1, 0, 0);
const smooth = (t: number) => { const p = clamp(t); return p * p * (3 - 2 * p); };

export class RiderRig {
  readonly root = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly torso: SoftTorso;
  private readonly neck: THREE.Mesh;
  private readonly arms: [Limb, Limb];
  private readonly legs: [Limb, Limb];
  private readonly m = {
    jersey: material(0x23232c, .02, .88), panels: material(0xb6b3b3, .01, .96),
    sleeves: material(0x292932, .02, .91), trousers: material(0x161820, .02, .94),
    pads: material(0x090b10, .06, .69), edge: material(0x42444c, .13, .67),
    shoe: material(0x24232b, .02, .96), sole: material(0x101115, .01, .98),
    glove: material(0x12131a, .02, .85), skin: material(0xb38a71, 0, .95),
    helmet: material(0x171820, .08, .48), visor: material(0x332b43, .38, .21),
    accent: material(0x5918df, .22, .48), lettering: material(0xe0dce7, .05, .80),
  };
  readonly debugData = {
    hands: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    feet: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    elbows: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    knees: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    hips: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    shoulders: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    wrists: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    ankles: [v(0, 0), v(0, 0)] as [THREE.Vector3, THREE.Vector3],
    pelvis: v(0, 0), chest: v(0, 0), handContacts: [true, true], footContacts: [true, true],
  };

  static async create(downloaded = false) {
    const [skin, helmet] = await Promise.all([RiderSkin.load(downloaded ? 'imported' : 'quaternius'), downloaded ? ImportedHelmet.load() : undefined]);
    return new RiderRig(skin, helmet);
  }

  constructor(readonly skin?: RiderSkin, readonly importedHelmet?: ImportedHelmet) {
    this.root.name = 'freeride-rider-ik';
    this.pelvis.name = 'pelvis'; this.chest.name = 'chest'; this.head.name = 'full-face-helmet';
    this.root.add(this.pelvis, this.chest, this.head);
    if (!skin) sphere(this.pelvis, v(-.005, -.022, 0), v(.106, .109, .141), this.m.trousers, 24);
    this.torso = new SoftTorso(this.root, [this.m.jersey, this.m.panels, this.m.accent]);
    this.neck = sphere(this.root, v(0, 0), v(.043, .068, .044), this.m.skin, 20);
    const collar = mesh(this.chest, new THREE.TorusGeometry(.049, .010, 8, 32), this.m.pads);
    collar.rotation.x = Math.PI / 2; collar.position.set(0, .060, 0);
    if (!skin) this.createJerseyMark();
    if (importedHelmet) this.head.add(importedHelmet.root);
    else this.createHead();
    this.arms = [this.createArm(1), this.createArm(-1)];
    this.legs = [this.createLeg(1), this.createLeg(-1)];
    if (skin) {
      this.root.add(skin.root);
      this.torso.surface.visible = false;
      this.neck.visible = false;
      this.chest.visible = false;
      for (const limb of [...this.arms, ...this.legs]) limb.cloth.surface.visible = false;
      for (const arm of this.arms) arm.pad.visible = false;
    }
    consolidateStaticMeshes(this.root, new Set<THREE.Object3D>([this.torso.surface, this.neck, ...(skin?.meshes ?? []), ...[...this.arms, ...this.legs].map((limb) => limb.cloth.surface)]));
  }

  private createJerseyMark() {
    const logo = new THREE.Group(); logo.position.set(.112, -.093, .035); this.chest.add(logo);
    for (const [y, z, h, w] of [[0, 0, .028, .004], [-.012, -.010, .004, .024], [0, -.035, .028, .004], [0, -.052, .028, .004], [.012, -.044, .004, .018], [0, -.044, .004, .018], [0, -.073, .028, .004], [.012, -.083, .004, .022], [0, -.083, .004, .022], [-.012, -.083, .004, .022], [.006, -.093, .014, .004], [-.006, -.093, .014, .004]]) box(logo, v(0, y, z), v(.002, h, w), this.m.accent);
  }

  private createHead() {
    if (!this.skin) sphere(this.head, v(.002, .004, 0), v(.073, .093, .069), this.m.skin, 24);
    helmetShell(this.head, this.m.helmet);
    const peak = new THREE.Shape();
    peak.moveTo(-.045, -.097); peak.lineTo(.112, -.082); peak.quadraticCurveTo(.152, 0, .112, .082); peak.lineTo(-.045, .097); peak.closePath();
    const visorGeometry = new THREE.ExtrudeGeometry(peak, { depth: .004, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 2, curveSegments: 10 });
    visorGeometry.rotateX(-Math.PI / 2); visorGeometry.translate(.025, .111, 0);
    mesh(this.head, visorGeometry, this.m.helmet).rotation.z = -.08;
    const lensShape = (width: number, height: number, depth: number) => {
      const shape = new THREE.Shape(), w = width / 2, h = height / 2, r = .009;
      shape.moveTo(-w + r, -h); shape.lineTo(-.024, -h);
      shape.quadraticCurveTo(-.015, -h + .015, 0, -h + .016);
      shape.quadraticCurveTo(.015, -h + .015, .024, -h);
      shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
      shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
      shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .001, bevelThickness: .001, bevelSegments: 2, curveSegments: 5 });
      geometry.rotateY(Math.PI / 2); geometry.translate(.088, .043, 0);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) - .033 * (position.getZ(i) / .085) ** 2);
      geometry.computeVertexNormals(); return geometry;
    };
    mesh(this.head, lensShape(.170, .064, .005), this.m.pads);
    const lens = lensShape(.147, .046, .002); lens.translate(.006, 0, 0); mesh(this.head, lens, this.m.visor);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Shape();
      cheek.moveTo(-.058, .012); cheek.lineTo(-.032, -.064); cheek.lineTo(.075, -.092); cheek.lineTo(.139, -.052); cheek.lineTo(.127, -.029); cheek.lineTo(.06, -.054); cheek.lineTo(.015, -.005); cheek.closePath();
      const cheekGeometry = new THREE.ExtrudeGeometry(cheek, { depth: .011, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 3 });
      cheekGeometry.translate(0, 0, side > 0 ? .071 : -.082); mesh(this.head, cheekGeometry, this.m.helmet);
      tube(this.head, [v(.066, .044, side * .086), v(-.008, .044, side * .099), v(-.086, .039, side * .072)], .009, this.m.accent, 16);
      tube(this.head, [v(-.058, .127, side * .041), v(-.012, .159, side * .045), v(.047, .128, side * .041)], .0025, this.m.pads, 12);
      tube(this.head, [v(-.054, .119, side * .066), v(-.005, .137, side * .076), v(.036, .117, side * .072)], .005, this.m.pads, 12);
      box(this.head, v(.013, -.045, side * .085), v(.046, .012, .002), this.m.accent).rotation.z = -.30;
      for (let i = 0; i < 3; i++) box(this.head, v(.055 + i * .014, -.066 + i * .004, side * .086), v(.006, .016, .002), this.m.pads).rotation.z = -.32;
      sphere(this.head, v(-.045, .055, side * .096), v(.013, .013, .004), this.m.lettering, 12);
    }
    const chin = new THREE.Shape();
    chin.moveTo(-.074, -.012); chin.quadraticCurveTo(0, -.028, .074, -.012);
    chin.lineTo(.078, .018); chin.quadraticCurveTo(0, .025, -.078, .018); chin.closePath();
    for (const z of [-.047, -.023, 0, .023, .047]) {
      const vent = new THREE.Path();
      vent.moveTo(z - .006, -.006); vent.lineTo(z - .006, .011);
      vent.lineTo(z + .006, .011); vent.lineTo(z + .006, -.006); vent.closePath();
      chin.holes.push(vent);
    }
    const chinGeometry = new THREE.ExtrudeGeometry(chin, { depth: .009, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 2, curveSegments: 12 });
    chinGeometry.rotateY(Math.PI / 2); chinGeometry.translate(.138, -.064, 0);
    const chinPositions = chinGeometry.attributes.position;
    for (let i = 0; i < chinPositions.count; i++) chinPositions.setX(i, chinPositions.getX(i) - .024 * (chinPositions.getZ(i) / .078) ** 2);
    chinGeometry.computeVertexNormals(); mesh(this.head, chinGeometry, this.m.helmet);
  }

  private createArm(side: number): Limb {
    const group = new THREE.Group(); group.name = side > 0 ? 'left-arm' : 'right-arm'; this.root.add(group);
    const cloth = new SoftLimb(group, [this.m.sleeves, this.m.jersey, this.m.accent], [.048, .054, .048, .041, .036, .025]);
    const pad = new THREE.Group(); group.add(pad);
    sphere(pad, v(-.014, 0, side * .010), v(.044, .052, .042), this.m.pads, 20);
    box(pad, v(-.053, .008, side * .006), v(.003, .019, .020), this.m.edge);
    const end = new THREE.Group(); end.name = 'gripping-glove'; group.add(end);
    sphere(end, v(-.010, .015, 0), v(.033, .020, .035), this.m.glove, 20);
    for (const z of [-.024, -.008, .008, .024]) tube(end, [v(-.018, .018, z), v(.013, .019, z), v(.025, -.005, z), v(.011, -.021, z)], .0057, this.m.glove, 8);
    tube(end, [v(-.016, .012, -side * .029), v(-.011, -.018, -side * .040), v(.011, -.019, -side * .028)], .008, this.m.glove, 8);
    sphere(end, v(-.013, .033, .002), v(.020, .003, .024), this.m.accent, 12);
    return { cloth, pad, end };
  }

  private createLeg(side: number): Limb {
    const group = new THREE.Group(); group.name = side > 0 ? 'left-leg' : 'right-leg'; this.root.add(group);
    const cloth = new SoftLimb(group, [this.m.trousers, this.m.trousers, this.m.accent], [.067, .071, .061, .049, .043, .031], true);
    const pad = new THREE.Group(); group.add(pad);
    sphere(pad, v(.021, 0, 0), v(.042, .077, .052), this.m.pads, 20);
    sphere(pad, v(.058, .002, 0), v(.004, .053, .036), this.m.edge, 16);
    box(pad, v(.063, .013, 0), v(.002, .007, .027), this.m.accent);
    const end = new THREE.Group(); end.name = 'flat-pedal-shoe'; group.add(end);
    mesh(end, shoeGeometry(false), this.m.sole); mesh(end, shoeGeometry(true), this.m.shoe);
    sphere(end, v(-.035, .044, 0), v(.043, .030, .035), this.m.shoe, 20);
    for (let i = 0; i < 4; i++) tube(end, [v(-.013 + i * .019, .066 - i * .006, -.022), v(-.008 + i * .019, .069 - i * .006, 0), v(-.002 + i * .019, .066 - i * .006, .022)], .0018, this.m.edge, 5);
    for (const z of [-.044, .044]) rod(end, v(.025, .032, z), v(.075, .024, z), .003, this.m.accent);
    return { cloth, pad, end };
  }

  private footTarget(pose: TrickPose, index: number, hip: THREE.Vector3, anchor: THREE.Vector3) {
    const side = index === 0 ? 1 : -1;
    let free = hip.clone().add(v(.05, -.64, side * .46));
    const q = clamp(pose.footMotionPhase ?? .5);
    if (pose.footStyle === 'superman') free = hip.clone().add(v(-.918, -.01, side * .025));
    if (pose.footStyle === 'can') free = hip.clone().add(v(.12, -.25, -.64));
    const held = smooth((q - .21) / .22) * (1 - smooth((q - .64) / .22));
    if (pose.footMotion === 'can-can') {
      free = v(-.03, 1.055, side * .11).lerp(hip.clone().add(v(.17, -.38, -.71)), held);
    } else if (pose.footMotion === 'nac-nac') {
      free = v(-.76, 1.09, side * .16).lerp(hip.clone().add(v(-.47, -.37, -.56)), held);
    } else if (pose.footMotion === 'indian') {
      free = hip.clone().add(v(-.81, .045 + index * .045, -side * .19));
    } else if (pose.footMotion === 'pendulum') {
      const swing = Math.sin((q - .16) / .68 * Math.PI * 2);
      free = hip.clone().add(v(-.18, .06 - .42 * Math.abs(swing), swing * .64 + side * .04));
    } else if (pose.footMotion === 'plant') free = v(anchor.x, 0, side * .49);
    return anchor.clone().lerp(free, clamp(pose.footRelease[index]));
  }

  apply(pose: TrickPose, anchors: BikeAnchors) {
    const dimensions = this.skin?.dimensions ?? { upperArm: .255, forearm: .245, thigh: .429, shin: .459 };
    const armReach = dimensions.upperArm + dimensions.forearm - .01;
    const legReach = dimensions.thigh + dimensions.shin - .013;
    const crouch = clamp(pose.crouch), shift = new THREE.Vector3(...pose.bodyShift);
    const extension = pose.footStyle === 'superman' || pose.footMotion === 'indian' ? Math.max(...pose.footRelease) : 0;
    const pelvis = v(-.29 - .20 * extension, 1.055 - .18 * crouch, 0).add(shift);
    const spineAngle = .77 + (pose.chestLean ?? 0) + .10 * extension;
    const chest = pelvis.clone().add(v(Math.sin(spineAngle) * .49, Math.cos(spineAngle) * .49, 0));
    const counterRoll = -pose.roll * .44, scriptedBodyYaw = pose.bodyYaw ?? 0;
    const shoulderHalfWidth = .174;
    let bodyYaw = scriptedBodyYaw;
    if (this.skin?.asset === 'imported' && pose.handRelease.every(release => release < .001)) {
      // A crossed handlebar can put both grips outside a shorter donor's reach.
      // Turn the shoulders only as far as the two arm-reach spheres require;
      // translating the chest alone cannot solve disjoint reach spheres.
      const spread = anchors.hands[0].clone().sub(anchors.hands[1]).applyAxisAngle(X, -counterRoll);
      const horizontal = Math.hypot(spread.x, spread.z), shoulderSpan = shoulderHalfWidth * 2;
      if (horizontal > .001) {
        const targetYaw = Math.atan2(spread.x, spread.z);
        const angle = Math.atan2(Math.sin(bodyYaw - targetYaw), Math.cos(bodyYaw - targetYaw));
        const maxGap = 2 * (armReach - .035);
        const limit = Math.acos(THREE.MathUtils.clamp((spread.lengthSq() + shoulderSpan ** 2 - maxGap ** 2) / (2 * horizontal * shoulderSpan), -1, 1));
        if (Math.abs(angle) > limit) bodyYaw = targetYaw + Math.sign(angle) * limit;
      }
    }
    const lateral = v(0, 0, 1).applyAxisAngle(Y, bodyYaw).applyAxisAngle(X, counterRoll);
    const center = v(0, .92);
    pelvis.sub(center).applyAxisAngle(X, counterRoll).add(center); chest.sub(center).applyAxisAngle(X, counterRoll).add(center);
    const shoulderOffset = (side: number) => lateral.clone().multiplyScalar(side * shoulderHalfWidth).add(v(0, -.015, 0));
    const hipOffset = (side: number) => lateral.clone().multiplyScalar(side * .104).add(v(0, -.025, 0));
    const wristOffsets = [0, 1].map((i) => v(-.028, .019, 0).applyAxisAngle(Y, -pose.steering * (1 - clamp(pose.handRelease[i]))));
    const ankleOffset = v(-.035, .070, 0);
    // A fixed trunk and anatomical limb lengths: contact correction adjusts the
    // whole posture instead of stretching the chest away from the hips.
    for (let pass = 0; pass < 48; pass++) {
      const spine = chest.clone().sub(pelvis), length = spine.length();
      const correction = spine.multiplyScalar((length - .49) / Math.max(length, .001));
      pelvis.addScaledVector(correction, .35); chest.addScaledVector(correction, -.65);
      for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      if (pose.handRelease[i] < .001) {
        const shoulder = chest.clone().add(shoulderOffset(side)), target = anchors.hands[i].clone().add(wristOffsets[i]!);
        const delta = target.sub(shoulder), distance = delta.length();
        if (distance > armReach) chest.addScaledVector(delta.normalize(), distance - armReach);
      }
      if (pose.footRelease[i] < .001) {
        const hip = pelvis.clone().add(hipOffset(side)), delta = anchors.feet[i].clone().add(ankleOffset).sub(hip), distance = delta.length();
        if (distance > legReach) pelvis.addScaledVector(delta.normalize(), distance - legReach);
      }
      }
    }
    this.pelvis.position.copy(pelvis); this.pelvis.rotation.set(counterRoll, bodyYaw, .03);
    const basis = this.torso.update(pelvis, chest, lateral);
    this.chest.position.copy(chest); this.chest.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(basis.forward, basis.up, basis.side));
    const headBase = chest.clone().add(v(.052, this.skin?.asset === 'imported' ? .125 : .157, 0).applyAxisAngle(X, counterRoll));
    this.neck.position.copy(chest).lerp(headBase, .60); this.neck.quaternion.setFromUnitVectors(Y, headBase.clone().sub(chest).normalize());
    this.head.position.copy(headBase);
    const groundedPitch = pose.grounded && pose.pivot !== 'center' ? clamp(pose.pitch, -.65, .75) * .65 : 0;
    this.head.rotation.set(counterRoll, scriptedBodyYaw * 1.9 - .035 * pose.steering, -.07 - .05 * crouch - groundedPitch);
    if (pose.headLook) {
      const look = new THREE.Vector3(...pose.headLook).normalize();
      this.head.rotation.y = -Math.atan2(look.z, look.x);
      this.head.rotation.z = Math.atan2(look.y, Math.hypot(look.x, look.z));
    }
    this.debugData.pelvis.copy(pelvis); this.debugData.chest.copy(chest);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1, shoulder = chest.clone().add(shoulderOffset(side)), hip = pelvis.clone().add(hipOffset(side));
      const handRelease = clamp(pose.handRelease[i]), footRelease = clamp(pose.footRelease[i]);
      const handTarget = anchors.hands[i].clone();
      let handFree = shoulder.clone().add(v(-.05, .14, side * .56));
      if (pose.handRelease[0] > .001 && pose.handRelease[1] > .001 && pose.handStyle === 'spread') handFree.lerp(v(.28, 1.22, side * .39), clamp(Math.abs(pose.steering) / .3));
      if (pose.handStyle === 'seat') handFree = anchors.seat.clone().add(v(0, .025, side * .035));
      if (pose.handStyle === 'tuck') handFree = shoulder.clone().add(v(.02, .10, side * .54));
      handTarget.lerp(handFree, handRelease);
      const footTarget = this.footTarget(pose, i, hip, anchors.feet[i]);
      const arm = this.arms[i];
      const wristOffset = wristOffsets[i]!;
      const armPole = shoulder.clone().add(v(-.10, -.025, side * .28).applyAxisAngle(Y, bodyYaw * .5));
      const armSolution = solveTwoBone(shoulder, handTarget.clone().add(wristOffset), armPole, dimensions.upperArm, dimensions.forearm);
      arm.cloth.update(shoulder, armSolution.joint, armSolution.end, side);
      arm.pad.position.copy(armSolution.joint); arm.pad.quaternion.setFromUnitVectors(Y, shoulder.clone().sub(armSolution.joint).normalize());
      arm.end.position.copy(armSolution.end).sub(wristOffset); arm.end.rotation.set(0, -pose.steering * (1 - handRelease), -.04);
      this.debugData.hands[i].copy(arm.end.position); this.debugData.elbows[i].copy(armSolution.joint); this.debugData.handContacts[i] = handRelease < .001;
      this.debugData.shoulders[i].copy(shoulder); this.debugData.wrists[i].copy(armSolution.end);
      const leg = this.legs[i];
      const legPole = hip.clone().add(v(.54, -.26, side * .10).applyAxisAngle(Y, bodyYaw * .38));
      const footYaw = (pose.footStyle === 'superman' || pose.footMotion === 'indian') ? Math.PI * footRelease : 0;
      const footOffset = ankleOffset.clone().applyAxisAngle(Y, footYaw);
      const legSolution = solveTwoBone(hip, footTarget.clone().add(footOffset), legPole, dimensions.thigh, dimensions.shin);
      leg.cloth.update(hip, legSolution.joint, legSolution.end, side);
      leg.pad.position.copy(legSolution.joint); leg.pad.quaternion.setFromUnitVectors(Y, hip.clone().sub(legSolution.joint).normalize());
      leg.end.position.copy(legSolution.end).sub(footOffset);
      leg.end.rotation.set(0, footYaw, .065 * (1 - footRelease) - .14 * footRelease);
      this.debugData.feet[i].copy(leg.end.position); this.debugData.knees[i].copy(legSolution.joint); this.debugData.hips[i].copy(hip); this.debugData.footContacts[i] = footRelease < .001;
      this.debugData.ankles[i].copy(legSolution.end);
    }
    this.skin?.apply({ ...this.debugData, lateral, headPosition: this.head.position, headQuaternion: this.head.quaternion });
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    for (const skeleton of new Set(this.skin?.meshes.map((mesh) => mesh.skeleton) ?? [])) skeleton.dispose();
    disposeObject(this.root);
  }
}
