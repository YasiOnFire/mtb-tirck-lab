<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Icon from './ui/Icon.vue';
import MastheadArt from './ui/MastheadArt.vue';
import { TRICKS, CATEGORIES, normalizeSearch } from './data/tricks';
import type { LabScene } from './three/LabScene';
import { SpeechNarrator } from './audio/SpeechNarrator';
import { SceneAudio } from './audio/SceneAudio';
import type { CameraPreset, LabSettings, LabTelemetry, Trick, TrickStatus } from './types';

const stage = ref<HTMLDivElement>();
const selected = ref<Trick>(TRICKS.find(trick => trick.id === 'bunny-hop') ?? TRICKS[0]!);
const search = ref('');
const category = ref('');
const onlyAvailable = ref(false);
const atlasOpen = ref(false);
const settingsOpen = ref(false);
const ready = ref(false);
const error = ref('');
const announcement = ref('');
const voices = ref<SpeechSynthesisVoice[]>([]);
const settings = reactive<LabSettings>({
  playing: false, loop: true, speed: 1, camera: 'three-quarter', autoCamera: true,
  riderVisible: true, muted: true, volume: 0.5, narrator: true, speechRate: 0.9,
  voiceEn: '', voicePl: '', quality: 'auto'
});
const telemetry = reactive<LabTelemetry>({
  time: 0, duration: selected.value.duration, phase: 'Gotowy do pokazu', progress: 0,
  frontCompression: 0.04, rearCompression: 0.035, speed: 0, fps: 0,
  playing: false, grounded: true, drawCalls: 0
});
let scene: LabScene | undefined;
let narrator: SpeechNarrator | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const audio = new SceneAudio();
const debug = new URLSearchParams(location.search).has('debug');
const statusLabels: Record<TrickStatus, string> = {
  verified: 'Zweryfikowany', assisted: 'Pokaz wspomagany',
  stylized: 'Pokaz stylizowany', unavailable: 'W przygotowaniu'
};
const statusShort: Record<TrickStatus, string> = {
  verified: 'Zweryfikowany', assisted: 'Wspomagany', stylized: 'Stylizowany', unavailable: 'W przygotowaniu'
};
const categoryShort = ['Podstawy i kontrola', 'Dirt jump i slopestyle', 'Obroty i salta', 'Street i trial', 'Techniki terenowe'];
const cameraPresets: { value: CameraPreset; label: string }[] = [
  { value: 'three-quarter', label: '3/4' }, { value: 'side', label: 'Bok' },
  { value: 'front', label: 'Przód' }, { value: 'rear', label: 'Tył' },
  { value: 'follow', label: 'Śledzenie' }, { value: 'apex', label: 'Slow-mo' }
];
const isAvailable = computed(() => selected.value.status !== 'unavailable');
const availableCount = computed(() => TRICKS.filter(trick => trick.status !== 'unavailable').length);
const filtered = computed(() => {
  const query = normalizeSearch(search.value.trim());
  return TRICKS.filter(trick => (!category.value || trick.category === category.value)
    && (!onlyAvailable.value || trick.status !== 'unavailable')
    && (!query || normalizeSearch(`${trick.nameEn} ${trick.namePl ?? ''} ${trick.descriptionPl}`).includes(query)));
});
const groups = computed(() => CATEGORIES.map((name, index) => ({
  name, index, tricks: filtered.value.filter(trick => trick.category === name)
})).filter(group => group.tricks.length));
const enVoices = computed(() => voices.value.filter(voice => /^en/i.test(voice.lang)));
const plVoices = computed(() => voices.value.filter(voice => /^pl/i.test(voice.lang)));
const compressionFront = computed(() => Math.round(telemetry.frontCompression * 1000));
const compressionRear = computed(() => Math.round(telemetry.rearCompression * 1000));

function announce(text: string): void {
  announcement.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => announcement.value = '', 4500);
}
function unlockAudio(): void { void audio.unlock().catch(() => announce('Dźwięk sceny jest niedostępny w tej przeglądarce.')); }
function speak(trick: Trick): void {
  const result = narrator?.speak(trick, {
    enabled: settings.narrator, rate: settings.speechRate,
    voiceEn: settings.voiceEn, voicePl: settings.voicePl
  });
  if (result === 'unavailable') announce('Brak lokalnego głosu angielskiego. Lektor jest dostępny w ustawieniach systemu.');
}
function selectTrick(trick: Trick): void {
  selected.value = trick;
  audio.reset();
  scene?.selectTrick(trick);
  settings.playing = trick.status !== 'unavailable';
  settings.riderVisible = true;
  settings.camera = trick.camera;
  telemetry.time = 0;
  telemetry.progress = 0;
  telemetry.duration = trick.duration;
  telemetry.phase = trick.status === 'unavailable' ? 'Model do obejrzenia' : 'Najazd';
  atlasOpen.value = false;
  unlockAudio();
  speak(trick);
}
function togglePlay(): void {
  if (!ready.value || !isAvailable.value) return;
  unlockAudio();
  if (telemetry.time >= telemetry.duration - 0.01) scene?.seek(0);
  settings.playing = !settings.playing;
}
function replay(): void {
  if (!ready.value || !isAvailable.value) return;
  unlockAudio();
  audio.reset();
  scene?.restart();
  settings.playing = true;
}
function seek(event: Event): void {
  audio.reset();
  const time = Number((event.target as HTMLInputElement).value);
  telemetry.time = time;
  telemetry.progress = time / selected.value.duration;
  scene?.seek(time);
}
function cameraPreset(value: CameraPreset): void {
  settings.camera = value;
  settings.autoCamera = true;
  if (value === 'apex' && isAvailable.value) {
    settings.playing = false;
    settings.speed = 0.25;
    const figure = selected.value.phases.find(phase => /^(Lot|Balans|Technika)/.test(phase.name));
    scene?.seek(selected.value.duration * (figure ? (figure.start + figure.end) / 2 : .52));
    audio.reset();
  }
}
function nextTrick(): void {
  const list = filtered.value.length ? filtered.value : TRICKS;
  const current = list.findIndex(trick => trick.id === selected.value.id);
  selectTrick(list[(current + 1) % list.length]!);
}
function bikeOnly(): void {
  settings.riderVisible = !settings.riderVisible;
  if (!settings.riderVisible) {
    settings.playing = false;
    scene?.seek(0);
    scene?.resetCamera();
    audio.reset();
  }
}
function toggleMute(): void { unlockAudio(); settings.muted = !settings.muted; }
function keyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') { atlasOpen.value = false; settingsOpen.value = false; return; }
  if ((event.target as HTMLElement)?.closest('input,select,textarea,button')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  else if (event.key.toLowerCase() === 'r') replay();
  else if (event.key.toLowerCase() === 'm') toggleMute();
  else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    settings.playing = false;
    scene?.seek(Math.max(0, Math.min(telemetry.duration, telemetry.time + (event.key === 'ArrowRight' ? 0.2 : -0.2))));
    audio.reset();
  }
}
watch(settings, () => {
  scene?.updateSettings({ ...settings });
  audio.update(telemetry, settings);
  if (!settings.narrator) narrator?.cancel();
}, { deep: true });
watch(atlasOpen, open => { document.body.style.overflow = open ? 'hidden' : ''; });

onMounted(async () => {
  narrator = new SpeechNarrator(list => voices.value = list);
  window.addEventListener('keydown', keyboard);
  try {
    const { LabScene } = await import('./three/LabScene');
    const created = await LabScene.create(stage.value!, state => {
      if (disposed) return;
      Object.assign(telemetry, state);
      if (settings.playing !== state.playing) settings.playing = state.playing;
      audio.update(state, settings);
    });
    if (disposed) { created.dispose(); return; }
    scene = created;
    scene.selectTrick(selected.value);
    settings.playing = false;
    scene.updateSettings({ ...settings });
    ready.value = true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  document.body.style.overflow = '';
  scene?.dispose();
  narrator?.dispose();
  audio.dispose();
  clearTimeout(toastTimer);
  window.removeEventListener('keydown', keyboard);
});
</script>

<template>
  <div class="lab-app">
    <header class="masthead">
      <MastheadArt />
      <a class="brand" href="./" aria-label="MTB Trick Lab - początek">
        <svg class="brand-mark" viewBox="0 0 50 40" fill="none" aria-hidden="true"><path d="m4 33 15-26 10 18 9-15 9 23" stroke="currentColor" stroke-width="5" stroke-linejoin="miter"/><path d="m18 33 9-15" stroke="currentColor" stroke-width="3"/></svg>
        <span>MTB<strong>TRICK LAB</strong></span>
      </a>
      <span class="masthead-kicker" aria-hidden="true">FREERIDE / DIRT / SLOPESTYLE</span>
      <div class="header-right">
        <button class="header-atlas-toggle" aria-label="Otwórz katalog" :aria-expanded="atlasOpen" aria-controls="trick-atlas" @click="atlasOpen = !atlasOpen"><Icon name="list" /><span>Triki</span></button>
        <button class="settings-toggle" :class="{ active: settingsOpen }" :aria-expanded="settingsOpen" aria-controls="settings-panel" aria-label="Ustawienia dźwięku i obrazu" @click="settingsOpen = !settingsOpen"><Icon name="settings" /><span>Ustawienia</span></button>
      </div>
    </header>

    <main class="workbench">
      <section class="lab-main" aria-label="Demonstrator trików 3D">
        <div class="camera-bar">
          <span class="control-label"><Icon name="camera" :size="20" /><span>Kamera</span></span>
          <div class="camera-presets" role="group" aria-label="Ujęcie kamery"><button v-for="preset in cameraPresets" :key="preset.value" :class="{ active: settings.camera === preset.value && settings.autoCamera }" :aria-pressed="settings.camera === preset.value && settings.autoCamera" @click="cameraPreset(preset.value)">{{ preset.label }}</button></div>
          <button class="free-camera" :class="{ active: !settings.autoCamera }" :aria-pressed="!settings.autoCamera" aria-label="Swobodna kamera" title="Swobodna kamera" @click="settings.autoCamera = !settings.autoCamera"><Icon name="orbit" :size="20" /><span>Swobodna</span></button>
        </div>

        <div class="stage-wrap" :class="{ 'bike-inspection': !settings.riderVisible }" tabindex="0" aria-label="Scena 3D. Przeciągnij, aby obrócić kamerę. Spacja: odtwarzanie.">
          <div ref="stage" class="three-stage" data-testid="three-stage"></div>
          <div class="stage-vignette"></div>
          <div class="stage-heading">
            <h1 :class="{ 'long-title': selected.nameEn.length > 18 }">{{ settings.riderVisible ? selected.nameEn : 'Enduro.' }}<span v-if="selected.namePl && settings.riderVisible" class="polish-name">({{ selected.namePl }})</span></h1>
            <p class="stage-description">{{ settings.riderVisible ? selected.descriptionPl : 'Obejrzyj rower z każdej strony.' }}</p>
            <span v-if="settings.riderVisible" class="status-badge" :class="selected.status"><i></i>{{ statusLabels[selected.status] }}</span>
          </div>
          <div class="view-tools">
            <button class="stage-tool" :class="{ selected: !settings.riderVisible }" :aria-pressed="!settings.riderVisible" aria-label="Pokaż sam rower" title="Pokaż sam rower" @click="bikeOnly"><Icon name="person" :size="20" /><span>{{ settings.riderVisible ? 'Zawodnik' : 'Sam rower' }}</span></button>
            <button class="stage-tool icon-only" aria-label="Reset kamery" title="Reset kamery" @click="scene?.resetCamera()"><Icon name="reset" :size="20" /></button>
          </div>
          <div v-if="!ready && !error" class="loading-state"><span></span>Ładowanie sceny…</div>
          <div v-if="error" class="error-state"><Icon name="info" :size="25" /><strong>Nie udało się uruchomić sceny 3D</strong><p>{{ error }}</p><span>Sprawdź obsługę WebGL 2 i akcelerację sprzętową w przeglądarce.</span></div>
          <div v-if="selected.status === 'unavailable' && ready" class="unavailable-note"><Icon name="info" :size="20" /><span>Ten pokaz jest w przygotowaniu. Szczegóły poniżej, w „O triku”.</span></div>
          <div v-if="debug && ready" class="debug-readout"><span>FPS {{ Math.round(telemetry.fps) }}</span><span>DRAW {{ telemetry.drawCalls }}</span><span>F {{ compressionFront }} / R {{ compressionRear }} mm</span><span>{{ telemetry.grounded ? 'CONTACT' : 'FLIGHT' }}</span></div>
        </div>

        <div class="playback-panel">
          <div class="timeline-row"><span class="time-readout">{{ telemetry.time.toFixed(1) }}<i> / {{ telemetry.duration.toFixed(1) }} s</i></span><div class="timeline"><input :value="telemetry.time" type="range" min="0" :max="selected.duration" step="0.01" :disabled="!ready || !isAvailable" :style="{ '--progress': `${telemetry.progress * 100}%` }" aria-label="Oś czasu" data-testid="timeline" @input="seek" /></div></div>
          <div class="playback-controls">
            <div class="transport"><button class="play-button" :disabled="!ready || !isAvailable" :aria-label="settings.playing ? 'Wstrzymaj pokaz' : 'Odtwórz pokaz'" data-testid="play-toggle" @click="togglePlay"><Icon :name="settings.playing ? 'pause' : 'play'" :size="20" /><span>{{ settings.playing ? 'Pauza' : 'Odtwórz' }}</span></button><button class="icon-button" :disabled="!ready || !isAvailable" aria-label="Odtwórz ponownie" title="Odtwórz ponownie (R)" @click="replay"><Icon name="replay" :size="21" /></button><button class="icon-button loop-button" :class="{ active: settings.loop }" :aria-pressed="settings.loop" aria-label="Pętla" title="Pętla" @click="settings.loop = !settings.loop"><Icon name="loop" :size="21" /></button></div>
            <div class="speed-control" role="group" aria-label="Prędkość odtwarzania"><button v-for="speed in [0.25, 0.5, 1]" :key="speed" :class="{ active: settings.speed === speed }" :aria-pressed="settings.speed === speed" @click="settings.speed = speed">{{ speed }}×</button></div>
            <div class="playback-end"><button class="icon-button sound-toggle" :class="{ active: !settings.muted }" :aria-label="settings.muted ? 'Włącz dźwięki sceny' : 'Wycisz dźwięki sceny'" :title="settings.muted ? 'Włącz dźwięki sceny (M)' : 'Wycisz dźwięki sceny (M)'" @click="toggleMute"><Icon :name="settings.muted ? 'mute' : 'volume'" :size="21" /></button><button class="next-button" aria-label="Następny trik" @click="nextTrick"><span>Następny trik</span><Icon name="arrow" :size="21" /></button></div>
          </div>
        </div>

        <details :key="selected.id" class="trick-details" :open="!isAvailable">
          <summary><Icon name="info" :size="18" /><span>O triku</span><Icon name="down" :size="18" /></summary>
          <div class="detail-body">
            <p class="detail-note"><strong>{{ statusLabels[selected.status] }}.</strong> {{ selected.note || 'Pokaz łączy choreografię z symulacją kontaktu i zawieszenia.' }}</p>
            <div class="detail-facts"><div><h3>Przebieg</h3><ol><li v-for="(phase, index) in selected.phases" :key="phase.name + index" :class="{ current: telemetry.progress >= phase.start && telemetry.progress <= phase.end }">{{ phase.name }}</li></ol></div><div><h3>Rower</h3><p>Full suspension · koła 29″<br />Skok: 150 mm przód / 140 mm tył</p></div></div>
          </div>
        </details>
      </section>

      <button class="mobile-atlas-toggle" :aria-expanded="atlasOpen" aria-controls="trick-atlas" @click="atlasOpen = !atlasOpen"><Icon name="list" /><span>Katalog trików</span><Icon name="arrow" /></button>
      <div v-if="atlasOpen" class="atlas-scrim" @click="atlasOpen = false"></div>
      <aside id="trick-atlas" class="atlas" :class="{ open: atlasOpen }" aria-label="Katalog trików">
        <div class="atlas-header"><h2>TRICK LIST<span>{{ TRICKS.length }}</span></h2><button class="mobile-atlas-close icon-button" aria-label="Zamknij katalog" @click="atlasOpen = false"><Icon name="close" /></button></div>
        <div class="catalog-tabs" role="group" aria-label="Szybki wybór kategorii"><button :class="{ active: !category }" :aria-pressed="!category" @click="category = ''">Wszystkie</button><button :class="{ active: category === CATEGORIES[0] }" :aria-pressed="category === CATEGORIES[0]" @click="category = CATEGORIES[0] ?? ''; search = ''">Podstawy</button></div>
        <div class="atlas-filters"><label class="search-field"><Icon name="search" :size="20" /><input v-model="search" placeholder="Znajdź trik…" aria-label="Szukaj triku" autocomplete="off" /><button v-if="search" aria-label="Wyczyść wyszukiwanie" @click="search = ''"><Icon name="close" :size="18" /></button></label><div class="category-select"><select v-model="category" aria-label="Kategoria trików"><option value="">Wszystkie kategorie</option><option v-for="(name, index) in CATEGORIES" :key="name" :value="name">{{ categoryShort[index] }}</option></select><Icon name="down" :size="18" /></div><div class="filter-meta"><label><input v-model="onlyAvailable" type="checkbox" /><span>Tylko z pokazem</span></label><span>{{ filtered.length }} pozycji</span></div></div>
        <div class="atlas-list" data-testid="atlas-list">
          <section v-for="group in groups" :key="group.name" class="trick-group"><div class="group-heading"><span>{{ categoryShort[group.index] }}</span><b>{{ group.tricks.length }}</b></div><button v-for="trick in group.tricks" :key="trick.id" class="trick-row" :class="{ selected: selected.id === trick.id, unavailable: trick.status === 'unavailable' }" :data-trick="trick.id" :aria-pressed="selected.id === trick.id" :title="`${trick.nameEn} - ${statusShort[trick.status]}`" @click="selectTrick(trick)"><span class="trick-name">{{ trick.nameEn }}</span><Icon v-if="selected.id === trick.id" name="arrow" :size="20" /><span v-else class="trick-status-dot" :class="trick.status" :aria-label="statusShort[trick.status]"></span></button></section>
          <div v-if="!groups.length" class="empty-search"><Icon name="search" :size="28" /><strong>Nie znaleziono triku</strong><p>Spróbuj innej nazwy lub opisu.</p><button @click="search = ''; category = ''; onlyAvailable = false">Wyczyść filtry</button></div>
        </div>
        <div class="atlas-footer">{{ availableCount }} pokazów <span>·</span> {{ TRICKS.length }} trików</div>
      </aside>
    </main>

    <footer class="app-footer"><a href="https://yasio.dev" target="_blank" rel="noopener noreferrer">by yasio.dev</a></footer>

    <section v-if="settingsOpen" id="settings-panel" class="settings-panel" aria-label="Ustawienia">
      <div class="settings-heading"><h2>Ustawienia</h2><button class="icon-button" aria-label="Zamknij ustawienia" @click="settingsOpen = false"><Icon name="close" /></button></div>
      <fieldset><legend>Lektor</legend><label class="setting-toggle"><span>Czytaj nazwy trików</span><input v-model="settings.narrator" type="checkbox" role="switch" aria-label="Lektor nazw trików" /></label><label class="setting-select"><span>Głos EN</span><select v-model="settings.voiceEn" aria-label="Głos angielski"><option value="">{{ enVoices.length ? 'Automatyczny' : 'Brak lokalnego głosu EN' }}</option><option v-for="voice in enVoices" :key="voice.voiceURI" :value="voice.voiceURI">{{ voice.name }}</option></select></label><label class="setting-select"><span>Głos PL</span><select v-model="settings.voicePl" aria-label="Głos polski"><option value="">{{ plVoices.length ? 'Automatyczny' : 'Brak lokalnego głosu PL' }}</option><option v-for="voice in plVoices" :key="voice.voiceURI" :value="voice.voiceURI">{{ voice.name }}</option></select></label><label class="setting-slider"><span>Tempo mowy <b>{{ settings.speechRate.toFixed(2) }}×</b></span><input v-model.number="settings.speechRate" type="range" min="0.5" max="1.5" step="0.05" aria-label="Tempo lektora" /></label><p class="settings-note">Lokalne głosy urządzenia. Polski głos odczytuje utrwalone polskie nazwy.</p></fieldset>
      <fieldset><legend>Dźwięki sceny</legend><label class="setting-toggle"><span>Opony, napęd i wiatr</span><input :checked="!settings.muted" type="checkbox" role="switch" aria-label="Dźwięki sceny" @change="toggleMute" /></label><label class="setting-slider"><span>Głośność <b>{{ Math.round(settings.volume * 100) }}%</b></span><input v-model.number="settings.volume" type="range" min="0" max="1" step="0.05" aria-label="Głośność sceny" @input="unlockAudio" /></label></fieldset>
      <fieldset><legend>Obraz</legend><label class="setting-select"><span>Jakość</span><select v-model="settings.quality" aria-label="Jakość obrazu"><option value="auto">Adaptacyjna</option><option value="high">Wysoka</option><option value="low">Oszczędna</option></select></label></fieldset>
      <p class="settings-bottom"><Icon name="keyboard" :size="20" /><span>Spacja - pauza<br />R - od nowa · M - dźwięk</span></p>
    </section>
    <div class="announcement" :class="{ visible: announcement }" role="status" aria-live="polite">{{ announcement }}</div>
  </div>
</template>
