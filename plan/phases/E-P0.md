# E-P0 — İskelet, tasarım sistemi, veri katmanı, mock, Desktop bağlantısı

> Track E Faz 0 ayrıntılı planı (`plan/track-E-frontend.md` §8 Faz 0). Yazan: E (Claude oturumu), 2026-10-30 18:45 CET. Zaman kutusu 3 saat (hedef ~21:45).
> Dal: **`main`** (CLAUDE.md kuralı). Track E planı daha önce yalnızca `trackD`'de duruyordu; bu oturumda `main`'e taşındı (ayrıntı STATUS "Plan değişiklikleri").

## 0. Kapsam ve "bitti" tanımı

Diğer track'lere bağımlı olmadan, **mock modda tam veri akışı** çalışan, **gerçek BSV Desktop'a bağlanan**, pixel kimliği `DESIGN.md` ile oturmuş bir `apps/web` iskeleti. Konsol ekranları ve Kasaba sahnesi P1'de; P0'da yalnızca kabuk, store, adaptörler, mock, cüzdan bağlantısı, tasarım sistemi (`/_kit`), geliştirici paneli (`/_debug`) ve varlık hattı.

Kabul (track §8 Faz 0): `apps/web/DESIGN.md` var ve `/design-review` P0 ekranlarında AI-slop bulgusu vermiyor; `npm run web:mock` açılıyor; mock senaryo akarken store doluyor (`/_debug`); gerçek Desktop'a bağlanıp identity ve ağ görünüyor; `/_kit` tasarım sistemini gösteriyor; birim testler yeşil; build < 2 MB.

## 1. Kararlar ve sabitlenen sürümler

| Paket | Sürüm | Not |
|---|---|---|
| vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 | kit'in web'i de Vite 8 |
| react / react-dom / @types | 19.3.1 / 19.3.0 | |
| react-router | **7.18.5** | v8 çıktı; plan §1 "Router 7 library mode" → 7'de kalındı (API bilinen) |
| zustand / @tanstack/react-query | 5.0.16 / 5.105.0 | |
| phaser | **3.90.0** | 4.2.1 çıktı; plan §1 "Phaser 4 risk alma" → 3.90 |
| tailwindcss / @tailwindcss/vite | 4.3.3 | |
| msw | **2.15.0** | 3.0 çıktı; plan MSW 2 → 2.15 |
| vitest / jsdom / RTL / jest-dom / user-event | 4.1.12 (kökle aynı) / 30.1.3 / 16.3.3 / 6.10.0 / 14.6.8 | |
| @playwright/test | 1.64.1 | |
| howler / @types/howler | 2.2.4 / 2.2.13 | P4'te kullanılacak; P0'da yalnızca bağımlılık + `audio/sounds.ts` iskeleti |
| @fontsource/pixelify-sans, @fontsource/vt323 (+ gövde fontu) | 5.3.0 | Google Fonts CDN yerine paketten (CSP: her şey paket içi) |
| sharp / free-tex-packer-core | 0.35.5 / 0.3.9 | yalnızca `tools/` (devDependency) |
| clsx / tailwind-merge / class-variance-authority | 2.1.1 / 3.7.0 / 0.7.1 | `ui/` varyantları |
| @bsv/sdk | 3.2.1 (kök) | ESM build; `@agentcoop/core` workspace |

Diğer kararlar:
- **Testler iki katmanlı:** `apps/web/test/*.test.ts` saf mantık (store, reducer, derive, replay, mock senaryo, i18n) → hem kök `npm test` (kök vitest `apps/*/test/**/*.test.ts` deseni) hem `npm -w apps/web test`; `*.test.tsx` RTL testleri yalnızca web'in jsdom vitest'inde (kök desen `.tsx`'i almaz). Mantık testleri DOM/CSS/Vite-özel şey import etmez.
- **Kök `tsconfig.json`:** `apps/*/src` include'u `.tsx` dosyalarını da alır ve kökte `jsx` ayarı yok → kök `npm run typecheck` kırılırdı. Tek satır `"exclude": ["apps/web"]` eklendi (A'ya STATUS'ta bildirildi; `apps/web` kendi `tsconfig.json` + `npm -w apps/web run typecheck` ile denetlenir).
- **Kök `package.json`:** yalnızca script eklendi: `web`, `web:mock`, `web:build`, `web:test`.
- **`@bsv/sdk` tek kopya (tarayıcı):** `packages/core/src/sdk.ts` `../../../node_modules/@bsv/sdk/dist/cjs/mod.js`'i re-export ediyor. Vite `resolve.alias` `[{ find: /\/@bsv\/sdk\/dist\/cjs\/mod\.js$/, replacement: '@bsv/sdk' }]` → paketin `exports.import` (ESM) build'i. Doğrulama: `test/sdk-single-copy.test.tsx` değil, **tarayıcıda** `/_debug` "core smoke" paneli (`buildOpReturn`, `vaultLockingScript`, `TokenKit` import + çağrı) ve `vite build` çıktısında `dist/cjs` dizesinin olmaması.
- `@agentcoop/core` index'i tarayıcı-güvenli (grep: `node/*` dışında `node:` importu yok ✓).
- Phaser P0'da **yüklenir ama yalnızca `/_kit`'te atlas önizlemesi için** küçük bir sahne açılır (atlas uçtan uca kanıtı); Kasaba sahnesi P1.

## 2. Oluşturulacak dosyalar

```
apps/web/
├─ package.json  vite.config.ts  tsconfig.json  index.html  playwright.config.ts  vitest.config.ts  DESIGN.md  README.md
├─ public/   favicon.svg, game/atlas.{png,json} (tools çıktısı), replays/ (P1)
├─ assets/   LICENSES.md, palette.ts, sprites/{board,chest,coin,villager,workshop}.ts (P0'da en az board + coin + tile'lar), kenney/ (indirme; insan)
├─ tools/    sprites.mjs (matris → SVG tsx + PNG kareleri + atlas), px.mjs (CC0 PNG → palet hizalama), record.mjs (P1), log-relay.mjs (P1)
├─ src/
│  ├─ main.tsx  app.tsx  routes.tsx  env.ts
│  ├─ store/   index.ts (vanilla + hook), slices/{me,pools,listings,vaults,agents,jobs,txs,notifications,metrics,ui,settings,health}.ts, reducers.ts, selectors.ts
│  ├─ events/  types.ts (CoopEvent + tüm tipler), bus.ts, derive.ts, adapters/{coordinatorWs,overlaySse,agentsSse,guardSse,replay,mock}.ts, sse.ts (ortak EventSource sarmalayıcı, Last-Event-ID, backoff)
│  ├─ api/     http.ts (baseUrl + JSON + hata), coop.ts, overlay.ts, provider.ts, guard.ts, agents.ts, arcade.ts, woc.ts, queries.ts (TanStack sorgu anahtarları + invalidate eşlemesi)
│  ├─ wallet/  client.ts (durum makinesi), authFetch.ts, errors.ts, flows/ (P2; P0'da yalnız `connect`), types.ts (WalletLike)
│  ├─ mock/    handlers.ts (MSW), data.ts (sabit kimlikler/havuz/ajanlar), scenario.ts, wallet.ts, browser.ts (worker başlatma)
│  ├─ consoles/ (P1+; P0'da boş sayfa bileşenleri: Town, Pools, Market, Agents, Provider, Explorer, Metrics, Owner, Settings)
│  ├─ ui/      Signboard (tabela kartı), PixelButton, Scroll (parşömen modalı), Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState, LoadingState, ServiceBadge, Tag (dürüstlük etiketleri), Sprite (SVG), tokens.css
│  ├─ shell/   TopBar, WalletChip, ModeBadge, NotificationBell, SoundToggle, Nav, NarrowScreenNotice
│  ├─ dev/     KitPage (/_kit), DebugPage (/_debug: olay akışı, state ağacı, core smoke, sağlık)
│  ├─ town/    (P1; P0'da `game.ts` config + `scenes/AtlasPreview.ts` yalnızca /_kit için)
│  ├─ audio/   sounds.ts (iskelet, Howler; varsayılan sessiz)
│  └─ i18n/    en.ts, t.ts
└─ test/     store.test.ts, reducers.test.ts, derive.test.ts, scenario.test.ts, i18n.test.ts, env.test.ts, wallet-state.test.ts; ui.test.tsx, shell.test.tsx; e2e/smoke.spec.ts
```

## 3. Store dilimleri ve olay tipleri

### 3.1 `CoopEvent` (MASTER §3.10 birebir) ve web'in ürettiği türetilmiş tipler

`src/events/types.ts`:
- Zarf: `{ id, ts, src: 'coordinator'|'overlay'|'provider'|'agents'|'guard'|'maker'|'web', type, data, txid?, poolId?, agent? }`.
- Koordinatör (WS'den zarflanır): `pool_update { poolId, pledgedCredits, status }`, `sign_request { poolId, round, plan, yourInputIndex }`, `settled { poolId, txid }`, `round_failed { poolId, round, missing[] }`, `pool_failed { poolId }`, `hello_ack`, `error`.
- Overlay (SSE ham): `admitted { txid }`, `spent { txid }`. `derive.ts` bunlardan: `pool_opened`, `pledge_added`, `pledge_cancelled`, `pool_settled`, `pool_cancelled`, `listing_added`, `listing_filled`, `listing_cancelled`, `vault_funded`, `vault_spent` (hepsi `src:'overlay'`, `data` içinde ilgili görünüm).
- Ajanlar: `agent_started`, `agent_thought`, `agent_decision`, `agent_job`, `agent_payment`, `agent_injected` (§3.10 şekilleri).
- Guard: `cosign_approved`, `cosign_denied`, `policy_updated`, `vault_registered`, `vault_paused`/`vault_resumed`.
- Sağlayıcı (opsiyonel): `job_queued|job_running|job_done`, `credits_redeemed`, `payment_received`.
- Web (yerel): `wallet_connected`, `wallet_disconnected`, `service_health { service, ok }`, `flow_step` (P2), `mode_changed`.

Tip güvenliği: `CoopEventMap` (type → data) + `EventOf<T>`; `isEvent(e, type)` daraltıcı.

### 3.2 Dilimler (`src/store/slices/*`)

| Dilim | Alanlar | Kaynak |
|---|---|---|
| `mode` | `'live'|'mock'|'replay'`, `replayName?` | env / URL `?mode=` `?replay=` |
| `me` | `status: 'idle'|'connecting'|'connected'|'error'`, `identityKey?`, `network?`, `error?`, `roles: { provider, owner, participant }` (türetilir) | wallet/client |
| `health` | servis başına `{ ok: boolean|'unknown', checkedAt, detail? }` (coop, overlay, provider, guard, agents) | `/healthz` poll 30 sn + adaptör bağlantı durumu |
| `pools` | `byId: Record<poolId, ApiPool & { pledges?: PledgeView[] }>`, `order` | REST `GET /pools` + `pool_update` + türetilmiş olaylar |
| `listings` | `byOutpoint`, `byToken` | REST `GET /listings` + olaylar |
| `vaults` | `byId: VaultView & { policy?, decisions? }` | overlay `vaults` lookup, guard `/policies`, `/decisions`, olaylar |
| `agents` | `byIdentity: { name, profile, identity, mode, vaultId?, lastThought?, lastDecision?, purseSats? }` | `GET {AGENTS_URL}/agents` + ajan olayları |
| `jobs` | `byId` | sağlayıcı olayları / poll (P2) |
| `txs` | `list: TxRecord[]` (`kind: T1..T11`, txid, ts, actor, poolId?, label) | olaylardan türetilir (`reducers.ts` `txFromEvent`) |
| `notifications` | `items: { id, kind: 'sign_request'|'info'|'error', ts, expiresAt?, poolId?, read }` | `sign_request`, hatalar |
| `metrics` | `settlements`, `participants`, `feeSats`, `custodiedSats: 0`, `villageSavingsSats` (demo pricing etiketli) | türetilir; B `/metrics` gelince ek |
| `feed` | son 200 `CoopEvent` (Live feed + `/_debug`) | bus |
| `ui` | `drawer?: { kind, id }`, `toasts[]`, `narrowScreen` | React/Phaser |
| `settings` | `sound: false`, `reducedMotion`, `theme: 'day'|'night'|'auto'`, `presenter` | localStorage |

`store/index.ts`: `createStore` (zustand vanilla) + `useStore` hook + `applyEvent(e)` (tek giriş: `reducers.ts`), `hydrate(queryResult)` (REST listeleri). Phaser sonradan `store.subscribe` ile okur, yalnız `ui` yazar.

### 3.3 Olay akışı

`bus.ts`: `publish(e)` → `feed`'e ekle → `applyEvent` → TanStack `invalidate` eşlemesi (`queries.ts`: `pool_update` → `['pools']`, `['pool', id]`; `admitted/spent` → derive; guard olayları → `['vault', id]` …) → `fx` kuyruğu (P1'de Kasaba). Replay kaydedici de bus'a abone (P1).

## 4. Kullanılan servis uçları (MASTER §3)

| Servis | Uç | P0'da |
|---|---|---|
| Koordinatör (§3.5) | `GET /pools`, `GET /pools/:id`, `GET /pools/:id/pledges`, `GET /listings`, `GET /healthz`, `GET /metrics` (varsa), `WS /ws` (`hello` yalnız Desktop bağlıyken; `pool_update` hello'suz da geliyor — `apps/coordinator/src/ws.ts` doğrulandı) | sorgular + WS adaptörü |
| Overlay (§3.8) | `POST /lookup { service:'ls_agentcoop', query }` (`pools`, `pledges`, `vaults`, `listings`, `outpoint`), `GET /agentcoop/events` (SSE, `Access-Control-Allow-Origin: *`) | SSE adaptörü + derive |
| Sağlayıcı (§3.6) | `GET /healthz`, `GET /v1/catalog` (auth; P0'da yalnız mock) | mock handler |
| Guard (§3.7, D.P2 trackD'de ✅) | `GET /healthz`, `GET /events` (SSE), `GET /policies/:agent`, `GET /decisions` | mock handler + SSE adaptörü (canlı guard main'e gelince aynı adaptör) |
| Ajanlar (§3.10, C'den istek) | `GET /agents`, `GET /events` (SSE) | mock |
| Arcade (§20) | `GET /chaintracks/v2/height` (30 sn; gün/gece ve "festival" sayacı) | `api/arcade.ts` |

Vite dev proxy (CORS'suz yerel): `/api/coop → :8090` (ws:true), `/api/overlay → :8080`, `/api/provider → :8092`, `/api/guard → :8091`, `/api/agents → :8093`. `env.ts`: `VITE_*_URL` boşsa ve dev ise proxy yolları, yayında doğrudan URL'ler.

## 5. Cüzdan (0.6)

`wallet/client.ts`: `WalletClient('auto')` (originator = sayfa origin'i; constructor'da). Durum makinesi `idle → connecting → connected | error`; `connect()`: `waitForAuthentication({})` (zaman aşımı 20 sn), `getNetwork({})`, `getPublicKey({ identityKey: true })`. `network !== VITE_NETWORK` → uyarı rozeti. `disconnect()` yalnızca yerel durumu sıfırlar. Hata eşlemesi `errors.ts`: Desktop kapalı/ulaşılamıyor ("Open BSV Desktop and unlock it"), kullanıcı reddetti ("Nothing was sent"), ağ uyuşmazlığı, zaman aşımı. Mock modda `mock/wallet.ts` aynı arayüzü verir (`MockWallet implements WalletLike`: `waitForAuthentication`, `getNetwork`, `getPublicKey`, `createAction`/`createSignature` → ekranda sahte "Approve in BSV Desktop" diyaloğu, `mock_` önekli txid).

**Desktop onay noktaları (P0):** yalnızca bağlanma: Desktop ilk kez identity key izni isteyebilir (1 pencere). Başka işlem yok.

**Core smoke (tarayıcıda, `/_debug`):** `buildOpReturn('pool', {...})` hex, `vaultLockingScript(a,b,c)` uzunluğu 109 B, `new TokenKit(wallet, new OverlayClient(url))` örneği, `parseOpReturn` geri okuma; sonuç ve `@bsv/sdk` build yolu (ESM mi) panelde. Sonuç STATUS'a (A).

## 6. Mock senaryosu (0.5)

`mock/data.ts`: 1 sağlayıcı (identity `02…`), provider-api sunucu kimliği, 3 ajan (`finetune`, `eval`, `inference`), 1 insan katılımcı (siz), 1 sahip, 1 guard, token `gpu-h100` (`<mocktxid>_0`), ürün 50 sat/kredi.

`mock/scenario.ts` (süreç içi; `speed` çarpanı, `pause/resume`, döngüsel):
1. `t=0` havuz açılır: `pool_opened` (1000 kredi, 25.000 sat, deadline +60 blok, fee 300) → `pools` güncellenir
2. `t+2s…+10s` ajan düşünceleri + kararlar + pledge'ler: `agent_thought`, `agent_decision(pledge)`, `pledge_added` (300/400/300), `pool_update` ilerleme
3. `t+12s` lock-in: `pool_update(locking)`, `sign_request` (yalnız Desktop bağlıysa ve siz katıldıysanız; mock'ta `me` için bildirim demo'su)
4. `t+16s` `settled { txid: mock_settle_1 }`, `pool_settled`, `txs` T5
5. `t+18s` redeem + iş: `credits_redeemed`, `agent_job(queued→running→done)`
6. `t+24s` injection: `agent_injected`, `cosign_denied { reason: 'maxPerPoolSats exceeded (6,000 > 5,000)' }`
7. `t+28s` ikinci havuz açılır, 1 pledge, deadline geçer → `pool_failed` ("Nobody lost a satoshi")
8. döngü başa (yeni poolId'lerle)

MSW handler'ları (`mock/handlers.ts`): `GET /pools`, `/pools/:id`, `/pools/:id/pledges`, `/listings`, `/healthz` (coop); `POST /lookup` (overlay: `pools`, `pledges`, `vaults`); provider `/healthz`, `/v1/catalog`; guard `/healthz`, `/policies/:agent`, `/decisions`; agents `/agents`. Hepsi `mock/data.ts` + senaryo durumundan okur (tek doğruluk: `mock/state.ts`). SSE/WS mock'ta yok: senaryo doğrudan bus'a yazar (adaptörler mock modda bağlanmaz).

## 7. Tasarım sistemi (0.2)

1. `/design-consultation` → `apps/web/DESIGN.md`: palet (Kenney Tiny Town'dan türetilmiş sıcak palet + gece paleti; token adları `--surface-parchment`, `--surface-night`, `--ink`, `--wood`, `--gold`, `--grass`, `--danger`, `--ok`), tipografi (Pixelify Sans başlık, VT323 sayaç, gövde fontu: Inter/Roboto/Arial/Space Grotesk/Silkscreen **değil**), boşluk ölçeği (4 px tabanlı, pixel adım), köşe (kare / 2 px adım), gölge (1–2 px sert ofset), hareket (anlamlı; `prefers-reduced-motion`), ton (somut, ürüne özgü metin).
2. Tailwind 4 `@theme` token'ları `ui/tokens.css`; hex bileşende yazılmaz.
3. 8bitcn/ui: `npx shadcn@latest add` ile `button`, `card`, `badge`, `progress`, `dialog`, `input`, `table`, `tabs`, `toast` denenir; lisansı MIT olmayan bileşen kurulmaz; kurulanlar token'larla yeniden stillenir. CLI/ağ sorunu olursa `ui/` elle yazılır (aynı adlar).
4. `/_kit`: tüm `ui/` bileşenleri gün/gece, durumlar (hover/focus/disabled/loading), sprite'lar 1×/3×, palet kartları, tipografi ölçeği, dürüstlük etiketleri.
5. Faz sonu `/design-review` → bulgular düzeltilir.

## 8. Varlık hattı (0.8)

- `assets/palette.ts`: `TOWN_PALETTE` (ad → hex; ≤ 48 renk) + `NIGHT_PALETTE` (aynı adlar). Kaynak: Kenney Tiny Town renkleri (insan indirince `tools/px.mjs --extract` ile doğrulanır; P0'da elle seçilmiş sıcak palet, DESIGN.md'de gerekçeli).
- `assets/sprites/<ad>.ts`: `{ name, w, h, frames: string[][], anchor?, fps? }`; karakter = palet indeksi harfi, `.` şeffaf. P0'da: `board` (ilan panosu 32×32), `sack` (çuval 16×16, 4 dolum karesi), `coin` (8×8, 4 kare), `tile_grass`, `tile_dirt`, `tile_road` (16×16).
- `tools/sprites.mjs`: (a) `src/ui/sprites.generated.tsx` (`<Sprite name zoom />`, `shape-rendering: crispEdges`, `<rect>` satır birleştirmeli), (b) `public/game/atlas.png` + `atlas.json` (Phaser JSONHash; `sharp` ile PNG, `free-tex-packer-core` ile paketleme). `npm -w apps/web run sprites`.
- `tools/px.mjs`: CC0 PNG → en yakın palet rengi + şeffaf temizliği (Kenney PNG'leri için; P0'da birim testle doğrulanır, gerçek paket insan indirince).
- `assets/LICENSES.md`: tablo (dosya, kaynak URL, lisans, el/AI/kod, değişiklik). Kenney satırı "indirilmedi; insan listesi".
- Tiled haritası: P0'da `src/town/map/town.json` **el yazımı Tiled JSON taslağı** (60×34, 16 px, katmanlar: ground, decor, buildings(object), points(object)); nesneler: meydan, atölye, 3 ev, pazar, kapı, liman yeri. P1'de Tiled ile düzenlenir.

## 9. Testler

**Birim (vitest, kök + web):** `env.test.ts` (mod/URL çözümleme), `store.test.ts` (dilimler, seçiciler), `reducers.test.ts` (her olay tipi → state; `txFromEvent` T1–T11), `derive.test.ts` (overlay `admitted/spent` + lookup farkı → türetilmiş olaylar), `scenario.test.ts` (mock senaryo deterministik; hızlandırılmış koşuda olay sırası), `i18n.test.ts` (eksik anahtar yok), `wallet-state.test.ts` (durum makinesi + hata eşlemesi, sahte cüzdanla), `sprites.test.ts` (matris → SVG rect sayısı; palet dışı renk hata).
**Bileşen (RTL, web):** `ui.test.tsx` (Signboard, PixelButton durumları, EmptyState/ErrorState/LoadingState), `shell.test.tsx` (TopBar: bağlı değil → "Connect BSV Desktop", mock cüzdanla bağlanınca kısaltılmış identity + ağ rozeti, mod rozeti MOCK).
**e2e (Playwright, mock):** `smoke.spec.ts`: sayfa açılır, mod rozeti `MOCK`, `/_debug`'da 10 sn içinde ≥ 5 olay, `/_kit` render, "Connect" sahte Desktop diyaloğu → identity çipi.
**Build:** `vite build` < 2 MB (Phaser ayrı chunk, lazy).

## 10. Bağımlılıkların durumu (30.10 18:45)

| Track | Durum | P0 etkisi |
|---|---|---|
| A core | `main`'de P2 ✓; index tarayıcı-güvenli ✓; `sdk.ts` CJS yolu → Vite alias | smoke testle doğrulanır |
| B overlay+koordinatör | `main`'de P3 + P6a ✓; CORS: koordinatör `*` ✓, overlay SSE `*` ✓, overlay-express `corsPolicy` (lookup; canlıda doğrulanır); WS `pool_update` hello'suz ✓ | canlı adaptörler bağlanabilir; `npm run infra` kökte **yok** (B'nin A'dan isteği), `node infra/run.mjs` var |
| C provider-api | `main`'de P1 ✓; **CORS yok** (istek açık); agents SSE yok | mock + Vite proxy |
| D guard | `origin/trackD`'de D.P2 ✓ (E uçları + CORS); `main`'de yok | mock; adaptör hazır |
| İnsan | Desktop (mainnet) bu makinede var (D notu); sats yok | bağlantı testi yapılabilir, işlem yok |

## 11. İnsan yapılacaklar (STATUS'a da yazıldı)

1. BSV Desktop açıkken `npm run web` → "Connect BSV Desktop" → izin penceresi → identity/ağ çipi görünmeli (sonucu STATUS'a).
2. Kenney *Tiny Town* zip'ini (kenney.nl, CC0) indirip `apps/web/assets/kenney/tiny-town/` altına açmak; `npm -w apps/web run px` ile palet hizalama.
3. `apps/web/DESIGN.md` ve `/_kit` sayfasını gözden geçirip palet/gövde fontu tercihini onaylamak (ya da değiştirmek).
4. Cloudflare Pages hesabı (P4).

## 12. Riskler (P0)

| Risk | Plan |
|---|---|
| Vite alias CJS yolunu yakalamıyor (`export *` CJS'den) | `resolve.alias` regex; olmazsa `optimizeDeps.include`; en kötü A'dan `exports` `"browser"` |
| 8bitcn/ui CLI ağ/lisans sorunu | `ui/` elle (aynı API) |
| Root typecheck/test kırılması | `exclude: ["apps/web"]`; mantık testleri node-güvenli |
| Desktop origin izni (`http://localhost:5173`) | Kit'in web'i aynı yolu kullanıyor; sorun olursa STATUS |
| Zaman | P0'da Kasaba yok; atlas yalnız `/_kit` önizlemesi |

## 13. Checkpoint (Faz 0 sonu, 30.10 19:30)

**Kabul kanıtı**
- `apps/web/DESIGN.md` var (`/design-consultation`, otonom koşu; kararlar "Decisions made without user confirmation" tablosunda). Anti-slop: gstack `design-checklist.md` §1–3 kod üzerinde grep (gradyan 0, `rounded`/`border-radius` 0, `text-center` 0, blur/glow 0, yasak font 0, pazarlama metni 0, emoji-ikon 0) + 7 ekran görüntüsü (gün/gece). Bulgular düzeltildi: bağlı cüzdan çipinin gece renkleri, üst çubuk satır kırılması, akış zaman damgası sarması, sayı biçimi tutarsızlığı, `⚠` glifi. Tam `/design-review` tarayıcı döngüsü (gstack browse/bun) koşulmadı → insan listesi.
- `npm run web:mock` açılıyor; senaryo akıyor; `/_debug` olayları ve state'i gösteriyor (e2e: ≥ 1 olay 10 sn içinde, core smoke `data-ok=true`, sahte Desktop bağlanıyor).
- `/_kit` tasarım sistemini gün + gece paletinde gösteriyor; Phaser atlas önizlemesi 17 kare.
- Testler: web `vitest` 10 dosya / **33 test**; kök `npm test` içinde apps/web **28 test** (saf mantık); Playwright **1/1**; `npm -w apps/web run typecheck` ve kök `npm run typecheck` temiz.
- Build: `dist/` 3,9 MB toplam; **ilk yük ≈ 1,3 MB** (index 436 kB + sdk 830 kB; Phaser 1,19 MB ve MSW lazy chunk). Fontlar paket içi. `dist/cjs` referansı yok (tek SDK kopyası).
- **Core smoke (tarayıcı, A'ya):** `@agentcoop/core` 111 export; `buildOpReturn` 43 B + `parseOpReturn` geri okuma ✓; `vaultLockingScript` 109 B ✓; `new TokenKit(wallet, new OverlayClient(url))` ✓; core'un `LockingScript`'i `@bsv/sdk`'nın `Script`'inin örneği (tek kopya) ✓. Vite alias yetti; `exports` "browser" koşulu **gerekmiyor**.
- Gerçek BSV Desktop bağlantısı bu oturumda denenmedi (insan listesi).

**Checkpoint soruları**
1. Plan hâlâ iyi mi? Evet. Değişiklikler: Kasaba sahnesi P1'e; Kenney indirmesi insana; portlar `PORT` env ile (5173 bu makinede dolu).
2. Faz bitti → STATUS Track E güncellendi.
3. Diğer track'ler: B overlay+koordinatör `main`'de ve **canlı denendi** (`node infra/run.mjs` ile; coop/overlay/arcade yeşil, WS + SSE bağlandı; STATUS Track E); C provider-api CORS yok (istek açık); D guard uçları `origin/trackD`'de, `main`'de yok.
4. P1 bağımlılıkları: B.P1–P3 canlı için var; ajan olay akışı yok → mock/log-relay.
5. Arayüz değişikliği: MASTER §3.10'a ek yok; STATUS'ta kök tsconfig satırı (A) ve bilgi notları.
