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
| 2026-10-30 | A | Doğrulama testi 2/3 mainnet koşusu: BSV Desktop (mainnet, açık) + ≥ 2.000 sat gereken bir laptop | D (sats) + Desktop'ı olan üye: `npx tsx scripts/spike-sighash.ts` çalıştırıp çıktıyı ve Desktop'ın kaç onay penceresi gösterdiğini A'ya/STATUS'a iletsin | Mockchain varyantı yeşil (`test/spike-sighash.mockchain.test.ts`); A Faz 1'e mockchain'de devam ediyor |
| 2026-10-30 | A | S1 mainnet skeleton (`scripts/skeleton.ts`): `scripts/wallets.ts` `openWallet(name)` + fonlanmış `provider-api`, `agent-1`, `agent-2` (her biri ≥ 5k sat) + çalışan overlay | D.P0 (cüzdan/fon), B.P1 (overlay; yoksa kit overlay'i `OVERLAY_TOPIC=tm_tokenkit OVERLAY_SERVICE=ls_tokenkit`) | Mockchain e2e yeşil (`test/skeleton.mockchain.test.ts`); A Faz 2'ye geçiyor |

## Arayüz değişiklikleri (herkes okur)

| Tarih | Track | Değişen | Neden | MASTER-PLAN güncellendi mi |
|---|---|---|---|---|
| 2026-10-30 | A | **Yalnız ekleme, kırıcı değil:** `OverlayClient(url, outbox?, chain?, arcadeUrl?, topic?, service?)` — son iki parametre yeni (varsayılan kit'in `tm_tokenkit`/`ls_tokenkit`); `SettlementParticipant` adlı tip (= `SettlementPlan.participants[i]`, şekil aynı); `SigningWallet = Pick<WalletInterface,'createSignature'\|'getPublicKey'>` | `tm_agentcoop`'a submit edebilmek; tiplere ad vermek | Gerek yok (§3.3 şekli aynı; OverlayClient §3'te yok) |
| 2026-10-30 | A | **Ekleme (A-P1):** MASTER §3.2'ye teklif UTXO anahtarı/basket'i (`agentcoop offers`), outpoint biçimi (`txid_vout`), `pledgeListHash` tanımı, para üstü kuralı; §3.4'e `verifyOffer`, `planTransaction`, `internalizeSettlement`, `fetchChainPolicy` ve builder `opts` şekilleri | Faz 1 uygulaması netleştirdi | Evet (§3.2, §3.4) |
| 2026-10-30 | A | **A-P2:** `buildSweep(wallet, kit, listings[], opts)` → `{ txid, credits, tx }` (eski taslak `buildSweep(wallet, listings[]): { plan }` idi; kullanan yoktu). Eklenen: `reserveListing`, `verifyListing`, `cancelListing`, `cancelPool`, `reclaimReserved`, `verifyLineage` opts; MASTER §3.2 market anahtarları; §3.4 hata kodları | Liste UTXO'su teklif gibi ayrı anahtara taşınmalı (TokenKit dokunmasın); sweep alıcı cüzdanıyla tek `createAction` | Evet (§3.2, §3.4) |
| 30.10 17:50 | A | **Kırıcı (küçük):** `cancelPledge(wallet, outpoint)` artık `Promise<{ txid, beef }>` döndürüyor (eskiden `string`); `beef` = iptal tx'inin AtomicBEEF'i, çağıran `tm_agentcoop`'a submit eder. **Davranış:** `planSettlement` artık %120 penceresiyle sınırlı değil; kural sırasında tam N yapan **sözlükçe-ilk alt kümeyi** seçer (önceki pledge'ler öncelikli, tam dolum varsa mutlaka bulunur). %120 (`OVERFILL_PERCENT`) yalnızca koordinatörün kabul sınırı | B'nin iki blokajı (canlılık; iptalin overlay'e gitmemesi) | Evet (§3.4) |
| 30.10 16:20 | B | **§3.3 `PoolTerms.poolId` zincirdeki OP_RETURN `pool` json'unda yok**; overlay `${txid}_0` türetir. Zincir dışı nesnelerde (Offer, API) dolu | Bir tx kendi txid'ini içeremez; `poolId = ${txid}_0` olduğu için imkânsız. **A:** `buildReserveAndAnnounce` json'a `poolId` koymamalı | ✅ §3.3 yorum |
| 30.10 16:20 | B | **§3.5 `status`'a `cancelled` eklendi**; `failed`/`locking` yan API'de türetiliyor | Sağlayıcı kredi UTXO'sunu başka tx'le harcarsa (§4.5 "havuzu iptal") bunun bir adı olmalı. **C/D:** UI ve ajanlar `cancelled`'ı bilmeli | ✅ §3.5 |
| 30.10 16:20 | B | **§3.8 cevap `context` alanları, pledge geçerlilik kuralı, `pledges` sorgusuna `includeInvalid`, OP_RETURN kayıt çıktıları admit ediliyor** | **A:** `buildPledge` geçerlilik kuralına uymalı (out1 ≥ `feeSats` → `payScriptHex`, out0 ≥ `ceil(credits×price/N)+1`, `minCredits ≤ credits ≤ N`). **C:** ajanlar `pledges`/`pools` context'ini buna göre okur | ✅ §3.8 |
| 30.10 16:20 | B | **§3.4 `cancelPledge` iptal tx'ini `tm_agentcoop`'a submit etmeli** | Overlay iptali yalnızca submit edilen tx'ten öğrenir | ✅ §3.4 yorum |
| 30.10 16:48 | B | **§3.8 vault sorguları (`vaults`, `vault`) ve `verified` kuralı; `listings` sorgusu; overlay SSE `GET /agentcoop/events`. §3.5 `/listings` doğrulama ve sıralama** | **D:** vault fonlama tx'i `OP_RETURN vault { v, vaultId, owner, agent, guard }` taşımalı, script D 1.1 şablonu ve anahtarlar `'anyone'` türevi; aksi halde `verified:false` olur ve owner sorgusunda görünmez. `owner-cli status` `{ op:'vaults', owner }` kullanabilir. **A/C:** liste `POST {COOP_API_URL}/listings`, alıcı `GET /listings?tokenId=` (en ucuz önce). **UI:** canlı akış için SSE | ✅ §3.5, §3.8 |
| 30.10 16:38 | B | **§3.5 `GET /pools/:id` cevabına `coordinator` alanı** (tur, imzalı/toplam, kara liste nedenleriyle, son tur sonucu); `/healthz` → `engine` | Ajanlar ve UI turun neden düştüğünü görebilsin. Ekleme; mevcut alanlar değişmedi | ✅ §3.5 |
| 30.10 16:30 | B | **§3.2 Settlement sighash notu: teklif `version=1`, `lockTime=0`, in0 `sequence=0xffffffff` ile imzalanır, settlement aynı değerlerle kurulmalı** | SINGLE\|ACP de bu üç alanı imzalıyor. **A:** `signOffer` ve `planSettlement` bu değerleri sabit kullanmalı | ✅ §3.2 |
| 30.10 17:35 | C | **§3.1 ESM/CJS — çalışma zamanı:** A'nın kuralı aynen geçerli (SDK yalnızca `@agentcoop/core/sdk`). Ek olarak app ve script'ler **`tsx --import @agentcoop/core/register-sdk …`** ile başlar. `packages/core/register-sdk.mjs` senkron bir Node hook'u: `sdk.ts`'in CJS re-export'unu (ve çıplak `@bsv/sdk`'yı) export listesi yükleme anında okunan bir ESM sarmalayıcıya yönlendiriyor | **Hook olmadan `sdk.ts` tsx altında çalışmıyor:** `import { Transaction } from '@agentcoop/core/sdk'` → `does not provide an export named 'Transaction'` (Node CJS build'in named export'larını göremiyor; testlerde vitest alias'ı yüzünden görünmüyordu). **A:** `scripts/skeleton.ts` ve `spike-sighash.ts` de bu bayrakla çalıştırılmalı. **B:** koordinatör `@bsv/sdk`'yı doğrudan import ediyor; hook onu da kapsıyor, bayrakla başlatın | ✅ §3.1 |
| 30.10 17:35 | C | **`@agentcoop/core` ekleri (yalnız ekleme, A'nın dosyalarına dokunulmadı):** `src/node/serverWallet.ts` (`openServerWallet({ name, rootKeyHex, dataDir, chain?, arcadeUrl?, monitor? })`, guide §14.2, Arcade birincil), `src/node/env.ts` (`loadDotEnv`, `dataDir`, `requireEnv`, `network`), `register-sdk.mjs`; `package.json` `exports`'a `./node/*` ve `./register-sdk` | provider-api ve ajanlar sunucu cüzdanı açıyor; D'nin `scripts/wallets.ts` `openWallet(name)`'i bunu sarabilir | Gerek yok (§3.4 dışı yardımcılar) |
| 30.10 16:55 | C | **§3.6** ekler: `GET /healthz` (auth yok); `/v1/catalog` yanıtında `provider.server` (provider-api kimliği, redeem adresi); `POST /v1/jobs` gövdesinde opsiyonel `product`; ürün JSON'unda opsiyonel `simulate.gpus` | Ajan redeem için sunucu kimliğini katalogdan öğreniyor; ikinci ürün (Faz 3) için iş hangi ürüne ait belli olmalı | ✅ |
| 30.10 17:10 | C | **§3.6** Faz 1: katalogda `credits: { maxRedeem, maxPending, redeemTo }`; ürün JSON'unda opsiyonel `minutesPerCredit` (varsayılan 1); redeem'de **gönderen = çağıran** kuralı ve hata kodları | `redeemTo`: ajan krediyi nereye göndereceğini katalogdan öğreniyor. `minutesPerCredit`: kredi birimi kararı (bkz. Track C → Karar bekleyen) koda dokunmadan değişebilsin. Gönderen kuralı: overlay herkese açık, aksi halde transferi gören biri önce davranıp krediyi kendi kimliğine yazdırabilirdi | ✅ |
| 30.10 17:30 | C | **Kredi birimi = GPU-saat, dakika bazında tüketim** (§2, §3.2 notu, §3.6): `gpu-h100` `minutesPerCredit: 60`; ön ödemeli bakiye dakika olarak tutulur; iş fiyatı `ceil(minutes × retail / minutesPerCredit)`; `/v1/credits/balance` → `{ minutesPerCredit, prepaidMinutes, returnableCredits }`; redeem/return yanıtlarında `balance` yerine `prepaidMinutes`; return yalnızca tam kredi; iş ödemesi `{ method:'credits', minutes, tokenId }`. **§3.2'deki 20 kredilik tavan değişmedi** (artık 20 GPU-saat) | GPU-dakika kredisiyle 20 kredilik tavan 20 dakikadan uzun işleri krediyle ödenemez yapıyordu. Kullanıcı kararı | ✅ |

## Plan değişiklikleri

| Tarih | Track | Faz | Değişiklik | Neden |
|---|---|---|---|---|
| 2026-10-30 | A | 5 (yeni) | Vault'a kilitli kredi çıktısı (`creditLock:'vault'`, `decodeBsv21Owned`, bayraklı `ownerKinds` kuralı) + Lighthouse modu (`SINGLE\|ACP` pledge, mevcut `in i ↔ out i` düzenine oturur, para üstü yok) | FINAL-IDEA §8'deki tek "Açık" non-custodial satırı kapatır; çevrimdışı insan katılımı (benimsenme). S3'ten önce başlamaz; bayrak kapalıyken davranış değişmez. B (topic kuralı bağlama), C (participant-cli lighthouse), D (guard `kind:'redeem'\|'list'`) Faz 5'te etkilenir |
| 2026-10-30 | A | 6 (yeni) | OrdLock listeleri (1Sat Market) + covenant vault araştırması (3 saat zaman kutusu, yalnız rapor) | 1Sat ekosistemine görünürlük/likidite (benimsenme, stack); covenant guard'sız vault için yol haritası. S3'ten önce başlamaz |
| 30.10 16:00 | B | 5 (yeni) | **Faz 5 — Herkese açık yayın** eklendi: VPS, HTTPS (Caddy), alan adı (yoksa sslip.io), CORS, hız sınırı, WS `hello` kimlik kanıtı, `/healthz` + uptime izleme, "kendi ajanınla katıl" kılavuzu. S3'ten sonra başlar | Jüri ve dış ajanlar ürünü yerelde olmadan deneyemiyor (adoption %35, clear demo). `plan/SETUP-ACCOUNTS.md` repoda yok; D'nin yazması bekleniyor |
| 30.10 17:30 | B | B-INT (yeni) | **A ile entegrasyon adımı** (`plan/phases/B-INT.md`): kök workspace'e göç, geçici kopyalar ve test-only planlayıcı silindi, koordinatör A'nın `planSettlement`/`assembleSettlement`/`broadcastEF`/`verifyOffer`/`verifyListing`'ini kullanıyor, A'nın builder'larıyla uçtan uca test. trackB kapatıldı, Track B `main`'de | A `main`'e kök iskeleti ve protokolü koydu; kullanıcı kararı: herkes `main`'den çalışıyor |
| 30.10 16:44 | B | 2 | Faz 2.7: **koordinatörün cüzdanı yok**; `WALLET_COORDINATOR_KEY` Faz 5'teki `hello` kimlik kanıtına (ve MessageBox yedeğine) kadar kullanılmıyor. Faz 2.2'deki MessageBox yedeği yapılmadı (WS yeterli) | WS-only turda koordinatörün imzalayacak bir şeyi yok; non-custodial iddia "parası da anahtarı da yok" olarak güçleniyor |
| 30.10 16:15 | B | 1 | Faz 1.1: topic manager pledge coin'lerini ve vault çıktılarını harcayan girdileri de **`coinsToRetain`**'e koymalı | Engine (`@bsv/overlay` 2.6.4 `classifyPreviousCoins`) önceki topic çıktılarından `coinsToRetain`'de olmayanları "stale" sayıp **siliyor**. Kit kuralı yalnızca token girdilerini tutuyor; pledge'ler tutulmazsa settlement/iptal (T4) geçmişi ve Faz 6.3 denetimi kaybolur |
| 30.10 16:00 | B | 6 (yeni) | **Faz 6 — İzinsizlik ve ölçek kanıtı** eklendi: ikinci bağımsız koordinatör, `GET /metrics` (`custodiedSats = 0` zincirden hesaplı), `GET /pools/:id/audit` (sıralama + pledge-list hash'ini yeniden hesaplar), 50+ katılımcılı mainnet settlement (C'nin ajan sürüsüyle). S3'ten sonra; sıra 5 → 6 → 4 | FINAL-IDEA §8 "seçim yetkisi tespit edilebilir" iddiasının ve §11 kapanış rakamlarının kanıtı. **Önerilen arayüz eki (henüz MASTER'a yazılmadı, Faz 6.1'de):** teklif imzasını ayrı bir `OP_RETURN agentcoop offer` tx'iyle zincire yazmak, böylece ikinci koordinatör birinciye bağımlı kalmaz |
| 30.10 17:35 | C | 0–1 | **main ile birleşme:** C'nin geçici kök iskeleti ve `packages/core` stub'ı kaldırıldı; A'nın kökü ve core'u esas. Track C A'nın gerçek API'sine taşındı: redeem → `verifyLineage` (ataları önce ajanın gönderdiği BEEF'ten, kalanını Arcade'den çeker; overlay'e dayanan geri dönüş yolu kalktı), `open-pool` → `buildReserveAndAnnounce` + `signOffer` + `POST /offers` (koordinatöre ulaşılamazsa imzalı teklif saklanır, `post-offer` ile yeniden gönderilir), `cancel-pool` → A'nın `cancelPool`'u; overlay istemcileri `COOP_TOPIC`/`COOP_SERVICE`; testler B'nin overlay'iyle | A.P0–P2 ve B.P0–P3 main'e geldi; B'nin STATUS notu: "C kökü kendisi kurmasın" |
| 30.10 17:10 | C | 1 | Faz 1 kodu mockchain'de bitti; **mainnet kabulü** (T1 mint, T2 open-pool, T6 redeem, T7 402) Desktop + fon bekliyor | Fon yok (D.P0), Desktop bu ortamda yok |
| 30.10 17:30 | C | 0–1 | Ürün `H100 GPU-hour` (`minutesPerCredit: 60`), perakende 50 sat/kredi (= 50 sat/GPU-saat, dakika bazında faturalanır). `track-C` 0.2 ve 1.4 güncellendi. **Faz 2 için not:** `open-pool` örneği (1000 kredi / 25.000 sat / ücret 300) artık 1000 GPU-saat demek; kredi başına 25 sat iken 300 sat kayıt bedeli küçük pledge'lere göre büyük, beyin kararında hesaba katılmalı | Kullanıcı GPU-saat önerisini kabul etti |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ✅ 30.10 16:05 (mockchain) · ✅ 17:30 A'nın gerçek tx'leriyle | **17:30:** A'nın `buildReserveAndAnnounce` / `buildPledge` / `planSettlement` tx'leri `tm_agentcoop`'tan geçti, koordinatör turu settle etti, ajanlar 600/400 aldı (`apps/coordinator/test/e2e.integration.mockchain.test.ts`). İlk koşu: `tm_agentcoop`, kit kuralları **değişmeden** kabul ediyor. Settlement: in0 sağlayıcı kredi UTXO'su (N=1000, `SINGLE\|ACP\|FORKID`) + 3 pledge coin (`ALL\|FORKID`) → out0 4.500 sat sağlayıcıya, out1–3 kredi 600/300/100, out4–6 para üstü (pledge coin'in kendi script'ine), out7 OP_RETURN settle. STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`; overlay SPV + tüm script'leri doğruladı; lookup'ta her ajan payını görüyor, teklif UTXO'su `spent` + `spendingTxid`. Ek kanıtlar: **(1b)** sağlayıcının SINGLE\|ACP imzası farklı katılımcı/pay/para üstüyle yeniden kurulan planda da geçerli, yani koordinatörün yeniden planlaması (3 tur) yeni sağlayıcı imzası istemiyor; **(1c)** out0 1 sat düşünce imza geçersiz; **(1d)** karışık tx'te enflasyon admit edilmiyor; **(1e)** overlay'in admit etmediği kredi girdisiyle settlement tamamen reddediliyor. Test: `packages/overlay/test/validation1.mixed-settlement.test.ts`. **A için sonuç: `rules.ts` genişletmesi gerekmiyor; FINAL-IDEA §12.2 B planına gerek yok** |
| 2 | Desktop SINGLE\|ACP imzalıyor, Arcade kabul ediyor | A | ◐ | Mockchain ✓ (wallet-toolbox: SINGLE\|ACP imzalı yabancı girdi + sonradan eklenen fon/para üstü kabul; ödeme düşürülünce `Script evaluation error`). Mainnet: `scripts/spike-sighash.ts` hazır, Desktop+sats bekliyor |
| 3 | Desktop izin davranışı | A | ☐ | Aynı script imza #1/#2 için zaman damgası basar; onay penceresi sayısını insan gözlemleyip yazar |
| 4 | nLockTime yükseklik semantiği | D | ☐ | |
| 5 | Vault script'i politikadan geçiyor | D | ☐ | |
| 6 | v1 tx malleability kuralları | D | ☐ | |
| 7 | `beefFromArcade` soyu yürüyor | A | ☐ | |
| 8 | Arcade policy (boyut/ücret) | B | ✅ 30.10 16:10 | Arcade v0.16.0 (`/health`): ücret datahub'lara göre **1–100 sat/kB** (planlamada 100 kullan); en sıkı maks. tx 100 MB, en sıkı maks. script 500 kB; girdi sayısı sınırı yok. Gerçek script şekilleriyle ölçülen boyut (gerçek settlement'la %0,3 tutarlı): 3 katılımcı 1.486 B / 149 sat; 20 → 7.674 B / 768 sat; 50 → 18.594 B / 1.860 sat; 100 → 36.794 B / 3.680 sat; 80 p2pkh + 20 vault → 39.314 B / 3.932 sat. Katılımcı başına ~37–50 sat ücret. **Politika settlement boyutunu sınırlamıyor; MASTER §3.2 %120 ve katılımcı sayısı sınırı değişmiyor.** Betik: `packages/overlay/scripts/arcadePolicy.ts` (`npm run arcade-policy`), model: `packages/overlay/scripts/settlementSize.ts` |

---

## Track A — Protokol

- **Faz:** P2 ✓ mockchain (2026-10-30). Planlar: `plan/phases/A-P0.md`, `A-P1.md`, `A-P2.md`
- **Bitenler:**
  - **P0:** kök monorepo (`package.json` sabit versiyonlar, `tsconfig*.json`, `vitest.config.ts`, `.gitignore`, `AGENTS.md`); `@agentcoop/core`: `src/types.ts` (MASTER §3.3 + §3.2 sabitleri), `src/sdk.ts` (tek CJS SDK kopyası), `src/errors.ts`, kit kopyası `src/kit/*`, `src/scripts/{opreturn,vault,htlc}.ts`, `src/signers/{sighash,P2pkhWalletSigner}.ts`; `test/helpers/mockchain.ts`; `scripts/spike-sighash.ts`.
  - **P1 builder'ları** (`packages/core/src/pool/`): `reserve.ts` (`buildReserveAndAnnounce`), `offer.ts` (`signOffer`, `verifyOffer`), `pledge.ts` (`buildPledge`, `cancelPledge`, tek aktif pledge), `plan.ts` (`planSettlement`, `orderPledges`, `pledgeListHash`; %120, kara liste/bekleme listesi, ücret = gerçek imza boyutu × Arcade oranı), `verify.ts` (`verifySettlementPlan`, `planTransaction`), `settle.ts` (`signSettlementInput`, `assembleSettlement` + yerel Spend kontrolü, `broadcastEF`, `internalizeSettlement`), `terms.ts`; `src/util/{outpoint,spend,arcade}.ts` (`fetchChainPolicy`).
  - **Testler:** `npm test` → 7 dosya / **38 test yeşil**; `npm run typecheck` temiz. `test/skeleton.mockchain.test.ts`: deploy → reserve+announce → SINGLE|ACP teklif → 2 pledge (600/400) → plan → her ajan tam tx'i doğrular + ALL imzalar → assemble → yayın → **kit overlay'i settlement'ı kabul etti (2 kredi çıktısı admit)** → `TokenKit.sync` 600/400 → sağlayıcıya tam P; plan imzadan sonra değişince `BAD_SIGNATURE`; dolmayan/süresi geçen havuz + `cancelPledge`.
  - `scripts/skeleton.ts` (mainnet S1) hazır — Blokajlar'da.
- **P2 (devam):** `packages/core/src/verify/lineage.ts` — **`verifyLineage(outpoint, { fetchTx?, arcadeUrl?, wocUrl?, maxDepth?, cache? })` HAZIR** → `{ ok, tokenId, amt, ownerPkh, depth, reason? }`. Overlay'siz: ataları Arcade'den (WoC yedek) çeker, txid'leri yeniden hesaplar, aynı token'ın girdilerinin imzalarını `Spend` ile doğrular, kit `rules.ts`'i yerelde uygular. `verifySettlementPlan(..., { verifyLineage: true })` bağlı. Testler: `packages/core/test/lineage.test.ts` (sahte/enflasyon/çapraz token/bozuk ata imzası/yalan veri), skeleton'da mockchain üzerinde. `scripts/lineage-check.ts <txid_vout>` (doğrulama 7, mainnet). Toplam **44 test yeşil**.
- **P2 market** (`packages/core/src/market/listing.ts`): `reserveListing` → `signListing` (SINGLE|ACP) → `verifyListing`; `buildSweep` (her liste için önce `verifyLineage`, sonra tek `createAction`: liste i ↔ ödeme i + Σk kredi alıcıya + fon/para üstü; overlay submit); `cancelListing`, `cancelPool` (C'nin `cancel-pool`'u için), `reclaimReserved`. `test/market.mockchain.test.ts` 5/5: 2 liste tek sweep (T8), sahte liste `LINEAGE_FAILED` ile ödeme yapılmadan reddedildi, iptal kredileri geri verdi. **Toplam 9 dosya / 49 test yeşil.**
- **Faz durumu:** P0 ✓, P1 ✓, P2 ✓ — hepsi mockchain'de; mainnet koşuları (doğrulama 2/3/7, T1–T3, T5, T8) Blokajlar'daki fon/Desktop'a bağlı.
- **B blokajları çözüldü (30.10 17:50):** `planSettlement` canlılık sorunu (`packages/core/src/pool/plan.ts` `pickExact`: geriye doğru alt küme toplamı erişilebilirliği, `MAX_SUBSET_SUMS` aşılırsa açgözlü yedek) ve `cancelPledge` → `{ txid, beef }`. B: `apps/coordinator/test/e2e.coordinator.mockchain.test.ts` senaryo 3'ü eski örneğe (300, 300, 600, 400) geri çekebilirsiniz; overlay test helper'ınızdaki `cancelPledge` yerine core'unkini kullanabilirsiniz. **Toplam 21 dosya / 119 test yeşil.**
- **Devam eden:** P3 planı (vault yolu) — D.P1 (`VaultSigner`, guard `/cosign`) ve B.P2 (koordinatör) henüz yok → MASTER §3.7 arayüzüne karşı mock guard ile ilerlenecek.
- **Bilinen sorunlar / öğrenilenler (herkes için):**
  - SDK, en üstteki `OP_RETURN`'den sonraki her şeyi **tek veri chunk'ı** yapar. AgentCoop zarfını elle ayrıştırmayın; `parseOpReturn` kullanın.
  - `WalletClient` metotları originator parametresi **almaz** (constructor'da verilir); wallet-toolbox `Wallet` alır.
  - wallet-toolbox `createAction`, `inputs[].unlockingScript` ile verilen hazır imzayı yayından önce **kendisi doğrular**.
  - `P2PKH().lock(x)`: `x` string ise **adres** sanılır; pkh hex için `Utils.toArray(pkh,'hex')` verin.
  - Arcade `/health` (2026-10-30): `miningFee` 100 sat/1000 B, `maxtxsizepolicy` 100 MB → **B: doğrulama testi 8 için veri**; `fetchChainPolicy()` bunu okur.
  - **B: doğrulama testi 1** kit overlay'inde fiilen geçti (1 token girdisi + 2 düz girdi, 2 kredi çıktısı admit; `test/skeleton.mockchain.test.ts`). `tm_agentcoop` için aynı test B'nin topic'iyle tekrarlanmalı.
- **Diğer track'lerin benden beklediği:**
  - B: `planSettlement`, `verifySettlementPlan`, `assembleSettlement`, `broadcastEF`, `fetchChainPolicy` **hazır** (koordinatör için). Pledge'leri overlay'den `PledgeCandidate`'e çevirmek için gereken alanlar: `outpoint, satoshis, lockingScriptHex, record (parseOpReturn(out2)), sourceTx (BEEF), blockHeight?`.
  - C (ajan market davranışı): `reserveListing` + `signListing` → B'ye `POST /listings`; alıcı `buildSweep(wallet, kit, listings)`. B (indeks): liste tx'i out0 = kredi, out2 (varsa out1 token para üstü) = `OP_RETURN list`.
  - C (redeem) ve D (guard DvP): `verifyLineage` hazır — `import { verifyLineage } from '@agentcoop/core'`; redeem'de ayrıca `r.ownerPkh` sağlayıcının token adresi mi kontrol edin.
  - C: ajan akışı = `buildPledge` → (WS `sign_request`) `verifySettlementPlan` + `signSettlementInput(plan, i, new P2pkhWalletSigner(wallet, pledge.instructions))` → `internalizeSettlement` + `TokenKit.sync()`. Sağlayıcı CLI: `kit.deploy` → `buildReserveAndAnnounce` → `signOffer` → `POST /offers`.

## Track B — Overlay + Koordinatör

- **Faz:** P0 ✅ (16:11) · P1 ✅ (16:31) · P2 ✅ (16:44) · P3 ✅ (17:05) · **B-INT ✅ (30.10 17:33): A ile entegre, `main`'de** → P4 kapanış ya da (S3 sonrası) P5/P6. Mainnet kabulleri D'nin sats'ı + C'nin ajanlarını bekliyor
- **Bitenler (B-INT):**
  - Plan: `plan/phases/B-INT.md`. `packages/overlay` ve `apps/coordinator` kök workspace üyesi; ayrı lock/`node_modules`/vitest config'leri silindi. Geçici kopyalar silindi (`src/kit/*`, `src/stub/*`, overlay'in `test/helpers/mockchain.ts`, `devProtocol`); her şey `@agentcoop/core` ve `@agentcoop/core/sdk`'tan.
  - Koordinatör A'nın protokolüyle: `coreProtocol` (`planSettlement`, `assembleSettlement`, `broadcastEF`, `fetchChainPolicy`), `/offers` ve `/listings` A'nın `verifyOffer`/`verifyListing`'ine devrediyor (`BAD_OFFER`/`BAD_LISTING`). **`npm run coordinator` artık gerçek imza turları çalıştırıyor.** Saklanan teklif sağlayıcının imzaladığı haliyle kalıyor (A'nın settle kaydındaki `termsHash` buna bağlı).
  - **Uçtan uca (A'nın builder'larıyla):** `TokenKit.deploy` → `buildReserveAndAnnounce` → `signOffer` → `POST /offers` → `buildPledge` 600/400 → koordinatör turu → ajanlar `verifySettlementPlan` (+ `verifyLineage`) + `signSettlementInput` → yayın → overlay `settled` → `internalizeSettlement` + `TokenKit.sync()` 600/400. `apps/coordinator/test/e2e.integration.mockchain.test.ts`. S1'in mockchain karşılığı.
  - Kök `npm test`: 16 dosya / **84 test yeşil**; C'nin Faz 0–1'i main'e geldikten sonra 21 dosya / **118 test yeşil**; kök `npm run typecheck` temiz.
- **Bitenler (P3):**
  - Plan: `plan/phases/B-P3.md`. MASTER §3.5 (`/listings`) ve §3.8 (vault sorguları, `listings`, olay akışı) güncellendi.
  - **Market:** `POST /listings` (kredi çıktısı overlay'de admit edilmiş ve harcanmamış, `tokenId`/`credits` eşleşiyor, SINGLE\|ACP imza `Spend` ile doğrulanıyor), `GET /listings?tokenId=` (en ucuz önce, harcananlar düşüyor). İki listeyi tek tx'te süpüren alım overlay'de kabul edildi, listeler düştü.
  - **Vault indeksi:** vault şablonlu her çıktı (para üstleri dahil) + `vault` kaydı; sahiplik `'anyone'` türetmesiyle zincirden doğrulanıyor (`verified`), sahte sahiplik kaydı gizli. `{ op:'vaults', owner }` bakiye ve UTXO'larla.
  - **Canlı akış:** overlay `GET /agentcoop/events` (SSE); koordinatör abone, olayda 100 ms içinde yeniden okuyor; 60 sn poll'la bile pledge → `pool_update` < 1 sn.
  - **Dayanıklılık:** kara liste, tur sayısı, son tur koordinatör DB'sinde; yeniden başlatmada korunuyor (test). Kapanışta SSE akışları ve keep-alive soketleri kapatılıyor.
  - **Barındırma:** `infra/run.mjs` (iki servis, kalıcı `data/`, overlay anahtarı 600, çökme sonrası yeniden başlatma, Ctrl+C ikisini kapatır). Yerelde denendi: kalktı, öldürülen overlay 2 sn'de geri geldi, durdurma temiz. `infra/README.md`.
  - Testler: overlay 19/19 (`test/overlay.vaults.test.ts` eklendi), koordinatör 14/14 (`test/e2e.market-live.mockchain.test.ts` eklendi).
- **Bitenler (P2):**
  - Plan: `plan/phases/B-P2.md`. MASTER §3.5'e `coordinator` alanı eklendi.
  - Koordinatör motoru `apps/coordinator/src/engine.ts`: lock-in (teklif ∧ geçerli harcanmamış pledge ≥ N ∧ yükseklik < deadline) → `sign_request` (WS) → her imza şablonda `Spend` ile doğrulanıyor → assemble → yayın → overlay submit → `settled`. İmzalamayan (zaman aşımı / `sign_reject` / bozuk imza / çevrimdışı / zincirde harcanmış) outpoint kara listeye nedeniyle, bekleme listesinden yeni tur; 3 turdan sonra `open` (pledge kümesi değişince yeni deneme); son tarihi geçen dolmamış havuz `pool_failed` (bir kez, yayın yok). Teklif imzası her turdan önce şablonda doğrulanıyor. WoC toplu harcanmışlık kontrolü (`src/spent.ts`). JSON satır logları.
  - **A'nın protokolü enjekte ediliyor** (`src/protocol.ts` `SettlementProtocol`); koordinatör kendi `planSettlement`'ını içermiyor. A gelmeden `npm run coordinator` imza turu çalıştırmaz (`/healthz` `engine:false`).
  - Test: `apps/coordinator/test/e2e.coordinator.mockchain.test.ts` (mutlu yol + başkasının girdisine imza reddi, bekleme listesi + kısmi son pay, bozuk imza + red, 3 tur sınırı, dolmayan havuz). Koordinatör 10/10, overlay 15/15; iki koşuda kararsızlık yok. Test-only planlayıcı: `apps/coordinator/test/helpers/devProtocol.ts`.
- **Bitenler (P1):**
  - Plan: `plan/phases/B-P1.md`. MASTER §3.2/§3.3/§3.4/§3.5/§3.8 güncellendi (yukarıdaki "Arayüz değişiklikleri").
  - Overlay indeksleme: `packages/overlay/src/{AgentCoopTopicManager,AgentCoopLookupService,records,views}.ts`. Havuz, pledge, iptal (T4), settlement (T5) ve iptal edilen havuz zincirden sayılıyor; pledge geçerliliği sorgu anında. Sorgular: `pools`, `pool`, `pledges`, `settlement` + kit sorguları. Test: `packages/overlay/test/overlay.agentcoop.test.ts` (overlay toplam 15/15).
  - Yan API + WS: `apps/coordinator` (`npm run coordinator` → :8090). `POST/GET /offers` (SINGLE\|ACP teklifi zincirdeki kredi UTXO'suna karşı `Spend` ile doğrulanıyor), `GET /pools`, `/pools/:id`, `/pools/:id/pledges`, `/healthz`, `WS /ws` (`hello` → `hello_ack` + anlık durum, `pool_update`). `failed` Arcade yüksekliğinden türetiliyor. Test: `apps/coordinator/test/e2e.pools.mockchain.test.ts` 5/5; settlement koordinatörde kayıtlı teklif imzasıyla yapıldı.
- **Bitenler (P0):**
  - Faz planı: `plan/phases/B-P0.md`. Track dosyasına Faz 5 (herkese açık yayın) ve Faz 6 (izinsizlik + ölçek kanıtı) eklendi.
  - `packages/overlay/`: kit overlay'inin kopyası, `tm_agentcoop` / `ls_agentcoop`, tablolar `agentcoop_token_outputs` / `agentcoop_tokens`. `npm run overlay` → :8080 (Arcade header'ları). Bağımsız paket (`@agentcoop/overlay`, AGENTS.md sürümleri sabit, Node 22: `nvm use 22`).
  - Doğrulama testi 1 ✅ ve 8 ✅ (yukarıdaki tablo). `npm test` 8/8 yeşil (`packages/overlay/test/validation1.mixed-settlement.test.ts`).
  - `packages/overlay/README.md`.
- **Devam eden:** —. Sıradaki: Faz 4 (kapanış) en sonda; Faz 5/6 S3'ten sonra (kural). Mainnet: D'nin fonlaması gelince S1 (`scripts/skeleton.ts` + overlay + koordinatör).
- **Bilinen sorunlar:** A'nın `planSettlement` penceresi bazı pledge sıralarında havuzu kilitleyebilir; `cancelPledge` iptal tx'ini döndürmüyor (ikisi de Blokajlar'da A'ya). Typecheck kökten (`npm run typecheck`).
- **Diğer track'lerin benden beklediği:**
  - **C (P1/P2):** havuz keşfi `GET {COOP_API_URL}/pools` (`status`, `pledgedCredits`, `target`, `hasOffer`); canlı akış `WS /ws` `hello { identity, poolIds }`; tipler `packages/overlay/src/views.ts`. **İmza turu (P2):** ajan `hello`'da kendi identity'siyle bağlı kalmalı; `sign_request { poolId, round, plan, yourInputIndex }` gelince A'nın `verifySettlementPlan`'ı ile doğrulayıp `sign_response { poolId, round, inputIndex, unlockingScriptHex }` (SIGHASH_ALL) ya da `sign_reject { poolId, round, reason }` göndermeli; tur zaman aşımı 60 sn. Örnek ajan (A'nın `verifySettlementPlan` + `signSettlementInput`'ıyla): `apps/coordinator/test/e2e.integration.mockchain.test.ts` `agentBot`.
  - **D (P1):** vault fonlama tx'i `OP_RETURN vault { v:'1', vaultId, owner, agent, guard }` (identity key'ler) + D 1.1 script'i; overlay sahipliği `'anyone'` türetmesiyle doğruluyor. `owner-cli status` → `{ op:'vaults', owner }`. `.env.example`'a eklenecekler: `DATA_DIR`, `OVERLAY_PORT`, `COOP_PORT`, `OVERLAY_PRIVATE_KEY` (opsiyonel), `ROUND_TIMEOUT_MS`, `MAX_ROUNDS`, `SPENT_CHECK`. Çalıştırma: `node infra/run.mjs`.
  - **A:** kök `package.json` script'lerine `"infra": "node infra/run.mjs"`, `"overlay": "npm run overlay -w @agentcoop/overlay"`, `"coordinator": "npm run coordinator -w @agentcoop/coordinator"` (B kök dosyaya dokunmuyor).
  - **A (P2) / C (P3):** liste `POST {COOP_API_URL}/listings` (`outpoint` `txid_vout` veya `txid.vout`), alım `GET /listings?tokenId=`; sweep'te liste girdisi i ↔ ödeme çıktısı i.
  - **A:** Test 1 sonucu: kit kuralları karışık settlement'ı **değiştirilmeden** kabul ediyor, `rules.ts` genişletmesi gerekmiyor. Settlement'ı overlay'e `X-Topics: ["tm_agentcoop"]` ile submit et (kit `tm_tokenkit`'i yerine). Sağlayıcının SINGLE\|ACP imzası yeniden planlamada geçerli kalıyor (test 1b). `test/helpers/settlement.ts`, A'nın `planSettlement`/`signSettlementInput`'ına referans olarak kullanılabilir.
  - **A/C/D:** Overlay URL'si yerelde `http://localhost:8080`, lookup servisi `ls_agentcoop`. Kredi token deploy'u ve transferleri de bu topic'e gider.

## Track C — Sağlayıcı + Ajanlar

- **Faz:** P0 ✅ · P1 ✅ **mockchain** (30.10; main ile birleşti 17:35), mainnet kabulü bekliyor (aşağıda) → sıradaki P2.
- **Bitenler:**
  - **P0:**
    - `apps/provider-api`: `products/gpu-h100.json` (**1 kredi = 1 H100 GPU-saat**, `minutesPerCredit: 60`, perakende 50 sat/kredi), `src/products.ts` (ürün = konfigürasyon), `src/runner.ts` (simülatör: kuyruk, `gpus` eşzamanlılığı, iş id'sine tohumlanmış GPU log'u, tekrarlanabilir sonuç hash'i, `data/provider/jobs.json`), `src/app.ts` (BRC-105: `/healthz`, `/v1/catalog`, `/v1/jobs`, `/v1/jobs/:id`), `src/server.ts`. `npm run provider` → :8092.
    - `apps/agents` iskeleti: `agents/{finetune,eval,inference}.json` (iş yükü, 14 günlük geçmiş, bütçe, `WALLET_AGENT_1..3_KEY`), `src/{profile,workload,providerClient,agent,log}.ts`.
  - **P1:**
    - provider-api kredileri: `src/credits.ts` (ön ödemeli bakiye **dakika** olarak `data/provider/balances.json`'da; redeem'de outpoint + tavan atomik olarak ayrılıyor), `src/redeem.ts`. Redeem kuralları: ürünün token'ı; provider-api'nin token adresi; ≤ 20 kredi ve bekleyen ≤ 20 kredi; **gönderen = çağıran**; **A'nın `verifyLineage`'i** (ataları önce gönderilen BEEF'ten, kalanını Arcade'den çeker); tek kullanım. Return yalnızca tam kredi iade ediyor. `calculateRequestPrice`: bakiye işin dakikasını karşılıyorsa düşüp **0**, karşılamıyorsa `ceil(dk × 50 / 60)` sat.
    - `apps/provider-cli` (`WalletClient('auto', APP_ORIGINATOR)` → BSV Desktop): `whoami`, `mint` (tokenId'yi ürün JSON'una yazar), `open-pool` (A `buildReserveAndAnnounce` + `signOffer` → `POST /offers`; koordinatöre ulaşılamazsa imzalı teklif `data/provider-cli/pools.json`'da saklanır), `post-offer`, `cancel-pool` (A `cancelPool`), `list-pools`, `sync-revenue` (§3.8 `pledges`/`settlement` → `agentcoop revenue` basket), `sweep-revenue`.
    - İlk ajan (`eval`): `Agent.runJob` → bakiye işi karşılamıyorsa ve cüzdanda kredi varsa eksik tam krediyi redeem eder (tavanı göndermeden önce kontrol eder), yoksa perakende 402. `npm run agent -- eval --jobs 3`.
    - `@agentcoop/core` ekleri (yalnız ekleme): `src/node/serverWallet.ts`, `src/node/env.ts`, `register-sdk.mjs` (bkz. Arayüz değişiklikleri).
    - README'ler: `apps/provider-api/README.md`, `apps/provider-cli/README.md` (**iki sağlayıcı kimliği**: havuz geliri Desktop'a, 402 geliri sunucuya), `apps/agents/README.md`.
    - Testler (B'nin `tm_agentcoop` overlay'i + A'nın builder'larıyla): `test/provider.402.mockchain.test.ts`, `test/provider.runner.test.ts`, `test/agents.profiles.test.ts`, `test/provider.credits.mockchain.test.ts` (14: 45 dk eval 1 kredi redeem eder, 15 dk artar → artanla 15 dk eval → 8 saatlik finetune 8 krediyle → 25 GPU-saatlik iş perakende 1.250 sat → 21 red → 12 tamam (verifyLineage derinliği > 1), 9 tavan reddi → replay 409 → yabancı 403 → başka token / başka adres reddi → verifyLineage reddi → return 7 → kısmi kredi artığı ön ödemeli kalır, bakiye yeniden başlatmada korunur), `test/provider-cli.mockchain.test.ts` (5: gerçek open-pool, yetersiz kredi reddi, gelir izleme + sweep, cancel-pool, çevrimdışı list-pools). **Birleşik suite: 20 dosya / 116 test yeşil.** `npm run typecheck`: yalnızca main'de zaten var olan 6 hata (B'nin `packages/overlay/test/helpers/mockchain.ts` ve `apps/coordinator/test/e2e.coordinator.mockchain.test.ts` dosyalarında `@bsv/sdk` tip kopyası); C kodunda hata yok.
    - Çalışma zamanı duman testi (birleşik kod, tsx + hook, sahte anahtarlar): provider ayağa kalkıyor, ajan AuthFetch ile katalog alıyor, 402'de ödemeye çalışıyor (boş cüzdan: "19 sat eksik" = 16 dk → 14 sat + ücret), süreçler temiz kapanıyor.
- **Mainnet kabulü için kalanlar (P1):** (1) D fonlayınca `provider-api` ve `agent-2` cüzdanları; (2) Desktop'ta `npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0` (T1); (3) `open-pool` (T2, koordinatör açıkken); (4) ajana kredi (settlement veya doğrudan gönderim) → `npm run agent -- eval` ile redeem (T6) ve perakende iş (T7). txid'ler "Mainnet işlemleri"ne.
- **Bilinen sorunlar:**
  - npm 10.9 bu workspace'i kuramıyor (`Cannot read properties of null (reading 'edgesOut')`). **`npx npm@11 install`** kullanın. `better-sqlite3`'ün install script'i npm 11'de engelli kalabilir, hazır `prebuilds/` binary'si yükleniyor (Xcode gerekmiyor).
  - BSV Desktop'a Node'dan bağlanma (`WalletClient('auto', originator)`) bu ortamda denenmedi; provider-cli komutları wallet-toolbox cüzdanıyla test edildi.
  - `open-pool` örneği (1000 kredi / 25.000 sat / 300 sat ücret) artık 1000 GPU-saat demek; kredi başına 25 sat iken 300 sat kayıt bedeli küçük pledge'lere göre büyük. Faz 2 beyni bunu hesaba katmalı.
- **Diğer track'lerin benden beklediği:**
  - **A:** `register-sdk` hook'u olmadan `sdk.ts` tsx altında çalışmıyor; script'lerinizi `tsx --import @agentcoop/core/register-sdk …` ile çalıştırın. `packages/core`'a yalnızca `src/node/*`, `register-sdk.mjs` ve iki `exports` satırı ekledim.
  - **B:** koordinatörü de aynı bayrakla başlatın. `sync-revenue`, §3.8 `pledges`/`settlement` yanıtlarındaki `beef`'te tx'in tamamını bekliyor. Katalog havuzları `GET /pools`'tan `terms.tokenId` ile süzüyor.
  - **D:** fon: `provider-api` 20k, `agent-1..3` 50k (§6.1). `scripts/wallets.ts` için `openServerWallet` (`@agentcoop/core/node/serverWallet`) hazır.

## Track D — Vault + Ops + Rail + Teslim

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Cüzdan/fon durumu:** sats talebi: ☐ gönderildi ☐ geldi (miktar: ) · fonlanan cüzdanlar:
- **Axel soruları:** ☐ gönderildi · cevaplar:
