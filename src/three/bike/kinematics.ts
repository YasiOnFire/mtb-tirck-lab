import * as THREE from 'three';
import { clamp, v } from './geometry';

export const BIKE = Object.freeze({
  wheelRadius: .37,
  wheelbase: 1.2,
  frontTravel: .15,
  rearTravel: .14,
  sag: .04,
  headAngle: 64 * Math.PI / 180,
  rearPivot: v(-.21, .47),
  steeringPivot: v(.300, .935),
  bottomBracket: v(-.23, .34),
  rearArmLength: Math.hypot(.39, .10),
});

export const STEERING_AXIS = v(-Math.cos(BIKE.headAngle), Math.sin(BIKE.headAngle)).normalize();
export const REAR_REST = v(-Math.sqrt(BIKE.rearArmLength ** 2 - .14 ** 2), -.14);

export function rearAxleAt(compression: number) {
  const y = -.14 + clamp(compression, 0, BIKE.rearTravel);
  return v(-Math.sqrt(BIKE.rearArmLength ** 2 - y * y), y).add(BIKE.rearPivot);
}

export function rearArmAngle(compression: number) {
  const axle = rearAxleAt(compression).sub(BIKE.rearPivot);
  return Math.atan2(axle.y, axle.x) - Math.atan2(REAR_REST.y, REAR_REST.x);
}

export function frontAxleAt(compression: number) {
  return v(.60, .37).addScaledVector(STEERING_AXIS, clamp(compression, 0, BIKE.frontTravel) - BIKE.sag);
}

export function rotateAround(point: THREE.Vector3, pivot: THREE.Vector3, axis: THREE.Vector3, angle: number) {
  return point.clone().sub(pivot).applyAxisAngle(axis, Number.isFinite(angle) ? angle : 0).add(pivot);
}

export const ROCKER_PIVOT = v(-.29, .71);
export const ROCKER_END = v(-.065, -.095);
export const PUSHROD_LENGTH = .10;
export function rockerAngleAt(compression: number) {
  const swingJoint = v(-.105, .15).applyAxisAngle(v(0, 0, 1), rearArmAngle(compression)).add(BIKE.rearPivot);
  const delta = swingJoint.clone().sub(ROCKER_PIVOT);
  const d = delta.length();
  const radius = ROCKER_END.length();
  const a = (radius * radius - PUSHROD_LENGTH * PUSHROD_LENGTH + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, radius * radius - a * a));
  const u = delta.multiplyScalar(1 / d);
  const end = u.clone().multiplyScalar(a).add(v(u.y, -u.x).multiplyScalar(h));
  return Math.atan2(end.y, end.x) - Math.atan2(ROCKER_END.y, ROCKER_END.x);
}

export interface BikeAnchors {
  hands: [THREE.Vector3, THREE.Vector3];
  feet: [THREE.Vector3, THREE.Vector3];
  seat: THREE.Vector3;
}
