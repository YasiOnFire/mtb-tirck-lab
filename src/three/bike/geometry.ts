import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const UP = new THREE.Vector3(0, 1, 0);
export const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, Number.isFinite(n) ? n : 0));
export const material = (color: number, metalness = 0, roughness = .6) => new THREE.MeshStandardMaterial({ color, metalness, roughness });

export function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position?: THREE.Vector3) {
  const result = new THREE.Mesh(geometry, mat);
  if (position) result.position.copy(position);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

export function placeRod(rod: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  rod.position.copy(a).add(b).multiplyScalar(.5);
  rod.scale.y = Math.max(.0001, d.length());
  rod.quaternion.setFromUnitVectors(UP, d.normalize());
}

export function rod(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, radius2 = radius, sides = 12) {
  const result = mesh(parent, new THREE.CylinderGeometry(radius2, radius, 1, sides), mat);
  placeRod(result, a, b);
  return result;
}

export function sphere(parent: THREE.Object3D, center: THREE.Vector3, radii: THREE.Vector3, mat: THREE.Material, segments = 16) {
  const result = mesh(parent, new THREE.SphereGeometry(1, segments, 12), mat, center);
  result.scale.copy(radii);
  return result;
}

export function box(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3, mat: THREE.Material) {
  return mesh(parent, new THREE.BoxGeometry(size.x, size.y, size.z), mat, center);
}

export function axle(parent: THREE.Object3D, center: THREE.Vector3, radius: number, depth: number, mat: THREE.Material, sides = 24) {
  const result = mesh(parent, new THREE.CylinderGeometry(radius, radius, depth, sides), mat, center);
  result.rotation.x = Math.PI / 2;
  return result;
}

export function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material, segments = 24) {
  return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false), mat);
}

export function profileTube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, mat: THREE.Material, taper = .78) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + .5;
    pos.setX(i, pos.getX(i) * width * (.5 + .5 * (1 - (1 - taper) * t)));
    pos.setZ(i, pos.getZ(i) * depth);
  }
  g.computeVertexNormals();
  const result = mesh(parent, g, mat);
  placeRod(result, a, b);
  return result;
}

export function sculptedTube(parent: THREE.Object3D, centers: THREE.Vector3[], widths: number[], depths: number[], mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(centers, false, 'centripetal');
  const rings = 22, sides = 16;
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const dimension = (values: number[], t: number) => { const n = t * (values.length - 1), i = Math.min(values.length - 2, Math.floor(n)); return THREE.MathUtils.lerp(values[i], values[i + 1], n - i); };
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, center = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const reference = Math.abs(tangent.z) > .85 ? v(0, 1, 0) : v(0, 0, 1);
    const lateral = reference.addScaledVector(tangent, -reference.dot(tangent)).normalize(), normal = new THREE.Vector3().crossVectors(tangent, lateral).normalize();
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      const point = center.clone().addScaledVector(lateral, Math.sign(c) * Math.abs(c) ** .72 * dimension(depths, t)).addScaledVector(normal, Math.sign(s) * Math.abs(s) ** .72 * dimension(widths, t));
      positions.push(point.x, point.y, point.z); uvs.push(i / sides, t);
      if (j < rings && i < sides) { const k = j * (sides + 1) + i; indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return mesh(parent, geometry, mat);
}

export function saddleGeometry() {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const profile = new THREE.CatmullRomCurve3([v(-.140, .001, .008), v(-.123, .042, .015), v(-.080, .068, .011), v(-.025, .061, .002), v(.020, .037, -.006), v(.09, .022, -.009), v(.139, .014, -.004), v(.146, .001, -.002)], false, 'centripetal');
  const sides = 32, sections = 64;
  for (let j = 0; j <= sections; j++) for (let i = 0; i <= sides; i++) {
    const angle = i / sides * Math.PI * 2, section = profile.getPoint(j / sections), x = section.x, width = Math.max(.001, section.y);
    const z = Math.cos(angle) * width;
    const y = section.z + Math.sin(angle) * .009 - (Math.sin(angle) > 0 ? .004 * Math.exp(-z * z / .00008) : 0);
    positions.push(x, y, z); uvs.push(i / sides, j / sections);
    if (j < sections && i < sides) { const k = j * (sides + 1) + i; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((mat) => materials.add(mat));
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((m) => m.dispose());
  root.clear();
}

export function consolidateStaticMeshes(root: THREE.Object3D, dynamic: Set<THREE.Object3D>) {
  const groups: THREE.Object3D[] = [];
  root.traverse((object) => { if (object.children.length) groups.push(object); });
  for (const group of groups) {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || dynamic.has(child) || Array.isArray(child.material)) continue;
      const bucket = byMaterial.get(child.material) ?? [];
      bucket.push(child); byMaterial.set(child.material, bucket);
    }
    for (const [mat, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((object) => { object.updateMatrix(); const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone(); return geometry.applyMatrix4(object.matrix); });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      meshes.forEach((object) => { group.remove(object); object.geometry.dispose(); });
      mesh(group, merged, mat);
    }
  }
}
