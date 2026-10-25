import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

const server = await createServer({ server: { middlewareMode: true } });
try {
  const { TRICKS, CATEGORIES } = await server.ssrLoadModule('/src/data/tricks.ts');
  const count = status => TRICKS.filter(t => t.status === status).length;
  const unavailable = TRICKS.filter(t => t.status === 'unavailable');
  const active = TRICKS.filter(t => t.status !== 'unavailable');
  const additions = ['Can-Can', 'No Foot Can-Can', 'Nac-Nac', 'Indian Air', 'Pendulum', 'Lookback', 'Turndown', 'Fufanu', 'Up to Rear'];
  const out = [
    '# MTB Trick Lab - rzeczywisty zakres implementacji', '',
    `Katalog: **${TRICKS.length} / 110**. Aktywne demonstracje: **${active.length}**. Wspomagane: **${count('assisted')}**, stylizowane: **${count('stylized')}**, zweryfikowane fizycznie: **${count('verified')}**, w przygotowaniu: **${unavailable.length}**.`, '',
    'To działający atlas z częściowym pokryciem, nie kompletna implementacja 110 demonstracji. Status „wspomagane” nie oznacza profesjonalnej walidacji techniki ani pełnej dynamiki roweru.', '',
    '## Rozbudowa pokazów', '',
    `Nowo dodane aktywne demonstracje: ${active.filter(t => additions.includes(t.nameEn)).map(t => `**${t.nameEn}**`).join(', ')}.`, '',
    'Dopracowano kolejność front lift → scoop → poziomowanie w hopie, inicjację whipa przed wybiciem i odzyskiwanie osi, pracę bioder w manualu, złożenie oraz otwarcie sylwetki w salcie, utrzymanie obrotów kół w locie i powrót kończyn na rzeczywiste punkty chwytu.', '',
    'Nowe triki nie otrzymały statusu `verified`.', '',
    '## Granica fizyki i choreografii', '',
    '- Rapier 0.21 oblicza tor lotu dynamicznej kuli o masie 94 kg i promieniu 0,37 m oraz impuls zderzenia z powierzchnią lądowania. To ciało zastępcze, nie dwa dynamiczne koła, rama i zawodnik.',
    '- Trajektorie zapisują się ze stałym krokiem 1/120 s. Odtwarzacz interpoluje zapisane próbki i rozciąga czas fizycznego lotu do osi czasu prezentacji. Seek nie teleportuje dynamicznego ciała: odczytuje istniejący zapis.',
    '- Pitch, yaw, roll, skręt sterów, obrót ramy, chwyt i sylwetka są kontrolowaną choreografią. Balans na jednym kole, przejazdy terenowe, ściana i krawędź są kinematyczne.',
    '- Impuls Rapiera uruchamia model mass-spring-damper: masa 47 kg na sekcję, sztywność 12000 N/m, tłumienie 1100 Ns/m, sag 27%, limit skoku 150/140 mm. Nie jest to pomiar charakterystyki fabrycznego amortyzatora.',
    '- Kontakty dłoni i stóp obsługuje rig zawodnika. Wymagające specjalnego setupu obroty sterów i ramy pozostają stylizowane z notą o przewodach i geometrii.', '',
    '## Wszystkie pozycje w przygotowaniu', '',
    ...unavailable.map(t => `- **${t.nameEn}** - ${t.note.replace(/^W przygotowaniu\. /, '')}`), '',
    '## Aktywne demonstracje i kompozycje', '',
    'Warianty korzystają ze wspólnych prymitywów, ale zmieniają rzeczywiste osie, kontakty, części roweru lub przebieg manewru. Oddzielne rodziny obsługują balans, podskok/lot, drop, pompowanie, jazdę tyłem, pivot, ścianę, krawędź, zakręt, kamienie i podskoki na jednym kole.', '',
  ];
  for (const category of CATEGORIES) {
    out.push(`### ${category}`, '', '| Nazwa | Status | Rodzina | Prymitywy / parametry |', '| --- | --- | --- | --- |');
    for (const t of active.filter(t => t.category === category)) {
      const primitives = Object.entries(t.primitives).map(([key, value]) => `${key}: ${value}`).join(', ') || 'równowaga i skręt';
      out.push(`| ${t.nameEn} | ${t.status === 'stylized' ? 'stylizowane' : 'wspomagane'} | ${t.family} | ${primitives} |`);
    }
    out.push('');
  }
  out.push('## Testy silnika', '',
    '`src/tests/engine.test.ts` sprawdza kompletność atlasu, rodziny obowiązkowych demonstracji, rozróżnienie osi, puszczenie/chwyt kończyn, niezależne barspin/tailwhip, kierunek pedałowania, kontakt ściany i krawędzi, zakresy zawieszenia, brak NaN w 11110 próbkach katalogu, reset/seek/pause/loop, zgodność 30/144 FPS oraz rzeczywisty impuls Rapiera i tłumienie sprężyny.', '',
    'Wyniki testów programowych nie zastępują kontroli wizualnej ani fachowej walidacji ruchu. Aktualne wyniki builda, testów przeglądarkowych i ograniczenia weryfikacji podano w README.', '');
  await writeFile(new URL('./IMPLEMENTATION_STATUS.md', import.meta.url), out.join('\n'));
  console.log(JSON.stringify({ total: TRICKS.length, active: active.length, assisted: count('assisted'), stylized: count('stylized'), verified: count('verified'), unavailable: unavailable.length, unavailableNames: unavailable.map(t => t.nameEn) }, null, 2));
} finally {
  await server.close();
}
