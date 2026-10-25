import atlas from './atlas.json';
import type { Trick, SceneKind, Phase, TrickStatus } from '../types';
import { BASIC_DURATIONS, basicPhases } from '../three/tricks/BasicMetadata';

export const CATEGORIES = [...new Set(atlas.map(row => row.category))];
export const normalizeSearch = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
const slug = (value: string) => normalizeSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const flightPhases: Phase[] = [
  { name: 'Najazd', start: 0, end: .18 }, { name: 'Przygotowanie', start: .18, end: .28 },
  { name: 'Wybicie', start: .28, end: .36 }, { name: 'Lot / figura', start: .36, end: .74 },
  { name: 'Lądowanie', start: .74, end: .84 }, { name: 'Wyjazd', start: .84, end: .94 },
  { name: 'Podgląd', start: .94, end: 1 },
];
const balancePhases: Phase[] = [
  { name: 'Najazd', start: 0, end: .2 }, { name: 'Przeniesienie ciężaru', start: .2, end: .35 },
  { name: 'Balans', start: .35, end: .68 }, { name: 'Powrót do dwóch kół', start: .68, end: .84 },
  { name: 'Wyjazd', start: .84, end: .94 }, { name: 'Podgląd', start: .94, end: 1 },
];
const continuousPhases: Phase[] = [
  { name: 'Przygotowanie', start: 0, end: .18 }, { name: 'Technika', start: .18, end: .82 },
  { name: 'Wyjście', start: .82, end: .94 }, { name: 'Podgląd', start: .94, end: 1 },
];

type Spec = { family: string; scene?: SceneKind; primitives?: Record<string, number>; status?: TrickStatus; note?: string; duration?: number };
function phasesFor(spec?: Spec): Phase[] {
  if (spec?.family === 'drop') return [
    { name: 'Najazd na uskok', start: 0, end: .24 }, { name: 'Przód poza krawędzią', start: .24, end: .31 },
    { name: 'Zeskok', start: .31, end: .63 }, { name: 'Lądowanie', start: .63, end: .76 },
    { name: 'Wyjazd', start: .76, end: .94 }, { name: 'Podgląd', start: .94, end: 1 },
  ];
  if (spec?.family === 'ledge') {
    const rear = spec.primitives?.uprear, turn = spec.primitives?.fufanu;
    const end = turn ? .7 : spec.primitives?.stall || rear ? .64 : .53;
    return [
      { name: 'Przygotowanie', start: 0, end: .22 }, { name: 'Wskok', start: .22, end: .42 },
      { name: turn ? 'Obrót na oponie' : 'Kontakt z krawędzią', start: .42, end },
      { name: rear ? 'Opuszczenie przodu' : turn ? 'Powrót przodem' : 'Powrót fakie', start: end, end: .94 },
      { name: 'Podgląd', start: .94, end: 1 },
    ];
  }
  return spec?.family === 'flight' ? flightPhases : ['balance', 'pivot', 'wheelhop'].includes(spec?.family ?? '') ? balancePhases : continuousPhases;
}
const specs: Record<string, Spec> = {};
const add = (name: string, family: string, primitives: Record<string, number> = {}, scene: SceneKind = 'flat', extra: Partial<Spec> = {}) => {
  specs[name] = { family, scene, primitives, ...extra };
};
const setupNote = 'Stylizowane: obrót sterów lub ramy wymaga specjalnego setupu dirt/BMX i odpowiedniego prowadzenia przewodów. Trailowy full nie ma tu deklarowanej pełnej kompatybilności.';
const assistedNote = 'Demonstracja wspomagana: Rapier oblicza lot i impuls lądowania uproszczonego ciała zastępczego (kula, 94 kg), nie całego roweru. Orientacja i zawodnik są choreografią; czas lotu jest rozciągnięty dla czytelności.';
const groundNote = 'Demonstracja wspomagana: tor jazdy, kontakty kół i balans zawodnika są rozwiązane kinematycznie. Sag oraz praca zawieszenia nie oznaczają pełnej dynamicznej symulacji roweru.';
add('Trackstand', 'trackstand');
add('Wheelie', 'balance', { balance: 1, pedal: 1, angle: .68 });
add('Manual', 'balance', { balance: 1, angle: .49 });
add('Stoppie / Endo', 'balance', { balance: -1, angle: .68, brake: 1 });
add('Nose Manual', 'balance', { balance: -1, angle: .52 });
add('Front Wheel Lift', 'balance', { balance: 1, angle: .28, brief: 1 });
add('Rear Wheel Lift', 'balance', { balance: -1, angle: .28, brief: 1 });
add('Bunny Hop', 'flight', { hop: 1, height: .48 });
add('English Bunny Hop', 'flight', { hop: 1, simultaneous: 1, height: .34 });
add('American Bunny Hop', 'flight', { hop: 1, sequential: 1, height: .64 });
add('Pumping', 'pump', { pump: 1 }, 'rollers');
add('Jump', 'flight', { height: 1.08 }, 'jump');
add('Drop', 'drop', { drop: 1 }, 'drop');
add('Preload', 'preload', { preload: 1 });
add('Scrub', 'flight', { height: .5, table: .65, scrub: 1 }, 'jump');
add('Whip', 'flight', { height: 1.2, whip: 1 }, 'jump');
add('Tabletop', 'flight', { height: 1.3, table: 1 }, 'jump');
add('Toboggan', 'flight', { height: 1.25, seat: 1, toboggan: 1 }, 'jump');
add('Turndown', 'flight', { height: 1.5, turndown: 1 }, 'jump', { status: 'stylized', note: 'Kontrolowany turndown: skręt tułowia i sterów z asymetrycznym ułożeniem nóg. Zakres sterów i prowadzenie przewodów wymagają odpowiedniego setupu.' });
add('One Hander', 'flight', { height: 1.1, hands: 1 }, 'jump');
add('No Hander', 'flight', { height: 1.25, hands: 2 }, 'jump');
add('Tuck No Hander', 'flight', { height: 1.3, hands: 2, tuck: 1 }, 'jump');
add('One Footer', 'flight', { height: 1.1, feet: 1 }, 'jump');
add('No Footer', 'flight', { height: 1.25, feet: 2 }, 'jump');
add('Can-Can', 'flight', { height: 1.6, cancan: 1, feet: 1 }, 'jump');
add('No Foot Can-Can', 'flight', { height: 1.8, cancan: 1, feet: 2 }, 'jump');
add('Superman', 'flight', { height: 1.7, feet: 2, superman: 1 }, 'jump');
add('Superman Seat Grab', 'flight', { height: 1.8, feet: 2, superman: 1, seat: 1 }, 'jump');
add('Seat Grab', 'flight', { height: 1.15, seat: 1 }, 'jump');
add('Barspin', 'flight', { height: 1.25, barspin: 1 }, 'jump', { status: 'stylized', note: setupNote });
add('X-Up / Cross-Up', 'flight', { height: 1.2, xup: 1 }, 'jump', { status: 'stylized', note: 'Stylizowane: duży skręt sterów i skrzyżowanie ramion ograniczają przewody oraz geometria współczesnego fulla.' });
add('Truckdriver', 'flight', { height: 1.8, yaw: 1, barspin: 1 }, 'jump', { status: 'stylized', note: setupNote });
add('Tailwhip', 'flight', { height: 1.7, tailwhip: 1 }, 'jump', { status: 'stylized', note: setupNote });
add('Double Tailwhip', 'flight', { height: 2.3, tailwhip: 2 }, 'jump', { status: 'stylized', note: setupNote, duration: 9 });
add('Nothing', 'flight', { height: 1.6, hands: 2, feet: 2 }, 'jump');
add('Indian Air', 'flight', { height: 1.9, feet: 2, indian: 1 }, 'jump');
add('Nac-Nac', 'flight', { height: 1.65, feet: 1, nacnac: 1 }, 'jump');
add('Lookback', 'flight', { height: 1.35, lookback: 1 }, 'jump', { status: 'stylized', note: 'Wspomagany skręt tułowia i spojrzenie do tyłu. Zakres kierownicy i ramion jest demonstracyjny; nie jest walidacją wykonalności na każdym fullu.' });
add('Pendulum', 'flight', { height: 2, feet: 2, pendulum: 1 }, 'jump', { duration: 9, status: 'stylized', note: 'Obie nogi wykonują kontrolowany ruch wahadłowy po bokach roweru. Wydłużony lot ułatwia obserwację przełożenia i powrotu na pedały.' });
add('Suicide No Hander', 'flight', { height: 1.65, hands: 2, suicide: 1 }, 'jump', { status: 'stylized', note: 'Poza wspomagana: utrzymanie roweru przez zacisk kolan jest przedstawione kinematycznie; chwyt kolan nie jest ograniczeniem solvera.' });
for (const degrees of [180, 360, 540, 720, 900, 1080]) add(String(degrees), 'flight', { yaw: degrees / 360, height: 1.3 + degrees / 900 }, degrees % 360 ? 'flat' : 'jump', { duration: degrees >= 720 ? 9 : 8 });
add('Backflip', 'flight', { flip: 1, height: 2.1 }, 'jump');
add('Frontflip', 'flight', { flip: -1, height: 2.1 }, 'jump');
add('Double Backflip', 'flight', { flip: 2, height: 3.1 }, 'jump', { status: 'stylized', duration: 10, note: 'Wariant edukacyjny z wydłużonym czasem w powietrzu. Wysokość i tempo nie stanowią walidacji wykonalności na takim rowerze.' });
add('Triple Backflip', 'flight', { flip: 3, height: 3.8 }, 'jump', { status: 'stylized', duration: 12, note: 'Trzy rotacje pokazane w rozszerzonej osi czasu. To stylizowana analiza ruchu, nie zweryfikowana symulacja skoku.' });
add('Double Frontflip', 'flight', { flip: -2, height: 3.1 }, 'jump', { status: 'stylized', duration: 10, note: 'Wariant edukacyjny z wydłużonym czasem lotu i kontrolowaną rotacją; wykonalność nie jest potwierdzona.' });
add('Backflip Barspin', 'flight', { flip: 1, barspin: 1, height: 2.3 }, 'jump', { status: 'stylized', note: setupNote });
add('Backflip Tailwhip', 'flight', { flip: 1, tailwhip: 1, height: 2.5 }, 'jump', { status: 'stylized', note: setupNote, duration: 9 });
add('Frontflip Barspin', 'flight', { flip: -1, barspin: 1, height: 2.3 }, 'jump', { status: 'stylized', note: setupNote });
add('360 Tailwhip', 'flight', { yaw: 1, tailwhip: 1, height: 2.3 }, 'jump', { status: 'stylized', note: setupNote });
add('720 Barspin', 'flight', { yaw: 2, barspin: 1, height: 2.5 }, 'jump', { status: 'stylized', note: setupNote, duration: 9 });
add('Backflip Superman', 'flight', { flip: 1, feet: 2, superman: 1, height: 2.5 }, 'jump');
add('360 No Hander', 'flight', { yaw: 1, hands: 2, height: 2.1 }, 'jump');
add('Fakie', 'fakie', { fakie: 1 });
add('Rollback', 'fakie', { rollback: 1 });
add('Half Cab', 'flight', { yaw: .5, fakie: 1, hop: 1, height: .6 });
add('Full Cab', 'flight', { yaw: 1, fakie: 1, hop: 1, height: .9 });
add('Nose Pivot', 'pivot', { pivot: -1, turn: .5 });
add('Endo Turn', 'pivot', { pivot: -1, turn: 1 });
add('Pivot', 'pivot', { pivot: 1, turn: .5 });
add('Wallride', 'wallride', { wall: 1 }, 'wall', { status: 'stylized', note: 'Kontakt opon ze ścianą jest prowadzony kinematycznie. Przyczepność na pionowej ścianie i siła docisku nie są rozwiązywane jako pełna dynamika roweru.' });
add('Walltap', 'wallride', { wall: 1, tap: 1 }, 'wall', { status: 'stylized', note: 'Wspomagane krótkie dotknięcie ściany obiema oponami. Tor boczny i powrót są kontrolowaną choreografią.' });
add('Tire Tap', 'ledge', { tap: 1 }, 'ledge', { status: 'stylized', note: 'Pokaz kontaktu tylnej opony z krawędzią; balans i odbicie są kontrolowane kinematycznie.' });
add('Abubaca', 'ledge', { stall: 1 }, 'ledge', { status: 'stylized', note: 'Wspomagany balans tylnej opony na krawędzi i powrót fakie. Solver nie rozwiązuje pełnego balansu zawodnika.' });
add('Fufanu', 'ledge', { fufanu: 1 }, 'ledge', { status: 'stylized', note: 'Kontakt tylnej opony z krawędzią, obrót o 180° wokół tej opony i wyjazd przodem. Balans oraz tor odbicia są prowadzone kinematycznie.' });
add('Crankflip', 'flight', { hop: 1, crankflip: 1, height: .6 }, 'flat', { status: 'stylized', note: 'Swobodny obrót korby wymaga odpowiedniego napędu. Pokaz abstrahuje od oporu sprzęgła przerzutki trailowego fulla.' });
add('Gap Jump', 'flight', { height: .8, gap: 1 }, 'gap');
add('Side Hop', 'flight', { hop: 1, sideways: 1, height: .42 });
add('Pedal Kick', 'wheelhop', { kick: 1, rear: 1 });
add('Rear Wheel Hop', 'wheelhop', { rear: 1 });
add('Front Wheel Hop', 'wheelhop', { front: 1 });
add('Up to Rear', 'ledge', { uprear: 1 }, 'ledge', { status: 'stylized', note: 'Wspomagany wskok na podest z pierwszym kontaktem tylnej opony, balansem i opuszczeniem przodu. To pokaz kontaktów, nie swobodna dynamika trialowa.' });
add('Berm Riding', 'corner', { corner: 1, berm: 1 }, 'berm');
add('Flat Cornering', 'corner', { corner: 1 });
add('Switchback', 'corner', { corner: 1, tight: 1 });
add('Front Wheel Pivot', 'pivot', { pivot: -1, turn: .5 });
add('Rear Wheel Pivot', 'pivot', { pivot: 1, turn: .5 });
add('Rock Garden', 'rocks', { rocks: 1 }, 'rocks');
add('Manual Drop', 'drop', { drop: 1, manual: 1 }, 'drop');
add('Bunny Hop Gap', 'flight', { hop: 1, sequential: 1, gap: 1, height: .65 }, 'gap');
add('Step-Up', 'flight', { height: 1.6 }, 'step-up');
add('Step-Down', 'flight', { height: 1.0 }, 'step-down');
add('Double', 'flight', { height: .95, double: 1 }, 'jump');
add('Roller', 'pump', { roller: 1 }, 'rollers');
add('Pumptrack Flow', 'pump', { pump: 1, flow: 1 }, 'rollers', { duration: 9 });

const pending: Record<string, string> = {
  'Turndown': 'Wymaga osobnego skrętu tułowia i asymetrycznego wyprostu nogi bez kolizji z ramą.',
  'Can-Can': 'Wymaga zweryfikowanej trajektorii nogi nad ramą.',
  'No Foot Can-Can': 'Wymaga wspólnej trajektorii nóg na jedną stronę bez przenikania ramy.',
  'Seat Clap': 'Wymaga bezkolizyjnego przeniesienia obu stóp nad siodełko.',
  'Triple Tailwhip': 'Brakuje zweryfikowanego czasu, zapasu wysokości i ponownego chwytu po trzech obrotach.',
  'Decade': 'Wymaga niezależnej rotacji zawodnika wokół przedniej części roweru.',
  'Cliffhanger': 'Wymaga osobnych kontaktów stóp z kierownicą i wyprostowanego tułowia.',
  'Indian Air': 'Wymaga skrzyżowania nóg za rowerem bez przenikania kończyn.',
  'Saran Wrap': 'Wymaga zweryfikowanej sekwencji przełożenia nogi wokół przodu roweru.',
  'Nac-Nac': 'Wymaga osobnej trajektorii nogi za siodełkiem.',
  'Candy Bar': 'Wymaga przełożenia nogi między ramionami nad kierownicą.',
  'Lookback': 'Brakuje zweryfikowanego skrętu tułowia i kierunku spojrzenia.',
  'Pendulum': 'Wymaga osobnej sekwencji przerzucania nóg na obie strony.',
  'Flair': 'Wymaga zgodnej z rampą rotacji łączonej i lądowania w przeciwnym kierunku.',
  'Cork 360': 'Wymaga zweryfikowanej trajektorii rotacji poza osią.',
  'Cork 720': 'Wymaga zweryfikowanej trajektorii rotacji poza osią.',
  'Cashroll': 'Złożona rotacja nie została jeszcze zweryfikowana; sam flip z yaw byłby mylący.',
  'Twister': 'Nazwa jest niejednoznaczna; potrzebna konkretna referencja i definicja wariantu.',
  'Footjam': 'Wymaga osobnego kontaktu stopy z przednią oponą i odpowiedniego setupu.',
  'Footjam Tailwhip': 'Wymaga kontaktu footjam oraz niezależnego obrotu ramy.',
  'Footplant': 'Wymaga rzeczywistego kontaktu stopy z otoczeniem.',
  'Fufanu': 'Wymaga skoordynowanego obrotu z kontaktu na krawędzi i powrotu przodem.',
  'Pedal Stall': 'Wymaga kontaktu pedału z krawędzią bez przenikania ramy.',
  'Rock Walk': 'Wymaga sekwencji odmiennych pivotów obu kół.',
  'Up to Rear': 'Wymaga stabilnego lądowania na tylnym kole na wyższej powierzchni.',
  'Hook': 'Wymaga zweryfikowanego kontaktu koła z krawędzią i przejścia nad przeszkodą.',
  'Hip Jump': 'Wymaga bocznego lądowania i odpowiedniego modułu przeszkody.',
  'Transfer': 'Wymaga dwóch osobnych modułów z dopasowaną trajektorią między nimi.',
  'Triple': 'Wymaga dedykowanego profilu trzech muld i właściwego zasięgu skoku.',
};

const numbers: Record<string, string> = { '180': 'one eighty', '360': 'three sixty', '540': 'five forty', '720': 'seven twenty', '900': 'nine hundred', '1080': 'ten eighty' };

export const TRICKS: Trick[] = atlas.map(row => {
  const spec = specs[row.nameEn];
  const family = spec?.family ?? 'pending';
  const id = slug(row.nameEn);
  const trick: Trick = {
    ...row, id: slug(row.nameEn), spokenEn: numbers[row.nameEn] ?? row.nameEn,
    ...(row.nameEn === 'Backflip' ? { namePl: 'salto w tył', spokenPl: 'salto w tył' } : {}),
    ...(row.nameEn === 'Frontflip' ? { namePl: 'salto w przód', spokenPl: 'salto w przód' } : {}),
    family, scene: spec?.scene ?? 'flat', status: spec?.status ?? (spec ? 'assisted' : 'unavailable'),
    note: spec?.note ?? (spec ? (family === 'flight' || family === 'drop' ? assistedNote : groundNote) : `W przygotowaniu. ${pending[row.nameEn] ?? 'Brak zweryfikowanej choreografii.'}`),
    duration: BASIC_DURATIONS[id] ?? spec?.duration ?? 8, primitives: spec?.primitives ?? {}, camera: 'three-quarter',
    phases: phasesFor(spec),
  };
  trick.phases = basicPhases(trick) ?? trick.phases;
  if (id in BASIC_DURATIONS && (family === 'flight' || family === 'drop')) {
    trick.note = 'Wspomagany pokaz: lot w rzeczywistym czasie z uproszczonego modelu masy 94 kg w Rapierze, kontakty opon dopasowane do rampy i kinematyczna technika zawodnika. Zwolnienie jest dostępne w odtwarzaczu; nie jest to pełna dynamiczna symulacja roweru i człowieka.';
  }
  return trick;
});

export const REQUIRED_TRICKS = ['Trackstand', 'Wheelie', 'Manual', 'Stoppie / Endo', 'Bunny Hop', 'American Bunny Hop', 'Pumping', 'Jump', 'Drop', 'Whip', 'Tabletop', 'One Hander', 'No Hander', 'One Footer', 'No Footer', 'Barspin', '360', 'Backflip', 'Frontflip', 'Nose Manual'];
