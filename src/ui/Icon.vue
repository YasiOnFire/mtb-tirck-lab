<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  replay: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  loop: 'm17 2 4 4-4 4M3 10V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14 0v2a2 2 0 0 1-2 2H3',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  camera: 'M8 5 6 8H3v12h18V8h-3l-2-3H8ZM16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  reset: 'M3 11a9 9 0 1 1 3 8M3 4v7h7',
  volume: 'M3 9v6h4l5 4V5L7 9H3Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  mute: 'M3 9v6h4l5 4V5L7 9H3Zm13 0 5 6m0-6-5 6',
  person: 'M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 22v-5a7 7 0 0 1 14 0v5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  orbit: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-9.5 7c-3.5 1-5 .5-5-1.5 0-3 4-7 10-10S22 4 22 6c0 2-2 5-5 8',
  check: 'm5 12 4 4L19 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  info: 'M12 11v6M12 7v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  keyboard: 'M2 6h20v13H2V6Zm3 3h.01M9 9h.01M13 9h.01M17 9h.01M5 12h.01M9 12h.01M13 12h.01M17 12h.01M7 16h10',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.info" /></svg>
</template>
