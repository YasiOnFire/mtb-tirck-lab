export type Vec3 = [number, number, number];
export type TrickStatus = 'verified' | 'assisted' | 'stylized' | 'unavailable';
export type SceneKind = 'flat' | 'jump' | 'rollers' | 'drop' | 'ledge' | 'wall' | 'berm' | 'rocks' | 'gap' | 'step-up' | 'step-down';
export type CameraPreset = 'three-quarter' | 'side' | 'front' | 'rear' | 'follow' | 'apex';
export interface Phase { name: string; start: number; end: number }
export interface Trick {
  id: string; nameEn: string; namePl?: string; spokenEn: string; spokenPl?: string;
  descriptionPl: string; category: string; family: string; scene: SceneKind;
  status: TrickStatus; note: string; duration: number; phases: Phase[];
  primitives: Record<string, number>; camera: CameraPreset;
}
export interface TrickPose {
  time: number; progress: number; phase: string;
  position: Vec3;
  yaw: number; pitch: number; roll: number;
  steering: number; tailwhip: number;
  frontCompression: number; rearCompression: number;
  wheelAngle: number; crankAngle: number;
  frontWheelAngle?: number; rearWheelAngle?: number;
  bodyShift: Vec3; crouch: number;
  bodyYaw?: number;
  chestLean?: number;
  headLook?: Vec3;
  footMotion?: 'spread' | 'can-can' | 'nac-nac' | 'indian' | 'pendulum' | 'plant' | 'turndown';
  footMotionPhase?: number;
  handRelease: [number, number]; footRelease: [number, number];
  handStyle: 'spread' | 'seat' | 'tuck'; footStyle: 'spread' | 'superman' | 'can';
  grounded: boolean; frontContact: boolean; rearContact: boolean;
  pivot: 'center' | 'rear' | 'front'; speed: number; impact: number;
}
export interface LabSettings {
  playing: boolean; loop: boolean; speed: number; camera: CameraPreset;
  autoCamera: boolean; riderVisible: boolean; muted: boolean; volume: number;
  narrator: boolean; speechRate: number; voiceEn: string; voicePl: string;
  quality: 'auto' | 'high' | 'low';
}
export interface LabTelemetry {
  time: number; duration: number; phase: string; progress: number;
  frontCompression: number; rearCompression: number; speed: number;
  fps: number; playing: boolean; grounded: boolean; drawCalls: number;
}
