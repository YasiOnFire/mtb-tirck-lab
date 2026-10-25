# MTB Trick Lab - rzeczywisty zakres implementacji

Katalog: **110 / 110**. Aktywne demonstracje: **90**. Wspomagane: **66**, stylizowane: **24**, zweryfikowane fizycznie: **0**, w przygotowaniu: **20**.

To działający atlas z częściowym pokryciem, nie kompletna implementacja 110 demonstracji. Status „wspomagane” nie oznacza profesjonalnej walidacji techniki ani pełnej dynamiki roweru.

## Rozbudowa pokazów

Nowo dodane aktywne demonstracje: **Turndown**, **Can-Can**, **No Foot Can-Can**, **Indian Air**, **Nac-Nac**, **Lookback**, **Pendulum**, **Fufanu**, **Up to Rear**.

Dopracowano kolejność front lift → scoop → poziomowanie w hopie, inicjację whipa przed wybiciem i odzyskiwanie osi, pracę bioder w manualu, złożenie oraz otwarcie sylwetki w salcie, utrzymanie obrotów kół w locie i powrót kończyn na rzeczywiste punkty chwytu.

Nowe triki nie otrzymały statusu `verified`.

## Granica fizyki i choreografii

- Rapier 0.21 oblicza tor lotu dynamicznej kuli o masie 94 kg i promieniu 0,37 m oraz impuls zderzenia z powierzchnią lądowania. To ciało zastępcze, nie dwa dynamiczne koła, rama i zawodnik.
- Trajektorie zapisują się ze stałym krokiem 1/120 s. Odtwarzacz interpoluje zapisane próbki i rozciąga czas fizycznego lotu do osi czasu prezentacji. Seek nie teleportuje dynamicznego ciała: odczytuje istniejący zapis.
- Pitch, yaw, roll, skręt sterów, obrót ramy, chwyt i sylwetka są kontrolowaną choreografią. Balans na jednym kole, przejazdy terenowe, ściana i krawędź są kinematyczne.
- Impuls Rapiera uruchamia model mass-spring-damper: masa 47 kg na sekcję, sztywność 12000 N/m, tłumienie 1100 Ns/m, sag 27%, limit skoku 150/140 mm. Nie jest to pomiar charakterystyki fabrycznego amortyzatora.
- Kontakty dłoni i stóp obsługuje rig zawodnika. Wymagające specjalnego setupu obroty sterów i ramy pozostają stylizowane z notą o przewodach i geometrii.

## Wszystkie pozycje w przygotowaniu

- **Seat Clap** - Wymaga bezkolizyjnego przeniesienia obu stóp nad siodełko.
- **Triple Tailwhip** - Brakuje zweryfikowanego czasu, zapasu wysokości i ponownego chwytu po trzech obrotach.
- **Decade** - Wymaga niezależnej rotacji zawodnika wokół przedniej części roweru.
- **Cliffhanger** - Wymaga osobnych kontaktów stóp z kierownicą i wyprostowanego tułowia.
- **Saran Wrap** - Wymaga zweryfikowanej sekwencji przełożenia nogi wokół przodu roweru.
- **Candy Bar** - Wymaga przełożenia nogi między ramionami nad kierownicą.
- **Flair** - Wymaga zgodnej z rampą rotacji łączonej i lądowania w przeciwnym kierunku.
- **Cork 360** - Wymaga zweryfikowanej trajektorii rotacji poza osią.
- **Cork 720** - Wymaga zweryfikowanej trajektorii rotacji poza osią.
- **Cashroll** - Złożona rotacja nie została jeszcze zweryfikowana; sam flip z yaw byłby mylący.
- **Twister** - Nazwa jest niejednoznaczna; potrzebna konkretna referencja i definicja wariantu.
- **Footjam** - Wymaga osobnego kontaktu stopy z przednią oponą i odpowiedniego setupu.
- **Footjam Tailwhip** - Wymaga kontaktu footjam oraz niezależnego obrotu ramy.
- **Footplant** - Wymaga rzeczywistego kontaktu stopy z otoczeniem.
- **Pedal Stall** - Wymaga kontaktu pedału z krawędzią bez przenikania ramy.
- **Rock Walk** - Wymaga sekwencji odmiennych pivotów obu kół.
- **Hook** - Wymaga zweryfikowanego kontaktu koła z krawędzią i przejścia nad przeszkodą.
- **Hip Jump** - Wymaga bocznego lądowania i odpowiedniego modułu przeszkody.
- **Transfer** - Wymaga dwóch osobnych modułów z dopasowaną trajektorią między nimi.
- **Triple** - Wymaga dedykowanego profilu trzech muld i właściwego zasięgu skoku.

## Aktywne demonstracje i kompozycje

Warianty korzystają ze wspólnych prymitywów, ale zmieniają rzeczywiste osie, kontakty, części roweru lub przebieg manewru. Oddzielne rodziny obsługują balans, podskok/lot, drop, pompowanie, jazdę tyłem, pivot, ścianę, krawędź, zakręt, kamienie i podskoki na jednym kole.

### Podstawy i kontrola roweru

| Nazwa | Status | Rodzina | Prymitywy / parametry |
| --- | --- | --- | --- |
| Trackstand | wspomagane | trackstand | równowaga i skręt |
| Wheelie | wspomagane | balance | balance: 1, pedal: 1, angle: 0.68 |
| Manual | wspomagane | balance | balance: 1, angle: 0.49 |
| Stoppie / Endo | wspomagane | balance | balance: -1, angle: 0.68, brake: 1 |
| Bunny Hop | wspomagane | flight | hop: 1, height: 0.48 |
| English Bunny Hop | wspomagane | flight | hop: 1, simultaneous: 1, height: 0.34 |
| American Bunny Hop | wspomagane | flight | hop: 1, sequential: 1, height: 0.64 |
| Front Wheel Lift | wspomagane | balance | balance: 1, angle: 0.28, brief: 1 |
| Rear Wheel Lift | wspomagane | balance | balance: -1, angle: 0.28, brief: 1 |
| Pumping | wspomagane | pump | pump: 1 |
| Jump | wspomagane | flight | height: 1.08 |
| Drop | wspomagane | drop | drop: 1 |
| Preload | wspomagane | preload | preload: 1 |
| Scrub | wspomagane | flight | height: 0.5, table: 0.65, scrub: 1 |
| Whip | wspomagane | flight | height: 1.2, whip: 1 |

### Triki w powietrzu - dirt jump i slopestyle

| Nazwa | Status | Rodzina | Prymitywy / parametry |
| --- | --- | --- | --- |
| Tabletop | wspomagane | flight | height: 1.3, table: 1 |
| Turndown | stylizowane | flight | height: 1.5, turndown: 1 |
| Toboggan | wspomagane | flight | height: 1.25, seat: 1, toboggan: 1 |
| One Hander | wspomagane | flight | height: 1.1, hands: 1 |
| No Hander | wspomagane | flight | height: 1.25, hands: 2 |
| Tuck No Hander | wspomagane | flight | height: 1.3, hands: 2, tuck: 1 |
| One Footer | wspomagane | flight | height: 1.1, feet: 1 |
| No Footer | wspomagane | flight | height: 1.25, feet: 2 |
| Can-Can | wspomagane | flight | height: 1.6, cancan: 1, feet: 1 |
| No Foot Can-Can | wspomagane | flight | height: 1.8, cancan: 1, feet: 2 |
| Superman | wspomagane | flight | height: 1.7, feet: 2, superman: 1 |
| Superman Seat Grab | wspomagane | flight | height: 1.8, feet: 2, superman: 1, seat: 1 |
| Seat Grab | wspomagane | flight | height: 1.15, seat: 1 |
| Barspin | stylizowane | flight | height: 1.25, barspin: 1 |
| X-Up / Cross-Up | stylizowane | flight | height: 1.2, xup: 1 |
| Truckdriver | stylizowane | flight | height: 1.8, yaw: 1, barspin: 1 |
| Tailwhip | stylizowane | flight | height: 1.7, tailwhip: 1 |
| Double Tailwhip | stylizowane | flight | height: 2.3, tailwhip: 2 |
| Nothing | wspomagane | flight | height: 1.6, hands: 2, feet: 2 |
| Indian Air | wspomagane | flight | height: 1.9, feet: 2, indian: 1 |
| Suicide No Hander | stylizowane | flight | height: 1.65, hands: 2, suicide: 1 |
| Nac-Nac | wspomagane | flight | height: 1.65, feet: 1, nacnac: 1 |
| Lookback | stylizowane | flight | height: 1.35, lookback: 1 |
| Pendulum | stylizowane | flight | height: 2, feet: 2, pendulum: 1 |

### Obroty, salta i kombinacje

| Nazwa | Status | Rodzina | Prymitywy / parametry |
| --- | --- | --- | --- |
| 180 | wspomagane | flight | yaw: 0.5, height: 1.5 |
| 360 | wspomagane | flight | yaw: 1, height: 1.7000000000000002 |
| 540 | wspomagane | flight | yaw: 1.5, height: 1.9 |
| 720 | wspomagane | flight | yaw: 2, height: 2.1 |
| 900 | wspomagane | flight | yaw: 2.5, height: 2.3 |
| 1080 | wspomagane | flight | yaw: 3, height: 2.5 |
| Backflip | wspomagane | flight | flip: 1, height: 2.1 |
| Frontflip | wspomagane | flight | flip: -1, height: 2.1 |
| Double Backflip | stylizowane | flight | flip: 2, height: 3.1 |
| Triple Backflip | stylizowane | flight | flip: 3, height: 3.8 |
| Double Frontflip | stylizowane | flight | flip: -2, height: 3.1 |
| Backflip Barspin | stylizowane | flight | flip: 1, barspin: 1, height: 2.3 |
| Backflip Tailwhip | stylizowane | flight | flip: 1, tailwhip: 1, height: 2.5 |
| Frontflip Barspin | stylizowane | flight | flip: -1, barspin: 1, height: 2.3 |
| 360 Tailwhip | stylizowane | flight | yaw: 1, tailwhip: 1, height: 2.3 |
| 720 Barspin | stylizowane | flight | yaw: 2, barspin: 1, height: 2.5 |
| Backflip Superman | wspomagane | flight | flip: 1, feet: 2, superman: 1, height: 2.5 |
| 360 No Hander | wspomagane | flight | yaw: 1, hands: 2, height: 2.1 |

### Street i trial

| Nazwa | Status | Rodzina | Prymitywy / parametry |
| --- | --- | --- | --- |
| Fakie | wspomagane | fakie | fakie: 1 |
| Rollback | wspomagane | fakie | rollback: 1 |
| Half Cab | wspomagane | flight | yaw: 0.5, fakie: 1, hop: 1, height: 0.6 |
| Full Cab | wspomagane | flight | yaw: 1, fakie: 1, hop: 1, height: 0.9 |
| Nose Manual | wspomagane | balance | balance: -1, angle: 0.52 |
| Nose Pivot | wspomagane | pivot | pivot: -1, turn: 0.5 |
| Endo Turn | wspomagane | pivot | pivot: -1, turn: 1 |
| Pivot | wspomagane | pivot | pivot: 1, turn: 0.5 |
| Wallride | stylizowane | wallride | wall: 1 |
| Walltap | stylizowane | wallride | wall: 1, tap: 1 |
| Tire Tap | stylizowane | ledge | tap: 1 |
| Abubaca | stylizowane | ledge | stall: 1 |
| Fufanu | stylizowane | ledge | fufanu: 1 |
| Crankflip | stylizowane | flight | hop: 1, crankflip: 1, height: 0.6 |
| Gap Jump | wspomagane | flight | height: 0.8, gap: 1 |
| Side Hop | wspomagane | flight | hop: 1, sideways: 1, height: 0.42 |
| Pedal Kick | wspomagane | wheelhop | kick: 1, rear: 1 |
| Rear Wheel Hop | wspomagane | wheelhop | rear: 1 |
| Front Wheel Hop | wspomagane | wheelhop | front: 1 |
| Up to Rear | stylizowane | ledge | uprear: 1 |

### Techniki terenowe i rodzaje skoków

| Nazwa | Status | Rodzina | Prymitywy / parametry |
| --- | --- | --- | --- |
| Berm Riding | wspomagane | corner | corner: 1, berm: 1 |
| Flat Cornering | wspomagane | corner | corner: 1 |
| Switchback | wspomagane | corner | corner: 1, tight: 1 |
| Front Wheel Pivot | wspomagane | pivot | pivot: -1, turn: 0.5 |
| Rear Wheel Pivot | wspomagane | pivot | pivot: 1, turn: 0.5 |
| Rock Garden | wspomagane | rocks | rocks: 1 |
| Manual Drop | wspomagane | drop | drop: 1, manual: 1 |
| Bunny Hop Gap | wspomagane | flight | hop: 1, sequential: 1, gap: 1, height: 0.65 |
| Step-Up | wspomagane | flight | height: 1.6 |
| Step-Down | wspomagane | flight | height: 1 |
| Double | wspomagane | flight | height: 0.95, double: 1 |
| Roller | wspomagane | pump | roller: 1 |
| Pumptrack Flow | wspomagane | pump | pump: 1, flow: 1 |

## Testy silnika

`src/tests/engine.test.ts` sprawdza kompletność atlasu, rodziny obowiązkowych demonstracji, rozróżnienie osi, puszczenie/chwyt kończyn, niezależne barspin/tailwhip, kierunek pedałowania, kontakt ściany i krawędzi, zakresy zawieszenia, brak NaN w 11110 próbkach katalogu, reset/seek/pause/loop, zgodność 30/144 FPS oraz rzeczywisty impuls Rapiera i tłumienie sprężyny.

Wyniki testów programowych nie zastępują kontroli wizualnej ani fachowej walidacji ruchu. Aktualne wyniki builda, testów przeglądarkowych i ograniczenia weryfikacji podano w README.
