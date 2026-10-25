import type { LabSettings, LabTelemetry } from '../types';

export class SceneAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private rolling?: GainNode;
  private wind?: GainNode;
  private drivetrain?: GainNode;
  private buffer?: AudioBuffer;
  private sources: AudioBufferSourceNode[] = [];
  private previous?: Pick<LabTelemetry, 'time' | 'grounded'>;

  async unlock(): Promise<void> {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      const context = this.context = new AudioContext();
      this.master = context.createGain();
      this.master.gain.value = 0;
      this.master.connect(context.destination);
      const buffer = this.buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 1777;
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        smooth = (smooth + (seed / 1073741823.5 - 1) * 0.035) / 1.035;
        data[i] = smooth * 4;
      }
      this.rolling = this.noiseLoop(650, 0.8);
      this.wind = this.noiseLoop(1100, 0.3);
      const ratchet = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const clicks = ratchet.getChannelData(0);
      for (let i = 0; i < clicks.length; i++) {
        seed = (seed * 16807) % 2147483647;
        clicks[i] = (seed / 1073741823.5 - 1) * Math.exp(-((i / context.sampleRate * 23) % 1) * 35);
      }
      this.drivetrain = this.noiseLoop(2100, 1.4, ratchet);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  private noiseLoop(frequency: number, q: number, buffer = this.buffer): GainNode {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = buffer!;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master!);
    source.start();
    this.sources.push(source);
    return gain;
  }

  update(telemetry: LabTelemetry, settings: LabSettings): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const moving = telemetry.playing && Math.abs(telemetry.speed) > 0.05;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume * 0.4, now, 0.08);
    this.rolling?.gain.setTargetAtTime(moving && telemetry.grounded ? Math.min(0.8, Math.abs(telemetry.speed) * 0.09) : 0, now, 0.1);
    this.wind?.gain.setTargetAtTime(moving && !telemetry.grounded ? 0.25 : 0, now, 0.15);
    this.drivetrain?.gain.setTargetAtTime(moving ? Math.min(0.09, Math.abs(telemetry.speed) * 0.015) : 0, now, 0.1);
    const elapsed = this.previous ? telemetry.time - this.previous.time : 0;
    if (this.previous && !this.previous.grounded && telemetry.grounded && telemetry.playing && elapsed > 0 && elapsed < 0.2) {
      this.land(Math.min(1, telemetry.frontCompression / 0.12 + telemetry.rearCompression / 0.12));
    }
    this.previous = { time: telemetry.time, grounded: telemetry.grounded };
  }

  private land(strength: number): void {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.buffer!;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.4 + strength * 0.7, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.24);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start();
    source.stop(context.currentTime + 0.25);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  reset(): void { this.previous = undefined; }
  dispose(): void {
    this.sources.forEach(source => { source.stop(); source.disconnect(); });
    this.sources = [];
    if (this.context) void this.context.close();
    this.context = undefined;
  }
}
