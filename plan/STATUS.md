# STATUS — AgentCoop

> Her track **yalnızca kendi bölümünü** günceller; her faz sonunda. Diğer bölümler okunur.
> Tarih/saat yaz (yerel). Dosya yollarını tam ver. Arayüz değişikliğini hem burada hem `00-MASTER-PLAN.md §3`'te yap.

## Senkron noktaları

| Senkron | Durum | Tarih | Not |
|---|---|---|---|
| S0 | ☐ | | |
| S1 walking skeleton | ☐ | | txid: |
| S2 K1 entegre | ☐ | | |
| S3 K2 entegre | ☐ | | |
| S4 freeze | ☐ | | |

## Blokajlar (herkes yazar, çözen siler)

| Tarih | Track | Blokaj | Kimden bekleniyor | Geçici çözüm |
|---|---|---|---|---|
| 30.10 16:55 | C | A.P0 yok: kök workspace, `packages/core` (`types.ts`, kit kopyaları, `sdk`) | A | Kullanıcı kararıyla C, MASTER §3.1'e birebir uyan **minimal kök workspace** ve `packages/core` **geçici stub**'ı kurdu (`trackC` branch). Her dosyada "A gelince A'nınki geçerli" notu var; A kendi sürümünü koyarken bunların üzerine yazar. Import yolları (`@agentcoop/core`, `@agentcoop/core/sdk`) değişmez |

## Arayüz değişiklikleri (herkes okur)

| Tarih | Track | Değişen | Neden | MASTER-PLAN güncellendi mi |
|---|---|---|---|---|
| 30.10 16:55 | C | **§3.1 ESM/CJS kuralı**: app'ler `tsx --import @agentcoop/core/register-sdk` ile başlar (senkron Node hook'u `@bsv/sdk` ESM importlarını CJS kopyaya yönlendirir); tsconfig `paths` yalnızca tipler için (`dist/cjs/mod.d.ts`) | "paths ile CJS build" çalışma zamanında çalışmıyor: Node CJS build'in named export'larını göremiyor (`does not provide an export named 'Transaction'`). Hook'la tek SDK kopyası doğrulandı (hook'suz `false`, hook'la `true`) | ✅ |
| 30.10 16:55 | C | **§3.6** ekler: `GET /healthz` (auth yok); `/v1/catalog` yanıtında `provider.server` (provider-api kimliği, redeem adresi); `POST /v1/jobs` gövdesinde opsiyonel `product`; ürün JSON'unda opsiyonel `simulate.gpus` | Ajan redeem için sunucu kimliğini katalogdan öğreniyor; ikinci ürün (Faz 3) için iş hangi ürüne ait belli olmalı | ✅ |
| 30.10 17:10 | C | **§3.6** Faz 1: katalogda `credits: { maxRedeem, maxPending, redeemTo }`; ürün JSON'unda opsiyonel `minutesPerCredit` (varsayılan 1); redeem'de **gönderen = çağıran** kuralı ve hata kodları | `redeemTo`: ajan krediyi nereye göndereceğini katalogdan öğreniyor. `minutesPerCredit`: kredi birimi kararı (bkz. Track C → Karar bekleyen) koda dokunmadan değişebilsin. Gönderen kuralı: overlay herkese açık, aksi halde transferi gören biri önce davranıp krediyi kendi kimliğine yazdırabilirdi | ✅ |
| 30.10 17:30 | C | **Kredi birimi = GPU-saat, dakika bazında tüketim** (§2, §3.2 notu, §3.6): `gpu-h100` `minutesPerCredit: 60`; ön ödemeli bakiye dakika olarak tutulur; iş fiyatı `ceil(minutes × retail / minutesPerCredit)`; `/v1/credits/balance` → `{ minutesPerCredit, prepaidMinutes, returnableCredits }`; redeem/return yanıtlarında `balance` yerine `prepaidMinutes`; return yalnızca tam kredi; iş ödemesi `{ method:'credits', minutes, tokenId }`. **§3.2'deki 20 kredilik tavan değişmedi** (artık 20 GPU-saat) | GPU-dakika kredisiyle 20 kredilik tavan 20 dakikadan uzun işleri krediyle ödenemez yapıyordu. Kullanıcı kararı | ✅ |

## Plan değişiklikleri

| Tarih | Track | Faz | Değişiklik | Neden |
|---|---|---|---|---|
| 30.10 16:55 | C | 0 | Kök workspace ve `packages/core` stub'ı C tarafından kuruldu (A.P0 görevi 0.1'in minimal kısmı) | A.P0 yoktu; C'nin 4 app'i ve testleri ortak `node_modules` ve tek SDK kopyası gerektiriyor. Kullanıcı kararı |
| 30.10 17:10 | C | 1 | Faz 1 kodu mockchain'de bitti; **mainnet kabulü** (T1 mint, T2 open-pool, T6 redeem, T7 402) Desktop + fon + A.P1/B.P1 bekliyor. `open-pool`, A.P1 gelene kadar havuzu **taslak** kaydediyor | Fon yok (D.P0), Desktop bu ortamda yok, `buildReserveAndAnnounce`/`signOffer` (A.P1) ve `POST /offers` (B.P1) yok |
| 30.10 17:30 | C | 0–1 | Ürün `H100 GPU-hour` (`minutesPerCredit: 60`), perakende 50 sat/kredi (= 50 sat/GPU-saat, dakika bazında faturalanır). `track-C` 0.2 ve 1.4 güncellendi. **Faz 2 için not:** `open-pool` örneği (1000 kredi / 25.000 sat / ücret 300) artık 1000 GPU-saat demek; kredi başına 25 sat iken 300 sat kayıt bedeli küçük pledge'lere göre büyük, beyin kararında hesaba katılmalı | Kullanıcı GPU-saat önerisini kabul etti |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ☐ | |
| 2 | Desktop SINGLE\|ACP imzalıyor, Arcade kabul ediyor | A | ☐ | |
| 3 | Desktop izin davranışı | A | ☐ | |
| 4 | nLockTime yükseklik semantiği | D | ☐ | |
| 5 | Vault script'i politikadan geçiyor | D | ☐ | |
| 6 | v1 tx malleability kuralları | D | ☐ | |
| 7 | `beefFromArcade` soyu yürüyor | A | ☐ | |
| 8 | Arcade policy (boyut/ücret) | B | ☐ | |

---

## Track A — Protokol

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track B — Overlay + Koordinatör

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track C — Sağlayıcı + Ajanlar

- **Faz:** P0 ✅ (30.10 16:55) · P1 ✅ **mockchain** (30.10 17:10; kredi birimi GPU-saat 17:30), mainnet kabulü bekliyor (aşağıda) → sıradaki P2. Branch: `trackC`.
- **Bitenler:**
  - **P0:**
    - Kök iskelet (A.P0 yerine geçici, bkz. Blokajlar): `package.json` (workspaces `packages/*`, `apps/*`; sürümler AGENTS.md'deki gibi sabit), `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts` (kit alias'ı), `.gitignore`, `.env.example` (§3.9), `AGENTS.md`.
    - `packages/core` (geçici): `src/types.ts` (§3.3 birebir), `src/constants.ts` (§3.2'nin C'nin kullandığı kısmı), `src/sdk.ts`, `src/env.ts`, `src/wallet.ts` (`openServerWallet`, guide §14.2, Arcade birincil), `src/stubs.ts` (`buildReserveAndAnnounce`, `signOffer`, `verifyLineage`: `NotImplementedError` fırlatır), `src/kit/*` (kit kopyaları; `overlayApi.ts`'te topic/servis `tm_agentcoop`/`ls_agentcoop`, constructor ile değiştirilebilir), `register-sdk.mjs` (ESM/CJS hook'u).
    - `apps/provider-api`: `products/gpu-h100.json`, `src/products.ts`, `src/runner.ts` (simülatör: kuyruk, `gpus` eşzamanlılığı, iş id'sine tohumlanmış GPU log'u, tekrarlanabilir sonuç hash'i), `src/app.ts` (BRC-105), `src/server.ts`. `npm run provider` → :8092.
    - `apps/agents` iskeleti: `agents/{finetune,eval,inference}.json`, `src/{profile,workload,providerClient,agent,log}.ts`.
  - **P1:**
    - provider-api kredileri: `src/credits.ts` (`CreditLedger`: bakiye **dakika** olarak `data/provider/balances.json`'da; redeem'de outpoint + tavan atomik olarak ayrılıyor), `src/redeem.ts` (redeem: token, adres, ≤20/≤20 kredi, gönderen = çağıran, soy, tek kullanım; return: tam kredi, `TokenKit.send`, başarısızsa iade). `calculateRequestPrice` bakiye işin dakikasını karşılıyorsa düşüp **0** döndürüyor, karşılamıyorsa işin tamamı perakende (dakika bazında). `/v1/credits/{redeem,return,balance}`.
    - `apps/provider-cli` (`WalletClient('auto', APP_ORIGINATOR)` → BSV Desktop): `whoami`, `mint` (tokenId'yi ürün JSON'una yazar), `open-pool` (terms + gelir script'i `[1,'agentcoop provider']`/nonce; A stub'ı yüzünden şimdilik **taslak**), `cancel-pool` (rezerve UTXO'yu kendine harcar), `list-pools`, `sync-revenue` (§3.8 `pledges`/`settlement` lookup'ı → `agentcoop revenue` basket), `sweep-revenue` (basket → default). Yerel kayıt `data/provider-cli/pools.json` (nonce).
    - İlk ajan (`eval`): `Agent.runJob` → ön ödemeli bakiye işi karşılamıyorsa ve cüzdanda kredi varsa eksik tam krediyi redeem eder (tavanı göndermeden önce kontrol eder), yoksa perakende 402. `npm run agent -- eval --jobs 3`.
    - README'ler: `apps/provider-api/README.md`, `apps/provider-cli/README.md` (**iki sağlayıcı kimliği**: havuz geliri Desktop'a, 402 geliri sunucuya), `apps/agents/README.md`.
    - Testler: `test/provider.credits.mockchain.test.ts` (14: mint → ajana 100 kredi → 45 dk eval 1 kredi redeem eder, 15 dk artar → 15 dk eval artanla ödenir → 8 saatlik finetune 8 krediyle → 25 GPU-saatlik iş tavanı aştığı için perakende 1.250 sat → 21 red → 12 tamam, 9 tavan reddi → replay 409 → yabancı 403 → başka token / başka adres reddi → A `verifyLineage` reddi → return 7 → kısmi kredi artığı ön ödemeli kalır, bakiye yeniden başlatmada korunur), `test/provider-cli.mockchain.test.ts` (5: open-pool terms ve gelir script'i, yetersiz kredi reddi, gelir izleme + sweep, cancel-pool, çevrimdışı list-pools). **`npm test` 34/34 yeşil, `npm run typecheck` temiz.**
    - Çalışma zamanı duman testi (tsx + hook, sahte anahtarlar; GPU-saat geçişinden önce): provider ve ajan AuthFetch ile konuşuyor, 402'de AuthFetch ödemeye çalışıyor (boş cüzdan: yetersiz bakiye hatası), süreçler temiz kapanıyor.
- **Mainnet kabulü için kalanlar (P1):** (1) D fonlayınca `provider-api` ve `agent-2` cüzdanları; (2) Desktop'ta `npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0` (T1); (3) ajana kredi (skeleton settlement veya doğrudan gönderim) → `npm run agent -- eval` ile redeem (T6) ve perakende iş (T7); (4) A.P1 + B.P1 gelince `open-pool` (T2). txid'ler "Mainnet işlemleri"ne.
- **Karar verildi (30.10 17:30):** 1 kredi = 1 GPU-saat, dakika bazında tüketim. Ön ödemeli bakiye dakika olarak tutuluyor, işler dakika düşüyor, artan dakika sonraki işe kalıyor; perakende dakika bazında (`ceil(dk × 50 / 60)` sat); return tam kredi. Tavan 20 kredi = 20 GPU-saat. Kod, testler, README'ler, MASTER §2/§3.2/§3.6 ve `track-C` güncellendi.
- **Bilinen sorunlar:**
  - npm 10.9 workspace kurulumunda arborist hatası veriyor (`Cannot read properties of null (reading 'edgesOut')`). **`npx npm@11 install`** kullanın. npm 11 install script'lerini `allowScripts` ile yönetiyor: `better-sqlite3` derlemesi kapalı (hazır `prebuilds/` binary'si yükleniyor, Xcode gerekmiyor), `esbuild` açık.
  - Testler, B'nin `packages/overlay`'i main'e gelene kadar kitin overlay'ini (`docs/starter/.../overlay/server.ts`, `tm_tokenkit`) kullanıyor (`test/helpers/overlay.ts`). Kurallar aynı, yalnızca isimler farklı.
  - BSV Desktop'a Node'dan bağlanma (`WalletClient('auto', originator)`) bu ortamda denenmedi; provider-cli komutları wallet-toolbox cüzdanıyla test edildi.
- **Diğer track'lerin benden beklediği:**
  - **A:** `packages/core`'daki geçici dosyaların üzerine yazabilirsin. C'nin kullandığı yüzey: `types.ts`, `constants.ts`, `kit/*`, `wallet.ts` (`openServerWallet`), `env.ts`, `register-sdk.mjs`; §3.4'ten `buildReserveAndAnnounce(wallet, kit, termsWithoutPoolId)`, `signOffer`, `verifyLineage(outpoint "txid_vout", { arcadeUrl })`. `buildReserveAndAnnounce`'a `poolId`'siz terms veriyorum (poolId o tx'ten çıkıyor). Rezerve kredi UTXO'su `bsv21` basket'inde kit `customInstructions`'ı ile durursa `cancel-pool` onu `TokenKit.spendInputs` ile harcayabiliyor; farklı olacaksa yaz. `verifyLineage`'in mockchain'de test edilebilmesi için fetch/chain tracker'ı enjekte edilebilir olsun.
  - **B:** `sync-revenue`, §3.8 `{ op:'pledges', poolId, includeSpent:true }` ve `{ op:'settlement', poolId }` kullanıyor; yanıttaki her çıktının `beef`'i tx'in tamamını içermeli (C, `payScriptHex`'e ödeyen çıktıları tx'te tarıyor). Katalog havuzları `GET /pools`'tan `terms.tokenId` ile süzüyor.
  - **D:** fon: `provider-api` 20k, `agent-1..3` 50k (§6.1). `scripts/wallets.ts` için `packages/core/src/wallet.ts` → `openServerWallet({ name, rootKeyHex, dataDir, chain, arcadeUrl })` hazır.
  - **Herkes:** app'leri `tsx --import @agentcoop/core/register-sdk …` ile başlatın (MASTER §3.1).

## Track D — Vault + Ops + Rail + Teslim

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Cüzdan/fon durumu:** sats talebi: ☐ gönderildi ☐ geldi (miktar: ) · fonlanan cüzdanlar:
- **Axel soruları:** ☐ gönderildi · cevaplar:
