import * as THREE from 'three';
import { clamp, mesh, v } from '../bike/geometry';

function skinGeometry(rings: number, sides: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rings + 1) * (sides + 1) * 3), 3));
  const uv = new Float32Array((rings + 1) * (sides + 1) * 2);
  const indices: number[] = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
    const index = j * (sides + 1) + i;
    uv[index * 2] = i / sides; uv[index * 2 + 1] = j / rings;
    if (j < rings && i < sides) indices.push(index, index + 1, index + sides + 1, index + 1, index + sides + 2, index + sides + 1);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function interpolate(profile: number[], t: number) {
  const n = clamp(t) * (profile.length - 1);
  const i = Math.min(profile.length - 2, Math.floor(n));
  const u = n - i;
  return profile[i] * (1 - u) + profile[i + 1] * u;
}

function groupRings(geometry: THREE.BufferGeometry, rings: number, sides: number, materialAt: (ring: number) => number) {
  let start = 0, material = materialAt(0);
  for (let j = 1; j <= rings; j++) {
    const next = j === rings ? -1 : materialAt(j);
    if (next !== material) { geometry.addGroup(start * sides * 6, (j - start) * sides * 6, material); start = j; material = next; }
  }
}

export class SoftLimb {
  readonly surface: THREE.Mesh;
  private readonly rings = 24;
  private readonly sides = 16;
  private readonly curve = new THREE.CatmullRomCurve3(Array.from({ length: 5 }, () => new THREE.Vector3()), false, 'centripetal');
  constructor(parent: THREE.Object3D, materials: THREE.Material[], private radii: number[], private leg = false) {
    const geometry = skinGeometry(this.rings, this.sides);
    groupRings(geometry, this.rings, this.sides, (j) => this.leg ? (j >= 16 && j <= 17 ? 2 : 0) : (j < 6 ? 1 : j === 7 ? 2 : 0));
    this.surface = new THREE.Mesh(geometry, materials);
    this.surface.castShadow = this.surface.receiveShadow = true;
    this.surface.frustumCulled = false;
    parent.add(this.surface);
  }
  update(start: THREE.Vector3, joint: THREE.Vector3, end: THREE.Vector3, side: number) {
    const curve = this.curve;
    curve.points[0].copy(start); curve.points[1].copy(start).lerp(joint, .70); curve.points[2].copy(joint);
    curve.points[3].copy(joint).lerp(end, .30); curve.points[4].copy(end);
    const positions = this.surface.geometry.attributes.position;
    for (let j = 0; j <= this.rings; j++) {
      const t = j / this.rings, center = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
      let radial = v(0, 0, side).addScaledVector(tangent, -tangent.z * side);
      if (radial.lengthSq() < .0001) radial = v(1, 0, 0).addScaledVector(tangent, -tangent.x);
      radial.normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, radial).normalize();
      const radius = interpolate(this.radii, t);
      for (let i = 0; i <= this.sides; i++) {
        const angle = i / this.sides * Math.PI * 2;
        const folds = 1 + .022 * Math.sin(angle * 4 + t * 14) * Math.sin(Math.PI * t);
        const point = center.clone().addScaledVector(radial, Math.cos(angle) * radius * folds).addScaledVector(normal, Math.sin(angle) * radius * (this.leg ? 1.10 : .94));
        positions.setXYZ(j * (this.sides + 1) + i, point.x, point.y, point.z);
      }
    }
    positions.needsUpdate = true;
    this.surface.geometry.computeVertexNormals(); this.surface.geometry.computeBoundingSphere();
  }
}

export class SoftTorso {
  readonly surface: THREE.Mesh;
  private readonly rings = 22;
  private readonly sides = 32;
  constructor(parent: THREE.Object3D, materials: THREE.Material[]) {
    const geometry = skinGeometry(this.rings, this.sides);
    const batches: number[][] = [[], [], []], original = geometry.index!;
    for (let j = 0; j < this.rings; j++) for (let i = 0; i < this.sides; i++) {
      const material = j >= 8 && j <= 16 && i >= 5 && i <= 10 ? 1 : j === 17 && i >= 4 && i <= 11 ? 2 : 0;
      const offset = (j * this.sides + i) * 6;
      for (let k = 0; k < 6; k++) batches[material].push(original.getX(offset + k));
    }
    geometry.setIndex(batches.flat());
    let offset = 0;
    batches.forEach((batch, material) => { geometry.addGroup(offset, batch.length, material); offset += batch.length; });
    this.surface = new THREE.Mesh(geometry, materials);
    this.surface.castShadow = this.surface.receiveShadow = true; this.surface.frustumCulled = false;
    parent.add(this.surface);
  }
  update(pelvis: THREE.Vector3, chest: THREE.Vector3, lateral: THREE.Vector3) {
    const up = chest.clone().sub(pelvis).normalize();
    const side = lateral.clone().addScaledVector(up, -lateral.dot(up)).normalize();
    const forward = new THREE.Vector3().crossVectors(up, side).normalize();
    const begin = pelvis.clone().addScaledVector(up, -.025), end = chest.clone().addScaledVector(up, .065);
    const positions = this.surface.geometry.attributes.position;
    for (let j = 0; j <= this.rings; j++) {
      const t = j / this.rings;
      const center = begin.clone().lerp(end, t).addScaledVector(forward, -.016 * Math.sin(Math.PI * t));
      const width = interpolate([.130, .137, .150, .182, .200, .053], t);
      const depth = interpolate([.091, .095, .108, .116, .101, .048], t);
      for (let i = 0; i <= this.sides; i++) {
        const angle = i / this.sides * Math.PI * 2;
        const fabric = 1 + .014 * Math.sin(angle * 5 + t * 12) * Math.sin(Math.PI * t);
        const point = center.clone().addScaledVector(side, Math.cos(angle) * width * fabric).addScaledVector(forward, Math.sin(angle) * depth * fabric);
        positions.setXYZ(j * (this.sides + 1) + i, point.x, point.y, point.z);
      }
    }
    positions.needsUpdate = true;
    this.surface.geometry.computeVertexNormals(); this.surface.geometry.computeBoundingSphere();
    return { up, side, forward };
  }
}

export function shoeGeometry(upper: boolean) {
  const outline = new THREE.Shape();
  outline.moveTo(-.073, -.030); outline.quadraticCurveTo(-.087, 0, -.073, .032);
  outline.lineTo(.085, .044); outline.quadraticCurveTo(.148, .041, .151, .014);
  outline.quadraticCurveTo(.155, -.030, .115, -.041); outline.lineTo(-.073, -.030);
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: upper ? .048 : .009, bevelEnabled: true, bevelThickness: upper ? .009 : .003, bevelSize: upper ? .008 : .003, bevelSegments: 3, steps: 1, curveSegments: 8 });
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  if (upper) for (let i = 0; i < positions.count; i++) {
    const taper = 1 - .50 * clamp((positions.getX(i) + .025) / .15);
    positions.setY(i, positions.getY(i) * taper + .014);
  }
  geometry.computeVertexNormals(); return geometry;
}

export function helmetShell(parent: THREE.Object3D, mat: THREE.Material) {
  const geometry = new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, Math.PI * .80);
  geometry.scale(.105, .112, .102); geometry.translate(-.012, .055, 0);
  const positions = geometry.attributes.position, indices = geometry.index!, keep: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const x = ids.reduce((sum, id) => sum + positions.getX(id), 0) / 3;
    const y = ids.reduce((sum, id) => sum + positions.getY(id), 0) / 3;
    const z = ids.reduce((sum, id) => sum + positions.getZ(id), 0) / 3;
    if (!(x > .028 && y < .093 && Math.abs(z) < .084)) keep.push(...ids);
  }
  geometry.setIndex(keep); geometry.computeVertexNormals(); return mesh(parent, geometry, mat);
}
