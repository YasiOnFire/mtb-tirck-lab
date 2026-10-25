import * as THREE from 'three';
import { v } from './geometry';

const TAU = Math.PI * 2;
export const FORK_ARCH_RADIUS = .012;
// Arch is in the moving lower's axle-local coordinates. Even at the centre
// bridge the 370 mm wheel envelope has about 9 mm clearance; suspension cannot change it.
export const FORK_ARCH_POINTS = [v(-.115, .265, -.064), v(-.124, .342, -.065), v(-.104, .367, -.050), v(-.075, .384, 0), v(-.104, .367, .050), v(-.124, .342, .065), v(-.115, .265, .064)];
export const SHOCK_TOP = v(.075, .655);

function extrude(shape: THREE.Shape, depth: number, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 14, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** One continuous rounded carbon chassis, including the broad head/down-tube junction. */
export function carbonFrameGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.266, .335);
  shape.bezierCurveTo(-.267, .312, -.242, .296, -.212, .302);
  shape.lineTo(-.097, .318);
  shape.bezierCurveTo(-.056, .324, -.022, .370, .009, .412);
  shape.lineTo(.338, .818);
  shape.quadraticCurveTo(.354, .826, .363, .845);
  shape.lineTo(.284, 1.001);
  shape.quadraticCurveTo(.278, 1.016, .260, 1.004);
  shape.lineTo(-.318, .807);
  shape.quadraticCurveTo(-.338, .801, -.342, .786);
  shape.lineTo(-.266, .335);
  const hole = new THREE.Path();
  hole.moveTo(-.221, .413);
  hole.lineTo(-.307, .763);
  hole.quadraticCurveTo(-.313, .777, -.292, .785);
  hole.lineTo(.233, .963);
  hole.quadraticCurveTo(.250, .970, .257, .953);
  hole.lineTo(.304, .850);
  hole.lineTo(-.051, .426);
  hole.quadraticCurveTo(-.087, .381, -.118, .375);
  hole.lineTo(-.184, .366);
  hole.quadraticCurveTo(-.211, .362, -.221, .413);
  shape.holes.push(hole);
  const geo = extrude(shape, .047, .009), pos = geo.attributes.position;
  const segments = [[v(-.32, .796), v(.27, .985), .78], [v(-.24, .34), v(-.33, .79), .80], [v(-.10, .35), v(.332, .837), 1.05], [v(.276, .988), v(.349, .836), 1.08]] as const;
  for (let i = 0; i < pos.count; i++) {
    const point = v(pos.getX(i), pos.getY(i));let weight = 0, depth = 0;
    for (const [a, b, scale] of segments) { const delta = b.clone().sub(a), t = THREE.MathUtils.clamp(point.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1), d = point.distanceTo(a.clone().addScaledVector(delta, t)), w = Math.exp(-d * 65);weight += w;depth += scale * w; }
    pos.setZ(i, pos.getZ(i) * depth / weight);
  }
  geo.computeVertexNormals();return geo;
}

export function rockerPlateGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.080, -.106);
  shape.quadraticCurveTo(-.090, -.081, -.020, .014);
  shape.quadraticCurveTo(-.005, .035, .023, .018);
  shape.lineTo(.120, -.025);
  shape.quadraticCurveTo(.144, -.043, .116, -.063);
  shape.lineTo(-.049, -.116);
  shape.quadraticCurveTo(-.072, -.125, -.080, -.106);
  const window = new THREE.Path();
  window.moveTo(-.030, -.067);window.lineTo(-.010, -.020);window.lineTo(.065, -.044);window.closePath();shape.holes.push(window);
  return extrude(shape, .012, .003);
}

export function rotorGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 144; i++) {
    const a = i / 144 * TAU, r = .100 + .0015 * Math.cos(a * 12);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const center = new THREE.Path();center.absarc(0, 0, .020, 0, TAU, true);shape.holes.push(center);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + .10, b = a + .74;
    const window = new THREE.Path();window.moveTo(Math.cos(a) * .037, Math.sin(a) * .037);window.absarc(0, 0, .037, a, b, false);window.lineTo(Math.cos(b + .10) * .078, Math.sin(b + .10) * .078);window.absarc(0, 0, .078, b + .10, a + .10, true);window.closePath();shape.holes.push(window);
  }
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, window = new THREE.Path();window.absellipse(Math.cos(a) * .089, Math.sin(a) * .089, .0024, .0056, 0, TAU, true, a);shape.holes.push(window);
  }
  return extrude(shape, .0018);
}

export function cogGeometry(radius: number, teeth: number, web = true) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= teeth * 4; i++) {
    const a = i / (teeth * 4) * TAU, r = radius - (i % 4 < 2 ? .0028 : 0);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const center = new THREE.Path();center.absarc(0, 0, Math.min(.018, radius * .48), 0, TAU, true);shape.holes.push(center);
  if (web && radius > .045) for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU, r = radius * .59, window = new THREE.Path();
    window.absellipse(Math.cos(a) * r, Math.sin(a) * r, radius * .19, radius * .11, 0, TAU, true, a);shape.holes.push(window);
  }
  return extrude(shape, .0018);
}

export function pedalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.041, -.048);shape.lineTo(.038, -.048);shape.quadraticCurveTo(.049, -.041, .049, -.031);shape.lineTo(.045, .040);shape.lineTo(.032, .048);shape.lineTo(-.038, .048);shape.lineTo(-.049, .035);shape.lineTo(-.049, -.035);shape.closePath();
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const hole = new THREE.Path();hole.moveTo(x * .009, y * .008);hole.lineTo(x * .035, y * .008);hole.lineTo(x * .034, y * .032);hole.lineTo(x * .009, y * .033);hole.closePath();shape.holes.push(hole);
  }
  const geometry = extrude(shape, .010, .0018);geometry.rotateX(Math.PI / 2);return geometry;
}

/** Closed box-section rim, with a 30 mm inner channel and a 20 mm deep wall. */
export function rimGeometry() {
  const sections = [[.298, -.014], [.300, -.019], [.315, -.019], [.317, -.016], [.317, .016], [.315, .019], [.300, .019], [.298, .014], [.298, -.014]];
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let j = 0; j <= 128; j++) for (let i = 0; i < sections.length; i++) {
    const a = j / 128 * TAU, [r, z] = sections[i];positions.push(Math.cos(a) * r, Math.sin(a) * r, z);normals.push(Math.cos(a), Math.sin(a), 0);uv.push(j / 128, i / (sections.length - 1));
    if (j < 128 && i < sections.length - 1) { const k = j * sections.length + i;indices.push(k, k + sections.length, k + 1, k + 1, k + sections.length, k + sections.length + 1); }
  }
  const geo = new THREE.BufferGeometry();geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

export function rubberGrainTexture() {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const n = 117 + ((Math.imul(i + 13, 1597334677) >>> 16) % 24);data.set([n, n, n, 255], i * 4); }
  const texture = new THREE.DataTexture(data, size, size);texture.wrapS = texture.wrapT = THREE.RepeatWrapping;texture.repeat.set(32, 3);texture.magFilter = THREE.LinearFilter;texture.minFilter = THREE.LinearMipmapLinearFilter;texture.generateMipmaps = true;texture.needsUpdate = true;return texture;
}

export function labelMaterial(text: string, color = '#b5b6b7') {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');canvas.width = 1024;canvas.height = 128;
  const ctx = canvas.getContext('2d');if (!ctx) return undefined;
  ctx.clearRect(0, 0, 1024, 128);ctx.fillStyle = color;ctx.font = '600 86px Arial';ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillText(text, 512, 67, 990);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 8;
  return new THREE.MeshStandardMaterial({map: texture, transparent: true, alphaTest: .05, roughness: .85, metalness: .05, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false});
}

export function sidewallLabelGeometry(angle: number, span: number) {
  const geo = new THREE.RingGeometry(.327, .346, 48, 1, angle, span), position = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < position.count; i++) { let a = Math.atan2(position.getY(i), position.getX(i));while (a < angle - .01) a += TAU;uv.setXY(i, 1 - (a - angle) / span, (Math.hypot(position.getX(i), position.getY(i)) - .327) / .019); }
  return geo;
}
