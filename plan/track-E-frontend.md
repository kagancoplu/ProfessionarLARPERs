# Track E — Frontend: "Coop Kasabası" (pixel-art canlı görünüm) + iş gören konsollar (`apps/web`)

> **Rol:** AgentCoop'un kullanıcıya dönük yüzünün tamamı. İki katman, tek veri modeli: (1) **Konsollar** — sağlayıcı, ajan sahibi, insan katılımcı, gözlemci/jüri için hızlı, formlu, tablolu arayüz; her zincir işlemi kullanıcının **kendi BSV Desktop'ında** onaylanır. (2) **Kasaba** — aynı verinin pixel-art, Stardew-esintili canlı görünümü: ajanlar köylü, sağlayıcı atölye, havuz meydandaki pano, settlement çan ve at arabası, guard bekçi. Kasaba sonradan oyuna (avatar, çok oyuncu) büyüyecek şekilde tasarlanır.
> **Referanslar:** `00-MASTER-PLAN.md §3` (özellikle §3.5 koordinatör WS, §3.6 sağlayıcı API, §3.7 guard, §3.8 overlay lookup/SSE, **§3.10 frontend olay akışları**), `FINAL-IDEA.md §3, §4.3–4.10, §11 (demo senaryosu)`, `docs/BSV_STACK_COMPLETE_GUIDE.md §4 (WalletClient), §6, §9, §10 (AuthFetch/402), §17 (TokenKit)`, kit `web/src/main.ts` (tarayıcıdan Desktop'a bağlanan referans), `docs/TBC26_BSV_Track_Requirements.pdf` (B2: "connect user-facing flows to BSV wallets").
> **Sahibi:** ayrı bir kişi (E). Diğer track'lerin dosyalarını değiştirmez; istekleri STATUS üzerinden iletir.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver:
   > "`plan/00-MASTER-PLAN.md` §3 (özellikle §3.5–3.10) ve §4'ü, `plan/STATUS.md`'yi ve `plan/track-E-frontend.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Önce `plan/phases/E-P<N>.md`'ye ayrıntılı planı yaz, sonra kodla. Bitince Checkpoint'i uygula ve STATUS.md Track E bölümünü güncelle."
2. **Kullanıcının anahtarı asla istenmez, saklanmaz, gösterilmez.** Her imza `WalletClient('auto')` üzerinden Desktop'ta atılır. Sunucu cüzdanı, `.env`, özel anahtar bu uygulamanın hiçbir yerinde yok.
3. **Üç çalışma modu her zaman çalışır:** `live` (gerçek servisler), `mock` (MSW + sahte olay akışı; diğer track'ler hazır değilken geliştirme ve e2e testler), `replay` (kaydedilmiş gerçek mainnet olayları). Bir özellik mock'ta çalışmıyorsa bitmemiştir.
4. **Yürütme sırası:** P0 → P1 → P2 → P3 → P4 → *(zaman kalırsa P6 avatar → P7 çok oyuncu)* → **P5 teslim** (her zaman son, asla atlanmaz). Teslime 4 saat kala nerede olunursa olunsun P5'e geçilir.
5. Telif: Stardew Valley yalnızca **atmosfer referansı**. Onun sprite'ları, karakterleri, isimleri, arayüz parçaları kullanılmaz. Her görsel varlık ya CC0 ya takımın ürettiği (Claude ile, kod olarak) ya da açıkça izinli; hepsi `apps/web/assets/LICENSES.md`'de kayıtlı. **bsvmunich.com** (BSVA'nın workshop sitesi, büyük ihtimalle jürinin işi) yalnızca referans: izin olmadan kod, sprite veya sahne kopyalanmaz (§6.4).
6. **Anti-slop kuralları (§6.3) bağlayıcıdır.** P0'da `/design-consultation` ile `apps/web/DESIGN.md` yazılır; her fazın Checkpoint'inde `/design-review` koşulur ve DESIGN.md dışına çıkan her şey bulgu sayılır.

---

## 0. Kararlar (kesinleşti)

| Konu | Karar |
|---|---|
| Yaklaşım | **Hibrit.** Konsollar iş görür; Kasaba aynı veri katmanını okuyan canlı görünüm ve giriş ekranı. İkisi aynı pixel-art kimliğini taşır (pixel font başlıklar, "tabela" kartlar, kasaba paleti) |
| Etkileşim | Önce **tıklama** (kamera + binaya/ajana tıkla → panel). Avatar (WASD) **P6**'da, ancak zaman kalırsa |
| Oyuncu sayısı | **Tek kişi.** Çok oyuncu (başka ziyaretçileri görmek) **P7**, ancak zaman kalırsa |
| Platform | **Yalnızca masaüstü tarayıcı** (BSV Desktop ile). Mobil/BSV Browser kapsam dışı; dar ekranda "masaüstünde açın" uyarısı |
| Dil | **İngilizce**; i18n altyapısı (tek sözlük dosyası) var, tek çeviri |
| Cüzdansız ziyaretçi | Canlı izleme (Kasaba, havuzlar, gezgin, metrikler) + **replay** modu. İşlem yapmak Desktop ister |
| Yayın | Herkese açık statik site (Cloudflare Pages) **ve** yerelde `npm run web`. Servis URL'leri `VITE_*` env'den; B'nin Faz 5 URL'leri geldiğinde değiştirilir |
| Ses | Var, **varsayılan sessiz**, tek tıkla açılır (tarayıcı autoplay kuralı). CC0 ses paketleri |
| Görseller | CC0 paketler (önce Kenney) + Claude'un **kodla çizdiği** sprite'lar (renk matrisi → SVG/PNG, §6.2). AI raster görsel üretimi yok. bsvmunich.com yalnızca referans (§6.4) |
| Stack | §1 (E kişisinin tercihleri yoksa aynen) |

---

## 1. Stack ve gerekçe

| Katman | Seçim | Neden | Alternatif (neden değil) |
|---|---|---|---|
| Derleme / geliştirme | **Vite** + TypeScript (kökteki TS sürümü), `apps/web` workspace üyesi | Hızlı HMR, statik çıktı, `define`/env, dev **proxy** ile CORS'suz yerel geliştirme (`/api/coop` → :8090 vb.) | Next.js: SSR gereksiz, Desktop bağlantısı zaten istemci tarafı |
| UI | **React 19** + **React Router 7** (library mode) | Formlar, tablolar, paneller; ekip tecrübesi; Phaser ile yan yana sorunsuz | Svelte/Solid: ekosistem ve test araçları daha az |
| Durum | **Zustand 5** (vanilla store + React hook) | React dışından (Phaser sahneleri, olay adaptörleri) aynı store'a yazılıp okunabiliyor; seçicilerle az render | Redux: fazla tören; Jotai: Phaser tarafından erişim zahmetli |
| Sunucu verisi | **TanStack Query 5** (REST: havuzlar, listeler, katalog, vault'lar) + olay akışlarında `invalidate` | Önbellek, yeniden deneme, arkaplan yenileme; SSE/WS olayı gelince ilgili sorgu geçersiz kılınır | Elle fetch + store: yeniden deneme/önbellek elle yazılır |
| Kasaba motoru | **Phaser 3** (en son 3.x kararlı; kurulumda sürümü sabitle) | Tilemap (Tiled JSON), sprite animasyonu, tween, kamera, parçacık, ses, girdi hazır; `pixelArt: true` + `roundPixels`; P6 avatar için Arcade Physics hazır | PixiJS: daha düşük seviye (tilemap/animasyon elle); Phaser 4: henüz kararlı değilse risk almayın |
| Harita | **Tiled** (ücretsiz editör) → JSON tilemap, 16×16 tile, **3× ölçek** (48 px) | Katmanlı harita, nesne katmanında "binalar" ve "noktalar" (ajan evleri, pano, tezgâhlar) veri olarak | Elle koordinat: hızlı başlar, büyüyünce yönetilemez |
| Stil | **Tailwind CSS 4** + **8bitcn/ui** (shadcn CLI ile kurulan açık kaynak 8-bit bileşenler; erişilebilir) temel, üstüne kendi token'larımız ve özel bileşenler (`ui/`: Tabela kartı, Parşömen modalı, UnderTheHood paneli, sayaç). 21st.dev / Magic MCP (takımın premium hesabı) yalnızca karmaşık etkileşim iskeleti için (tablo, drawer, komut paleti, adım adım form) ve **her zaman** DESIGN.md token'larıyla yeniden stillenir; lisansı "unknown" olan bileşen kurulmaz | Pixel kimliği özel bileşen ister; düz shadcn/21st.dev varsayılanları "AI SaaS" görünür | Pixelact UI (daha az bileşen), nes-ui-react (retro konsol havası, köy temasına uymuyor) |
| Yazı tipleri | Google Fonts (OFL): **Pixelify Sans** (başlık/etiket), **VT323** (büyük rakamlar, sayaçlar); gövde fontu P0'da `/design-consultation` ile seçilir: okunaklı, karakterli, **Inter/Roboto/Arial/Space Grotesk değil** (jürinin sitesi Inter + Silkscreen kullanıyor; ondan ayrışmak için Silkscreen de kullanılmaz) | Pixel kimliği + uzun metinde okunabilirlik + jüri sitesinden ayrışma | Her yerde Press Start 2P: tablo/formda okunmaz |
| Cüzdan | `@bsv/sdk` **`WalletClient('auto')`** (tarayıcı; originator = sayfa origin'i), `AuthFetch` (BRC-103/104 + BRC-105 402), **`@agentcoop/core`** builder'ları (`buildPledge`, `signSettlementInput`, `reserveListing`, `buildSweep`, `TokenKit` …) | Tüm imzalar Desktop'ta; core'un aynı kodu CLI'larda da çalışıyor (tek doğruluk kaynağı) | Kendi tx kurucusu: asla |
| Mock | **MSW 2** (REST) + süreç içi sahte olay üreticisi (`mock/scenario.ts`) + sahte `WalletClient` (`mock/wallet.ts`: onay penceresini simüle eder) | Diğer track'ler hazır olmadan tam akış; e2e testlerin temeli | Ayrı sahte sunucu: iki yerde bakım |
| Test | **Vitest** (store, adaptörler, replay, akış mantığı) + **React Testing Library** (paneller) + **Playwright** (e2e, mock modda; Kasaba için ekran görüntüsü karşılaştırması) | Kökteki vitest ile uyum; e2e Desktop'suz koşar | Cypress: Playwright daha hızlı ve paralel |
| Ses | **Howler 2** (tek ses yöneticisi; Kasaba dışındaki ekranlarda da çalışır) | Phaser ses yöneticisi sahneye bağlı; UI sesleri sahnesiz de çalmalı | Phaser Sound: yalnız sahnede |
| Görsel hattı | `assets/sprites/*.ts` (Claude'un yazdığı renk matrisleri + palet) → `tools/sprites.mjs` (React için `crispEdges` SVG, Phaser için PNG + atlas; `sharp`, `free-tex-packer-core`); CC0 PNG'ler için `tools/px.mjs` (palet hizalama) | Gerçek pixel-art: keskin, paletten çıkmaz, bulanık AI görüntüsü yok. Jürinin sitesi de sprite'larını aynı yöntemle (kodda matris → SVG `crispEdges`, canvas `fillRect`) çiziyor | AI raster üretimi (PixelLab, Retro Diffusion vb.): slop ve provenans riski; kullanılırsa `LICENSES.md`'de "AI-generated" |
| Yayın | **Cloudflare Pages** (ya da Vercel) statik build; `VITE_*` build-time | Ücretsiz, hızlı, özel alan adı kolay; B'nin alan adı altında `app.<alan>` | VPS'e koymak: B'nin Caddy'sine bağımlı olur |

**Tarayıcıda SDK tek kopya kuralı (MASTER §3.1'in tarayıcı karşılığı):** tarayıcıda wallet-toolbox yok, dolayısıyla `@bsv/sdk`'nın **ESM** build'i kullanılır. `packages/core/src/sdk.ts` CJS build'ini göreli yolla yeniden export ettiği için Vite'ta `resolve.alias` ile `/@bsv\/sdk\/dist\/cjs\/mod\.js$/` → `@bsv/sdk` yönlendirmesi yapılır (E.P0 0.6 bunu bir smoke testle doğrular; olmazsa A'dan `exports` içinde `"browser"` koşulu istenir). `@agentcoop/core` **index**'i yalnızca tarayıcı-güvenli modülleri export ediyor (`node/*` ayrı giriş); E.P0'da bu denetlenir ve sızan `node:` importu varsa A'ya STATUS'tan bildirilir.

---

## 2. Mimari

### 2.1 Katmanlar

```
┌──────────────────────── apps/web ────────────────────────────────────────────┐
│  UI (React)                         Kasaba (Phaser)                            │
│  routes/ consoles/ ui/              town/scenes/ town/entities/ town/fx/       │
│        │  useStore(selector)                │  store.subscribe(selector)       │
│        ▼                                    ▼                                  │
│  ┌──────────────────── store (Zustand, tek doğruluk) ───────────────────┐     │
│  │ pools · pledges · listings · vaults · agents · jobs · txs · me ·      │     │
│  │ notifications (sign requests) · settings · mode (live|mock|replay)    │     │
│  └───────────────▲──────────────────────────────────────────▲───────────┘     │
│                  │ reducers (events → state)                 │ queries          │
│  ┌────────────── event bus (CoopEvent) ──────────────┐  ┌── api/ (TanStack) ─┐ │
│  │ adapters: coordinatorWs · overlaySse · agentsSse  │  │ coop · overlay ·   │ │
│  │           guardSse · providerSse · replayFile     │  │ provider · guard   │ │
│  └───────────────────────────────────────────────────┘  └────────────────────┘ │
│  ┌── wallet/ ──────────────────────────────────────────────────────────────┐   │
│  │ WalletClient('auto') · AuthFetch · flows/ (core builder'larını saran    │   │
│  │ "işlem akışları": pledge, sign, cancel, mint, openPool, listing, sweep, │   │
│  │ redeem, job, vault fund/withdraw/policy)  → her adım Desktop onayı       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
        ▲ WS /ws          ▲ SSE               ▲ REST                ▲ BRC-100 (3321/2121)
   koordinatör (B)   overlay (B), agents (C), guard (D), maker (D)   BSV Desktop
```

- **Store tek doğruluk kaynağıdır.** Hem konsollar hem Kasaba aynı store'u okur; Kasaba hiçbir veriyi kendisi çekmez. Bu, "sonradan oyun ekleme" kararının teknik karşılığı: oyun büyüdükçe veri katmanı değişmez.
- **Olaylar → reducer → state; sorgular → state.** REST'ten gelen tam liste state'i değiştirir; olaylar hem state'i günceller hem de Kasaba animasyonlarını tetikler (`fx` kuyruğu).
- **`flows/`**: her kullanıcı işlemi tek bir fonksiyon (`flows/pledge.ts: pledge(poolId, credits)`), içinde core builder + Desktop çağrıları + hata eşleme; CLI'larla aynı core fonksiyonları, farklı `WalletInterface`. Mock modda `flows` sahte cüzdanla çalışır ve sahte olay üretir.

### 2.2 Klasör yapısı

```
apps/web/
├─ package.json  vite.config.ts  tsconfig.json  index.html  playwright.config.ts
├─ public/             favicon, replays/*.jsonl (kaydedilmiş gerçek olaylar), audio/
├─ assets/             kaynak sprite/tile/ses + LICENSES.md (+ tools/px.mjs çıktıları → public/game/)
├─ tools/              px.mjs (pixel hattı), atlas.mjs, record.mjs (olay kaydedici), log-relay.mjs (ajan log → SSE yedeği)
├─ src/
│  ├─ main.tsx  app.tsx  routes.tsx  env.ts (VITE_*, mod)
│  ├─ store/           slices: pools, listings, vaults, agents, jobs, txs, me, notifications, settings; selectors; reducers
│  ├─ events/          types.ts (CoopEvent, MASTER §3.10), bus.ts, adapters/{coordinatorWs,overlaySse,agentsSse,guardSse,providerSse,replay,mock}.ts, derive.ts (overlay SSE → anlamlı olaylar)
│  ├─ api/             coop.ts, overlay.ts (lookup), provider.ts, guard.ts, arcade.ts, woc.ts (link yardımcıları)
│  ├─ wallet/          client.ts (WalletClient, bağlantı durumu), authFetch.ts, flows/*.ts, errors.ts (Desktop hatalarını insan diline çevirir)
│  ├─ consoles/        pools/ market/ owner/ provider/ participant/ explorer/ agents/ metrics/ settings/
│  ├─ ui/              Tabela, PixelButton, Scroll (parşömen modalı), Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState
│  ├─ town/            game.ts (Phaser config), scenes/{Boot,Town,UI}.ts, entities/{Villager,Workshop,Board,Chest,Guard,Stall,Harbor,Cart}.ts, fx/{bubbles,coins,bell,smoke}.ts, map/ (Tiled JSON), bridge.ts (store ↔ Phaser)
│  ├─ replay/          player.ts (hız, duraklat, atla), recorder.ts
│  ├─ mock/            handlers.ts (MSW), scenario.ts (olay senaryosu), wallet.ts (sahte Desktop)
│  ├─ audio/           sounds.ts (Howler), map: olay → ses
│  └─ i18n/            en.ts, t()
└─ test/               unit (vitest), components (RTL), e2e/ (Playwright)
```

### 2.3 Çalışma modları

| Mod | Nasıl | Kullanım |
|---|---|---|
| `live` | `VITE_DATA_MODE=live`; adaptörler gerçek WS/SSE'ye bağlanır, REST gerçek servislere; yerelde Vite proxy (`/api/coop`, `/api/overlay`, `/api/provider`, `/api/guard`, `/api/agents`) CORS'u atlar | Demo, mainnet |
| `mock` | `VITE_DATA_MODE=mock` (`npm run web:mock`); MSW REST'i, `mock/scenario.ts` olayları, `mock/wallet.ts` Desktop'ı taklit eder (onay penceresi yerine ekranda "Approve in BSV Desktop" sahte diyalogu) | Geliştirme, e2e, diğer track'ler hazır değilken |
| `replay` | URL `?replay=<ad>` veya ayar; `public/replays/<ad>.jsonl` dosyası oynatılır (hız 0.5×–8×, duraklat, "settlement'a atla"); gerçek txid'ler, gerçek linkler | Video, canlı demo yedeği, jüri |

Mod ne olursa olsun **UI kodu değişmez**; yalnızca adaptörler ve `WalletInterface` değişir.

---

## 3. Veri modeli ve olay akışları

### 3.1 Store (özet)

| Dilim | Kaynak | İçerik |
|---|---|---|
| `me` | WalletClient | `connected`, `identityKey`, `network`, roller için türetilmiş bilgiler (sağlayıcı mı: kendi havuzu var mı; sahip mi: vault'u var mı), Desktop basket'leri (`agentcoop`, `agentcoop vault`, `agentcoop offers`, `agentcoop listings`, `bsv21`) |
| `pools` | `GET /pools`, `/pools/:id`, `/pools/:id/pledges` (B §3.5) + `pool_update` | `ApiPool` + pledge listesi (`context`: participant, credits, height, valid, spent) + `coordinator` (tur, kara liste) |
| `listings` | `GET /listings?tokenId=` | `Listing` + satıcı + birim fiyat |
| `vaults` | overlay `{ op:'vaults', owner }`, guard `GET /policies/:agent`, `GET /decisions` | bakiye, UTXO'lar, politika, kararlar (403'ler) |
| `agents` | `config/identities.json` (+ C'nin profilleri) + ajan olay akışı | ad, profil, identity, son düşünce, son karar, konum (Kasaba), kesesi (bakiye, overlay'den türetilmiş) |
| `jobs` | provider `GET /v1/jobs/:id` (+ olaylar) | durum, log, sonuç hash'i, kim |
| `txs` | her olaydan türetilir | tip (T1–T11), txid, zaman, aktör, link |
| `notifications` | `sign_request`, hatalar, bilgi | imza istekleri **geri sayımlı** (60 sn tur), kalıcı bildirim merkezi |
| `metrics` | türetilir (+ B Faz 6 `/metrics`) | settlement sayısı, katılımcı, ücret, **custodiedSats = 0**, "village savings" |

### 3.2 Olay zarfı (MASTER §3.10'da tanımlı; burada özet)

Her kaynak kendi biçiminde gelir; adaptörler hepsini `CoopEvent { id, ts, src, type, data, txid?, poolId?, agent? }` zarfına çevirir. Replay dosyası bu zarfın JSONL'idir; kaydedici de bunu yazar. Böylece **canlı, mock ve replay aynı reducer'dan geçer.**

| Kaynak | Protokol | Durum | Not |
|---|---|---|---|
| Koordinatör | WS `/ws` (`hello`, `pool_update`, `sign_request`, `settled`, `round_failed`, `pool_failed`, `error`) | **Var** (B.P2) | `hello` yalnızca Desktop bağlıyken, kendi identity ile; cüzdansız izleyici `hello` göndermez, `pool_update` yine de gelir mi? → E.P0'da doğrula; gelmiyorsa poll |
| Overlay | SSE `GET /agentcoop/events` → `{ type:'admitted'\|'spent', txid }` | **Var** (B.P3) | Kaba olay; `events/derive.ts` her olayda ilgili sorguları (pools/pledges/listings/vaults) yeniden okuyup **farkı** anlamlı olaya çevirir (`pledge_added`, `listing_filled`, `vault_funded` …) |
| Ajanlar | SSE `GET {AGENTS_URL}/events` | **İstek (C)**; yedek: `tools/log-relay.mjs` `DATA_DIR/agents/*/activity.log`'u SSE'ye çevirir | Düşünce balonları ve karar akışı buradan |
| Guard | SSE `GET {GUARD_URL}/events` + `GET /decisions` | **D.P1'de gelecek** (MASTER §3.7 güncellendi) | Bekçi animasyonu, 403 nedenleri |
| Sağlayıcı | SSE `GET /v1/events` (opsiyonel) | **İstek (C, düşük öncelik)**; yedek: `GET /v1/jobs/:id` poll | Atölye dumanı ve iş ilerlemesi |
| Maker (Rail) | SSE `GET /events` | D.P3 ile birlikte | Liman sahnesi |

### 3.3 Diğer track'lerden istenenler (STATUS'a yazıldı; E.P0 başında teyit edilir)

| Kimden | Ne | Neden | E'nin geçici çözümü |
|---|---|---|---|
| **A** | `@agentcoop/core` index'i tarayıcıda derlenir (node importu yok); `sdk.ts` için Vite alias yetmezse `exports` `"browser"` koşulu | Konsollar core builder'larını doğrudan kullanır | E.P0 0.6 smoke testi; olmazsa alias/regex |
| **B** | Overlay ve koordinatör **CORS** (Faz 5.3'te var); WS `pool_update`'in `hello`'suz izleyicilere de gitmesi; `GET /pools` cevabında `pledges`'in da gelmesi (opsiyonel, tek istek) | Cüzdansız jüri Kasaba'yı görmeli | Vite proxy; ayrı `/pledges` istekleri |
| **C** | provider-api **CORS** + açığa çıkarılan başlıklar (`x-bsv-auth-*`, `x-bsv-payment-*`, guide §10.5); `apps/agents` SSE `GET /events` (`AGENTS_URL`, port 8093) ve profil listesi `GET /agents`; `apps/provider-cli` cüzdan tarafı mantığının (`openPool`, `sweepRevenue`, `syncRevenue`) tarayıcıda da çalışabilir olması (node importu yok) | 402 ödemesi tarayıcıdan; ajan balonları; sağlayıcı konsolu | `log-relay.mjs`; sağlayıcı akışlarını core ile E yeniden kurar ve C'ye bildirir |
| **D** | Guard `GET /policies/:agent`, `GET /decisions?agent=&limit=`, `GET /events` (SSE), `GET /vaults/:vaultId` (overlay'den özet); owner-cli akışlarının (`createVault`, `fund`, `policy`, `withdraw`) tarayıcı-güvenli modülde olması; Rail için maker `GET /quote`, `GET /events` | Sahip konsolu, bekçi, liman | Mock guard |
| **B (Faz 5)** | Herkese açık URL'ler + `app.<alan>` DNS kaydı | Yayın | Cloudflare Pages varsayılan alan adı |

---

## 4. Ekranlar ve akışlar

### 4.1 Genel düzen

- **Üst çubuk:** logo (AgentCoop, pixel), gezinme (Town · Pools · Market · My Agents · Provider · Explorer · Metrics), sağda **cüzdan çipi** (bağlı değil → "Connect BSV Desktop"; bağlı → kısaltılmış identity, ağ rozeti `mainnet`), **bildirim zili** (imza istekleri geri sayımla), ses düğmesi, mod rozeti (`LIVE` / `MOCK` / `REPLAY`).
- **Kasaba** ana sayfa (`/`). Diğer ekranlar sağdan açılan **Drawer** (binaya tıklayınca) ya da tam sayfa (gezinmeden). `Tab` tuşu Kasaba ↔ ilgili tabloya geçer ("Ledger view").
- Her işlem **"Parşömen"** (scroll) diyaloğuyla onaylanır: ne yapılacak, kaç sat, hangi adres, ardından "Approve in BSV Desktop" adımı (Desktop penceresi açılır; ekranda bekleme animasyonu), sonuç txid + WhatsOnChain linki.
- **"Under the hood" paneli** (her işlem ekranının sağında): işlemin her adımı insan diliyle bir satır + protokol etiketi (`BRC-29`, `AtomicBEEF`, `SPV`, `SINGLE|ACP`, `ALL`, `2-of-2`, `internalizeAction`, `0-conf`) + ölçülen süre (ms) + WhatsOnChain linki; ücret satoshi ve euro olarak, "1 euro cent" ölçeğine karşı. AgentCoop'a özgü satırlar: "Your coin stays in your wallet (pledge)", "The provider signed once and went offline (SINGLE|ACP)", "Every participant checked the whole transaction before signing (ALL)", "N participants · 1 transaction · 0 sat held by anyone", "The guard checked the policy and co-signed / refused: <reason>". Fikir bsvmunich.com'dan (jüri bu kalıbı seviyor); görünüm ve metin bizim.
- Tüm sayfalarda **boş durum**, **yükleniyor**, **servis kapalı** (hangi servis, yeniden dene) ve **hata** (insan dilinde; Desktop hataları `wallet/errors.ts` ile çevrilir) durumları var.

### 4.2 Roller ve yapabildikleri (her satır bir `flows/` fonksiyonu + Desktop onay noktası)

**Gözlemci / jüri (cüzdansız)**
| Ekran | İçerik | Kaynak |
|---|---|---|
| Town | canlı kasaba; her nesneye tıklayınca parşömen (txid'li) | store |
| Pools | açık/kilitleniyor/tamamlanan/başarısız/iptal havuzlar; dolum, deadline (blok + tahmini süre), indirim (perakendeye göre), pledge listesi, `coordinator` tur bilgisi ve kara liste nedenleri | B §3.5 |
| Explorer | tüm işlemler T1–T11 tipleriyle, aktör, zaman, WoC linki; filtre | türetilmiş `txs` |
| Metrics | settlement sayısı, katılımcı, ücret/settlement, bayt, **Held in custody: 0 sat**, **Village savings**, başarısız havuz = 0 kayıp | türetilmiş + B Faz 6 `/metrics` |
| Audit (B Faz 6 varsa) | `GET /pools/:id/audit` sonucu: sıralama yeniden hesaplanmış, hash eşleşiyor mu | B |
| Replay | oynatıcı kontrolleri | `replay/` |

**İnsan katılımcı (Desktop)**
| Akış | Core / API | Desktop onayı |
|---|---|---|
| Havuza katıl (pledge) | `buildPledge(wallet, terms, credits, 'p2pkh', { tokenIndex })` → overlay submit (core yapar) | 1 (`createAction`) |
| Pledge iptal | `cancelPledge(wallet, outpoint)` | 1 |
| **İmza merkezi** | WS `hello { identity, poolIds }` (bağlanınca otomatik) → `sign_request` → **60 sn geri sayım bildirimi** → kullanıcı "Review & sign" → ekranda plan özeti (benim kredim, para üstüm, ücret, hash kontrolü sonucu) → `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: true })` → `signSettlementInput(plan, i, new P2pkhWalletSigner(wallet, { protocolID, keyID }))` → `sign_response` | 1 (`createSignature`) |
| Settlement sonrası | `settled` → `internalizeSettlement(wallet, tx, plan, myOutpoint, pledgeInstructions)` (para üstü `agentcoop` basket'ine, kredi `bsv21`'e; `TokenKit.sync`) | 0–1 |
| Kredilerim | `TokenKit.balances()` (overlay doğrulamalı), `bsv21` basket | — |
| Krediyi kullan (redeem) | `TokenKit.send(tokenId, n, catalog.credits.redeemTo)` → `POST /v1/credits/redeem { beef, outputIndex }` (AuthFetch) | 1 |
| İş çalıştır | `POST /v1/jobs { kind, minutes }` (AuthFetch; ön ödemeli yetiyorsa 0, değilse 402 → Desktop öder) → `GET /v1/jobs/:id` poll → "GPU log" + sonuç parşömeni | 0–1 |
| Krediyi iade al | `POST /v1/credits/return` | 0 |
| Market: sat | `reserveListing` → `signListing` → `POST /listings` | 2 |
| Market: iptal | `cancelListing` | 1 |
| Market: al (sweep) | listeleri seç → `buildSweep(wallet, kit, listings, { verifyLineage: true })` | 1 |

**Ajan sahibi (Desktop)**
| Akış | Core / API (D.P1'de) | Desktop onayı |
|---|---|---|
| Vault oluştur + fonla | `vaultLockingScript(ownerPub, agentPub, guardPub)` + `OP_RETURN vault {…}` → `createAction` (basket `agentcoop vault`) | 1 |
| Politika yaz | guard `PUT /policies/:agent` (AuthFetch, sahip kimliği); şablonlar (D Faz 5B) | 0 (auth imzası) |
| Ajanı izle | kararlar, harcamalar, kalan haftalık tavan, guard 403'leri (neden) | guard `GET /decisions`, overlay `vault` |
| Duraklat / geri çek | `pause` (guard, D Faz 5B); `withdraw` (OP_IF dalı: `createAction + signAction`) | 0 / 1 |
| Base'den fonla (Rail; D.P3 başarılıysa) | maker `GET /quote` → MetaMask ile Base HTLC `lock` → BSV tarafı claim (ajan+guard) → vault'a | MetaMask 1–2, Desktop 0 |

**Sağlayıcı (Desktop)**
| Akış | Core / API | Desktop onayı |
|---|---|---|
| Kredi bas | `TokenKit.deploy({ sym, amt, dec })` → tokenId ürüne yazılır (C'nin `products/*.json`'u sunucuda; UI tokenId'yi gösterir ve C'ye bildirir) | 1 |
| Havuz aç | `buildReserveAndAnnounce` → `signOffer` → `POST /offers` | 2 |
| Havuzu iptal | `cancelPool(wallet, kit, poolId)` | 1 |
| Havuzlarım | pledge'ler, dolum, tur durumu | B |
| Gelir | overlay `pledges`/`settlement` → `agentcoop revenue` basket'ine `internalizeAction` (`sync-revenue`), `sweep-revenue` (default'a) | 0 / 1 |
| Kullanım | redeem edilen krediler, çalışan işler (provider-api) | C (yeni endpoint gerekirse istek) |

### 4.3 Bildirim ve imza merkezi (kritik yol)

- Desktop bağlanınca WS `hello` otomatik; bağlantı koparsa yeniden bağlanır (backoff) ve `hello` yinelenir.
- `sign_request` geldiğinde: zil kırmızı, sağ altta geri sayımlı kart (`ROUND_TIMEOUT_MS`), ses (açıksa), **tarayıcı bildirimi** (izin verilmişse) ve sekme başlığı "(1) Sign request". Kullanıcı başka sayfadaysa bile görür.
- Doğrulama **imzadan önce** ekranda: kredim ✓, para üstüm ✓, Σkredi = N ✓, hash ✓, soy (`verifyLineage`) ✓/✗. Bir kontrol düşerse "Reject" tek tık (`sign_reject { reason }`).
- Süre dolunca kart "missed" olur; `round_failed` → kullanıcı bekleme listesinde mi, kara listede mi (neden) gösterilir.

---

## 5. Kasaba tasarım sözleşmesi

### 5.1 Kavram eşlemesi (kesin)

| AgentCoop kavramı | Kasabadaki karşılığı | Veri / olay |
|---|---|---|
| Ajan | Köylü sprite (profil başına renk/kıyafet: finetune, eval, inference), isim etiketi, başının üstünde kese (sats) | `agents` |
| Ajanın düşüncesi / kararı | Düşünce balonu ("Retail 50 sat/h, pool 25 sat/h. Joining with 8 credits.") 4 sn görünür; karar logu drawer'da | `agent_thought`, `agent_decision` |
| İnsan katılımcı / ziyaretçi | Şimdilik "siz" için kasabanın kenarında bir **ziyaretçi** figürü (P6'da avatar olur) | `me` |
| Sağlayıcı | **Atölye / demirhane**; iş çalışırken bacadan duman; tabelada ürün ("H100 GPU-hour") | `jobs`, provider olayları |
| Havuz | Meydandaki **ilan panosu** + altında dolan **çuval** (ilerleme), etiket ("8×H100 · 1 week", "1000 credits · 25,000 sat"), **festival sayacı** ("Festival in 3 days" = deadline'a kalan blok, ~10 dk/blok) | `pools` |
| Pledge | Köylü panoya yürür, çuvala jeton atar, "+300 credits" balonu; **kese küçülmez, parlayıp "reserved" olur** (para hâlâ kendi cüzdanında) | `pledge_added` |
| Pledge iptali | Jeton çuvaldan geri uçar, kese normale döner | `pledge_cancelled` |
| Lock-in / imza turu | Pano üstünde kum saati; köylüler meydanda toplanır, her imzada başında ✓; tur düşerse ✗ ve kara listeye giren köylü kızarır | `pool_update(locking)`, `sign_*`, `round_failed` |
| **Settlement** | **Çan çalar**, at arabası meydandan geçer, her katılımcının evinin önüne **kredi sandığı** bırakır, altın keseleri atölyeye uçar; ekranda tek parşömen: "1 transaction · N participants · 0 sat in custody" + WoC linki | `settled` |
| Başarısız havuz | Pano solar ve yere düşer; keseler **hiç kıpırdamaz**; balon: "Nobody lost a satoshi" | `pool_failed` |
| İptal edilen havuz | Sağlayıcı ilanı indirir | `pool_cancelled` |
| Kredi token'ı | Evin önündeki sandık; üstünde miktar | overlay `utxos` / basket |
| Kredi kullanımı (redeem) + iş | Köylü sandıkla atölyeye yürür, kapı ışığı yanar, ilerleme çubuğu, sonunda **sonuç parşömeni** çıkar | `credits_redeemed`, `job_*` |
| Perakende 402 ödemesi | Köylü atölyeye gider, kesesinden jeton (küçülür), parşömen | `agent_payment(402)` |
| Vault | Sahibin evindeki **kilitli sandık**; üstünde bakiye ve politika rozeti | `vaults` |
| Guard | Köy kapısındaki **bekçi**; onayda başını sallar, redde "!" balonu ve kalkan | `cosign_approved/denied` |
| Prompt injection | **Şüpheli yabancı** ajanın yanına gelip fısıldar (balon: enjekte edilen metin); ajan sandığa koşar; bekçi araya girer, "!" ve 403 nedeni ("maxPerPoolSats exceeded") | `agent_injected` → `cosign_denied` |
| Sahip çekimi | Sahip sandığı açar, altın eve döner | `vault_spent(owner)` |
| Market | **Pazar tezgâhları**; listelenen kredi tezgâhta fiyat etiketiyle; sweep = tüccar bütün tezgâhı toplar | `listing_*` |
| Coop Rail | Kasabanın kenarında **liman/köprü**; USDC ile gelen gemi, köprüden geçerken para BSV'ye dönüşür; iki zincirin linki | maker olayları |
| İşlem kaydı | Her sandığa/altına/panoya tıklayınca **parşömen**: tip, txid, WoC linki, aktörler | `txs` |
| Gün/gece | Deadline bloklarına bağlı yumuşak gün döngüsü; gece pencere ışıkları | Arcade yüksekliği (30 sn'de bir) |
| Köşe sayaçları | "Village savings: X sat" (perakende − havuz fiyatı toplamı, "demo pricing" etiketi), **"Held in custody: 0 sat"**, settlement sayısı | `metrics` |

### 5.2 Sahne ve teknik kurallar

- **Boyut:** 16×16 tile, harita ~60×34 tile, 3× ölçek; canvas 960×540 mantıksal, ekrana `Scale.FIT`. `pixelArt: true`, `roundPixels: true`, `antialias: false`.
- **Kamera:** sürükle ile kaydırma, tekerlek ile 2×–4× zoom (tam sayı ölçek), "bir ajana odaklan" (drawer'dan). Avatar gelince kamera onu izler (P6).
- **Katmanlar:** zemin, dekor, binalar (nesne katmanında `kind: workshop|house|board|stall|gate|harbor`, `agent?: name`), üst dekor, UI (ayrı `UIScene`, zoom'dan etkilenmez).
- **Varlık yerleşimi:** haritadaki nesne katmanı binaları verir; **ajan evleri** `agents` dilimine göre atanır (profil → ev), yeni ajan gelirse boş ev; 3'ten fazla ajan için sıra (Faz 6 ölçek testinde 50 ajan: kalabalık modu, küçük figürler, isim etiketleri kapalı).
- **Hareket:** köylüler boşta rastgele dolaşır (bekleme noktaları), olayda hedefe yürür (A* gerekmez; waypoint grafı). Tüm animasyonlar **kesilebilir** (yeni olay gelince eski hedef iptal), **kuyruklu** (`fx` kuyruğu; settlement gibi büyük sahneler sırayı bekler) ve **replay hızına** uyar (tween süreleri `speed`'e bölünür).
- **Tıklama → panel:** her varlığın `onClick` → `store.ui.open({ kind, id })`; React drawer açılır. Hover'da kısa etiket.
- **Store ↔ Phaser köprüsü:** `town/bridge.ts` store'a abone olur, farkı hesaplar (eklenen/çıkan ajan, pool durumu) ve sahneye komut verir; olay kuyruğunu `fx`'e besler. Phaser **asla** fetch yapmaz, store'a **yalnızca** `ui` dilimini yazar.
- **Performans:** sprite atlasları (≤ 2 atlas), nesne havuzu (balonlar, jetonlar), 60 fps hedef; sekme gizliyken döngü yavaşlar; kalabalık modunda balonlar kapalı.
- **Erişilebilirlik:** Kasaba dekoratiftir; her bilgi konsollarda da var. `prefers-reduced-motion` → büyük sahneler kısa kesilir; ses varsayılan kapalı.

### 5.3 Ses haritası (Howler; CC0)

| Olay | Ses |
|---|---|
| pledge | jeton |
| settlement | çan + at arabası |
| guard red | kalkan "tınk" + kısa uyarı |
| sign_request | zil (bildirim) |
| job done | parşömen |
| ambient | hafif köy fonu (loop, düşük ses) |

---

## 6. Görsel kimlik, varlık kaynakları ve anti-slop

- **Palet:** CC0 bir tile paketinden türetilmiş 32–48 renklik sıcak palet (toprak, ahşap, çimen, gün batımı); UI token'ları (`--wood`, `--parchment`, `--ink`, `--gold`, `--grass`, `--danger`) Tailwind temasında; Kasaba ve konsollar aynı paleti kullanır. Dark mode: "gece" paleti (aynı token'lar).
- **Kaynaklar:** §6.1. Her dosya `assets/LICENSES.md`'de: dosya, kaynak URL, lisans, el çizimi mi / AI mı / kodla mı, değişiklik.
- **Claude görsel hattı (§6.2):** Claude raster görsel üretmez; sprite'ı **kod olarak** çizer.
- **UI parçaları:** 9-slice "tabela" ve "parşömen" çerçeveleri (CC0 veya üretilmiş), pixel ikon seti (jeton, sandık, çan, kalkan, gemi, GPU).
- **Logo:** AgentCoop için pixel logo; BSVA logosu yalnızca `BSVA Logo Guidance` kurallarına göre, "Built on BSV" alanında, değiştirilmeden.


### 6.1 Varlık kaynakları (öncelik sırasıyla)

| Kaynak | Ne için | Lisans | Not |
|---|---|---|---|
| **Kenney** (kenney.nl): *Tiny Town* (16×16, 130 dosya), *Tiny Dungeon*, *RPG Urban*, *Pixel UI Pack*; ses: *RPG Audio*, *Interface Sounds*, *Impact Sounds* | Zemin, binalar, UI çerçeveleri, efekt sesleri | **CC0** (atıf gerekmez) | İlk tercih; Tiny Town lisansı doğrulandı |
| **LimeZu – Serene Village (revamped)** (itch.io) | Sıcak köy havası (Stardew'e en yakın) | **CC-BY 4.0** | Kullanılabilir; README + `LICENSES.md`'de atıf şart |
| ellen0ra – Cozy Farm Tileset; tofupixel – Fields of Adventure (itch.io) | Çiftlik/köy dekoru | Sayfada yazmıyor | İndirmeden önce lisans alanı kontrol edilir; belirsizse kullanılmaz |
| **Claude, kodla** (§6.2) | Ayırt edici nesneler: GPU atölyesi, ilan panosu + çuval, kilitli sandık, bekçi, şüpheli yabancı, at arabası, çan, pazar tezgâhı, liman/gemi, köylüler (profil başına), pixel ikon seti, logo | Takımın eseri | Atölye/pano/sandık/bekçi bizim kimliğimiz; CC0'dan alınmaz |
| Google Fonts (OFL) | Pixelify Sans, VT323 + gövde fontu | OFL | §1 |

**Kaçınılacaklar:** itch.io'da "CC0" etiketli ama AI üretimi paketler (ör. Seedream ile üretilmiş köy paketleri; yorumlarda AI şüphesi olan FreePixelFarm). Her paket için "elle mi çizilmiş" sorusu `LICENSES.md`'ye yazılır.

### 6.2 Kodla çizilen sprite hattı

1. **Palet:** `assets/palette.ts`: seçilen CC0 paketten çıkarılmış 32–48 renk, adlandırılmış (`wood-1`, `grass-2`, `ink`, `gold` …). Paket dışı renk yasak.
2. **Sprite kaynağı:** `assets/sprites/<ad>.ts` → `{ w, h, palette: 'town', frames: string[][] }`. Her satır bir string, her karakter bir palet indeksi ('.' = şeffaf). Claude bu dosyaları yazar ve düzenler; insan gözden geçirir.
3. **Derleme:** `tools/sprites.mjs` → (a) React için `crispEdges` SVG bileşenleri (`<Sprite name="chest" zoom={3} />`), (b) Phaser için PNG kareleri ve atlas (`public/game/atlas.png|json`). Tam sayı ölçek; `image-rendering: pixelated`.
4. **İnceleme:** `/_kit` sayfasında tüm sprite'lar 1×/3× ve gece paletinde yan yana. Karakterler için 4 yön × 4 kare (olmazsa 2 yön + yansıtma).
5. **Çalışma biçimi:** önce 2–3 varyant, `/design-shotgun` ile karşılaştırılır, biri seçilir. Seçim gerekçesi DESIGN.md'ye.

### 6.3 Anti-slop kuralları (bağlayıcı)

İnternetteki "AI slop" listelerinin ortak maddeleri + projeye özel kurallar. Her fazın Checkpoint'inde `/design-review` (gstack) ve `~/.claude/skills/gstack/review/design-checklist.md` "AI Slop Detection" kategorisi uygulanır.

**Yasak**
- Mor/indigo/violet gradyanlar, maviden mora geçişler (ör. `#667eea → #764ba2`, `#6366f1–#8b5cf6` aralığı); genel olarak dekoratif gradyan.
- Başlıkta veya rakamda gradyanlı metin.
- Varsayılan fontlar: Inter, Roboto, Arial, sistem fontu, Space Grotesk (gövde dahil; jüri sitesinden ayrışmak için Silkscreen de yok).
- "İkonlu üç kutu" ızgarası, "Welcome to AgentCoop" tipi hero, jenerik pazarlama metni ("Unlock the power of…", "Seamless", "Revolutionize").
- Gerekçesiz glassmorphism, blur panel, glow, yumuşak/bulanık gölge, büyük `border-radius`.
- Emoji'nin ikon olarak kullanımı; birden fazla ikon seti karışımı.
- Düz shadcn/21st.dev varsayılan görünümü (gri-beyaz kart, ince border, yumuşak gölge).
- Lorem ipsum, uydurma rakamlar; demo değerleri her zaman "demo" etiketli.

**Zorunlu**
- Tek palet (§6.2), rolleri tanımlı CSS değişkenleri (`--surface-parchment`, `--surface-night`, `--ink`, `--wood`, `--gold`, `--grass`, `--danger`, `--ok`); hex değer bileşende yazılmaz.
- Tam sayı ölçek (2×, 3×, 4×), `image-rendering: pixelated`, kenar yumuşatma kapalı.
- Köşeler kare veya pixel-adım; gölgeler 1–2 px sert ofset.
- Metinler ürüne özgü ve somut: "Festival in 3 days · 600/1000 credits", "Guard refused: maxPerPoolSats exceeded (6,000 > 5,000)".
- Her etkileşimli öğede hover, `:focus-visible`, disabled ve yükleniyor durumları.
- Boş / yükleniyor / hata / servis kapalı durumları her ekranda tasarlanmış (jenerik spinner değil: kum saati, köylü bekliyor vb.).
- Hareket anlamlı (bir olayı anlatır); `prefers-reduced-motion`'a uyar.
- **DESIGN.md** (`apps/web/DESIGN.md`): P0'da `/design-consultation` ile yazılır (palet, tipografi, boşluk ölçeği, bileşen kuralları, ton). Sonraki her ekran buradan beslenir; değişiklik önce DESIGN.md'ye.

### 6.4 bsvmunich.com (referans, kopya değil)

BSVA'nın "BSV × TUM Blockchain workshop" sitesi, büyük ihtimalle jürinin işi. İncelendi (30.10): lisans, kaynak linki ya da asset kredisi **yok** (varsayılan: tüm hakları saklı). Sprite'lar kodda renk matrisi olarak duruyor, SVG `crispEdges` ve canvas `fillRect` ile çiziliyor; fontlar Silkscreen (pixel), Inter (gövde), JetBrains Mono.

- **Alınan (fikir düzeyinde):** kodla çizilen sprite yöntemi (§6.2), "Under the hood" adım paneli (§4.1), protokol etiketleri + ms + ücret çubuğu, hafif oyunlaştırma (seviye, kupa) fikri.
- **Alınmayan:** sprite'lar, salon sahnesi, renk paleti birebir, düzen, metinler, kod.
- **Farklılaşma:** onlar içeride bira salonu ve insanlar arası ödeme; biz dışarıda köy meydanı, ajanlar ve toplu satın alma.
- **İzin:** D, Axel'e soruyor (MASTER §6.4 soru 7). İzin + lisans gelirse atıfla yeniden kullanım değerlendirilir ve buraya yazılır; gelene kadar yalnızca referans.

---

## 7. Kalite, güvenlik, dayanıklılık

- **Testler:** `vitest` → reducer'lar (olay → state), `derive.ts` (overlay SSE farkı), replay oynatıcı (hız/atla), `flows` (sahte cüzdanla; Desktop çağrı sırası ve parametreleri), i18n eksik anahtar; RTL → paneller (boş/hata/yükleniyor), imza kartı geri sayımı; **Playwright (mock modda)** → "jüri turu" (cüzdansız), "katılımcı" (pledge → sign → settlement → redeem → job), "sahip" (vault → policy → injection 403 → withdraw), "sağlayıcı" (mint → open-pool → settle → revenue), replay; Kasaba için sahne ekran görüntüsü karşılaştırması (eşik toleranslı).
- **Hata/dayanıklılık:** her servis için bağımsız sağlık rozeti (`/healthz`); biri kapalıyken diğer ekranlar çalışır; WS/SSE yeniden bağlanma (backoff); REST yeniden deneme; Desktop koptuğunda "Reconnect" ve bekleyen işlem iptali; Desktop onayı reddedilince net mesaj ("Nothing was sent").
- **Güvenlik:** anahtar istenmez; `WalletClient` yalnızca sayfa origin'iyle; AuthFetch dışında kimlik gönderilmez; guard/koordinatör cevapları **doğrulanmadan imzalanmaz** (plan doğrulaması ekranda); dış linkler yalnızca WhatsOnChain/BaseScan; CSP (script-src self + cdnjs yok, hepsi paket içi); env'de gizli yok (`VITE_*` yalnız URL'ler).
- **Performans:** ilk yük < 2 MB (Phaser ayrı chunk, Kasaba lazy), atlaslar sıkıştırılmış PNG, kod bölme (konsollar lazy), 60 fps Kasaba.
- **Dürüstlük etiketleri:** "demo pricing" (indirim), "simulated GPU jobs" (işler), "experimental" (Rail) etiketleri ilgili ekranlarda **her zaman** görünür (FINAL-IDEA §9 notu).

---

## 8. Fazlar

Zaman kutuları, yoğun paralel AI kullanımı varsayımıyla. Her faz: önce `plan/phases/E-P<n>.md`, sonra kod. Her fazın sonunda Checkpoint.

### Faz 0 — İskelet, tasarım sistemi, veri katmanı, mock, Desktop bağlantısı (zaman kutusu 3 saat) → S1

**Amaç:** Diğer track'lere bağımlı olmadan tam akışın mock'ta çalıştığı, Desktop'a gerçekten bağlanan, pixel kimliği oturmuş bir iskelet.

**Bağımlılık:** Kök workspace (A.P0, **var**). Diğer servisler gerekmez (mock).

**Görevler**
- 0.1 `apps/web` workspace paketi: Vite + React + TS + Tailwind 4 + Router + Zustand + TanStack Query + MSW + Vitest/RTL + Playwright; kök `package.json`'a `"web": "npm -w apps/web run dev"`, `"web:mock"`, `"web:build"` (yalnız ekleme). `vite.config.ts`: dev proxy'ler (`/api/*`), `resolve.alias` (§1 SDK kuralı), `define`.
- 0.2 **Tasarım sistemi:** önce `/design-consultation` ile `apps/web/DESIGN.md` (§6.3; palet CC0 paketten, gövde fontu seçimi, ton). Sonra 8bitcn/ui kurulumu (shadcn CLI) ve token'larla yeniden stillenmesi; palet token'ları, fontlar, `ui/` bileşenleri (Tabela, PixelButton, Scroll modal, Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState), dark/"gece" tema, Storybook yerine `/_kit` gizli sayfası (tüm bileşenler bir arada; tasarım incelemesi için).
- 0.3 **Store + olay zarfı + reducer'lar:** `events/types.ts` (MASTER §3.10), `bus.ts`, dilimler, seçiciler; birim testler.
- 0.4 **Adaptörler (iskelet):** `coordinatorWs` (hello, yeniden bağlanma), `overlaySse` + `derive.ts`, `agentsSse`, `guardSse`, `replay`, `mock`. Canlı olanlar gerçek URL'lere bağlanmayı dener, yoksa sağlık rozeti kırmızı.
- 0.5 **Mock:** MSW handler'ları (MASTER §3.5/3.6/3.7/3.8 şekilleriyle), `mock/scenario.ts` (3 ajan, 1 sağlayıcı: havuz açılır → pledge'ler → lock-in → settlement → redeem → iş → injection 403 → dolmayan havuz; döngüsel, hızlandırılabilir), `mock/wallet.ts` (sahte Desktop; onay diyaloğu; sahte txid'ler `mock_` önekli, link yok).
- 0.6 **Cüzdan:** `wallet/client.ts` (`WalletClient('auto')`, `waitForAuthentication`, `getNetwork`, `getPublicKey`, durum makinesi), cüzdan çipi, "Connect" akışı, ağ uyuşmazlığı uyarısı. **Smoke:** tarayıcıda `@agentcoop/core`'dan `buildOpReturn`, `vaultLockingScript`, `TokenKit` import edilip çağrılıyor (SDK tek kopya, node importu yok). Sonuç STATUS'a (A'ya).
- 0.7 **Kabuk:** üst çubuk, rotalar (boş sayfalar), bildirim merkezi iskeleti, mod rozeti, i18n `t()`.
- 0.8 **Varlık hattı:** `assets/palette.ts`, `assets/sprites/*.ts` biçimi, `tools/sprites.mjs` (matris → SVG + PNG/atlas), `tools/px.mjs` (CC0 palet hizalama), `assets/LICENSES.md`; Kenney Tiny Town + 1 kodla çizilmiş nesne (ilan panosu) uçtan uca (React'te `<Sprite>`, Phaser'da atlas), Tiled haritasının ilk taslağı (meydan, atölye, 3 ev, pazar, kapı, liman yeri).
- 0.9 CI: `npm -w apps/web run lint|test|build` kök `npm test`'e dahil (vitest include'a `apps/web/test`).

**Kabul:** `apps/web/DESIGN.md` var ve `/design-review` P0 ekranlarında AI-slop bulgusu vermiyor; `npm run web:mock` açılıyor; mock senaryo akarken store doluyor (geliştirici paneli `/_debug` olayları ve state'i gösteriyor); gerçek Desktop'a bağlanıp identity ve ağ görünüyor; `/_kit` sayfası tasarım sistemini gösteriyor; birim testler yeşil; build < 2 MB.

**Çıktılar:** `apps/web/*` iskeleti, `plan/phases/E-P0.md`, STATUS Track E, A/B/C/D'ye istekler (STATUS "Arayüz değişiklikleri").

#### ✋ Checkpoint (Faz 0 sonu)
1. **Plan hâlâ iyi mi?** SDK alias'ı çalışmadıysa A'ya `exports` "browser" isteği; Desktop'tan tarayıcıya bağlantıda originator/izin sorunu çıktıysa çözüm STATUS'a (C'nin CLI'ları ve D'nin owner-cli'ı için de geçerli).
2. **Bu faz bitti** → `/design-review` (anti-slop, §6.3) temiz → STATUS Track E.
3. **Diğer track'ler ne yaptı?** B'nin WS/SSE'si çalışıyor mu (`npm run infra`); C'nin provider-api'si CORS verdi mi; D guard'ı açtı mı?
4. **Sonraki fazın bağımlılıkları:** B.P1–P3 (`/pools`, WS, SSE) canlı için; yoksa mock'ta devam.
5. Arayüz değişikliği varsa MASTER §3.10 + STATUS.

---

### Faz 1 — Havuz gezgini, canlı akış, Kasaba v1, replay v1 (zaman kutusu 4 saat) → S2

**Amaç:** Cüzdansız bir jüri üyesi siteyi açıp canlı havuzları ve Kasaba'da ajanların pledge vermesini, settlement'ı ve dolmayan havuzu görsün; gerçek txid'lere tıklayabilsin.

**Bağımlılık:** B.P1–P3 (canlı), yoksa mock. C'nin ajan olay akışı (yoksa `log-relay.mjs` veya mock balonlar).

**Görevler**
- 1.1 **Pools** sayfası: liste (durum filtresi, sıralama: deadline, dolum, indirim), kart (ilerleme, festival sayacı, fiyat/kredi vs perakende, "demo pricing" etiketi), detay (terms, pledge tablosu, `coordinator` tur/kara liste, offer var mı, settlement txid).
- 1.2 **Explorer**: `txs` dilimi (olaylardan türetilen T1–T11 kayıtları), filtre, WoC linkleri; **Metrics** sayfası (türetilmiş sayaçlar; B Faz 6 `/metrics` gelince ek).
- 1.3 **Canlı akış**: koordinatör WS (izleyici modu) + overlay SSE + `derive.ts` farkı → olaylar; "Live feed" paneli (son 50 olay, insan dilinde).
- 1.4 **Kasaba v1**: Tiled haritası, atölye, pano+çuval, 3 köylü (boşta dolaşma), pledge animasyonu, lock-in kum saati, **settlement sahnesi** (çan, araba, sandıklar, altın), başarısız havuz, köşe sayaçları, tıklama → drawer (pool detayı, ajan kartı, parşömen), kamera kaydırma/zoom, gün/gece.
- 1.5 **Ajan balonları**: `agent_thought/decision` → balon; ajan kartında karar logu. Kaynak yoksa mock.
- 1.6 **Replay v1**: `public/replays/mock-demo.jsonl` (mock senaryodan kaydedilmiş) + oynatıcı (hız, duraklat, "settlement'a atla"); `?replay=` ile açılır; mod rozeti `REPLAY`.
- 1.7 e2e: "jüri turu" (Playwright, mock).

**Kabul:** canlı modda B'nin servisleriyle (varsa) havuzlar ve olaylar görünüyor; Kasaba'da bir settlement sahnesi baştan sona oynuyor ve parşömendeki txid gerçek (canlı) ya da `mock_`; replay çalışıyor; e2e yeşil.

**Çıktılar:** `consoles/pools`, `consoles/explorer`, `consoles/metrics`, `town/*` v1, `replay/*`, `plan/phases/E-P1.md`.

#### ✋ Checkpoint (Faz 1 sonu)
1. **Plan hâlâ iyi mi?** Overlay SSE'den fark türetmek yavaş/karmaşıksa B'den zengin olaylar iste (`pledge_added` vb.) ve STATUS'a yaz; Kasaba performansı düşükse kalabalık modunu öne al.
2. **Bu faz bitti** → `/design-review` (anti-slop, §6.3) temiz → STATUS Track E.
3. **Diğer track'ler ne yaptı?** Mainnet settlement (S1) oldu mu? Olduysa gerçek olayları kaydet (`tools/record.mjs`) ve ilk gerçek replay'i üret.
4. **Sonraki fazın bağımlılıkları:** A core (var), Desktop (insan), C provider-api CORS.
5. Arayüz değişikliği varsa MASTER §3.10 + STATUS.

---

### Faz 2 — Katılımcı ve sağlayıcı akışları (Desktop ile gerçek işlemler) (zaman kutusu 4 saat) → S2/S3

**Amaç:** Bir insan tarayıcıdan BSV Desktop ile havuza katılsın, imza turunu tek tıkla tamamlasın, kredisini alıp iş çalıştırsın; sağlayıcı kredi basıp havuz açsın. B2 şartı ("user-facing flows via BSV wallets") burada kapanır.

**Bağımlılık:** A.P1/P2 (core builder'ları, **var**), B.P2 (koordinatör turu, **var**), C.P1 (provider-api + CORS isteği), insan + Desktop + sats (D).

**Görevler**
- 2.1 `wallet/flows/`: `pledge`, `cancelPledge`, `reviewAndSign` (imza merkezi), `afterSettlement` (`internalizeSettlement` + `TokenKit.sync`), `redeem`, `runJob`, `returnCredits`, `mint`, `openPool`, `cancelPool`, `syncRevenue`, `sweepRevenue`. Her biri: parşömen özeti → Desktop → sonuç; hata eşleme.
- 2.2 **Participant** ekranları: havuz kartında "Join" → kredi seçici (min/max, maliyet, tampon, ücret payı) → onay; "My pledges" (aktif/iptal/settled); **imza merkezi** (§4.3); "My credits" (TokenKit bakiyesi, overlay doğrulamalı); "Use credits" (redeem miktarı ≤ maxRedeem) → "Run a job" (kind, minutes; fiyat önizlemesi: ön ödemeli dakika yeterse 0, yoksa 402 sat) → iş kartı (log akışı, sonuç) → "Return unused".
- 2.3 **Provider console**: "Mint credits" (sym, amt, dec) → tokenId gösterilir ve kopyalanır ("C'nin `products/*.json`'una yazın" notu; otomatik yazım sunucuda olduğu için manuel), "Open pool" formu (credits, price, deadline +blok, fee, min, label; önizleme: kredi başına fiyat, perakendeye göre indirim) → 2 onay → `POST /offers`; "My pools"; "Cancel"; "Revenue" (sync + sweep); "Usage".
- 2.4 Kasaba bağlantıları: insan pledge'inde ziyaretçi figürü panoya gider; sağlayıcı havuz açınca pano dikilir; mint'te atölyeye tabela asılır.
- 2.5 e2e (mock cüzdanla): katılımcı ve sağlayıcı turları. **Mainnet kabulü:** Desktop'lı bir üye ile bir pledge (T3) + imza turu (T5'e katılım) + redeem (T6) + 402 iş (T7); sağlayıcı mint (T1) + open-pool (T2). txid'ler STATUS'a (C/A ile ortak koşu; aynı sats).

**Kabul:** mock'ta iki tur e2e yeşil; mainnet'te en az T3 + T5 katılımı tarayıcıdan yapıldı (txid STATUS'ta); imza merkezi 60 sn içinde imzalatıyor.

**Çıktılar:** `wallet/flows/*`, `consoles/participant`, `consoles/provider`, `plan/phases/E-P2.md`.

#### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** Desktop onay sayısı beklenenden fazlaysa (A test 3) akışları birleştir; AuthFetch tarayıcıda 402'yi ödeyemediyse (CORS başlıkları) C ile çöz, STATUS'a yaz.
2. **Bu faz bitti** → `/design-review` temiz → STATUS Track E (txid'ler "Mainnet işlemleri").
3. **Diğer track'ler ne yaptı?** D.P1 guard API'si hazır mı; A.P2 market builder'ları (var); C.P2 ajan kararları akıyor mu?
4. **Sonraki fazın bağımlılıkları:** D.P1/P2 (guard, owner akışları), B.P3 (listings, vaults; **var**).
5. Arayüz değişikliği varsa MASTER §3.10 + STATUS.

---

### Faz 3 — Sahip konsolu (vault + guard), ajanlar, market, Kasaba v2 (zaman kutusu 4 saat) → S3

**Amaç:** Sahip tarayıcıdan ajanına bütçe versin, politikayı yazsın, injection'ın reddedildiğini bekçide görsün, parayı geri çeksin; market tezgâhları çalışsın.

**Bağımlılık:** D.P1/P2 (vault script, guard API + SSE, owner akışları), A.P2 (market builder'ları, var), B.P3 (listings/vaults sorguları, var), C.P2/P3 (ajan olayları, vault'lu ajan).

**Görevler**
- 3.1 **Owner console**: "Create vault" (ajan seç: `config/identities.json` + C profilleri; guard identity; vaultId) → fonla (sats) → 1 onay; "Policy" formu (allowProviders çoklu seçim, maxPerPool, weekly, maxFee, hotDaily; D Faz 5B şablonları gelirse şablon seçici); "Activity": kararlar, harcamalar, kalan tavan, **Denials** (403 nedenleri, zaman, ne istendi); "Withdraw" (tam/kısmi) → 1 onay; "Pause" (D Faz 5B).
- 3.2 **Agents** sayfası: her ajan kartı (profil, identity, kese, kredi, vault varsa bakiye/politika, son kararlar, işler); canlı karar akışı; `demo-injection` tetiklenince (C'nin scripti) olay akışında görünür.
- 3.3 **Market**: listeler (birim fiyat, satıcı, kredi), "Sell" (miktar, fiyat → reserve + sign → POST), "Buy" (birden çok liste seç → toplam → sweep → 1 onay; soy doğrulaması ekranda), "Cancel".
- 3.4 **Kasaba v2**: evlerin önünde vault sandıkları (bakiye), köy kapısında bekçi (onay/red animasyonu), şüpheli yabancı + injection sahnesi, pazar tezgâhları (liste/sweep animasyonu), atölye dumanı ve iş ilerlemesi, redeem yürüyüşü, parşömenler her nesnede.
- 3.5 e2e: sahip turu (vault → policy → injection 403 → withdraw), market turu. **Mainnet kabulü** (D ile): vault fonlama (T9), guard onaylı harcama (T10) ve bir 403 tarayıcıdan izlendi; mümkünse sweep (T8).

**Kabul:** mock e2e yeşil; canlı modda guard 403'ü bekçide ve Denials'ta görünüyor; mainnet'te T9 tarayıcıdan.

**Çıktılar:** `consoles/owner`, `consoles/agents`, `consoles/market`, `town/*` v2, `plan/phases/E-P3.md`.

#### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Guard SSE yoksa poll; D'nin politika alanları değiştiyse form şeması güncellenir.
2. **Bu faz bitti** → `/design-review` (anti-slop, §6.3) temiz → STATUS Track E.
3. **Diğer track'ler ne yaptı?** D.P3 Rail sonucu (`docs/RAIL-POC.md`); B Faz 5 URL'leri; S3 tamam mı?
4. **Sonraki fazın bağımlılıkları:** D.P3 (liman sahnesi; yoksa liman "coming soon" tabelası), B.P5 (yayın URL'leri; yoksa Pages varsayılan alanı).
5. Arayüz değişikliği varsa MASTER §3.10 + STATUS.

---

### Faz 4 — Rail sahnesi, ses, gerçek replay, cila, herkese açık yayın (zaman kutusu 3 saat) → S4 öncesi

**Amaç:** Ürün jüriye gösterilecek halde: hızlı, hatasız, herkese açık, gerçek mainnet replay'li.

**Bağımlılık:** D.P3 (Rail; opsiyonel), B.P5 (URL'ler; opsiyonel), gerçek mainnet koşuları (S2/S3).

**Görevler**
- 4.1 **Liman/köprü** (D.P3 başarılıysa): maker `GET /quote`, MetaMask bağlantısı (viem/wagmi minimal), Base HTLC `lock`, BSV tarafı claim izleme, iki linkli parşömen; "experimental" etiketi. Başarısızsa liman "closed for season" tabelası + README notu.
- 4.2 **Ses**: Howler, §5.3 haritası, ayarlar (açık/kapalı, ses düzeyi), autoplay kilidi.
- 4.3 **Gerçek replay**: `tools/record.mjs` ile gerçek mainnet akışı (S2/S3 koşuları) `public/replays/mainnet-<tarih>.jsonl`; oynatıcıda "This really happened on BSV mainnet" rozeti; txid'ler gerçek.
- 4.4 **Cila**: onboarding (ilk ziyaret: 3 adımlı kısa tur), boş/hata durumları, klavye kısayolları (`Tab` ledger, `R` replay, `M` ses), yükleme ekranı, favicon, 404, dar ekran uyarısı, `prefers-reduced-motion`.
- 4.5 **Yayın**: Cloudflare Pages (build `npm -w apps/web run build`, env `VITE_*` = B'nin herkese açık URL'leri), özel alan `app.<alan>` (B'den DNS), CSP, önbellek başlıkları; URL STATUS'a. Yerel: `npm run web` README'de.
- 4.6 **Kalite kapısı**: Lighthouse performans ≥ 85 masaüstü; e2e tüm turlar yeşil; `npm run typecheck` temiz; bundle analizi.

**Kabul:** herkese açık URL'de canlı/replay çalışıyor; gerçek replay var; e2e yeşil; Rail sahnesi ya çalışıyor ya dürüst tabela.

**Çıktılar:** `town/entities/Harbor`, `audio/*`, `public/replays/mainnet-*.jsonl`, yayın konfigürasyonu, `plan/phases/E-P4.md`.

#### ✋ Checkpoint (Faz 4 sonu)
1. **Plan hâlâ iyi mi?** Teslime kalan süre ≥ 6 saat ve S4 henüz ilan edilmediyse P6'ya geç; değilse P5.
2. **Bu faz bitti** → `/design-review` temiz → STATUS Track E (URL, replay dosyaları).
3. **Diğer track'ler ne yaptı?** D README için E bölümünü istiyor mu; video için ekran kayıtları gerekli mi?
4. **Sonraki faz:** P6 (opsiyonel) veya P5.
5. Arayüz değişikliği varsa MASTER §3.10 + STATUS.

---

### Faz 6 — (opsiyonel, zaman kalırsa) Avatar modu (zaman kutusu 2 saat)

**Amaç:** Kullanıcı kasabada kendi karakteriyle yürüsün; binaya yaklaşıp `E` ile aynı panelleri açsın. Tıklama modu kalır (ayarlardan geçiş).

**Bağımlılık:** Faz 4 ✓; S4 ilan edilmemiş; teslime ≥ 6 saat.

**Görevler:** Arcade Physics, WASD/ok tuşları, çarpışma katmanı (Tiled), etkileşim noktaları (`E`), kamera takibi, avatar kıyafeti (identity'den deterministik renk), "panoya yürü + E = Join" (aynı `flows/pledge`), mobil yok. e2e: avatar panoya ulaşıp drawer açıyor.

**Kabul:** avatar modu açılıp kapanıyor; aynı akışlar iki modda da çalışıyor; performans düşmedi.

#### ✋ Checkpoint: zaman kaldıysa P7, yoksa P5.

---

### Faz 7 — (opsiyonel, zaman kalırsa) Çok oyunculu kasaba (zaman kutusu 3 saat)

**Amaç:** Aynı anda bağlı ziyaretçiler (insan katılımcılar, sahipler, jüri) birbirini kasabada görsün.

**Bağımlılık:** Faz 6 ✓ (avatar); küçük bir **presence** sunucusu (`apps/presence`, WS; kimlik = Desktop identity veya anonim; konum yayını 10 Hz; sohbet yok). B'nin VPS'inde barındırma (Faz 5) veya Cloudflare Durable Object.

**Görevler:** presence protokolü (MASTER §3'e ek), istemci interpolasyonu, isim etiketleri, kalabalık sınırı (50), kötüye kullanım sınırı (hız/oran). e2e: iki tarayıcı birbirini görüyor.

**Kabul:** iki farklı makineden iki ziyaretçi aynı kasabada; gecikme < 300 ms LAN.

#### ✋ Checkpoint: STATUS; sonra P5.

---

### Faz 5 — Teslim (her zaman son; zaman kutusu 1,5 saat) → S4

**Amaç:** Frontend teslim paketinin parçası: README bölümü, sunum modu, video malzemesi, bilinen sınırlar.

**Görevler**
- 5.1 **Presenter mode** (`?presenter=1`): büyük yazı, köşe sayaçları öne, bildirimler sessiz, demo senaryosu (FINAL-IDEA §11) için "sahne atlama" kısayolları (replay'de).
- 5.2 README bölümü (D'ye teslim): "Open the town" (herkese açık URL), yerel çalıştırma, modlar, Desktop bağlantısı, ekran görüntüleri (6–8 adet, pixel-art), klavye kısayolları, bilinen sınırlar (masaüstü, tek oyuncu…), varlık lisansları özeti.
- 5.3 Video malzemesi: Kasaba'da settlement, injection reddi, imza merkezi, sağlayıcı havuz açma ekran kayıtları (`docs/video/` listesi).
- 5.4 Son kontrol: e2e yeşil, typecheck, build, yayın güncel, replay dosyaları gerçek txid'lerle, dürüstlük etiketleri yerinde, BSVA logo kuralları.
- 5.5 STATUS Track E "Tamamlandı"; S4 kontrol listesinde E maddeleri.

**Kabul:** D'nin README'sinde E bölümü; herkese açık URL çalışıyor; video malzemesi listelenmiş.

#### ✋ Checkpoint (Faz 5 sonu)
1. Son plan değişikliği? STATUS.
2. STATUS Track E: "Tamamlandı".
3. Açık blokaj README "Known limitations"a.
4. Teslim paketi: URL, ekran görüntüleri, replay dosyaları, lisans dosyası.

---

## 9. Riskler ve B planları

| Risk | B planı |
|---|---|
| `@agentcoop/core` tarayıcıda derlenmiyor (SDK CJS yolu, node importu) | Vite alias/regex; olmazsa A'dan `exports` `"browser"`; en kötü: core'un tarayıcı-güvenli alt kümesi `packages/core/src/browser.ts` (A ile) |
| Desktop'tan tarayıcıya bağlantı (origin/izin) sorun çıkarıyor | Kit'in `web/` örneği referans; `https` origin gerekiyorsa yerelde `vite --https`; STATUS'a yaz (C/D CLI'ları da etkilenir) |
| CORS (provider-api, overlay) gecikiyor | Yerelde Vite proxy; yayında Cloudflare Pages Functions ile küçük proxy (geçici) |
| Ajan olay akışı yok | `tools/log-relay.mjs` (activity.log → SSE); mock balonlar |
| Overlay SSE'den fark türetmek pahalı | Sorguları `txid` bazında daralt (`outpoint`/`history`); B'den zengin olaylar iste |
| Kasaba performansı | Kalabalık modu, balon sınırı, düşük ayrıntı; Kasaba lazy chunk |
| Görsel üretim zaman yiyor | Önce Kenney CC0 ile tam sahne; kodla çizilen sprite'lar yalnızca ayırt edici 6–8 nesne için |
| Jüri "bsvmunich'e benziyor" der | §6.4 farklılaşma: dış mekân, ajanlar, toplu satın alma; kopya varlık yok; izin gelirse atıflı |
| Mainnet koşuları gecikiyor | Mock e2e + replay (mock-demo) teslim edilebilir; gerçek replay gelince dosya değişir |
| Zaman | P6/P7 düşer; P4.4 cila kısalır; **P5 asla düşmez** |

---

## 10. Demo senaryosuna eşleme (FINAL-IDEA §11)

| Sahne | Ekran |
|---|---|
| 0:20 Sağlayıcı havuz açıyor; sahip vault fonluyor | Provider console (Desktop onayı görünür) → Kasaba'da pano dikilir; Owner console → sandık |
| 0:45 Ajanlar pledge veriyor; Base'den gelen ajan; injection reddi | Kasaba: balonlar, çuval dolar, liman (varsa), şüpheli yabancı + bekçi "!" |
| 1:30 Lock-in ve tek settlement | Kasaba: kum saati → çan, araba, sandıklar; parşömen: "1 tx · N participants · 0 sat in custody" + WoC |
| 1:55 Krediler harcanıyor, market | Atölye dumanı, iş parşömeni; pazar tezgâhı sweep |
| 2:25 Dolmayan havuz; sahip çekiyor | Pano solar, keseler yerinde; Owner console withdraw |
| 2:45 Rakamlar | Metrics sayfası / köşe sayaçları (presenter mode) |
