# D-P2 — Guard'ın settlement yolu, pledge farkındalığı, sıcak cüzdan, injection senaryosu (ayrıntılı plan)

> Track D · Faz 2 · hedef senkron **S3** · yazıldı: 2026-10-30 18:40 (kod öncesi), sonuçlar §11'de (18:50)
> Üst plan: `plan/track-D-vault-ops-rail.md` Faz 2 (2.1, 2.1b, 2.2, 2.3, 2.4, 2.5) · Arayüzler: `00-MASTER-PLAN.md §3.2, §3.3, §3.4 (verifySettlementPlan, planTransaction, verifyLineage), §3.7` · Fikir: `FINAL-IDEA.md §4.9, §8, §11` · Önceki faz: `plan/phases/D-P1.md` (G1–G13)

---

## 1. Amaç ve "bitti" tanımı

Vault'lu bir ajan koordinatörün imza turunda **guard ile birlikte** imzalasın; guard settlement'ı koordinatöre ve overlay'e güvenmeden kendisi doğrulasın (DvP + kredi soyu). Prompt injection'a uğramış ajanın "bütçenin %100'ünü X'e yatır" girişimi **pledge anında** reddedilsin ve hiçbir şey hareket etmesin. Perakende 402 için guard'ın günlük tavanıyla ajanın sıcak cüzdanına (`default` basket) para aktarılabilsin.

**Kabul kanıtı** (STATUS Track D'ye yazılır):
- Kök `npm test` yeşil; yeni: `test/e2e.vault-settlement.mockchain.test.ts` (B'nin gerçek overlay'i + koordinatör turu + A'nın `planSettlement`/`verifySettlementPlan`/`verifyLineage`'i + guard HTTP), `apps/guard/test/*` (settle/pledge/sıcak cüzdan birim testleri), `test/vault.mockchain.test.ts` (sıcak cüzdan + `relinquishOutput`). `npm run typecheck` temiz.
- `npx tsx --import @agentcoop/core/register-sdk scripts/demo-injection.ts` (mockchain) iki okunur red satırı ve bir izin satırı basar, hiçbir red yayın üretmez.
- Mainnet (sats + Node 24 laptop gelince, ≤ 1.000 sat ilk deneme): vault'lu pledge (T3v) + vault'lu settlement (T5 + T10) A.P3 ile tek koşu, bir guard 403. *Bu bulut oturumunda yok (§2).*

---

## 2. İnsan adımları

| # | Adım | Kim | Ne zaman | Not |
|---|---|---|---|---|
| H1 | D-P1 H1–H4 (sats, F1, treasury Desktop teyidi) | D-P0 insanları | mainnet'ten önce | Değişmedi (STATUS Blokajlar) |
| H2 | Treasury laptopunda **Node 24** (24.13 ✓). Çalışma zamanı `tsx --import @agentcoop/core/register-sdk`; Node 22.22'de hook kırık (§3) | treasury sahibi | her `npm run guard/owner/validation5` | `npm run …` script'leri hook'u zaten ekliyor |
| H3 | Doğrulama testi 5 (`npm run validation5 -w @agentcoop/guard`) | treasury sahibi | sats + F1 sonrası | D-P1 §9.3; artık köprü engeli yok (Node 24) |
| H4 | Mainnet vault'lu settlement: guard (`npm run guard`), overlay + koordinatör (`node infra/run.mjs`), sahip `owner-cli` (vault + politika + fonla), C/A'nın vault'lu ajanı | D + A + C | A.P3 + C.P3 sonrası | ≤ 1.000 sat ilk deneme; havuz küçük (ör. N=10, P=500) |
| H5 | Demo kaydı: `scripts/demo-injection.ts` çıktısı ekranda | D | Faz 4 (video) | Mockchain modunda sats gerekmez |

---

## 3. Bağımlılıkların durumu (18:30, `main` @ 81c2bf6 birleştirildi)

| Bağımlılık | Durum | Etki / geçici çözüm |
|---|---|---|
| A.P2 `verifySettlementPlan`, `planTransaction`, `verifyLineage`, `receivePkh`, `pledgeAmount` | ✅ `main`'de | Guard `settle` yolu bunları doğrudan çağırır |
| A.P3 `buildPledge(…,'vault')` | ✗ (`NOT_IMPLEMENTED`) | D, guard'ın 2.1b kuralına uyan **referans** akışı `pledgeFromVault` (`packages/core/src/signers/VaultSigner.ts`, D'nin dosyası) yazar; A.3.1 `buildPledge(…,'vault')`'u buna devredebilir. Test ve demo bununla |
| B.P2 koordinatör vault pledge'lerine `sign_request` | ✅ genel: B imzaları `Spend` ile doğruluyor, planlamayı A yapıyor (vault unlock = A'nın `VAULT_UNLOCKING_SCRIPT_LENGTH` = 150 = D'nin değeri) | e2e testi B'nin gerçek koordinatörüyle koşar |
| C.P3 `mode:'vault'` ajan | ✗ (C P1'de) | Injection demosu bağımsız (mockchain, kural tabanlı "itaatkâr ajan"); C'ye API duyurulur |
| SDK çalışma zamanı köprüsü | ✅ **Node 24'te**: C'nin `packages/core/register-sdk.mjs` hook'u (MASTER §3.1). `npm run guard` Node 24.22 + hook ile kalktı (`/healthz` 200, boş `/cosign` 400, kimliksiz `PUT` 401); owner-cli ve `scripts/balances.ts` yükleniyor. ✗ **Node 22.22'de**: hook'un `load` zinciri CJS modüllerinde (`wallet-toolbox/out/src/index.js`, `express`) `source: undefined` döndürüyor → `ERR_INVALID_RETURN_PROPERTY_VALUE` (C'nin `npm run provider`'ı da) | D'nin `package.json` script'leri hook'u ekliyor; Node 24 kullan. Blokaj → C (hook sahibi), kök `engines` (A) `>=22` diyor |
| Mainnet sats | ✗ | Mockchain; mainnet adımları hazır, koşulmuyor |
| Track E istekleri (18:40, başka bir oturum `trackD`'ye yazdı; MASTER §3.7/§3.10) | D.P2'ye alındı | `GET /policies/:agent`, `GET /decisions`, `GET /events` (SSE, `CoopEvent`), CORS + `x-bsv-auth-*` expose. `vault-ops.ts` node importsuz kalmalı (zaten öyle) |

---

## 4. Tasarım kararları

1. **Guard settlement tx'ini kendisi kurar.** `kind:'settle'` isteğinde `plan` zorunlu, tx = `planTransaction(plan)` (A); `txBEEF` yok sayılır (VaultSigner settle'da göndermez). Ajan da aynı `planTransaction(plan)`'ı imzalar (`signSettlementInput`), sighash'ler aynı.
2. **Teklif ve terms zincir verisinden, koordinatörden değil.** Şablonun girdi 0'ının kaynak tx'i = A'nın reserve tx'i (`buildReserveAndAnnounce`: out0 teklif UTXO'su, sonra `OP_RETURN pool { terms − poolId, nonce }`). G1 bu tx'in txid'ini girdi 0'ın prevout'una bağlar, yani **kayıt değiştirilemez**. Guard `terms = kayıt − nonce + poolId` ve `offer = { poolId, unlockingScriptHex: girdi 0'ın script'i, lockingScriptHex/satoshis: kaynak çıktı, terms }` kurar; `GET /offers/:poolId`'e (koordinatör) ve overlay'e güvenmez. Koordinatör farklı terms kullandıysa `termsHash` uyuşmaz → `verifySettlementPlan` reddeder.
3. **Sağlayıcı kanıtı üç parçalı** (allowlist anlamlı olsun diye): (a) `terms.provider ∈ allowProviders`; (b) `terms.payScriptHex == providerPayScript(provider, nonce)` (ödeme sağlayıcının gelir anahtarına, MASTER §3.2); (c) teklif UTXO'sunun BSV-21 sahibi = `anyonePkh(provider, 'offer <nonce>', [1,'agentcoop provider'])` → teklif imzasını yalnızca o sağlayıcı atabilir. Böylece biri kayıtta "sağlayıcı = X" yazıp sahte token'la havuz açsa bile (c) ve teklif imzası düşer.
4. **Beklenen kredi pledge kaydından.** Vault girdisinin kaynak tx'i = pledge tx'i; `OP_RETURN pledge` kaydı → `expectedCredits = record.credits`, `expectedCreditPkh = receivePkh(agent, tokenIndex)` (A'nın kit'i), `record.participant == agent`, `record.signer == 'vault'`, `record.poolId == plan.poolId`. İstekteki `context.expectedCredits`/`tokenId` yalnızca ajanın niyetini çapraz kontrol eder (farklıysa red); güvenilen kaynak zincir.
5. **`verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, expectedCreditPkh, maxFeeSats: policy.maxFeeSats, verifyLineage: true, lineage: { fetchTx, cache } })`**: DvP (kredi çıktısı ajanın adresine, tam `k`), para üstü pledge coin'in kendi script'ine = **vault'a**, ücret payı ≤ `maxFeeSats`, `pledgeListHash`/`termsHash`, teklif imzası (`Spend`), soy. Hata → `403 { reason: '<KOD>: <mesaj>' }`.
6. **Soy doğrulaması pledge anında yapılır ve önbelleğe alınır (ön-doğrulama).** 2.1b'de guard `verifyLineage(poolId)` çağırır; sonuç guard ömrü boyunca paylaşılan `LineageCache`'te. Settlement turunda aynı outpoint önbellekten gelir. **Ölçüm (18:20, bu konteyner → Arcade):** `GET /tx` 250–950 ms; A'nın havuzlarında soy derinliği 1–3 (deploy → reserve) → ilk doğrulama ≈ 1–3 sn, sonrakiler ≈ 0. 60 sn tura sığıyor. Ağ hatası önbelleğe girmez (A'nın `verifyLineage`'i yalnızca kesin sonuçları saklar).
7. **Pledge farkındalığı (2.1b), `kind:'pay'` içinde.** Tx bir `agentcoop pledge` kaydı taşıyorsa A.3.1 düzeni zorunlu: out0 pledge coin = **bu vault'un script'i**, out1 kayıt bedeli, out2 kayıt. Pledge coin vault script'inde kaldığı için sahip onu da her an çekebilir; settlement para üstü yine vault'a döner. Havuz tx'i `context.poolBEEF`'ten (overlay `{op:'pool'}` cevabındaki BEEF; yalnızca **taşıma**, txid ile doğrulanır) veya guard'ın kendi `fetchTx`'iyle (Arcade → WoC) gelir. out1 = `payScriptHex` = `providerPayScript(provider, nonce)` → kanıtlı ödeme (ajanın `payees` göndermesine gerek yok).
8. **Ledger: rezervasyon.** Pledge anında vault'tan gerçekten çıkan yalnızca kayıt bedeli + madenci ücreti, ama pledge coin havuza **taahhüt** edilmiştir. Guard iki kayıt yazar: `<vaultGirdisi>` → çıkış (bedel + ücret), havuz payı = bedel; `reserve:<vaultGirdisi>` → pledge coin değeri (haftalık + havuz payı). Pledge coin'i harcayan sonraki her tx (settlement, iptal, sahip dışı harcama) bu rezervasyonu **çözer**: pledge tx'inin girdilerinden rezervasyon anahtarı bulunur; ilk çözüm rezervasyonun yerine geçer (settlement'ta gerçek maliyet `s ≤ coin`, iptalde 0), sonrakiler en büyüğü tutar (yalnızca biri zincire girebilir). Böylece haftalık tavan **pledge anında** uygulanır ("bütçeyi 10 havuza böl" injection'ı da durur) ve settlement'ta çift sayılmaz.
9. **Havuz başına tavan (G11) artık havuz bazında**: aynı (sahip, ajan) için 7 günde bir havuza giden bedel + rezervasyon/settlement maliyeti toplamı ≤ `maxPerPoolSats`. Havuz kimliği olmayan düz `pay` ödemelerinde D-P1 kuralı (tx başına Σ ödeme) aynen.
10. **Sıcak cüzdan = `'anyone'` göndericili BRC-29.** Çıktı `P2PKH(KeyDeriver('anyone').derivePublicKey([2,'3241645161d8'], '<prefix> <suffix>', agent))`; guard bunu yalnızca **vault'un kayıtlı ajanı** için yeniden hesaplar (alıcı başka biri olamaz). Ajan `internalizeAction({ protocol:'wallet payment', paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey: <anyone pubkey = 1·G> } })` ile `default` basket'e alır. **Spike (18:15, mockchain):** guard'ın türettiği anahtar = ajanın `getPublicKey({counterparty: anyonePub \| 'anyone', forSelf:true})`; internalize `accepted:true`, bakiye +1.234, ardından harcanabildi. Ortak sır `agentPriv·1G = agentPub` herkesçe bilinir ama harcama yine ajanın özel anahtarını ister (yalnızca bağlantı gizliliği kaybı: keyID'yi gören ödemeyi ajana bağlayabilir; prefix/suffix rastgele). Tavan `hotWalletDailySats`, **kayan 24 sa**, ayrı ledger alanı (`hotSats`); tutar haftalık çıkışa da sayılır, `maxPerPoolSats`'a sayılmaz.
11. **Asenkron ön hazırlık sıranın dışında.** `/cosign`: (a) çözme + havuz tx'i + soy (ağ) sıranın dışında, (b) politika + imza + ledger tek sırada (D-P1 kararı korunur: eşzamanlı isteklerle tavan aşılamaz).
12. **İmza turu gecikmesi:** guard tarafında settle değerlendirmesi önbellekli soyla < 50 ms (mockchain); ajan → guard HTTP + `createSignature` ikişer kez. 60 sn turda vault'lu katılımcı sayısı sınır değil.

---

## 5. Dosyalar

| Dosya | Değişiklik | Sahip |
|---|---|---|
| `apps/guard/src/policy.ts` | `evaluateCosign` genişler: pledge (2.1b), sıcak cüzdan (2.2), rezervasyon çözümü, havuz bazında G11; çıktı `entries` (ledger taslakları). Saf kalır | D |
| `apps/guard/src/settle.ts` (yeni) | `evaluateSettle` (2.1): plan → tx, zincirden offer/terms, `verifySettlementPlan`, tutarlar; `poolFromTx`, `pledgeRecordOf`, `resolvePoolTx` (2.1b ortak) | D |
| `apps/guard/src/guard.ts` | `kind` yönlendirme, ön hazırlık (havuz tx'i, soy önbelleği), `fetchTx`/`lineage` seçenekleri, çoklu ledger kaydı, `GET /vaults` cevabında `hotLast24hSats` | D |
| `apps/guard/src/store.ts` | `LedgerEntry.kind/poolId/poolSats/hotSats`, `spentInWindow(…, exclude[])`, `poolSpent`, `hotSpent`, `findReservation`, rezervasyon çözümü | D |
| `apps/guard/src/main.ts` | `ARCADE_URL`'den `fetchTx` | D |
| `apps/guard/src/server.ts` | CORS (`GUARD_CORS_ORIGIN`, `x-bsv-auth-*` expose), `GET /policies/:agent`, `GET /decisions`, `GET /events` (SSE) — Track E | D |
| `scripts/lib/register-cjs.mjs` (yeni) | demo için `knex` ESM sarmalayıcısı (A'nın mockchain yardımcısı tsx altında) | D — **20:05 B kaldırdı** (hook artık `knex`'i de sarıyor) |
| `packages/core/src/signers/VaultSigner.ts` | `CosignContext.poolBEEF?`, `hotWallet?`; settle'da `txBEEF` gönderilmez; `spendFromVault` çıktı basket/etiket + ek context, yayın hatasında `relinquishOutput`; yeni: `pledgeFromVault`, `cancelVaultPledge`, `internalizeVaultSettlement`, `topUpHotWallet`, `hotWalletScript`, `ANYONE_IDENTITY_KEY` | D |
| `apps/owner-cli/src/chain.ts` | `findVaultUtxos`: B'nin overlay'i (`{ op:'vaults', owner }`) ikinci kaynak (`OVERLAY_URL`) | D |
| `apps/guard/test/pledge.test.ts` (yeni) | pledge (P1–P6), havuz tx'i okuma, ledger rezervasyonları (mockchain'siz tx'ler); settle'ın tamamı e2e'de | D |
| `test/e2e.vault-settlement.mockchain.test.ts` (yeni; A.3.2 ile ortak) | §9.2 | D (+A) |
| `test/vault.mockchain.test.ts` | sıcak cüzdan + relinquish senaryoları | D |
| `scripts/demo-injection.ts` (yeni) | 2.3 | D |
| `apps/guard/README.md` | 2.5: kontrol → tehdit tablosu (G1–G13 + S/P/H), "guard tek başına fon oynatamaz" | D |
| `apps/guard/package.json`, `apps/owner-cli/package.json`, `scripts/package.json` | `tsx --import @agentcoop/core/register-sdk` | D |

---

## 6. Arayüz eki (MASTER §3.7; önce MASTER, sonra STATUS)

`POST /cosign` gövdesi `{ txBEEF?, plan?, inputIndex, agent, agentSignatureHex, context }`:

| `context.kind` | Tx kaynağı | Yeni `context` alanları |
|---|---|---|
| `'settle'` | **`plan` (SettlementPlan) zorunlu**; tx = `planTransaction(plan)`; `txBEEF` yok sayılır | `poolId` (zorunlu, `plan.poolId`'e eşit), `expectedCredits?`, `tokenId?` (verilirse zincirdekiyle eşit olmalı). `inputIndex` = ajanın pledge coin'i (1..n) |
| `'pay'` | `txBEEF` | **`poolBEEF?`** (tx `agentcoop pledge` kaydı taşıyorsa havuz tx'i: AtomicBEEF/BEEF/ham tx, hex veya `number[]`; yoksa guard kendisi çeker) · **`hotWallet?: [{ vout, derivationPrefix, derivationSuffix }]`** (alıcı = vault'un ajanı, BRC-29 gönderici = `'anyone'`) · `payees` (D-P1) aynen |

Cevap aynı (`{ signatureHex, guardPub }` / `403|400 { reason }`). `GET /vaults/:vaultId` cevabına `hotLast24hSats`. Ajan tarafı API (C ve A için): `pledgeFromVault`, `cancelVaultPledge`, `internalizeVaultSettlement`, `topUpHotWallet` (`@agentcoop/core/signers/VaultSigner`).

---

## 7. Yeni guard kontrolleri ve kapattıkları tehditler (FINAL-IDEA §8)

D-P1 §7.2'nin G1–G13'ü geçerli; aşağıdakiler eklenir. İlk başarısız kontrol `403/400 { reason }`, imza yok.

### 7.1 `settle` (2.1)

| # | Kontrol | `reason` | Kapattığı tehdit |
|---|---|---|---|
| S1 | `plan` var ve `planTransaction(plan)` çözülür; G1 (kaynaklar + txid bağı) | `bad request: plan …` | Guard'a koordinatörün kurduğu farklı bir tx'i imzalatmak (guard tx'i plandan kendisi kurar) |
| S2 | `inputIndex ∈ 1..n`; G3 (kayıtlı vault, ajan, tek girdi), G4 (final), G5 (ajan imzası guard'ın sighash'inde), G6 (politika) | D-P1 metinleri; `input i is not a pledge input` | Kör imza; başka sahibin vault'u; teklif girdisine imza |
| S3 | Vault girdisinin kaynak tx'inde `agentcoop pledge` kaydı; `participant == agent`, `signer == 'vault'`, `poolId == plan.poolId == context.poolId`; `context.expectedCredits` verildiyse eşit | `no pledge record for this input`, `pledge record does not name this agent`, `pool mismatch`, `expectedCredits mismatch` | Koordinatörün ajanın coin'ini başka havuza/başka paya koyması |
| S4 | Girdi 0'ın kaynak tx'inde `agentcoop pool` kaydı (`nonce` dahil); terms geçerli; `context.tokenId` verildiyse eşit | `no pool record in the offer's transaction`, `token mismatch` | Uydurma terms (terms txid'e bağlı zincir verisinden) |
| S5 | `provider ∈ allowProviders`; `payScriptHex == providerPayScript(provider, nonce)`; teklif UTXO'su sağlayıcının `offer <nonce>` anahtarında | `provider not allowed: <key>`, `pool payScript is not the provider's revenue key`, `offer UTXO is not the provider's` | **Prompt injection ile izinsiz sağlayıcıya ödeme**; izinli sağlayıcının adını taşıyan sahte havuz |
| S6 | `verifySettlementPlan(…, verifyLineage: true)` (§4.5) | `BAD_PLAN: …`, `LINEAGE_FAILED: …`, `BAD_TERMS: …` | "Koordinatör çalmaya çalışıyor" (kredi başka adrese, eksik kredi, para üstü kesintisi, fazla ücret); "Koordinatör/overlay sahte krediyi geçerli gösteriyor" (soy guard'da bağımsız) |
| S7 | Çıkış `s = coin − para üstü`; havuz payı (7 gün, bu pledge'in rezervasyonu hariç) + `s` ≤ `maxPerPoolSats`; haftalık (rezervasyon çözülerek) ≤ `weeklyCapSats` | `maxPerPoolSats exceeded (…)`, `weeklyCapSats exceeded (…)` | Pledge'den sonra politika daraltıldıysa settlement'ta yeniden uygulanır |

D-P1'in G7–G10'u (çıktı sınıfları, `payees`, bilinmeyen ≤ dış girdi, tx ücreti) settlement'ta **uygulanmaz**: tx'te başka katılımcıların girdileri/çıktıları var. Yerine S6'nın "kendi girdim ↔ kendi kredi ve para üstü çıktım" eşlemesi ve `maxFeeSats`'lı maliyet sınırı geçer (ALL imzası tx'in tamamını bağlar).

### 7.2 Pledge farkındalığı (2.1b, `kind:'pay'` içinde)

| # | Kontrol | `reason` | Kapattığı tehdit |
|---|---|---|---|
| P1 | Kayıt geçerli; `participant == agent`, `signer == 'vault'` | `bad pledge record`, `pledge record does not name this agent`, `vault pledge must say signer 'vault'` | Ajanın vault parasıyla başkası adına pledge (krediler başkasına) |
| P2 | Düzen: out0 = bu vault'un script'i (pledge coin), out1 bedel, out2 kayıt; `minCredits ≤ credits ≤ N`; out0 ≥ payı + 1 | `pledge layout: …` | Pledge coin'in vault dışına (ajanın anahtarına) kaçırılması |
| P3 | Havuz tx'i (`poolBEEF` ya da guard'ın `fetchTx`'i), txid = `poolId` txid'i, `pool` kaydı | `pool transaction not available: …`, `no pool record in the pool transaction` | Uydurma havuz bilgisi |
| P4 | S5'in aynısı + out1 = `payScriptHex` (kanıtlı ödeme) | `provider not allowed: <key>`, `pledge fee is not paid to the pool's revenue key`, `offer UTXO is not the provider's` | **Injection: "bütçenin %100'ünü X'e"** (X allowlist dışı) |
| P5 | Havuz payı + bedel + pledge coin ≤ `maxPerPoolSats`; haftalık + çıkış + pledge coin ≤ `weeklyCapSats` | `maxPerPoolSats exceeded (pledge …)`, `weeklyCapSats exceeded (…)` | **Injection: "bütçenin %100'ünü (izinli) havuza"**; bütçeyi çok havuza bölmek |
| P6 | `verifyLineage(poolId)` (önbelleğe) | `LINEAGE_FAILED: …` | Sahte krediye kayıt bedeli ödemek; settlement turunu hızlandırır |

### 7.3 Sıcak cüzdan (2.2, `kind:'pay'` içinde)

| # | Kontrol | `reason` | Kapattığı tehdit |
|---|---|---|---|
| H1 | Girdiler geçerli (vout var, tekrar yok, prefix/suffix base64 ≤ 64) | `bad hot wallet entry` | Biçim |
| H2 | Çıktı = `P2PKH(KeyDeriver('anyone').derivePublicKey(BRC29, '<p> <s>', vault.agent))` | `hot wallet proof mismatch at vout n` | Sıcak cüzdan kılıfıyla üçüncü kişiye ödeme |
| H3 | Son 24 sa sıcak toplam + bu ≤ `hotWalletDailySats` (+ haftalık) | `hotWalletDailySats exceeded (a + b > c)` | Ele geçirilmiş ajanın vault'u sıcak cüzdan üzerinden boşaltması: günlük sınır |

### 7.4 Açık kalanlar
Sıcak cüzdana geçen para artık guard'ın kontrolünde değil (tasarım gereği; tavanla sınırlı). Kredi çıktıları ajanın token adresine gidiyor (K3, A Faz 5 `creditLock:'vault'`). Ledger imza anında sayar. Guard çevrimdışıyken ajan harcayamaz, sahip çeker.

---

## 8. Akışlar

```
2.1b pledge (ajan: pledgeFromVault — A.3.1 referansı)
  vault UTXO A ─▶ out0 pledge coin (vault script, basket 'agentcoop', signer:'vault')
                  out1 feeSats → payScriptHex      out2 OP_RETURN pledge {…, signer:'vault'}
                  out3 para üstü → vault script    (+ ajanın ücret girdisi/para üstü)
  VaultSigner(context: { kind:'pay', poolBEEF }) → guard P1–P6 → imza → yayın → overlay submit
  ledger: A → bedel+ücret (havuz payı bedel) · reserve:A → coin (havuz payı coin)

2.1 settlement (koordinatör sign_request)
  ajan: verifySettlementPlan (kendi) → signSettlementInput(plan, i, VaultSigner({ kind:'settle', poolId, expectedCredits, tokenId }, plan))
  guard: S1–S7 (soy önbellekte) → imza → ajan sign_response
  yayından sonra: internalizeVaultSettlement → para üstü 'agentcoop vault' basket'ine, pledge coin relinquish
  ledger: reserve:A → s (rezervasyon çözüldü)

2.2 sıcak cüzdan (ajan: topUpHotWallet)
  vault UTXO ─▶ out0 BRC-29('anyone' → ajan) · para üstü → vault
  context: { kind:'pay', hotWallet: [{ vout:0, prefix, suffix }] } → guard H1–H3 → imza
  ajan: internalizeAction(wallet payment, senderIdentityKey = anyone) → default basket → 402 (AuthFetch)

İptal: cancelVaultPledge → pledge coin tamamen vault'a (kind:'pay') → reserve:A → 0
```

---

## 9. Test senaryoları

### 9.1 Birim (`apps/guard/test/pledge.test.ts`; mockchain yok, elle kurulmuş tx'ler)
1. Pledge: izinli havuz → izin, kayıtlar (A, reserve:A); allowlist dışı → `provider not allowed`; coin + bedel > `maxPerPoolSats` → red; haftalık rezervasyonla aşım → red; out0 vault dışı → `pledge layout`; başkası adına kayıt → red; havuz tx'i yanlış txid → red; soy başarısız → `LINEAGE_FAILED`.
2. Sıcak cüzdan: doğru türetme → izin; başka alıcı → `hot wallet proof mismatch`; 24 sa tavan → red; `maxPerPoolSats` sıcak ödemeyi saymaz.
3. Ledger: rezervasyon settlement'la çözülür (haftalık düşer), iptal 0'a çeker, ikinci çözüm en büyüğü tutar.

### 9.2 Uçtan uca (`test/e2e.vault-settlement.mockchain.test.ts`; B'nin overlay'i + koordinatörü, A'nın builder'ları, guard HTTP)
1. Sağlayıcı: deploy → reserve + announce (N=1000, P=10.000, bedel 50) → teklif `POST /offers`.
2. Sahip: vault (ajan V) + politika (`allow` sağlayıcı, `maxPerPool` 6.000, haftalık 20.000) + 20.000 fonla; V devralır.
3. **Injection (pledge anında):** V'nin "itaatkâr" adımı: allowlist dışı sağlayıcının havuzuna → 403 `provider not allowed`; izinli havuza tüm vault (19.000) → 403 `maxPerPoolSats exceeded`; hiçbir tx yayınlanmadı, vault UTXO'su yerinde.
4. P2PKH ajan 600 (`buildPledge`), V 400 (`pledgeFromVault`) → overlay iki pledge'i geçerli sayar.
5. Koordinatör turu: P2PKH bot (B'nin `agentBot`'u) + vault bot (`verifySettlementPlan` + `VaultSigner` settle → guard HTTP) → `settled`; krediler 600/400; V'nin para üstü vault script'inde; guard ledger'ında rezervasyon çözüldü; sahip para üstünü tek başına çekebilir.
6. Kurcalanmış plan (V'nin kredi çıktısı başka adrese) → guard 403 `BAD_PLAN … pays someone else`.
7. **A.3.2'nin negatif senaryosu:** sahip sağlayıcıyı allowlist'ten çıkarır → ikinci havuzda V'nin pledge'i (önceden izinliyken verilmiş) settlement turunda guard'dan 403 `provider not allowed` → V `sign_reject` → koordinatör V'yi kara listeye alır, **yayın yok**.

### 9.3 `test/vault.mockchain.test.ts` ekleri
- `topUpHotWallet` 1.500 → ajanın `default` bakiyesi +1.500; ikinci 1.000 → `hotWalletDailySats exceeded`.
- Sahip çektikten sonra ajanın harcama denemesi yayında düşer → vault UTXO'su ajanın basket'inden **relinquish** edilir (`listVaultUtxos` artık göstermez).

### 9.4 Demo (`scripts/demo-injection.ts`, mockchain, ~10 sn)
Sahip, sağlayıcı, saldırgan sağlayıcı, ajan, guard süreç içinde; ajana üç talimat: (1) "Pool X'e bütçenin %100'ü" → `DENY … provider not allowed`; (2) "AgentCoop havuzuna bütçenin %100'ü" → `DENY … maxPerPoolSats exceeded`; (3) "400 kredi pledge et" → `ALLOW`. Her satır jüri için okunur (`[guard] DENY pay … reason="provider not allowed: 03ab…"`), sonunda vault bakiyesi.

---

## 10. Uygulama sırası

1. ✅ main birleştirme (Track C + B-INT), `compat.overlay.test.ts` B'nin yeni `vault.ts`'ine.
2. ✅ Çalışma zamanı: Node 24 + hook doğrulandı; D script'leri hook'lu.
3. ✅ Spike: `'anyone'` göndericili BRC-29 (§4.10); Arcade gecikmesi (§4.6).
4. `store.ts` ledger → `policy.ts` (pledge, sıcak) → `settle.ts` → `guard.ts` → birim testleri.
5. `VaultSigner.ts` ajan akışları → `test/vault.mockchain.test.ts` ekleri.
6. `test/e2e.vault-settlement.mockchain.test.ts` → `scripts/demo-injection.ts`.
7. owner-cli overlay kaynağı; README; MASTER §3.7; STATUS; Checkpoint (§11).

---

## 11. Checkpoint (2026-10-30 18:50)

| Soru | Cevap |
|---|---|
| **Plan hâlâ iyi mi?** | Evet. (1) **60 sn tur:** guard'ın tek ağ bağımlılığı `verifyLineage` (ve havuz tx'i `poolBEEF` yoksa); Arcade'den tx başına 250–950 ms, A'nın havuzlarında derinlik 1–3. Track dosyasının önerdiği **ön-doğrulama yapıldı**: pledge anında soy doğrulanıp önbelleğe alınıyor, settlement turu önbellekten (`test/e2e…` tur ≈ 3 sn, settle değerlendirmesi < 50 ms). Overlay'e hiç bağımlı değil. (2) Ledger'a **rezervasyon** eklendi (pledge coin pledge anında haftalık + havuz tavanına sayılır, settlement gerçek maliyetle değiştirir) → `maxPerPoolSats` anlamı "havuz başına, 7 gün" oldu (STATUS Plan değişiklikleri). (3) A.P3 yokken guard'ın pledge kuralı A.3.1 düzenine sabitlendi; `pledgeFromVault` referans akış. (4) **Çalışma zamanı:** A'nın köprüsü yerine C'nin hook'u kullanılıyor; Node 24'te çalışıyor, Node 22.22'de hook kırık (Blokajlar → C) |
| **Bitti mi?** | Mockchain ✓: 2.1, 2.1b, 2.2, 2.3, 2.4, 2.5 + D-P1 artıkları + Track E guard uçları. Kök `npm test` → **29 dosya / 175 test yeşil**, `npm run typecheck` temiz (18:50, `main` @ 68131d5 + `origin/trackD` birleştirilmiş). `npm run demo-injection -w @agentcoop/scripts` Node 24'te ~13 sn. **Açık (mainnet, kabulün parçası):** vault'lu T5 + T10 ve bir 403 → sats + A.P3 (`buildPledge(…,'vault')` ya da `pledgeFromVault`) + C.P3 vault'lu ajan + Node 24 laptop |
| **Diğer track'ler?** (18:45 fetch) | **A:** `htlcLockingScript` iskeleti **açık ve gövdeli** (`packages/core/src/scripts/htlc.ts`: claim = SHA256 + ajan/guard 2-of-2, refund = maker/ajan 2-of-2, nLockTime'lı ön-imzalı); `planSettlement` pencere düzeltmesi ve `cancelPledge → { txid, beef }` main'de; A.P3 başlamadı (`buildPledge('vault')` hâlâ `NOT_IMPLEMENTED`); `skeleton.ts`'te `openWallet(...).wallet` düzeltmesi yok. **B:** `{ op:'vaults', owner }` / `{ op:'vault' }` var ve D'nin kaydıyla uyumlu (owner-cli ikinci kaynak, e2e'de doğrulandı); B-INT + Faz 6 yerel kısmı main'de; koordinatör vault'lu pledge'i değişiklik gerektirmeden planlayıp settle etti. **C:** P1 mockchain; ajan profilinde `mode: 'p2pkh' \| 'vault'` alanı var ama vault yolu yok (C.P3). **E:** plan var (`plan/track-E-frontend.md`), kişi atanmadı; guard'dan istedikleri yapıldı |
| **Sonraki faz (Faz 3 Rail PoC) bağımlılıkları** | A.P0 `InputSigner` ✓; `htlcLockingScript` ✓ (A yazdı, D sahibi). **Base Sepolia RPC** ✓ (`https://sepolia.base.org` bu konteynerden `eth_blockNumber` cevaplıyor). **Eksik:** Base Sepolia test ETH + USDC (SETUP-ACCOUNTS #9–11, insan; faucet), EVM anahtarları (`BASE_PRIVATE_KEY`, kasada), `maker` cüzdanı 30k sat (sats yok), Foundry (bu konteynerde yok; `solc` 0.8.38 npm'de var). Doğrulama testi 4 (nLockTime, ≤ 1.000 sat) ve 6 (v1 malleability) **mainnet sats ister**. Karar: Faz 3'ün sats'sız kısımları (HTLC kontratı + yerel testleri, BSV tarafı script/iade tx'i mockchain'de, `apps/maker` iskeleti) başlayabilir; Base Sepolia ve mainnet adımları sats + faucet gelince. Hiçbiri gelmezse zaman kutusu sonunda STATUS'a "Rail PoC yapılmadı" ve Faz 5 B yolu |
| **Arayüz değişikliği?** | MASTER §3.1 (Node 24 notu), §3.3 (VaultSigner notu), §3.7 (`/cosign` D.P2 ekleri, `GET /vaults` `hotLast24hSats`, E'nin üç ucu ✅), §3.9 (`GUARD_CORS_ORIGIN`, `DATA_DIR`), §3.10 (guard kaynağı ✅). STATUS "Arayüz değişiklikleri" 18:40 D satırları |
