import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BikeRig } from '../three/bike/BikeRig';
import type { TrickPose } from '../types';

const neutral = {frontCompression:.04, rearCompression:.04, steering:0, tailwhip:0, crankAngle:0, wheelAngle:0} as TrickPose;
describe.skipIf(!existsSync('public/models/downloaded/torque.glb'))('native Canyon Torque visual', () => {
  let bike: BikeRig, sourceFrame: THREE.Mesh;
  beforeAll(async () => {
    const bytes = readFileSync('public/models/downloaded/torque.glb');
    const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    source.scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'Frame_Plane') sourceFrame = o; });
    bike = BikeRig.fromDownloaded(source.scene);
  });
  afterAll(() => bike?.dispose());

  it('preserves the downloaded frame proportions and original material instead of shearing it', () => {
    bike.apply(neutral);
    const target = bike.root.getObjectByName('torque:Frame_Plane') as THREE.Mesh;
    const a = sourceFrame.geometry, b = target.geometry;
    const point = (geometry: THREE.BufferGeometry, n: number, transformed = false) => {
      const id = geometry.getIndex()!.getX(n);
      const p = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), id);
      return transformed ? target.localToWorld(p) : p;
    };
    let checked = 0;
    for (let i = 0; i < Math.min(300, a.getIndex()!.count); i += 3) {
      for (const offset of [1, 2]) {
        const original = point(a, i).distanceTo(point(a, i + offset));
        if (original < .005) continue;
        const actual = point(b, i, true).distanceTo(point(b, i + offset, true));
        expect(actual / original).toBeCloseTo(1.12, 4); checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect((target.material as THREE.MeshStandardMaterial).color.toArray()).toEqual((sourceFrame.material as THREE.MeshStandardMaterial).color.toArray());
    expect(bike.getAnchors().seat.y).toBeLessThan(.93);
    expect(bike.getAnchors().seat.y).toBeGreaterThan(.85);
  });

  it('keeps native wheel centres and rigid cockpit spacing through suspension, steering and frame rotation', () => {
    const tires: THREE.Mesh[] = [];
    bike.root.traverse(o => { if (o instanceof THREE.Mesh && o.name.startsWith('torque:Tires_')) tires.push(o); });
    for (let i = 0; i <= 20; i++) {
      bike.apply({...neutral, frontCompression:i*.15/20, rearCompression:(20-i)*.14/20, steering:Math.sin(i)*1.2, tailwhip:i*.15, crankAngle:i*.31});
      const contacts = bike.getContacts(), anchors = bike.getAnchors();
      for (const tire of tires) {
        const centre = bike.root.worldToLocal(tire.parent!.getWorldPosition(new THREE.Vector3()));
        expect(centre.distanceTo(tire.name.endsWith(':front') ? contacts.front : contacts.rear)).toBeLessThan(1e-8);
      }
      expect(anchors.hands[0].distanceTo(anchors.hands[1])).toBeCloseTo(2*.294461*1.12, 6);
      bike.root.traverse(o => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
  });

  it('retains original drivetrain parts and the 37cm tyre envelope', () => {
    bike.apply(neutral);
    let tires = 0;
    bike.root.traverse(o => {
      if (!(o instanceof THREE.Mesh) || !o.name.startsWith('torque:Tires_')) return;
      tires++; expect(o.parent?.name).toMatch(/^(front|rear)-wheel-spin$/);
      const pos=o.geometry.getAttribute('position'); let radius=0;
      for(let i=0;i<pos.count;i++) radius=Math.max(radius,Math.hypot(pos.getX(i),pos.getY(i)));
      expect(radius).toBeGreaterThan(.369); expect(radius).toBeLessThan(.372);
    });
    expect(tires).toBe(2);
    for(const prefix of ['torque:Chain_', 'torque:Derailleur_', 'torque:Frame4_', 'torque:Frame5_'])
      expect(bike.importedDetails?.attachedParts.some(name=>name.startsWith(prefix))).toBe(true);
    expect(bike.importedDetails?.retainedProcedural).toEqual([]);
  });
});
