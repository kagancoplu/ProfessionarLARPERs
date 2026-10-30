# B-P1 — `tm_agentcoop` indeksleme + yan API (offers, pools, WS) (→ S1)

> Track B, Faz 1. Kaynak: `plan/track-B-overlay-coordinator.md` Faz 1, MASTER §3.2/§3.3/§3.5/§3.8, FINAL-IDEA §4.3–4.5.
> Yazıldı: 30.10 ~16:18. Branch `trackB`. Node 22.

## 1. Amaç

1. Havuz ilanı (T2), pledge (T3), pledge iptali (T4) ve settlement (T5) **zincirden** sayılsın: `ls_agentcoop` havuzları, ilerlemeyi (`pledgedCredits`) ve durumu (`open/settled/cancelled`) döndürsün.
2. A'nın skeleton'ı ve C'nin ajanları için yan API (`apps/coordinator`, :8090): `POST/GET /offers`, `GET /pools`, `/pools/:id`, `/pools/:id/pledges`, `WS /ws` (`hello`, `pool_update`).
3. Uçtan uca mockchain testi: havuz → 2 pledge → teklif kaydı → 1 iptal → yeni pledge → settlement → `GET /pools/:id` = `settled`.

## 2. Bağımlılıkların durumu (16:18)

| Bağımlılık | Durum | Ne yapıyorum |
|---|---|---|
| A.P0 `types.ts`, `opreturn.ts` (`buildOpReturn/parseOpReturn`) | Yok (A push'lamadı) | `packages/overlay/src/stub/{types,opreturn}.ts`: MASTER §3.3 tiplerinin ve §3.2 zarfının **geçici kopyası**. A gelince silinir, import `@agentcoop/core`'a döner |
| A.P1 builder'ları (`buildReserveAndAnnounce`, `buildPledge`, `signOffer`, `planSettlement`…) | Yok | Testlerde B-P0'daki `test/helpers/settlement.ts` genişletilir (yalnızca test). Format MASTER §3.3'teki tx düzenine birebir uyar |
| A.P1 `verifyOffer` | Yok | `apps/coordinator/src/verifyOffer.ts`: SDK `Spend` ile SINGLE\|ACP imzasını doğrular. A'nınki gelince değiştirilir |
| A'nın `scripts/skeleton.ts` + D.P0 fon (1.6, mainnet) | Yok | Kabulün mainnet kısmı A.P1 + D.P0'a bağlı → Blokaj. Mockchain uçtan uca testi skeleton akışını birebir taklit eder |
| Kök workspace | Yok | `apps/coordinator` de bağımsız paket. Testlerde overlay aynı süreçte koşar; tek SDK kopyası için coordinator'ın `vitest.config.ts`'i `resolve.dedupe` kullanır |

## 3. Tasarım kararları (ve neden)

### 3.1 OP_RETURN kayıt çıktıları **admit edilir**
Engine, lookup cevabındaki her `(txid, outputIndex)`'i deposundan BEEF'e çözüyor (`Engine.lookup` → `loadOutputWithBEEF`; bulunamayan sonuç **atlanıyor**). Yani bir havuzu, pledge'i ya da settlement'ı sorgulanabilir kılmanın tek yolu kaydın bir çıktısının admit edilmiş olması. `agentcoop` zarfı taşıyan ve yapısal olarak geçerli her OP_RETURN çıktısı admit edilir (0 sat, hiç harcanmaz, depoda zararsız). Böylece her kayıt tx'i (pool/pledge/settle/list/vault; Faz 6'da offer) kendi başına indekslenebilir.

### 3.2 Lookup `whole-tx` modunda
`admissionMode = 'whole-tx'`: lookup her admit edilen çıktı için tx'in tamamını (AtomicBEEF) alır, böylece OP_RETURN'ü, girdileri ve diğer çıktıları görür. `spendNotificationMode = 'txid'` (kit gibi).

### 3.3 Topic manager yapısal, lookup anlamsal
Topic manager durumsuz (DB'ye erişmez): kit token kurallarını aynen çalıştırır ve kayıtları **yapısal** olarak kontrol eder. "Bu pledge havuzun koşullarına uyuyor mu" kontrolü **sorgu anında** lookup'ta yapılır (havuz ve pledge'in overlay'e geliş sırasından bağımsız; pledge havuzdan önce gelse bile doğru sayılır).

| Kayıt (`op`) | Topic manager admit eder (yapısal koşul) | Lookup indeksler |
|---|---|---|
| `pool` | OP_RETURN (json geçerli, zorunlu alanlar string) | `pools`: `poolId = ${txid}_0`; out0'ın BSV-21 olması, `id = terms.tokenId`, `amt = terms.credits` sorgu anında kontrol edilir (`invalidReason`) |
| `pledge` | out0 (pledge coin; `signer='p2pkh'` ise P2PKH), OP_RETURN | `pledges`: out0 sats, out1 sats + script, participant, credits, tokenIndex, signer, height (BEEF'te merklePath varsa) |
| `settle` | OP_RETURN | `settlements`: yalnızca **in0 = poolId outpoint** ise geçerli; havuz `settled` |
| `list`, `vault` | OP_RETURN | ham json (Faz 3'te yapılandırılır) |
| kredi çıktıları | kit kuralları (değişmedi) | kit tabloları |

`coinsToRetain` = **tüm `previousCoins`** (token girdileri + pledge coin'leri + diğer kayıtlar). B.P0 bulgusu: engine tutulmayanları siliyor. Kit kuralının "ilgisiz token girdisi"ni tutmaması da böylece geçmişi korur (zararsız; harcanmış olarak kalır).

### 3.4 Durumlar
Overlay zincirden bildiğini söyler: `open` (kredi UTXO'su harcanmamış), `settled` (geçerli bir settle kaydı var), `cancelled` (kredi UTXO'su settlement dışı bir tx'le harcandı). `failed` (yükseklik ≥ `deadlineHeight` ve settle yok) ve `locking` (koordinatörün turu sürüyor) yan API'de türetilir: overlay'in yüksekliği bilmesi gerekmez.

### 3.5 Pledge geçerlilik kuralı (sorgu anında; MASTER §3.8'e yazılır)
Bir pledge sayılır ⇔ havuz var ve `open`; `minCredits ≤ credits ≤ N`; `out1.satoshis ≥ feeSats` ve `out1.script = payScriptHex`; `out0.satoshis ≥ ceil(credits × priceSats / N) + 1` (pay + 1 sat'lık kredi çıktısı; madencilik ücreti payı para üstünden düşer, koordinatör planlarken yetmeyeni bekleme listesine alır). `pledgedCredits = Σ` geçerli ve harcanmamış pledge'lerin `credits`'i. Geçersiz pledge'ler `invalidReason` ile döner (ajan/insan neden sayılmadığını görür).

### 3.6 Teklifler koordinatörde, overlay'de değil
Track dosyası 1.2 `offers` tablosunu overlay'de sayıyor, ama Faz 1'de teklif zincirde değil (`POST /offers`). Teklifler `apps/coordinator`'ın kendi SQLite'ında (`data/coordinator.db`). Faz 6.1 (zincirde `offer` kaydı) kabul edilirse overlay'e taşınır.

## 4. Arayüz değişiklikleri (önce MASTER §3, sonra STATUS)

1. **§3.3 `PoolTerms` zincirde `poolId` taşıyamaz:** `poolId` = havuz tx'inin `${txid}_0`'ı; bir tx kendi txid'ini içeremez. OP_RETURN `pool` json'unda `poolId` **yok**, overlay türetir; `PoolTerms.poolId` zincir dışı nesnelerde (Offer, API cevapları) dolu kalır.
2. **§3.5 `status`:** `open | locking | settled | failed | cancelled` (`cancelled` eklendi).
3. **§3.8:** sorgu cevaplarının `context` alanları ve pledge geçerlilik kuralı (§3.5 yukarıda) yazılır; `{ op:'pledges', poolId, includeSpent?, includeInvalid? }`.
4. **A'ya not (MASTER §3.4 `cancelPledge`):** iptal tx'i `tm_agentcoop`'a submit edilmeli; yoksa overlay pledge'i canlı sayar (koordinatör yine de lock-in'de Arcade'den harcanmışlığı kontrol eder, Faz 2.1).

## 5. Dosyalar

```
packages/overlay/src/
├─ stub/types.ts            GEÇİCİ: MASTER §3.3 PoolTerms, PledgeRecord (+ SettleRecord)
├─ stub/opreturn.ts         GEÇİCİ: buildOpReturn / parseOpReturn (MASTER §3.2 zarfı)
├─ records.ts               kayıt json doğrulayıcıları (string alanlar, zorunlu alanlar) — topic manager ve lookup ortak
├─ AgentCoopTopicManager.ts kit kuralları + kayıtlar (§3.3)
└─ AgentCoopLookupService.ts whole-tx; tablolar + sorgular (§6)

apps/coordinator/           bağımsız paket (@agentcoop/coordinator)
├─ package.json, package-lock.json, tsconfig.json, vitest.config.ts (dedupe), .gitignore, README.md
├─ src/
│  ├─ config.ts             env: PORT=8090, OVERLAY_URL, ARCADE_URL, COORDINATOR_DB
│  ├─ overlay.ts            ls_agentcoop HTTP istemcisi (pools/pool/pledges/outpoint)
│  ├─ chain.ts              yükseklik (Arcade /chaintracks/v2/height, 30 sn önbellek; testte enjekte)
│  ├─ verifyOffer.ts        GEÇİCİ (A'nın verifyOffer'ı gelene kadar)
│  ├─ store.ts              offers tablosu (knex/better-sqlite3)
│  ├─ api.ts                Express router: /offers, /pools…
│  ├─ ws.ts                 /ws: hello, pool_update (5 sn poll, yalnızca değişeni yayınla)
│  └─ server.ts             createCoordinatorServer(opts) + main
└─ test/
   └─ e2e.pools.mockchain.test.ts
packages/overlay/test/
└─ overlay.agentcoop.test.ts  overlay'in tek başına indeksleme testleri
```

## 6. Overlay şeması ve sorgular

| Tablo | Kolonlar |
|---|---|
| `agentcoop_pools` | `pool_id` PK, `txid`, `record_vout`, `provider`, `token_id`, `credits`, `price_sats`, `fee_sats`, `min_credits`, `deadline_height`, `pay_script_hex`, `label`, `terms` (json), `credit_amt`, `credit_token_id` (out0'dan), `status`, `spending_txid`, `settled_txid`, `created_height`, `created_at` |
| `agentcoop_pledges` | `outpoint` PK (`txid_vout`), `txid`, `vout`, `record_vout`, `pool_id` idx, `participant`, `credits`, `token_index`, `signer`, `coin_sats`, `fee_out_sats`, `fee_out_script_hex`, `height`, `spent`, `spending_txid`, `created_at` |
| `agentcoop_settlements` | `txid` PK, `record_vout`, `pool_id` idx, `pledge_list_hash`, `inputs` (json outpoint listesi), `created_at` |
| `agentcoop_records` | `txid`, `vout` PK; `op`, `json` (list/vault ham kayıtları, Faz 3) |

| Sorgu | Döndürür (çıktı → `context`) |
|---|---|
| `{ op:'pools', status? }` | her havuzun kayıt çıktısı → `PoolView` |
| `{ op:'pool', poolId }` | tek havuz → `PoolView` |
| `{ op:'pledges', poolId, includeSpent?, includeInvalid? }` | pledge coin çıktıları → `PledgeView` (sıralama: `height` asc, null en sonda, sonra `txid`) |
| `{ op:'settlement', poolId }` | settle kayıt çıktısı → `{ poolId, txid, pledgeListHash, inputs }` |
| kit sorguları | değişmedi |

`PoolView = { poolId, txid, terms (poolId dolu), status, pledgedCredits, pledgeCount, target, settledTxid?, spendingTxid?, createdHeight?, invalidReason? }`
`PledgeView = { outpoint, txid, vout, poolId, participant, credits, tokenIndex, signer, coinSats, height?, spent, spendingTxid?, valid, invalidReason? }`

## 7. Yan API ve WS

| Yöntem | Yol | Davranış / hatalar |
|---|---|---|
| `POST` | `/offers` | gövde `Offer`. Doğrular: havuz overlay'de `open` ve geçerli; `offer.lockingScriptHex/satoshis` = havuz kredi UTXO'su; imza baytı `0xC3` (SINGLE\|ACP\|FORKID); `Spend.validate()` girdi 0 + çıktı 0 (`payScriptHex`, `priceSats`) ile geçiyor; `offer.terms` overlay'deki terms ile aynı (overlay'inki esas). `201` / `400 {code,error}` / `404` havuz yok / `409` havuz kapalı |
| `GET` | `/offers/:poolId` | `200 Offer` / `404` |
| `GET` | `/pools` | `PoolView[]` + `status` türetilmiş (`failed`, `locking`) + `hasOffer` |
| `GET` | `/pools/:poolId` | tek `PoolView` |
| `GET` | `/pools/:poolId/pledges` | geçerli + harcanmamış pledge'ler (`?all=1` hepsi) |
| `GET` | `/healthz` | overlay erişimi, yükseklik |
| `WS` | `/ws` | `hello { identity, poolIds[] }` → `{ type:'hello_ack' }`; sunucu 5 sn'de bir havuzları okur, `pledgedCredits`/`status` değişen havuz için `pool_update` yayınlar (hello'da poolIds verenlere yalnızca onları; boş listeye hepsini) |

## 8. Test senaryoları

**`packages/overlay/test/overlay.agentcoop.test.ts`** (mockchain, yalnızca overlay):
1. Havuz tx'i (deploy → kendine N kredi + OP_RETURN pool) → `pools` 1 havuz, `open`, `pledgedCredits 0`, out0 kontrolü geçerli.
2. İki pledge (600 + 400) → `pledgedCredits 1000`; biri yetersiz kayıt bedeli ödüyor → `valid:false, invalidReason`; sayılmıyor.
3. Pledge havuzdan **önce** submit edilirse (havuz sonra) sorgu yine doğru (sıra bağımsız).
4. İptal (T4): pledge coin harcanıyor → `spent:true`, `pledgedCredits` düşüyor, `includeSpent` ile geçmişte duruyor.
5. Settlement → `status settled`, `settledTxid`, `settlement` sorgusu; pledge'ler `spent` + `spendingTxid = settlement`.
6. Sahte settle kaydı (in0 havuz değil) → havuz `open` kalıyor.
7. Havuz kredi UTXO'su başka bir tx'le harcanıyor → `cancelled`.

**`apps/coordinator/test/e2e.pools.mockchain.test.ts`**: overlay + yan API + WS aynı süreçte; sağlayıcı teklifi `POST /offers` (geçerli → 201; sahte imza → 400; ALL ile imzalı teklif → 400), WS istemcisi `pool_update` alıyor, settlement sonrası `GET /pools/:id` → `settled`.

## 9. Kabul ve kanıtı

| Kabul | Kanıt |
|---|---|
| Kayıtlar zincirden sayılıyor | overlay testleri 1–7 yeşil |
| Yan API çalışıyor | coordinator e2e yeşil; `npm run coordinator` → curl örnekleri README'de |
| Mainnet skeleton settlement'ı overlay'de `settled` | **A.P1 + D.P0'a bağlı** (Blokaj). A skeleton'ı `POST /offers` + `tm_agentcoop`'a bağlayınca STATUS'a txid |

## 10. Hata durumları

| Durum | Davranış |
|---|---|
| Kayıt json'u bozuk / sayı string değil | topic manager OP_RETURN'ü admit etmez; tx'in diğer (token) çıktıları kit kuralıyla değerlendirilir |
| Pledge havuzu bilinmiyor | admit edilir, sorguda `valid:false, invalidReason:'unknown pool'` |
| Overlay erişilemiyor (yan API) | `502 {code:'OVERLAY_UNAVAILABLE'}`; WS poll sessizce bir sonraki tura |
| Arcade yükseklik alınamıyor | son bilinen yükseklik; hiç yoksa `failed` türetilmez (durum `open` kalır) ve `heightUnknown:true` |

## 11. Sonuç (16:30)

Mockchain kabulü tamam: overlay 15/15 (P0'ın 8'i + P1'in 7'si), koordinatör e2e 5/5. Plandan farklar:
- Görünüm tipleri `packages/overlay/src/views.ts`'e taşındı (çalışma zamanı importu yok), böylece koordinatör ve C'nin ajanları SDK kopyası çekmeden tipleri kullanabiliyor.
- Koordinatör testleri overlay'i aynı süreçte başlatıyor; tek SDK kopyası için `vitest.config.ts` `resolve.dedupe` kullanıyor (kök workspace gelince gereksiz).
- Yeni arayüz notu (MASTER §3.2): teklif imzası settlement'ın `version`, `lockTime` ve in0 `sequence`'ını sabitliyor.
- Mainnet kabulü (A'nın skeleton settlement'ı `settled`) A.P1 + D.P0'ı bekliyor.
