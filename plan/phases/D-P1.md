# D-P1 — Mandate Vault: script, guard, sahip CLI'ı, VaultSigner, doğrulama testi 5 (ayrıntılı plan)

> Track D · Faz 1 · hedef senkron **S2 öncesi** (A.P3 ve C.P3 bunu bekler) · yazıldı: 2026-10-30 16:55
> Üst plan: `plan/track-D-vault-ops-rail.md` Faz 1 · Arayüzler: `00-MASTER-PLAN.md §3.2, §3.3 (InputSigner), §3.4 (vaultLockingScript), §3.7` · Fikir: `FINAL-IDEA.md §4.9, §8`

---

## 1. Amaç ve "bitti" tanımı

Sahip (BSV Desktop) bir vault kurup fonlayabilsin ve politikasını guard'a yazabilsin; ajan + guard 2-of-2 ile, **yalnızca politikaya uyan** harcamaları yapabilsin; sahip guard'a ve ajana sormadan tek imzayla her an çekebilsin. Guard imzalamadan önce tx'i kendisi çözüp sighash'i kendisi hesaplar (kör imza yok).

**Kabul kanıtı** (STATUS Track D'ye yazılır):
- `cd apps/guard && npm test` yeşil: script birim testleri + `test/vault.mockchain.test.ts` (fonla → 2-of-2 harca → guard reddi → sahip çek; ayrıca zincirin tek imzayı reddettiği negatif testler). `npm run typecheck` temiz (guard, owner-cli, core dosyaları).
- `npm run guard` kalkıyor (`GET /healthz`).
- `VaultSigner`, `VaultOwnerSigner`, `vaultLockingScript`, `VAULT_OWNER_UNLOCK_LENGTH`, `VAULT_COSIGN_UNLOCK_LENGTH` export edilmiş.
- **Doğrulama testi 5 (mainnet, ≤ 1.000 sat):** `npm run validation5` → üç txid (fonlama T9, 2-of-2 ödeme T10, sahip çekimi T9) + bir guard reddi (yayın yok). STATUS → "Mainnet işlemleri" ve "Doğrulama testleri" #5. *Sats ve treasury laptopu gerektirir (§2, §3).*

---

## 2. İnsan adımları

| # | Adım | Kim | Ne zaman | Not |
|---|---|---|---|---|
| H1 | Sats gelmiş ve F1 (`fund.ts agent-1=1000`) yapılmış olmalı | D-P0 insanları | test 5'ten önce | `agent-1` 2-of-2 harcamanın **madenci ücretini** kendi sıcak cüzdanından öder (~30 sat) |
| H2 | Treasury Desktop açık, kilidi açık, **mainnet**; repo + `.env` aynı laptopta | treasury sahibi | test 5 | Test 5'te sahip rolünü treasury Desktop üstlenir (`desktop-owner` gerekmez). Desktop'ta ≥ 1.100 sat |
| H3 | Desktop onay pencereleri: (1) `agentcoop.local` bağlantısı, (2) BRC-103 kimlik doğrulama (guard'a `PUT /vaults`, `PUT /policies`), (3) `agentcoop vault` protokolü için anahtar izni, (4) fonlama `createAction`, (5) çekim `createSignature` + `signAction` | treasury sahibi | test 5 | Hepsi tek koşuda; her pencerede açıklama metni AgentCoop'tur |
| H4 | Bu Desktop'un (`03e8836800…94a45a`) treasury olduğu teyidi | insan | test 5'ten önce | STATUS'taki açık blokaj (D-P0) |

Bu bulut oturumunda `.env`, `data/` ve Desktop **yok**; test 5 treasury laptopunda koşar: `cd apps/guard && npm ci && npm run validation5`.

---

## 3. Bağımlılıkların durumu (16:55)

| Bağımlılık | Durum | Etki / geçici çözüm |
|---|---|---|
| A.P0 kök workspace + `packages/core` iskeleti (`package.json`, `types.ts`, `index.ts`, `scripts/opreturn.ts`) | **Yok** (A başlamadı) | Yalnızca D'ye ayrılmış iki dosya yazılır: `packages/core/src/scripts/vault.ts`, `packages/core/src/signers/VaultSigner.ts`. `InputSigner` MASTER §3.3'ten **yapısal kopya** (VaultSigner.ts içinde, `TEMP` işaretli); vault OP_RETURN zarfı `vault.ts` içinde B'nin `stub/opreturn.ts`'iyle **aynı baytlarla** (A'nın `buildOpReturn`'ü gelince ona geçer). `packages/core`'un `node_modules`'ü yok: `apps/guard/tsconfig.json` `paths` (tsx ve tsc) ve vitest `alias`+`dedupe` ile guard'ın kopyalarına çözülür (§4.6) |
| A.P1/P2 `verifySettlementPlan`, `verifyLineage` | Yok | Faz 1'de guard yalnızca `kind:'pay'`; `settle`/`rail` → `403 kind not enabled` (D-P2/D-P3) |
| A `PoolTerms` gelir anahtarının keyID'si | §3.3'te yok | Guard'ın alıcıyı **zincir dışı güvene dayanmadan** doğrulaması için gerekir (§7 G8). Faz 1'de `context.payees` ile istekte gelir; MASTER §3.3'e isteğe bağlı `payKeyID` eklendi, A `buildReserveAndAnnounce`'ta doldurur (D-P2 `settle` yolu bunu kullanır) |
| B.P3 `vaults` lookup | Yok | Gerekmiyor: sahip vault UTXO'larını WhatsOnChain script-hash sorgusuyla bulur (guard'a ve overlay'e bağımsız). B için kayıt biçimi ve şablon §6.4'te |
| Sats | **Yok** | Mockchain ile devam; test 5 bekler (STATUS Blokajlar) |
| npm (bu konteyner, npm 10.9.4) | Taze `npm install` arborist hatası (`reading 'edgesOut'`) | `apps/guard/package-lock.json` `scripts/`'in lock'undan tohumlandı, sonra eksikler eklendi; `npm ci` çalışıyor |

---

## 4. Tasarım kararları (spike ile doğrulandı, 16:45, mockchain + wallet-toolbox 2.14.9)

1. **Script 109 bayt**, hex şablonu `6321{owner}ac675221{agent}21{guard}52ae68`. Mockchain'de (`MockServices.postBeef` → `tx.verify('scripts only')`) iki dal da gerçek imzalarla geçti.
2. **Anahtarlar türev, asla identity key** (guide §5.1): `[1,'agentcoop vault']`, keyID = vaultId, counterparty `'anyone'`. Ajanın ve guard'ın vault anahtarı herkes tarafından `new KeyDeriver('anyone').derivePublicKey(proto, vaultId, identityKey)` ile hesaplanır ve sahibinin `getPublicKey({…, forSelf:true})` sonucuna **eşit** (spike'ta doğrulandı). Böylece sahip CLI'ı, guard ve overlay script'i yalnızca üç identity key'den yeniden kurar.
3. **Ajan harcaması `createAction + signAction`** (A.3.1 ile aynı desen): vault girdisi `inputBEEF` ile verilir; ajanın cüzdanı **ücret için kendi girdisini ve kendi para üstü çıktılarını ekler** (spike'ta 1 girdi + 8 para üstü çıktısı). Guard bu yüzden "dış girdi / bilinmeyen çıktı" hesabı yapar (§7 G9). İmzalanabilir tx'te (`signableTransaction.tx`, AtomicBEEF) **tüm girdilerin kaynak tx'i var** → guard ücreti ve tutarları hesaplayabiliyor.
4. **Sahip çekimi çıktısız `createAction`**: yalnızca vault girdisi (`unlockingScriptLength: 75`), `outputs: []` → cüzdan tüm tutarı (ücret düşülerek) kendi `default` basket'ine para üstü yapar (spike: 9.000 → 8.984). Desktop aynı motoru (wallet-toolbox) çalıştırır.
5. **Ölçülen unlock uzunlukları:** sahip 74 bayt (sabit **75**), 2-of-2 147 bayt (sabit **150**). İmza ≤ 73 bayt (DER ≤ 72 + sighash 1), push 1 bayt.
6. **Tek SDK kopyası:** `apps/guard` CommonJS (MASTER §3.1 notu). tsx, `tsconfig.json` `paths`'i repo içindeki **tüm** dosyalara uyguluyor: `packages/core/src/*` ve hatta kendi `node_modules`'ü olan `scripts/wallets.ts` import edildiğinde `require.cache`'te tek `@bsv/sdk` ve tek wallet-toolbox var (denendi). Guard bu sayede D-P0'ın `openWallet`'ını kopyalamadan kullanır. Testlerde vitest `alias` + `dedupe` (B'nin koordinatöründeki desen).
7. **Ajanın vault UTXO'larını takibi:** sahip fonladıktan sonra ajan fonlama çıktısını `internalizeAction` (`basket insertion`, basket `agentcoop vault`) ile kendi cüzdanına alır; ajan harcamalarında vault'a dönen para üstü `createAction` çıktısında aynı basket'e yazılır. Ajan `listOutputs({ basket:'agentcoop vault' })` ile vault'unu görür.
8. **Sahibin vault'u bulması guard'a bağlı değil:** sahip CLI'ı script'i kendisi kurar, UTXO'ları WhatsOnChain `GET /v1/bsv/main/script/{scriptHash}/unspent` (bu uç çalışıyor; `/unspent/all` 429 verdi) + Desktop basket'i + `--outpoint` ile bulur, BEEF'i Arcade `/tx/{txid}`'den kurar (guide §20.4 `beefFromArcade`). Guard çevrimdışıyken de çekim yapılabilir.
9. **Guard kayıt ve politika anahtarı:** vault kaydı `vaultId`'ye, politika **(sahip, ajan)** çiftine bağlı (URL MASTER'daki gibi `PUT /policies/:agentIdentity`, sahip = BRC-103 ile doğrulanmış kimlik). Başkasının ajanı için politika "işgal" edilemez; her sahip yalnızca kendi vault'larını yönetir.
10. **Durum dosyası:** `data/guard/state.json` (kayıtlar, politikalar, ledger; atomik yazma) + `data/guard/decisions.jsonl`. Tek süreç; `/cosign` istekleri tek sırada işlenir (yarışla tavan aşımı yok).

---

## 5. Dosyalar

| Dosya | Ne yapar | Sahip |
|---|---|---|
| `packages/core/src/scripts/vault.ts` | Sabitler (`VAULT_PROTOCOL`, `VAULT_BASKET`, `VAULT_SIGHASH`, unlock uzunlukları), `vaultLockingScript`, `parseVaultLockingScript` / `isVaultLockingScriptHex` (B için şablon), `deriveVaultPub`, `vaultKeysForRecord` / `vaultScriptForRecord`, `newVaultId`, `validateVaultRecord`, `vaultRecordScript` (OP_RETURN), `vaultSighash`, `vaultOwnerUnlock`, `vaultCosignUnlock`, `toChecksigSignature`, `verifyVaultSignature`, `providerPayScript` | D (A iskeleti yok; §3) |
| `packages/core/src/signers/VaultSigner.ts` | `VaultSigner` (InputSigner; ajan imzası + guard `/cosign`), `VaultOwnerSigner` (sahip dalı), `httpCosigner(guardUrl)`, `CosignRejected`, ajan akışları `adoptVaultOutput`, `spendFromVault`; `InputSigner` geçici yapısal kopya | D |
| `apps/guard/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.mts` | CJS paket; `@bsv/sdk` 3.2.1, wallet-toolbox 2.14.9, `@bsv/auth-express-middleware` 2.2.9, express 5.3.0 | D |
| `apps/guard/src/policy.ts` | **Saf** politika motoru: `evaluateCosign(tx, inputIndex, vault, policy, request, spentLast7d)` → izin (tutarlarla) veya `{ reason }`. A'nın e2e testi bunu süreç içinde import edebilir | D |
| `apps/guard/src/store.ts` | `GuardStore`: JSON durum (kayıt, politika, ledger), karar günlüğü | D |
| `apps/guard/src/guard.ts` | `Guard`: `registerVault`, `putPolicy`, `getVault`, `cosign` (sıra, imza, ledger, log) | D |
| `apps/guard/src/server.ts` | Express: BRC-103 auth (`allowUnauthenticated:true`, sahip yolları kimlik ister), MASTER §3.7 yolları, `/healthz` | D |
| `apps/guard/src/main.ts` | `npm run guard`: `openWallet('guard')`, port `GUARD_URL`'den | D |
| `apps/guard/src/validation5.ts` | `npm run validation5`: mainnet doğrulama testi 5 (Desktop = sahip, `agent-1`, guard süreç içinde HTTP) | D |
| `apps/guard/test/vault.script.test.ts` | Script/anahtar/kayıt birim testleri | D |
| `apps/guard/test/vault.mockchain.test.ts` | §9 senaryoları (A'nın kök `test/`'i gelince oraya taşınır) | D |
| `apps/guard/README.md` | Çalıştırma, API, politika alanları, kontrol → tehdit tablosu (D-P2'de genişler) | D |
| `apps/owner-cli/package.json`, `tsconfig.json` | CJS paket, yalnızca `@bsv/sdk` (Desktop'a `WalletClient`, guard'a `AuthFetch`) | D |
| `apps/owner-cli/src/vault-ops.ts` | Kütüphane (testlerde wallet-toolbox cüzdanı Desktop yerine geçer): `createVault`, `registerVault`, `fundVault`, `putPolicy`, `getVaultStatus`, `findVaultUtxos`, `withdrawVault` | D |
| `apps/owner-cli/src/main.ts` | CLI: `create-vault`, `fund`, `policy`, `withdraw`, `status` | D |

Çalışma zamanı dosyaları (gitignore'lu `data/`): `data/vaults/<vaultId>/vault.json` (kayıt + script; public veri), `data/vaults/<vaultId>/fund-<txid>.json` (ajana devir: AtomicBEEF), `data/guard/state.json`, `data/guard/decisions.jsonl`.

---

## 6. Script düzeyi (opcode)

### 6.1 Locking script (109 bayt)

```
63                    OP_IF
21 <ownerPub 33B>
ac                    OP_CHECKSIG                 ← sahip dalı (Desktop)
67                    OP_ELSE
52                    OP_2
21 <agentPub 33B>
21 <guardPub 33B>
52                    OP_2
ae                    OP_CHECKMULTISIG            ← ajan + guard
68                    OP_ENDIF
```

### 6.2 Unlocking script'ler

| Dal | Script | Uzunluk sabiti (ölçülen) | Not |
|---|---|---|---|
| Sahip | `<sigO‖41> OP_1` | `VAULT_OWNER_UNLOCK_LENGTH = 75` (74) | `OP_1` → `OP_IF` doğru; MINIMALIF uyumlu |
| Ajan + guard | `OP_0 <sigA‖41> <sigG‖41> OP_0` | `VAULT_COSIGN_UNLOCK_LENGTH = 150` (147) | İlk `OP_0` CHECKMULTISIG'in fazladan elemanı (NULLDUMMY); imzalar pubkey sırasıyla (ajan, guard); son `OP_0` → `OP_ELSE` dalı |

A'nın ücret hesabı (A.2.5) vault girdisi için **150** kullanır (p2pkh 108).

### 6.3 Sighash

BIP-143 (FORKID), kapsam **`SIGHASH_ALL | FORKID` = 0x41**, subscript = **tam vault locking script'i** (OP_CODESEPARATOR yok), `sourceSatoshis` = vault UTXO'sunun değeri. Kit `signWalletP2pkhInput`'ın aynısı, yalnızca subscript farklı. `createSignature({ hashToDirectlySign: hash256(preimage), protocolID:[1,'agentcoop vault'], keyID: vaultId, counterparty:'anyone' })`. ALL tüm girdileri (outpoint + sequence) ve tüm çıktıları bağlar: imzadan sonra tx değişemez.

### 6.4 Vault kaydı (OP_RETURN) ve fonlama tx'i — **B için kesin biçim**

```
OP_FALSE OP_RETURN "agentcoop" "vault" {"v":"1","vaultId":"<32 hex>","owner":"<identity 66 hex>","agent":"<identity>","guard":"<identity>"}
```
- Tüm değerler string; anahtarlar **identity key** (türev değil). Türev anahtarlar ve script herkesçe yeniden hesaplanır: `vaultScriptForRecord(record)`.
- `vaultId` = 16 rastgele bayt, küçük harf hex (32 karakter); aynı zamanda keyID.
- `owner`, `agent`, `guard` **birbirinden farklı** olmalı (ajan = guard olursa 2-of-2 tek imzaya iner).
- **Fonlama tx düzeni** (`randomizeOutputs:false`): `out0` = vault coin (vault script'i), `out1` = OP_RETURN `vault` (0 sat), sonrası Desktop para üstü. Her fonlama (ek yükleme dahil) kaydı taşır.
- **Geçerlilik (overlay için):** kayıt `validateVaultRecord`'dan geçer **ve** `out0.lockingScript == vaultScriptForRecord(record)`. Aksi halde kayıt yalan söylüyor, admit edilmez.
- **Kayıtsız vault coin'leri:** 2-of-2 harcamalarda vault'a dönen para üstü ve vault'lu pledge coin'leri kayıt taşımaz; script'leri kayıtlı bir vault'un script'ine **bayt bayt eşit** olduğu için tanınır (B: `lockingScriptHex → vaultId` indeksi). Şablon tanıma: `isVaultLockingScriptHex(hex)` / `parseVaultLockingScript(script)` (regex `^6321(0[23][0-9a-f]{64})ac675221(0[23][0-9a-f]{64})21(0[23][0-9a-f]{64})52ae68$`).
- B'nin topic manager'ı vault çıktılarını harcayan girdileri `coinsToRetain`'de tutar (B.P1 zaten tüm önceki topic coin'lerini tutuyor).

---

## 7. Guard

### 7.1 API (MASTER §3.7; bu fazda eklenenler **kalın**)

| Yöntem | Yol | Kimlik | Ne yapar |
|---|---|---|---|
| **`PUT`** | **`/vaults/:vaultId`** | BRC-103, kimlik = `owner` | Gövde = vault kaydı (§6.4). Guard `guard == kendi identity'si` ve kayıt geçerliliğini kontrol eder, script'i **kendisi** türetir → `{ vaultId, lockingScriptHex, guardPub }`. Sahip CLI'ı bunu kendi hesabıyla karşılaştırır, eşit değilse fonlamaz. Aynı kayıt tekrar → 200 (idempotent); başka sahip/ajan ile aynı vaultId → 409 |
| `PUT` | `/policies/:agentIdentity` | BRC-103, kimlik = sahip | `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }` (sayılar sat, tam sayı ≥ 0). **(sahip, ajan) çiftine yazılır**; sahibin o ajanla kayıtlı vault'u yoksa 404 |
| **`GET`** | **`/vaults/:vaultId`** | BRC-103, kimlik = sahip veya ajan | Kayıt, script, politika, son 7 günde çıkan sat, pencere |
| `POST` | `/cosign` | yok (ajan imzası istekte) | Gövde: `{ txBEEF, plan?, inputIndex, agent, `**`agentSignatureHex`**`, context: { kind, poolId?, expectedCredits?, tokenId?, `**`payees?: [{ vout, provider, keyID }]`**` } }`. `txBEEF`: AtomicBEEF, `number[]` veya hex. İmzalar **checksig biçimi** (DER + `0x41`), hex. → `200 { signatureHex, guardPub }` · `403 { reason }` (politika) · `400 { reason }` (biçim) |
| `GET` | `/healthz` | yok | `{ ok, identityKey, network }` |

### 7.2 `/cosign` kontrolleri ve kapattıkları tehditler (FINAL-IDEA §8)

Sırayla; ilk başarısız kontrol `403/400 { reason }` döner ve **hiçbir imza üretilmez**.

| # | Kontrol | `reason` | Kapattığı tehdit |
|---|---|---|---|
| G1 | AtomicBEEF çözülür; `inputIndex` geçerli; **her** girdinin kaynak tx'i var ve kaynağın hesaplanan txid'i girdinin prevout txid'ine eşit | `bad request: …`, `missing source for input i`, `source txid mismatch for input i` | BIP-143 bir girdinin yalnızca **kendi** tutarını imzalar; diğer girdilerin tutarı doğrulanmazsa ajan "dış girdi" büyüklüğü hakkında yalan söyleyip G9'u atlatırdı. Tutarlar txid'e bağlı olduğu için sahte olamaz |
| G2 | `context.kind == 'pay'` (Faz 1) | `kind '<k>' not enabled` | `settle` (A.P2 DvP + `verifyLineage`) ve `rail` doğrulayıcısı olmadan imza verilmez (D-P2/D-P3) |
| G3 | `inputIndex`'teki kaynak script'i kayıtlı bir vault script'ine bayt bayt eşit; kayıtlı ajan = `agent`; tx'te bu vault script'li **tek** girdi | `not a registered vault input`, `agent mismatch`, `more than one input from this vault` | Guard'ın keyfi script'ler ya da başka sahibin vault'u için imza kâhini olması (confused deputy); çıkış hesabının tek anlamlı olması |
| G4 | `lockTime == 0` ve tüm `sequence == 0xffffffff` | `non-final transaction` | Ön-imzalı, ileri tarihli harcamalar (haftalık pencereyi aşmak, Rail iadesiyle karışmak). Rail (D-P3) kendi kuralını getirir |
| G5 | Sighash'i **guard hesaplar** (ALL\|FORKID); `agentSignatureHex` son baytı `0x41`, low-S ve ajanın türev vault anahtarıyla bu hash üzerinde geçerli | `agent signature invalid` | **Kör imza** (guard hiç görmediği bir hash'i imzalamaz); ALL bütün tx'i bağladığı için imzadan sonra koordinatör dahil kimse çıktıları değiştiremez ("Koordinatör çalmaya çalışıyor"); ajan imzası olmayan istekler ledger'ı tüketemez (bütçe griefing'i) |
| G6 | (sahip, ajan) politikası var | `no policy` | Varsayılan red: politikası yazılmamış vault'tan harcama yok |
| G7 | Çıktı sınıfı: vault script'i → **iade**; `OP_FALSE OP_RETURN` → veri (sat > 0 ise red); `payees`'te kanıtı olan → **ödeme**; diğer → **bilinmeyen**. `payees`'te olmayan/tekrar eden vout → red | `OP_RETURN output carries sats`, `bad payee entry` | Yakarak/veriyle para çıkarma |
| G8 | Her `payees` kaydı: guard `providerPayScript(provider, keyID)` = `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))` hesaplar, çıktıyla eşit olmalı; `provider ∈ allowProviders` | `provider not allowed: <key>`, `payee proof mismatch at vout n` | **Prompt injection ile saldırgana ödeme.** Alıcının kim olduğu overlay'e veya koordinatöre güvenilerek değil, anahtar türetmesiyle kanıtlanır: saldırgan, izinli sağlayıcının identity'sine bağlı ama kendi harcayabildiği bir script üretemez |
| G9 | Σ bilinmeyen çıktı ≤ Σ dış girdi (vault dışı girdiler) | `vault funds to unlisted output` | Ajanın vault parasını kendi para üstüne veya üçüncü kişiye akıtması. Ajanın cüzdanının eklediği ücret girdisi/para üstü serbest kalır (§4.3) |
| G10 | Ücret (Σ girdi − Σ çıktı, G1'le kimlikli) ≤ `maxFeeSats` | `maxFeeSats exceeded` | Madenci ücreti yoluyla boşaltma |
| G11 | Σ ödeme ≤ `maxPerPoolSats` | `maxPerPoolSats exceeded` | "Bütçenin %100'ünü X'e yatır" injection'ı (demo anı, D-P2.3) |
| G12 | Son 7 gündeki çıkışlar + bu çıkış ≤ `weeklyCapSats`. Çıkış = vault girdisi − vault'a dönen. Ledger **vault girdisinin outpoint'i** başına en büyük çıkışı tutar (aynı outpoint için yeniden imza — ör. yeni tur — çift sayılmaz; yalnızca biri zincire girebilir) | `weeklyCapSats exceeded` | Ajan ele geçirilse (veya guard'ın politikası atlatılsa) bile kaybın haftalık sınırı; "Ajan ve guard birlikte ele geçiriliyor" → kayıp vault bakiyesiyle sınırlı |
| G13 | Karar günlüğü (izin/red, sebep, tutarlar) + istekler tek sırada | — | Denetlenebilirlik (jüri için okunur satır); eşzamanlı isteklerle tavan aşımı |

**Zincirin kendisinin verdiği garantiler** (guard'dan bağımsız, testlerle kanıtlanır): guard tek başına harcayamaz ve ajan tek başına harcayamaz (CHECKMULTISIG 2-of-2) → "Guard ele geçiriliyor" kapalı; sahip `OP_IF` dalıyla her an çeker → "Ajan prompt injection'a uğruyor"da son çare. **Açık kalanlar:** guard çevrimdışıysa ajan harcayamaz (sahip çekebilir); ledger imza anında sayar, yayınlanmayan tx de pencereye yazılır (temkinli); kredi satışıyla guard'ı atlatma (K3, §4.9).

### 7.3 Kayıt ve politika kontrolleri

| Kontrol | Tehdit |
|---|---|
| `PUT /vaults`: kimlik (BRC-103) = `owner`; `guard` = bu guard; üç identity farklı; vaultId biçimi | Başkası adına vault/politika yazmak; ajan = guard (tek imza) |
| Politika (sahip, ajan) anahtarlı; yalnızca sahip yazar | Başka sahibin ajanını işgal; ajan kendi politikasını gevşetemez (sahip kimliği gerekir) |

`hotWalletDailySats` bu fazda saklanır, D-P2.2'de uygulanır.

---

## 8. Akışlar

```
create-vault  (sahip CLI, Desktop)
  vaultId ← 16 rastgele bayt
  ownerPub ← Desktop.getPublicKey([1,'agentcoop vault'], vaultId, 'anyone', forSelf)
  agentPub, guardPub ← KeyDeriver('anyone') (identity'lerden)
  script ← vaultLockingScript(ownerPub, agentPub, guardPub)
  AuthFetch(Desktop) PUT GUARD/vaults/:id {kayıt}  → guard'ın script'i == bizimki?  (değilse dur)
  data/vaults/<id>/vault.json

policy  → AuthFetch PUT GUARD/policies/:agent {…}

fund <id> <sats>  (Desktop createAction: out0 vault [basket 'agentcoop vault', tag vault:<id>], out1 OP_RETURN vault)
  → data/vaults/<id>/fund-<txid>.json (AtomicBEEF) → ajan: adoptVaultOutput (basket insertion)

pay  (ajan: spendFromVault)
  createAction { inputBEEF, inputs:[vault utxo, len 150], outputs:[ödeme(ler), vault para üstü→basket] }
  → VaultSigner.sign: sighash, ajan imzası, POST /cosign {txBEEF, agentSignatureHex, payees}
  → guard G1–G13 → guard imzası (VaultSigner guardPub'la doğrular) → OP_0 sigA sigG OP_0 → signAction

withdraw <id>  (Desktop)
  UTXO'lar: WoC script-hash unspent ∪ Desktop basket ∪ --outpoint ; BEEF: Arcade
  createAction { inputs: hepsi (len 75), outputs: [] } → her girdi: <sigO> OP_1 → signAction
```

---

## 9. Test senaryoları

### 9.1 Birim (`apps/guard/test/vault.script.test.ts`)
1. Script 109 bayt, şablon hex'i; `parseVaultLockingScript` gidiş-dönüş; P2PKH ve bozuk script'ler reddedilir.
2. `deriveVaultPub(identity, vaultId)` == cüzdanın `getPublicKey(forSelf:true)`; identity key'in kendisi **değil**.
3. `validateVaultRecord`: geçerli kayıt; sayı (string olmayan) değer, kısa vaultId, aynı iki identity → null. Kayıt OP_RETURN'ü B'nin `parseOpReturn` biçimiyle çözülür (aynı baytlar).
4. Unlock uzunlukları: en uzun imzalarla bile ≤ 75 / ≤ 150.
5. `evaluateCosign` saf testleri: kaynak txid uyuşmazlığı (G1), non-final (G4), OP_RETURN'de sat (G7), ücret tavanı (G10).

### 9.2 Mockchain (`apps/guard/test/vault.mockchain.test.ts`; guard HTTP sunucusu süreç içinde, sahip `AuthFetch` ile gerçek BRC-103)
1. **Kayıt:** sahip `create-vault` → guard'ın script'i eşit. Kimliksiz `PUT` → 401; başka sahip aynı vaultId → 409; sahibin vault'u olmayan ajana politika → 404.
2. **Fonla** 10.000 → out0 vault, out1 kayıt (`validateVaultRecord` + `vaultScriptForRecord` eşit) → ajan `adoptVaultOutput` → ajanın basket'inde.
3. **2-of-2 ödeme:** izinli sağlayıcıya 1.000 + vault'a 9.000 para üstü → guard imzalar → mockchain script'leri doğrular, kabul. Ledger 1.000.
4. **Guard reddi — allowlist dışı:** başka sağlayıcıya ödeme → `403 provider not allowed`, imza yok, yayın yok (`abortAction`), ledger değişmez.
5. **Guard reddi — tavanlar:** `maxPerPoolSats` aşımı; haftalık tavanı aşan ikinci ödeme; vault parası kanıtsız çıktıya (`vault funds to unlisted output`); bozuk ajan imzası; kayıtsız script.
6. **Zincir tek imzayı reddeder:** ajan imzası + sahte guard imzası ve ajan imzası iki kez → mockchain reddeder (2-of-2 zincirde zorunlu).
7. **Tekrar:** aynı girdi için ikinci `/cosign` ledger'ı ikiye katlamaz.
8. **Sahip çekimi:** kalan vault UTXO'su `OP_IF` dalıyla → sahibin `default` bakiyesi artar, ajanın basket'indeki çıktı harcanmış olur.

### 9.3 Mainnet — doğrulama testi 5 (`npm run validation5`, ≤ 1.000 sat)
Desktop = sahip, `agent-1` = ajan, `guard` = guard (süreç içi HTTP, Desktop'tan gerçek `AuthFetch`), `provider-api` = izinli sağlayıcı.
1. `create-vault` + politika (`allow provider-api`, `maxPerPool 500`, `weekly 1000`, `maxFee 200`).
2. **T9 fonla** 1.000 sat → txid₁.
3. **Guard reddi:** `agent-1` → `coordinator`'ın gelir anahtarına 300 (izinli değil) → 403, yayın yok.
4. **T10 2-of-2:** `agent-1` → `provider-api` gelir anahtarına (keyID `validation5`) 300, 700 vault'a → txid₂; `provider-api` çıktıyı `agentcoop revenue` basket'ine alır (sats takımda kalır).
5. **T9 çek:** 700'lük vault UTXO'su Desktop'a → txid₃.
Başarısızlık olursa Arcade `/tx` hata metni STATUS'a yazılır, A ile konuşulur (track Faz 1.6). Beklenti: Genesis sonrası bare multisig ve `OP_IF` standart; Arcade `/health` politikasında script kısıtı yok.

---

## 10. Uygulama sırası

1. ✅ Spike (§4), `apps/guard` paketi.
2. `vault.ts` → birim testleri.
3. `policy.ts`, `store.ts`, `guard.ts`, `server.ts`, `main.ts`.
4. `VaultSigner.ts` (signer + ajan akışları), `owner-cli` (`vault-ops.ts`, `main.ts`).
5. Mockchain testi → yeşil; `typecheck` (guard + owner-cli).
6. `validation5.ts` (burada çalıştırılamaz: `.env`/Desktop/sats yok).
7. MASTER §3.2/§3.3/§3.7, STATUS (Track D, arayüz değişiklikleri, blokajlar), `apps/guard/README.md`, Checkpoint (§11).
