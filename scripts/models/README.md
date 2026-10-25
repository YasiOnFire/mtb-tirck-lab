# Opcjonalne modele lokalne

Publiczny projekt działa z dołączonym modelem Quaternius i proceduralnym rowerem. Te narzędzia służą pracy lokalnej z własnymi modelami CGTrader, uzyskanymi zgodnie z ich licencjami. Nie pobierają ani nie publikują modeli.

Postać: rozpakuj własny `Realistic+Male+3D+Character+Model.zip` do `artifacts/import-character/source/`, zachowując strukturę archiwum. Wymagane Node.js, zależności projektu oraz Python 3 z Pillow. Następnie uruchom z katalogu projektu:

```powershell
node scripts/prepare-imported-rider.mjs
```

Kask: `node scripts/prepare-helmet.mjs --source helmet.obj`.

Wyniki oraz archiwa są ignorowane przez Git. Włączenie lokalnego zestawu wymaga wszystkich trzech plików podanych w głównym README, w tym dopasowanego `torque.glb`. Pochodzenie: [ASSET_LICENSES.md](../../ASSET_LICENSES.md).
