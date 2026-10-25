import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TRICKS } from '../data/tricks';
import { RiderSkin } from '../three/rider/RiderSkin';
import { RiderRig } from '../three/rider/RiderRig';
import { BikeRig } from '../three/bike/BikeRig';
import { sampleTrick } from '../three/tricks/TrickPrimitives';
import { PhysicsWorld } from '../three/physics/PhysicsWorld';

beforeAll(async () => { await PhysicsWorld.create(); });
async function create(asset: 'quaternius' | 'imported' = 'quaternius') {
  const bytes = readFileSync(`public/assets/rider/${asset === 'imported' ? 'imported' : 'base'}-rider.glb`);
  // Node has no image decoder. Keep the exact geometry/bind data and omit only
  // material images here; browser tests load the unmodified production GLB.
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  delete document.images; delete document.textures; delete document.samplers;
  for (const material of document.materials ?? []) {
    for (const key of Object.keys(material)) if (key.endsWith('Texture')) delete material[key];
    for (const key of Object.keys(material.pbrMetallicRoughness ?? {})) if (key.endsWith('Texture')) delete material.pbrMetallicRoughness[key];
  }
  const json = JSON.stringify(document), padded = Buffer.from(json + ' '.repeat((4 - Buffer.byteLength(json) % 4) % 4));
  const binaryChunk = bytes.subarray(20 + jsonLength), stripped = Buffer.alloc(20 + padded.length + binaryChunk.length);
  bytes.copy(stripped, 0, 0, 20); stripped.writeUInt32LE(stripped.length, 8); stripped.writeUInt32LE(padded.length, 12);
  padded.copy(stripped, 20); binaryChunk.copy(stripped, 20 + padded.length);
  const gltf = await new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength), '');
  const skin = new RiderSkin(gltf.scene, asset);
  return { skin, rider: new RiderRig(skin), bike: new BikeRig() };
}

describe.each(['quaternius', 'imported'] as const)('%s rider mesh and contact retargeting', asset => {
  const testAsset = it.skipIf(asset === 'imported' && !existsSync('public/assets/rider/imported-rider.glb'));
  testAsset('loads a self-contained weighted mesh and keeps its real joints on the IK solution', async () => {
    const { skin, rider, bike } = await create(asset);
    expect(skin.meshes.length).toBeGreaterThan(0);
    expect(skin.meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position!.count, 0)).toBeGreaterThan(6000);
    expect(skin.meshes[0]!.skeleton.bones.length).toBe(asset === 'imported' ? 61 : 65);
    expect(skin.dimensions.upperArm).toBeGreaterThan(.20);
    expect(skin.dimensions.shin).toBeGreaterThan(.37);
    bike.root.add(rider.root);
    for (const id of ['trackstand', 'wheelie', 'manual', 'nose-manual', 'stoppie-endo', 'bunny-hop', 'english-bunny-hop', 'american-bunny-hop', 'pumping', 'jump', 'drop', 'whip', 'tabletop']) {
      const trick = TRICKS.find(item => item.id === id)!;
      for (const progress of [.1, .3, .5, .7, .9]) {
        const pose = sampleTrick(trick, trick.duration * progress);
        bike.apply(pose);
        // Retargeting must also work with a translated/rotated parent from a
        // previous frame, not just when instantiated at the world origin.
        bike.root.position.set(3, .4, -2);
        bike.root.rotation.set(.2, .4, .3);
        rider.apply(pose, bike.getAnchors());
        for (const [index, side] of [[0, 'r'], [1, 'l']] as const) {
          const d = rider.debugData;
          for (const [name, expected] of [[`upperarm_${side}`, d.shoulders[index]], [`lowerarm_${side}`, d.elbows[index]], [`hand_${side}`, d.wrists[index]], [`thigh_${side}`, d.hips[index]], [`calf_${side}`, d.knees[index]], [`foot_${side}`, d.ankles[index]]] as const) {
            expect(skin.jointPosition(name)!.distanceTo(expected), `${id} ${name} @${progress}`).toBeLessThan(1e-6);
          }
          expect(d.shoulders[index].distanceTo(d.elbows[index])).toBeCloseTo(skin.dimensions.upperArm, 6);
          expect(d.elbows[index].distanceTo(d.wrists[index])).toBeCloseTo(skin.dimensions.forearm, 6);
          expect(d.hips[index].distanceTo(d.knees[index])).toBeCloseTo(skin.dimensions.thigh, 6);
          expect(d.knees[index].distanceTo(d.ankles[index])).toBeCloseTo(skin.dimensions.shin, 6);
          if (asset === 'imported') {
            const prefix = `CC_Base_${side.toUpperCase()}_`;
            for (const [name, start, end] of [['Upperarm', d.shoulders[index], d.elbows[index]], ['Forearm', d.elbows[index], d.wrists[index]], ['Thigh', d.hips[index], d.knees[index]], ['Calf', d.knees[index], d.ankles[index]]] as const) {
              const middle = skin.jointPosition(`${prefix}${name}Twist02`)!;
              expect(middle.distanceTo(start.clone().lerp(end, .5)), `${name} twist midpoint`).toBeLessThan(.015);
            }
          }
        }
        expect(rider.debugData.pelvis.distanceTo(rider.debugData.chest)).toBeCloseTo(.49, 3);
        for (const mesh of skin.meshes) {
          mesh.skeleton.update(); mesh.computeBoundingBox();
          const meshToRider = rider.root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
          const size = mesh.boundingBox!.clone().applyMatrix4(meshToRider).getSize(new THREE.Vector3());
          expect(size.toArray().every(Number.isFinite)).toBe(true);
          expect(size.length()).toBeLessThan(2.5);
        }
      }
    }
    rider.dispose(); bike.dispose();
  });

  if (asset === 'imported') testAsset('keeps held contacts with the shorter donor limbs across every active trick', async () => {
    const { rider, bike: procedural } = await create(asset);
    const bytes = readFileSync('public/models/downloaded/torque.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const bike = BikeRig.fromDownloaded(gltf.scene);
    procedural.dispose();
    for (const trick of TRICKS.filter(item => item.status !== 'unavailable')) {
      for (let step = 0; step <= 24; step++) {
        const pose = sampleTrick(trick, trick.duration * step / 24);
        bike.apply(pose);
        const anchors = bike.getAnchors();
        rider.apply(pose, anchors);
        for (let limb = 0; limb < 2; limb++) {
          if (pose.handRelease[limb] < .001) expect(rider.debugData.hands[limb].distanceTo(anchors.hands[limb]), `${trick.id} hand ${limb} @${step}`).toBeLessThan(.01);
          if (pose.footRelease[limb] < .001) expect(rider.debugData.feet[limb].distanceTo(anchors.feet[limb]), `${trick.id} foot ${limb} @${step}`).toBeLessThan(.01);
        }
      }
    }
    rider.dispose(); bike.dispose();
  });
});
