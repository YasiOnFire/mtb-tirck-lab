import type { SceneKind } from '../../types';

export const WALL_Z = 1.65;
export const WALL_HEIGHT = 2.1;
export const WALL_START = -2.1;
export const WALL_END = 2.1;
export const LEDGE_HEIGHT = 0.48;
export const LEDGE_START = 0;
export const LEDGE_END = 1.65;
export const ROCKS = [
  { x: -1.65, z: -.13, radius: .23, height: .12 },
  { x: -1.04, z: .12, radius: .3, height: .19 },
  { x: -.3, z: -.04, radius: .23, height: .14 },
  { x: .39, z: .1, radius: .34, height: .21 },
  { x: 1.12, z: -.1, radius: .25, height: .16 },
  { x: 1.71, z: .14, radius: .21, height: .1 },
];

export const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
export const smooth = (x: number): number => { const t = clamp(x); return t * t * (3 - 2 * t); };

export function heightAt(scene: SceneKind, x: number, z = 0): number {
  if (scene === 'jump') {
    if (x > -2.4 && x <= -1) return .42 * ((x + 2.4) / 1.4) ** 2;
    if (x >= 1.2 && x < 2.7) return .42 * (1 - (x - 1.2) / 1.5);
  }
  if (scene === 'step-up') {
    if (x > -2.4 && x <= -1) return .42 * ((x + 2.4) / 1.4) ** 2;
    if (x >= 1.2) return .85;
  }
  if (scene === 'step-down') {
    if (x <= -1) return .78;
    if (x >= 1.2 && x < 2.7) return .28 * (1 - (x - 1.2) / 1.5);
  }
  if (scene === 'rollers') return Math.abs(x) < 3.6 ? .13 * (1 + Math.cos(2 * Math.PI * x / 2.4)) * smooth((3.6 - Math.abs(x)) / .5) : 0;
  if (scene === 'drop') return x <= -.75 ? .62 : 0;
  if (scene === 'gap') return Math.abs(x) < .7 ? -.3 : 0;
  if (scene === 'ledge') return x >= LEDGE_START && x <= LEDGE_END && Math.abs(z) < .7 ? LEDGE_HEIGHT : 0;
  if (scene === 'rocks') return ROCKS.reduce((h, r) => Math.max(h, r.height * Math.sqrt(Math.max(0, 1 - ((x - r.x) ** 2 + (z - r.z) ** 2) / r.radius ** 2))), 0);
  if (scene === 'berm') {
    const r = Math.hypot(x, z - 2);
    return r > 2.4 && r < 3.5 ? .55 * smooth((r - 2.4) / 1.1) : 0;
  }
  return 0;
}

export function terrainPitch(scene: SceneKind, x: number, z = 0): number {
  return Math.atan2(heightAt(scene, x + .6, z) - heightAt(scene, x - .6, z), 1.2);
}

export function wheelGroundHeight(scene: SceneKind, x: number, z = 0): number {
  return (heightAt(scene, x + .6, z) + heightAt(scene, x - .6, z)) / 2;
}
