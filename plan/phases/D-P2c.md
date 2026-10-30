# D-P2c — Guard `kind: 'lighthouse'` (A 5.5–5.7 isteği)

> Track D. STATUS "Arayüz değişiklikleri" 30.10 22:30 A → B, D, C, E: lighthouse pledge'i veren insan çevrimdışı; turda koordinatör insanın kaydındaki guard'a sorar. Kullanıcı kararı (30.10 ~23:00): şimdi. Önce `git pull` + STATUS (yeni commit yoktu).

## Tasarım

- `POST /cosign` gövdesi `{ context: { kind: 'lighthouse' }, plan, inputIndex, pledge: LighthousePledge }` (üst düzey `kind: 'lighthouse'` da kabul). Ajan imzası, vault ve politika yok: insan bu tek pledge için bu guard'ı seçti.
- `apps/guard/src/lighthouse.ts` `evaluateLighthouse`: **teklif plandan** (girdi 0'ın kaynağı = havuz tx'i, txid'e bağlı; terms + nonce `poolFactsFromTx`, unlocking script = sağlayıcının teklif imzası), istekteki `offer` kullanılmaz. Sonra A'nın `cosignLighthouse(guardWallet, { plan, offer, inputIndex, pledge, lineage })`: kayıttaki guard = ben, havuz eşleşiyor, `verifySettlementPlan` + `verifyLineage`, insan imzası bu plan için geçerli. `AgentCoopError` → 403, diğer → 400.
- Cevap `{ unlockingScriptHex }` (insan + guard, tam unlock). Karar kaydı `kind: 'lighthouse'` (katılımcı, havuz, outpoint, kredi). Guard kuyruğunda sıralı.
- İstemci: `lighthouseCosign(guardUrl, { plan, inputIndex, pledge })` (`@agentcoop/core/signers/VaultSigner`) → unlock hex; ret → `CosignRejected`.

## Test

`test/guard.lighthouse.mockchain.test.ts` 3/3: HTTP üzerinden; redler (krediyi başkasına ödeyen plan, insanın adlandırmadığı guard, yanlış girdi, bozuk istek 400; 4 DENY kaydı); iki insan guard'la, ajan kendisi imzalıyor → tek settlement script doğrulamasından geçiyor, mock chain'de yayın, insanların kredi çıktıları yerinde.

## Checkpoint (30.10 ~23:10)

1. Plan değişikliği yok.
2. Bitti: guard `lighthouse`, istemci `lighthouseCosign`, test; MASTER §3.7 satırı ✅; guard README; THREAT-MODEL T-20.
3. Diğer track'ler: **B** turda lighthouse katılımcısı için `lighthouseCosign(record.guard'ın URL'si, …)` çağırmalı (guard kimliğinden URL'ye eşleme B'nin; şimdilik `GUARD_URL`); **C/E** değişiklik yok.
4. Sonraki: kullanıcıya sorulacak (mainnet laptop/fonlama hâlâ bekliyor).
5. Arayüz: MASTER §3.7 lighthouse satırına istek biçimi ve istemci eklendi.
