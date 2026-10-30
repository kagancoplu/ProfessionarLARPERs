# E-P1 — Havuz gezgini, canlı akış, Kasaba v1, replay v1

> Track E Faz 1 (`plan/track-E-frontend.md` §8 Faz 1). Yazan: E, 2026-10-30 19:35 CET. Zaman kutusu 4 saat (hedef ~23:30). Dal `main`. Önceki faz: `E-P0.md` (✅ `b001505`).

## 0. Amaç ve "bitti"

Cüzdansız bir jüri üyesi siteyi açıp **canlı havuzları** ve **Kasaba'da** ajanların pledge vermesini, lock-in'i, tek settlement'ı ve dolmayan havuzu görsün; her nesneye tıklayıp gerçek (canlıda) ya da `mock_` txid'li parşömeni okusun; **replay** ile aynı hikâyeyi istediği hızda izlesin.

Kabul (track): canlı modda B'nin servisleriyle havuzlar ve olaylar görünüyor (P0'da WS/SSE doğrulandı; havuz yoksa boş durum); Kasaba'da bir settlement sahnesi baştan sona oynuyor ve parşömendeki txid gerçek ya da `mock_`; replay çalışıyor; e2e "jüri turu" yeşil; `/design-review` kontrol listesi temiz.

## 1. Bağımlılıklar (30.10 19:35)

| Kaynak | Durum | P1'de |
|---|---|---|
| B `GET /pools`, `/pools/:id`, `/pledges`, WS, SSE | `main`'de, canlı denendi ✓ | TanStack sorguları + adaptörler (P0) |
| C ajan olay akışı (`AGENTS_URL`) | **yok** (C P2 bitti, SSE yazılmadı; ajanlar `decisions.log` yazıyor) | mock balonlar; `tools/log-relay.mjs` (activity/decisions log → SSE) yazılır, STATUS'ta C'ye not |
| B `/metrics` | `main`'de (P6a) | Metrics sayfasında canlıda gösterilir |
| Kenney Tiny Town | indirilmedi (insan) | zemin + binalar kodla çizilen sprite'lar; Kenney gelince `px.mjs` ile hizalanıp tile'lar değişir |

## 2. İş kalemleri ve dosyalar

### 2.1 Sprite'lar (`assets/sprites/`)
`villager` (16×24; 3 kıyafet rengi profil başına: finetune/eval/inference; 2 yön × 2 yürüme karesi + idle; sol yön yansıtma), `house` (32×32, 2 çatı rengi), `workshop` (48×48, baca), `chest` (16×16, kapalı/açık), `cart` (32×20, at + araba), `bell` (16×16, 2 kare), `tree` (16×24), `stall` (32×24), `gate` (24×32), `stranger` (P3'e hazır, 16×24). `tools/sprites.mjs` ayrıca **`public/game/ground.png`** (tile şeridi: grass A, grass B, dirt, road) üretir → Phaser tileset.

### 2.2 Kasaba (`src/town/`)
- `scenes/TownScene.ts`: `make.tilemap` (zemin verisi `map/ground.ts` ile üretilir: çimen + meydan toprak + kapıdan meydana yol), `map/town.json` nesne katmanından binalar (`workshop`, `house` slot 1–3, `board`, `stall`, `gate`, `harbor` yeri), noktalar (`square-centre`, `visitor-spawn`, `guard-post`). Kamera: sürükle, tekerlek zoom 2×/3×/4× (tam sayı), sınırlar. Gece: tema `night` iken koyu mavi örtü (alpha 0.45) + pencere ışıkları (sarı kare). DOM container açık (`dom.createContainer`) → etiketler ve balonlar HTML (Pixelify, keskin).
- `entities/Villager.ts`: sprite + isim etiketi (DOM) + kese (coin sprite, "reserved" iken parlar) + balon (DOM, 4 sn); `walkTo(x,y,speed)` (tween, kesilebilir), `wander()` (bekleme noktaları etrafında rastgele), `face(dir)`.
- `entities/Board.ts`: pano + çuval (5 dolum karesi) + DOM etiket (ad, `pledged/target`, "Festival in …") + kum saati (locking) + "+N credits" uçan yazı; `fade()` (başarısız: pano solar, 1 px aşağı), `settle()` parıltı.
- `entities/Workshop.ts`: atölye + tabela ("H100 GPU-hour") + baca dumanı (iş çalışırken `job_running` → parçacık; `job_done` → durur).
- `entities/House.ts`: ev + önünde sandık (ajanın kredisi varsa; settlement'ta "düşer") + sahip adı.
- `entities/Cart.ts`: settlement'ta soldan sağa meydanı geçer, her eve sandık bırakır.
- `fx/queue.ts`: `FxQueue` — olay → animasyon promise'i; **sıralı**, kesilebilir, `speed` çarpanı (replay hızı), `prefers-reduced-motion` → kısa kesim. Büyük sahne (`settlement`) sırayı bekler; küçükler (balon) paralel.
- `fx/scenes.ts`: `pledgeFx`, `lockInFx`, `settlementFx` (çan ×3, araba, sandıklar, keselerden altın atölyeye, parşömen), `failedPoolFx` (pano solar, "Nobody lost a satoshi" balonu), `thoughtFx`, `injectionFx` (P3 iskeleti), `jobFx`.
- `bridge.ts`: store'a abone (ajan ekleme/çıkarma → köylü/ev ataması; havuz listesi → aktif pano; tema), bus'a abone (olay → `fx.enqueue`). Phaser fetch yapmaz; store'a yalnız `ui` yazar (tıklama → `openDrawer`).
- `TownCanvas.tsx`: React sarmalayıcı (lazy Phaser, `pixelated`, boyut `Scale.FIT` 960×540), üstünde React köşe sayaçları ve `TownDrawer`.
- `TownDrawer.tsx`: `ui.drawer` → havuz detayı (`PoolDetail`), ajan kartı (`AgentCard`, karar logu, "focus" kamera), parşömen (`TxScroll`: tip, txid, WoC, aktörler).

### 2.3 Konsollar (`src/consoles/`)
- `pools/PoolsPage.tsx`: filtre (open/locking/settled/failed/cancelled), sıralama (deadline, dolum, indirim), kart/tablo (ilerleme, festival sayacı `blocksToHuman(deadline − height)`, sat/kredi vs perakende + `demo pricing`), satıra tıkla → `PoolDetail` drawer (terms, pledge tablosu `usePledges`, `coordinator` tur/kara liste/son tur, teklif var mı, settlement txid, audit linki canlıda).
- `explorer`: tip filtresi (T1–T11), aktör, zaman; WoC linkleri (var). `metrics`: canlıda B `/metrics` (`custodiedSats`, `custodyCheck`), mock'ta türetilmiş.
- `LiveFeed`: kaynak filtresi (küçük), 50 → 100.

### 2.4 Replay (`src/replay/`)
- `tools/record-mock.mjs` (tsx): senaryoyu 1 döngü senkron koşturup `public/replays/mock-demo.jsonl` yazar (zaman damgaları senaryo ofsetleriyle; `mock_` txid'ler). Commit edilir.
- `ReplayBar.tsx` (alt çubuk, yalnız `mode === 'replay'`): oynat/duraklat, hız 0.5/1/2/4/8, "Skip to settlement", konum `n/N`, "This is a mock recording" / (gerçek kayıt gelince) "This really happened on BSV mainnet" rozeti. `?replay=mock-demo` → `REPLAY` rozeti.
- `tools/record.mjs` (gerçek akış kaydedici: WS + SSE'lere abone → JSONL) — P1'de iskelet; S1/S2 mainnet koşusu olunca kullanılır.

### 2.5 Testler
- Birim: `fxqueue.test.ts` (sıra, kesme, hız), `ground.test.ts` (zemin üretimi deterministik, yol kapıdan meydana ulaşıyor), `bridge.test.ts` (ajan → ev ataması, en fazla 3 ev + sıra), `replay-record.test.ts` (kayıt dosyası ayrıştırılabilir, ilk olay `pool_opened`, bir `settled` var), `pools-sort.test.ts` (sıralama/filtre saf fonksiyonları).
- RTL: `pools-page.test.tsx` (filtre + satır tıkla → drawer), `replay-bar.test.tsx`.
- e2e `jury.spec.ts` (mock): Kasaba canvas'ı var; akışta settlement 20 sn içinde; panoya tıkla → drawer havuz adı; Pools'ta settled filtresi; Explorer'da T5 satırı; `?replay=mock-demo` → REPLAY rozeti, "Skip to settlement" → sayaç 1.

## 3. Kasaba sözleşmesi (track §5) — P1'de uygulananlar

| Kavram | P1 |
|---|---|
| Ajan → köylü (profil rengi, isim, kese) | ✓ |
| Düşünce/karar → balon 4 sn; karar logu drawer'da | ✓ |
| Sağlayıcı → atölye; iş çalışırken duman | ✓ |
| Havuz → pano + çuval + etiket + festival sayacı | ✓ |
| Pledge → köylü panoya yürür, jeton çuvala, "+N credits", kese parlar ("reserved") | ✓ |
| Lock-in → kum saati; imzada ✓ başının üstünde | ✓ (✓ işareti DOM) |
| Settlement → çan, araba, sandıklar, altın atölyeye, parşömen | ✓ |
| Başarısız havuz → pano solar, keseler kıpırdamaz, "Nobody lost a satoshi" | ✓ |
| Tıklama → drawer; kamera; gün/gece | ✓ |
| Guard/bekçi, şüpheli yabancı, vault sandığı, pazar sweep, liman | P3/P4 (sprite'lar hazır: stranger, chest, stall) |

## 4. Desktop onay noktaları
Yok (P1 salt izleme). Cüzdan çipi bağlanabilir; işlem akışları P2.

## 5. Riskler
| Risk | Plan |
|---|---|
| Phaser DOM container'ı `Scale.FIT` ile hizalanmıyor | DOM yerine Phaser `Text` (Pixelify, resolution 2) yedeği |
| Kalabalık olay akışı (replay 8×) animasyonları boğuyor | `FxQueue` küçük efektleri birleştirir; balon sınırı 1/köylü; büyük sahne kesilebilir |
| Zaman | Önce pledge + settlement + failed (demo omurgası), sonra duman/gece/araba cilası |

## 6. Checkpoint (Faz 1 sonu, 30.10 20:00)

**Kabul kanıtı**
- Kasaba v1 (`src/town/`): Phaser 3.90 sahnesi, kodla üretilen zemin (çimen/toprak meydan/yol), Tiled taslağından binalar (atölye, 3 ev, pano, tezgâh, kapı), köylüler (profil rengi, isim, kese), DOM etiketler/balonlar (Pixelify, keskin). Olay sahneleri: pledge (yürü, jeton çuvala, "+N credits", kese "reserved" parlar, sats cüzdanda), lock-in (kum saati, meydanda toplanma, ✓ balonları), **settlement** (çan, at arabası, evlere sandık, altın atölyeye, parşömen "1 transaction · N participants · 0 sat held by anyone"), başarısız havuz (pano solar, keseler kıpırdamaz, "Nobody lost a satoshi"), redeem (sandık + atölye dumanı). Kamera sürükle/zoom 2–4×, gece örtüsü + pencere ışıkları, tıklama → drawer (havuz detayı / köylü kartı / parşömen / atölye).
- `FxQueue`: büyük sahneler sıralı ve kesilebilir, pledge yürüyüşleri paralel (`inFlight`), settlement/lock-in onları bekler; `prefers-reduced-motion` son kareye atlar; replay hızı tween sürelerini böler.
- Pools sayfası: filtre (all/open/settled/failed), sıralama (newest/deadline/fill/discount), tablo (dolum çubuğu, sat/kredi + indirim `demo pricing`, festival sayacı, settlement txid), satır → `PoolDetail` drawer (terms, pledge tablosu, koordinatör turu/kara liste, teklif, audit linki canlıda). Explorer: T1–T11 filtresi, satır → parşömen. Metrics: canlıda B `/metrics`. Agents: kart → drawer.
- Replay v1: `public/replays/mock-demo.jsonl` (40 olay, `tools/record-mock.mjs`), `ReplayBar` (oynat/duraklat, 0.5–8×, skip to settlement, restart, "mock recording" rozeti; gerçek kayıt `mainnet-*` adıyla "This really happened on BSV mainnet" rozeti alır), `?replay=mock-demo` → REPLAY.
- Testler: web vitest **15 dosya / 44 test** (fxqueue, ground+layout, pools sort/filter, replay kaydı, PoolsPage RTL), kök `npm test` içinde **38**; Playwright **2/2** (smoke + jüri turu: canvas, settlement akışta, pools filtre + drawer, explorer T5, replay skip); web + kök typecheck temiz. Anti-slop grep temiz (gradyan/yuvarlak köşe/blur/pazarlama metni 0; Phaser renkleri `town/colors.ts` ile paletten).
- Ekran görüntüleri: `tools/screenshots.mjs` (`WAIT_MS`) ile Kasaba pledge + settlement anları alındı (scratchpad); P5'te README'ye.

**Checkpoint soruları**
1. Plan hâlâ iyi mi? Evet. Overlay SSE'den fark türetme (derive.ts) P0'da yazıldı; canlıda havuz olmadığı için gerçek olay akışıyla denenmedi (S1 sonrası). Kasaba performansı: 3 köylüde sorun yok; 50 ajan kalabalık modu P6/ölçek testinde.
2. Faz bitti → STATUS Track E.
3. Diğer track'ler: mainnet settlement (S1) **henüz yok** → gerçek replay kaydı bekliyor (`tools/record.mjs` iskeleti P2'de). C'nin ajan olay akışı yok → Kasaba balonları mock/replay'den; canlıda ajanlar `decisions.log` yazıyor → `tools/log-relay.mjs` P2'de (ya da C SSE verirse gereksiz).
4. P2 bağımlılıkları: A core builder'ları (var), B koordinatör turu (var), C provider-api **CORS yok** (istek açık; Vite proxy ile yerelde sorun değil), insan + Desktop + sats.
5. Arayüz değişikliği: yok (E'nin istekleri aynen açık).
