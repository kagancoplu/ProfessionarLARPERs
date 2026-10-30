# E-P4 — Liman/Rail sahnesi, ses, replay kaydı, cila, yayın

> Track E Faz 4 (`plan/track-E-frontend.md` §8 Faz 4). Yazan: E, 2026-10-31 00:50 CET. Zaman kutusu 3 saat. Dal `main`. Önceki: `E-P3.md` (✅ `3c0f8c6`).

## 0. Amaç
Ürün jüriye gösterilecek halde: liman sahnesi D'nin Rail PoC'sine dürüstçe bağlı ("experimental"), ses var, gerçek koşular kaydedilebiliyor, ilk ziyaret anlaşılır, klavye kısayolları, Cloudflare Pages için hazır build.

## 1. Bağımlılıklar (00:50)
| | Durum | P4'te |
|---|---|---|
| D.P3 Rail | **kısmen başarılı (offline)**: maker HTTP `GET /quote?dir=usdc-bsv&amount=` (USDC base units → sats, spread 150 bps), `GET /events` SSE (`rail_quote/locked_base/funded_bsv/claimed/refunded`), `/healthz`; swap API yok (Faz 5 A) | liman ofisi + sandal sahnesi, teklif kartı, `experimental` etiketi; MetaMask/HTLC **yok** (API yok) |
| B.P5 yayın URL'leri | yok | Pages varsayılan alan; `VITE_*` build-time |
| Gerçek mainnet koşuları | yok (insan + sats) | kaydedici hazır; `mainnet-*.jsonl` insan koştuğunda |
| Ses varlıkları | Kenney CC0 indirilmedi (curl engelli) | **Web Audio ile sentez** (chiptune; varlık yok, lisans yok) |

## 2. Tasarım
- **Maker servisi**: `env.urls.maker` (`VITE_MAKER_URL`, proxy `/api/maker` → :8094), `api/maker.ts` (`quote`, `healthz`, `eventsUrl`), boot'ta zarf SSE (`src:'maker'`), sağlık yoklamasında **opsiyonel** (özet rozeti etkilemez). Mock: `/quote` handler + senaryoda bir Rail beat'i (teklif → Base kilidi → BSV HTLC fonlandı → ajan+guard claim; T11).
- **Liman**: liman ofisi (balıkçı evi) tıklanınca `rail` drawer'ı: "Coop Rail · experimental", maker sağlığı, USDC → sats teklif formu (`/quote`), kural özeti (BSV vault'a iner, agent+guard claim, iade H+6), son Rail olayları (T11 linkleri). Kasaba: `rail_funded_bsv` → sandal gölette karşıya yüzer ("USDC → BSV · N sat"), `rail_claimed` → altın sandaldan vault sandığına uçar; `rail_refunded` → sandal geri döner.
- **Ses** (`audio/sfx.ts`): Web Audio osilatörleriyle 6 kısa efekt (coin, bell, shield, chime, scroll, cart); `settings.sound` açıkken bus olaylarına bağlı (`pledge_added` coin, `pool_settled/settled` bell, `cosign_denied` shield, `sign_request` chime, `job_done` scroll, `listing_filled` coin); AudioContext ilk tıklamada açılır (autoplay kilidi), ses düzeyi 0.25; `M` kısayolu.
- **Replay kaydı** (`replay/recorder.ts`): `/_debug` "Record" → bus olaylarını toplar → `mainnet-<tarih>.jsonl` indirir (ilk satır yorum: mod, URL'ler, tarih). İnsan dosyayı `public/replays/`'e koyar; `?replay=mainnet-<tarih>` ve "This really happened on BSV mainnet" rozeti (adı `mainnet` ile başlayınca).
- **Cila**: ilk ziyarette Kasaba sayfasının üstünde 3 adımlı **tur afişi** (modal değil: e2e ve jüri akışını kesmez; `localStorage agentcoop.tour`), klavye kısayolları (`T` kasaba, `P` havuzlar, `E` explorer, `M` ses, `N` gece/gün, `?` yardım; giriş alanlarında kapalı), yükleme/boş/hata durumları zaten var, 404 var.
- **Yayın**: `public/_headers` (CSP: self + servis URL'leri + Arcade + WoC; `X-Frame-Options`; önbellek: `/game/*`, `/ui/*`, `/assets/*` 1 yıl), `public/_redirects` (SPA), README "Deploy" bölümü (Pages: build `npm run web:build`, çıktı `apps/web/dist`, env `VITE_*`). Hesap ve DNS insan işi.
- **Kalite kapısı**: typecheck, vitest, Playwright 6/6, `vite build` boyutları STATUS'a.

## 3. Testler
Birim: `rail` senaryo (T11 kayıtları), `recorder` (jsonl üretimi ve `parseJsonl` ile geri okuma), `sfx` (olay → efekt eşlemesi, saf). e2e: mevcut 6 yeşil; smoke'a liman drawer'ı.

## 4. Riskler
| Risk | Plan |
|---|---|
| Maker canlıda yok | sağlıkta opsiyonel; liman kartı "closed for season" metni, teklif formu devre dışı |
| Autoplay kilidi | ilk pointer/keydown'da `resume()`; o ana kadar sessiz |
| CSP servis URL'leri yayında farklı | `_headers` şablonu; D/B URL'leri gelince güncellenir |

## 5. Checkpoint (Faz 4 sonu, 31.10 01:50)

**Kabul kanıtı (mock)**
- **Liman / Coop Rail:** `api/maker.ts`, `env.urls.maker` (+ proxy `/api/maker`, `VITE_MAKER_URL`), boot'ta maker SSE ve sağlık (opsiyonel: rozeti düşürmez). `RailCard` (`/metrics` "Harbor · Coop Rail" ve Kasaba'da liman ofisi drawer'ı): experimental etiketi, maker durumu, USDC → sats teklifi (mock `/quote` handler, canlıda D'nin `/quote`'u), kurallar, son Rail olayları (T11). Kasaba: `rail_funded_bsv` → sandal gölette karşıya ("USDC → BSV · N sat"), `rail_claimed` → altın vault sandığına. Senaryoda her döngüde bir Rail beat'i (teklif → Base kilidi → BSV fon → claim → vault +985 sat). MetaMask/HTLC yok (D'de swap API yok; Faz 5 A).
- **Ses:** `audio/sfx.ts` Web Audio sentez (coin, bell, shield, chime, scroll, cart), `audio/index.ts` bus → efekt, `settings.sound` (varsayılan kapalı), ilk jestte açılır; varlık ve lisans yok. Eski `audio/sounds.ts` iskeleti silindi.
- **Replay kaydı:** `replay/recorder.ts` + `/_debug` "record a replay" → `mainnet-<tarih>.jsonl` indirir (`parseJsonl` ile geri okunur; test). Gerçek mainnet kaydı insan koşusunu bekliyor.
- **Cila:** `TourBanner` (ilk ziyaret, 3 adım, modal değil, `localStorage agentcoop.tour`), klavye kısayolları (`T P A E K O`, `M` ses, `N` gece/gün, `?` tur; alanlarda kapalı), senaryo insan bağlıyken eval'in sweep'ini erteliyor (tezgâhı insan alabilsin), Playwright'ta Phaser `CANVAS` (headless WebGL framebuffer hatası).
- **Yayın:** `public/_redirects`, `public/_headers` (CSP + önbellek), README "Deploy" (Pages: `npm run web:build`, `apps/web/dist`, `VITE_*`). Build: index 631 kB (gzip 187), sdk 830 kB (239), phaser 1 194 kB (318, lazy), MSW 356 kB (yalnız mock), css 52 kB. Cloudflare hesabı/DNS insan işi.
- **Testler:** web vitest **19 dosya / 59 test** (+ sfx, recorder, Rail beat), Playwright **6/6** (smoke'a liman teklifi eklendi), typecheck temiz.

**Checkpoint soruları**
1. Plan hâlâ iyi mi? Evet; Lighthouse koşulmadı (not), gerçek replay insan koşusuna bağlı.
2. Faz bitti (mock) → STATUS Track E.
3. Diğer track'ler: D Rail "kısmen başarılı (offline)" → liman dürüst; B yayın URL'leri yok.
4. Sonraki: **P5 teslim** (README frontend bölümü, ekran görüntüleri, video için akış, STATUS son hali). Zaman kalırsa P6 avatar.
5. Arayüz: D'ye — maker `/healthz` ve `/quote` tarayıcıdan (mock'ta) sorunsuz; swap API gelince liman kartı MetaMask adımını alır.

