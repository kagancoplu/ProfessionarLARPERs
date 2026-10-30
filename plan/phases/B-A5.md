# B-A5 — Track A Faz 5'in B tarafı (vault-kilitli krediler + lighthouse)

> 31.10 00:00. A'nın kodu mockchain'de bitti (A-P5 5.1–5.7); A'nın checkpoint'i iki B işini bekliyordu: overlay `ownerKinds` ve `POST /pledges/lighthouse`. Ayrıca A'nın 4.2 isteği: ölçek testi bayrak arkasına.

## 1. Overlay (packages/overlay)

- `AgentCoopTopicManager` varsayılanı `ownerKinds: ['p2pkh','vault']` (A'nın `RuleOptions`'ı): vault script'ine kilitli BSV-21 çıktıları admit, harcanınca girdi olarak sayılır.
- Lookup: token çıktıları `decodeBsv21Owned` ile; migration 004 `owner_vault_hash` (token tablosu) ve pledge tablosuna `credit_lock`, `mode`, `guard`, `lh_id`. Yeni sorgu `{ op:'vaultCredits', vaultHash, tokenId?, includeSpent? }`; context'te `ownerVaultHash`.
- `validatePledgeRecord`: A-P5 alanlarının yapısal kuralı (MASTER §3.8).

## 2. Koordinatör (apps/coordinator)

- `src/candidates.ts`: overlay pledge → A'nın `PledgeCandidate`'i; kayıt **pledge tx'inden** (`pledgeRecordOf`). Önce `coreProtocol` kaydı görünümden kuruyordu ve `creditLock`/`mode`/`guard`/`lhId` düşüyordu (vault-kilitli pledge'in kredisi P2PKH'a planlanırdı, A'nın `verifySettlementPlan`'ı reddederdi).
- `audit.ts` (`creditsDelivered`) ve `metrics.ts` (`classifySettlement`): kredi çıktısı A'nın `creditScriptFor`'u ile; vault-kilitli kredi `unaccounted` sayılmaz.
- `POST /pledges/lighthouse` (`src/lighthouse.ts`, MASTER §3.5) + store tablosu `lighthouse_pledges`; `GuardDirectory` (`LIGHTHOUSE_GUARDS`, varsayılan `GUARD_URL`): kimlik → URL, `/healthz`'ten.
- Motor: `mode:'lighthouse'` girdiye WS `sign_request` yerine `lighthouseCosign(guardUrl, { plan, inputIndex, pledge })`; dönen unlock şablonda `inputIsValid`. Saklanmamış lighthouse pledge plana girmez.

## 3. Ölçek testi

`e2e.scale.mockchain.test.ts` yalnız `SCALE=1` ile (`npm run test:scale`).

## 4. Test

- `packages/overlay/test/overlay.vaults.test.ts` 5–6: vault-kilitli kredi admit → `vaultCredits` → sahip harcar; pledge alanları ve bozuk kayıtların reddi.
- `apps/coordinator/test/e2e.lighthouse.mockchain.test.ts`: iki insan lighthouse + bir ajan; koordinatöre verilmemiş lighthouse plana girmez; verildikten sonra guard iki insanı ortak imzalar, tek settlement, `audit consistent`, `custodiedSats: 0`; bozuk imza / bilinmeyen guard 422.
- `apps/coordinator/test/metrics.credit-locks.test.ts`: vault-kilitli kredi `credits`, başka yere giden `unaccounted`.

## 5. Mainnet'e etkisi

Çalışan overlay/koordinatör yeniden başlatılana kadar eski kodla çalışır. Overlay yeniden başlarken migration 004 çalışır (kolon ekler, veri silmez); daha önce admit edilmemiş vault-kilitli çıktı yok (mainnet'te henüz vault-kilitli kredi basılmadı).
