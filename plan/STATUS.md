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
| 30.10 16:15 | B | B.P1 için A.P0 yok: kök workspace, `packages/core` (`types.ts`, `opreturn.ts` `parseOpReturn`, kit kopyaları) | A | `packages/overlay` bağımsız paket olarak çalışıyor; `src/kit/*` geçici kopya; P1'de MASTER §3.3 tiplerinin ve §3.2 OP_RETURN zarfının geçici kopyasıyla devam |
| 30.10 16:15 | B | B.P1 için A.P0 yok: kök workspace, `packages/core` (`types.ts`, `opreturn.ts` `parseOpReturn`, kit kopyaları) | A | `packages/overlay` ve `apps/coordinator` **geçici olarak** bağımsız paket; `src/kit/*`, `src/stub/*`, `test/helpers/mockchain.ts` geçici kopya |
| 30.10 16:50 | B (herkes için) | **Kök iskeleti yalnızca A kurmalı; B'nin bağımsız paketleri kalıcı model DEĞİL.** Ayrı `node_modules` ve kit kopyaları track'ler arasında çoğalıyor (iki SDK kopyası riski, A gelince import yolları değişir). C de aynı soruyla karşılaştı. İki track aynı anda kök `package.json` yazarsa merge çakışır | **A:** A.P0.1–0.2'yi (kök `package.json` workspaces, `tsconfig.base.json`, kök `vitest.config.ts` alias'ı, `.gitignore`, `packages/core/src/{types,sdk,index,kit/*}`, `test/helpers/mockchain.ts`) önce ve tek başına `main`'e push'la. **C:** kökü kendin kurma; A'nınkini merge et | B göçü A push'layınca (~15 dk): iki `package-lock.json` ve ayrı `node_modules` silinir, kopyalar `@agentcoop/core`'dan import edilir, koordinatörün `../../../packages/overlay/src/*` yolları `@agentcoop/overlay`'e döner |
| 30.10 16:15 | B | `pledgeListHash` biçimi belirsiz: MASTER §3.2 `sha256(join(outpoints sorted))` ayırıcıyı ve outpoint yazımını (`txid_vout` mı `txid.vout` mu) söylemiyor; ayrıca sıralama kuralı `(blockHeight, txid)` iken "outpoints sorted" leksikografik sıralama gibi okunuyor. Koordinatör (B), katılımcı doğrulaması (A) ve denetim (B Faz 6) aynı baytları üretmeli | A (`planSettlement` sahibi) | B'nin testleri şimdilik `txid_vout`, leksikografik sıra, `,` ayırıcı kullanıyor (yalnızca test). A karar verip MASTER §3.2'ye yazınca B uyar |

## Arayüz değişiklikleri (herkes okur)

| Tarih | Track | Değişen | Neden | MASTER-PLAN güncellendi mi |
|---|---|---|---|---|
| 2026-10-30 | A | **Yalnız ekleme, kırıcı değil:** `OverlayClient(url, outbox?, chain?, arcadeUrl?, topic?, service?)` — son iki parametre yeni (varsayılan kit'in `tm_tokenkit`/`ls_tokenkit`); `SettlementParticipant` adlı tip (= `SettlementPlan.participants[i]`, şekil aynı); `SigningWallet = Pick<WalletInterface,'createSignature'\|'getPublicKey'>` | `tm_agentcoop`'a submit edebilmek; tiplere ad vermek | Gerek yok (§3.3 şekli aynı; OverlayClient §3'te yok) |
| 2026-10-30 | A | **Ekleme (A-P1):** MASTER §3.2'ye teklif UTXO anahtarı/basket'i (`agentcoop offers`), outpoint biçimi (`txid_vout`), `pledgeListHash` tanımı, para üstü kuralı; §3.4'e `verifyOffer`, `planTransaction`, `internalizeSettlement`, `fetchChainPolicy` ve builder `opts` şekilleri | Faz 1 uygulaması netleştirdi | Evet (§3.2, §3.4) |
| 2026-10-30 | A | **A-P2:** `buildSweep(wallet, kit, listings[], opts)` → `{ txid, credits, tx }` (eski taslak `buildSweep(wallet, listings[]): { plan }` idi; kullanan yoktu). Eklenen: `reserveListing`, `verifyListing`, `cancelListing`, `cancelPool`, `reclaimReserved`, `verifyLineage` opts; MASTER §3.2 market anahtarları; §3.4 hata kodları | Liste UTXO'su teklif gibi ayrı anahtara taşınmalı (TokenKit dokunmasın); sweep alıcı cüzdanıyla tek `createAction` | Evet (§3.2, §3.4) |
| 30.10 16:45 | B | **§3.3 `PoolTerms.poolId` zincirdeki OP_RETURN `pool` json'unda yok**; overlay `${txid}_0` türetir. Zincir dışı nesnelerde (Offer, API) dolu | Bir tx kendi txid'ini içeremez; `poolId = ${txid}_0` olduğu için imkânsız. **A:** `buildReserveAndAnnounce` json'a `poolId` koymamalı | ✅ §3.3 yorum |
| 30.10 16:45 | B | **§3.5 `status`'a `cancelled` eklendi**; `failed`/`locking` yan API'de türetiliyor | Sağlayıcı kredi UTXO'sunu başka tx'le harcarsa (§4.5 "havuzu iptal") bunun bir adı olmalı. **C/D:** UI ve ajanlar `cancelled`'ı bilmeli | ✅ §3.5 |
| 30.10 16:45 | B | **§3.8 cevap `context` alanları, pledge geçerlilik kuralı, `pledges` sorgusuna `includeInvalid`, OP_RETURN kayıt çıktıları admit ediliyor** | **A:** `buildPledge` geçerlilik kuralına uymalı (out1 ≥ `feeSats` → `payScriptHex`, out0 ≥ `ceil(credits×price/N)+1`, `minCredits ≤ credits ≤ N`). **C:** ajanlar `pledges`/`pools` context'ini buna göre okur | ✅ §3.8 |
| 30.10 16:45 | B | **§3.4 `cancelPledge` iptal tx'ini `tm_agentcoop`'a submit etmeli** | Overlay iptali yalnızca submit edilen tx'ten öğrenir | ✅ §3.4 yorum |
| 30.10 17:25 | B | **§3.5 `GET /pools/:id` cevabına `coordinator` alanı** (tur, imzalı/toplam, kara liste nedenleriyle, son tur sonucu); `/healthz` → `engine` | Ajanlar ve UI turun neden düştüğünü görebilsin. Ekleme; mevcut alanlar değişmedi | ✅ §3.5 |
| 30.10 17:05 | B | **§3.2 Settlement sighash notu: teklif `version=1`, `lockTime=0`, in0 `sequence=0xffffffff` ile imzalanır, settlement aynı değerlerle kurulmalı** | SINGLE\|ACP de bu üç alanı imzalıyor. **A:** `signOffer` ve `planSettlement` bu değerleri sabit kullanmalı | ✅ §3.2 |

## Plan değişiklikleri

| Tarih | Track | Faz | Değişiklik | Neden |
|---|---|---|---|---|
| 2026-10-30 | A | 5 (yeni) | Vault'a kilitli kredi çıktısı (`creditLock:'vault'`, `decodeBsv21Owned`, bayraklı `ownerKinds` kuralı) + Lighthouse modu (`SINGLE\|ACP` pledge, mevcut `in i ↔ out i` düzenine oturur, para üstü yok) | FINAL-IDEA §8'deki tek "Açık" non-custodial satırı kapatır; çevrimdışı insan katılımı (benimsenme). S3'ten önce başlamaz; bayrak kapalıyken davranış değişmez. B (topic kuralı bağlama), C (participant-cli lighthouse), D (guard `kind:'redeem'\|'list'`) Faz 5'te etkilenir |
| 2026-10-30 | A | 6 (yeni) | OrdLock listeleri (1Sat Market) + covenant vault araştırması (3 saat zaman kutusu, yalnız rapor) | 1Sat ekosistemine görünürlük/likidite (benimsenme, stack); covenant guard'sız vault için yol haritası. S3'ten önce başlamaz |
| 30.10 16:00 | B | 5 (yeni) | **Faz 5 — Herkese açık yayın** eklendi: VPS, HTTPS (Caddy), alan adı (yoksa sslip.io), CORS, hız sınırı, WS `hello` kimlik kanıtı, `/healthz` + uptime izleme, "kendi ajanınla katıl" kılavuzu. S3'ten sonra başlar | Jüri ve dış ajanlar ürünü yerelde olmadan deneyemiyor (adoption %35, clear demo). `plan/SETUP-ACCOUNTS.md` repoda yok; D'nin yazması bekleniyor |
| 30.10 17:55 | B | 2 | Faz 2.7: **koordinatörün cüzdanı yok**; `WALLET_COORDINATOR_KEY` Faz 5'teki `hello` kimlik kanıtına (ve MessageBox yedeğine) kadar kullanılmıyor. Faz 2.2'deki MessageBox yedeği yapılmadı (WS yeterli) | WS-only turda koordinatörün imzalayacak bir şeyi yok; non-custodial iddia "parası da anahtarı da yok" olarak güçleniyor |
| 30.10 16:15 | B | 1 | Faz 1.1: topic manager pledge coin'lerini ve vault çıktılarını harcayan girdileri de **`coinsToRetain`**'e koymalı | Engine (`@bsv/overlay` 2.6.4 `classifyPreviousCoins`) önceki topic çıktılarından `coinsToRetain`'de olmayanları "stale" sayıp **siliyor**. Kit kuralı yalnızca token girdilerini tutuyor; pledge'ler tutulmazsa settlement/iptal (T4) geçmişi ve Faz 6.3 denetimi kaybolur |
| 30.10 16:00 | B | 6 (yeni) | **Faz 6 — İzinsizlik ve ölçek kanıtı** eklendi: ikinci bağımsız koordinatör, `GET /metrics` (`custodiedSats = 0` zincirden hesaplı), `GET /pools/:id/audit` (sıralama + pledge-list hash'ini yeniden hesaplar), 50+ katılımcılı mainnet settlement (C'nin ajan sürüsüyle). S3'ten sonra; sıra 5 → 6 → 4 | FINAL-IDEA §8 "seçim yetkisi tespit edilebilir" iddiasının ve §11 kapanış rakamlarının kanıtı. **Önerilen arayüz eki (henüz MASTER'a yazılmadı, Faz 6.1'de):** teklif imzasını ayrı bir `OP_RETURN agentcoop offer` tx'iyle zincire yazmak, böylece ikinci koordinatör birinciye bağımlı kalmaz |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ✅ 30.10 16:05 (mockchain) | `tm_agentcoop`, kit kuralları **değişmeden** kabul ediyor. Settlement: in0 sağlayıcı kredi UTXO'su (N=1000, `SINGLE\|ACP\|FORKID`) + 3 pledge coin (`ALL\|FORKID`) → out0 4.500 sat sağlayıcıya, out1–3 kredi 600/300/100, out4–6 para üstü (pledge coin'in kendi script'ine), out7 OP_RETURN settle. STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`; overlay SPV + tüm script'leri doğruladı; lookup'ta her ajan payını görüyor, teklif UTXO'su `spent` + `spendingTxid`. Ek kanıtlar: **(1b)** sağlayıcının SINGLE\|ACP imzası farklı katılımcı/pay/para üstüyle yeniden kurulan planda da geçerli, yani koordinatörün yeniden planlaması (3 tur) yeni sağlayıcı imzası istemiyor; **(1c)** out0 1 sat düşünce imza geçersiz; **(1d)** karışık tx'te enflasyon admit edilmiyor; **(1e)** overlay'in admit etmediği kredi girdisiyle settlement tamamen reddediliyor. Test: `packages/overlay/test/validation1.mixed-settlement.test.ts`. **A için sonuç: `rules.ts` genişletmesi gerekmiyor; FINAL-IDEA §12.2 B planına gerek yok** |
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

- **Faz:** P0 ✅ (16:15) · P1 ✅ mockchain (17:05) · P2 ✅ mockchain (30.10 17:55) → P3 (market/vault indeksi, canlı akış, barındırma). P1/P2'nin mainnet kabulü A.P1 + C.P2 + D (sats) bekliyor
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
- **Devam eden:** B.P3 planı.
- **Bilinen sorunlar:** Kök workspace yok (Blokajlar): iki bağımsız paket, geçici kopyalar (`packages/overlay/src/kit/*`, `src/stub/*`, `test/helpers/mockchain.ts`, `apps/coordinator/src/verifyOffer.ts`), koordinatör overlay'i göreli yolla import ediyor. `test/helpers/{settlement,pool}.ts` yalnızca test için (A'nın builder'ları değil). Typecheck kit gibi `test/`'i kapsamıyor.
- **Diğer track'lerin benden beklediği:**
  - **A (P1):** havuz tx'i: out0 = N kredilik UTXO, OP_RETURN `pool` json'unda `poolId` yok. Pledge tx'i MASTER §3.3 düzeninde ve §3.8 geçerlilik kuralına uygun. İptal tx'i overlay'e submit edilir. Teklif ve settlement `version=1`, `lockTime=0`, in0 `sequence=0xffffffff`. Skeleton: teklifi `POST {COOP_API_URL}/offers`, settlement'ı `tm_agentcoop`'a gönder; `GET /pools/:id` `settled` dönünce S1 tamam. Referans: `packages/overlay/test/helpers/pool.ts`.
  - **C (P1/P2):** havuz keşfi `GET {COOP_API_URL}/pools` (`status`, `pledgedCredits`, `target`, `hasOffer`); canlı akış `WS /ws` `hello { identity, poolIds }`; tipler `packages/overlay/src/views.ts`. **İmza turu (P2):** ajan `hello`'da kendi identity'siyle bağlı kalmalı; `sign_request { poolId, round, plan, yourInputIndex }` gelince A'nın `verifySettlementPlan`'ı ile doğrulayıp `sign_response { poolId, round, inputIndex, unlockingScriptHex }` (SIGHASH_ALL) ya da `sign_reject { poolId, round, reason }` göndermeli; tur zaman aşımı 60 sn. Örnek bot: `apps/coordinator/test/helpers/participant.ts`.
  - **A (P1):** koordinatör `planSettlement` / `assembleSettlement` / `broadcastEF`'i `apps/coordinator/src/protocol.ts` arayüzüyle çağırıyor (`PlanRequest`: offer, havuz tx'i, sıralı pledge'ler + kaynak tx'leri, round, exclude). İmza uyuşmazsa küçük bir adaptör yazılır; şablon girdi sırası in0 = teklif, in1..n = `plan.participants` sırası.
  - **A:** Test 1 sonucu: kit kuralları karışık settlement'ı **değiştirilmeden** kabul ediyor, `rules.ts` genişletmesi gerekmiyor. Settlement'ı overlay'e `X-Topics: ["tm_agentcoop"]` ile submit et (kit `tm_tokenkit`'i yerine). Sağlayıcının SINGLE\|ACP imzası yeniden planlamada geçerli kalıyor (test 1b). `test/helpers/settlement.ts`, A'nın `planSettlement`/`signSettlementInput`'ına referans olarak kullanılabilir.
  - **A/C/D:** Overlay URL'si yerelde `http://localhost:8080`, lookup servisi `ls_agentcoop`. Kredi token deploy'u ve transferleri de bu topic'e gider.

## Track C — Sağlayıcı + Ajanlar

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track D — Vault + Ops + Rail + Teslim

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Cüzdan/fon durumu:** sats talebi: ☐ gönderildi ☐ geldi (miktar: ) · fonlanan cüzdanlar:
- **Axel soruları:** ☐ gönderildi · cevaplar:
