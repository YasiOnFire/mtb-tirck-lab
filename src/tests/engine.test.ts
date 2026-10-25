import { beforeAll, describe, expect, it } from 'vitest';
import { TRICKS, CATEGORIES, REQUIRED_TRICKS, normalizeSearch } from '../data/tricks';
import { sampleTrick } from '../three/tricks/TrickPrimitives';
import { TrickPlayer } from '../three/tricks/TrickPlayer';
import { FIXED_DT, PhysicsWorld, SuspensionSpring, getFlightTrack, landingCompression } from '../three/physics/PhysicsWorld';
import { WALL_Z, heightAt } from '../three/tricks/terrain';
import { basicMotionTiming } from '../three/tricks/BasicMotion';
import type { TrickPose } from '../types';

const trick = (name: string) => TRICKS.find(t => t.nameEn === name)!;
const pose = (name: string, p: number) => { const t = trick(name); return sampleTrick(t, t.duration * p); };
const basicApex = (name: string) => { const t = trick(name); return sampleTrick(t, basicMotionTiming(t).apex); };
const numbers = (value: unknown): number[] => typeof value === 'number' ? [value] : Array.isArray(value) ? value.flatMap(numbers) : typeof value === 'object' && value !== null ? Object.values(value).flatMap(numbers) : [];

beforeAll(async () => { await PhysicsWorld.create(); });

describe('atlas and implementation claims', () => {
  it('preserves all 110 unique names, ids, descriptions and exact five categories', () => {
    expect(TRICKS).toHaveLength(110);
    expect(new Set(TRICKS.map(t => t.id)).size).toBe(110);
    expect(new Set(TRICKS.map(t => t.nameEn)).size).toBe(110);
    expect(CATEGORIES).toHaveLength(5);
    expect(CATEGORIES.map(category => TRICKS.filter(t => t.category === category).length)).toEqual([15, 30, 23, 26, 16]);
    expect(TRICKS.every(t => t.descriptionPl.length > 12 && t.spokenEn && t.note && t.phases.length)).toBe(true);
  });
  it('keeps every required representative available and avoids unearned verified labels', () => {
    expect(REQUIRED_TRICKS).toHaveLength(20);
    for (const name of REQUIRED_TRICKS) expect(trick(name).status, name).not.toBe('unavailable');
    expect(TRICKS.some(t => t.status === 'verified')).toBe(false);
    expect(trick('Twister').status).toBe('unavailable');
    expect(trick('Twister').note).toContain('niejednoznaczna');
  });
  it('uses only provided established Polish names and searches without diacritics', () => {
    expect(TRICKS.filter(t => t.namePl).map(t => t.nameEn)).toEqual(['Backflip', 'Frontflip']);
    expect(normalizeSearch('ŁĄCZNOŚĆ / ŻÓŁĆ')).toBe('lacznosc / zolc');
    expect(normalizeSearch('SALTO W TYŁ')).toContain('salto w tyl');
  });
  it('keeps unavailable tricks in a stationary neutral inspection pose', () => {
    for (const t of TRICKS.filter(t => t.status === 'unavailable')) {
      const p = sampleTrick(t, t.duration * .5);
      expect(p.position).toEqual([0, 0, 0]);
      expect(p.speed).toBe(0);
      expect(p.grounded).toBe(true);
    }
  });
});

describe('distinct mechanics and axis conventions', () => {
  it('rotates 360 around Y; backflip and frontflip around Z with opposite signs', () => {
    const spin = pose('360', .51), back = pose('Backflip', .51), front = pose('Frontflip', .51);
    expect(spin.yaw).toBeCloseTo(Math.PI, 1);
    expect(Math.abs(spin.pitch)).toBeLessThan(.4);
    expect(back.pitch).toBeGreaterThan(3);
    expect(front.pitch).toBeLessThan(-3);
    expect(back.yaw).toBe(0);
    expect(front.yaw).toBe(0);
  });
  it('tabletop uses roll with a body countershift, whip uses temporary yaw', () => {
    const table = basicApex('Tabletop'), whip = basicApex('Whip');
    expect(table.roll).toBeLessThan(-1.1);
    expect(Math.abs(table.steering)).toBeLessThan(Math.PI / 4);
    expect(Math.abs(table.bodyShift[2])).toBeGreaterThan(.2);
    expect(whip.yaw).toBeGreaterThan(.8);
    expect(pose('Whip', .76).yaw).toBe(0);
  });
  it('barspin releases both hands before independent steering rotation, then catches', () => {
    const ready = pose('Barspin', .28 + .22 * .46);
    const active = pose('Barspin', .51);
    const caught = pose('Barspin', .74);
    expect(ready.handRelease[0]).toBeCloseTo(1, 5);
    expect(ready.steering).toBe(0);
    expect(active.steering).toBeGreaterThan(2.5);
    expect(active.yaw).toBe(0);
    expect(caught.handRelease).toEqual([0, 0]);
    expect(caught.steering).toBeCloseTo(2 * Math.PI);
  });
  it('tailwhip rotates frame independently and releases both feet', () => {
    const t = pose('Tailwhip', .51);
    expect(t.tailwhip).toBeCloseTo(Math.PI, 2);
    expect(t.yaw).toBe(0);
    expect(t.steering).toBe(0);
    expect(t.footRelease).toEqual([1, 1]);
  });
  it('release counts and reattachment match the trick names', () => {
    const rows = [['One Hander', [1, 0], [0, 0]], ['No Hander', [1, 1], [0, 0]], ['One Footer', [0, 0], [1, 0]], ['No Footer', [0, 0], [1, 1]], ['Nothing', [1, 1], [1, 1]]] as const;
    for (const [name, hands, feet] of rows) {
      expect(pose(name, .51).handRelease, name).toEqual(hands);
      expect(pose(name, .51).footRelease, name).toEqual(feet);
      expect(pose(name, .8).handRelease, name).toEqual([0, 0]);
      expect(pose(name, .8).footRelease, name).toEqual([0, 0]);
    }
  });
  it('wheelie pedals; manual does not; stoppie and nose manual pivot at the front', () => {
    const w = pose('Wheelie', .5), m = pose('Manual', .5), s = pose('Stoppie / Endo', .5), n = pose('Nose Manual', .5);
    expect(w.pivot).toBe('rear'); expect(m.pivot).toBe('rear');
    expect(w.crankAngle).not.toBe(0); expect(m.crankAngle).toBe(0);
    expect(w.frontContact).toBe(false); expect(m.rearContact).toBe(true);
    expect(s.pivot).toBe('front'); expect(n.pivot).toBe('front');
    expect(s.pitch).toBeLessThan(0); expect(n.rearContact).toBe(false);
    expect(s.speed).toBe(0); expect(n.speed).toBeGreaterThan(0);
  });
  it('American hop lifts front first while English hop stays level at preload', () => {
    const american = trick('American Bunny Hop'), english = trick('English Bunny Hop');
    const raised = sampleTrick(american, basicMotionTiming(american).takeoff - .03);
    expect(raised.frontContact).toBe(false);
    expect(raised.rearContact).toBe(true);
    expect(raised.pitch).toBeGreaterThan(.3);
    expect(Math.abs(sampleTrick(english, basicMotionTiming(english).takeoff - .03).pitch)).toBeLessThan(.01);
    expect(basicApex('Bunny Hop').grounded).toBe(false);
  });
  it('wallride reaches actual wall plane after COM rotation, ledge touches its elevated edge', () => {
    const w = pose('Wallride', .5);
    const axleZ = w.position[2] + (.37 - .8) * Math.sin(w.roll);
    expect(axleZ + .37).toBeCloseTo(WALL_Z, 5);
    expect(w.roll).toBeCloseTo(-Math.PI / 2);
    expect(w.frontContact).toBe(true);
    const l = pose('Abubaca', .5);
    expect(l.position[1]).toBeCloseTo(.48);
    expect(l.rearContact).toBe(true);
    expect(l.frontContact).toBe(false);
    expect(l.position[0] - .6).toBeGreaterThan(0);
    expect(pose('Abubaca', .9).position[0]).toBeLessThan(0);
  });
  it('terrain techniques use matching terrain and appropriate orientations', () => {
    expect(trick('Pumping').scene).toBe('rollers');
    expect(trick('Rock Garden').scene).toBe('rocks');
    expect(heightAt('rollers', 0)).toBeGreaterThan(.2);
    expect(heightAt('rocks', .39, .1)).toBeGreaterThan(.2);
    expect(pose('Flat Cornering', .5).roll).not.toBe(0);
    expect(pose('Drop', .12).position[1]).toBeCloseTo(.62);
    expect(pose('Drop', .8).position[1]).toBe(0);
  });
  it('initiates whip before the lip then opposes bike yaw with torso and countersteer', () => {
    const t = trick('Whip'), timing = basicMotionTiming(t);
    const takeoff = sampleTrick(t, timing.takeoff - .005), apex = basicApex('Whip'), recovered = sampleTrick(t, timing.landing - .03);
    expect(takeoff.yaw).toBeGreaterThan(.1); expect(takeoff.steering).toBeGreaterThan(0);
    expect(apex.steering).toBeLessThan(0); expect(apex.bodyYaw).toBeLessThan(0);
    expect(Math.abs(apex.yaw + (apex.bodyYaw ?? 0))).toBeLessThan(apex.yaw * .3);
    expect(Math.abs(recovered.yaw)).toBeLessThan(.02);
  });
  it('hops preserve front lift through takeoff and scoop the rear before leveling', () => {
    const t = trick('American Bunny Hop'), timing = basicMotionTiming(t);
    const before = sampleTrick(t, timing.takeoff - .00001), after = sampleTrick(t, timing.takeoff + .00001), scoop = sampleTrick(t, timing.takeoff + .4 * timing.physicalAirtime);
    expect(Math.abs(before.pitch - after.pitch)).toBeLessThan(.001);
    expect(before.pivot).toBe('rear'); expect(after.grounded).toBe(false);
    expect(after.pitch).toBeGreaterThan(scoop.pitch); expect(scoop.crouch).toBeGreaterThan(.4);
    const english = trick('English Bunny Hop');
    expect(Math.abs(sampleTrick(english, basicMotionTiming(english).takeoff + .00001).pitch)).toBeLessThan(.01);
  });
  it('new leg tricks have explicit independent paths and reattach before landing', () => {
    const rows = [['Can-Can', 'can-can', 1], ['No Foot Can-Can', 'can-can', 2], ['Nac-Nac', 'nac-nac', 1], ['Indian Air', 'indian', 2], ['Pendulum', 'pendulum', 2]] as const;
    for (const [name, motion, feet] of rows) {
      const p = pose(name, .51);
      expect(trick(name).status, name).not.toBe('unavailable');
      expect(p.footMotion, name).toBe(motion);
      expect(p.footMotionPhase).toBeCloseTo(.5);
      expect(p.footRelease, name).toEqual(feet === 2 ? [1, 1] : [1, 0]);
      expect(pose(name, .74).footRelease, name).toEqual([0, 0]);
    }
    expect(pose('Lookback', .51).bodyYaw).toBeGreaterThan(1);
    const turn = pose('Turndown', .51);
    expect(turn.steering).toBeGreaterThan(2); expect(turn.footRelease).toEqual([0, 0]);
    expect(turn.crankAngle).toBeCloseTo(Math.PI / 2);
  });
  it('Fufanu turns before a forward return; Up to Rear stays on the raised platform', () => {
    const turning = pose('Fufanu', .57), exit = pose('Fufanu', .85), up = pose('Up to Rear', .5), settled = pose('Up to Rear', .9);
    expect(turning.rearContact).toBe(true); expect(turning.frontContact).toBe(false);
    expect(turning.yaw).toBeGreaterThan(0); expect(turning.yaw).toBeLessThan(Math.PI);
    expect(exit.yaw).toBeCloseTo(Math.PI); expect(exit.position[0]).toBeLessThan(turning.position[0]);
    expect(up.rearContact).toBe(true); expect(up.frontContact).toBe(false); expect(up.position[1]).toBeCloseTo(.48);
    expect(settled.frontContact && settled.rearContact).toBe(true); expect(settled.position[0]).toBeCloseTo(.8);
    expect(settled.pitch).toBe(0); expect(settled.position[1]).toBeCloseTo(.48);
  });
  it('wheels retain a smoothly damped angular velocity in flight without angle jumps', () => {
    const jump = trick('Jump'), timing = basicMotionTiming(jump);
    const speed = (q: number) => { const time = timing.takeoff + q * timing.physicalAirtime; return (sampleTrick(jump, time + .0001).wheelAngle - sampleTrick(jump, time - .0001).wheelAngle) / .0002; };
    expect(speed(.25)).toBeGreaterThan(speed(.75));
    for (const boundary of [timing.takeoff, timing.landing]) {
      expect(Math.abs(sampleTrick(jump, boundary + .00001).wheelAngle - sampleTrick(jump, boundary - .00001).wheelAngle)).toBeLessThan(.001);
    }
    for (const name of ['180', 'Half Cab']) for (const boundary of [.28, .74]) {
      expect(Math.abs(pose(name, boundary + .00001).wheelAngle - pose(name, boundary - .00001).wheelAngle), `${name} ${boundary}`).toBeLessThan(.001);
    }
  });
});

describe('deterministic playback and robustness', () => {
  it('produces finite transforms within suspension limits across every active track', () => {
    for (const t of TRICKS) for (let i = 0; i <= 100; i++) {
      const p = sampleTrick(t, t.duration * i / 100);
      expect(numbers(p).every(Number.isFinite), `${t.nameEn} at ${i}%`).toBe(true);
      expect(p.frontCompression).toBeGreaterThanOrEqual(0); expect(p.frontCompression).toBeLessThanOrEqual(.15);
      expect(p.rearCompression).toBeGreaterThanOrEqual(0); expect(p.rearCompression).toBeLessThanOrEqual(.14);
    }
  });
  it('returns flight releases and suspension to neutral at the end', () => {
    for (const t of TRICKS.filter(t => t.family === 'flight')) {
      const p = sampleTrick(t, t.duration);
      expect(p.handRelease, t.nameEn).toEqual([0, 0]); expect(p.footRelease, t.nameEn).toEqual([0, 0]);
      expect(p.roll, t.nameEn).toBeCloseTo(0); expect(p.frontCompression).toBe(.0405); expect(p.rearCompression).toBe(.0378);
      expect(p.speed).toBe(0); expect(p.grounded).toBe(true);
      expect(Math.sin(p.pitch), t.nameEn).toBeCloseTo(0, 5);
    }
  });
  it('seek is independent of the preceding trick or simulation history', () => {
    const player = new TrickPlayer(trick('Backflip'));
    const expected = player.seek(4);
    player.select(trick('No Footer')); player.update(1.5);
    player.select(trick('Backflip'));
    expect(player.seek(4)).toEqual(expected);
  });
  it('pause, loop, restart and switching unavailable tracks work', () => {
    const player = new TrickPlayer(trick('Wheelie'));
    player.restart(); player.update(3); player.playing = false;
    expect(player.update(2).time).toBe(3);
    player.playing = true; player.update(6); expect(player.time).toBeCloseTo(9 % trick('Wheelie').duration);
    player.loop = false; player.update(20); expect(player.time).toBe(trick('Wheelie').duration); expect(player.playing).toBe(false);
    player.restart(); expect(player.time).toBe(0);
    player.select(trick('Twister')); expect(player.playing).toBe(false); expect(player.update(1).time).toBe(0);
  });
  it('playback agrees across frame rates with deterministic sampling', () => {
    const sampleAt = (fps: number): TrickPose => {
      const player = new TrickPlayer(trick('Backflip Barspin')); player.restart();
      for (let i = 0; i < fps * 4; i++) player.update(1 / fps);
      return player.sample();
    };
    const a = sampleAt(30), b = sampleAt(144);
    expect(a.pitch).toBeCloseTo(b.pitch, 8); expect(a.steering).toBeCloseTo(b.steering, 8);
    expect(a.position[1]).toBeCloseTo(b.position[1], 8);
  });
});

describe('Rapier flight and spring response', () => {
  it('uses dynamic gravity and real collision impulse in its cached trajectory', () => {
    const track = getFlightTrack(1.2, .2, .2);
    expect(track.physical).toBe(true);
    expect(track.duration).toBeGreaterThan(.8); expect(track.duration).toBeLessThan(1.2);
    expect(track.impulse).toBeGreaterThan(100);
    expect(track.peak).toBeGreaterThan(1.3); expect(track.peak).toBeLessThan(1.5);
    expect(track.samples.at(-1)?.contact).toBe(true);
    expect(track.samples[12].velocityY).toBeLessThan(track.samples[0].velocityY);
    expect(getFlightTrack(1.2, .2, .2)).toBe(track);
  });
  it('spring reacts to impact, respects travel and damps to sag', () => {
    const spring = new SuspensionSpring(.15);
    spring.impulse(110);
    let maximum = 0;
    for (let i = 0; i < 600; i++) maximum = Math.max(maximum, spring.step(FIXED_DT));
    expect(maximum).toBeGreaterThan(spring.sag + .02); expect(maximum).toBeLessThanOrEqual(.15);
    expect(spring.state.compression).toBeCloseTo(spring.sag, 5);
    expect(landingCompression(.07, 500, true)).toBeGreaterThan(landingCompression(.07, 100, true));
  });
});
