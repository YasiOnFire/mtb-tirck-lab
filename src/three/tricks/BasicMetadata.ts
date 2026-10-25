import type { Phase, Trick } from '../../types';

// UI-only metadata must not import the scene, Three.js or the Rapier runtime.
export const BASIC_DURATIONS: Record<string, number> = {
  trackstand: 5.5, wheelie: 4.5, manual: 4.5, 'stoppie-endo': 4.8, 'nose-manual': 4.5,
  'bunny-hop': 4.1, 'english-bunny-hop': 4, 'american-bunny-hop': 4.2,
  pumping: 4.5, jump: 3.6, drop: 3.8, whip: 3.8, tabletop: 3.8,
};

// Annotation timings calibrated against the fixed-120-Hz motion plans. Regression
// tests compare these to live Rapier results so geometry changes cannot silently
// leave the timeline labels behind. No fallback trajectory is cached during UI load.
const FLIGHT_TIMES: Record<string, [number, number, number, number]> = {
  'bunny-hop': [.79, 1.02, 1.553333, 3.167536],
  'american-bunny-hop': [.79, 1.02, 1.611667, 3.18625],
  'english-bunny-hop': [1.02, 1.02, 1.436667, 3.094287],
  jump: [.588010, .880551, 1.705549, 2.456279],
  drop: [.875, 1.30006, 1.658393, 2.814599],
  whip: [.645106, .967071, 1.871393, 2.649998],
  tabletop: [.644995, .968606, 1.876936, 2.657805],
};

export function basicPhases(trick: Trick): Phase[] | undefined {
  const { id, duration } = trick;
  let rows: [string, number, number][] | undefined;
  if (id === 'trackstand') rows = [
    ['Ustawienie korb i sterów', 0, .65], ['Balans ciałem', .65, 4.65], ['Powrót', 4.65, 5.1], ['Podgląd', 5.1, duration],
  ];
  else if (['wheelie', 'manual', 'nose-manual'].includes(id)) rows = [
    ['Najazd', 0, .45], ['Dociążenie i przeniesienie bioder', .45, 1], ['Balans', 1, 2.15], ['Opuszczenie koła', 2.15, 2.7], ['Wyjazd', 2.7, 3.25], ['Podgląd', 3.25, duration],
  ];
  else if (id === 'stoppie-endo') rows = [
    ['Najazd', 0, .45], ['Hamowanie i transfer ciężaru', .45, 1.05], ['Balans na przednim kole', 1.05, 2.15], ['Opuszczenie tyłu', 2.15, 2.65], ['Wyjazd', 2.65, 3.8], ['Podgląd', 3.8, duration],
  ];
  else if (id === 'pumping') rows = [
    ['Najazd', 0, .25], ['Odciążanie grzbietów i dociskanie zjazdów', .25, 2.5], ['Wyjazd', 2.5, 3.4], ['Podgląd', 3.4, duration],
  ];
  else if (FLIGHT_TIMES[id]) {
    const [frontOff, takeoff, landing, stop] = FLIGHT_TIMES[id];
    rows = [
      ['Najazd', 0, takeoff - .48], ['Dociążenie', takeoff - .48, frontOff],
      ['Przód / wybicie tyłu', frontOff, takeoff], ['Lot', takeoff, landing],
      ['Kontakt i amortyzacja', landing, landing + .55], ['Wyjazd', landing + .55, stop], ['Podgląd', stop, duration],
    ];
  }
  return rows?.filter(([, start, end]) => end > start).map(([name, start, end]) => ({ name, start: start / duration, end: end / duration }));
}
