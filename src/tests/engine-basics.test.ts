import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TRICKS } from '../data/tricks';
import { BIKE, frontAxleAt, rearAxleAt, STEERING_AXIS } from '../three/bike/kinematics';
import { PhysicsWorld } from '../three/physics/PhysicsWorld';
import { resolveGroundPose, wheelSupportOffset } from '../three/physics/groundSupport';
import { sampleTrick } from '../three/tricks/TrickPrimitives';
import { BASIC_DURATIONS, basicMotionTiming } from '../three/tricks/BasicMotion';
import { TrickPlayer } from '../three/tricks/TrickPlayer';
import type { Trick, TrickPose } from '../types';

beforeAll(async () => { await PhysicsWorld.create(); });
const flying = ['Bunny Hop', 'American Bunny Hop', 'English Bunny Hop', 'Jump', 'Drop', 'Whip', 'Tabletop'];
const trickByName = (name: string) => TRICKS.find(t => t.nameEn === name)!;
function actual(trick: Trick, pose: TrickPose) {
  const local = {
    front: frontAxleAt(pose.frontCompression).sub(BIKE.steeringPivot).applyAxisAngle(STEERING_AXIS, pose.steering).add(BIKE.steeringPivot),
    rear: rearAxleAt(pose.rearCompression),
  };
  const transform = resolveGroundPose(pose, local, trick.scene, BIKE.wheelRadius);
  return {
    root: transform.position,
    rotation: transform.quaternion,
    front: local.front.clone().applyQuaternion(transform.quaternion).add(transform.position),
    rear: local.rear.clone().applyQuaternion(transform.quaternion).add(transform.position),
  };
}

describe('basic riding in physical seconds', () => {
  it('keeps roots, both axles and rider posture continuous at phase boundaries', () => {
    const rows = flying.map(name => {
      const trick = trickByName(name), timing = basicMotionTiming(trick);
      const events = ['frontOff', 'takeoff', 'landing', 'bothWheels', 'stop'] as const;
      const jumps = events.map(event => {
        const time = timing[event];
        const p = sampleTrick(trick, time - .00001), q = sampleTrick(trick, time + .00001);
        const a = actual(trick, p), b = actual(trick, q);
        return { event, rootJump: a.root.distanceTo(b.root), frontJump: a.front.distanceTo(b.front), rearJump: a.rear.distanceTo(b.rear), bodyJump: new Vector3(...p.bodyShift).distanceTo(new Vector3(...q.bodyShift)), crouchJump: Math.abs(p.crouch - q.crouch) };
      });
      return { name, timing, jumps };
    });
    for (const row of rows) {
      for (const jump of row.jumps) {
        for (const key of ['rootJump', 'frontJump', 'rearJump', 'bodyJump', 'crouchJump'] as const) {
          expect(jump[key], `${row.name} ${jump.event} ${key}`).toBeLessThan(.005);
        }
      }
      expect(row.timing.physicalAirtime).toBeLessThan(1);
      expect(row.timing.speed).toBeGreaterThanOrEqual(2.5);
    }
  });
  it('keeps lightweight timeline annotations synchronized with final physical flight', () => {
    for (const name of flying) {
      const trick = trickByName(name), timing = basicMotionTiming(trick), phase = trick.phases.find(p => p.name === 'Lot')!;
      expect(Math.abs(phase.start * trick.duration - timing.takeoff)).toBeLessThan(1 / 120);
      expect(Math.abs(phase.end * trick.duration - timing.landing)).toBeLessThan(1 / 120);
      const release = trick.phases.find(p => p.name === 'Przód / wybicie tyłu');
      if (release) expect(Math.abs(release.start * trick.duration - timing.frontOff)).toBeLessThan(1 / 120);
    }
  });
  it('keeps every declared basic ground contact on the tyre surface', () => {
    for (const trick of TRICKS.filter(t => t.id in BASIC_DURATIONS)) {
      for (let i = 0; i <= 240; i++) {
        const pose = sampleTrick(trick, trick.duration * i / 240), world = actual(trick, pose);
        for (const wheel of ['front', 'rear'] as const) {
          if (pose[`${wheel}Contact`]) {
            const error = wheelSupportOffset(world[wheel], world.rotation, trick.scene, BIKE.wheelRadius);
            expect(Math.abs(error), `${trick.nameEn} ${wheel} @${pose.time.toFixed(3)}: ${error}`).toBeLessThan(.012);
          }
        }
      }
    }
  });
  it('keeps both tyres clear of terrain throughout flight and the contact handover', () => {
    for (const name of flying) {
      const trick = trickByName(name), timing = basicMotionTiming(trick);
      for (let i = 0; i <= 160; i++) {
        const time = timing.frontOff + (timing.landing + .15 - timing.frontOff) * i / 160;
        const pose = sampleTrick(trick, time), world = actual(trick, pose);
        for (const wheel of ['front', 'rear'] as const) {
          const penetration = wheelSupportOffset(world[wheel], world.rotation, trick.scene, BIKE.wheelRadius);
          expect(penetration, `${name} ${wheel} @${time.toFixed(3)}`).toBeLessThan(.012);
        }
      }
    }
  });
  it('connects the tyre tangents to the real ramp lip before physical takeoff', () => {
    const normal = new Vector3(-.6, 1, 0).normalize();
    for (const name of ['Jump', 'Tabletop', 'Whip']) {
      const trick = trickByName(name), timing = basicMotionTiming(trick);
      const first = actual(trick, sampleTrick(trick, timing.frontOff - .000001));
      const last = actual(trick, sampleTrick(trick, timing.takeoff - .000001));
      expect(first.front.clone().addScaledVector(normal, -BIKE.wheelRadius).x, name).toBeCloseTo(-1, 2);
      expect(last.rear.clone().addScaledVector(normal, -BIKE.wheelRadius).x, name).toBeCloseTo(-1, 2);
      expect(last.rear.clone().addScaledVector(normal, -BIKE.wheelRadius).y, name).toBeCloseTo(.42, 2);
      expect(sampleTrick(trick, timing.takeoff - .000001).rearContact).toBe(true);
      expect(sampleTrick(trick, timing.takeoff + .000001).grounded).toBe(false);
    }
  });
  it('drops under gravity without a launch impulse and keeps the pedals attached', () => {
    const trick = trickByName('Drop'), timing = basicMotionTiming(trick), h = 1 / 60;
    const a = sampleTrick(trick, timing.takeoff + .1), b = sampleTrick(trick, timing.takeoff + .1 + h), c = sampleTrick(trick, timing.takeoff + .1 + h * 2);
    expect(a.position[1]).toBeLessThan(timing.launchY);
    expect((c.position[1] - 2 * b.position[1] + a.position[1]) / h ** 2).toBeCloseTo(-9.81, 1);
    expect(a.footRelease).toEqual([0, 0]);
    expect(sampleTrick(trick, timing.takeoff - .2).frontCompression).toBeLessThan(.05);
  });
  it('brakes to a fixed front contact during a stoppie and rolls manuals forward without slip', () => {
    const stoppie = trickByName('Stoppie / Endo');
    const a = actual(stoppie, sampleTrick(stoppie, 1.05)), b = actual(stoppie, sampleTrick(stoppie, 2.1));
    expect(a.front.x).toBeCloseTo(b.front.x, 6);
    expect(a.front.y).toBeCloseTo(BIKE.wheelRadius, 5);
    expect(sampleTrick(stoppie, 1.3).speed).toBe(0);
    for (const name of ['Manual', 'Wheelie']) {
      const trick = trickByName(name), p = sampleTrick(trick, 1.1), q = sampleTrick(trick, 1.9);
      const distance = actual(trick, q).rear.x - actual(trick, p).rear.x;
      expect(distance).toBeGreaterThan(1.9);
      expect((q.wheelAngle - p.wheelAngle) * BIKE.wheelRadius).toBeCloseTo(distance, 6);
      expect(p.frontWheelAngle).not.toBeUndefined();
    }
  });
  it('keeps basic playback and direct seeking identical across frame rates', () => {
    for (const trick of TRICKS.filter(t => t.id in BASIC_DURATIONS)) {
      const sample = (fps: number) => { const player = new TrickPlayer(trick); player.restart(); for (let i = 0; i < fps * 1.5; i++) player.update(1 / fps); return player.sample(); };
      const a = sample(30), b = sample(144), seek = sampleTrick(trick, 1.5);
      for (let i = 0; i < 3; i++) { expect(a.position[i]).toBeCloseTo(b.position[i], 7); expect(a.position[i]).toBeCloseTo(seek.position[i], 7); }
      expect(a.pitch).toBeCloseTo(b.pitch, 7); expect(a.crouch).toBeCloseTo(b.crouch, 7);
    }
  });
});
