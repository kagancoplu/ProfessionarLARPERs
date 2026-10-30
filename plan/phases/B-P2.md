# B-P2 — Koordinatör: lock-in, imza turu, yayın (→ S2)

> Track B, Faz 2. Kaynak: `plan/track-B-overlay-coordinator.md` Faz 2, MASTER §3.2 (sıralama, %120, 3 tur, 60 sn), §3.4, §3.5 (WS), FINAL-IDEA §4.3–4.5.
> Yazıldı: 30.10 ~17:20. Branch `trackB`. Node 22.

## 1. Amaç

Havuz dolunca koordinatör: (1) deterministik planı kurdurur, (2) her katılımcıdan WS üzerinden imza toplar, (3) en fazla 3 tur dener (imzalamayan outpoint kara listeye, yerine bekleme listesinden biri), (4) imzalar tamamsa settlement'ı Arcade'e yayınlar ve overlay'e submit eder. Son tarihi geçen dolmamış havuz için `pool_failed` yayınlar ve hiçbir şey yayınlanmaz. Koordinatör hiçbir aşamada para veya fon kontrol eden anahtar tutmaz.

## 2. Bağımlılıkların durumu (17:20)

| Bağımlılık | Durum | Ne yapıyorum |
|---|---|---|
| A.P1 `planSettlement`, `assembleSettlement`, `broadcastEF` | Yok (A başlamadı) | Koordinatör bu üçünü **enjekte edilen bir arayüzle** (`SettlementProtocol`) kullanır; kendi `planSettlement`'ımı ürün koduna yazmam (kod çoğalmasın). Testlerde `test/helpers/devProtocol.ts` (yalnızca test) uygular. A gelince `src/protocol.ts`'te 20 satırlık bir adaptör A'nın fonksiyonlarını bağlar |
| A.P1 `verifySettlementPlan` (katılımcı tarafı) | Yok | Test katılımcıları minimal kontrol yapar (girdim ve kredi çıktım var mı). Gerçek doğrulama C'nin ajanlarında A'nın fonksiyonuyla |
| C.P2 ajanları (WS istemcisi) | Yok | Test katılımcı botu (`test/helpers/participant.ts`): wallet-toolbox cüzdanı + WS; davranış: imzala / sessiz kal / reddet / bozuk imza |
| Kök workspace (A.P0) | Yok | Faz 1 düzeni sürüyor (bağımsız paket); göç Blokajlar'da |

## 3. Tasarım

### 3.1 `SettlementProtocol` (enjekte edilir; `apps/coordinator/src/protocol.ts`)

```ts
interface PledgeCandidate { view: PledgeView; sourceTx: Transaction }   // overlay'den, sıralı
interface PlanRequest { offer: Offer; creditSourceTx: Transaction; pledges: PledgeCandidate[]; round: number; exclude: string[]; height?: number }
interface SettlementProtocol {
  planSettlement (req: PlanRequest): Promise<SettlementPlan>             // A: planSettlement(offer, pledges, chain)
  assembleSettlement (plan, offer, scripts: Map<inputIndex, hex>): Transaction  // A: assembleSettlement(plan, unlockingScripts)
  broadcast (tx): Promise<string>                                        // A: broadcastEF(tx, ARCADE_URL)
}
```
Protokol verilmezse koordinatör yalnızca yan API + akış olarak çalışır (Faz 1 davranışı) ve `/healthz`'te `engine: false` döner.

### 3.2 Durum makinesi (havuz başına)

```
open ──(teklif var ∧ geçerli harcanmamış pledge'ler ≥ N ∧ yükseklik < deadline ∧ tur yok)──▶ locking (tur r)
locking ──(tüm girdiler geçerli imzalı)──▶ assemble → broadcast → overlay submit ──▶ settled  (WS: settled)
locking ──(zaman aşımı / sign_reject / bozuk imza / çevrimdışı)──▶ eksik outpoint'ler kara listeye (WS: round_failed)
        ──▶ r < 3 ise hemen tur r+1;  r = 3 ise open (havuz ölmez; pledge kümesi değişince sayaç sıfırlanır)
open ──(yükseklik ≥ deadline)──▶ failed (WS: pool_failed, bir kez; yayın yok)
```

- **Tur başlangıcı:** overlay'den geçerli + harcanmamış pledge'ler (sıralı, BEEF'leriyle) → kara listedekiler çıkarılır → **WoC toplu harcanmışlık kontrolü** (`POST /v1/bsv/{net}/utxos/spent`, 20'lik gruplar; harcanmış = kara liste `spent`) → toplam < N ise tur başlamaz → `planSettlement` → şablonun in0'ına teklif imzası konup **`Spend` ile doğrulanır** (planlayıcı version/lockTime/sequence'ı bozduysa tur başlamadan yakalanır) → her katılımcının WS oturumuna `sign_request { poolId, round, plan, yourInputIndex }`. Oturumu olmayan katılımcı anında "offline".
- **Yanıt:** `sign_response { poolId, round, inputIndex, unlockingScriptHex }` yalnızca o girdinin `participant` kimliğiyle `hello` demiş oturumdan kabul edilir; imza şablon üzerinde `Spend` ile doğrulanır; geçersizse o girdi "bad signature". `sign_reject { poolId, round, reason }` o katılımcının girdisini "rejected: reason" yapar.
- **Tur sonu:** tüm girdiler çözülünce (veya `ROUND_TIMEOUT_MS`, varsayılan 60 sn) değerlendirilir. Yayın hatası da tur hatası sayılır (`round_failed` + log; kara liste yalnızca WoC'un harcanmış dediği girdilere).
- **Kara liste:** havuz başına `outpoint → neden`; turlar arası kalıcı (bellekte; koordinatör yeniden başlarsa sıfırlanır, Faz 3.5 kalıcılaştırır).

### 3.3 WS mesajları (MASTER §3.5, değişiklik yok)

İstemciye: `sign_request`, `round_failed { poolId, round, missing: outpoint[] }`, `settled { poolId, txid }`, `pool_failed { poolId }`. Sunucuya: `sign_response`, `sign_reject`. `round_failed`, `settled` ve `pool_failed` havuz abonelerine yayınlanır.

### 3.4 API eki (MASTER §3.5'e eklenir)

`GET /pools/:id` cevabına `coordinator: { round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome: 'settled'|'failed', missing, txid? } }` (havuz hiç turlanmadıysa yok). `/healthz` → `engine: true|false`.

### 3.5 Loglar
Her karar tek JSON satırı (`{ t, poolId, event, ... }`): `round_start`, `sign_ok`, `sign_bad`, `sign_reject`, `round_failed`, `broadcast`, `settled`, `gave_up`, `pool_failed`, `plan_failed`, `offer_invalid_for_plan`. Video ve hata ayıklama için.

### 3.6 Koordinatör cüzdanı (2.7) — plan değişikliği
WS-only PoC'de koordinatörün **hiç anahtara ihtiyacı yok** (imza toplar, yayınlar; Arcade yayını kimlik istemez). `WALLET_COORDINATOR_KEY` yalnızca MessageBox yedeği (opsiyonel, Faz 2'de yok) ve Faz 5'teki `hello` kimlik kanıtı için gerekecek. Non-custodial iddia daha güçlü: "koordinatörün parası da, fon anahtarı da yok".

## 4. Dosyalar

```
apps/coordinator/src/
├─ protocol.ts     SettlementProtocol, PlanRequest, PledgeCandidate (+ A adaptörü için yer)
├─ engine.ts       CoordinatorEngine: tick, startRound, onSignResponse/Reject, finish, status
├─ spent.ts        SpentChecker; WocSpentChecker (bulk, 20'lik) ; NoSpentChecker
├─ script.ts       inputIsValid(tx, i) (Spend)
├─ log.ts          JSON satır logger
├─ ws.ts           sign_response / sign_reject → engine
├─ api.ts          coordinator alanı, engine'den locking
└─ server.ts       engine kurulumu (protocol verilirse), env: ROUND_TIMEOUT_MS, MAX_ROUNDS, SPENT_CHECK=woc|none
packages/overlay/src/stub/types.ts   + SettlementPlan (MASTER §3.3 kopyası)
apps/coordinator/test/
├─ helpers/devProtocol.ts   YALNIZCA TEST: plan (sıralı, kısmi son pay), assemble, mock yayın
├─ helpers/participant.ts   WS katılımcı botu (sign | silent | reject | garbage)
└─ e2e.coordinator.mockchain.test.ts
```

## 5. Test senaryoları (`e2e.coordinator.mockchain.test.ts`, tur zaman aşımı 1,5 sn)

1. **Mutlu yol:** N=1000; a1 600 + a2 400 imzalıyor → tur 1'de settlement; WS `settled`; overlay `settled`; kredi bakiyeleri doğru.
2. **Bekleme listesi:** a1 600, a2 300, a3 100 (sessiz), a4 200 → tur 1 düşer (`round_failed`, missing = a3), tur 2: a1 600 + a2 300 + a4 **100 (kısmi)** → settled; `coordinator.blacklist` a3'ü `timeout` ile gösteriyor.
3. **Bozuk imza ve red:** tur 1'de bir katılımcı çöp imza, biri `sign_reject` gönderiyor → ikisi de kara listede, nedenleriyle.
4. **3 tur sınırı:** yeterli bekleme listesi olmadan hep sessiz kalan katılımcılar → 3 turdan sonra `open`, `gave_up` logu, yayın yok.
5. **Dolmayan havuz:** 500/1000, yükseklik deadline'ı geçiyor → WS `pool_failed` **bir kez**, API `failed`, yayın yok.
6. **Başkasının imzası:** a1'in girdisine a2'nin oturumundan gelen `sign_response` reddediliyor.

## 6. Kabul ve kanıtı

| Kabul | Kanıt |
|---|---|
| Koordinatör turu, kara liste, bekleme listesi, 3 tur, dolmayan havuz | testler 1–6 yeşil |
| Mainnet'te koordinatörün kurduğu settlement (T5) + dolmayan havuz | **A.P1 (gerçek `planSettlement`) + C.P2 (ajanlar) + D (sats)** → Blokaj |

## 7. Hata durumları

| Durum | Davranış |
|---|---|
| `planSettlement` hata fırlatır (ör. yetersiz pledge) | `plan_failed` logu, tur başlamaz, sonraki tick'te yeniden |
| Teklif imzası şablonda geçersiz | `offer_invalid_for_plan`, tur başlamaz (planlayıcı hatası; A'ya) |
| WoC erişilemiyor / 429 | harcanmışlık "bilinmiyor" sayılır; yayın düşerse tur hatası |
| Yayın hatası | `round_failed`, tur sayılır, WoC'un harcanmış dediği girdiler kara listeye |
| Overlay submit hatası (yayından sonra) | log + yeniden deneme (3×); tx zincirde olduğu için `settled` WS'i yine gönderilir |
| Koordinatör yeniden başlar | açık turlar kaybolur → havuzlar `open`; bir sonraki tick yeni tur açar (Faz 3.5 kalıcılık) |

## 8. Sonuç (17:55)

Mockchain kabulü tamam: koordinatör 10/10 (P1'in 5'i + P2'nin 5'i; 6 senaryo), overlay 15/15; iki ardışık koşuda kararsızlık yok. Plandan farklar:
- Pledge'ler testlerde ayrı bloklarda mine edilip merkle yoluyla overlay'e veriliyor; böylece `(height, txid)` sıralaması da sınanıyor ve tur kompozisyonu deterministik.
- Senaryo 6 (başkasının girdisine imza) senaryo 1'in içinde.
- Koordinatör cüzdanı yok (§3.6); `WALLET_COORDINATOR_KEY` Faz 5'e kadar gerekmiyor.
- Mainnet kabulü A.P1 (gerçek `planSettlement`, `broadcastEF`), C.P2 (ajanlar) ve D (sats) bekliyor. A'nın fonksiyonları `apps/coordinator/src/server.ts`'te `SettlementProtocol`'a bağlanacak.
