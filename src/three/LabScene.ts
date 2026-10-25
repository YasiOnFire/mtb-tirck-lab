import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BikeRig } from './bike/BikeRig';
import { RiderRig } from './rider/RiderRig';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { TrickPlayer } from './tricks/TrickPlayer';
import { sampleTrick } from './tricks/TrickPrimitives';
import { resolveGroundPose } from './physics/groundSupport';
import { TRICKS } from '../data/tricks';
import { LabCamera } from './camera/LabCamera';
import { Studio } from './environment/Studio';
import { disposeTree } from './dispose';
import type { LabSettings, LabTelemetry, Trick, TrickPose } from '../types';

const DEFAULTS: LabSettings = {
  playing: false, loop: true, speed: 1, camera: 'three-quarter', autoCamera: true,
  riderVisible: true, muted: true, volume: .4, narrator: true, speechRate: .9,
  voiceEn: '', voicePl: '', quality: 'auto',
};

export class LabScene {
  readonly scene = new THREE.Scene();
  readonly bike: BikeRig;
  readonly rider: RiderRig;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: LabCamera;
  readonly studio = new Studio();
  readonly player: TrickPlayer;
  private physics: PhysicsWorld;
  private settings = { ...DEFAULTS };
  private trick: Trick;
  private pose: TrickPose;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private last = 0;
  private lastTelemetry = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;
  private qualityCooldown = 0;
  private pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  private alive = true;
  private appliedTime = -1;
  private needsRender = true;
  private renderedCameraPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  private renderedCameraQuaternion = new THREE.Quaternion();
  private center = new THREE.Vector3();
  private environmentMap: THREE.WebGLRenderTarget;
  private debug = new URLSearchParams(location.search).get('debug') === '1';
  private debugRoot = new THREE.Group();
  private contacts: THREE.Mesh[] = [];
  private debugAxes?: THREE.AxesHelper;
  private debugTrajectory?: THREE.Line;
  private contactWorld = { front: new THREE.Vector3(), rear: new THREE.Vector3() };
  private shadowLight = new THREE.DirectionalLight(0xffe9d7, 3.2);

  static async create(container: HTMLElement, onTelemetry: (telemetry: LabTelemetry) => void) {
    const downloaded = __DOWNLOADED_MODELS_AVAILABLE__ && new URLSearchParams(location.search).get('models') === 'downloaded';
    const [physics, rider, bike] = await Promise.all([
      PhysicsWorld.create(), RiderRig.create(downloaded),
      downloaded ? BikeRig.createDownloaded() : Promise.resolve(new BikeRig()),
    ]);
    return new LabScene(container, onTelemetry, physics, rider, bike);
  }

  private constructor(private container: HTMLElement, private onTelemetry: (telemetry: LabTelemetry) => void, physics: PhysicsWorld, rider: RiderRig, bike: BikeRig) {
    this.physics = physics;
    this.rider = rider;
    this.bike = bike;
    this.trick = TRICKS.find((t) => t.id === 'bunny-hop') ?? TRICKS[0]!;
    this.player = new TrickPlayer(this.trick);
    this.player.playing = false;
    this.pose = sampleTrick(this.trick, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interaktywny model roweru MTB w 3D. Przeciągnij, aby obrócić kamerę.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.dataset.testid = 'scene-canvas';
    this.container.appendChild(this.renderer.domElement);
    this.camera = new LabCamera(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x19161e);
    this.scene.fog = new THREE.Fog(0x19161e, 9, 32);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentMap = pmrem.fromScene(room, .04);
    room.dispose(); pmrem.dispose();
    this.scene.environment = this.environmentMap.texture;
    this.scene.environmentIntensity = .95;
    this.scene.add(new THREE.HemisphereLight(0xd7d3ea, 0x4a332a, 1.5));
    this.shadowLight.position.set(-3, 9, 5);
    this.shadowLight.castShadow = true;
    this.shadowLight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.shadowLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .1, far: 24 });
    this.shadowLight.shadow.normalBias = .015;
    this.shadowLight.shadow.bias = -.0002;
    this.shadowLight.shadow.radius = 3;
    this.scene.add(this.shadowLight, this.shadowLight.target);
    const rim = new THREE.DirectionalLight(0xd6caff, 4.2);
    rim.position.set(2, 4, -4);
    const purpleFill = new THREE.DirectionalLight(0x7137ef, .65);
    purpleFill.position.set(-4, 2, -2);
    this.scene.add(purpleFill);
    this.scene.add(rim, this.studio.root, this.bike.root);
    this.bike.root.add(this.rider.root);
    this.studio.setScene(this.trick.scene);
    if (this.debug) this.setupDebug();
    this.applyPose(true);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.camera.update(this.center, 0, true);
    this.frame = requestAnimationFrame(this.tick);
  }

  selectTrick(trick: Trick) {
    this.trick = trick;
    this.player.select(trick);
    this.player.playing = trick.status !== 'unavailable';
    this.settings.playing = this.player.playing;
    this.pose = sampleTrick(trick, 0);
    this.studio.setScene(trick.scene);
    // Show the side that receives the crossing leg instead of hiding it behind the frame.
    this.camera.side = trick.scene === 'wall' || trick.primitives.cancan || trick.primitives.nacnac ? -1 : 1;
    if (this.debug) this.updateDebugTrajectory();
    this.appliedTime = -1;
    this.applyPose(true);
    this.camera.recenter(this.center);
    this.emitTelemetry();
  }

  updateSettings(settings: LabSettings) {
    this.needsRender = true;
    const previousQuality = this.settings.quality;
    this.settings = { ...settings };
    this.player.playing = settings.playing && this.trick.status !== 'unavailable';
    this.player.loop = settings.loop;
    this.player.speed = settings.speed;
    this.camera.automatic = settings.autoCamera;
    this.camera.riderVisible = settings.riderVisible;
    this.camera.setPreset(settings.camera);
    this.rider.root.visible = settings.riderVisible;
    if (settings.quality !== previousQuality) this.setQuality();
    this.emitTelemetry();
  }

  seek(time: number) {
    this.player.seek(time);
    this.pose = sampleTrick(this.trick, this.player.time);
    this.applyPose(true);
    this.camera.update(this.center, 0, true);
    this.emitTelemetry();
  }

  restart() {
    this.player.restart();
    this.player.playing = this.trick.status !== 'unavailable';
    this.pose = sampleTrick(this.trick, 0);
    this.applyPose(true);
    this.camera.recenter(this.center);
    this.emitTelemetry();
  }

  resetCamera() { this.camera.update(this.center, 0, true); this.needsRender = true; }

  private resize() {
    this.needsRender = true;
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1));
    this.camera.resize(width, height);
  }

  private setQuality() {
    this.pixelRatio = this.settings.quality === 'high' ? Math.min(devicePixelRatio, 2) : this.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    const shadowSize = this.settings.quality === 'low' ? 1024 : 2048;
    this.shadowLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.shadowLight.shadow.map?.dispose();
    this.shadowLight.shadow.map = null;
    this.resize();
  }

  private applyPose(force = false) {
    if (!force && this.appliedTime === this.pose.time) return;
    this.needsRender = true;
    this.appliedTime = this.pose.time;
    this.bike.root.position.set(0, 0, 0);
    this.bike.root.quaternion.identity();
    this.bike.apply(this.pose);
    this.rider.apply(this.pose, this.bike.getAnchors());
    const local = this.bike.getContacts();
    const transform = resolveGroundPose(this.pose, local, this.trick.scene, this.bike.wheelRadius);
    this.bike.root.quaternion.copy(transform.quaternion);
    this.bike.root.position.copy(transform.position);
    this.bike.root.updateMatrixWorld(true);
    this.center.copy(this.bike.root.localToWorld(new THREE.Vector3(0, .93, 0)));
    this.contactWorld.front.copy(this.bike.root.localToWorld(local.front.clone()));
    this.contactWorld.rear.copy(this.bike.root.localToWorld(local.rear.clone()));
    if (this.debug) {
      [this.contactWorld.front, this.contactWorld.rear].forEach((point, i) => {
        this.contacts[i]!.position.copy(point).add(new THREE.Vector3(0, -this.bike.wheelRadius, 0));
        (this.contacts[i]!.material as THREE.MeshBasicMaterial).color.set((i === 0 ? this.pose.frontContact : this.pose.rearContact) ? 0x41b352 : 0xda674f);
      });
    }
  }

  private tick = (now: number) => {
    if (!this.alive) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, .1) : 0;
    this.last = now;
    this.fpsFrames++; this.fpsTime += dt;
    if (this.fpsTime > 1) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0; this.fpsTime = 0;
      this.qualityCooldown++;
      if (this.settings.quality === 'auto' && this.fps < 40 && this.qualityCooldown > 5 && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - .25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.qualityCooldown = 0;
      }
    }
    this.player.speed = this.settings.speed;
    const previousTime = this.pose.time;
    this.pose = this.player.update(dt);
    this.applyPose();
    if (this.pose.time < previousTime) this.camera.recenter(this.center);
    this.camera.update(this.center, dt);
    this.studio.update(this.camera.camera.position);
    const camera = this.camera.camera;
    const cameraMoved = camera.position.distanceToSquared(this.renderedCameraPosition) > 1e-10 || camera.quaternion.angleTo(this.renderedCameraQuaternion) > 1e-5;
    if (this.needsRender || cameraMoved) {
      this.renderer.render(this.scene, camera);
      this.renderedCameraPosition.copy(camera.position);
      this.renderedCameraQuaternion.copy(camera.quaternion);
      this.needsRender = false;
    }
    if (now - this.lastTelemetry > 66) { this.emitTelemetry(); this.lastTelemetry = now; }
    this.frame = requestAnimationFrame(this.tick);
  };

  private emitTelemetry() {
    this.onTelemetry({ time: this.player.time, duration: this.trick.duration, phase: this.pose.phase,
      progress: this.pose.progress, frontCompression: this.pose.frontCompression, rearCompression: this.pose.rearCompression,
      speed: this.pose.speed, fps: this.fps, playing: this.player.playing, grounded: this.pose.grounded,
      drawCalls: this.renderer.info.render.calls });
  }

  private setupDebug() {
    const axes = this.debugAxes = new THREE.AxesHelper(1.3);
    axes.position.y = .34;
    this.bike.root.add(axes);
    this.contacts = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0x41b352, depthTest: false })));
    this.debugRoot.add(...this.contacts);
    this.scene.add(this.debugRoot);
    this.updateDebugTrajectory();
    const lab = this;
    (window as unknown as Record<string, unknown>).__MTB_LAB__ = {
      select: (id: string) => { const t = TRICKS.find((t) => t.id === id || t.nameEn === id); if (t) lab.selectTrick(t); },
      seek: (time: number) => lab.seek(time),
      pause: () => { lab.player.playing = false; },
      play: () => { if (lab.trick.status !== 'unavailable') lab.player.playing = true; },
      setCamera: (preset: LabSettings['camera']) => { lab.camera.setPreset(preset); lab.resetCamera(); },
      showDebug: (show: boolean) => { lab.debugRoot.visible = show; if (lab.debugAxes) lab.debugAxes.visible = show; lab.needsRender = true; },
      inspect: () => lab.inspect(),
    };
  }

  private updateDebugTrajectory() {
    if (this.debugTrajectory) {
      this.debugRoot.remove(this.debugTrajectory);
      this.debugTrajectory.geometry.dispose();
      (this.debugTrajectory.material as THREE.Material).dispose();
    }
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const p = sampleTrick(this.trick, this.trick.duration * i / 120);
      points.push(new THREE.Vector3(...p.position).add(new THREE.Vector3(0, .8, 0)));
    }
    this.debugTrajectory = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0x8063b9, dashSize: .06, gapSize: .045, transparent: true, opacity: .7 }));
    this.debugTrajectory.computeLineDistances();
    this.debugRoot.add(this.debugTrajectory);
  }

  inspect() {
    this.camera.camera.updateMatrixWorld(true);
    let finite = true;
    this.bike.root.traverse((o) => { if (![...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(Number.isFinite)) finite = false; });
    const bounds = new THREE.Box3();
    this.bike.root.traverseVisible(o => {
      if (o instanceof THREE.SkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); }
      if (o instanceof THREE.Mesh) bounds.expandByObject(o);
    });
    const corners: number[][] = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).project(this.camera.camera).toArray());
    return { trick: this.trick.id, duration: this.trick.duration, phases: this.trick.phases, pose: this.pose, finite, contacts: { front: this.contactWorld.front.toArray(), rear: this.contactWorld.rear.toArray() },
      suspension: this.bike.debugData,
      rider: { asset: Boolean(this.rider.skin), model: this.rider.skin?.asset, helmet: this.rider.importedHelmet ? 'half-shell' : 'full-face', ...Object.fromEntries(Object.entries(this.rider.debugData).map(([key, value]) => [key, value instanceof THREE.Vector3 ? value.toArray() : Array.isArray(value) ? value.map(item => item instanceof THREE.Vector3 ? item.toArray() : item) : value])) },
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, corners,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, fps: this.fps,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, pixelRatio: this.pixelRatio, camera: this.camera.camera.position.toArray() };
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.camera.dispose();
    this.physics.dispose();
    this.rider.dispose();
    this.bike.dispose();
    disposeTree(this.debugRoot);
    this.studio.dispose();
    this.environmentMap.dispose();
    this.shadowLight.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    if (this.debug) delete (window as unknown as Record<string, unknown>).__MTB_LAB__;
  }
}
