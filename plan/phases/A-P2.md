# A-P2 — `verifyLineage`, market builder'ları, sertleştirme (ayrıntılı plan)

> Track dosyası Faz 2. Öncelik: **2.1 `verifyLineage` önce** (C redeem doğrulaması ve D guard DvP'si bekliyor). Tarih: 2026-10-30.

## 1. Bağımlılıklar (STATUS)
B, C, D henüz P0'da/başlamadı → stub gerekmez; A'nın Faz 2'si yalnız Faz 1'e bağlı. Mainnet (test 7, T8) D.P0 bekler.

## 2. `verifyLineage` tasarımı (2.1)

```ts
export type TxFetcher = (txid: string) => Promise<Transaction>
export interface LineageOptions { arcadeUrl?: string, wocUrl?: string, fetchTx?: TxFetcher, maxDepth?: number /* 50 */, cache?: LineageCache }
export interface LineageResult { ok: boolean, tokenId?: string, amt?: bigint, ownerPkh?: string, depth: number, reason?: string }
verifyLineage(outpoint, opts): Promise<LineageResult>
arcadeTxFetcher(arcadeUrl, wocUrl?): TxFetcher      // GET /tx/{txid} (raw/EF) → yoksa WoC GET /v1/bsv/main/tx/{txid}/hex
```
Algoritma (overlay'e güvenmeden, kit `rules.ts` yerelde):
1. `genuine(outpoint)` memo'lu özyineleme. Tx'i getir, **txid'i yeniden hesapla ve eşitle** (sahte veri reddi).
2. Çıktı BSV-21 değilse → `ok:false`. `deploy+mint` ise → genuine (id = kendi outpoint'i).
3. Değilse: tx'in her girdisi için kaynak tx getir; kaynak çıktısı aynı token'ın BSV-21 çıktısıysa bu bir **token girdisi**: (a) girdi script'i `Spend` ile doğrulanır (ataların imzaları da gerçek), (b) `genuine(kaynak)` özyinelemeli.
4. `identifyAdmissible(tx, previousCoins = genuine token girdilerinin index'leri)` — `UnknownTokenInputError` → `ok:false`; hedef vout `outputsToAdmit` içinde değilse `ok:false`.
5. Derinlik > `maxDepth` → `ok:false, reason:'too deep'`. Önbellek: outpoint → sonuç (pozitif ve negatif).
Not: Kit kuralları **o token'a ait olmayan** girdilere bakmaz; bu yüzden yalnız aynı token'ın girdileri yürünür (settlement'taki düz pledge girdileri yürünmez → hızlı).

## 3. Market (2.3, 2.4)
- `reserveListing(wallet, kit, tokenId, credits, askSats)`: krediyi `[1,'agentcoop market']` keyID `list <nonce>` P2PKH'ye taşır (basket `agentcoop listings`, teklifle aynı neden), aynı tx'te `OP_RETURN list`. Para üstü kendi token adresine.
- `signListing(wallet, outpoint, askSats)`: SINGLE|ACP, in i ↔ out i = askSats → satıcının `[1,'agentcoop market']` keyID `pay <nonce>` P2PKH. → `Listing`.
- `verifyListing(listing, { sourceTx })` (offline, `verifyOffer` gibi).
- `buildSweep(wallet, kit, listings[], opts)`: alıcı; her listing için `verifyLineage` (opts ile kapatılabilir), `createAction(inputs = listing'ler sırayla hazır imzayla, outputs = ödemeler sırayla + Σk kredi alıcıya + cüzdan fon/para üstü)`; overlay'e submit. Dönüş `{ txid, credits, tx }` (MASTER'daki `{ plan }` yerine; kullanan yok → §3.4 güncellenir).
- `cancelListing(wallet, kit, outpoint)`: krediyi kendi token adresine geri alır.
- MASTER §3.2'ye `[1,'agentcoop market']` + basket `agentcoop listings`.

## 4. Sertleştirme (2.2, 2.5–2.7)
- 2.2 `verifySettlementPlan(..., { verifyLineage: true, lineage?: LineageOptions })` → girdi 0 `verifyLineage` ok, `tokenId` ve `amt = N`.
- 2.5 ücret: Faz 1'de yapıldı (gerçek boyut × `fetchChainPolicy`); kalan iş yok.
- 2.6 kara liste / round: Faz 1'de `exclude` + `round` var; test edildi.
- 2.7 hata kodları: `LINEAGE_FAILED`, `BAD_LISTING` eklenir; MASTER §3.4'e kod listesi.

## 5. Testler
| Dosya | Senaryo |
|---|---|
| `packages/core/test/lineage.test.ts` (ağsız, `ProtoWallet` + elle kurulmuş tx zinciri, `fetchTx` haritadan) | deploy → transfer → split → merge zinciri ok; amt/ownerPkh doğru; düz sats'tan "transfer" sahtesi `ok:false`; enflasyon (çıktı > girdi) `ok:false`; çapraz token `ok:false`; bozuk imzalı ata `ok:false`; txid'i tutmayan getirilen veri `ok:false`; derinlik sınırı |
| `test/skeleton.mockchain.test.ts` ek adım | `verifySettlementPlan(..., { verifyLineage: true, lineage: { fetchTx: mockchain } })` geçer |
| `test/market.mockchain.test.ts` | settlement sonrası ajan-1 200 krediyi listeler, ajan-2'den 2 liste tek sweep'te; alıcı overlay bakiyesi; sahte liste (sahte kredi) sweep'te `LINEAGE_FAILED`; iptal |
| mainnet | test 7: taze bir transferde `verifyLineage` (`scripts/lineage-check.ts <outpoint>`); T8 sweep — D.P0 sonrası |

## 6. Riskler
| Risk | Önlem |
|---|---|
| Arcade, kendisinden yayınlanmamış eski tx'leri bilmeyebilir | WoC `/tx/{txid}/hex` yedek; 429'da 3 deneme, artan bekleme |
| Uzun soy (çok transfer) yavaş | memo + `maxDepth`; tipik AgentCoop soyu deploy → reserve → settlement (≤ 5) |

## 7. Sonuç (2026-10-30)

- 2.1 `verifyLineage` ✓ (`src/verify/lineage.ts`, `arcadeTxFetcher`), 2.2 `verifySettlementPlan({ verifyLineage: true })` ✓, 2.3/2.4 market ✓ (`src/market/listing.ts`), 2.5/2.6 Faz 1'de yapılmıştı, 2.7 hata kodları MASTER §3.4'te.
- Testler: `packages/core/test/lineage.test.ts` (5), `test/market.mockchain.test.ts` (5), skeleton'a lineage adımı. Toplam 49 yeşil.
- Plandan sapma: `buildSweep` imzası `(wallet, kit, listings, opts)` ve dönüşü `{ txid, credits, tx }` (MASTER + STATUS güncellendi). Reserve mantığı `reserveTokens` yardımcısına çıkarıldı (teklif + liste ortak).
- Açık: mainnet doğrulama 7 (`scripts/lineage-check.ts`) ve T8 — fon bekliyor.
