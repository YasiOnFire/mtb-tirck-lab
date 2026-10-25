import type { Trick, TrickPose } from '../../types';
import { sampleTrick } from './TrickPrimitives';

export class TrickPlayer {
  time = 0;
  playing = false;
  loop = true;
  speed = 1;
  constructor(public trick: Trick) {}
  select(trick: Trick): void {
    this.trick = trick;
    this.time = 0;
    this.playing = trick.status !== 'unavailable';
  }
  seek(time: number): TrickPose {
    this.time = Math.max(0, Math.min(this.trick.duration, Number.isFinite(time) ? time : 0));
    return this.sample();
  }
  restart(): void { this.time = 0; this.playing = this.trick.status !== 'unavailable'; }
  sample(): TrickPose { return sampleTrick(this.trick, this.time); }
  update(dt: number): TrickPose {
    if (this.playing && Number.isFinite(dt) && dt > 0 && this.trick.status !== 'unavailable') {
      this.time += dt * Math.max(0, this.speed);
      if (this.time >= this.trick.duration) {
        if (this.loop) this.time %= this.trick.duration;
        else { this.time = this.trick.duration; this.playing = false; }
      }
    }
    return this.sample();
  }
}
