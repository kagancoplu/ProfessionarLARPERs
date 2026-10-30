# Track D — Vault + Guard, Ops (cüzdan/fon), Coop Rail PoC, Teslim (`apps/guard`, `apps/owner-cli`, `scripts/`, `apps/maker`, `contracts/base-htlc`)

> **Rol:** (1) Takımın **operasyonu**: cüzdanlar, anahtarlar, fonlama, Axel iletişimi, `.env`. (2) **Mandate Vault**: script, guard politika motoru, sahip CLI'ı, `VaultSigner`. (3) **Coop Rail PoC**: 4 saatlik zaman kutusu, Base Sepolia. (4) **Teslim**: README, value note, threat model, tx linkleri.
> **Referanslar:** `00-MASTER-PLAN.md §3.7, §6`, `FINAL-IDEA.md §4.9, §4.10, §8, §14`, `agent-spending-vault.md` (threat model taslağı), guide §5, §6.3, §9, §14; kit `client/signer.ts`, `client/payments.ts`.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver:
   > "`plan/00-MASTER-PLAN.md` §3, §4 ve §6'yı, `plan/STATUS.md`'yi ve `plan/track-D-vault-ops-rail.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Bitince Checkpoint'i uygula ve STATUS.md Track D bölümünü güncelle."
2. Özel anahtarlar asla dosyaya/commit'e/log'a yazılmaz. `.env` ve `data/` gitignore'da; AI bunu her fazda kontrol eder.
3. Rail PoC **4 saatte** kesilir; sonuç ne olursa olsun kaydedilir ve Faz 4'e geçilir.

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
- 2.2 Sıcak cüzdan: guard onaylı günlük tavanla vault → ajan `default` basket'ine BRC-29 ödemesi (`context.kind='pay'`, alıcı = ajanın kendisi, tavan `hotWalletDailySats`); C'nin ajanı perakende 402'de bunu kullanır.
- 2.3 Injection senaryosu (C ile): `scripts/demo-injection.ts` → guard 403 `{ reason: 'maxPerPoolSats exceeded' | 'provider not allowed' }`; log satırı jüri için okunabilir.
- 2.4 `test/e2e.vault-settlement.mockchain.test.ts` (A ile ortak) yeşil; mainnet'te vault'lu settlement (A.P3 ile birlikte tek koşu).
- 2.5 Guard README: politika alanları, hangi kontrol hangi tehdidi kapatıyor (FINAL-IDEA §8 ile eşleştir), "guard tek başına fon oynatamaz, sahip her an çeker".

**Kabul:** mainnet'te vault'lu T5 + T10 ve bir 403; S3 D (vault) ✓.

### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** Guard'ın overlay/Arcade bağımlılıkları turu 60 sn'de yetiştiremiyorsa ön-doğrulama (pledge anında) ekle; STATUS.
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** A `htlcLockingScript` iskeletini açtı mı; B `/vaults` sorgusu var mı; C vault'lu ajanı çalıştırdı mı?
4. **Sonraki fazın bağımlılıkları:** Rail PoC için A.P0 `InputSigner`, Base Sepolia RPC + test USDC + ETH (faucet), `maker` cüzdanı 30k sat. Yoksa Faz 3'ü atla, Faz 4'e geç ve STATUS'a "Rail PoC yapılmadı" yaz.
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

### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Test 4/6 FINAL-IDEA §4.10 varsayımlarını çürüttüyse §4.10 ve §8'i güncelle (Rail "trustless değil" veya "kapsam dışı"); STATUS "Plan değişiklikleri".
2. **Bu faz bitti** → STATUS Track D.
3. **Diğer track'ler ne yaptı?** Herkes Faz 4'e yaklaşıyor mu; README bölümlerini istemeye başla.
4. **Sonraki fazın bağımlılıkları:** A/B/C'nin README bölümleri ve txid listeleri.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 4 — Teslim: README, value note, threat model, tx linkleri → S4

**Amaç:** Gönderim zorunlulukları (TBC26 PDF §3) eksiksiz.

**Görevler**
- 4.1 Kök `README.md`: ne yapar (3 paragraf), mimari şema, **Quick start** (`npm install`, `.env`, Desktop, `npm run infra`, `npm run demo`), her app'in bölümü (A/B/C'den gelen metinler), **Example transactions** tablosu (T1–T11, WhatsOnChain/BaseScan linkleri; STATUS "Mainnet işlemleri"nden), **Usage & value note** (FINAL-IDEA §14; "demo pricing" dürüstlüğü), **Non-custodial design & threat model** (FINAL-IDEA §8 tablosu, "Açık" satırları saklanmadan), **What is real vs simulated** (GPU işleri simüle; ödemeler, krediler, settlement, vault gerçek), **Known limitations**, lisans (MIT), BSVA logosu kullanım kurallarına uygun.
- 4.2 `docs/THREAT-MODEL.md`: §8 genişletilmiş; her tehdit için "nerede test ediliyor" (test dosyası adı).
- 4.3 `npm run demo` tek komutun temiz bir makinede çalıştığını doğrula (yeni klon, yeni `.env`, mockchain modu); mainnet modu için gereken adımlar listesi.
- 4.4 Tx link kontrolü: her T tipi için en az bir link açılıyor ve doğru tx'i gösteriyor.
- 4.5 Video için ham malzeme listesi (ekran kayıtları nerede, hangi loglar) — plan değil, envanter.
- 4.6 Axel'in cevapları geldiyse README'ye yansıt (ör. non-custodial değerlendirmesi).

**Kabul:** README'yi hiç görmemiş biri 15 dakikada mockchain demosunu çalıştırabiliyor; zorunlu maddeler (S1–S4 PDF) ✓; S4 ✓.

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği? Son kez STATUS.
2. STATUS Track D: "Tamamlandı"; senkron tablosunda S4 ✓.
3. Açık blokaj kaldı mı? Kaldıysa README "Known limitations"a yaz.
4. Teslim paketi: repo linki, README, tx linkleri, value note — hepsi tek yerde.
