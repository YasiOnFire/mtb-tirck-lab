import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BikeRig } from '../three/bike/BikeRig';
import { BIKE, PUSHROD_LENGTH, REAR_REST, ROCKER_END, ROCKER_PIVOT, STEERING_AXIS, frontAxleAt, rearArmAngle, rearAxleAt, rockerAngleAt } from '../three/bike/kinematics';
import { RiderRig } from '../three/rider/RiderRig';
import { solveTwoBone } from '../three/rider/ik';
import type { TrickPose } from '../types';
import { TRICKS } from '../data/tricks';
import { sampleTrick } from '../three/tricks/TrickPrimitives';

const neutral = (): TrickPose => ({
  time: 0, progress: 0, phase: 'Start', position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0,
  steering: 0, tailwhip: 0, frontCompression: .04, rearCompression: .04,
  wheelAngle: 0, crankAngle: 0, bodyShift: [0, 0, 0], crouch: 0,
  handRelease: [0, 0], footRelease: [0, 0], handStyle: 'spread', footStyle: 'spread',
  grounded: true, frontContact: true, rearContact: true, pivot: 'center', speed: 0, impact: 0,
});

describe('bike suspension kinematics', () => {
  it('maintains the rigid swingarm radius across the full travel', () => {
    for (let i = -10; i <= 160; i++) expect(rearAxleAt(i / 1000).distanceTo(BIKE.rearPivot)).toBeCloseTo(BIKE.rearArmLength, 12);
  });

  it('preserves the fixed four-bar connecting link at all travel positions', () => {
    const z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= 140; i++) {
      const rockerEnd = ROCKER_END.clone().applyAxisAngle(z, rockerAngleAt(i / 1000)).add(ROCKER_PIVOT);
      const armEnd = new THREE.Vector3(-.105, .15, 0).applyAxisAngle(z, rearArmAngle(i / 1000)).add(BIKE.rearPivot);
      expect(rockerEnd.distanceTo(armEnd)).toBeCloseTo(PUSHROD_LENGTH, 10);
    }
  });

  it('moves the fork along its inclined steering axis and clamps travel', () => {
    const displacement = frontAxleAt(.15).sub(frontAxleAt(0));
    expect(displacement.length()).toBeCloseTo(.15, 10);
    expect(displacement.normalize().dot(STEERING_AXIS)).toBeCloseTo(1, 10);
    expect(frontAxleAt(4).distanceTo(frontAxleAt(.15))).toBe(0);
    expect(rearAxleAt(-5).distanceTo(rearAxleAt(0))).toBe(0);
    expect(rearAxleAt(4).distanceTo(rearAxleAt(.14))).toBe(0);
  });

  it('places both wheels on the calibrated ground at sag', () => {
    const bike = new BikeRig();
    const contacts = bike.getContacts();
    expect(contacts.front.y).toBeCloseTo(bike.wheelRadius, 10);
    expect(contacts.rear.y).toBeCloseTo(bike.wheelRadius, 10);
    expect(contacts.front.x - contacts.rear.x).toBeCloseTo(1.2, 10);
    bike.dispose();
  });
});

describe('bike and rider articulation', () => {
  it('steering moves the front wheel and hands independently of the frame', () => {
    const bike = new BikeRig();
    const baseline = bike.getContacts();
    bike.apply({ ...neutral(), steering: Math.PI / 2 });
    const turned = bike.getContacts();
    expect(turned.rear.distanceTo(baseline.rear)).toBeLessThan(1e-10);
    expect(turned.front.distanceTo(baseline.front)).toBeGreaterThan(.02);
    expect(bike.framePivot.quaternion.w).toBe(1);
    bike.dispose();
  });

  it('tailwhip pivots only the frame and rear around the inclined head axis', () => {
    const bike = new BikeRig();
    const baseline = bike.getContacts();
    const grips = bike.getAnchors().hands;
    bike.apply({ ...neutral(), tailwhip: Math.PI });
    expect(bike.getContacts().front.distanceTo(baseline.front)).toBeLessThan(1e-10);
    expect(bike.getContacts().rear.distanceTo(baseline.rear)).toBeGreaterThan(.7);
    expect(bike.getAnchors().hands[0].distanceTo(grips[0])).toBeLessThan(1e-10);
    bike.dispose();
  });

  it('solves two-bone IK with constant segment lengths', () => {
    const start = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(.3, .6, .1);
    const solved = solveTwoBone(start, target, new THREE.Vector3(-.2, .8, .3), .305, .29);
    expect(solved.end.distanceTo(target)).toBeLessThan(1e-10);
    expect(solved.joint.distanceTo(start)).toBeCloseTo(.305, 10);
    expect(solved.joint.distanceTo(solved.end)).toBeCloseTo(.29, 10);
  });

  it('keeps normal contacts, then releases both hands and feet intentionally', () => {
    const bike = new BikeRig();
    const rider = new RiderRig();
    const anchors = bike.getAnchors();
    rider.apply(neutral(), anchors);
    for (let i = 0; i < 2; i++) {
      expect(rider.debugData.hands[i].distanceTo(anchors.hands[i])).toBeLessThan(1e-8);
      expect(rider.debugData.feet[i].distanceTo(anchors.feet[i])).toBeLessThan(1e-8);
    }
    rider.apply({ ...neutral(), handRelease: [1, 1], footRelease: [1, 1] }, anchors);
    for (let i = 0; i < 2; i++) {
      expect(rider.debugData.hands[i].distanceTo(anchors.hands[i])).toBeGreaterThan(.3);
      expect(rider.debugData.feet[i].distanceTo(anchors.feet[i])).toBeGreaterThan(.3);
    }
    expect(rider.debugData.handContacts).toEqual([false, false]);
    expect(rider.debugData.footContacts).toEqual([false, false]);
    bike.dispose(); rider.dispose();
  });

  it('keeps transforms finite and neutral reset deterministic after extreme poses', () => {
    const bike = new BikeRig();
    const rider = new RiderRig();
    const first = bike.getAnchors();
    for (let i = 0; i < 30; i++) {
      const p = { ...neutral(), steering: i, tailwhip: i, frontCompression: i / 100, rearCompression: i / 120, roll: Math.sin(i), crankAngle: i, wheelAngle: i * 2 };
      bike.apply(p); rider.apply(p, bike.getAnchors());
      for (const root of [bike.root, rider.root]) root.traverse((node) => expect([...node.position.toArray(), ...node.scale.toArray(), ...node.quaternion.toArray()].every(Number.isFinite)).toBe(true));
    }
    bike.apply(neutral());
    expect(bike.getAnchors().feet[0].distanceTo(first.feet[0])).toBeLessThan(1e-10);
    expect(REAR_REST.length()).toBeCloseTo(BIKE.rearArmLength, 10);
    bike.dispose(); rider.dispose();
  });

  it('maintains every held hand and foot across all active trick phases', () => {
    const bike = new BikeRig();
    const rider = new RiderRig();
    for (const trick of TRICKS.filter((t) => t.status !== 'unavailable')) {
      for (let i = 0; i <= 24; i++) {
        const pose = sampleTrick(trick, trick.duration * i / 24);
        bike.apply(pose);
        const anchors = bike.getAnchors();
        rider.apply(pose, anchors);
        for (let limb = 0; limb < 2; limb++) {
          if (pose.handRelease[limb] < .001) expect(rider.debugData.hands[limb].distanceTo(anchors.hands[limb]), `${trick.nameEn} hand ${limb} p=${i / 24}`).toBeLessThan(.01);
          if (pose.footRelease[limb] < .001) expect(rider.debugData.feet[limb].distanceTo(anchors.feet[limb]), `${trick.nameEn} foot ${limb} p=${i / 24}`).toBeLessThan(.01);
        }
      }
    }
    bike.dispose(); rider.dispose();
  });

  it('extends both knees behind the body during Superman', () => {
    const bike = new BikeRig();
    const rider = new RiderRig();
    const trick = TRICKS.find((t) => t.id === 'superman')!;
    const pose = sampleTrick(trick, trick.duration * .5);
    bike.apply(pose); rider.apply(pose, bike.getAnchors());
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const hip = rider.debugData.pelvis.clone().add(new THREE.Vector3(0, -.025, side * .105));
      const thigh = rider.debugData.knees[i].clone().sub(hip).normalize();
      const shin = rider.debugData.feet[i].clone().sub(rider.debugData.knees[i]).normalize();
      expect(thigh.dot(shin)).toBeGreaterThan(.96);
      expect(rider.debugData.feet[i].x).toBeLessThan(hip.x - .8);
    }
    bike.dispose(); rider.dispose();
  });

  it('routes Can-Can above the frame and Nac-Nac behind the saddle before crossing', () => {
    const bike = new BikeRig(), rider = new RiderRig(), anchors = bike.getAnchors();
    const pose = { ...neutral(), footRelease: [1, 0] as [number, number], footMotionPhase: .22 };
    rider.apply({ ...pose, footMotion: 'can-can' }, anchors);
    expect(rider.debugData.feet[0].y).toBeGreaterThan(.95);
    expect(rider.debugData.feet[0].x).toBeGreaterThan(-.3);
    expect(rider.debugData.feet[1].distanceTo(anchors.feet[1])).toBeLessThan(.01);
    rider.apply({ ...pose, footMotion: 'nac-nac' }, anchors);
    expect(rider.debugData.feet[0].x).toBeLessThan(-.65);
    expect(rider.debugData.feet[0].y).toBeGreaterThan(.95);
    rider.apply({ ...pose, footMotion: 'can-can', footMotionPhase: .5 }, anchors);
    expect(rider.debugData.feet[0].z).toBeLessThan(-.5);
    expect(rider.debugData.feet[1].distanceTo(anchors.feet[1])).toBeLessThan(.01);
    bike.dispose(); rider.dispose();
  });

  it('crosses Indian Air feet behind the hips and swings Pendulum to both sides above the saddle', () => {
    const bike = new BikeRig(), rider = new RiderRig(), anchors = bike.getAnchors();
    const pose = { ...neutral(), footRelease: [1, 1] as [number, number], footMotionPhase: .5 };
    rider.apply({ ...pose, footMotion: 'indian' }, anchors);
    expect(rider.debugData.feet[0].x).toBeLessThan(rider.debugData.hips[0].x - .75);
    expect(rider.debugData.feet[0].z).toBeLessThan(rider.debugData.feet[1].z);
    rider.apply({ ...pose, footMotion: 'pendulum', footMotionPhase: .33 }, anchors);
    expect(Math.min(...rider.debugData.feet.map((foot) => foot.z))).toBeGreaterThan(.4);
    rider.apply({ ...pose, footMotion: 'pendulum', footMotionPhase: .67 }, anchors);
    expect(Math.max(...rider.debugData.feet.map((foot) => foot.z))).toBeLessThan(-.4);
    rider.apply({ ...pose, footMotion: 'pendulum', footMotionPhase: .5 }, anchors);
    expect(Math.min(...rider.debugData.feet.map((foot) => foot.y))).toBeGreaterThan(anchors.seat.y + .03);
    rider.root.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(Array.from(object.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
    });
    bike.dispose(); rider.dispose();
  });
});
