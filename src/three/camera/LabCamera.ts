import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CameraPreset } from '../../types';

const PRESETS: Record<CameraPreset, [number, number, number]> = {
  'three-quarter': [2.6, 1.65, 3.8], side: [.05, 1.1, 5.3],
  front: [5.7, 1.2, .1], rear: [-5.7, 1.2, .1],
  follow: [-3.7, 1.7, 4.1], apex: [2.8, 1.5, 4.5],
};

export class LabCamera {
  readonly camera = new PerspectiveCamera(34, 1, .025, 180);
  readonly controls: OrbitControls;
  preset: CameraPreset = 'three-quarter';
  automatic = true;
  riderVisible = true;
  side = 1;
  private target = new Vector3(0, .9, 0);
  private previousTarget = new Vector3();
  private first = true;
  private aspect = 1;
  private interaction = false;

  constructor(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .09;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.enablePan = false;
    this.controls.addEventListener('start', () => { this.interaction = true; });
    this.controls.addEventListener('end', () => { this.interaction = false; });
    this.camera.position.set(...PRESETS['three-quarter']);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setPreset(preset: CameraPreset) { this.preset = preset; }

  private focus(center: Vector3) {
    this.target.copy(center);
    if (!this.riderVisible) this.target.y -= .27;
  }

  private offset() {
    const offset = new Vector3(...PRESETS[this.preset]);
    offset.z *= this.side;
    // Keep the full wheelbase on narrow stages while letting the desktop
    // inspection view show small parts without requiring a manual zoom.
    const narrow = Math.max(1, (this.riderVisible ? 1.25 : 1.50) / this.aspect);
    const scale = this.riderVisible ? .84 : this.preset === 'side' ? .56 : .62;
    if (!this.riderVisible) offset.y *= .82;
    return offset.multiplyScalar(narrow * scale);
  }

  recenter(center: Vector3) {
    this.focus(center);
    const shift = this.target.clone().sub(this.controls.target);
    this.camera.position.add(shift);
    this.controls.target.copy(this.target);
    this.previousTarget.copy(this.target);
  }

  update(center: Vector3, dt: number, snap = false) {
    this.focus(center);
    if (this.first || snap) {
      this.controls.target.copy(this.target);
      this.camera.position.copy(this.target).add(this.offset());
      this.previousTarget.copy(this.target);
      this.first = false;
    } else if (this.automatic && !this.interaction) {
      const t = 1 - Math.exp(-Math.min(dt, .08) * 7);
      this.controls.target.lerp(this.target, t);
      const desired = this.offset().add(this.target);
      this.camera.position.lerp(desired, t);
    } else {
      const shift = this.target.clone().sub(this.previousTarget);
      this.camera.position.add(shift);
      this.controls.target.add(shift);
    }
    this.previousTarget.copy(this.target);
    this.controls.update();
  }

  dispose() { this.controls.dispose(); }
}
