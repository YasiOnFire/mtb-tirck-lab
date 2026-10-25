import { Quaternion, Vector3 } from 'three';
import type { SceneKind, TrickPose } from '../../types';
import { heightAt } from '../tricks/terrain';

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

export function poseQuaternion(pose: Pick<TrickPose, 'yaw' | 'pitch' | 'roll'>) {
  return new Quaternion().setFromAxisAngle(Y, pose.yaw)
    .multiply(new Quaternion().setFromAxisAngle(Z, pose.pitch))
    .multiply(new Quaternion().setFromAxisAngle(X, pose.roll));
}

export function wheelSupportOffset(center: Vector3, rotation: Quaternion, scene: SceneKind, radius: number) {
  const axle = Z.clone().applyQuaternion(rotation);
  const up = Y.clone().addScaledVector(axle, -axle.y).normalize();
  const forward = new Vector3().crossVectors(up, axle).normalize();
  let offset = -Infinity;
  for (let i = 0; i <= 32; i++) {
    const angle = -Math.PI / 2 + Math.PI * i / 32;
    const point = center.clone().addScaledVector(up, -Math.cos(angle) * radius).addScaledVector(forward, Math.sin(angle) * radius);
    offset = Math.max(offset, heightAt(scene, point.x, point.z) - point.y);
  }
  return offset;
}

export function resolveGroundPose(pose: TrickPose, local: { front: Vector3; rear: Vector3 }, scene: SceneKind, radius: number) {
  const pivot = pose.pivot === 'front' ? local.front.clone() : pose.pivot === 'rear' ? local.rear.clone() : new Vector3(0, .8, 0);
  const q = poseQuaternion(pose);
  const position = new Vector3();
  const place = () => position.fromArray(pose.position).add(pivot).sub(pivot.clone().applyQuaternion(q));
  place();
  const againstWall = scene === 'wall' && Math.abs(pose.roll) > .3;
  if (!againstWall && (pose.frontContact || pose.rearContact)) {
    if (pose.frontContact && pose.rearContact) {
      let pitch = pose.pitch;
      for (let i = 0; i < 5; i++) {
        const front = local.front.clone().applyQuaternion(q).add(position);
        const rear = local.rear.clone().applyQuaternion(q).add(position);
        const difference = wheelSupportOffset(front, q, scene, radius) - wheelSupportOffset(rear, q, scene, radius);
        if (Math.abs(difference) < .0005) break;
        pitch += Math.max(-.15, Math.min(.15, difference / Math.max(.3, (local.front.x - local.rear.x) * Math.cos(pitch))));
        q.copy(poseQuaternion({ ...pose, pitch }));
        place();
      }
    }
    const offsets: number[] = [];
    if (pose.frontContact) offsets.push(wheelSupportOffset(local.front.clone().applyQuaternion(q).add(position), q, scene, radius));
    if (pose.rearContact) offsets.push(wheelSupportOffset(local.rear.clone().applyQuaternion(q).add(position), q, scene, radius));
    position.y += Math.max(...offsets);
  }
  return { position, quaternion: q };
}
