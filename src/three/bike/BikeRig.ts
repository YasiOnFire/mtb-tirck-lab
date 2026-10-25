import * as THREE from 'three';
import type { TrickPose } from '../../types';
import { axle, box, clamp, consolidateStaticMeshes, disposeObject, material, mesh, placeRod, profileTube, rod, saddleGeometry, sculptedTube, sphere, tube, v } from './geometry';
import { BIKE, frontAxleAt, REAR_REST, rearArmAngle, rockerAngleAt, STEERING_AXIS } from './kinematics';
import type { BikeAnchors } from './kinematics';
import { carbonFrameGeometry, cogGeometry, FORK_ARCH_POINTS, FORK_ARCH_RADIUS, labelMaterial, pedalGeometry, rimGeometry, rockerPlateGeometry, rotorGeometry, rubberGrainTexture, SHOCK_TOP, sidewallLabelGeometry } from './parts';
import { TorqueVisual } from './imported/TorqueVisual';

const TAU = Math.PI * 2;

export class BikeRig {
  private importedVisual?: TorqueVisual;
  static async createDownloaded(url = `${import.meta.env.BASE_URL}models/downloaded/torque.glb`) {
    const source = await TorqueVisual.load(url);
    return BikeRig.fromDownloaded(source);
  }

  /** Consumes an already loaded source; useful for cached assets and offline checks. */
  static fromDownloaded(source: THREE.Group) {
    const rig = new BikeRig();
    try {
      rig.importedVisual = new TorqueVisual(source, {root: rig.root});
      rig.debugData.model = 'downloaded-torque';
      rig.root.updateMatrixWorld(true);
      return rig;
    } catch (error) {rig.dispose();throw error;}
    finally {disposeObject(source);}
  }

  get importedDetails() {return this.importedVisual?.debug;}
  readonly root = new THREE.Group();
  readonly wheelRadius = BIKE.wheelRadius;
  readonly frame = new THREE.Group();
  readonly steering = new THREE.Group();
  readonly swingarm = new THREE.Group();
  readonly framePivot = new THREE.Group();
  readonly forkSlide = new THREE.Group();
  readonly crank = new THREE.Group();
  private readonly crankCenter = new THREE.Group();
  private readonly rearWheel: { mount: THREE.Group; spin: THREE.Group };
  private readonly frontWheel: { mount: THREE.Group; spin: THREE.Group };
  private readonly grips: [THREE.Object3D, THREE.Object3D];
  private readonly pedals: [THREE.Group, THREE.Group];
  private readonly saddle = new THREE.Group();
  private readonly rocker = new THREE.Group();
  private readonly shockBody: THREE.Mesh;
  private readonly shockShaft: THREE.Mesh;
  private readonly shockEye = new THREE.Group();
  private readonly chain: THREE.LineLoop;
  private readonly chainLinks: THREE.InstancedMesh;
  private readonly rearLink: THREE.Mesh;
  private readonly chainPositions = new Float32Array(40 * 3);
  private readonly chainPoints: THREE.Vector3[] = Array.from({ length: 40 }, () => new THREE.Vector3());
  private readonly chainCurve = new THREE.CatmullRomCurve3(this.chainPoints, true, 'centripetal', .1);
  private readonly chainDummy = new THREE.Object3D();
  private lastChainAngle = Number.NaN;
  private lastChainRear = Number.NaN;
  private readonly m = {
    frame: material(0x333638, .28, .32),
    edge: material(0x353a3e, .55, .34),
    dark: material(0x15171c, .35, .48),
    black: material(0x070a0c, .05, .9),
    rubber: material(0x161718, .02, .86),
    metal: material(0x919da3, .92, .26),
    steel: material(0x4f585e, .85, .34),
    purple: material(0x5918df, .50, .30),
    accent: material(0x8c65dc, .40, .39),
    fork: material(0x333b42, .90, .20),
  };
  readonly debugData = { model: 'procedural', frontCompression: .04, rearCompression: .04, rearArmLength: BIKE.rearArmLength, shockLength: 0, steeringAxis: STEERING_AXIS.toArray(), swingarmAngle: 0 };

  constructor() {
    this.m.rubber.bumpMap = rubberGrainTexture();
    this.m.rubber.bumpScale = .00065;
    this.root.name = 'enduro-full-suspension';
    this.framePivot.position.copy(BIKE.steeringPivot);
    this.root.add(this.framePivot);
    this.frame.position.copy(BIKE.steeringPivot).negate();
    this.framePivot.add(this.frame);
    this.steering.position.copy(BIKE.steeringPivot);
    this.root.add(this.steering);
    this.swingarm.position.copy(BIKE.rearPivot);
    this.frame.add(this.swingarm);
    this.createFrame();
    this.rearWheel = this.createWheel(this.swingarm, REAR_REST, true);
    this.createSwingarm();
    this.forkSlide.position.copy(frontAxleAt(0).sub(BIKE.steeringPivot));
    this.steering.add(this.forkSlide);
    this.frontWheel = this.createWheel(this.forkSlide, v(0, 0), false);
    this.grips = this.createFork();
    this.pedals = this.createDrive();
    this.createSaddle();

    const shockTop = SHOCK_TOP.clone();
    const shockBottom = v(-.26, .48);
    this.shockBody = rod(this.frame, shockTop, shockBottom, .029, this.m.dark, .033);
    rod(this.shockBody, v(0, .38), v(0, .49), .033, this.m.black);
    rod(this.shockBody, v(0, -.37), v(0, -.34), .0335, this.m.steel);
    rod(this.shockBody, v(.043, -.20), v(.043, .20), .014, this.m.dark);
    rod(this.shockBody, v(.043, .20), v(.043, .23), .010, this.m.purple);
    rod(this.shockBody, v(0, -.16), v(.043, -.16), .010, this.m.dark);
    this.shockShaft = rod(this.frame, shockTop, shockBottom, .012, this.m.metal);
    this.frame.add(this.shockEye);
    axle(this.shockEye, v(0, 0), .015, .084, this.m.dark);
    axle(this.frame, shockTop, .016, .090, this.m.dark);
    for (const side of [-1, 1]) {
      axle(this.shockEye, v(0, 0, side * .044), .006, .003, this.m.steel, 6);
      axle(this.frame, shockTop.clone().add(v(0, 0, side * .047)), .006, .003, this.m.steel, 6);
    }
    this.rocker.position.set(-.29, .71, 0);
    this.frame.add(this.rocker);
    for (const z of [-.055, .055]) {
      mesh(this.rocker, rockerPlateGeometry(), this.m.dark, v(0, 0, z));
      axle(this.rocker, v(0, 0, z + Math.sign(z) * .009), .009, .004, this.m.steel);
      axle(this.rocker, v(-.065, -.095, z + Math.sign(z) * .009), .006, .004, this.m.steel, 6);
    }
    axle(this.rocker, v(0, 0), .017, .124, this.m.dark);
    this.rearLink = rod(this.frame, v(-.33, .62), v(-.39, .53), .012, this.m.steel);

    this.chain = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.chainPositions, 3)), new THREE.LineBasicMaterial({ color: 0x8e959c }));
    this.frame.add(this.chain);
    this.chainLinks = new THREE.InstancedMesh(new THREE.BoxGeometry(.0105, .0045, .008), this.m.steel, 100);
    this.chainLinks.castShadow = true;
    this.frame.add(this.chainLinks);
    this.apply({ frontCompression: .04, rearCompression: .04, steering: 0, tailwhip: 0, crankAngle: 0, wheelAngle: 0 } as TrickPose);
    consolidateStaticMeshes(this.root, new Set([this.shockBody, this.shockShaft, this.rearLink]));
  }

  private createFrame() {
    const bb = BIKE.bottomBracket;
    mesh(this.frame, carbonFrameGeometry(), this.m.frame).name = 'continuous-carbon-chassis';
    rod(this.frame, v(-.332, .799), v(-.349, .886), .020, this.m.frame, .020, 32);
    axle(this.frame, bb, .039, .112, this.m.dark);
    axle(this.frame, BIKE.rearPivot, .019, .132, this.m.dark);
    // Moulded shock clevis joins the down tube; the eye is not suspended in space.
    for (const side of [-1, 1]) sculptedTube(this.frame, [v(.105, .580, side * .027), v(.083, .626, side * .030), SHOCK_TOP.clone().add(v(0, 0, side * .032))], [.019, .017, .014], [.010, .010, .009], this.m.frame);
    sculptedTube(this.frame, [v(-.205, .294), v(-.10, .309), v(-.04, .370), v(.035, .457)], [.005, .005, .005, .003], [.029, .030, .029, .027], this.m.black);
    // Bearing races are coaxial with the inclined head tube.
    for (const along of [-.116, .092]) {
      const center = BIKE.steeringPivot.clone().addScaledVector(STEERING_AXIS, along);
      rod(this.frame, center.clone().addScaledVector(STEERING_AXIS, -.004), center.clone().addScaledVector(STEERING_AXIS, .004), .034, this.m.dark, .035, 32);
    }
    const wordmark = labelMaterial('TRICK LAB', '#a9abad');
    for (const sign of [-1, 1]) {
      if (wordmark) {
        const label = mesh(this.frame, new THREE.PlaneGeometry(.255, .031), wordmark, v(.119, .591, sign * .0345));
        label.rotation.set(0, sign === -1 ? Math.PI : 0, sign * .894);
        label.castShadow = false;
      }
      axle(this.frame, v(-.214, .47, sign * .068), .007, .003, this.m.steel, 6);
      const accent = box(this.frame, v(.252, .765, sign * .0362), v(.025, .003, .0005), this.m.purple);accent.rotation.z = .894;
      const port = sphere(this.frame, v(.220, .978, sign * .027), v(.015, .005, .002), this.m.black);port.rotation.z = .35;
    }
    tube(this.frame, [v(-.24, .44, -.045), v(-.26, .42, -.06), v(-.31, .45, -.06)], .0028, this.m.black);
  }

  private createWheel(parent: THREE.Object3D, center: THREE.Vector3, rear: boolean) {
    const mount = new THREE.Group();
    mount.position.copy(center); parent.add(mount);
    const spin = new THREE.Group();spin.name = rear ? 'rear-wheel-spin' : 'front-wheel-spin';mount.add(spin);
    mesh(spin, new THREE.TorusGeometry(.337, .029, 20, 144), this.m.rubber);
    mesh(spin, rimGeometry(), this.m.dark);
    for (const z of [-.028, .028]) {
      const bead = mesh(spin, new THREE.TorusGeometry(.317, .0018, 6, 128), this.m.black);bead.position.z = z * .69;
      const casing = mesh(spin, new THREE.TorusGeometry(.337, .001, 5, 128), this.m.rubber);casing.position.z = z;
    }
    const branding = labelMaterial('TRICK LAB', '#a4a6a5'), size = labelMaterial('29 × 2.4  /  ENDURO', '#8c8f8f');
    for (const side of [-1, 1]) {
      for (const [mat, a, span] of [[branding, .62, .64], [size, Math.PI + .62, .72]] as const) if (mat) {
        const label = mesh(spin, sidewallLabelGeometry(a, span), mat);label.position.z = side * .0295;label.rotation.y = side === -1 ? Math.PI : 0;label.castShadow = false;
      }
      for (const a of [.1, Math.PI + .1]) {
        const stripe = box(spin, v(Math.cos(a) * .307, Math.sin(a) * .307, side * .0195), v(.022, .003, .0006), this.m.purple);stripe.rotation.z = a + Math.PI / 2;
      }
    }
    const dummy = new THREE.Object3D();
    const treadGeometry = new THREE.BoxGeometry(.015, .006, .012);
    const tread = new THREE.InstancedMesh(treadGeometry, this.m.rubber, 240);
    // Alternating paired centre knobs and outward-canted shoulder blocks.
    for (let i = 0; i < 60; i++) for (let row = 0; row < 4; row++) {
      const shoulder = row === 0 || row === 3, side = row < 2 ? -1 : 1;
      const a = i / 60 * TAU + (row % 2 ? .022 : 0), radius = shoulder ? .355 : .366;
      dummy.position.set(Math.cos(a) * radius, Math.sin(a) * radius, side * (shoulder ? .024 : .008));
      dummy.rotation.set(0, 0, a - Math.PI / 2);dummy.rotateX(shoulder ? side * .49 : side * .10);dummy.rotateY((i % 2 ? 1 : -1) * .15);
      dummy.scale.set(shoulder ? 1.15 : .88, 1, shoulder ? 1.13 : .8);dummy.updateMatrix();tread.setMatrixAt(i * 4 + row, dummy.matrix);
    }
    tread.castShadow = true;spin.add(tread);
    const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.00095, .00095, 1, 5), this.m.steel, 32);
    const nipples = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0018, .0018, 1, 6), this.m.metal, 32);
    for (let i = 0; i < 32; i++) {
      const side = i % 2 ? -1 : 1, a = i / 32 * TAU, b = a + (i % 4 < 2 ? 1 : -1) * .46;
      const start = v(Math.cos(a) * .028, Math.sin(a) * .028, side * .047);
      const end = v(Math.cos(b) * .301, Math.sin(b) * .301, side * .010);
      dummy.scale.set(1, 1, 1);placeRod(dummy, start, end);dummy.updateMatrix();spokes.setMatrixAt(i, dummy.matrix);
      placeRod(dummy, end.clone().lerp(start, .026), end);dummy.updateMatrix();nipples.setMatrixAt(i, dummy.matrix);
    }
    spin.add(spokes, nipples);
    axle(spin, v(0, 0), .020, .107, this.m.dark);
    for (const z of [-.047, .047]) axle(spin, v(0, 0, z), .030, .004, this.m.dark);
    axle(mount, v(0, 0), .0075, .151, this.m.steel);
    for (const z of [-.078, .078]) {axle(mount, v(0, 0, z), .011, .005, this.m.dark);axle(mount, v(0, 0, z * 1.04), .0045, .001, this.m.steel, 6);}
    const rotor = new THREE.Group();rotor.position.z = -.073;spin.add(rotor);
    mesh(rotor, rotorGeometry(), this.m.metal);
    for (let i = 0; i < 6; i++) {const a = i / 6 * TAU;axle(rotor, v(Math.cos(a) * .029, Math.sin(a) * .029, -.002), .003, .003, this.m.dark, 6);}
    const caliper = new THREE.Group();caliper.position.set(-.071, .065, -.073);caliper.rotation.z = -.75;mount.add(caliper);
    for (const side of [-1, 1]) {
      box(caliper, v(0, 0, side * .009), v(.049, .030, .013), this.m.dark);
      for (const x of [-.014, .014]) axle(caliper, v(x, -.002, side * .017), .009, .006, this.m.dark);
    }
    box(caliper, v(0, .019, 0), v(.058, .010, .030), this.m.dark);
    for (const x of [-.021, .021]) axle(caliper, v(x, .019, -.018), .0035, .003, this.m.steel, 6);
    if (rear) {
      const radii = [.103, .092, .082, .073, .066, .059, .052, .046, .041, .036, .031, .026];
      radii.forEach((radius, i) => mesh(spin, cogGeometry(radius, Math.round(radius * 495)), i < 3 ? this.m.dark : this.m.steel, v(0, 0, .062 + i * .00365)));
      const derailleur = new THREE.Group();derailleur.name = 'rear-derailleur';mount.add(derailleur);
      profileTube(derailleur, v(0, 0, .105), v(.042, -.048, .119), .015, .012, this.m.dark);
      box(derailleur, v(.043, -.058, .119), v(.037, .035, .030), this.m.dark).rotation.z = -.35;
      for (const z of [.107, .125]) profileTube(derailleur, v(.057, -.075, z), v(.078, -.147, z), .010, .003, this.m.dark);
      for (const point of [v(.057, -.075, .115), v(.078, -.147, .115)]) {mesh(derailleur, cogGeometry(.023, 12, false), this.m.dark, point);axle(derailleur, point.clone().add(v(0, 0, .014)), .005, .003, this.m.steel, 6);}
    }
    return { mount, spin };
  }

  private createSwingarm() {
    for (const side of [-1, 1]) {
      const z = side * .056;
      sculptedTube(this.swingarm, [v(0, 0, z), v(-.13, -.055, side * .065), REAR_REST.clone().add(v(0, 0, side * .068))], [.022, .020, .014], [.016, .014, .012], this.m.frame);
      sculptedTube(this.swingarm, [REAR_REST.clone().add(v(0, 0, side * .068)), v(-.24, .038, side * .064), v(-.105, .15, side * .047)], [.014, .016, .020], [.012, .013, .014], this.m.frame);
      profileTube(this.swingarm, v(-.105, .15, side * .047), v(0, 0, z), .022, .014, this.m.frame);
      axle(this.swingarm, REAR_REST.clone().add(v(0, 0, side * .077)), .021, .015, this.m.dark);
    }
    rod(this.swingarm, v(-.105, .15, -.047), v(-.105, .15, .047), .018, this.m.dark);
    tube(this.swingarm, [v(0, -.02, -.067), v(-.16, -.06, -.071), REAR_REST.clone().add(v(-.06, .055, -.076))], .003, this.m.black);
    rod(this.swingarm, v(-.08, -.042, .074), v(-.3, -.1, .074), .012, this.m.black);
  }

  private createFork(): [THREE.Object3D, THREE.Object3D] {
    const local = (point: THREE.Vector3) => point.add(v(-.065, 0)).sub(BIKE.steeringPivot);
    const top = STEERING_AXIS.clone().multiplyScalar(-.112);
    const upperEnd = top.clone().addScaledVector(STEERING_AXIS, -.36);
    const extendedAxle = frontAxleAt(0).sub(BIKE.steeringPivot);
    const axleOffset = extendedAxle.clone().sub(top).addScaledVector(STEERING_AXIS, -extendedAxle.clone().sub(top).dot(STEERING_AXIS));
    for (const z of [-.059, .059]) {
      const a = top.clone().add(v(0, 0, z));
      const b = upperEnd.clone().add(v(0, 0, z));
      rod(this.steering, a, b, .018, this.m.fork, .018, 32);
      rod(this.steering, a.clone().addScaledVector(STEERING_AXIS, .016), a.clone().addScaledVector(STEERING_AXIS, .023), .017, this.m.dark, .017, 24);
      rod(this.steering, a.clone().addScaledVector(STEERING_AXIS, .024), a.clone().addScaledVector(STEERING_AXIS, .027), .010, z > 0 ? this.m.purple : this.m.steel, .010, 12);
      const lowerBottom = axleOffset.clone().negate().addScaledVector(STEERING_AXIS, .035).add(v(0, 0, z));
      const lowerTop = lowerBottom.clone().addScaledVector(STEERING_AXIS, .275);
      sculptedTube(this.forkSlide, [v(0, 0, z), lowerBottom, lowerTop], [.021, .023, .025], [.021, .022, .025], this.m.dark);
      rod(this.forkSlide, lowerTop.clone().addScaledVector(STEERING_AXIS, -.014), lowerTop.clone().addScaledVector(STEERING_AXIS, .004), .027, this.m.black, .027, 24);
      axle(this.forkSlide, v(0, 0, z), .021, .034, this.m.dark);
      axle(this.forkSlide, v(0, 0, z + Math.sign(z) * .019), .010, .003, this.m.steel);
      axle(this.forkSlide, v(0, 0, z + Math.sign(z) * .021), .004, .003, this.m.dark, 6);
      const forkLogo = labelMaterial('36', '#a6a9ac');
      if (forkLogo) {const mark = mesh(this.forkSlide, new THREE.PlaneGeometry(.043, .024), forkLogo, v(-.071, .172, z + Math.sign(z) * .026));mark.rotation.set(0, z < 0 ? Math.PI : 0, z < 0 ? -1.116 : 1.116);mark.castShadow = false;}
    }
    sculptedTube(this.steering, [top.clone().add(v(0, 0, -.082)), top.clone().addScaledVector(STEERING_AXIS, .016), top.clone().add(v(0, 0, .082))], [.024, .032, .024], [.023, .028, .023], this.m.dark);
    axle(this.steering, top, .022, .164, this.m.dark);
    tube(this.forkSlide, FORK_ARCH_POINTS, FORK_ARCH_RADIUS, this.m.dark, 48).name = 'fork-arch-tire-clearance';
    rod(this.steering, STEERING_AXIS.clone().multiplyScalar(.062), local(v(.309, 1.052)), .020, this.m.dark);
    rod(this.steering, local(v(.309, 1.052)), local(v(.379, 1.072)), .024, this.m.dark);
    axle(this.steering, local(v(.375, 1.071)), .022, .047, this.m.dark);
    for (const z of [-.018, .018]) for (const y of [-.013, .013]) {
      sphere(this.steering, local(v(.399, 1.071 + y, z)), v(.003, .003, .003), this.m.steel);
    }
    const bar = [v(.36, 1.074, -.37), v(.374, 1.069, -.23), v(.391, 1.079, -.13), v(.379, 1.072, 0), v(.391, 1.079, .13), v(.374, 1.069, .23), v(.36, 1.074, .37)].map(local);
    tube(this.steering, bar, .012, this.m.dark, 28);
    const grips: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const anchor = new THREE.Group();
      anchor.position.copy(local(v(.362, 1.075, side * .31)));
      this.steering.add(anchor);
      grips.push(anchor);
      rod(this.steering, local(v(.362, 1.074, side * .255)), local(v(.36, 1.075, side * .376)), .016, this.m.black, .017);
      for (const z of [side * .254]) {
        const band = rod(this.steering, local(v(.362, 1.074, z - .0015)), local(v(.362, 1.074, z + .0015)), .017, this.m.purple);
        band.name = 'grip-lock-ring';
      }
      rod(this.steering, local(v(.36, 1.075, side * .375)), local(v(.36, 1.075, side * .379)), .0165, this.m.dark);
      box(this.steering, local(v(.38, 1.062, side * .225)), v(.036, .026, .038), this.m.dark);
      tube(this.steering, [v(.397, 1.065, side * .23), v(.413, 1.042, side * .27), v(.413, 1.041, side * .32)].map(local), .005, this.m.steel, 10);
      tube(this.steering, [v(.401, 1.059, side * .222), v(.51, .99, side * .15), v(.445, .82, side * .08), v(.41, .81, side * .06)].map(local), .0032, this.m.black, 24);
    }
    tube(this.forkSlide, [v(-.06, .07, -.079), v(-.11, .20, -.072), v(-.13, .30, -.072)], .0033, this.m.black);
    return grips as [THREE.Object3D, THREE.Object3D];
  }

  private createDrive(): [THREE.Group, THREE.Group] {
    this.crankCenter.position.copy(BIKE.bottomBracket);
    this.frame.add(this.crankCenter);
    this.crankCenter.add(this.crank);
    mesh(this.crank, cogGeometry(.080, 38), this.m.dark, v(0, 0, .080));
    axle(this.crank, v(0, 0, .085), .023, .008, this.m.dark);
    const result: THREE.Group[] = [];
    for (const side of [1, -1]) {
      sculptedTube(this.crank, [v(0, 0, side * .093), v(side * .07, -.004, side * .099), v(side * .165, 0, side * .105)], [.019, .015, .011], [.010, .010, .009], this.m.dark);
      axle(this.crank, v(0, 0, side * .107), .009, .003, this.m.steel, 6);
      const pedal = new THREE.Group();
      pedal.position.set(side * .165, 0, side * .145);
      this.crank.add(pedal);
      mesh(pedal, pedalGeometry(), this.m.dark);
      axle(pedal, v(0, 0), .006, .099, this.m.steel);
      for (const x of [-.038, .038]) for (const z of [-.035, 0, .035]) rod(pedal, v(x, -.010, z), v(x, .010, z), .0016, this.m.steel, .0016, 6);
      box(pedal, v(.047, 0, .006), v(.001, .003, .020), this.m.purple);
      result.push(pedal);
    }
    return result as [THREE.Group, THREE.Group];
  }

  private createSaddle() {
    rod(this.frame, v(-.347, .866), v(-.355, .894), .018, this.m.dark);
    rod(this.frame, v(-.355, .894), v(-.362, .910), .012, this.m.metal);
    rod(this.frame, v(-.347, .863), v(-.353, .888), .022, this.m.dark);
    axle(this.frame, v(-.328, .875, .009), .004, .016, this.m.steel, 6);
    this.saddle.position.set(-.365, .917, 0);
    this.frame.add(this.saddle);
    for (const z of [-.035, .035]) tube(this.saddle, [v(-.10, -.008, z), v(-.06, -.038, z), v(.06, -.035, z), v(.09, -.005, z)], .004, this.m.steel, 12);
    mesh(this.saddle, saddleGeometry(), this.m.black);
    tube(this.saddle, [v(-.075, .014), v(-.02, .005), v(.050, -.004)], .002, this.m.dark, 18);
    box(this.saddle, v(-.01, -.035, 0), v(.055, .012, .067), this.m.dark);
  }

  apply(pose: TrickPose) {
    const front = clamp(pose.frontCompression, 0, BIKE.frontTravel);
    const rear = clamp(pose.rearCompression, 0, BIKE.rearTravel);
    this.steering.quaternion.setFromAxisAngle(STEERING_AXIS, Number.isFinite(pose.steering) ? pose.steering : 0);
    this.framePivot.quaternion.setFromAxisAngle(STEERING_AXIS, Number.isFinite(pose.tailwhip) ? pose.tailwhip : 0);
    this.swingarm.rotation.z = rearArmAngle(rear);
    this.forkSlide.position.copy(frontAxleAt(front).sub(BIKE.steeringPivot));
    const crank = Number.isFinite(pose.crankAngle) ? pose.crankAngle : 0;
    this.crank.rotation.z = -crank;
    this.pedals.forEach((pedal) => pedal.rotation.z = crank);
    const wheel = Number.isFinite(pose.wheelAngle) ? pose.wheelAngle : 0;
    this.frontWheel.spin.rotation.z = -(Number.isFinite(pose.frontWheelAngle) ? pose.frontWheelAngle! : wheel);
    this.rearWheel.spin.rotation.z = -(Number.isFinite(pose.rearWheelAngle) ? pose.rearWheelAngle! : wheel);
    this.rocker.rotation.z = rockerAngleAt(rear);
    const shockTop = SHOCK_TOP.clone();
    const shockBottom = v(.11, -.045).applyAxisAngle(v(0, 0, 1), this.rocker.rotation.z).add(this.rocker.position);
    const shockDir = shockBottom.clone().sub(shockTop);
    const join = shockTop.clone().addScaledVector(shockDir.clone().normalize(), .170);
    placeRod(this.shockBody, shockTop, join);
    placeRod(this.shockShaft, join, shockBottom);
    this.shockEye.position.copy(shockBottom);
    const linkTop = v(-.065, -.095).applyAxisAngle(v(0, 0, 1), this.rocker.rotation.z).add(this.rocker.position);
    const linkBottom = v(-.105, .15).applyAxisAngle(v(0, 0, 1), this.swingarm.rotation.z).add(BIKE.rearPivot);
    placeRod(this.rearLink, linkTop, linkBottom);
    this.updateChain(crank);
    this.debugData.frontCompression = front;
    this.debugData.rearCompression = rear;
    this.debugData.swingarmAngle = this.swingarm.rotation.z;
    this.debugData.shockLength = shockDir.length();
    this.importedVisual?.update(pose);
    this.root.updateMatrixWorld(true);
  }

  private updateChain(crank: number) {
    if (this.lastChainAngle === crank && this.lastChainRear === this.swingarm.rotation.z) return;
    this.lastChainAngle = crank;
    this.lastChainRear = this.swingarm.rotation.z;
    const rear = REAR_REST.clone().applyAxisAngle(v(0, 0, 1), this.swingarm.rotation.z).add(BIKE.rearPivot);
    const bb = BIKE.bottomBracket;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = -Math.PI / 2 + i / 18 * Math.PI;
      points.push(v(bb.x + Math.cos(a) * .08, bb.y + Math.sin(a) * .08, .084));
    }
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI / 2 + i / 18 * Math.PI;
      points.push(v(rear.x + Math.cos(a) * .057, rear.y + Math.sin(a) * .057, .084));
    }
    points.push(v(rear.x + .056, rear.y - .076, .114), v(rear.x + .08, rear.y - .147, .114));
    for (let i = 0; i < 40; i++) {
      this.chainPoints[i].copy(points[i]);
      this.chainPositions[i * 3] = points[i].x;
      this.chainPositions[i * 3 + 1] = points[i].y;
      this.chainPositions[i * 3 + 2] = points[i].z;
    }
    this.chain.geometry.attributes.position.needsUpdate = true;
    this.chain.geometry.computeBoundingSphere();
    const curve = this.chainCurve;
    curve.updateArcLengths();
    const dummy = this.chainDummy;
    for (let i = 0; i < 100; i++) {
      const t = ((i / 100 + crank * .05) % 1 + 1) % 1;
      dummy.position.copy(curve.getPointAt(t));
      dummy.quaternion.setFromUnitVectors(v(1, 0, 0), curve.getTangentAt(t).normalize());
      dummy.updateMatrix();
      this.chainLinks.setMatrixAt(i, dummy.matrix);
    }
    this.chainLinks.instanceMatrix.needsUpdate = true;
  }

  private toRoot(object: THREE.Object3D) {
    const result = new THREE.Vector3();
    object.getWorldPosition(result);
    return this.root.worldToLocal(result);
  }

  getContacts() {
    if (this.importedVisual) return this.importedVisual.getContacts();
    this.root.updateMatrixWorld(true);
    return { front: this.toRoot(this.frontWheel.mount), rear: this.toRoot(this.rearWheel.mount) };
  }

  getAnchors(): BikeAnchors {
    if (this.importedVisual) return this.importedVisual.getAnchors();
    this.root.updateMatrixWorld(true);
    return { hands: [this.toRoot(this.grips[0]), this.toRoot(this.grips[1])], feet: [this.toRoot(this.pedals[0]), this.toRoot(this.pedals[1])], seat: this.toRoot(this.saddle) };
  }

  dispose() { disposeObject(this.root); }
}
