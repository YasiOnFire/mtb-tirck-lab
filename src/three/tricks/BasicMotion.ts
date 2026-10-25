import { Euler, Vector3 } from 'three';
import type { Trick, TrickPose, Vec3 } from '../../types';
import { BIKE, frontAxleAt, rearAxleAt, STEERING_AXIS } from '../bike/kinematics';
import { poseQuaternion, resolveGroundPose, wheelSupportOffset } from '../physics/groundSupport';
import { FIXED_DT, getFlightTrack, landingCompression, samplePhysicalFlight } from '../physics/PhysicsWorld';
import type { FlightTrack } from '../physics/PhysicsWorld';
import { clamp, smooth, terrainPitch, wheelGroundHeight } from './terrain';
import { BASIC_DURATIONS } from './BasicMetadata';
export { BASIC_DURATIONS } from './BasicMetadata';

const COM = new Vector3(0, .8, 0);
const G = 9.81;
const R = BIKE.wheelRadius;
const FRONT_SAG = .0405, REAR_SAG = .0378;
const lerp = (a: number, b: number, q: number) => a + (b - a) * q;
const pulse = (t: number, a: number, b: number, c: number, d: number) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

function axles(pose: TrickPose) {
  return {
    front: frontAxleAt(pose.frontCompression).sub(BIKE.steeringPivot).applyAxisAngle(STEERING_AXIS, pose.steering).add(BIKE.steeringPivot),
    rear: rearAxleAt(pose.rearCompression),
  };
}

function emptyPose(): TrickPose {
  return {
    time: 0, progress: 0, phase: '', position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, steering: 0, tailwhip: 0,
    frontCompression: FRONT_SAG, rearCompression: REAR_SAG, wheelAngle: 0, crankAngle: 0, bodyShift: [0, 0, 0], crouch: 0,
    handRelease: [0, 0], footRelease: [0, 0], handStyle: 'spread', footStyle: 'spread', grounded: true, frontContact: true, rearContact: true,
    pivot: 'center', speed: 0, impact: 0,
  };
}

function centerPoseOnGround(pose: TrickPose, trick: Trick): TrickPose {
  const { position, quaternion } = resolveGroundPose(pose, axles(pose), trick.scene, R);
  const angles = new Euler().setFromQuaternion(quaternion, 'YZX');
  return {
    ...pose, pitch: angles.z, yaw: angles.y, roll: angles.x, pivot: 'center',
    position: position.clone().sub(COM).add(COM.clone().applyQuaternion(quaternion)).toArray() as Vec3,
  };
}

function rollingRun(t: number, speed: number, brakeStart = 2.7, brakeTime = .5, initial = -3.8) {
  const cruising = Math.min(t, brakeStart), braking = clamp(t - brakeStart, 0, brakeTime);
  const distance = speed * cruising + speed * (braking - braking * braking / (2 * brakeTime));
  return { x: initial + distance, speed: t < brakeStart ? speed : t < brakeStart + brakeTime ? speed * (1 - braking / brakeTime) : 0, distance };
}

function gaze(pose: TrickPose, down = 0) {
  pose.headLook = new Vector3(1, down, 0).applyQuaternion(poseQuaternion(pose).invert()).normalize().toArray() as Vec3;
}

function spinFree(entryAngle: number, omega: number, elapsed: number) {
  return entryAngle + omega * (1 - Math.exp(-.065 * Math.max(0, elapsed))) / .065;
}

function sampleTrackstand(pose: TrickPose) {
  const t = pose.time;
  const amount = pulse(t, 0, .65, 4.65, 5.1);
  const rock = Math.sin(t * 2.6);
  pose.position = [.026 * rock * amount, 0, .003 * Math.sin(t * 2.6) * amount];
  pose.steering = (.31 + .026 * Math.sin(t * 2.6 + .4)) * amount;
  pose.roll = .012 * rock * amount;
  pose.bodyShift = [0, -.018 * amount, -.026 * rock * amount];
  pose.chestLean = .10 + .018 * Math.cos(t * 2.6) * amount;
  pose.crouch = .12 * amount;
  pose.wheelAngle = pose.position[0] / R;
  pose.speed = Math.abs(.026 * 2.6 * Math.cos(t * 2.6) * amount);
  pose.crankAngle = .1 * amount;
  pose.frontCompression = FRONT_SAG + .003 * Math.sin(t * 2.6) * amount;
  pose.rearCompression = REAR_SAG - .003 * Math.sin(t * 2.6) * amount;
  gaze(pose);
}

function sampleBalance(trick: Trick, pose: TrickPose) {
  const t = pose.time, front = trick.id === 'nose-manual', wheelie = trick.id === 'wheelie';
  const run = rollingRun(t, wheelie ? 2.65 : 2.55);
  const load = pulse(t, .4, .61, .66, .98);
  const hold = pulse(t, .64, 1.02, 2.15, 2.68);
  const corrections = .012 * Math.sin((t - 1) * 7) * pulse(t, 1.05, 1.2, 2, 2.25);
  pose.position = [run.x, 0, 0]; pose.speed = run.speed;
  pose.pitch = (front ? -.48 : wheelie ? .63 : .46) * hold + corrections;
  pose.pivot = front ? 'front' : 'rear';
  pose.frontContact = front || hold < .00001;
  pose.rearContact = !front || hold < .00001;
  pose.bodyShift = [front ? .18 * hold : -(wheelie ? .12 : .32) * hold, -.11 * load - (wheelie ? .07 : .09) * hold, 0];
  pose.crouch = .32 * load + (wheelie ? .08 : .12) * hold;
  pose.chestLean = .12 + (front ? .12 : wheelie ? -.14 : -.04) * hold;
  pose.frontCompression = FRONT_SAG + .035 * load + (front ? .024 : -FRONT_SAG) * hold;
  pose.rearCompression = REAR_SAG + .04 * load + (front ? -REAR_SAG : .012) * hold;
  pose.pitch += centerPoseOnGround({ ...pose, pitch: 0, frontContact: true, rearContact: true }, trick).pitch * (1 - hold);
  pose.position[0] -= front ? frontAxleAt(pose.frontCompression).x - frontAxleAt(FRONT_SAG).x : rearAxleAt(pose.rearCompression).x - rearAxleAt(REAR_SAG).x;
  pose.wheelAngle = run.distance / R;
  const entry = .64 * (wheelie ? 2.65 : 2.55) / R;
  const free = t < .64 ? pose.wheelAngle : spinFree(entry, (wheelie ? 2.65 : 2.55) / R, t - .64);
  if (front) pose.rearWheelAngle = lerp(pose.wheelAngle, free, hold);
  else pose.frontWheelAngle = lerp(pose.wheelAngle, free, hold);
  if (wheelie) pose.crankAngle = Math.min(t, 3.2) * 4.5;
  gaze(pose, -.025);
}

function sampleStoppie(trick: Trick, pose: TrickPose) {
  const t = pose.time, speed = 2.8;
  const brake = clamp(t - .45, 0, .6);
  const initialDistance = speed * Math.min(t, .45) + speed * (brake - brake * brake / 1.2);
  const exit = clamp(t - 2.65, 0, .7), exitBrake = clamp(t - 3.35, 0, .45);
  const distance = initialDistance + 1.9 * exit * exit / 1.4 + 1.9 * (exitBrake - exitBrake * exitBrake / .9);
  const lift = pulse(t, .5, .92, 2.15, 2.65);
  pose.position = [-3 + distance, 0, 0];
  pose.speed = t < .45 ? speed : t < 1.05 ? speed * (1 - brake / .6) : t < 2.65 ? 0 : t < 3.35 ? 1.9 * exit / .7 : t < 3.8 ? 1.9 * (1 - exitBrake / .45) : 0;
  pose.pitch = -.62 * lift;
  pose.pivot = 'front'; pose.frontContact = true; pose.rearContact = lift < .00001;
  pose.bodyShift = [.19 * lift, -.07 * pulse(t, .42, .65, .8, 1.1) + .025 * lift, 0];
  pose.crouch = .13 + .23 * pulse(t, .43, .7, .85, 1.1);
  pose.chestLean = .16 + .12 * lift;
  pose.frontCompression = FRONT_SAG + .065 * pulse(t, .45, .73, .88, 1.2) + .018 * lift;
  pose.rearCompression = REAR_SAG * (1 - lift);
  pose.pitch += centerPoseOnGround({ ...pose, pitch: 0, frontContact: true, rearContact: true }, trick).pitch * (1 - lift);
  pose.position[0] -= frontAxleAt(pose.frontCompression).x - frontAxleAt(FRONT_SAG).x;
  pose.wheelAngle = distance / R;
  const atLift = speed * .5 - speed * .05 * .05 / 1.2;
  pose.rearWheelAngle = lerp(pose.wheelAngle, spinFree(atLift / R, speed / R, t - .5), lift);
  gaze(pose, -.06);
}

type BasicFlightKind = 'hop' | 'ramp' | 'drop';
interface MotionPlan {
  kind: BasicFlightKind; speed: number; initialX: number; nominalLaunchX: number;
  frontOff: number; takeoff: number; landing: number; stop: number; track: FlightTrack;
  launch: TrickPose; landingPitch: number; touchdownX: number; firstContact: 'front' | 'rear';
  frontOffPitch: number;
  secondContactDelay: number;
}
const planCache = new Map<string, MotionPlan>();

function getMotionPlan(trick: Trick): MotionPlan {
  const cached = planCache.get(trick.id);
  const physical = getFlightTrack(.05).physical;
  if (cached && cached.track.physical === physical) return cached;
  const kind: BasicFlightKind = trick.id === 'drop' ? 'drop' : trick.scene === 'jump' ? 'ramp' : 'hop';
  const speed = kind === 'ramp' ? trick.id === 'jump' ? 3.3 : 3 : kind === 'drop' ? 2.8 : 2.5;
  const initialX = -3.8;
  const launch = emptyPose();
  launch.frontCompression = kind === 'hop' ? 0 : FRONT_SAG;
  launch.rearCompression = .044;
  if (trick.id === 'english-bunny-hop') { launch.frontCompression = FRONT_SAG; launch.rearCompression = REAR_SAG; }
  launch.frontContact = trick.id === 'english-bunny-hop'; launch.rearContact = true;
  launch.pitch = kind === 'ramp' ? Math.atan(.6) : kind === 'drop' ? .025 : trick.id === 'english-bunny-hop' ? 0 : trick.id === 'american-bunny-hop' ? .42 : .34;
  if (trick.id === 'whip') { launch.yaw = .12; launch.roll = -.055; launch.steering = .12; }
  let nominalLaunchX: number;
  if (kind === 'hop') {
    nominalLaunchX = -1.25;
    launch.position = [nominalLaunchX, 0, 0]; launch.pivot = 'rear';
  } else {
    const q = poseQuaternion(launch);
    const rearOffset = axles(launch).rear.sub(COM).applyQuaternion(q);
    const contactX = kind === 'ramp' ? -1 : -.75;
    const axleX = contactX - (kind === 'ramp' ? R * Math.sin(Math.atan(.6)) : 0);
    nominalLaunchX = axleX - rearOffset.x;
    launch.position = [nominalLaunchX, 0, 0];
  }
  const centeredLaunch = centerPoseOnGround(launch, trick);
  const takeoff = (nominalLaunchX - initialX) / speed;
  let frontOff = kind === 'drop' ? (-1.35 - initialX) / speed : takeoff - (trick.id === 'english-bunny-hop' ? 0 : .23);
  if (kind === 'ramp') {
    // Release the front contact when its tyre's tangent reaches the actual lip,
    // with the real axle geometry and compressed suspension under both wheels.
    const lastFrontX = -1 - R * Math.sin(Math.atan(.6));
    let lo = -2.4, hi = -1.5;
    for (let i = 0; i < 28; i++) {
      const x = (lo + hi) / 2, t = (x - initialX) / speed, p = emptyPose();
      const load = pulse(t, takeoff - .48, takeoff - .25, takeoff - .19, takeoff);
      p.position = [x, 0, 0]; p.frontCompression += .055 * load; p.rearCompression += .06 * load;
      const local = axles(p), world = resolveGroundPose(p, local, trick.scene, R);
      const frontX = local.front.applyQuaternion(world.quaternion).add(world.position).x;
      if (frontX < lastFrontX) lo = x; else hi = x;
    }
    frontOff = ((lo + hi) / 2 - initialX) / speed;
  }
  const offPose = emptyPose();
  offPose.position = [initialX + speed * frontOff, 0, 0];
  offPose.pivot = kind === 'hop' ? 'rear' : 'center';
  const offLoad = kind === 'drop' ? 0 : pulse(frontOff, takeoff - .48, takeoff - .25, takeoff - .19, takeoff);
  offPose.frontCompression = FRONT_SAG + .055 * offLoad;
  offPose.rearCompression = REAR_SAG + .06 * offLoad;
  const frontOffPitch = centerPoseOnGround(offPose, trick).pitch;
  const landingPitch = kind === 'ramp' ? -Math.atan(.28) : kind === 'hop' ? .035 : -.04;
  const contactPose = emptyPose(); contactPose.pitch = landingPitch;
  contactPose.frontContact = kind !== 'hop'; contactPose.rearContact = kind === 'hop';
  contactPose.position = [kind === 'ramp' ? 1.82 : kind === 'drop' ? .82 : .25, 0, 0];
  const touchdownHeight = centerPoseOnGround(contactPose, trick).position[1];
  let peak = kind === 'drop' ? 0 : kind === 'hop' ? trick.id === 'american-bunny-hop' ? .34 : trick.id === 'english-bunny-hop' ? .22 : .27 : .5;
  if (kind === 'ramp') {
    const desiredTime = (1.82 - centeredLaunch.position[0]) / speed;
    const vy = (touchdownHeight - centeredLaunch.position[1] + .5 * G * desiredTime * desiredTime) / desiredTime;
    peak = Math.max(.1, vy * vy / (2 * G));
  }
  const track = getFlightTrack(peak, centeredLaunch.position[1], touchdownHeight, speed);
  const landing = takeoff + track.duration;
  const touchdownX = centeredLaunch.position[0] + track.samples.at(-1)!.x;
  const stop = landing + Math.max(0, (2.8 - touchdownX) / speed) + .45;
  const firstContact = kind === 'hop' ? 'rear' : 'front';
  const clearAt = (dt: number) => {
    const p = emptyPose();
    p.position = [touchdownX + speed * dt, 0, 0];
    p.pitch = kind === 'hop' ? landingPitch * (1 - smooth(dt / .07)) : lerp(landingPitch, terrainPitch(trick.scene, p.position[0]), smooth((dt - .07) / .12));
    p.frontContact = firstContact === 'front'; p.rearContact = firstContact === 'rear';
    if (p.frontContact) p.frontCompression = landingCompression(dt, track.impulse, true);
    else p.rearCompression = landingCompression(dt, track.impulse, false);
    const local = axles(p), world = resolveGroundPose(p, local, trick.scene, R);
    const other = (firstContact === 'front' ? local.rear : local.front).applyQuaternion(world.quaternion).add(world.position);
    return wheelSupportOffset(other, world.quaternion, trick.scene, R);
  };
  let secondContactDelay = 0;
  while (clearAt(secondContactDelay) < -.0001 && secondContactDelay < .15) secondContactDelay += FIXED_DT / 4;
  if (secondContactDelay > 0) {
    let low = secondContactDelay - FIXED_DT / 4, high = secondContactDelay;
    for (let i = 0; i < 16; i++) { const mid = (low + high) / 2; if (clearAt(mid) < 0) low = mid; else high = mid; }
    secondContactDelay = (low + high) / 2;
  }
  const plan: MotionPlan = { kind, speed, initialX, nominalLaunchX, frontOff, frontOffPitch, takeoff, landing, stop, track, launch: centeredLaunch, landingPitch, touchdownX, firstContact, secondContactDelay };
  planCache.set(trick.id, plan);
  return plan;
}

export function basicMotionTiming(trick: Trick) {
  const p = getMotionPlan(trick);
  return { frontOff: p.frontOff, takeoff: p.takeoff, apex: p.takeoff + p.track.samples.reduce((best, sample) => sample.y > best.y ? sample : best).time, landing: p.landing, bothWheels: p.landing + p.secondContactDelay, stop: p.stop, physicalAirtime: p.track.duration, speed: p.speed, launchX: p.launch.position[0], launchY: p.launch.position[1], touchdownX: p.touchdownX, touchdownY: p.track.samples.at(-1)!.y };
}

function sampleBasicFlight(trick: Trick, pose: TrickPose) {
  const plan = getMotionPlan(trick), t = pose.time;
  const q = clamp((t - plan.takeoff) / plan.track.duration);
  const airborne = t >= plan.takeoff && t < plan.landing;
  const preload = plan.kind === 'drop' ? 0 : pulse(t, plan.takeoff - .48, plan.takeoff - .25, plan.takeoff - .19, plan.takeoff);
  const releaseLift = smooth((t - plan.frontOff) / Math.max(.01, plan.takeoff - plan.frontOff));
  pose.speed = plan.speed;
  pose.position = [plan.initialX + plan.speed * Math.min(t, plan.takeoff), 0, 0];
  pose.frontCompression = FRONT_SAG + .055 * preload;
  pose.rearCompression = REAR_SAG + .06 * preload;
  pose.crouch = .62 * preload;
  pose.bodyShift = [-.035 * preload, -.055 * preload, 0];
  pose.chestLean = .15 + .12 * preload;
  pose.wheelAngle = plan.speed * Math.min(t, plan.takeoff) / R;
  if (t < plan.takeoff) {
    pose.phase = preload > .12 ? 'Dociążenie przed wybiciem' : t > plan.frontOff ? 'Przód w górze, tył na podłożu' : 'Najazd';
    pose.position[1] = wheelGroundHeight(trick.scene, pose.position[0]);
    pose.pitch = terrainPitch(trick.scene, pose.position[0]);
    if (plan.kind === 'hop') pose.pivot = 'rear';
    if (t >= plan.frontOff) {
      pose.frontContact = false; pose.rearContact = true;
      const pitchLift = plan.kind === 'ramp' ? 1 - (1 - clamp((t - plan.frontOff) / (plan.takeoff - plan.frontOff))) ** 4 : releaseLift;
      pose.pitch = lerp(plan.frontOffPitch, plan.launch.pitch, pitchLift);
      if (plan.kind === 'hop') pose.pivot = 'rear';
      pose.frontCompression = lerp(pose.frontCompression, plan.launch.frontCompression, releaseLift);
      pose.rearCompression = lerp(pose.rearCompression, plan.launch.rearCompression, releaseLift);
      pose.bodyShift[0] -= (plan.kind === 'hop' ? .27 : plan.kind === 'drop' ? .16 : .09) * releaseLift;
      pose.bodyShift[1] += .065 * releaseLift;
      pose.chestLean -= .10 * releaseLift;
    }
    if (trick.id === 'whip') {
      const carve = smooth((t - plan.takeoff + .24) / .24);
      pose.yaw = .12 * carve; pose.steering = .12 * carve; pose.roll = -.055 * carve;
      pose.bodyYaw = -.09 * carve;
    }
    if (plan.kind === 'drop') {
      pose.crouch = .2 + .12 * releaseLift; pose.bodyShift[1] = -.045;
      pose.bodyShift[0] = -.16 * smooth((t - plan.frontOff + .13) / (plan.takeoff - plan.frontOff + .13));
      pose.chestLean = .12 + .04 * releaseLift;
    }
  } else if (airborne) {
    const physical = samplePhysicalFlight(plan.track, t - plan.takeoff);
    pose.position = [plan.launch.position[0] + physical.x, physical.y, 0];
    pose.grounded = false; pose.frontContact = false; pose.rearContact = false;
    const unload = plan.kind === 'drop' ? pulse(q, .40, .56, .84, 1) : pulse(q, 0, .18, .84, 1);
    pose.frontCompression = lerp(plan.launch.frontCompression, .004, unload) + (FRONT_SAG - plan.launch.frontCompression) * smooth((q - .84) / .16);
    pose.rearCompression = lerp(plan.launch.rearCompression, .004, unload) + (REAR_SAG - plan.launch.rearCompression) * smooth((q - .84) / .16);
    pose.pitch = lerp(plan.launch.pitch, plan.landingPitch, smooth(q));
    const tuck = pulse(q, .03, .3, .55, .88);
    pose.crouch = .45 * tuck + .13 * smooth((q - .8) / .2);
    pose.bodyShift = [-.09 * (1 - smooth(q / .4)), .065 * (1 - smooth(q / .24)) - .045 * tuck, 0];
    pose.chestLean = .05 + .05 * smooth(q / .2) + .16 * tuck + .02 * smooth((q - .8) / .2);
    if (plan.kind === 'drop') {
      pose.crouch = lerp(.32, .13, smooth(q));
      pose.bodyShift = [-.16 * (1 - smooth(q)), -.045 * (1 - smooth(q)), 0];
      pose.chestLean = lerp(.16, .12, smooth(q));
    }
    if (plan.kind === 'hop' && trick.id !== 'english-bunny-hop') {
      pose.pitch = lerp(plan.launch.pitch, -.06, smooth(q / .45)) + .095 * smooth((q - .65) / .35);
      pose.bodyShift[0] = -.27 * (1 - smooth(q / .35)) + .08 * tuck;
    }
    if (trick.id === 'english-bunny-hop') {
      pose.bodyShift = [.025 * tuck, -.065 * tuck, 0];
      pose.chestLean = .15 + .12 * tuck - .03 * smooth((q - .8) / .2);
    }
    if (trick.id === 'whip') {
      const figure = pulse(q, 0, .35, .5, .91);
      pose.yaw = .12 * (1 - smooth(q / .25)) + .85 * figure;
      pose.steering = .12 * (1 - smooth(q / .18)) - .38 * figure;
      pose.roll = -.055 * (1 - smooth(q / .2)) - .31 * figure;
      pose.bodyYaw = -.82 * pose.yaw;
      pose.bodyShift[2] = -.13 * figure;
      pose.bodyShift[0] = -.09 * (1 - smooth(q / .3)) + .10 * pulse(q, .4, .65, .8, .98);
      pose.chestLean = .05 + .12 * smooth(q / .18) + .11 * figure - .05 * smooth((q - .8) / .2);
    }
    if (trick.id === 'tabletop') {
      const figure = pulse(q, .07, .36, .57, .9);
      pose.roll = -1.16 * figure; pose.steering = -.18 * figure;
      pose.bodyShift[2] = -.22 * figure; pose.bodyShift[1] -= .035 * figure;
      pose.crouch = Math.max(pose.crouch, .68 * figure); pose.chestLean = .05 + .15 * smooth(q / .18) + .1 * figure - .08 * smooth((q - .8) / .2);
    }
    pose.wheelAngle = spinFree(plan.speed * plan.takeoff / R, plan.speed / R, t - plan.takeoff);
    pose.phase = q < .2 ? plan.kind === 'drop' ? 'Grawitacyjny zeskok' : 'Odbicie i wyprost' : q < .65 ? 'Lot / podciągnięcie roweru' : 'Ustawienie do lądowania';
  } else {
    const dt = t - plan.landing;
    const exitCruise = Math.max(0, (2.8 - plan.touchdownX) / plan.speed);
    const run = rollingRun(dt, plan.speed, exitCruise, .45, plan.touchdownX);
    pose.position = [run.x, 0, 0]; pose.speed = run.speed;
    pose.pitch = plan.kind === 'hop' ? plan.landingPitch * (1 - smooth(dt / .07)) : lerp(plan.landingPitch, terrainPitch(trick.scene, run.x), smooth((dt - .07) / .12));
    pose.frontContact = plan.firstContact === 'front' || dt >= plan.secondContactDelay;
    pose.rearContact = plan.firstContact === 'rear' || dt >= plan.secondContactDelay;
    const frontElapsed = Math.max(0, dt - (plan.firstContact === 'front' ? 0 : plan.secondContactDelay));
    const rearElapsed = Math.max(0, dt - (plan.firstContact === 'rear' ? 0 : plan.secondContactDelay));
    pose.frontCompression = landingCompression(frontElapsed, plan.track.impulse, true);
    pose.rearCompression = landingCompression(rearElapsed, plan.track.impulse, false);
    const absorption = pulse(dt, 0, .12, .17, .56);
    const settling = smooth((t - plan.stop + .35) / .35);
    pose.crouch = .13 - .05 * settling + .48 * absorption;
    pose.bodyShift = [.025 * absorption, -.08 * absorption, 0];
    pose.chestLean = .12 - .02 * settling + .12 * absorption;
    pose.impact = Math.exp(-dt * 10) * plan.track.impulse / 94;
    const airEnd = spinFree(plan.speed * plan.takeoff / R, plan.speed / R, plan.track.duration);
    pose.wheelAngle = airEnd + run.distance / R;
    pose.phase = dt < plan.secondContactDelay ? 'Pierwszy kontakt opony' : dt < .55 ? 'Amortyzacja lądowania' : t < plan.stop ? 'Wyjazd' : 'Podgląd';
    if (t >= plan.stop) { pose.crouch = .08; pose.chestLean = .1; pose.bodyShift = [0, 0, 0]; pose.impact = 0; pose.frontCompression = FRONT_SAG; pose.rearCompression = REAR_SAG; }
  }
  gaze(pose, airborne && q > .55 ? -.10 : -.025);
}

interface RollerSample { time: number; x: number; speed: number }
const rollerSamples: RollerSample[] = [];
function rollers() {
  if (rollerSamples.length) return rollerSamples;
  let x = -3.6, speed = 2.5, time = 0;
  rollerSamples.push({ time, x, speed });
  while (x < 3.6 && time < 5) {
    const slope = (wheelGroundHeight('rollers', x + .015) - wheelGroundHeight('rollers', x - .015)) / .03;
    const push = clamp(Math.sin(x * Math.PI / 1.2));
    speed = Math.max(1.1, speed + (-G * slope + 1.15 * push - .16) * FIXED_DT);
    x += speed * FIXED_DT; time += FIXED_DT;
    rollerSamples.push({ time, x, speed });
  }
  return rollerSamples;
}

function samplePumping(pose: TrickPose) {
  const samples = rollers(), final = samples.at(-1)!;
  const p = Math.min(pose.time / FIXED_DT, samples.length - 1), i = Math.floor(p), f = p - i;
  const a = samples[i], b = samples[Math.min(i + 1, samples.length - 1)];
  let x = lerp(a.x, b.x, f), speed = lerp(a.speed, b.speed, f);
  if (pose.time > final.time) { const run = rollingRun(pose.time - final.time, final.speed, 0, .45, final.x); x = run.x; speed = run.speed; }
  const k = x * Math.PI / 1.2, envelope = pulse(pose.time, 0, .25, final.time - .1, final.time + .4);
  const crest = .5 + .5 * Math.cos(k), down = clamp(Math.sin(k));
  pose.position = [x, wheelGroundHeight('rollers', x), 0]; pose.speed = speed;
  pose.pitch = terrainPitch('rollers', x);
  pose.crouch = (.08 + .64 * crest) * envelope;
  pose.bodyShift = [-.055 * Math.sin(k) * envelope, -.045 * crest * envelope, 0];
  pose.chestLean = .10 + .15 * crest * envelope;
  pose.frontCompression = FRONT_SAG + .028 * down * envelope;
  pose.rearCompression = REAR_SAG + .033 * clamp(Math.sin(k - .45)) * envelope;
  pose.wheelAngle = (x + 3.6) / R; pose.crankAngle = 0;
  pose.phase = pose.time > final.time + .45 ? 'Podgląd' : crest > .65 ? 'Odciążenie na grzbiecie muldy' : down > .35 ? 'Docisk na zjeździe z muldy' : 'Przygotowanie do muldy';
  gaze(pose, -.03);
}

export function sampleBasicMotion(trick: Trick, pose: TrickPose): boolean {
  if (!(trick.id in BASIC_DURATIONS)) return false;
  if (trick.id === 'trackstand') sampleTrackstand(pose);
  else if (['wheelie', 'manual', 'nose-manual'].includes(trick.id)) sampleBalance(trick, pose);
  else if (trick.id === 'stoppie-endo') sampleStoppie(trick, pose);
  else if (trick.id === 'pumping') samplePumping(pose);
  else sampleBasicFlight(trick, pose);
  pose.frontCompression = clamp(pose.frontCompression, 0, BIKE.frontTravel);
  pose.rearCompression = clamp(pose.rearCompression, 0, BIKE.rearTravel);
  return true;
}
