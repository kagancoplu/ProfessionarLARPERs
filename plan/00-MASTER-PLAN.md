# AgentCoop — Ana Plan (v1)

> Kaynak fikir: [`FINAL-IDEA.md`](../FINAL-IDEA.md) (v1.1). Bu dosya **nasıl inşa edeceğimizi** anlatır; fikri tekrar etmez.
> Frontend bu planın dışında (ayrıca planlanacak). İnsan akışları şimdilik BSV Desktop'a bağlı **Node CLI'lar** ile yapılır; web UI sonra bunları sarar.

---

## 1. Bu plan nasıl kullanılır

- 5 paralel track var: **A Protokol**, **B Overlay + Koordinatör**, **C Sağlayıcı + Ajanlar**, **D Vault + Ops + Rail + Teslim**, **E Frontend** (`apps/web`: konsollar + pixel-art "Kasaba" canlı görünümü; 30.10 eklendi). Her track'in kendi dosyası var: `plan/track-*.md`.
- Her track dosyası **fazlara** bölünmüş. AI'a **bir seferde yalnızca bir faz** verilir, dosyanın tamamı tek prompt olarak verilmez.
- Her faz başında AI şu üçünü okur: (1) bu dosyanın §3 Arayüzler ve §4 Kurallar bölümleri, (2) [`STATUS.md`](STATUS.md), (3) kendi track dosyasındaki ilgili faz.
- Her faz sonunda AI **Checkpoint** ritüelini uygular (her fazın sonunda yazılı): plan hâlâ iyi mi, değişecek yer var mı → varsa planı güncelle; bu faz bitti → STATUS'u güncelle; diğer track'ler ne yaptı → STATUS'u oku; bağımlılık hazır mı → değilse stub ile devam et veya blokajı yaz.
- **Tek doğruluk kaynağı:** arayüzler bu dosyada (§3). Bir track arayüz değiştirmek zorunda kalırsa önce burayı günceller, sonra STATUS'ta duyurur.
- Teknik referans: `docs/AGENTS.md` (kurallar), `docs/BSV_STACK_COMPLETE_GUIDE.md` (§ numaralarıyla atıf yapılır), `docs/starter/bsv21-token-kit/` (kopyalanacak test edilmiş kod).

---

## 2. Kapsam kararları (kesinleşti)

| Karar | Sonuç |
|---|---|
| Ana senaryo | **Simüle GPU sağlayıcısı.** Ürün: "H100 GPU-saat kredisi" (1 kredi = 1 GPU-saat, dakika bazında tüketilir; C, 30.10). Havuz: bir GPU bloğu. İşler (fine-tune, eval, inference) simüle edilir, ama ödeme, kredi ve settlement gerçek ve zincir üstünde |
| SmartRoute | İlk etapta **yok**. Sağlayıcı katmanı "ürün = konfigürasyon" olacak şekilde yazılır; SmartRoute sonradan ikinci sağlayıcı olarak takılabilir |
| Mandate Vault | **Tam kapsam** (K2) |
| Coop Rail | **Zaman kutulu PoC**: Base Sepolia, en fazla 4 saat, canlı demoda değil, kayıtla belgelenir. Başarılı olursa README'de "deneysel" |
| Market | İmzalı listeler + tek işlemde sweep (A builder, B indeks, C ajan davranışı) |
| Backstop underwriter | Yalnızca `backstopMax` alanı terms'te; davranış K3 |
| Ağ | **Mainnet** (BSVA sats veriyor). Geliştirme ve testler mockchain'de, sats gerekmez |
| Ajan "beyni" | LLM (Anthropic API) ile karar + deterministik fallback (`AGENT_BRAIN=rules`). API anahtarı yoksa rules modu |
| Demo / video | Şimdi planlanmıyor. Yalnızca gönderim zorunlulukları (README, value note, tx linkleri) D'nin son fazında |
| Adevar Labs | Sonra |

---

## 3. Arayüzler (S0'da dondurulur; değişiklik = önce burayı güncelle)

### 3.1 Repo düzeni (npm workspaces, Node ≥ 22, TypeScript, tsx, vitest)

```
/                         (mevcut repo kökü)
├─ package.json           workspaces: packages/*, apps/*, scripts
├─ tsconfig.base.json
├─ vitest.config.ts       kit'teki @bsv/sdk CJS alias'ı birebir (docs/starter/bsv21-token-kit/vitest.config.ts)
├─ AGENTS.md              docs/AGENTS.md kopyası
├─ .env.example           tüm değişkenler (gerçek .env gitignore'da)
├─ plan/                  bu dosyalar
├─ packages/
│  ├─ core/               [A] protokol: types, builders, signers, verifiers, scripts (vault/htlc)
│  └─ overlay/            [B] tm_agentcoop + ls_agentcoop + kit'in token kuralları
├─ apps/
│  ├─ coordinator/        [B] lock-in, imza turu (WS), yayın, yan API (offers/listings/feed)
│  ├─ provider-api/       [C] simüle GPU sağlayıcısı: BRC-105 402, redeem/return, iş çalıştırıcı
│  ├─ provider-cli/       [C] BSV Desktop ile: mint, open-pool, cancel-pool, sweep-revenue
│  ├─ participant-cli/    [C] BSV Desktop ile: insan pledge'i
│  ├─ agents/             [C] 3 ajan + procurement router + orkestrasyon
│  ├─ guard/              [D] vault politika motoru ve ortak imzacı
│  ├─ owner-cli/          [D] BSV Desktop ile: vault fonla / politika / geri çek
│  └─ maker/              [D] Coop Rail PoC maker botu
├─ contracts/base-htlc/   [D] Solidity HTLC (PoC)
│  └─ web/             [E] frontend: React konsollar + Phaser "Kasaba" (tarayıcı → BSV Desktop; servislerle REST/WS/SSE)
├─ scripts/               [D] keygen, fund, receive, balances, skeleton (A)
├─ data/                  (gitignore) cüzdan sqlite'ları, overlay db
└─ test/                  uçtan uca mockchain senaryoları (herkes ekler)
```

**ESM/CJS kuralı:** wallet-toolbox CJS'dir. SDK **yalnızca `@agentcoop/core/sdk` üzerinden** import edilir (`packages/core/src/sdk.ts` CJS build'i yeniden export eder). Testlerde kök `vitest.config.ts` alias'ı `@bsv/sdk`'yı aynı CJS dosyasına yönlendirir. Çalışma zamanında (tsx/Node) wallet-toolbox kullanan her app ve script **`tsx --import @agentcoop/core/register-sdk <dosya>`** ile başlatılır: senkron Node hook'u (`packages/core/register-sdk.mjs`, `module.registerHooks`) SDK'nın CJS girişine yapılan her ESM importunu (`sdk.ts`'in re-export'u veya çıplak `@bsv/sdk`) export listesi yükleme anında okunan bir ESM sarmalayıcıya yönlendirir; sarmalayıcı wallet-toolbox'ın `require` ettiği kopyanın aynısını verir. *(C, 30.10: hook olmadan `tsx` altında `import { Transaction } from '@agentcoop/core/sdk'` → `does not provide an export named 'Transaction'`, çünkü Node CJS build'in named export'larını statik olarak göremiyor; vitest alias'ı yüzünden testlerde görünmüyordu. Hook'la tek kopya doğrulandı.)* Hata belirtisi: `script[serializedBytes] is not a function`.

> **Doğrulama notu (D, 2026-10-30 16:20; tsx 4.23 + Node 24, `@bsv/sdk` 3.2.1, wallet-toolbox 2.14.9).** (a) `"type":"module"` bir pakette tsx altında `import { PrivateKey } from '@bsv/sdk'` ESM build'i yüklüyor, wallet-toolbox ise CJS build'i: `PrivateKey === require('@bsv/sdk').PrivateKey` → **false** (iki kopya). (b) tsconfig `paths` ile `@bsv/sdk` → `dist/cjs/mod.js` tsx'te uygulanıyor, ama ESM'den **isimli** import başarısız oluyor (`does not provide an export named 'PrivateKey'`). Yani yukarıdaki yöntem tsx çalışma zamanında olduğu gibi çalışmıyor. (c) **Çalışan yol:** wallet-toolbox kullanan paket **CommonJS** olarak çalışır (`package.json`'da `"type"` yok; tsx import'ları `require`'a çevirir → tek kopya, **true**). Tip denetimi için tsconfig `"module": "NodeNext", "moduleResolution": "NodeNext"` (bizim kod da wallet-toolbox da `dist/cjs` tiplerini görür). Top-level await yerine `main().catch(…)`. Örnek: `scripts/package.json`, `scripts/tsconfig.json`. Testlerde kit'in vitest alias'ı aynen çalışıyor. A, `@agentcoop/core` için hangi yolu seçtiğini STATUS'a yazar.
>
> **Ek (D, 2026-10-30 17:45, A.P0 `main`'e geldikten sonra; Node 22.22, tsx 4.23).** A'nın köprüsü `packages/core/src/sdk.ts` → `export * from '…/@bsv/sdk/dist/cjs/mod.js'` **vitest'te çalışıyor** (alias), ama **tsx/Node çalışma zamanında çalışmıyor**: Node'un ESM→CJS köprüsü (cjs-module-lexer) SDK CJS build'inin 186 export'undan **58'ini göremiyor** (`PrivateKey`, `PublicKey`, `Transaction`, `Script`, `LockingScript`, `P2PKH`, `WalletClient`, `CachedKeyDeriver`…). Belirti: `SyntaxError: The requested module '../sdk' does not provide an export named 'LockingScript'` (A'nın `scripts/lineage-check.ts`'i dahil her `@agentcoop/core` kullanıcısı). **Denenen çözüm:** kök, `packages/core`, `scripts`, `apps/*` `package.json`'larından `"type": "module"` kaldırılınca (CJS; tsx import'ları `require`'a çevirir) core + guard + `verifyLineage` yükleniyor ve süreçte **tek** SDK kopyası var (`PrivateKey === require('@bsv/sdk').PrivateKey`); yalnızca top-level `await` kullanan betikler (`lineage-check.ts`) `main().catch(…)`'a çevrilmeli. Karar A'nın (STATUS → Blokajlar).

### 3.2 Sabitler

| Ad | Değer | Not |
|---|---|---|
| OP_RETURN zarfı | `OP_FALSE OP_RETURN "agentcoop" <op> <json>` | `op ∈ pool \| pledge \| settle \| list \| vault`; json UTF-8, tüm sayılar **string** |
| Kredi token'ı | BSV-21, kit'in `TOKEN_PROTOCOL = [1,'bsv21 token']`, basket `bsv21` | Kit'in `TokenKit` ve `addresses.ts` **kopyalanır**, yeniden yazılmaz |
| Pledge coin anahtarı | protocol `[1,'agentcoop pledge']`, keyID = rastgele nonce, counterparty `'anyone'`, basket `agentcoop` | Basket'te her an **tek aktif pledge** (kör imza zararını sınırlamak için) |
| Vault anahtarları | protocol `[1,'agentcoop vault']`, keyID = vaultId, counterparty `'anyone'`, basket `agentcoop vault` | Sahip (Desktop), ajan ve guard (wallet-toolbox). Ajanın ve guard'ın vault anahtarı herkesçe `new KeyDeriver('anyone').derivePublicKey(proto, vaultId, identityKey)` ile hesaplanır (= kendi `getPublicKey(forSelf:true)`'ları; D.P1'de doğrulandı) |
| Vault script'i ve kaydı (D.P1) | `OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF` (109 B, hex `6321{o}ac675221{a}21{g}52ae68`). Unlock: sahip `<sig> OP_1` (**75**), 2-of-2 `OP_0 <sigA> <sigG> OP_0` (**150**); sighash ALL\|FORKID, subscript = tüm script. Kayıt: `OP_RETURN agentcoop vault {v:'1', vaultId (32 hex), owner, agent, guard}` (**identity key**'ler, üçü farklı) | Fonlama tx'i: `out0` vault coin, `out1` kayıt (`randomizeOutputs:false`). Overlay için geçerlilik: kayıt geçerli **ve** `out0` script'i = kayıttan türetilen script. Kayıtsız vault coin'leri (para üstü, vault'lu pledge coin) script eşitliğiyle tanınır. Ayrıntı: `plan/phases/D-P1.md` §6, kod `packages/core/src/scripts/vault.ts` |
| Sağlayıcı gelir anahtarı | protocol `[1,'agentcoop provider']`, keyID = poolNonce, counterparty `'anyone'`, basket `agentcoop revenue` | Settlement çıktısı 0 ve kayıt bedelleri buraya; `sweep-revenue` ile default'a taşınır |
| Overlay isimleri | topic `tm_agentcoop`, service `ls_agentcoop` (BRC-87: rakam yok) | Kredi token'ları için kit'in kuralları aynı topic içinde |
| Teklif UTXO'su (A-P1) | kredi UTXO'su `[1,'agentcoop provider']`, keyID `offer <poolNonce>`, `'anyone'` P2PKH'ye taşınır; basket `agentcoop offers`; customInstructions `{ protocolID, keyID, counterparty, payKeyID: poolNonce, tokenId, credits }` | Token receive adresinde kalmaz → `TokenKit.sync/send` dokunmaz. `payScriptHex` = P2PKH(`[1,'agentcoop provider']`, keyID = poolNonce). Pool OP_RETURN json = terms − `poolId` + `nonce` |
| Market anahtarları (A-P2) | listelenen kredi `[1,'agentcoop market']` keyID `list <nonce>` P2PKH, basket `agentcoop listings`; satış bedeli keyID `pay <nonce>`; aynı tx'te `OP_RETURN list { v, tokenId, credits, askSats, seller }` | Teklif UTXO'suyla aynı neden: TokenKit dokunmaz |
| Outpoint biçimi (A-P1) | AgentCoop verisinde her yerde `txid_vout`; yalnız cüzdan çağrılarında `txid.vout` (`toWalletOutpoint`) | |
| `pledgeListHash` (A-P1) | `sha256_hex(join(',', sort_lex(dahil outpoint'ler)))` | Seçim sırası ayrı kural (blockHeight, txid); hash zincir bilgisi gerektirmez |
| Settlement para üstü (A-P1) | Katılımcı yayından sonra `internalizeSettlement` ile para üstünü `agentcoop` basket'ine `change:true` işaretiyle alır, harcanan pledge coin'ini `relinquishOutput` eder | "Tek aktif pledge" kontrolü `change:true` çıktıları saymaz |
| Settlement sighash | sağlayıcı girdisi `SIGHASH_SINGLE \| ANYONECANPAY \| FORKID`; katılımcı girdileri `SIGHASH_ALL \| FORKID` | BIP-143 ön görüntüsü SINGLE\|ACP'de de tx `version`, `lockTime` ve girdinin `sequence`'ını içerir: teklif `version=1`, `lockTime=0`, in0 `sequence=0xffffffff` ile imzalanır ve **settlement bu değerlerle kurulmalı**, yoksa teklif geçersiz olur (B.P1). Koordinatörün `verifyOffer`'ı bu değerlerle doğrular |
| Liste (market) sighash | satıcı `SINGLE \| ANYONECANPAY \| FORKID`; alıcı `ALL \| FORKID` | Sağlayıcı teklifiyle aynı primitif |
| Arcade | `https://arcade-v2-us-1.bsvblockchain.tech` | Yayın (EF), tx durumu, header'lar `/chaintracks/v2` |
| Redeem sınırı | tek seferde ≤ 20 kredi, ajan başına bekleyen ≤ 20 kredi | §4.7. gpu-h100'de 1 kredi = 1 GPU-saat, yani bekleyen ≤ 20 GPU-saat (≈ bir fine-tune oturumu). Bekleyen bakiye dakika olarak tutulur |
| Koordinatör sıralaması | `(blockHeight asc, txid asc)`; mine edilmemişler en sonda `txid asc` | OP_RETURN `settle.pledgeListHash = sha256(join(outpoints sorted))` |
| Fazla dolum / tur | hedefin %120'sine kadar pledge kabul; en fazla 3 imza turu; tur zaman aşımı 60 sn | İmzalamayan outpoint kara listeye |

### 3.3 Tipler (`packages/core/src/types.ts`, A yazar, herkes import eder)

```ts
export interface PoolTerms {
  v: '1'
  poolId: string              // kredi UTXO outpoint'i "txid_vout" (= teklif girdisi). ZİNCİRDEKİ OP_RETURN pool
                              // json'unda YOK (tx kendi txid'ini içeremez); overlay `${txid}_0` olarak türetir (B.P1)
  provider: string            // sağlayıcı identity key (teklifi imzalayan cüzdan)
  providerApi: string         // https://... provider-api kökü
  tokenId: string             // BSV-21 kredi token id
  credits: string             // N, base units
  priceSats: string           // P, tüm blok için
  payScriptHex: string        // çıktı 0'ın locking script'i (sağlayıcı gelir anahtarı P2PKH)
  feeSats: string             // pledge başına iadesiz kayıt bedeli (aynı payScript'e)
  minCredits: string          // bir pledge'in en az alabileceği kredi
  deadlineHeight: string      // blok yüksekliği
  backstopMax?: string        // Y (K3; şimdilik bilgi)
  label: string               // "8×H100 · 1 week"
  retailSatsPerCredit: string // bilgi: perakende fiyat
}

export interface PledgeRecord {       // OP_RETURN op=pledge
  v: '1'; poolId: string; credits: string
  participant: string                 // identity key
  tokenIndex: string                  // kredi çıktısının gideceği receive address index'i (kit addresses.ts)
  signer: 'p2pkh' | 'vault'           // pledge coin'in tipi → koordinatör unlockingScriptLength'i buradan bilir
}
// Pledge tx düzeni (randomizeOutputs:false): out0 = pledge coin, out1 = feeSats → payScript, out2 = OP_RETURN pledge
// Para üstü kuralı: settlement'ta katılımcının para üstü, pledge coin'in KENDİ locking script'ine döner.

export interface Offer {              // sağlayıcının önceden imzalı girdisi (zincir dışı veri)
  poolId: string                      // = outpoint
  unlockingScriptHex: string          // <sig SINGLE|ACP|FORKID> <pubkey>
  lockingScriptHex: string; satoshis: number
  terms: PoolTerms
}

export interface Listing {            // market (op=list OP_RETURN + zincir dışı imza)
  outpoint: string; tokenId: string; credits: string; askSats: string
  seller: string; unlockingScriptHex: string; lockingScriptHex: string
  payScriptHex: string                // satıcının ödeme script'i (aynı index'teki çıktı)
}

export interface SettlementPlan {     // koordinatör üretir, katılımcılar doğrular
  poolId: string; round: number
  participants: Array<{ outpoint: string; participant: string; credits: string; signer: 'p2pkh'|'vault'; changeSats: string }>
  pledgeListHash: string
  templateBEEF: number[]              // imzasız tx + tüm girdilerin kaynak tx'leri (AtomicBEEF)
}

export interface InputSigner {        // A tanımlar; A: P2pkhWalletSigner, D: VaultSigner
  unlockingScriptLength: number
  sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript>
}
// VaultSigner (D, packages/core/src/signers/VaultSigner.ts): unlockingScriptLength = 150; `tx`'te HER girdinin
// sourceTransaction'ı olmalı (guard ücret ve vault çıkışını bunlardan hesaplar). Guard reddederse CosignRejected { status, reason } fırlatır.
```

### 3.4 Core fonksiyon yüzeyi (A; imzalar dondurulur, gövdeler gelişir)

```ts
// scripts
buildOpReturn(op, json): LockingScript
parseOpReturn(script): { op, json } | null
vaultLockingScript(ownerPub, agentPub, guardPub): LockingScript        // D: packages/core/src/scripts/vault.ts (D.P1 yazdı; A iskeleti gelince yerinde kalır)
htlcLockingScript(hash, agentPub, guardPub, makerPub): LockingScript     // D doldurur

// offer / pledge / settlement
buildReserveAndAnnounce(wallet, kitTokenKit, terms): Promise<{ txid, poolId }>   // N krediyi tek UTXO'ya al + OP_RETURN pool
signOffer(wallet, outpoint, terms): Promise<Offer>                                 // SINGLE|ACP
buildPledge(wallet, terms, credits, signer:'p2pkh'|'vault', vaultScript?): Promise<{ txid, outpoint }>
cancelPledge(wallet, outpoint): Promise<{ txid, beef }>                           // beef = AtomicBEEF; çağıran tm_agentcoop'a submit eder (B.P1)
planSettlement(offer, pledges, chain): SettlementPlan                              // deterministik: kural sırasında tam N yapan sözlükçe-ilk alt küme; ücret, para üstü
verifySettlementPlan(plan, offer, myOutpoint, opts): Promise<void>                 // DvP kontrolü + verifyLineage; hata fırlatır
signSettlementInput(plan, inputIndex, signer: InputSigner): Promise<UnlockingScript>
assembleSettlement(plan, unlockingScripts): Transaction
broadcastEF(tx, arcadeUrl): Promise<string>

// market
signListing(wallet, outpoint, askSats): Promise<Listing>
buildSweep(wallet, listings[]): Promise<{ plan }>                                  // alıcı tarafı

// doğrulama
verifyLineage(outpoint, { arcadeUrl, wocUrl }): Promise<{ ok, tokenId, amt, ownerPkh }>  // ataları çek, rules.ts'i yerelde uygula

// signers
new P2pkhWalletSigner(wallet, { protocolID, keyID })

// A-P1 eklemeleri (kırıcı değil; tam imzalar packages/core/src/pool/*.ts)
verifyOffer(offer, { sourceTx }): void                                             // çevrimdışı: kredi miktarı/token, SINGLE|ACP imzası Spend ile
planTransaction(plan): Transaction                                                  // templateBEEF → tx
internalizeSettlement(wallet, tx, plan, myOutpoint, pledgeInstructions): Promise<void>
fetchChainPolicy(arcadeUrl): Promise<{ height, satsPerKb, maxTxSize? }>            // Arcade /health; planSettlement'ın `chain`'i
// A-P2: doğrulama ve market (MASTER'daki `buildSweep(wallet, listings[]): { plan }` bununla DEĞİŞTİ; henüz kullanan yoktu)
verifyLineage(outpoint, { fetchTx?, arcadeUrl?, wocUrl?, maxDepth?, cache? }): Promise<{ ok, tokenId?, amt?: bigint, ownerPkh?, depth, reason? }>
reserveListing(wallet, kit, tokenId, credits, askSats): Promise<{ txid, outpoint, beef }>   // signListing'den önce
signListing(wallet, outpoint, askSats): Promise<Listing> · verifyListing(listing, { sourceTx }): void
buildSweep(wallet, kit, listings[], { verifyLineage?=true, lineage?, getBeef? }): Promise<{ txid, credits, tx }>
cancelListing(wallet, kit, outpoint) · cancelPool(wallet, kit, poolId) · reclaimReserved(wallet, kit, outpoint, basket)
// hata kodları (AgentCoopError.code): BAD_OP_RETURN, BAD_TERMS, BAD_OFFER, BAD_PLEDGE, BAD_PLAN, BAD_SIGNATURE, BAD_LISTING, LINEAGE_FAILED, DEADLINE_PASSED, NOT_IMPLEMENTED
// parametre şekilleri: buildPledge(..., opts: { tokenIndex, originator?, bufferSats?, allowMultiple? })
//   planSettlement(offer, PledgeCandidate[], { height, satsPerKb, offerSourceTx }, { round?, exclude? })
//   verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, expectedCreditPkh?, maxFeeSats?, verifyLineage? })
```

### 3.5 Koordinatör / yan API (B) — `COOP_API_URL`

| Yöntem | Yol | Ne yapar |
|---|---|---|
| `POST` | `/offers` | `Offer` kaydet (sağlayıcı CLI çağırır). Doğrular: outpoint harcanmamış, imza geçerli |
| `GET` | `/offers/:poolId` | Offer getir |
| `GET` | `/pools` · `/pools/:poolId` | Terms + ilerleme (`pledgedCredits`, `target`, `status: open\|locking\|settled\|failed\|cancelled`, `hasOffer`). `cancelled` = kredi UTXO'su settlement dışı bir tx'le harcandı. `failed` ve `locking` yan API'de türetilir (yükseklik / koordinatör turu); overlay yalnızca `open\|settled\|cancelled` bilir |
| `GET` | `/pools/:poolId/pledges` | Harcanmamış pledge'ler (overlay'den) |
| (ek) | `/pools/:poolId` cevabında `coordinator` | Havuz turlandıysa: `{ round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome: 'settled'\|'failed', missing, txid? } }` (B.P2). `GET /healthz` → `engine: true\|false` |
| `POST` | `/listings` · `GET /listings?tokenId=` | Market listeleri. `POST` zincire karşı doğrular (outpoint overlay'de admit edilmiş, harcanmamış kredi çıktısı; `tokenId`/`credits` eşleşiyor; imza `0xC3` ve girdi ↔ aynı index'teki çıktı = `askSats → payScriptHex`). `GET` yalnızca hâlâ harcanmamışları, en ucuz (`askSats/credits`) önce döndürür (B.P3) |
| `WS` | `/ws` | Katılımcı oturumu ve canlı akış |

**WS mesajları** (JSON, `type` alanı):
- `hello { identity, poolIds[] }` → katılımcı kaydolur (imza turlarına çağrılmak için)
- `pool_update { poolId, pledgedCredits, status }` (herkese)
- `sign_request { poolId, round, plan: SettlementPlan, yourInputIndex }`
- `sign_response { poolId, round, inputIndex, unlockingScriptHex }` | `sign_reject { poolId, round, reason }`
- `settled { poolId, txid }` · `round_failed { poolId, round, missing: outpoint[] }` · `pool_failed { poolId }`

### 3.6 Sağlayıcı API (C) — BRC-105 (`@bsv/auth-express-middleware` + `@bsv/payment-express-middleware`)

| Yöntem | Yol | Ücret | Ne yapar |
|---|---|---|---|
| `GET` | `/healthz` | 0 (auth yok) | canlılık |
| `GET` | `/v1/catalog` | 0 | `provider.server`, ürünler (`retailSatsPerCredit`, `minutesPerCredit`, `tokenId`), `credits: { maxRedeem, maxPending, redeemTo }` (`redeemTo` = provider-api kimliği, kredilerin gönderileceği yer), açık havuzlar (COOP_API'den) |
| `POST` | `/v1/jobs` `{ kind, minutes, product? }` | `ceil(minutes × retailSatsPerCredit / minutesPerCredit)` sat (dakika bazında); ön ödemeli bakiye `minutes`'ı karşılıyorsa **0** (bakiyeden dakika düşülür) | simüle işi kuyruğa al; `{ jobId }` |
| `GET` | `/v1/jobs/:id` | 0 | durum, "GPU log", sonuç hash'i |
| `POST` | `/v1/credits/redeem` `{ beef, outputIndex }` | 0 (auth zorunlu) | BSV-21 transferini doğrula: ürünün token'ı, çıktı provider-api'nin token adreslerinden birine kilitli, ≤ 20 kredi ve bekleyen ≤ 20, **gönderen = çağıran** (tx çağıranın kendi token çıktılarını harcıyor; overlay'de gördüğü transferi başkası sahiplenemez), soy (`verifyLineage`; A.P2'ye kadar overlay), tek kullanım. `bsv21` basket'ine al, bakiyeye yaz. Hata kodları: `ERR_WRONG_TOKEN`, `ERR_NOT_OURS`, `ERR_REDEEM_LIMIT`, `ERR_NOT_SENDER` (403), `ERR_BAD_LINEAGE`, `ERR_REDEEM_REPLAYED` (409) |
| `POST` | `/v1/credits/return` `{ credits, product? }` | 0 (auth) | kullanılmayan **tam** krediyi token olarak geri gönder (kit `TokenKit.send`); bir krediden küçük artık ön ödemeli kalır. `{ txid, credits, prepaidMinutes }` |
| `GET` | `/v1/credits/balance` | 0 (auth) | ön ödemeli bakiye: ürün başına `{ minutesPerCredit, prepaidMinutes, returnableCredits }` |

Ürün konfigürasyonu `apps/provider-api/products/<id>.json`: `{ id, label, unit, retailSatsPerCredit, minutesPerCredit?, tokenId, simulate: { minutesPerSecond, gpus? } }` (`minutesPerCredit` = bir kredinin kaç GPU-dakika olduğu, varsayılan 1; **gpu-h100: 60**. Redeem edilen kredi bakiyeye `credits × minutesPerCredit` dakika ekler, işler dakika düşer. `gpus` = aynı anda koşan iş sayısı, varsayılan 8). SmartRoute ileride ayrı bir `products/` kaydı ve ayrı bir "runner" olur.

### 3.7 Guard API (D) — `GUARD_URL`

| Yöntem | Yol | Ne yapar |
|---|---|---|
| `PUT` | `/vaults/:vaultId` **(D.P1 eki)** | sahip kaydı (BRC-103 AuthFetch, kimlik = `owner`): gövde = vault kaydı `{ v:'1', vaultId, owner, agent, guard }`. Guard script'i kendisi türetir → `{ vaultId, lockingScriptHex, guardPub }`; sahip CLI'ı eşit değilse fonlamaz. Aynı vaultId başka anahtarlarla → 409 |
| `PUT` | `/policies/:agentIdentity` | sahip CLI yazar: `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }` (sayılar sat, tam sayı; sahip imzasıyla, BRC-103 AuthFetch). **(sahip, ajan) çiftine yazılır**; sahibin o ajanla kayıtlı vault'u yoksa 404 |
| `GET` | `/vaults/:vaultId` **(D.P1 eki)** | sahip veya ajan (BRC-103): kayıt, script, politika, son 7 günde harcanan |
| `POST` | `/cosign` `{ plan \| txBEEF, inputIndex, agent, agentSignatureHex, context: { kind: 'settle'\|'pay'\|'rail', poolId?, expectedCredits?, tokenId?, payees?: [{ vout, provider, keyID }] } }` | politikayı ve DvP'yi kontrol eder → `{ signatureHex, guardPub }` veya `403 { reason }` / `400 { reason }`. **(D.P1 ekleri:)** `agentSignatureHex` = ajanın aynı sighash üzerindeki imzası (guard sighash'i **kendisi** hesaplar ve önce bunu doğrular); imzalar checksig biçimi (DER ‖ `0x41`), hex; `txBEEF` AtomicBEEF (`number[]` veya hex), her girdinin kaynağıyla; `payees` = ödeme çıktılarının alıcı kanıtı (guard `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))`'i yeniden hesaplar). Tx başına vault başına tek girdi; tx final olmalı (lockTime 0). D.P1'de yalnızca `kind:'pay'`; `settle` D.P2, `rail` D.P3. Kontrol listesi: `plan/phases/D-P1.md` §7.2 |
| `GET` | `/healthz` | `{ ok, identityKey, network }` |
| `GET` | `/policies/:agentIdentity` **(E için; D.P2)** | sahip veya ajan (BRC-103): yüklü politika + `updatedAt`, `owner`; yoksa 404 |
| `GET` | `/decisions?agent=&limit=` **(E için; D.P2)** | sahip veya ajan (BRC-103): guard kararları yeni → eski `{ id, ts, agent, vaultId?, kind, poolId?, sats?, outcome: 'approved'\|'denied', reason?, txid? }` (`data/guard/decisions.jsonl`) |
| `GET` | `/events` **(E için; D.P2)** | SSE, MASTER §3.10 zarfı: `cosign_approved`, `cosign_denied`, `policy_updated`, `vault_registered`, `vault_paused`/`vault_resumed` (Faz 5B). Kimliksiz okunabilir (yalnız kısaltılmış identity ve nedenler; tutarlar dahil, gizli yok); `Last-Event-ID` ile devam |

### 3.8 Overlay lookup (B) — `POST /lookup { service:'ls_agentcoop', query }`

`{ op:'pools', status? }`, `{ op:'pool', poolId }`, `{ op:'pledges', poolId, includeSpent?, includeInvalid? }`, `{ op:'settlement', poolId }`, `{ op:'listings', tokenId? }`, `{ op:'vaults', owner? }` + kit'in token sorguları (`identity`, `utxos`, `token`, `outpoint`, `history`).

Cevaptaki her çıktının `context`'i (UTF-8 JSON, B.P1):
- `pools`/`pool` → `{ poolId, txid, terms, status: open|settled|cancelled, pledgedCredits, pledgeCount, target, settledTxid?, spendingTxid?, createdHeight?, invalidReason? }` (çıktı = havuzun OP_RETURN kaydı)
- `pledges` → `{ outpoint, txid, vout, poolId, participant, credits, tokenIndex, signer, coinSats, height?, spent, spendingTxid?, valid, invalidReason? }` (çıktı = pledge coin; sıra `height` asc, mine edilmemiş en sonda, sonra `txid`)
- `settlement` → `{ poolId, txid, pledgeListHash, inputs: outpoint[] }`

**Pledge geçerlilik kuralı** (sorgu anında; `buildPledge` buna uymalı): havuz var ve `open`; `minCredits ≤ credits ≤ credits(N)`; `out1.satoshis ≥ feeSats` ve `out1.lockingScript = payScriptHex`; `out0.satoshis ≥ ceil(credits × priceSats / N) + 1`. `pledgedCredits` = geçerli ve harcanmamış pledge'lerin `credits` toplamı.

**Kayıt indeksleme:** `agentcoop` OP_RETURN kayıt çıktıları (0 sat) topic'e **admit edilir** (lookup cevapları depodaki çıktılara çözüldüğü için). Settle kaydı yalnızca `in0 = poolId` ise geçerli.

**Vault'lar (B.P3):** `vault` kaydının çıktısı ve vault şablonuna uyan **her** çıktı (`OP_IF <33> OP_CHECKSIG OP_ELSE OP_2 <33> <33> OP_2 OP_CHECKMULTISIG OP_ENDIF`, kayıt taşımayan para üstleri dahil) admit edilir; script hex ile birleştirilir. `{ op:'vaults', owner?, includeUnverified? }` / `{ op:'vault', vaultId }` → `{ vaultId, owner, agent, guard, scriptHex, verified, balanceSats, utxos: [{ outpoint, satoshis }] }`. `verified` = kayıttaki script, `owner/agent/guard` kimliklerinden `[1,'agentcoop vault']`, keyID = `vaultId`, `'anyone'` ile türetilen anahtarlarla yeniden hesaplanan script'e eşit. Doğrulanmamış kayıtlar varsayılan olarak gösterilmez. **D:** fonlama tx'i bu kaydı taşımalı; script D 1.1'deki gibi.
`{ op:'listings', tokenId? }` → zincirdeki opsiyonel `OP_RETURN list` kayıtları (ham). Esas liste defteri koordinatörün `GET /listings`'i.

**Olay akışı (B.P3):** overlay `GET /agentcoop/events` (SSE) → her kabul/harcanmada `data: { type: 'admitted'|'spent', txid }`. Koordinatör ve UI anlık güncelleme için abone olabilir.

### 3.9 Ortam değişkenleri (`.env.example`, D yönetir)

```
NETWORK=main
ARCADE_URL=https://arcade-v2-us-1.bsvblockchain.tech
OVERLAY_URL=http://localhost:8080
COOP_API_URL=http://localhost:8090
GUARD_URL=http://localhost:8091
PROVIDER_API_URL=http://localhost:8092
# sunucu cüzdanları (64 hex; scripts/keygen.ts üretir; ASLA commit etme)
WALLET_PROVIDER_API_KEY=   WALLET_COORDINATOR_KEY=   WALLET_GUARD_KEY=
WALLET_AGENT_1_KEY=  WALLET_AGENT_2_KEY=  WALLET_AGENT_3_KEY=  WALLET_MAKER_KEY=
# overlay + koordinatör (B; infra/run.mjs) — D.P1'de eklendi
OVERLAY_PORT=8080  COOP_PORT=8090  OVERLAY_PRIVATE_KEY=(gizli, boşsa data/overlay/overlay.key)  TOKEN_WHITELIST=
ROUND_TIMEOUT_MS=60000  MAX_ROUNDS=3  SPENT_CHECK=woc|none  # DATA_DIR yalnızca infra/run.mjs
# Desktop'a bağlanan CLI'lar için originator
APP_ORIGINATOR=agentcoop.local
# ajan beyni
ANTHROPIC_API_KEY=   AGENT_BRAIN=llm|rules
# Rail PoC
BASE_RPC_URL=  BASE_PRIVATE_KEY=  BASE_USDC_ADDRESS=
# ajan olay akışı (C; §3.10)
AGENTS_URL=http://localhost:8093
# frontend (E, apps/web; Vite build-time; yalnızca URL'ler, gizli yok)
VITE_COOP_API_URL=  VITE_OVERLAY_URL=  VITE_PROVIDER_API_URL=  VITE_GUARD_URL=  VITE_AGENTS_URL=  VITE_ARCADE_URL=  VITE_NETWORK=main  VITE_DATA_MODE=live|mock|replay
```

### 3.10 Frontend olay akışları ve tarayıcı kuralları (E; 30.10 eklendi)

**Tarayıcı kuralı.** `apps/web` tarayıcıda çalışır, wallet-toolbox içermez; `@bsv/sdk`'nın **ESM** build'ini kullanır (tek kopya). `@agentcoop/core` **index**'i tarayıcı-güvenli kalmalı (`node:*` ve wallet-toolbox importu yalnızca `@agentcoop/core/node/*` altında). `packages/core/src/sdk.ts` CJS yolunu re-export ettiği için web, Vite `resolve.alias` ile `/@bsv\/sdk\/dist\/cjs\/mod\.js$/` → `@bsv/sdk` yönlendirmesi yapar (yetmezse A `exports`'a `"browser"` koşulu ekler). Tüm imzalar kullanıcının **BSV Desktop**'ında (`WalletClient('auto')`, originator = sayfa origin'i); özel anahtar hiçbir zaman tarayıcıda yok. Yerelde CORS'u Vite proxy atlar; yayında overlay/koordinatör (B Faz 5.3), provider-api (C) ve guard (D) CORS verir; provider-api ve guard ayrıca BRC-103/105 başlıklarını açığa çıkarır (`Access-Control-Expose-Headers: x-bsv-auth-*, x-bsv-payment-*`; guide §10.5).

**Olay zarfı** (`CoopEvent`; her kaynağın adaptörü bunu üretir; replay dosyası bunun JSONL'i):

```ts
export interface CoopEvent<T extends string = string, D = unknown> {
  id: string          // kaynak içinde artan ("coordinator:1042") veya ulid; SSE `id:` ile aynı
  ts: string          // ISO-8601
  src: 'coordinator' | 'overlay' | 'provider' | 'agents' | 'guard' | 'maker' | 'web'
  type: T
  data: D
  txid?: string; poolId?: string; agent?: string   // identity key; filtreleme için
}
```

SSE biçimi (her kaynak için aynı): `id: <id>\ndata: <CoopEvent json>\n\n`; 15 sn'de bir `: keepalive`; `Last-Event-ID` ile kaldığı yerden (kaynak en az son 500 olayı tutar). Mevcut kaynaklar zarfsız kalabilir (koordinatör WS mesajları, overlay `{ type, txid }`); web adaptörü zarflar. **Yeni** akışlar (agents, guard, provider, maker) doğrudan zarfı üretir.

| Kaynak | Yol | Olay tipleri (`type`) → `data` | Durum |
|---|---|---|---|
| koordinatör (B) | WS `/ws` | `pool_update`, `sign_request`, `settled`, `round_failed`, `pool_failed`, `hello_ack`, `error` (§3.5) | var |
| overlay (B) | SSE `/agentcoop/events` | `admitted { txid }`, `spent { txid }` (§3.8). Web bunlardan türetir: `pool_opened`, `pledge_added`, `pledge_cancelled`, `pool_settled`, `pool_cancelled`, `listing_added`, `listing_filled`, `listing_cancelled`, `vault_funded`, `vault_spent` | var |
| ajanlar (C) | SSE `{AGENTS_URL}/events`, `GET {AGENTS_URL}/agents` | `agent_started { name, profile, identity }`, `agent_thought { text }`, `agent_decision { action: 'pledge'\|'skip'\|'redeem'\|'retail'\|'list'\|'buy'\|'sign'\|'reject', poolId?, credits?, sats?, reason }`, `agent_job { jobId, kind, minutes, status }`, `agent_payment { kind: '402'\|'pledge'\|'redeem'\|'sweep', txid, sats? }`, `agent_injected { text }` (demo-injection). `GET /agents` → `[{ name, profile, identity, mode: 'p2pkh'\|'vault', vaultId? }]` | **istek (E → C)**; yedek: `apps/web/tools/log-relay.mjs` `activity.log`'u SSE'ye çevirir |
| guard (D) | SSE `{GUARD_URL}/events` | `cosign_approved { agent, vaultId, kind, poolId?, sats, txid? }`, `cosign_denied { agent, vaultId, kind, poolId?, sats?, reason }`, `policy_updated { agent }`, `vault_registered { vaultId, owner, agent }`, `vault_paused { agent }` | D.P2 |
| sağlayıcı (C, opsiyonel) | SSE `/v1/events` | `job_queued`/`job_running`/`job_done { jobId, owner, kind, minutes, resultHash? }`, `credits_redeemed { agent, credits, txid }`, `payment_received { txid, sats, owner }` | düşük öncelik; yedek `GET /v1/jobs/:id` poll |
| maker (D, Rail) | SSE `{MAKER_URL}/events`, `GET /quote?dir=&amount=` | `rail_quote`, `rail_locked_base { txHash }`, `rail_funded_bsv { txid }`, `rail_claimed { txid, txHash }`, `rail_refunded` | D.P3/P5 |

**Replay dosyası:** `apps/web/public/replays/<ad>.jsonl`, satır = `CoopEvent`; `apps/web/tools/record.mjs` tüm kaynaklara abone olup yazar. Gerçek mainnet koşuları kaydedilir ve commit edilir (txid'ler gerçek).

---

## 4. Kurallar (herkes için)

1. `docs/AGENTS.md` kuralları aynen geçerli. Özellikle: `randomizeOutputs:false`; çıktı index'ini script'e göre bul; asla `P2PKH(identityKey)`; token ve pledge'ler asla `default` basket'e; BRC-29'da counterparty karşı taraf; 402'de resmi middleware, icat edilmiş header yok.
2. **Kit'ten kopyala, yeniden yazma:** `TokenKit`, `OverlayClient`, `signWalletP2pkhInput`, `createBrc29Payment/acceptBrc29Payment`, `ArcadeChainTracker`, `beefFromArcade`, `rules.ts`, `inscription.ts`, `mockchain.ts`. Hepsi `docs/starter/bsv21-token-kit/` altında ve guide Appendix A'da.
3. **Önce mockchain, sonra mainnet.** Her builder için önce `test/` altında mockchain testi, sonra küçük tutarla mainnet.
4. **API adı tahmin etme.** `node_modules/@bsv/*/dist/**/*.d.ts` içinde doğrula. Guide §24 cheat sheet.
5. **Arayüz değişikliği** = önce bu dosya §3, sonra `STATUS.md` → "Arayüz değişiklikleri".
6. Her faz sonunda **Checkpoint** (track dosyalarında yazılı). Atlanmaz.
7. Özel anahtar, seed, `.env`, `data/` asla commit edilmez. `git add -A` yerine dosya adıyla ekle.
8. Mainnet'te yapılan her işlemin txid'si `STATUS.md` → "Mainnet işlemleri" tablosuna yazılır (tip, txid, kim, ne zaman). README için bunlar toplanacak.

---

## 5. Fazlar ve senkron noktaları

| Senkron | Tanım | Kimler bitirmiş olmalı |
|---|---|---|
| **S0** | Repo iskeleti ve `types.ts` var; arayüzler donmuş; cüzdanlar üretilmiş; sats talebi gönderilmiş; kit testleri yeşil; doğrulama testleri 1, 2, 3, 8 bitmiş | A.P0, B.P0, C.P0, D.P0 |
| **S1 — Walking skeleton** | Yalnızca sunucu cüzdanlarıyla, 1 sağlayıcı + 2 ajan, **mainnet'te ilk DvP settlement** (`scripts/skeleton.ts`), overlay kabul etmiş, WhatsOnChain linki STATUS'ta | A.P1, B.P1 (offer kaydı + indeks), C.P1 (token/ürün), D.P0 (fon) |
| **S2 — K1 entegre** | Desktop ile `provider-cli` mint + open-pool; ajanlar overlay'den havuz bulup pledge veriyor; koordinatör turu; settlement; redeem + 402 iş; dolmayan havuz; `verifyLineage` imza yolunda; **web: havuz gezgini + Kasaba v1 canlı** | A.P2, B.P2, C.P2, D.P1, E.P1 |
| **S3 — K2 entegre** | Vault'lu ajan settlement'a giriyor (guard ortak imza); injection reddi; market liste + sweep; insan pledge'i (participant-cli **ve tarayıcıdan**); Rail PoC sonucu kaydedilmiş; **web: katılımcı/sağlayıcı/sahip/market akışları Desktop ile** | A.P3, B.P3, C.P3, D.P2, D.P3, E.P2, E.P3 |
| **S4 — Freeze** | Testler yeşil; README; value note; threat model; tx linkleri; `npm run demo` tek komut; **web herkese açık URL'de, gerçek replay'li** | herkes P4, E.P5 |

Bağımlılık grafiği (ok = "ihtiyaç duyar"):

```
A.P0 types/sdk ──▶ B.P1, C.P1, D.P1
A.P1 builders  ──▶ B.P2 (koordinatör planSettlement kullanır), C.P2 (ajan pledge/sign), S1
B.P1 offers+indeks ──▶ C.P2 (ajan havuz keşfi), B.P2
C.P1 ürün+token ──▶ S1 (skeleton kendi token'ını da basabilir; C'nin token'ı S2'de)
D.P0 cüzdan/fon ──▶ S1 ve sonrası mainnet
D.P1 vault+guard ──▶ A.P3 (VaultSigner entegrasyon testi), C.P3 (vault'lu ajan)
A.P2 verifyLineage ──▶ C.P2 redeem doğrulaması, D.P2 guard DvP
A.P2 listing/sweep ──▶ B.P3 indeks, C.P3 ajan market davranışı
B.P1–P3 (pools, WS, SSE, vaults, listings) ──▶ E.P1 (gezgin, Kasaba v1), E.P3 (market, vault görünümü)
A.P1/P2 builders (tarayıcıda) + C.P1 provider-api (CORS) ──▶ E.P2 (katılımcı, sağlayıcı akışları)
D.P1/P2 guard API + SSE ──▶ E.P3 (sahip konsolu, bekçi) · D.P3 Rail ──▶ E.P4 (liman) · B.P5 URL'ler ──▶ E.P4 (yayın)
C ajan olay akışı (§3.10) ──▶ E.P1 balonlar (yedek: log-relay)
```

Bağımlılık hazır değilse kural: **stub ile devam et** (arayüz bu dosyada), blokajı STATUS'a yaz.

---

## 6. Cüzdan ve fon yönetimi (D sahibi; herkes uyar)

### 6.1 Envanter

| Cüzdan | Tür | Nerede | Anahtar | Hedef bakiye | Ne için |
|---|---|---|---|---|---|
| `desktop-treasury` | BSV Desktop | bir üyenin laptopu | Desktop seed (yalnızca o üye) | BSVA'dan gelen tüm sats | Diğer her şeyi fonlar; sağlayıcı operatörü rolü (mint, open-pool) |
| `desktop-owner` | BSV Desktop | ikinci laptop | Desktop seed | 60k sat | Ajan sahibi: vault fonla/çek |
| `desktop-human` | BSV Desktop | üçüncü laptop (veya owner ile aynı) | Desktop seed | 30k sat | İnsan katılımcı pledge'i |
| `provider-api` | wallet-toolbox SQLite | sunucu/laptop | `WALLET_PROVIDER_API_KEY` | 20k sat | 402 tahsilatı, kredi iadesi, ücretler |
| `coordinator` | wallet-toolbox | aynı | `WALLET_COORDINATOR_KEY` | 5k sat | yalnızca kimlik + yayın; para tutmaz |
| `guard` | wallet-toolbox | aynı | `WALLET_GUARD_KEY` | 5k sat | yalnızca imza; ücret gerekmez |
| `agent-1..3` | wallet-toolbox | aynı | `WALLET_AGENT_n_KEY` | 50k sat her biri | pledge, 402, market |
| `maker` | wallet-toolbox (+ Base EOA) | aynı | `WALLET_MAKER_KEY`, `BASE_PRIVATE_KEY` | 30k sat + Sepolia ETH/USDC | Rail PoC |

Toplam ≈ **300k sat** marj dahil. Settlement ücreti birkaç yüz sat, 402 ödemeleri yüzlerce sat; asıl tüketim pledge tutarları ve bunlar havuzda sağlayıcıya (bizim cüzdanımız) geri dönüyor, yani **sats takım içinde dolaşıyor**.

### 6.2 Adımlar

1. **Desktop kur (mainnet):** <https://desktop.bsvb.tech>. Kurtarma ifadesini çevrimdışı yaz. Her Desktop bir üyenin.
2. **Sats iste (hemen):** `desktop-treasury`'de Payments → Receive → BSV Address; adresi ve takım adını Telegram'da `@lexamaison`'a gönder. Gelene kadar **mockchain'de** geliştir; S1 için 50k sat yeter.
3. **Sunucu cüzdanlarını üret:** `npx tsx scripts/keygen.ts` → 7 adet 64-hex anahtar basar; `.env`'e yapıştır. `scripts/wallets.ts` → `openWallet(name)` her biri için `data/wallets/<name>.sqlite` açar (guide §14.1 `Setup.createWalletSQLite`, Arcade birincil §14.2). Identity key'leri `scripts/identities.ts` basar; bunlar `.env`'e değil `config/identities.json`'a (commit edilebilir, public).
4. **Fonla:** `npx tsx scripts/fund.ts agent-1=50000 agent-2=50000 provider-api=20000 ...` → Desktop'a `WalletClient('auto', APP_ORIGINATOR)` ile bağlanır, her hedefe BRC-29 ödemesi oluşturur (kit `createBrc29Payment`), hedef cüzdan aynı makinedeyse doğrudan `acceptBrc29Payment` ile içeri alır; değilse `data/payments/<name>.json` yazar ve o makinede `scripts/receive.ts` çalıştırılır. Desktop her ödeme için onay penceresi gösterir.
5. **Kontrol:** `npx tsx scripts/balances.ts` → tüm cüzdanların bakiyesi ve WhatsOnChain linkleri.
6. **Desktop → Desktop fonlama** (owner, human): treasury'den BRC-29 ile aynı script, hedef identity key'i öteki Desktop'tan alınır (`scripts/identities.ts --desktop`).

### 6.3 Güvenlik ve düzen

- `.env`, `data/`, `*.sqlite` gitignore'da. Anahtarlar takım şifre kasasında yedeklenir (seed'ler yedeklenmez, her üye kendi yazar).
- Tek "para kaynağı" `desktop-treasury`; diğer cüzdanlar boşalınca yine oradan fonlanır.
- Mainnet'te ilk kez denenen her şey önce **1.000 sat** ile.
- Kayıp durumunda: wallet-toolbox cüzdanı aynı root key ile sıfırdan `sync` olur; kredi token'ları overlay'den geri gelir (guide §17.6).

### 6.4 Axel'e gönderilecek mesaj (D.P0'da gönderilir; cevap gelene kadar varsayımlarla devam)

> Hi Axel, team **<takım adı>** here (BSV track). Our project is a non-custodial group-buying layer for AI agents on BSV (pool fills → one atomic tx pays the provider and delivers BSV-21 credits). Five quick questions so we design to your criteria:
> 1. Agent budgets sit in a 2-of-2 (agent + policy "guard") output with a unilateral owner-withdraw path. Does that count as non-custodial for judging?
> 2. Agents run wallet-toolbox server wallets; humans use BSV Desktop. Is that sufficient for the "BSV wallets" requirement?
> 3. We index our own overlay topic (`tm_agentcoop`). Is that encouraged? Any public overlay hosting we can use?
> 4. Participants sign a coordinator-built multi-party tx with `createSignature({ hashToDirectlySign })`. Any plan for BSV Desktop to show structured sign requests? (For our threat model note.)
> 5. A short-lived, capped prepaid balance at the provider when credits are redeemed for API calls (≤ one session, returnable): acceptable within non-custodial judging?
> 6. Cross-chain: an HTLC atomic swap USDC (Base) ↔ BSV, with the BSV refund as a pre-signed nLockTime tx (no CLTV). Does that count as a "cross-chain flow", and is a $1–2 swap on Base mainnet OK for the demo?
> Our treasury address for sats: `<adres>`. Thanks!

Sats talebi soru mesajından **ayrı ve önce** gönderilir (adres + takım adı + miktar: ana demo için ~300k, 50 ajanlık ölçek testi için ek ~250k sat). Hazır metin: `plan/phases/D-P0.md` §2.

Varsayımlar (cevap yoksa): 1 evet, 2 evet, 3 kendi overlay'imizi yerel çalıştırırız, 4 yok, 5 README'de açıkça yazılır, 6 evet; Base mainnet yalnızca Faz 5 A yolunda ve $2'yi aşmayan tutarlarla.

---

## 7. STATUS.md disiplini

- Her track'in bir bölümü var. **Yalnızca kendi bölümünü** yazar, diğerlerini okur.
- Her faz sonunda güncellenir: faz, artefaktlar (dosya yolları), bilinen sorunlar, blokajlar, arayüz değişiklikleri, plan değişiklikleri, mainnet tx'leri.
- "Blokajlar" bölümüne yazılan şey insanlara da sözlü iletilir; AI bunu yazıp beklemez, stub ile devam eder.

---

## 8. Tanımlar: "bitti" ne demek

- **Builder bitti** = mockchain testi var ve yeşil + mainnet'te 1 kez çalıştı (txid STATUS'ta).
- **Servis bitti** = `npm run <app>` ile kalkıyor, `.env.example` güncel, bir README bölümü var, en az bir entegrasyon testi var.
- **Faz bitti** = kabul kriterleri sağlandı + Checkpoint yapıldı + STATUS güncellendi.
