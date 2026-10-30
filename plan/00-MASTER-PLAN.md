# AgentCoop — Ana Plan (v1)

> Kaynak fikir: [`FINAL-IDEA.md`](../FINAL-IDEA.md) (v1.1). Bu dosya **nasıl inşa edeceğimizi** anlatır; fikri tekrar etmez.
> Frontend bu planın dışında (ayrıca planlanacak). İnsan akışları şimdilik BSV Desktop'a bağlı **Node CLI'lar** ile yapılır; web UI sonra bunları sarar.

---

## 1. Bu plan nasıl kullanılır

- 4 paralel track var: **A Protokol**, **B Overlay + Koordinatör**, **C Sağlayıcı + Ajanlar**, **D Vault + Ops + Rail + Teslim**. Her track'in kendi dosyası var: `plan/track-*.md`.
- Her track dosyası **fazlara** bölünmüş. AI'a **bir seferde yalnızca bir faz** verilir, dosyanın tamamı tek prompt olarak verilmez.
- Her faz başında AI şu üçünü okur: (1) bu dosyanın §3 Arayüzler ve §4 Kurallar bölümleri, (2) [`STATUS.md`](STATUS.md), (3) kendi track dosyasındaki ilgili faz.
- Her faz sonunda AI **Checkpoint** ritüelini uygular (her fazın sonunda yazılı): plan hâlâ iyi mi, değişecek yer var mı → varsa planı güncelle; bu faz bitti → STATUS'u güncelle; diğer track'ler ne yaptı → STATUS'u oku; bağımlılık hazır mı → değilse stub ile devam et veya blokajı yaz.
- **Tek doğruluk kaynağı:** arayüzler bu dosyada (§3). Bir track arayüz değiştirmek zorunda kalırsa önce burayı günceller, sonra STATUS'ta duyurur.
- Teknik referans: `docs/AGENTS.md` (kurallar), `docs/BSV_STACK_COMPLETE_GUIDE.md` (§ numaralarıyla atıf yapılır), `docs/starter/bsv21-token-kit/` (kopyalanacak test edilmiş kod).

---

## 2. Kapsam kararları (kesinleşti)

| Karar | Sonuç |
|---|---|
| Ana senaryo | **Simüle GPU sağlayıcısı.** Ürün: "H100 GPU-dakika kredisi". Havuz: bir GPU bloğu. İşler (fine-tune, eval, inference) simüle edilir, ama ödeme, kredi ve settlement gerçek ve zincir üstünde |
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
├─ scripts/               [D] keygen, fund, receive, balances, skeleton (A)
├─ data/                  (gitignore) cüzdan sqlite'ları, overlay db
└─ test/                  uçtan uca mockchain senaryoları (herkes ekler)
```

**ESM/CJS kuralı:** wallet-toolbox CJS'dir. Testlerde kit'in `vitest.config.ts` alias'ı kullanılır. Çalışma zamanında wallet-toolbox kullanan her app (`agents`, `provider-api`, `coordinator`, `guard`, `maker`) `@bsv/sdk`'yı **tek bir yerden** import eder: `packages/core/src/sdk.ts` → `export * from '@bsv/sdk'` ve tsconfig `paths` ile CJS build'e yönlendirilir. A bunu P0'da kurar; herkes `@agentcoop/core/sdk` üzerinden import eder. Hata belirtisi: `script[serializedBytes] is not a function`.

### 3.2 Sabitler

| Ad | Değer | Not |
|---|---|---|
| OP_RETURN zarfı | `OP_FALSE OP_RETURN "agentcoop" <op> <json>` | `op ∈ pool \| pledge \| settle \| list \| vault`; json UTF-8, tüm sayılar **string** |
| Kredi token'ı | BSV-21, kit'in `TOKEN_PROTOCOL = [1,'bsv21 token']`, basket `bsv21` | Kit'in `TokenKit` ve `addresses.ts` **kopyalanır**, yeniden yazılmaz |
| Pledge coin anahtarı | protocol `[1,'agentcoop pledge']`, keyID = rastgele nonce, counterparty `'anyone'`, basket `agentcoop` | Basket'te her an **tek aktif pledge** (kör imza zararını sınırlamak için) |
| Vault anahtarları | protocol `[1,'agentcoop vault']`, keyID = vaultId, counterparty `'anyone'`, basket `agentcoop vault` | Sahip (Desktop), ajan ve guard (wallet-toolbox) |
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
| Redeem sınırı | tek seferde ≤ 20 kredi, ajan başına bekleyen ≤ 20 kredi | §4.7 |
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
```

### 3.4 Core fonksiyon yüzeyi (A; imzalar dondurulur, gövdeler gelişir)

```ts
// scripts
buildOpReturn(op, json): LockingScript
parseOpReturn(script): { op, json } | null
vaultLockingScript(ownerPub, agentPub, guardPub): LockingScript        // D doldurur, A iskeleti
htlcLockingScript(hash, agentPub, guardPub, makerPub): LockingScript     // D doldurur

// offer / pledge / settlement
buildReserveAndAnnounce(wallet, kitTokenKit, terms): Promise<{ txid, poolId }>   // N krediyi tek UTXO'ya al + OP_RETURN pool
signOffer(wallet, outpoint, terms): Promise<Offer>                                 // SINGLE|ACP
buildPledge(wallet, terms, credits, signer:'p2pkh'|'vault', vaultScript?): Promise<{ txid, outpoint }>
cancelPledge(wallet, outpoint): Promise<string>                                   // iptal tx'i tm_agentcoop'a submit edilir (B.P1)
planSettlement(offer, pledges, chain): SettlementPlan                              // deterministik sıralama, ücret, para üstü
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
| `POST` | `/listings` · `GET /listings?tokenId=` | Market listeleri |
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
| `GET` | `/v1/catalog` | 0 | ürün, `retailSatsPerCredit`, açık havuzlar (COOP_API'den) |
| `POST` | `/v1/jobs` `{ kind, minutes }` | `minutes × retail`, ön ödemeli bakiye yetiyorsa **0** | simüle işi kuyruğa al; `{ jobId }` |
| `GET` | `/v1/jobs/:id` | 0 | durum, "GPU log", sonuç hash'i |
| `POST` | `/v1/credits/redeem` `{ beef, outputIndex }` | 0 (auth zorunlu) | BSV-21 transferini doğrula (`verifyLineage` + çıktı sağlayıcının token adresine mi), ≤ 20 kredi, bakiyeye yaz |
| `POST` | `/v1/credits/return` `{ credits }` | 0 (auth) | kullanılmayan krediyi token olarak geri gönder (kit `TokenKit.send`) |
| `GET` | `/v1/credits/balance` | 0 (auth) | ön ödemeli bakiye |

Ürün konfigürasyonu `apps/provider-api/products/<id>.json`: `{ id, label, unit, retailSatsPerCredit, tokenId, simulate: { minutesPerSecond } }`. SmartRoute ileride ayrı bir `products/` kaydı ve ayrı bir "runner" olur.

### 3.7 Guard API (D) — `GUARD_URL`

| Yöntem | Yol | Ne yapar |
|---|---|---|
| `PUT` | `/policies/:agentIdentity` | sahip CLI yazar: `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }` (sahip imzasıyla, BRC-103 AuthFetch) |
| `POST` | `/cosign` `{ plan \| txBEEF, inputIndex, agent, context: { kind: 'settle'\|'pay'\|'rail', poolId?, expectedCredits?, tokenId? } }` | politikayı ve DvP'yi kontrol eder → `{ signatureHex }` veya `403 { reason }` |

### 3.8 Overlay lookup (B) — `POST /lookup { service:'ls_agentcoop', query }`

`{ op:'pools', status? }`, `{ op:'pool', poolId }`, `{ op:'pledges', poolId, includeSpent?, includeInvalid? }`, `{ op:'settlement', poolId }`, `{ op:'listings', tokenId? }`, `{ op:'vaults', owner? }` + kit'in token sorguları (`identity`, `utxos`, `token`, `outpoint`, `history`).

Cevaptaki her çıktının `context`'i (UTF-8 JSON, B.P1):
- `pools`/`pool` → `{ poolId, txid, terms, status: open|settled|cancelled, pledgedCredits, pledgeCount, target, settledTxid?, spendingTxid?, createdHeight?, invalidReason? }` (çıktı = havuzun OP_RETURN kaydı)
- `pledges` → `{ outpoint, txid, vout, poolId, participant, credits, tokenIndex, signer, coinSats, height?, spent, spendingTxid?, valid, invalidReason? }` (çıktı = pledge coin; sıra `height` asc, mine edilmemiş en sonda, sonra `txid`)
- `settlement` → `{ poolId, txid, pledgeListHash, inputs: outpoint[] }`

**Pledge geçerlilik kuralı** (sorgu anında; `buildPledge` buna uymalı): havuz var ve `open`; `minCredits ≤ credits ≤ credits(N)`; `out1.satoshis ≥ feeSats` ve `out1.lockingScript = payScriptHex`; `out0.satoshis ≥ ceil(credits × priceSats / N) + 1`. `pledgedCredits` = geçerli ve harcanmamış pledge'lerin `credits` toplamı.

**Kayıt indeksleme:** `agentcoop` OP_RETURN kayıt çıktıları (0 sat) topic'e **admit edilir** (lookup cevapları depodaki çıktılara çözüldüğü için). Settle kaydı yalnızca `in0 = poolId` ise geçerli.

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
# Desktop'a bağlanan CLI'lar için originator
APP_ORIGINATOR=agentcoop.local
# ajan beyni
ANTHROPIC_API_KEY=   AGENT_BRAIN=llm|rules
# Rail PoC
BASE_RPC_URL=  BASE_PRIVATE_KEY=  BASE_USDC_ADDRESS=
```

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
| **S2 — K1 entegre** | Desktop ile `provider-cli` mint + open-pool; ajanlar overlay'den havuz bulup pledge veriyor; koordinatör turu; settlement; redeem + 402 iş; dolmayan havuz; `verifyLineage` imza yolunda | A.P2, B.P2, C.P2, D.P1 |
| **S3 — K2 entegre** | Vault'lu ajan settlement'a giriyor (guard ortak imza); injection reddi; market liste + sweep; insan pledge'i (participant-cli); Rail PoC sonucu kaydedilmiş | A.P3, B.P3, C.P3, D.P2, D.P3 |
| **S4 — Freeze** | Testler yeşil; README; value note; threat model; tx linkleri; `npm run demo` tek komut | herkes P4 |

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
> Our treasury address for sats: `<adres>`. Thanks!

Varsayımlar (cevap yoksa): 1 evet, 2 evet, 3 kendi overlay'imizi yerel çalıştırırız, 4 yok, 5 README'de açıkça yazılır.

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
