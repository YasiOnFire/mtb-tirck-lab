import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { carbonFrameGeometry, cogGeometry, FORK_ARCH_POINTS, FORK_ARCH_RADIUS, pedalGeometry, rimGeometry, rockerPlateGeometry, rotorGeometry, SHOCK_TOP } from '../three/bike/parts';
import { BIKE, rockerAngleAt, ROCKER_PIVOT } from '../three/bike/kinematics';
import { BikeRig } from '../three/bike/BikeRig';
import type { TrickPose } from '../types';

describe('manufactured bike component geometry', () => {
  it('lets the airborne wheel spin independently and restores the shared fallback', () => {
    const bike = new BikeRig();
    const pose = { frontCompression: .04, rearCompression: .04, steering: 0, tailwhip: 0, crankAngle: 0, wheelAngle: 2 } as TrickPose;
    bike.apply({ ...pose, frontWheelAngle: 4.1, rearWheelAngle: 1.2 });
    expect(bike.root.getObjectByName('front-wheel-spin')!.rotation.z).toBe(-4.1);
    expect(bike.root.getObjectByName('rear-wheel-spin')!.rotation.z).toBe(-1.2);
    bike.apply(pose);
    expect(bike.root.getObjectByName('front-wheel-spin')!.rotation.z).toBe(-2);
    expect(bike.root.getObjectByName('rear-wheel-spin')!.rotation.z).toBe(-2);
    bike.dispose();
  });

  it('keeps the whole moving fork arch outside the tire envelope', () => {
    const curve = new THREE.CatmullRomCurve3(FORK_ARCH_POINTS);
    for (let i = 0; i <= 400; i++) {
      const point = curve.getPoint(i / 400);
      // Conservative tyre volume: .337m torus centreline, .033m minor radius,
      // including knob tops. Check the whole arch, not only its top point.
      const distance = Math.hypot(Math.hypot(point.x, point.y) - .337, point.z);
      expect(distance - FORK_ARCH_RADIUS - .033).toBeGreaterThan(.006);
    }
  });

  it('has a real open front triangle and real perforations rather than painted holes', () => {
    const cast = (geometry: THREE.BufferGeometry, x: number, y: number) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld();
      const hits = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(mesh);
      mesh.material.dispose();return hits.length;
    };
    const frame = carbonFrameGeometry(), rotor = rotorGeometry(), cog = cogGeometry(.103, 51);
    expect(cast(frame, -.04, .72)).toBe(0);
    expect(cast(frame, .12, .591)).toBeGreaterThan(0);
    expect(cast(rotor, 0, 0)).toBe(0);
    expect(cast(rotor, .089, 0)).toBe(0);
    expect(cast(rotor, .097, 0)).toBeGreaterThan(0);
    expect(cast(cog, 0, 0)).toBe(0);
    expect(cast(cog, .103 * .59, 0)).toBe(0);
    [frame, rotor, cog].forEach((g) => g.dispose());
  });

  it('leaves a positive exposed shock shaft and compresses it through rear travel', () => {
    let last = Infinity;
    for (let i = 0; i <= 140; i++) {
      const lowerEye = new THREE.Vector3(.11, -.045, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rockerAngleAt(i / 1000)).add(ROCKER_PIVOT);
      const length = lowerEye.distanceTo(SHOCK_TOP);
      expect(length).toBeLessThanOrEqual(last + 1e-8);
      expect(length - .170).toBeGreaterThan(.035);
      last = length;
    }
    expect(BIKE.rearTravel).toBe(.14);
  });

  it('produces finite, bounded closed-part buffers', () => {
    const geometries = [carbonFrameGeometry(), cogGeometry(.103, 51), rotorGeometry(), pedalGeometry(), rimGeometry(), rockerPlateGeometry()];
    for (const geo of geometries) {
      expect(Array.from(geo.attributes.position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(geo.attributes.normal.array).every(Number.isFinite)).toBe(true);
      geo.computeBoundingSphere();expect(geo.boundingSphere!.radius).toBeLessThan(.7);
      geo.dispose();
    }
  });
});
