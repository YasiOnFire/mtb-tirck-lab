import type { Trick, TrickPose } from '../../types';
import { sampleBasicMotion } from './BasicMotion';
import { landingCompression, sampleFlight } from '../physics/PhysicsWorld';
import { clamp, smooth, heightAt, terrainPitch, wheelGroundHeight, WALL_Z, LEDGE_HEIGHT } from './terrain';

const TAU = Math.PI * 2;
export const FLIGHT_START = .28;
export const FLIGHT_END = .74;
const TAKEOFF_X = -1.6;
const LANDING_X = 1.8;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const windowPulse = (p: number, start: number, full: number, release: number, end: number): number => smooth((p - start) / (full - start)) * (1 - smooth((p - release) / (end - release)));

function flightGroundHeight(trick: Trick, x: number): number {
  const pitch = terrainPitch(trick.scene, x);
  return Math.max(...[-.6, .6].map(axleX => {
    const worldX = x + axleX * Math.cos(pitch) + .43 * Math.sin(pitch);
    const axleY = .8 + axleX * Math.sin(pitch) - .43 * Math.cos(pitch);
    return heightAt(trick.scene, worldX) + .37 - axleY;
  }));
}

export function neutralPose(trick: Trick, time = 0): TrickPose {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, trick.duration);
  const p = t / trick.duration;
  return {
    time: t, progress: p, phase: trick.phases.find(phase => p >= phase.start && p < phase.end)?.name ?? 'Podgląd',
    position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, steering: 0, tailwhip: 0,
    frontCompression: .0405, rearCompression: .0378, wheelAngle: 0, crankAngle: 0,
    bodyShift: [0, 0, 0], crouch: 0, bodyYaw: 0, footMotionPhase: 0, handRelease: [0, 0], footRelease: [0, 0],
    handStyle: 'spread', footStyle: 'spread', grounded: true, frontContact: true,
    rearContact: true, pivot: 'center', speed: 0, impact: 0,
  };
}

export function approach(pose: TrickPose, trick: Trick): void {
  const p = Math.min(.94, pose.progress);
  pose.position[0] = lerp(-3.4, 3.4, p / .94);
  pose.position[1] = wheelGroundHeight(trick.scene, pose.position[0]);
  pose.pitch = terrainPitch(trick.scene, pose.position[0]);
  pose.speed = pose.progress < .94 ? 6.8 / (.94 * trick.duration) : 0;
  pose.wheelAngle = (pose.position[0] + 3.4) / .37;
}

export function pedal(pose: TrickPose, amount = 1): void {
  pose.crankAngle = Math.min(pose.time, pose.time / Math.max(.001, pose.progress) * .94) * 2.2 * amount;
}

export function preload(pose: TrickPose, amount: number): void {
  pose.frontCompression = .0405 + .063 * amount;
  pose.rearCompression = .0378 + .065 * amount;
  pose.crouch = .75 * amount;
  pose.bodyShift[1] -= .09 * amount;
}

export function handRelease(pose: TrickPose, count: number, amount: number): void {
  pose.handRelease = [amount, count === 2 ? amount : 0];
}

export function footRelease(pose: TrickPose, count: number, amount: number): void {
  pose.footRelease = [amount, count === 2 ? amount : 0];
}

export function yawSpin(pose: TrickPose, turns: number, amount: number): void { pose.yaw += TAU * turns * smooth(amount); }
export function backFlip(pose: TrickPose, turns: number, amount: number): void { pose.pitch += TAU * turns * smooth(amount); }
export function barspin(pose: TrickPose, turns: number, q: number): void {
  const release = windowPulse(q, .08, .22, .76, .9);
  pose.handRelease = [release, release];
  pose.steering = turns * TAU * smooth((q - .23) / .51);
}
export function tailwhip(pose: TrickPose, turns: number, q: number): void {
  const release = windowPulse(q, .05, .2, .8, .94);
  pose.footRelease = [release, release];
  pose.tailwhip = turns * TAU * smooth((q - .2) / .6);
  pose.bodyShift[1] += .16 * release;
}

export function tabletop(pose: TrickPose, amount: number): void {
  pose.roll = -1.25 * amount;
  pose.bodyShift[2] = -.3 * amount;
  pose.bodyShift[1] += .08 * amount;
  pose.crouch = .64 * amount;
  pose.steering = -.22 * amount;
  pose.bodyYaw = .08 * amount;
}

export function whip(pose: TrickPose, q: number): void {
  const carve = .18 * (1 - smooth(q / .25));
  const extension = windowPulse(q, 0, .35, .55, .91);
  pose.yaw += carve + .9 * extension;
  pose.steering = .17 * (1 - smooth(q / .18)) - .42 * extension;
  pose.roll -= .12 * (1 - smooth(q / .22)) + .28 * extension;
  pose.bodyYaw = -.78 * pose.yaw;
  pose.bodyShift[2] = -.15 * extension;
  pose.bodyShift[0] = -.16 * (1 - smooth(q / .35)) + .12 * windowPulse(q, .35, .6, .75, .97);
}

function flight(pose: TrickPose, trick: Trick): void {
  const p = pose.progress, params = trick.primitives;
  const airborne = p >= FLIGHT_START && p < FLIGHT_END;
  const q = clamp((p - FLIGHT_START) / (FLIGHT_END - FLIGHT_START));
  const first = TAKEOFF_X, last = LANDING_X;
  const startHeight = flightGroundHeight(trick, first), endHeight = flightGroundHeight(trick, last);
  if (p < FLIGHT_START) pose.position[0] = lerp(-3.4, first, p / FLIGHT_START);
  else if (p <= FLIGHT_END) pose.position[0] = lerp(first, last, q);
  else pose.position[0] = lerp(last, 3.4, clamp((p - FLIGHT_END) / (.94 - FLIGHT_END)));
  pose.speed = p >= .94 ? 0 : p < FLIGHT_START ? (first + 3.4) / (FLIGHT_START * trick.duration) : p < FLIGHT_END ? (last - first) / ((FLIGHT_END - FLIGHT_START) * trick.duration) : (3.4 - last) / ((.94 - FLIGHT_END) * trick.duration);
  pose.position[1] = wheelGroundHeight(trick.scene, pose.position[0]);
  pose.pitch = terrainPitch(trick.scene, pose.position[0]);
  const entrySpeed = (first + 3.4) / (FLIGHT_START * trick.duration);
  const flightTime = (FLIGHT_END - FLIGHT_START) * trick.duration;
  const airAngle = (elapsed: number) => entrySpeed / .37 * (1 - Math.exp(-.055 * elapsed)) / .055;
  const takeoffAngle = (first + 3.4) / .37;
  if (p < FLIGHT_START) pose.wheelAngle = (pose.position[0] + 3.4) / .37;
  else if (p < FLIGHT_END) pose.wheelAngle = takeoffAngle + airAngle(q * flightTime);
  else pose.wheelAngle = takeoffAngle + airAngle(flightTime) + (pose.position[0] - last) / .37 * (Math.round((params.yaw ?? 0) * 2) % 2 ? -1 : 1);
  preload(pose, windowPulse(p, .16, .235, .245, FLIGHT_START));
  const profile = sampleFlight(params.height ?? 1, startHeight, endHeight, q);
  if (airborne) {
    pose.position[1] = profile.y;
    pose.grounded = false; pose.frontContact = false; pose.rearContact = false;
    const unweighted = windowPulse(q, 0, .12, .86, 1);
    pose.frontCompression = lerp(.0405, .006, unweighted); pose.rearCompression = lerp(.0378, .005, unweighted);
    pose.pitch = lerp(terrainPitch(trick.scene, first), terrainPitch(trick.scene, last), q) * (params.flip ? 1 - Math.sin(Math.PI * q) : 1);
    if (params.hop && !params.simultaneous) {
      const frontLift = params.sequential ? .42 : .3;
      const scoop = windowPulse(q, .08, .3, .52, .82);
      const initialLift = frontLift * (1 - smooth(q / .4));
      pose.pitch += initialLift - .09 * scoop;
      pose.position[0] += -.6 - (-.6 * Math.cos(initialLift) + .43 * Math.sin(initialLift));
      pose.position[1] += -.43 - (-.6 * Math.sin(initialLift) - .43 * Math.cos(initialLift));
      pose.bodyShift[0] += -.24 * (1 - smooth(q / .3)) + .1 * scoop;
      pose.bodyShift[1] += .07 * (1 - smooth(q / .2)) - .055 * scoop;
      pose.crouch = .48 * scoop;
    }
  }
  if (params.hop && !params.simultaneous && p < FLIGHT_START) {
    const lift = smooth((p - (params.sequential ? .2 : .225)) / (FLIGHT_START - (params.sequential ? .2 : .225)));
    pose.pitch = (params.sequential ? .42 : .3) * lift;
    pose.bodyShift[0] -= .24 * lift;
    pose.bodyShift[1] += .07 * lift;
    if (lift > .01) { pose.pivot = 'rear'; pose.frontContact = false; }
  }
  const hold = windowPulse(q, .12, .32, .63, .86);
  if (params.table) tabletop(pose, hold * params.table);
  if (params.whip) {
    if (p < FLIGHT_START) {
      const carve = smooth((p - .2) / .08);
      pose.yaw += .18 * carve;
      pose.steering += .17 * carve;
      pose.roll -= .12 * carve;
      pose.bodyYaw = -.12 * carve;
      pose.bodyShift[0] -= .16 * carve;
    } else if (airborne) whip(pose, q);
  }
  if (params.yaw) yawSpin(pose, params.yaw, (q - .035) / .93);
  if (params.flip) {
    backFlip(pose, params.flip, q);
    const tuck = windowPulse(q, .03, .19, .57, .83);
    const initiation = windowPulse(p, .19, .265, .3, .4);
    pose.bodyShift[0] -= Math.sign(params.flip) * .12 * initiation;
    pose.crouch = Math.max(pose.crouch, .58 * tuck);
    pose.bodyShift[1] -= .075 * tuck;
  }
  if (params.hands) handRelease(pose, params.hands, hold);
  if (params.feet) footRelease(pose, params.feet, hold);
  if (params.barspin) barspin(pose, params.barspin, q);
  if (params.tailwhip) tailwhip(pose, params.tailwhip, q);
  if (params.seat) { pose.handStyle = 'seat'; pose.handRelease = [hold, 0]; pose.bodyShift[0] -= .09 * hold; }
  if (params.toboggan) pose.steering = -Math.PI / 2 * hold;
  if (params.tuck) { pose.handStyle = 'tuck'; pose.crouch = .65 * hold; pose.bodyShift[0] += .1 * hold; }
  if (params.suicide) { pose.bodyShift[0] -= .25 * hold; pose.bodyShift[1] += .16 * hold; }
  if (params.superman) { pose.footStyle = 'superman'; pose.bodyShift[0] -= .35 * hold; pose.bodyShift[1] += .18 * hold; }
  if (params.xup) { pose.steering = Math.PI * .92 * hold; pose.bodyShift[0] -= .08 * hold; }
  if (params.cancan || params.nacnac || params.indian || params.pendulum) {
    const release = windowPulse(q, .08, .22, .75, .92);
    pose.footMotion = params.cancan ? 'can-can' : params.nacnac ? 'nac-nac' : params.indian ? 'indian' : 'pendulum';
    pose.footMotionPhase = q;
    pose.footRelease = [release, params.feet === 2 ? release : 0];
    pose.bodyShift[1] += .08 * release;
    if (params.indian) { pose.bodyShift[0] -= .27 * release; pose.bodyShift[1] += .1 * release; }
    if (params.nacnac) { pose.bodyYaw = -.3 * hold; pose.bodyShift[0] -= .08 * release; }
    if (params.cancan) pose.bodyYaw = .12 * hold;
  }
  if (params.lookback) {
    pose.bodyYaw = 1.1 * hold;
    pose.steering = .72 * hold;
    pose.bodyShift[0] -= .12 * hold;
    pose.roll = .14 * hold;
  }
  if (params.turndown) {
    pose.footMotion = 'turndown'; pose.footMotionPhase = q;
    pose.crankAngle = Math.PI / 2 * hold;
    pose.steering = 2.1 * hold;
    pose.bodyYaw = .6 * hold;
    pose.bodyShift[0] -= .08 * hold;
    pose.bodyShift[1] += .035 * hold;
    pose.roll = -.25 * hold;
  }
  if (params.crankflip) { pose.footRelease = [hold, hold]; pose.crankAngle = TAU * smooth((q - .3) / .35); }
  if (params.sideways) { pose.position[0] *= .3; pose.position[2] = lerp(-.65, .65, smooth(q)); pose.roll -= .12 * hold; }
  if (params.fakie) {
    pose.position[0] *= -1;
    pose.wheelAngle *= -1;
  }
  if (p >= FLIGHT_END) {
    const dt = (p - FLIGHT_END) * trick.duration;
    pose.frontCompression = landingCompression(dt, profile.impulse, true);
    pose.rearCompression = landingCompression(dt, profile.impulse, false);
    pose.impact = clamp(1 - dt / .25) * profile.impulse / 94;
    pose.crouch = .5 * Math.exp(-dt * 5);
    pose.bodyShift[1] -= .08 * Math.exp(-dt * 4);
  }
  if (p >= .94) {
    pose.frontCompression = .0405; pose.rearCompression = .0378;
    pose.crouch = 0; pose.bodyShift = [0, 0, 0]; pose.impact = 0;
  }
}

function balance(pose: TrickPose, trick: Trick): void {
  const params = trick.primitives, p = pose.progress;
  const amount = params.brief ? windowPulse(p, .24, .37, .45, .62) : windowPulse(p, .2, .35, .68, .84);
  const sign = params.balance;
  pose.pitch = sign * params.angle * amount;
  pose.pivot = sign > 0 ? 'rear' : 'front';
  pose.frontContact = sign < 0 || amount < .001;
  pose.rearContact = sign > 0 || amount < .001;
  const load = windowPulse(p, .11, .2, .22, .34);
  const correction = .013 * Math.sin(p * TAU * 3) * amount;
  pose.bodyShift = [sign > 0 ? -(params.pedal ? .19 : .38) * amount + correction : .25 * amount, -.08 * amount - .09 * load, 0];
  pose.crouch = .18 * amount + .34 * load;
  if (params.pedal) pedal(pose);
  if (sign > 0) { pose.frontCompression = .0405 * (1 - amount); pose.rearCompression += .014 * amount; }
  else { pose.rearCompression = .0378 * (1 - amount); pose.frontCompression += .025 * amount; }
  if (params.brake) {
    pose.position[0] = p < .35 ? lerp(-2, -.4, smooth(p / .35)) : p < .84 ? -.4 : lerp(-.4, .5, smooth((p - .84) / .1));
    pose.speed *= p > .35 && p < .84 ? 0 : 1;
    pose.wheelAngle = (pose.position[0] + 2) / .37;
  }
  if (amount <= .001) pose.pivot = 'center';
}

function wallride(pose: TrickPose, trick: Trick): void {
  const p = pose.progress;
  const wallAmount = trick.primitives.tap ? windowPulse(p, .3, .49, .51, .7) : windowPulse(p, .22, .39, .65, .82);
  pose.roll = -Math.PI / 2 * wallAmount;
  pose.position[2] = WALL_Z * wallAmount - .8 * Math.sin(Math.PI / 2 * wallAmount);
  pose.position[1] = .65 * Math.sin(Math.PI * clamp((p - .2) / .64));
  pose.bodyShift[2] = -.08 * wallAmount;
  pose.crouch = .25 * wallAmount;
  pose.frontContact = wallAmount > .98 || wallAmount < .001;
  pose.rearContact = pose.frontContact;
  pose.grounded = wallAmount > .98 || wallAmount < .001;
  pose.phase = wallAmount > .98 ? 'Kontakt ze ścianą' : p < .5 ? 'Najazd na ścianę' : 'Powrót na podłoże';
}

function drop(pose: TrickPose, trick: Trick): void {
  const p = pose.progress;
  const begin = .31, end = .63;
  if (p < begin) pose.position[0] = lerp(-3.4, -.18, p / begin);
  else if (p < end) pose.position[0] = lerp(-.18, 1.6, (p - begin) / (end - begin));
  else pose.position[0] = lerp(1.6, 3.4, clamp((p - end) / (.94 - end)));
  pose.position[1] = p < begin ? .62 : p >= end ? 0 : 0;
  const q = clamp((p - begin) / (end - begin));
  const profile = sampleFlight(.045, .62, 0, q);
  pose.pitch = 0;
  const manual = windowPulse(p, .16, .27, .32, .52);
  if (trick.primitives.manual) { pose.pitch = .35 * manual; pose.pivot = p < begin ? 'rear' : 'center'; pose.bodyShift[0] = -.3 * manual; }
  else { pose.pitch = -.1 * Math.sin(Math.PI * q); pose.bodyShift[0] = -.14 * Math.sin(Math.PI * q); }
  if (p >= begin && p < end) {
    pose.position[1] = profile.y;
    pose.grounded = false; pose.frontContact = false; pose.rearContact = false;
    pose.frontCompression = .005; pose.rearCompression = .005;
  }
  if (p >= .24 && p < begin) pose.frontContact = false;
  if (p >= end) {
    const elapsed = (p - end) * trick.duration;
    pose.frontCompression = landingCompression(elapsed, profile.impulse, true);
    pose.rearCompression = landingCompression(elapsed, profile.impulse, false);
    pose.crouch = .45 * Math.exp(-elapsed * 5);
    pose.impact = Math.max(0, 1 - elapsed * 5) * profile.impulse / 94;
  }
  pose.wheelAngle = (pose.position[0] + 3.4) / .37;
}

function corner(pose: TrickPose, trick: Trick): void {
  const p = pose.progress, tight = trick.primitives.tight;
  const radius = tight ? 1.3 : 2.6;
  const angle = lerp(-Math.PI * .83, -Math.PI * .17, Math.min(.94, p) / .94);
  pose.position = [radius * Math.cos(angle), 0, 2 + radius * Math.sin(angle)];
  pose.yaw = -(angle + Math.PI / 2);
  const lean = windowPulse(p, .08, .25, .75, .9);
  pose.roll = -.34 * lean;
  pose.steering = -.19 * lean * (tight ? 2 : 1);
  pose.bodyShift[2] = .12 * lean;
  pose.position[1] = heightAt(trick.scene, pose.position[0], pose.position[2]);
  pose.crouch = .15 * lean;
  pose.wheelAngle = radius * (angle + Math.PI * .83) / .37;
  pose.speed = p < .94 ? radius * Math.PI * .66 / (trick.duration * .94) : 0;
}

function ledge(pose: TrickPose, trick: Trick): void {
  const p = pose.progress, params = trick.primitives;
  const holdEnd = params.fufanu ? .7 : params.stall || params.uprear ? .64 : .53;
  const up = smooth((p - .22) / .2), down = smooth((p - holdEnd) / .22);
  const onLedge = p >= .42 && p <= holdEnd;
  if (params.uprear) {
    const settle = smooth((p - .66) / .18);
    const pitch = .62 * up * (1 - settle);
    pose.position[0] = lerp(-2.3, .8, up);
    pose.position[1] = LEDGE_HEIGHT * up + (p < .42 ? .65 * Math.sin(Math.PI * clamp((p - .22) / .2)) : 0);
    pose.pitch = pitch;
    pose.pivot = 'rear';
    pose.frontContact = p < .22 || settle >= .999;
    pose.rearContact = p < .22 || p >= .42;
    pose.grounded = pose.frontContact || pose.rearContact;
    pose.bodyShift[0] = -.28 * up * (1 - settle);
    pose.crouch = .25 * up * (1 - settle);
    pose.speed = p >= .42 ? 0 : .8;
    pose.wheelAngle = (pose.position[0] + 2.3) / .37;
    pose.phase = p < .22 ? 'Przygotowanie do wskoku' : p < .42 ? 'Wskok' : p < .66 ? 'Balans na tylnej oponie' : 'Opuszczenie przodu na podest';
    return;
  }
  const horizontal = up * (1 - down);
  pose.position[0] = lerp(-2.3, .63, horizontal);
  pose.pitch = .62 * horizontal;
  pose.position[1] = LEDGE_HEIGHT * horizontal + .6 * Math.sin(Math.PI * clamp((p - .22) / .2)) * (p < .42 ? 1 : 0) + .45 * Math.sin(Math.PI * clamp((p - holdEnd) / .22)) * (p > holdEnd ? 1 : 0);
  pose.pivot = 'rear';
  pose.frontContact = horizontal < .001;
  pose.rearContact = horizontal < .001 || onLedge;
  pose.grounded = horizontal < .001 || onLedge;
  pose.bodyShift[0] = -.25 * horizontal;
  pose.crouch = .23 * horizontal;
  pose.wheelAngle = (pose.position[0] + 2.3) / .37;
  if (params.fufanu) {
    pose.yaw = Math.PI * smooth((p - .46) / .22);
    if (p > holdEnd) pose.wheelAngle = (2.93 + (.63 - pose.position[0])) / .37;
  }
  pose.speed = onLedge || p >= .94 ? 0 : Math.abs(horizontal) > .001 ? .9 : .4;
  pose.phase = onLedge ? params.fufanu ? 'Obrót na tylnej oponie' : 'Kontakt tylnej opony z krawędzią' : p > holdEnd ? params.fufanu ? 'Powrót przodem' : 'Powrót fakie' : 'Wskok na krawędź';
}

export function sampleTrick(trick: Trick, time: number): TrickPose {
  const pose = neutralPose(trick, time);
  if (trick.status === 'unavailable') return pose;
  if (sampleBasicMotion(trick, pose)) return pose;
  const p = pose.progress, params = trick.primitives;
  approach(pose, trick);
  if (trick.family === 'flight') flight(pose, trick);
  else if (trick.family === 'balance') balance(pose, trick);
  else if (trick.family === 'drop') drop(pose, trick);
  else if (trick.family === 'trackstand') {
    const amount = windowPulse(p, .05, .2, .78, .94);
    pose.position[0] = .025 * Math.sin(p * TAU * 3) * amount;
    pose.position[1] = 0;
    pose.steering = .22 * amount;
    pose.roll = .012 * Math.sin(p * TAU * 3) * amount;
    pose.bodyShift[2] = -.018 * Math.sin(p * TAU * 3) * amount;
    pose.wheelAngle = pose.position[0] / .37; pose.speed = Math.abs(.025 * Math.cos(p * TAU * 3) * amount);
  } else if (trick.family === 'preload') {
    pose.position = [0, 0, 0]; pose.wheelAngle = 0; pose.speed = 0;
    preload(pose, windowPulse(p, .2, .43, .5, .75));
  } else if (trick.family === 'pump') {
    const weight = windowPulse(p, .04, .18, .8, .94);
    const pumping = .5 + .5 * Math.sin(pose.position[0] * TAU / 2.4);
    pose.crouch = (params.roller ? .3 : .75) * pumping * weight;
    pose.bodyShift[1] = -.08 * pumping * weight;
    pose.frontCompression += .035 * pumping * weight;
    pose.rearCompression += .025 * pumping * weight;
    if (params.flow) { pose.roll = .1 * Math.sin(p * TAU * 2) * weight; pose.steering = .06 * Math.sin(p * TAU * 2) * weight; }
  } else if (trick.family === 'fakie') {
    if (params.rollback) pose.position[0] = p < .3 ? lerp(-1.8, 0, smooth(p / .3)) : p < .7 ? lerp(0, -1.4, smooth((p - .3) / .4)) : lerp(-1.4, 1.2, smooth((p - .7) / .24));
    else pose.position[0] *= -1;
    pose.wheelAngle = (pose.position[0] - 3.4) / .37;
    pose.crankAngle = pose.wheelAngle * .38;
  } else if (trick.family === 'pivot') {
    const amount = windowPulse(p, .2, .34, .67, .84);
    const rear = params.pivot > 0;
    pose.position = [0, 0, 0]; pose.speed = 0; pose.wheelAngle = 0;
    pose.pitch = (rear ? .42 : -.5) * amount;
    pose.yaw = params.turn * Math.PI * smooth((p - .35) / .3);
    pose.pivot = rear ? 'rear' : 'front';
    pose.frontContact = !rear || amount < .001; pose.rearContact = rear || amount < .001;
    pose.bodyShift[0] = (rear ? -.28 : .23) * amount;
  } else if (trick.family === 'wallride') wallride(pose, trick);
  else if (trick.family === 'ledge') ledge(pose, trick);
  else if (trick.family === 'corner') corner(pose, trick);
  else if (trick.family === 'rocks') {
    const load = windowPulse(p, .15, .3, .7, .85);
    const bump = Math.abs(Math.sin(p * TAU * 7)) * load;
    pose.frontCompression += .045 * bump;
    pose.rearCompression += .04 * Math.abs(Math.sin((p - .07) * TAU * 7)) * load;
    pose.crouch = .18 + .22 * bump;
    pose.bodyShift[0] = -.1 * load;
  } else if (trick.family === 'wheelhop') {
    const amount = windowPulse(p, .18, .32, .7, .86);
    const rear = params.rear === 1;
    const cycles = params.kick ? 1 : 3;
    const q = clamp((p - .33) / .35);
    const hop = .14 * Math.sin(Math.PI * (q * cycles % 1)) * amount * (p >= .33 && p < .68 ? 1 : 0);
    pose.position[0] = params.kick ? .65 * smooth(q) : 0;
    pose.position[1] = hop;
    pose.pitch = (rear ? .65 : -.58) * amount;
    pose.pivot = rear ? 'rear' : 'front';
    pose.frontContact = (!rear && hop < .005) || amount < .001;
    pose.rearContact = (rear && hop < .005) || amount < .001;
    pose.grounded = hop < .005;
    pose.bodyShift[0] = (rear ? -.29 : .25) * amount;
    pose.crouch = .3 * amount;
    pose.wheelAngle = pose.position[0] / .37;
    pose.speed = 0;
    if (params.kick) pose.crankAngle = .9 * smooth(q);
  }
  pose.frontCompression = clamp(pose.frontCompression, 0, .15);
  pose.rearCompression = clamp(pose.rearCompression, 0, .14);
  return pose;
}
