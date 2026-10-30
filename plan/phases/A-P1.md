# A-P1 — Offer, pledge, settlement builder'ları + walking skeleton (ayrıntılı plan)

> Track dosyası: `plan/track-A-protocol.md` Faz 1. Arayüz: MASTER §3.3/§3.4 (imzalar donmuş; parametre şekilleri burada netleşir). Tarih: 2026-10-30.

## 1. Bağımlılıkların durumu (STATUS 2026-10-30)

| Bağımlılık | Durum | Karar |
|---|---|---|
| D.P0 sunucu cüzdanları + sats | başlamadı | Faz 1 **mockchain'de** biter; mainnet koşusu (`scripts/skeleton.ts`) beklemede → Blokajlar |
| B.P1 `tm_agentcoop` overlay | başlamadı | Testte kit overlay'i (`docs/starter/bsv21-token-kit/overlay/server.ts` → `startOverlay`, topic `tm_tokenkit`) HTTP ile ayağa kalkar. Kurallar aynı (track A 1.x notu). B hazır olunca `OverlayClient(..., COOP_TOPIC, COOP_SERVICE)` |
| B.P1 `POST /offers` | başlamadı | skeleton offer'ı doğrudan builder'dan alır; B hazır olunca bağlanır |
| C.P1 ürün token'ı | başlamadı | skeleton kendi token'ını basar (N=1.000, dec 0) |

## 2. Kararlar (MASTER'ı netleştiren, kırıcı olmayan)

1. **Outpoint biçimi:** AgentCoop verisinde (terms, plan, OP_RETURN, API) her zaman `txid_vout`; yalnızca cüzdan çağrılarında `txid.vout`'a çevrilir (`toWalletOutpoint`).
2. **`pledgeListHash`** = `sha256_hex( join(',', sort_lex(dahil edilen pledge outpoint'leri)) )`. Leksikografik sıralama zincir bilgisi gerektirmez; herkes yeniden hesaplar. (Seçim sırası ayrı: §3.2 kuralı.) → MASTER §3.2'ye not.
3. **Teklif UTXO'sunun anahtarı:** kredi UTXO'su sağlayıcının **token receive adresine değil**, `[1,'agentcoop provider']` / keyID `offer <poolNonce>` / `'anyone'` türevli P2PKH'ye taşınır ve `agentcoop offers` basket'inde tutulur. Neden: token adresinde kalsa `TokenKit.sync()` onu `bsv21` basket'ine çeker ve `TokenKit.send` havuzu farkında olmadan iptal edebilir. BSV-21 geçerliliği değişmez (sahip eki hâlâ P2PKH). → MASTER §3.2'ye `OFFERS_BASKET` satırı.
4. **Gelir anahtarı:** `payScriptHex` = P2PKH(`[1,'agentcoop provider']`, keyID = `poolNonce`, `'anyone'`). `poolNonce` teklif çıktısının `customInstructions`'ında (`{ protocolID, keyID, payKeyID }`) ve pool OP_RETURN'ünde (`nonce`) durur → C'nin `sweep-revenue`'su bulur.
5. **Pool OP_RETURN:** `op=pool`, json = terms − `poolId` + `nonce` (poolId = `<bu txid>_0`, kendi tx'inde bilinemez).
6. **Ücret:** `planSettlement` saf fonksiyon; `chain.satsPerKb` dışarıdan (Arcade `/health` policy'si; mockchain 100). Boyut, gerçek kilit açma uzunluklarıyla (teklif: gerçek; p2pkh 108; vault: `InputSigner.unlockingScriptLength`) **dolu bir şablon serileştirilerek** ölçülür. Ücret katılımcılara eşit bölünür, kalan (yuvarlama) ilk katılımcılara 1'er sat; ödeme payının `ceil` fazlası ücrete gider (çıktı 0 tam P).
7. **Para üstü sonrası:** katılımcı yayından sonra `internalizeSettlement(wallet, tx, myOutpoint, record)` ile para üstünü `agentcoop` basket'ine (aynı customInstructions) alır ve harcanan pledge coin'ini `relinquishOutput` ile basket'ten düşer. Krediler `TokenKit.sync()` ile gelir.

## 3. Settlement düzeni (FINAL-IDEA §4.4, n katılımcı)

```
in 0      teklif (N kredi, 1 sat)  SINGLE|ACP|FORKID  ↔ out 0      P sat → payScript
in 1..n   pledge coin'leri         ALL|FORKID         ↔ out 1..n   BSV-21 transfer k_i → receivePkh(participant_i, tokenIndex_i), 1 sat
                                                        out n+1..2n para üstü_i → pledge coin_i'nin kendi script'i (0 ise çıktı yok? → HAYIR: her zaman var, ≥ 1 sat; plan bunu garanti eder yoksa pledge reddedilir)
                                                        out 2n+1     OP_RETURN settle { v, poolId, termsHash, pledgeListHash, round }
```
Katılımcı i'nin borcu: `pay_i = ceil(k_i·P/N)`, `+1` (kredi çıktısının sat'ı), `+fee_i`. `change_i = coin_i − pay_i − 1 − fee_i ≥ 1`, aksi halde pledge yetersiz → bekleme listesi. Girdi 0'ın 1 sat'ı ücrete katkıdır.

## 4. Dosyalar ve imzalar

```ts
// src/util/outpoint.ts
toWalletOutpoint('txid_0') → 'txid.0' · fromWalletOutpoint · parseOutpoint → { txid, vout }

// src/pool/terms.ts
termsHash(terms): string                          // sha256 hex of canonical JSON (sorted keys)
validateTerms(terms): void                        // BAD_TERMS: string sayılar, N>0, P>0, minCredits ≤ N, payScript hex
creditsCost(terms, credits): bigint               // ceil(k·P/N)

// src/pool/reserve.ts
buildReserveAndAnnounce(wallet, kit: TokenKit, terms: Omit<PoolTerms,'poolId'|'payScriptHex'> & { payScriptHex?: string }, opts?: { originator?, poolNonce? })
  : Promise<{ txid, poolId, terms: PoolTerms, offerKey: { protocolID, keyID }, beef: number[] }>
  // kit.spendable → selectUtxos(N) → createAction(inputBEEF = overlay BEEF, inputs = token UTXO'ları,
  //   out0 = transfer N → P2PKH(offer key) [basket 'agentcoop offers', customInstructions],
  //   out1 = token para üstü → kendi receive adresim [basket bsv21] (varsa),
  //   out2 = OP_RETURN pool) → signAction (kit signWalletP2pkhInput) → kit.overlay.submit

// src/pool/offer.ts
signOffer(wallet, outpoint, terms, opts?: { sourceBEEF?, offerKey?, originator? }): Promise<Offer>
  // offer UTXO'su listOutputs('agentcoop offers') veya opts'tan; tx = in0 + out0(payScript, P); SINGLE|ACP imza
verifyOffer(offer, opts: { sourceTx: Transaction }): void
  // imza Spend ile; terms tutarlı; outpoint = poolId; source çıktısı BSV-21 transfer/deploy, amt = N, tokenId eşit
  // (harcanmamışlık kontrolü ağ gerektirir → Faz 2 `verifyOfferLive`)

// src/pool/pledge.ts
buildPledge(wallet, terms, credits, signer: 'p2pkh'|'vault', vaultScript?, opts?: { tokenIndex: number, originator?, bufferSats?, allowMultiple? })
  : Promise<{ txid, outpoint, record: PledgeRecord, keyID, beef: number[], satoshis }>
cancelPledge(wallet, outpoint, opts?: { originator? }): Promise<string>
pledgeAmount(terms, credits, bufferSats = 300): number

// src/pool/plan.ts
export interface PledgeCandidate { outpoint, satoshis, lockingScriptHex, record: PledgeRecord, sourceTx: Transaction, blockHeight?: number, unlockingScriptLength?: number }
export interface ChainInfo { height: number, satsPerKb: number, offerSourceTx: Transaction }
planSettlement(offer, pledges: PledgeCandidate[], chain: ChainInfo, opts?: { round?: number, exclude?: string[] }): SettlementPlan
orderPledges(pledges): PledgeCandidate[]          // (blockHeight asc, txid asc), mine edilmemişler sonda
pledgeListHash(outpoints): string

// src/pool/verify.ts
verifySettlementPlan(plan, offer, myOutpoint, opts: { expectedCredits: string, maxFeeSats?: number, verifyLineage?: false }): Promise<void>

// src/pool/sign.ts / assemble.ts / broadcast.ts
planTransaction(plan): Transaction                 // templateBEEF → tx (sources bağlı)
signSettlementInput(plan, inputIndex, signer: InputSigner): Promise<UnlockingScript>
assembleSettlement(plan, unlockingScripts: Record<number, UnlockingScript>): Transaction   // her girdi dolu + yerel Spend doğrulaması
broadcastEF(tx, arcadeUrl): Promise<string>        // POST {arcade}/tx, JSON { rawTx: tx.toHexEF() } (wallet-toolbox Arcade.js ile aynı)
internalizeSettlement(wallet, tx, myOutpoint, plan, opts?): Promise<void>
```

## 5. Test senaryoları

| Dosya | Senaryo |
|---|---|
| `packages/core/test/pool.plan.test.ts` (birim, ağ yok, `ProtoWallet` + sahte kaynak tx'ler) | sıralama determinizmi (karışık sıra → aynı plan); %120 üst sınırı; tam N seçimi (aşan pledge atlanır, sonraki alınır); N'e ulaşılamıyorsa `BAD_PLAN`; `exclude`; `minCredits`; deadline geçti → `DEADLINE_PASSED`; para üstü ≥ 1 değilse pledge atlanır; `pledgeListHash` leksikografik; ücret ≥ boyut×oran; çıktı 0 = P; Σk = N |
| aynı dosya | `verifySettlementPlan`: dürüst plan geçer; çıktı 0 değişti → `BAD_PLAN`; benim kredi çıktım başka adrese → hata; para üstüm eksik → hata; OP_RETURN hash'i bozuk → hata; Σk ≠ N → hata; ücret tavanı → hata |
| `test/skeleton.mockchain.test.ts` (e2e) | mock chain + kit overlay (HTTP, SPV): sağlayıcı token deploy N=1.000 → reserve+announce (overlay kabul) → signOffer + verifyOffer → agent-1 pledge 600, agent-2 pledge 400 → plan → her ajan verify + sign → assemble → (mock) yayın → overlay submit: 2 kredi çıktısı admit → `TokenKit.sync` → ajan bakiyeleri 600/400; sağlayıcı `payScript`'e P; para üstleri internalize; **negatif:** koordinatör planı ajan-2 imzaladıktan sonra değiştirirse assemble Spend doğrulamasında düşer |
| aynı dosya | başarısız havuz: deadline geçti → `planSettlement` reddeder; pledge coin'leri harcanmamış; `cancelPledge` coin'i geri alır |

Mockchain'de "yayın": assemble edilen tx, `tx.toAtomicBEEF()` ile ajanlardan birinin cüzdanına `internalizeAction` verilir (cüzdan yayınlar; kit `mockchain.ts`'in "already known" yaması bunun için) — gerçek ağda `broadcastEF`.

## 6. Riskler

| Risk | Önlem |
|---|---|
| wallet-toolbox `internalizeAction`, harcanmış pledge coin'ini basket'te bırakır | `relinquishOutput` (karar 7) |
| Kit overlay'i settlement tx'inde çok sayıda düz girdiyi sorun eder (doğrulama testi 1) | skeleton testi bunu doğrudan test eder (B'nin test 1'i ile aynı) |
| `toAtomicBEEF` imzasız tx'te kaynak zinciri eksik | adaylar `Transaction.fromAtomicBEEF(createAction.tx)` ile tam soyla gelir; test |
| Ücret tahmini mockchain feeModel'ini tutmaz | mockchain yayınını cüzdan `internalizeAction` yapar; ücret politikası testte 100 sat/kB |

## 7. Kabul kanıtı

mockchain e2e yeşil (komut çıktısı STATUS'ta); mainnet `scripts/skeleton.ts` D.P0 sonrası (txid'ler T1, T2, T3, T5 STATUS'ta) — o zamana kadar Blokajlar'da.

## 8. Sonuç (2026-10-30)

- Mockchain: `test/skeleton.mockchain.test.ts` 8/8, `packages/core/test/pool.plan.test.ts` 5/5; toplam 38 test yeşil.
- Plandan sapmalar: (1) `settle.ts` sign/assemble/broadcast/internalize'ı tek dosyada topladı. (2) %120 penceresi, yetersiz coin düşürüldükten sonra **yeniden hesaplanır** (aksi halde bekleme listesi hiç devreye girmiyordu). (3) `buildPledge` "tek aktif pledge" kontrolü `change:true` çıktılarını saymaz. (4) Vault kilit açma uzunluğu varsayılanı 150 (D teyit edecek).
- Mainnet (`scripts/skeleton.ts`) D.P0 + overlay bekliyor (STATUS Blokajlar).
