import RAPIER from '@dimforge/rapier3d-compat';
import { clamp } from '../tricks/terrain';

export const FIXED_DT = 1 / 120;
const GRAVITY = 9.81;
const MASS = 94;
const RADIUS = .37;
let ready = false;
let initialization: Promise<void> | undefined;

export interface FlightSample { x: number; y: number; velocityY: number; contact: boolean; time: number }
export interface FlightTrack { samples: FlightSample[]; duration: number; impulse: number; physical: boolean; peak: number }
const tracks = new Map<string, FlightTrack>();

export class PhysicsWorld {
  static async create(): Promise<PhysicsWorld> {
    initialization ??= RAPIER.init().then(() => { ready = true; tracks.clear(); });
    await initialization;
    return new PhysicsWorld();
  }

  get ready(): boolean { return ready; }
  get cachedProfiles(): number { return tracks.size; }
  getFlight(peak: number, startHeight = 0, endHeight = 0): FlightTrack {
    return getFlightTrack(peak, startHeight, endHeight);
  }
  dispose(): void { tracks.clear(); }
}

export function getFlightTrack(peak: number, startHeight = 0, endHeight = 0, horizontalSpeed?: number): FlightTrack {
  const key = `${peak}:${startHeight}:${endHeight}:${horizontalSpeed ?? 'auto'}`;
  const existing = tracks.get(key);
  if (existing) return existing;
  const vy = Math.sqrt(2 * GRAVITY * Math.max(0, peak));
  const expected = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * (startHeight - endHeight))) / GRAVITY;
  const speed = horizontalSpeed ?? 2.2 / Math.max(.1, expected);
  const samples: FlightSample[] = [{ x: 0, y: startHeight, velocityY: vy, contact: false, time: 0 }];
  let impulse = MASS * Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, startHeight - endHeight));
  if (ready) {
    const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    const events = new RAPIER.EventQueue(true);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-1, startHeight + RADIUS, 0).setLinvel(speed, vy, 0).setCcdEnabled(true).lockRotations());
    world.createCollider(RAPIER.ColliderDesc.ball(RADIUS).setMass(MASS).setFriction(.72).setRestitution(.015).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0), body);
    const floorStart = endHeight > startHeight ? -1 + speed * expected * .6 : -4;
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, .1, 2).setTranslation(20 + floorStart, endHeight - .1, 0).setFriction(.72));
    let touched = false;
    for (let i = 1; i <= 900; i++) {
      world.step(events);
      let collisionImpulse = 0;
      events.drainContactForceEvents(event => { collisionImpulse += event.totalForceMagnitude() * FIXED_DT; });
      const p = body.translation();
      const v = body.linvel();
      if (collisionImpulse > 1 && i * FIXED_DT > expected * .4) {
        impulse = collisionImpulse;
        touched = true;
      }
      samples.push({ x: p.x + 1, y: p.y - RADIUS, velocityY: v.y, contact: touched, time: i * FIXED_DT });
      if (touched) break;
    }
    events.free();
    world.free();
  } else {
    for (let t = FIXED_DT; t <= expected + FIXED_DT; t += FIXED_DT) {
      const time = Math.min(t, expected);
      samples.push({ x: speed * time, y: startHeight + vy * time - .5 * GRAVITY * time ** 2, velocityY: vy - GRAVITY * time, contact: t >= expected, time });
    }
  }
  // Rapier reports the impact impulse after its solver has already allowed a
  // small penetration. Keep that real impulse, but end the visible trajectory
  // at the earlier interpolated tyre/surface crossing instead of displaying
  // penetration followed by a one-frame upward snap.
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.velocityY < 0 && a.y >= endHeight && b.y <= endHeight && b.time > expected * .4) {
      const f = clamp((a.y - endHeight) / Math.max(1e-9, a.y - b.y));
      samples.splice(i, samples.length - i, {
        x: a.x + (b.x - a.x) * f, y: endHeight, velocityY: a.velocityY + (b.velocityY - a.velocityY) * f,
        time: a.time + (b.time - a.time) * f, contact: true,
      });
      break;
    }
  }
  const last = samples[samples.length - 1];
  last.y = endHeight;
  last.contact = true;
  const track = { samples, duration: last.time, impulse, physical: ready, peak: Math.max(...samples.map(p => p.y)) };
  tracks.set(key, track);
  return track;
}

export function sampleFlight(peak: number, startHeight: number, endHeight: number, progress: number): FlightSample & { impulse: number; physical: boolean } {
  const track = getFlightTrack(peak, startHeight, endHeight);
  const t = clamp(progress) * (track.samples.length - 1);
  const i = Math.floor(t), f = t - i;
  const a = track.samples[i], b = track.samples[Math.min(i + 1, track.samples.length - 1)];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, velocityY: a.velocityY + (b.velocityY - a.velocityY) * f, time: a.time + (b.time - a.time) * f, contact: progress >= 1, impulse: track.impulse, physical: track.physical };
}

export function samplePhysicalFlight(track: FlightTrack, elapsed: number): FlightSample {
  const time = clamp(elapsed, 0, track.duration);
  const p = time / FIXED_DT, i = Math.min(track.samples.length - 2, Math.floor(p));
  const a = track.samples[Math.max(0, i)], b = track.samples[Math.max(0, i) + 1] ?? a;
  const f = clamp((time - a.time) / Math.max(1e-9, b.time - a.time));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, velocityY: a.velocityY + (b.velocityY - a.velocityY) * f, time, contact: time >= track.duration };
}

export interface SpringState { compression: number; velocity: number }
export class SuspensionSpring {
  state: SpringState;
  constructor(public travel: number, public sag = travel * .27, public mass = 47, public stiffness = 12000, public damping = 1100) {
    this.state = { compression: sag, velocity: 0 };
  }
  reset(): void { this.state = { compression: this.sag, velocity: 0 }; }
  impulse(value: number): void { this.state.velocity += value / this.mass; }
  step(dt: number, load = 0): number {
    this.state.velocity += (load - this.stiffness * (this.state.compression - this.sag) - this.damping * this.state.velocity) / this.mass * dt;
    this.state.compression += this.state.velocity * dt;
    if (this.state.compression <= 0 || this.state.compression >= this.travel) this.state.velocity *= -.05;
    this.state.compression = clamp(this.state.compression, 0, this.travel);
    return this.state.compression;
  }
}

const responseCache = new Map<string, number[]>();
export function landingCompression(elapsed: number, impulse: number, front: boolean): number {
  const travel = front ? .15 : .14;
  const sag = travel * .27;
  if (elapsed <= 0 || elapsed > 1.6) return sag;
  const quantized = Math.round(impulse / 25) * 25;
  const key = `${front}:${quantized}`;
  let response = responseCache.get(key);
  if (!response) {
    const spring = new SuspensionSpring(travel, sag);
    spring.impulse(clamp(quantized * (front ? .19 : .22), 0, 130));
    response = [sag];
    for (let i = 0; i < 200; i++) response.push(spring.step(FIXED_DT));
    responseCache.set(key, response);
  }
  const p = elapsed / FIXED_DT, i = Math.min(response.length - 2, Math.floor(p)), f = p - i;
  return response[i] + (response[i + 1] - response[i]) * f;
}
