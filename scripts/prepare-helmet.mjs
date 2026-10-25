#!/usr/bin/env node
/** Local trial conversion of the user-supplied helmet OBJ.
 * Run: node scripts/prepare-helmet.mjs [--source helmet.obj] [--output public/assets/helmet/imported-helmet.glb]
 * Uses the installed Three.js + its bundled meshoptimizer; no extra packages,
 * textures, network requests, browser, or Blender installation are needed.
 * Source: 3DMakerMan / CGTrader #2437337; public license label checked
 * 2026-10-25: Royalty Free License (no AI). See the asset SOURCE-NOTE.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = option('--source', 'helmet.obj');
const output = option('--output', 'public/assets/helmet/imported-helmet.glb');
const sourceBuffer = fs.readFileSync(source);
const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex');
const provenance = { author: '3DMakerMan', license: 'Royalty Free License (no AI)', sourceUrl: 'https://www.cgtrader.com/free-3d-models/sports/equipment/bike-skate-helmet-free-model', sourceItem: 2437337, checked: '2026-10-25' };
const sourceRoot = new OBJLoader().parse(sourceBuffer.toString('utf8'));

// OBJ already faces +X with +Y up. Fit in the existing rider's head group.
// This keeps the original shell, foam, chin strap, buckle and rivets intact.
const SOURCE_SCALE = .062;
const OFFSET = new THREE.Vector3(-.030, .060, 0);
const parts = {
  helmet_Plane: { name: 'shell', triangles: 5000, color: 0x202027, metal: .08, rough: .51 },
  'styrofoam_Plane.001': { name: 'padding', triangles: 2600, color: 0x090a0e, metal: 0, rough: .96 },
  belt_Plane_002: { name: 'strap', triangles: 1000, color: 0x5918df, metal: 0, rough: .90 },
  'belt_Plane.002': { name: 'strap', triangles: 1000, color: 0x5918df, metal: 0, rough: .90 },
  screws_Circle: { name: 'rivets', triangles: 240, color: 0x77777e, metal: .75, rough: .41 },
  plug_Cylinder: { name: 'buckle', triangles: 360, color: 0x141419, metal: 0, rough: .85 },
  'plug-socket_Cylinder.001': { name: 'buckle-socket', triangles: 360, color: 0x141419, metal: 0, rough: .85 },
};
const gltf = {
  asset: { version: '2.0', generator: 'MTB Trick Lab prepare-helmet.mjs / Three.js meshoptimizer',
    copyright: 'Helmet model by 3DMakerMan, CGTrader #2437337. Local trial adaptation.',
    extras: { ...provenance, sourceSha256: sourceHash, sourceScale: SOURCE_SCALE, sourceOffset: OFFSET.toArray(), forward: '+X', up: '+Y', helmetType: 'half-shell' } },
  scene: 0, scenes: [{ name: 'imported-dirt-jump-helmet', nodes: [] }],
  nodes: [], meshes: [], materials: [], buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [],
};
const chunks = [];
let byteLength = 0;
const append = (array, target) => {
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const bufferView = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target });
  chunks.push(data); byteLength += data.length;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  return bufferView;
};
const accessor = (array, itemSize, target, bounds) => {
  const result = gltf.accessors.length;
  gltf.accessors.push({ bufferView: append(array, target), byteOffset: 0,
    componentType: array instanceof Float32Array ? 5126 : 5123,
    count: array.length / itemSize, type: itemSize === 3 ? 'VEC3' : 'SCALAR', ...bounds });
  return result;
};
const modifier = new SimplifyModifier();
const report = { source: path.basename(source), sourceSha256: sourceHash, ...provenance, sourceTriangles: 0, outputTriangles: 0, outputVertices: 0, parts: [], bounds: null, bytes: 0 };
const allBounds = new THREE.Box3();
for (const object of sourceRoot.children) {
  if (!object.isMesh) continue;
  const spec = parts[object.name];
  if (!spec) throw new Error(`Unexpected source part: ${object.name}`);
  const originalTriangles = object.geometry.attributes.position.count / 3;
  const sourceGeometry = object.geometry.clone();
  // No supplied textures/MTL. Keep source normals; omit unused UV seams so
  // the geometric simplifier can collapse them without creating cracks.
  sourceGeometry.deleteAttribute('uv');
  const welded = mergeVertices(sourceGeometry, 1e-6);
  const ratio = Math.min(1, spec.triangles / originalTriangles);
  const geometry = await modifier.modify(welded, Math.floor(welded.attributes.position.count * (1 - ratio)));
  geometry.scale(SOURCE_SCALE, SOURCE_SCALE, SOURCE_SCALE);
  geometry.translate(OFFSET.x, OFFSET.y, OFFSET.z);
  // The supplied strap hangs loose. Draw its lower part toward the actual
  // fitted chin while leaving shell attachment points and the rigid buckle intact.
  if (spec.name === 'strap') {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const amount = Math.max(0, Math.min(1, (-.025 - p.getY(i)) / .045));
      p.setX(i, p.getX(i) - .018 * amount);
      p.setY(i, p.getY(i) + .022 * amount);
    }
    geometry.computeVertexNormals();
  } else if (spec.name.startsWith('buckle')) geometry.translate(-.018, .022, 0);
  geometry.computeBoundingBox();
  allBounds.union(geometry.boundingBox);
  const position = new Float32Array(geometry.attributes.position.array);
  const normal = new Float32Array(geometry.attributes.normal.array);
  const indices = new Uint16Array(geometry.index.array);
  if (geometry.attributes.position.count > 65535) throw new Error('Index exceeds uint16 capacity');
  if (![...position, ...normal].every(Number.isFinite)) throw new Error('Non-finite geometry');
  for (const index of indices) if (index >= position.length / 3) throw new Error('Invalid index');
  const p = accessor(position, 3, 34962, { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() });
  const n = accessor(normal, 3, 34962);
  const ix = accessor(indices, 1, 34963);
  const color = new THREE.Color(spec.color);
  const material = gltf.materials.length;
  gltf.materials.push({ name: `trial-${spec.name}`, pbrMetallicRoughness: {
    baseColorFactor: [...color.toArray(), 1], metallicFactor: spec.metal, roughnessFactor: spec.rough,
  } });
  const mesh = gltf.meshes.length;
  gltf.meshes.push({ name: spec.name, primitives: [{ attributes: { POSITION: p, NORMAL: n }, indices: ix, material, mode: 4 }] });
  const node = gltf.nodes.length;
  gltf.nodes.push({ name: spec.name, mesh }); gltf.scenes[0].nodes.push(node);
  const triangles = indices.length / 3;
  report.parts.push({ name: spec.name, sourceTriangles: originalTriangles, triangles, vertices: position.length / 3 });
  report.sourceTriangles += originalTriangles; report.outputTriangles += triangles; report.outputVertices += position.length / 3;
  geometry.dispose(); welded.dispose(); sourceGeometry.dispose();
}
if (report.parts.length !== 6) throw new Error('Expected all six helmet parts');
report.bounds = { min: allBounds.min.toArray(), max: allBounds.max.toArray() };
gltf.buffers[0].byteLength = byteLength;
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
const jsonChunk = Buffer.concat([json, jsonPadding]);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jh, jsonChunk, bh, binary]);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(`${output}.tmp`, result); fs.renameSync(`${output}.tmp`, output);
report.bytes = result.length;
fs.writeFileSync(path.join(path.dirname(output), 'preparation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
