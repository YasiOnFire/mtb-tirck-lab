import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BikeRig } from '../three/bike/BikeRig';
import { TRICKS } from '../data/tricks';
import { sampleTrick } from '../three/tricks/TrickPrimitives';
import { resolveGroundPose, wheelSupportOffset, poseQuaternion } from '../three/physics/groundSupport';

describe('rendered wheel support', () => {
  it('yaw, pitch and roll rotate about their specified axes', () => {
    const yaw = poseQuaternion({ yaw: Math.PI / 2, pitch: 0, roll: 0 });
    const pitch = poseQuaternion({ yaw: 0, pitch: Math.PI / 2, roll: 0 });
    const roll = poseQuaternion({ yaw: 0, pitch: 0, roll: Math.PI / 2 });
    expect(new Vector3(1, 0, 0).applyQuaternion(yaw).z).toBeCloseTo(-1);
    expect(new Vector3(1, 0, 0).applyQuaternion(pitch).y).toBeCloseTo(1);
    expect(new Vector3(0, 1, 0).applyQuaternion(roll).z).toBeCloseTo(1);
  });
  it('supports the tire arc rather than letting nearby rocks cut through the wheel', () => {
    const bike = new BikeRig();
    for (const name of ['Rock Garden', 'Pumping', 'Berm Riding', 'Wheelie', 'Manual', 'Stoppie / Endo', 'Nose Manual']) {
      const trick = TRICKS.find(t => t.nameEn === name)!;
      for (let i = 0; i <= 100; i++) {
        const pose = sampleTrick(trick, trick.duration * i / 100);
        bike.apply(pose);
        const local = bike.getContacts();
        const transform = resolveGroundPose(pose, local, trick.scene, bike.wheelRadius);
        for (const [key, contact] of [['front', pose.frontContact], ['rear', pose.rearContact]] as const) {
          if (!contact) continue;
          const axle = local[key].clone().applyQuaternion(transform.quaternion).add(transform.position);
          const support = wheelSupportOffset(axle, transform.quaternion, trick.scene, bike.wheelRadius);
          expect(support, `${name} ${i}% ${key} penetration`).toBeLessThan(.00001);
          expect(support, `${name} ${i}% ${key} support gap`).toBeGreaterThan(-.018);
        }
      }
    }
    bike.dispose();
  });
});
