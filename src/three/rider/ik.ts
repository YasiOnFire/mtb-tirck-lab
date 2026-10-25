import * as THREE from 'three';
import { clamp, v } from '../bike/geometry';

export function solveTwoBone(start: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upperLength: number, lowerLength: number) {
  const direction = target.clone().sub(start);
  const requestedLength = direction.length();
  const distance = clamp(requestedLength, Math.abs(upperLength - lowerLength) + .0001, upperLength + lowerLength - .0001);
  if (requestedLength < .00001) direction.set(0, -1, 0);
  else direction.multiplyScalar(1 / requestedLength);
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < .00001) bend.copy(v(0, 0, 1).cross(direction));
  bend.normalize();
  return {
    joint: start.clone().addScaledVector(direction, along).addScaledVector(bend, bendHeight),
    end: start.clone().addScaledVector(direction, distance),
    reachable: requestedLength <= upperLength + lowerLength,
  };
}
