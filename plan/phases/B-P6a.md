# B-P6a — Faz 6'nın yerel kısmı: denetim (`/pools/:id/audit`) ve metrikler (`/metrics`)

> Track B. `plan/track-B-overlay-coordinator.md` Faz 6.3 ve 6.4. Kullanıcı kararı (30.10 ~17:57): Faz 6'nın başka track'e bağlı olmayan kısmı S3'ü beklemeden yapılır. İkinci koordinatör (6.1, 6.2) ve 50+ katılımcılı mainnet testi (6.5) S3 sonrasına kalır.
> Yazıldı: 30.10 ~18:00. `main`. Önce `git pull` + STATUS okundu (A'nın 17:50 düzeltmeleri, C'nin `register-sdk` kancası).

## 1. Amaç

İki iddiayı **zincirden yeniden hesaplanan** verilerle gösterilebilir kılmak:
1. **Koordinatörün seçimi denetlenebilir** (FINAL-IDEA §8 "seçim yetkisi: tespit edilebilir"). Herkes bir settlement için şunları kontrol edebilir: OP_RETURN'deki `pledgeListHash` gerçekten dahil edilen girdilerin hash'i mi, seçim A'nın deterministik kuralına uyuyor mu, sırada önde olup dışarıda kalan pledge'ler var mı ve nedenleri ne.
2. **Emanette tutulan sat = 0** (FINAL-IDEA §11 kapanış rakamları). Her settlement'ın her çıktısı sınıflandırılır: sağlayıcı ödemesi, katılımcının kredisi, katılımcının para üstü, OP_RETURN. Bunların dışındaki her sat "hesapsız" sayılır. `custodiedSats` bu toplamdır; sabit yazılmış bir sıfır değildir.

## 2. Bağımlılıklar

Yok. A'nın `planSettlement`, `orderPledges`, `pledgeListHash`, `termsHash`, `parseOpReturn`, `decodeBsv21`, `receivePkh` fonksiyonları hazır. Veri overlay'den (`pool`, `pledges` (`includeSpent`, `includeInvalid`), `settlement` sorguları, BEEF'li) ve koordinatörün kendi DB'sinden (teklif, kara liste) geliyor.

## 3. Denetim — `GET /pools/:poolId/audit`

Yalnızca settle edilmiş havuz için; değilse `409 NOT_SETTLED`.

| Kontrol | Nasıl | Kaynak |
|---|---|---|
| `hashMatches` | `pledgeListHash(settlement'ın in1..n outpoint'leri)` = OP_RETURN `settle.pledgeListHash` | zincir |
| `termsHashMatches` | `termsHash(saklı teklif.terms)` = OP_RETURN `settle.termsHash` (teklif yoksa `null`) | zincir + koordinatör |
| `providerPaid` | out0 = `priceSats` → `payScriptHex` | zincir |
| `creditsDelivered` | her dahil pledge için `receivePkh(participant, tokenIndex)`'e tam `credits` BSV-21 çıktısı; toplam = N | zincir |
| `allIncludedValid` | dahil edilen her outpoint bu havuzun geçerli bir pledge'i | overlay (zincirden indeksli) |
| `selectionMatches` | A'nın `planSettlement`'ı şu adaylarla yeniden çalıştırılır: bu havuzun pledge'leri; settlement dışında bir tx'le harcananlar (iptaller) çıkarılır; koordinatörün **beyan ettiği** kara liste `exclude` olarak verilir. Sonuçtaki outpoint kümesi gerçek dahil kümesiyle karşılaştırılır | zincir + koordinatörün beyanı |
| `skippedEarlier` | sırada (yükseklik, txid) son dahil pledge'den önce gelip dahil edilmeyen her pledge, nedeniyle: kara listedeyse beyan edilen neden (`timeout`, `bad signature`…), iptal edildiyse `cancelled`, aksi halde `not explained` | zincir + koordinatörün beyanı |

`verdict`:
- `consistent`: zincir kontrollerinin hepsi doğru ve seçim kuralla eşleşiyor;
- `inconsistent`: hash, ödeme veya kredi kontrolü yanlış;
- `unexplained-skips`: zincir doğru ama açıklanmamış atlanan pledge var ya da seçim eşleşmiyor.

**Dürüst sınır (README'de):** Kara liste nedenleri (zaman aşımı, bozuk imza) koordinatörün zincir dışı beyanı; denetim bunları doğrulayamaz, yalnızca listeler. Zincirden kanıtlanan şey, beyan edilen kara listeyle seçimin kurala uyduğu ve dışarıda kalan her pledge'in açıklandığıdır. Sansür engellenmiyor, **tespit edilebilir** hale geliyor (FINAL-IDEA §8 ile aynı).

## 4. Metrikler — `GET /metrics` (`?format=prom` Prometheus metni)

Overlay'deki bütün havuzlar ve settlement'lardan, 10 sn önbellekli:
- `pools` (durumlara göre: open/locking/settled/failed/cancelled), `pledges` (açık, iptal, settle'a giren);
- `settlements`; `participants` (toplam, settlement başına ortalama, en büyük);
- `avgFeeSats`, `avgFeeSatsPerParticipant`, `avgSettlementBytes` (ücret = Σ girdi − Σ çıktı; girdi değerleri BEEF'teki kaynak tx'lerden);
- `rounds` (settle kaydındaki `round`: ortalama, en büyük);
- `custodiedSats` ve `custodyCheck: { settlementsChecked, outputsClassified, unaccountedOutputs: [...] }`: her çıktı yukarıdaki dört sınıftan birine girmeli; girmeyen çıktılar listelenir.

## 5. Dosyalar

```
apps/coordinator/src/audit.ts     auditPool(deps, poolId) → AuditReport
apps/coordinator/src/metrics.ts   computeMetrics(deps) → Metrics; classifySettlement(tx, terms, included) (custody sınıflandırıcısı); toProm(m)
apps/coordinator/src/overlay.ts   + settlementTx(poolId), pledgesAll(poolId) (BEEF'li)
apps/coordinator/src/api.ts       + GET /pools/:poolId/audit, GET /metrics
apps/coordinator/test/e2e.audit-metrics.mockchain.test.ts
```

## 6. Test senaryoları

1. Koordinatörün kurduğu settlement (A'nın builder'larıyla, bir bekleme listesi turu dahil) → `verdict: consistent`, `skippedEarlier` yalnızca kara listedeki pledge ve beyan edilen nedeni.
2. **Kuralı çiğneyen bir koordinatör:** aynı havuz tipinde, sıradaki ilk pledge'i hiçbir beyan olmadan dışarıda bırakan bir settlement (A'nın `planSettlement`'ı `exclude:[ilk]` ile koordinatör dışında kurulur ve yayınlanır) → `selectionMatches:false`, `skippedEarlier: [{ reason: 'not explained' }]`, `verdict: unexplained-skips`.
3. `/metrics`: settlement ve katılımcı sayıları, ücret ortalamaları, `custodiedSats: 0`; Prometheus çıktısında aynı değerler.
4. Sınıflandırıcı birim testi: tanınmayan bir script'e giden çıktı `unaccountedOutputs`'a düşüyor ve `custodiedSats` > 0.

## 7. Kabul

Testler 1–4 yeşil; kök `npm test` ve `npm run typecheck` temiz; servisler tsx altında kalkıyor ve iki uç da cevap veriyor; MASTER §3.5'e iki uç yazıldı; STATUS güncel.
