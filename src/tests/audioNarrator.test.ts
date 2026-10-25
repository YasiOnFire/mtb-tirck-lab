import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechNarrator } from '../audio/SpeechNarrator';

class MockUtterance {
  voice?: SpeechSynthesisVoice;
  lang = '';
  rate = 1;
  volume = 1;
  constructor(public text: string) {}
}

const voice = (name: string, lang: string, localService = true): SpeechSynthesisVoice => ({
  name, lang, localService, default: false, voiceURI: name
});
const options = { enabled: true, rate: 0.9, voiceEn: '', voicePl: '' };

describe('local speech narration', () => {
  let available = [voice('English', 'en-US'), voice('Polski', 'pl-PL')];
  const synth = { getVoices: vi.fn(() => available), cancel: vi.fn(), speak: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    available = [voice('English', 'en-US'), voice('Polski', 'pl-PL')];
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not speak on construction and reads EN then the real PL name after interaction', () => {
    const narrator = new SpeechNarrator();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(narrator.speak({ spokenEn: 'Backflip', spokenPl: 'salto w tył' }, options)).toBe('spoken');
    expect(synth.speak.mock.calls.map(call => (call[0] as MockUtterance).text)).toEqual(['Backflip', 'salto w tył']);
    expect((synth.speak.mock.calls[0]![0] as MockUtterance).lang).toBe('en-US');
    expect((synth.speak.mock.calls[1]![0] as MockUtterance).lang).toBe('pl-PL');
    narrator.dispose();
  });
  it('cancels the previous name before every new selection rather than leaving a queue', () => {
    const narrator = new SpeechNarrator();
    narrator.speak({ spokenEn: 'Wheelie' }, options);
    narrator.speak({ spokenEn: 'Manual' }, options);
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(synth.cancel.mock.invocationCallOrder[1]).toBeLessThan(synth.speak.mock.invocationCallOrder[1]!);
    narrator.dispose();
  });
  it('waits for voiceschanged and never invokes a network voice as an offline fallback', () => {
    available = [voice('Remote', 'en-US', false)];
    const changed = vi.fn();
    const narrator = new SpeechNarrator(changed);
    expect(narrator.speak({ spokenEn: '360' }, options)).toBe('unavailable');
    expect(synth.speak).not.toHaveBeenCalled();
    available = [voice('British local', 'en-GB')];
    const refresh = synth.addEventListener.mock.calls[0]![1] as () => void;
    refresh();
    expect(changed.mock.lastCall?.[0]).toHaveLength(1);
    expect(narrator.speak({ spokenEn: 'Three sixty' }, options)).toBe('spoken');
    narrator.dispose();
    expect(synth.removeEventListener).toHaveBeenCalledWith('voiceschanged', refresh);
  });
  it('disabling narration cancels speech and prevents a new utterance', () => {
    const narrator = new SpeechNarrator();
    expect(narrator.speak({ spokenEn: 'Tabletop' }, { ...options, enabled: false })).toBe('disabled');
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).not.toHaveBeenCalled();
    narrator.dispose();
  });
});
