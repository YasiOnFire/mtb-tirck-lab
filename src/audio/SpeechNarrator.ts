import type { Trick } from '../types';

export interface NarrationOptions { enabled: boolean; rate: number; voiceEn: string; voicePl: string }

export class SpeechNarrator {
  private synth: SpeechSynthesis | undefined;
  private voices: SpeechSynthesisVoice[] = [];
  private onVoices?: (voices: SpeechSynthesisVoice[]) => void;
  private readonly refresh = () => {
    this.voices = this.synth?.getVoices().filter(voice => voice.localService) ?? [];
    this.onVoices?.([...this.voices]);
  };

  constructor(onVoices?: (voices: SpeechSynthesisVoice[]) => void) {
    this.onVoices = onVoices;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    this.synth?.addEventListener('voiceschanged', this.refresh);
    this.refresh();
  }

  get available(): boolean { return !!this.synth; }
  get localVoices(): SpeechSynthesisVoice[] { return [...this.voices]; }

  speak(trick: Pick<Trick, 'spokenEn' | 'spokenPl'>, options: NarrationOptions): 'spoken' | 'disabled' | 'unavailable' {
    this.cancel();
    if (!options.enabled) return 'disabled';
    if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') return 'unavailable';
    this.refresh();
    const enVoice = this.voices.find(v => v.voiceURI === options.voiceEn && v.lang.startsWith('en'))
      ?? this.voices.find(v => /^en[-_](US|GB)/i.test(v.lang))
      ?? this.voices.find(v => /^en/i.test(v.lang));
    const plVoice = this.voices.find(v => v.voiceURI === options.voicePl && v.lang.startsWith('pl'))
      ?? this.voices.find(v => /^pl/i.test(v.lang));
    if (!enVoice) return 'unavailable';
    const say = (text: string, voice: SpeechSynthesisVoice) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = Math.max(0.5, Math.min(1.5, options.rate));
      utterance.volume = 0.85;
      this.synth!.speak(utterance);
    };
    say(trick.spokenEn, enVoice);
    if (trick.spokenPl && plVoice) say(trick.spokenPl, plVoice);
    return 'spoken';
  }

  cancel(): void { this.synth?.cancel(); }
  dispose(): void {
    this.cancel();
    this.synth?.removeEventListener('voiceschanged', this.refresh);
    this.onVoices = undefined;
  }
}
