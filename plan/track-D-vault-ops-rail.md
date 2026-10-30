# Track D — Vault + Guard, Ops (cüzdan/fon), Coop Rail PoC, Teslim (`apps/guard`, `apps/owner-cli`, `scripts/`, `apps/maker`, `contracts/base-htlc`)

> **Rol:** (1) Takımın **operasyonu**: cüzdanlar, anahtarlar, fonlama, Axel iletişimi, `.env`. (2) **Mandate Vault**: script, guard politika motoru, sahip CLI'ı, `VaultSigner`. (3) **Coop Rail PoC**: 4 saatlik zaman kutusu, Base Sepolia. (4) **Teslim**: README, value note, threat model, tx linkleri.
> **Referanslar:** `00-MASTER-PLAN.md §3.7, §6`, `FINAL-IDEA.md §4.9, §4.10, §8, §14`, `agent-spending-vault.md` (threat model taslağı), guide §5, §6.3, §9, §14; kit `client/signer.ts`, `client/payments.ts`.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver:
   > "`plan/00-MASTER-PLAN.md` §3, §4 ve §6'yı, `plan/STATUS.md`'yi ve `plan/track-D-vault-ops-rail.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Bitince Checkpoint'i uygula ve STATUS.md Track D bölümünü güncelle."
2. Özel anahtarlar asla dosyaya/commit'e/log'a yazılmaz. `.env` ve `data/` gitignore'da; AI bunu her fazda kontrol eder.
3. Rail PoC **4 saatte** kesilir; sonuç ne olursa olsun kaydedilir ve sıradaki faza geçilir.
4. **Yürütme sırası:** 0 → 1 → 2 → 3 → **5 → 6 → 7** (genişletme) → **4** (teslim). Genişletme fazları **S3 tamamlanmadan başlamaz**. Faz 4 her zaman son fazdır ve asla atlanmaz: teslim saatine **4 saat** kala hangi genişletme fazında olunursa olunsun durulur, nerede kalındığı STATUS'a yazılır ve Faz 4'e geçilir.
5. Ayrıntılı faz planları `plan/phases/D-P<n>.md`'de (kod yazmadan önce yazılır).

---

## Faz 0 — Ops: cüzdanlar, anahtarlar, fonlama, Axel → S0

**Amaç:** Herkesin mainnet'te çalışabilmesi için para ve kimlikler hazır; sats talebi gönderilmiş; Axel'e sorular gitmiş.

**Bağımlılık:** A.P0 repo iskeleti (yoksa `scripts/` bağımsız bir mini paket olarak başlar).

**Görevler**
- 0.1 **Sats talebi (ilk 10 dakika):** `desktop-treasury` Desktop'ında Payments → Receive → BSV Address; adres + takım adı → Telegram `@lexamaison`. STATUS "Cüzdan/fon durumu"na yaz.
- 0.2 **Axel'e sorular:** MASTER §6.4 mesajını gönder. Cevapları STATUS'a.
- 0.3 `scripts/keygen.ts`: 7 adet `PrivateKey.fromRandom().toHex()` basar (yalnızca stdout). `.env.example` MASTER §3.9 ile birebir; `.env`'i doldur, gitignore'u doğrula (`git check-ignore .env data/`).
- 0.4 `scripts/wallets.ts`: `openWallet(name)` → guide §14.2 (Arcade birincil) ile wallet-toolbox cüzdanı, `data/wallets/<name>.sqlite`; `monitor.startTasks()` opsiyonel. `scripts/identities.ts` → `config/identities.json` (public identity key'ler; commit edilir).
- 0.5 `scripts/fund.ts`: Desktop'a `WalletClient('auto', APP_ORIGINATOR)`; her hedef için kit `createBrc29Payment(desktop, targetIdentity, sats)`; hedef aynı makinedeyse `acceptBrc29Payment(targetWallet, payment, new ArcadeChainTracker())`; değilse `data/payments/<name>.json` + `scripts/receive.ts`. Desktop onayları README'de.
- 0.6 `scripts/balances.ts`: her cüzdanın spendable bakiyesi (guide §11 `poolBalance`) + Desktop'lar için `listOutputs` + WhatsOnChain linkleri.
- 0.7 Sats gelince: MASTER §6.1 tablosuna göre fonla (önce 1.000 sat deneme, sonra tam). Fonlanan cüzdanlar STATUS'a.
- 0.8 `docs/OPS.md`: cüzdan envanteri, kim hangi Desktop'ı tutuyor, fonlama adımları, "para bitti" prosedürü, anahtar kasası notu.

**Kabul:** `scripts/balances.ts` tüm cüzdanları gösteriyor; en az `agent-1`, `agent-2`, `provider-api` fonlanmış (S1 için); Axel mesajı gitti; S0 D ✓.

**Çıktılar:** `scripts/{keygen,wallets,identities,fund,receive,balances}.ts`, `scripts/lib/*`, `.env.example`, `config/identities.json`, `docs/OPS.md`, `plan/phases/D-P0.md`.

### ✋ Checkpoint (Faz 0 sonu)
1. **Plan hâlâ iyi mi?** Sats gecikiyorsa herkese "mockchain'de devam, mainnet S1'e kayar" de ve STATUS Blokajlar'a yaz. Desktop Node bağlantısında originator sorunu çıktıysa çözümü STATUS'a (C de aynı yolu kullanacak).
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** A test 2 için 1.000 sat'a ihtiyaç duyuyor; önce onu fonla. B/C hangi cüzdanları ne zaman istiyor?
4. **Sonraki fazın bağımlılıkları:** A.P0 (`InputSigner`, `P2pkhWalletSigner`, `opreturn.ts`). Yoksa Faz 1.1–1.2'yi bağımsız yaz, 1.4'ü beklet.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 1 — Vault script'i, guard, sahip CLI'ı, doğrulama testi 5 → S2 (öncesi)

**Amaç:** Sahip Desktop'tan vault fonlayıp politika yazabilsin; ajan + guard 2-of-2 ile harcayabilsin; sahip tek başına çekebilsin. Mainnet'te üç yol da çalışmış olsun.

**Bağımlılık:** A.P0. (A.P1'e gerek yok; vault harcaması bağımsız test edilir.)

**Görevler**
- 1.1 `packages/core/src/scripts/vault.ts` (A'nın iskeletine sen doldurursun): `vaultLockingScript(ownerPub, agentPub, guardPub)` = `OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`; unlock sahip: `<sig> OP_1`; unlock 2-of-2: `OP_0 <sigAgent> <sigGuard> OP_0`. `unlockingScriptLength` değerleri sabit olarak dışa aktarılır (A'nın ücret hesabı kullanır). OP_RETURN `vault { v, vaultId, owner, agent, guard }` fonlama tx'inde (B indeksler).
- 1.2 Anahtarlar: sahip = Desktop `getPublicKey({ protocolID:[1,'agentcoop vault'], keyID: vaultId, counterparty:'anyone', forSelf:true })`; ajan ve guard = kendi wallet-toolbox cüzdanlarında aynı protokol. **Asla identity key'e kilitleme** (guide §5.1).
- 1.3 `apps/owner-cli` (Desktop): `create-vault --agent <identity> --guard <identity>` (vaultId üret, script'i kur), `fund <vaultId> <sats>` (`createAction`, çıktı basket `agentcoop vault`, customInstructions = protocol/keyID/script), `policy <vaultId> --allow <provider…> --max-pool 5000 --weekly 20000 --max-fee 500 --hot-daily 2000` (guard `PUT /policies/:agent`, `AuthFetch` ile sahip kimliği), `withdraw <vaultId>` (OP_IF dalı: kit `signWalletP2pkhInput` deseniyle ama subscript = vault script; `createAction` + `signAction`), `status` (B `vaults` sorgusu veya kendi basket'i).
- 1.4 `apps/guard`: wallet-toolbox (`WALLET_GUARD_KEY`); `PUT /policies/:agent` (yalnızca kayıtlı sahip identity'si); `POST /cosign` (MASTER §3.7): tx'i AtomicBEEF'ten kur; `inputIndex` vault girdisi mi; `context.kind`'a göre: **`pay`** → çıktı toplamı ≤ `maxPerPoolSats`/`hotWalletDailySats`, alıcı allowlist'te (payScript → provider eşlemesi: overlay `pools`/`offers`'tan), para üstü vault'a, ücret ≤ `maxFeeSats`; **`settle`** → A `verifySettlementPlan` (DvP: kredi çıktısı ajanın adresine, miktar ≥ `expectedCredits`, `verifyLineage: true` A.P2 hazır olunca), + `pay` kontrolleri; **`rail`** → çıktı vault script'i veya pledge coin mi. Haftalık kayan toplam `data/guard/ledger.json`. Geçerse `createSignature({ hashToDirectlySign })` → `signatureHex`; değilse `403 { reason }`. Her karar loglanır.
- 1.5 `VaultSigner` (`packages/core/src/signers/VaultSigner.ts`, A'nın `InputSigner`'ı): ajan imzası (kendi cüzdanı, subscript = vault script, `ALL|FORKID`) + guard `/cosign` → unlocking script. A'nın `signSettlementInput` ve C'nin ajanı bunu kullanır.
- 1.6 **Doğrulama testi 5 (mainnet, 1.000 sat):** `fund` → `pay` yoluyla 2-of-2 harcama (ajan+guard) → `withdraw` sahip yoluyla. Üç txid STATUS'a (T9, T10). Bare multisig/OP_IF miner politikasından geçmezse alternatif: `OP_IF` yerine iki ayrı çıktı tipi? Hayır — önce Arcade `/tx` hata mesajını STATUS'a yaz, A ile konuş.
- 1.7 Test: `test/vault.mockchain.test.ts` — fonla, 2-of-2 harca, sahip çek, guard reddi (allowlist dışı) → imza yok.

**Kabul:** mockchain testi yeşil; mainnet'te üç yol; guard kalkıyor; `VaultSigner` export edilmiş; S2 öncesi D ✓.

**Çıktılar:** `packages/core/src/scripts/vault.ts`, `packages/core/src/signers/VaultSigner.ts`, `apps/guard/*`, `apps/owner-cli/*`, `test/vault.mockchain.test.ts`, `plan/phases/D-P1.md`.

### ✋ Checkpoint (Faz 1 sonu)
1. **Plan hâlâ iyi mi?** Test 5 başarısızsa (politika reddi) FINAL-IDEA §4.9'u ve bu fazı güncelle; STATUS "Plan değişiklikleri". Desktop'ın özel subscript ile imza davranışı A'nın test 2 bulgusuyla uyumlu mu?
2. **Bu faz bitti** → STATUS Track D; `VaultSigner` ve `unlockingScriptLength` değerlerini "Diğer track'lerin benden beklediği"ne yaz.
3. **Diğer track'ler ne yaptı?** A.P2 `verifyLineage` hazır mı (guard `settle` yolu için)? B.P2 koordinatör `signer:'vault'` pledge'lerini planlıyor mu? C.P2 ajan konfigürasyonunda `mode:'vault'` var mı?
4. **Sonraki fazın bağımlılıkları:** A.P2 (`verifyLineage`), A.P3 (`buildPledge(…,'vault')`). Yoksa Faz 2'yi mock plan ile test et.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 2 — Guard'ın settlement entegrasyonu, injection senaryosu, sıcak cüzdan → S3

**Amaç:** Vault'lu ajan koordinatörün turunda guard ile imzalasın; prompt injection'da guard reddetsin; perakende için sıcak cüzdan tavanı çalışsın.

**Bağımlılık:** A.P2/P3, B.P2, C.P2.

**Görevler**
- 2.1 Guard `settle` yolu: `verifySettlementPlan` + `verifyLineage: true`; `expectedCredits` ajanın pledge kaydından; `pay` kontrolleri; haftalık toplam güncelle.
- 2.1b **(D.P1 sonrası eklendi)** Vault'lu pledge tx'i (A.3.1: vault UTXO → out0 pledge coin vault script'ine, out1 ücret → `payScript`, out2 OP_RETURN pledge) guard'a `kind:'pay'` ile gelir. D.P1'in `pay` kuralında pledge coin "vault'a dönen" sayıldığı için `maxPerPoolSats` ancak settlement'ta devreye girer. Injection'ı **pledge anında** durdurmak için: tx `agentcoop pledge` kaydı taşıyorsa out0 pledge coin'i `maxPerPoolSats`'a sayılır, kayıttaki havuzun `terms.provider` ∈ `allowProviders` olmalı ve out1 `payKeyID` ile kanıtlanır (MASTER §3.3 `PoolTerms.payKeyID?`; A doldurmalı). Terms: overlay `{ op:'pool' }` (yalnızca keşif; ödeme kanıtı türetmeyle).
- 2.2 Sıcak cüzdan: guard onaylı günlük tavanla vault → ajan `default` basket'ine BRC-29 ödemesi (`context.kind='pay'`, alıcı = ajanın kendisi, tavan `hotWalletDailySats`); C'nin ajanı perakende 402'de bunu kullanır.
- 2.3 Injection senaryosu (C ile): `scripts/demo-injection.ts` → guard 403 `{ reason: 'maxPerPoolSats exceeded' | 'provider not allowed' }`; log satırı jüri için okunabilir.
- 2.4 `test/e2e.vault-settlement.mockchain.test.ts` (A ile ortak) yeşil; mainnet'te vault'lu settlement (A.P3 ile birlikte tek koşu).
- 2.5 Guard README: politika alanları, hangi kontrol hangi tehdidi kapatıyor (FINAL-IDEA §8 ile eşleştir), "guard tek başına fon oynatamaz, sahip her an çeker".

**Kabul:** mainnet'te vault'lu T5 + T10 ve bir 403; S3 D (vault) ✓.

**Çıktılar:** guard `settle` yolu, sıcak cüzdan akışı, `scripts/demo-injection.ts`, `test/e2e.vault-settlement.mockchain.test.ts` (A ile), `apps/guard/README.md`, `plan/phases/D-P2.md`.

### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** Guard'ın overlay/Arcade bağımlılıkları turu 60 sn'de yetiştiremiyorsa ön-doğrulama (pledge anında) ekle; STATUS.
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** A `htlcLockingScript` iskeletini açtı mı; B `/vaults` sorgusu var mı; C vault'lu ajanı çalıştırdı mı?
4. **Sonraki fazın bağımlılıkları:** Rail PoC için A.P0 `InputSigner`, Base Sepolia RPC + test USDC + ETH (faucet), `maker` cüzdanı 30k sat. Yoksa Faz 3'ü atla, STATUS'a "Rail PoC yapılmadı" yaz; Faz 5 B yolundan gider.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 3 — Coop Rail PoC (zaman kutusu: 4 saat) → S3

**Amaç:** USDC (Base Sepolia) → BSV atomik swap'ın **bir kez** uçtan uca çalıştığını kaydetmek; doğrulama testleri 4 ve 6. Canlı demoda yok. 4 saat dolunca ne varsa belgelenir.

**Bağımlılık:** A.P0; Base Sepolia hesabı (ETH faucet, test USDC veya kendi mock ERC-20'n); `maker` cüzdanı.

**Görevler (sıra önemli; süre bitince kal)**
- 3.1 (30 dk) **Doğrulama testi 4:** mainnet'te 1.000 sat: nLockTime = `height+1` olan tx → Arcade `POST /tx` ne diyor (non-final reddi beklenir) → bir blok sonra kabul. Zaman tabanlı (şimdi+15 dk) ikinci tx: kabul anı vs header zamanı (MTP gözlemi). Sonuç STATUS.
- 3.2 (20 dk) **Doğrulama testi 6:** Chronicle spec'inden v1 işlem kuralları (LOW_S vb.) özeti; mümkünse high-S imzalı v1 tx reddini gözlemle. Sonuç STATUS.
- 3.3 (60 dk) `contracts/base-htlc/HTLC.sol`: `lock(hash, receiver, token, amount, timeout)`, `claim(secret)`, `refund()`; Foundry veya Hardhat testleri; Sepolia'ya deploy; adres `.env`.
- 3.4 (60 dk) BSV tarafı: `htlcLockingScript(hash, agentPub, guardPub, makerPub)` (FINAL-IDEA §4.10 script'i); `apps/maker`: teklif → ajan Base'de lock → maker funding tx (v1) kurar, ajan iade tx'ini (`nLockTime = height+k`, ELSE dalı) imzalar → maker yayınlar → ajan + guard claim (`context.kind='rail'`, çıktı pledge coin veya vault) → maker secret ile Base `claim`.
- 3.5 (30 dk) Kayıt: BSV txid'leri (T11) + BaseScan linkleri (T11b) STATUS'a; `docs/RAIL-POC.md`: ne çalıştı, ne çalışmadı, varsayımlar (yükseklik tabanlı iade, v1), açık maddeler (ters yön yok, maker envanteri).
- 3.6 Süre bitti → dur. Başarılı olmadıysa README'de "experimental, not in demo" ve FINAL-IDEA §12.2'deki B planı notu.

**Kabul:** `docs/RAIL-POC.md` var; test 4 ve 6 sonuçları STATUS'ta; zaman kutusu aşılmadı.

**Çıktılar:** `contracts/base-htlc/*`, `packages/core/src/scripts/htlc.ts`, `apps/maker/*`, `docs/RAIL-POC.md` (sonunda açık bir **"Sonuç: başarılı / başarısız"** satırı; Faz 5'in hangi yoldan gideceğini bu satır belirler), `plan/phases/D-P3.md`.

### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Test 4/6 FINAL-IDEA §4.10 varsayımlarını çürüttüyse §4.10 ve §8'i güncelle (Rail "trustless değil" veya "kapsam dışı"); STATUS "Plan değişiklikleri".
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** S3 tamamlandı mı (genişletme fazları ancak o zaman başlar)? Herkes teslime yaklaşıyor mu; README bölümlerini şimdiden iste.
4. **Sonraki fazın bağımlılıkları:** S3 ✓; `docs/RAIL-POC.md` sonuç satırı (Faz 5 A mı B mi). S3 yoksa genişletme başlamaz: D'nin S3 maddelerine yardım et veya Faz 4'ün bağımsız kısımlarını (4.2 iskeleti) hazırla.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

> **Genişletme fazları (5, 6, 7).** Neden var: jüri ağırlıklarında benimsenme %35, teknik + non-custodial %20. Faz 5 "başka zincirden likidite ve kullanıcı" iddiasını gerçek paraya bağlar (veya vault'u sahipler için bir ürüne çevirir); Faz 6 "neden BSV" ve "non-custodial" iddialarını ölçüme ve saldırı testlerine bağlar; Faz 7 vault'u AgentCoop dışındaki her ajana açar. **S3 tamamlanmadan hiçbiri başlamaz.** Her birinin zaman kutusu var; süre dolunca sonuç yazılır ve sıradakine geçilir. Teslime 4 saat kala nerede olunursa olunsun Faz 4'e geçilir.

---

## Faz 5 — Tam Coop Rail (A yolu) **veya** vault'u filo ve politika şablonlarıyla genişletme (B yolu) · zaman kutusu: A 5 saat, B 3 saat

**Amaç:** **A yolu** (Rail PoC başarılıysa): Coop Rail'i iki yönlü, envanteri yöneten ve Base **mainnet**'te gerçek USDC ile bir kez çalışmış bir ürüne çevirmek. Böylece "başka zincirden likidite ve kullanıcı getiriyor" iddiası gerçek parayla kanıtlanmış olur. **B yolu** (PoC başarısızsa): Mandate Vault'u, bir sahibin birden fazla ajanı hazır politika şablonlarıyla yönettiği bir ürüne çevirmek.

**Bağımlılık:** S3 ✓. Yol seçimini `docs/RAIL-POC.md`'deki sonuç satırı belirler. A yolunun başarı koşulu: doğrulama testleri 4 ve 6 olumlu **ve** Sepolia'da bir ileri yön swap'ı uçtan uca (T11 + T11b) tamamlanmış. A yolu için ayrıca: Base mainnet EVM adresleri fonlanmış (SETUP-ACCOUNTS #19–20), maker cüzdanı ≥ 30k sat.

**Görevler — A yolu (tam Coop Rail)**
- 5.A1 **Ters yön (BSV → USDC).** Sırrı ajan tutar ve ilk kilitleyen odur, iade süresi bu yüzden uzundur. BSV HTLC script'i: `OP_IF OP_SHA256 <h> OP_EQUALVERIFY <makerPub> OP_CHECKSIG OP_ELSE OP_2 <makerPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`. Claim dalı: maker, s ile. İade dalı: maker ve guard, fonlamadan **önce** iade tx'ini ön imzalar (`nLockTime = H + k_uzun`, çıktısı vault script'i). Ajan iade dalında yer almaz, bu yüzden iadeyi başka yere yönlendiremez. Akış: (1) iade ön imzası → (2) ajan + guard vault'tan HTLC'yi fonlar → (3) maker Base'de USDC'yi kilitler (`receiver` = sahibin izinli EVM adresi, `T_base_kısa`) → (4) ajan Base'de `claim(s)` çağırır ve s açığa çıkar → (5) maker s ile BSV'yi alır. Zaman payı: `T_base_kısa` ≪ `k_uzun` blok (örn. 45 dk'ya karşı 18 blok); seçim ve gerekçe `D-P5.md`'de.
- 5.A2 **Guard `rail` bağlamını ikiye ayır:** `rail-in` (mevcut claim kontrolü) ve `rail-out`. `rail-out` şunları kontrol eder: maker `allowMakers` listesinde mi, tutar ≤ `railMaxSats` mi, ön imzalı iade tx'i vault script'ine ödüyor ve `nLockTime` politikaya uyuyor mu, teklifteki Base `receiver` `railEvmRecipients` içinde mi. Kapattığı tehdit: ele geçirilmiş ajanın USDC'yi kendi adresine çıkarması. Politika alanları **MASTER §3.7'ye** eklenir ve STATUS → "Arayüz değişiklikleri"ne yazılır.
- 5.A3 **Maker envanter dengelemesi** (`apps/maker/src/inventory.ts`): BSV bakiyesi (wallet-toolbox) ve USDC bakiyesi (Base RPC) izlenir. Fiyat iki herkese açık kaynaktan alınır ve bir sapma bandıyla kontrol edilir. Teklif = orta fiyat ± (taban spread %1,5 + dengesizlikle orantılı kayma). Envanter eşiğin altına düşen yön otomatik durur. `GET /quote?dir=&amount=` sonucu 60 sn geçerlidir ve `minOut` içerir. İleri yön BSV harcayıp USDC kazandırır, ters yön tersini yapar; böylece envanter iki yönlü akışla kendiliğinden dengelenir. Elle müdahale `scripts/maker-report.ts` ile görünür olur.
- 5.A4 **Base mainnet:** `HTLC.sol` mainnet'e deploy edilir ve BaseScan'de doğrulanır. Her yönde **bir** gerçek swap yapılır ($1–2 USDC). Önce tek seferlik ≤ $0,50'lık bir deneme. Txid'ler ve BaseScan linkleri STATUS'a (T11, T11b, T12 = ters yön).
- 5.A5 **Testler:** iki yön için `test/rail.mockchain.test.ts` (BSV tarafı mockchain'de, Base tarafı süreç içi sahte HTLC durumu); Foundry testleri (claim, refund, zaman aşımı, yanlış preimage, yeniden claim); guard `rail-out` red testleri (izin listesi dışı maker, izin listesi dışı EVM alıcısı, vault'a ödemeyen iade).
- 5.A6 `docs/RAIL.md` (RAIL-POC'un yerini alır): iki yön, zaman payları, maker ekonomisi, kalan riskler (maker canlılığı, fiyat kaynağı). README'de etiket "experimental" → "beta, mainnet'te küçük tutarlarla test edildi".

**Görevler — B yolu (vault: filo + politika şablonları)**
- 5.B1 **Filo:** `owner-cli create-fleet --agents a1,a2,a3 --template research`. Her ajana ayrı vaultId ve vault verilir. Desktop onayı tek `createAction`'da (N çıktı) alınır.
- 5.B2 **Sahip düzeyinde toplam tavan:** guard politikasına `ownerWeeklyCapSats` eklenir; aynı sahibin bütün ajanlarının haftalık toplamı bu tavanı geçemez (ledger sahip bazında). Kapattığı tehdit: N ajanın her biri kendi tavanının altında kalarak toplamda bütçeyi aşması. MASTER §3.7 güncellenir.
- 5.B3 **Politika şablonları:** `apps/guard/templates/{conservative,research,procurement}.json` ve `owner-cli policy --template <ad> [--override …]`. Uygulamadan önce farkı gösterir. Şablonlar şemayla doğrulanır.
- 5.B4 **Acil durdurma:** `owner-cli pause <agent|all>` guard'ın o sahibin ajanlarına imzayı **anında** kesmesini sağlar (zincirde işlem yok, sahip imzasıyla). `owner-cli withdraw-all` bütün vault UTXO'larını tek tx'te OP_IF dalından çeker.
- 5.B5 **Politika taahhüdü (şeffaflık):** fonlama tx'inin `OP_RETURN vault` kaydına `policyHash` eklenir. Guard, yüklü politikanın hash'i sahibin zincirdeki son taahhüdüyle eşleşmiyorsa imzalamaz. Böylece sahip guard'ın hangi politikayı uyguladığını kanıtlayabilir. B'ye bildirilir (OP_RETURN alanı), STATUS'a yazılır.
- 5.B6 **Testler:** filo toplam tavanı, durdurma, şablon doğrulama, politika hash'i uyuşmazlığında red. Mainnet'te 3 ajanlı bir filo fonlaması ve `withdraw-all`.

**Kabul:** *A yolu:* Base mainnet'te iki yönde birer swap ve BSV tarafındaki txid'ler STATUS'ta; testler yeşil; `docs/RAIL.md` var. *B yolu:* mainnet'te filo fonlaması + `withdraw-all`; toplam tavan ve durdurma testleri yeşil; şablonlar README'de. Her iki yolda zaman kutusu aşılmamış.

**Çıktılar:** *A:* `packages/core/src/scripts/htlc.ts` (ters yön), `apps/maker/src/{inventory,quote}.ts`, `contracts/base-htlc` mainnet deploy'u, `test/rail.mockchain.test.ts`, `docs/RAIL.md`. *B:* `apps/owner-cli` filo komutları, `apps/guard/templates/*`, ledger'da sahip toplamı, testler. Her ikisinde de `plan/phases/D-P5.md`.

### ✋ Checkpoint (Faz 5 sonu)
1. **Plan hâlâ iyi mi?** A yolunda ters yön mainnet'te başarısız olduysa nedenini `docs/RAIL.md`'ye yaz ve README etiketini "experimental" bırak. Policy alanları değiştiyse MASTER §3.7'yi güncelle. STATUS "Plan değişiklikleri".
2. **Bu faz bitti** → STATUS Track D (Base adresleri, BaseScan linkleri, harcanan USDC/ETH dahil).
3. **Diğer track'ler ne yaptı?** C'nin ajanları ters yönü veya filo modunu kullanabilir mi; B `vault` OP_RETURN'deki `policyHash`'i indeksliyor mu?
4. **Sonraki fazın bağımlılıkları:** Faz 6, A'nın settlement builder'larına (S1'den beri var) ve B'nin koordinatörüne (griefing testleri) dayanır. Ölçek testi için ek sats (Axel). Gelmediyse mainnet ölçümü N=10 ile yapılır.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 6 — Maliyet benchmark raporu + saldırı test paketi · zaman kutusu: 4 saat

**Amaç:** Pitch'in iki iddiasını **ölçüme ve teste** bağlamak. (1) "N katılımcılı bir havuz BSV'de tek bir ucuz işlemdir, EVM'de ise N deposit + N refund demektir." (2) "Hiçbir taraf tek başına fonu oynatamaz." Bu ikincisi FINAL-IDEA §8'in her satırını karşılayan bir saldırı testiyle gösterilir. Faz 4'teki `docs/THREAT-MODEL.md` buradan beslenir.

**Bağımlılık:** S3 ✓; A'nın `planSettlement`/`assembleSettlement`'ı, B'nin koordinatörü (griefing), guard (D.P2). Ölçek testi için +250k sat (SETUP-ACCOUNTS §5). Foundry (#13). Base Sepolia ETH.

**Görevler — benchmark**
- 6.1 **BSV ölçümü** (`scripts/bench/bsv-settlement.ts`): A'nın builder'larıyla mockchain'de N ∈ {2, 5, 10, 20, 50, 100} katılımcılı settlement'lar kurulur. Her biri için bayt, girdi/çıktı sayısı ve Arcade `/health`'ten okunan sat/kB ile ücret kaydedilir. **Mainnet'te bir kez N=50** (50 geçici wallet-toolbox ajanı, kişi başı ~5k sat; ek sats gelmezse N=10). Txid STATUS'a yazılır. Ölçüm tarihi ve BSV/USD kuru kaydedilir.
- 6.2 **EVM karşılaştırması** (`contracts/pool-escrow/PoolEscrow.sol`): referans "hedefe kadar topla, sonra öde ya da iade et" emanet kontratı. Katılımcı başına `approve` + `deposit` yapılır; başarıda tek `settle` (sağlayıcıya öde + katılımcılara kredi ver), başarısızlıkta katılımcı başına `refund`. Foundry `--gas-report` ile N'e göre gaz modeli çıkarılır. Model, **Base Sepolia'da N=5 gerçek koşuyla** doğrulanır. Gaz fiyatları Base mainnet ve Ethereum L1 için anlık alınır (Base'de L1 veri ücreti `GasPriceOracle.getL1Fee` ile). Kur anlık ve zaman damgalıdır.
- 6.3 **Rapor** (`docs/BENCHMARK.md` + `scripts/bench/report.ts` ile üretilen tablo ve grafik): N'e göre (a) toplam ücret (BSV tek tx / Base başarı / Base başarısızlık / ETH L1), (b) işlem sayısı, (c) **emanette geçen süre** (EVM: ilk deposit'ten settle/refund'a kadar; BSV: 0), (d) başarısız havuzun katılımcıya maliyeti (BSV: 0 + iadesiz kayıt bedeli; EVM: deposit + refund gazı). "Ölçülen" ve "modellenen" değerler ayrı işaretlenir, varsayımlar yazılır.

**Görevler — saldırı test paketi** (`test/attacks/*.test.ts`; her dosyanın başında `// THREAT: FINAL-IDEA §8 "<satır>"` etiketi)
- 6.4 `fake-credit` → "Sahte kredi" + "Koordinatör sahte krediyi geçerli gösteriyor": plana sahte BSV-21 girdisi koyulur. Beklenen: `verifySettlementPlan(…, { verifyLineage: true })` hata fırlatır, guard `/cosign` 403 döner.
- 6.5 `coordinator-tamper` → "Koordinatör çalmaya çalışıyor": imzalar toplandıktan sonra bir para üstü çıktısı değiştirilir. Beklenen: `ALL` imzaları geçersiz olur, script doğrulaması düşer, yayın reddedilir.
- 6.6 `griefing` → "Katılımcı lock-in'de kaçıyor": bir katılımcı imzalamaz, bir diğeri pledge coin'ini tur ortasında harcar. Beklenen: tur düşer, outpoint kara listeye girer, bekleme listesinden tamamlanır, en fazla 3 tur denenir.
- 6.7 `prompt-injection` → "Ajan prompt injection'a uğruyor": enjekte edilmiş talimat bütçenin %100'ünü ister ve allowlist dışı bir sağlayıcıya yönelir. Beklenen: iki ayrı 403 (`maxPerPoolSats`, `provider not allowed`), zincirde hiçbir şey olmaz.
- 6.8 `guard-bypass` → "Guard ele geçiriliyor" / "Coop Rail claim'i vault politikasını atlıyor" / "Ajan ve guard birlikte": (a) ajan tek başına vault'u harcamaya çalışır → script düşer; (b) guard tek başına → düşer; (c) para üstü vault'a dönmüyor → 403; (d) ücret > `maxFeeSats` → 403; (e) havuz tavanının altında kalan parçalı ödemelerle haftalık tavan aşılmaya çalışılır → 403; (f) aynı `/cosign` isteği tekrar oynatılır → ledger idempotent, çift sayım yok; (g) `inputIndex` veya subscript uyuşmazlığı (guard sighash'i kendisi hesaplar) → 403; (h) rail claim'i vault dışı bir çıktıya → 403; (i) guard kapalıyken sahip yine de çekebilir → başarılı.
- 6.9 `replay-402` → "402 tekrar oynatma": kit'in testinden türetilir (409).
- 6.10 `blind-sign` → "BRC-100 kör hash imzası": istemci tarafındaki DvP doğrulayıcı kötü planı reddeder; `agentcoop` basket'inde en fazla 1 aktif pledge bulunur.
- 6.11 `scripts/threat-matrix.ts`: etiketleri tarayıp "Tehdit → test dosyası → son sonuç" tablosunu üretir (Faz 4.2'deki `docs/THREAT-MODEL.md`'ye girer). Başka bir track'in kodu bir testi geçemezse D o kodu **değiştirmez**: STATUS → Blokajlar'a ilgili track adıyla yazar.
- 6.12 **Mainnet kanıtı:** ajanın tek başına vault harcama denemesi Arcade'e gönderilir ve red mesajı kaydedilir; guard'ın 403 log satırı kaydedilir. İkisi de README'deki threat model bölümüne girer.

**Kabul:** `docs/BENCHMARK.md` en az bir mainnet ölçümü (BSV) ve bir Sepolia ölçümü (EVM) içeriyor; `test/attacks/` yeşil (ya da kırmızılar STATUS'ta sahibine atanmış); FINAL-IDEA §8'deki her "Kapalı" satırın en az bir testi var; zaman kutusu aşılmamış.

**Çıktılar:** `scripts/bench/*`, `contracts/pool-escrow/*`, `docs/BENCHMARK.md`, `test/attacks/*`, `scripts/threat-matrix.ts`, `plan/phases/D-P6.md`.

### ✋ Checkpoint (Faz 6 sonu)
1. **Plan hâlâ iyi mi?** Ölçümler pitch'teki bir rakamı çürüttüyse (örn. settlement ücreti, FINAL-IDEA §4.4'teki "birkaç yüz sat") FINAL-IDEA'yı ve value note taslağını düzelt; STATUS "Plan değişiklikleri".
2. **Bu faz bitti** → STATUS Track D (benchmark txid'leri, kırmızı testler ve sahipleri).
3. **Diğer track'ler ne yaptı?** Kırmızı saldırı testlerini sahipleri aldı mı?
4. **Sonraki fazın bağımlılıkları:** Faz 7 için guard + sıcak cüzdan (D.P2), sağlayıcı API (C). Yoksa Faz 7'yi atla.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 7 — (D'nin önerisi) Vault'u her ajana aç: MCP server + `VaultFetch` · zaman kutusu: 3 saat

**Neden eklendi:** Mandate Vault bugün yalnızca AgentCoop'un kendi ajanlarının içinde. Oysa "sahibinin kontrol ettiği bir BSV bütçesi", 402 ödeyen **her** ajanın ihtiyacı. Vault'u bir MCP server olarak paketlemek, Claude Desktop, Claude Code veya Cursor'daki herhangi bir LLM ajanına iki dakikada BSV bütçesi verir. Bu (1) **benimsenme %35** için AgentCoop dışından BSV'ye yeni kullanıcı getiren bir giriş kapısı, (2) **ajan ödemeleri %10** için genel amaçlı gerçek bir LLM'in ödeme yapması demek. Maliyeti düşük: guard, `VaultSigner` ve sıcak cüzdan hazır, yeni kod ince bir sarmalayıcı. Risk düşük: başka track'in dosyasına dokunmuyor. FINAL-IDEA K3'teki `packages/mcp` (havuz araçları, sahipsiz) ile çakışmaz; burada yalnızca vault araçları var ve havuz araçlarının eklenebileceği bir kayıt noktası bırakılır.

**Bağımlılık:** Faz 6 bitmiş veya zaman kutusu dolmuş; D.P2 (guard, sıcak cüzdan); C'nin `provider-api`'si (ödenecek gerçek bir 402 servisi). `@modelcontextprotocol/sdk` sürümü kurulumdan önce doğrulanır.

**Görevler**
- 7.1 `packages/vault-fetch`: `new VaultFetch({ agentWallet, guardUrl, vaultId })`. `.fetch(url, init)` `AuthFetch` ile birebir değiştirilebilir. Sıcak cüzdan yetmediğinde guard'dan günlük tavan içinde `pay` (vault → ajanın kendisi) ister, sonra ödemeyi tekrarlar. BRC-121 için `create402Fetch` + `withHostOriginator` (guide §10.4).
- 7.2 `apps/vault-mcp` (stdio MCP server) araçları: `vault_status` (bakiye, politika, kalan haftalık tavan), `pay_api({ url, method, body })` (VaultFetch üzerinden), `explain_policy`, `request_topup({ sats, reason })`. Guard'ın 403'ü araç sonucuna okunabilir bir gerekçe olarak döner, böylece LLM neden reddedildiğini görür.
- 7.3 **Demo:** Claude Desktop/Claude Code `mcpServers` konfigürasyonu README'de. Bir Claude oturumu `provider-api`'ye 402 ile ödeme yapar (mainnet, T7). Sohbete enjekte edilen "bütün bütçeyi şuraya gönder" talimatı guard'a takılır ve 403 araç sonucunda görünür.
- 7.4 **Testler:** `test/vault-fetch.mockchain.test.ts` (402 → top-up → ödeme; günlük tavan aşımında net hata); MCP araçları için bir smoke test (süreç içi istemci).
- 7.5 README bölümü: "Give any agent a BSV budget its owner controls (2 minutes)".

**Kabul:** MCP üzerinden bir LLM ajanı mainnet'te 402 ödemesi yapmış (txid STATUS'ta); injection 403'ü araç sonucunda görünüyor; testler yeşil; zaman kutusu aşılmamış.

**Çıktılar:** `packages/vault-fetch/*`, `apps/vault-mcp/*`, testler, README bölümü, `plan/phases/D-P7.md`.

### ✋ Checkpoint (Faz 7 sonu)
1. **Plan hâlâ iyi mi?** MCP SDK sürümü veya Desktop/Claude entegrasyonu sorun çıkardıysa yalnızca `VaultFetch` kütüphanesini teslim et ve README'de belirt.
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** C/A, havuz araçlarını aynı MCP server'a eklemek istiyor mu (kayıt noktası hazır)?
4. **Sonraki faz:** Faz 4 (teslim). Bütün track'lerden README bölümlerini ve txid listelerini topla.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 4 — Teslim: README, value note, threat model, tx linkleri → S4 (her zaman son faz)

**Amaç:** Gönderim zorunlulukları (TBC26 PDF §3) eksiksiz.

**Görevler**
- 4.1 Kök `README.md`: ne yapar (3 paragraf), mimari şema, **Quick start** (`npm install`, `.env`, Desktop, `npm run infra`, `npm run demo`), her app'in bölümü (A/B/C'den gelen metinler), **Example transactions** tablosu (T1–T11, WhatsOnChain/BaseScan linkleri; STATUS "Mainnet işlemleri"nden), **Usage & value note** (FINAL-IDEA §14; "demo pricing" dürüstlüğü), **Non-custodial design & threat model** (FINAL-IDEA §8 tablosu, "Açık" satırları saklanmadan), **What is real vs simulated** (GPU işleri simüle; ödemeler, krediler, settlement, vault gerçek), **Known limitations**, lisans (MIT), BSVA logosu kullanım kurallarına uygun.
- 4.2 `docs/THREAT-MODEL.md`: §8 genişletilmiş; her tehdit için "nerede test ediliyor" (test dosyası adı; Faz 6 yapıldıysa `scripts/threat-matrix.ts` çıktısı). Faz 6 yapıldıysa README'nin "Why BSV" kısmı `docs/BENCHMARK.md`'deki ölçülmüş rakamlara bağlanır; yapılmadıysa yalnızca FINAL-IDEA §4.4'teki tahmin "estimate" etiketiyle kullanılır.
- 4.3 `npm run demo` tek komutun temiz bir makinede çalıştığını doğrula (yeni klon, yeni `.env`, mockchain modu); mainnet modu için gereken adımlar listesi.
- 4.4 Tx link kontrolü: her T tipi için en az bir link açılıyor ve doğru tx'i gösteriyor.
- 4.5 Video için ham malzeme listesi (ekran kayıtları nerede, hangi loglar) — plan değil, envanter.
- 4.6 Axel'in cevapları geldiyse README'ye yansıt (ör. non-custodial değerlendirmesi).

**Kabul:** README'yi hiç görmemiş biri 15 dakikada mockchain demosunu çalıştırabiliyor; zorunlu maddeler (S1–S4 PDF) ✓; S4 ✓.

**Çıktılar:** kök `README.md`, `docs/THREAT-MODEL.md`, value note (README bölümü), tx link tablosu, video malzeme envanteri, `plan/phases/D-P4.md`.

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği? Son kez STATUS.
2. STATUS Track D: "Tamamlandı"; senkron tablosunda S4 ✓.
3. Açık blokaj kaldı mı? Kaldıysa README "Known limitations"a yaz.
4. Teslim paketi: repo linki, README, tx linkleri, value note — hepsi tek yerde.
