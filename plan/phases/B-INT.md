# B-INT — Track A ile entegrasyon (kök workspace, `@agentcoop/core`, gerçek protokol)

> Track B. Faz değil: Faz 0–3'ün "A gelince" diye bırakılan maddelerini kapatır. Faz 4 (kapanış) ve Faz 5/6'dan (S3 sonrası) önce yapılır.
> Yazıldı: 30.10 ~17:20. Branch: `main` (kullanıcı kararı: trackB kapatıldı, herkes main'den çalışıyor).

## 1. Neden şimdi

A, Faz 0–2'yi `main`'e koydu: kök workspace (`packages/*`, `apps/*`, `scripts`), `@agentcoop/core` (tipler, `parseOpReturn`, `vaultLockingScript`, kit kopyaları, `planSettlement`, `verifyOffer`, `verifyListing`, `verifySettlementPlan`, `signSettlementInput`, `assembleSettlement`, `broadcastEF`, `fetchChainPolicy`, `buildReserveAndAnnounce`, `buildPledge`, `cancelPledge`). Track B'nin geçici kopyaları ve test-only planlayıcısı artık çoğalan kod (kullanıcının 16:25'te işaret ettiği sorun).

## 2. Görevler

1. **Workspace göçü:** `packages/overlay` ve `apps/coordinator`'ın kendi `package-lock.json`, `node_modules` ve `vitest.config.ts`'i silinir; kök `npm install` + kök `vitest.config.ts`. Paketlere `@agentcoop/core` bağımlılığı. Paket `test` script'leri kökten koşar.
2. **SDK tek kopya:** Track B kodunda `@bsv/sdk` → `@agentcoop/core/sdk` (MASTER §3.1).
3. **Overlay:** `src/kit/*` silinir → `@agentcoop/core`; `src/stub/opreturn.ts` → core `parseOpReturn/buildOpReturn`; `src/stub/types.ts` → core tipleri (`SettleRecord` yerel kalır); `src/stub/vault.ts` → core `vaultLockingScript` + `VAULT_PROTOCOL`, overlay'e özgü `expectedVaultScript` / `isVaultScriptHex` `src/vault.ts`'te. Testler kökteki `test/helpers/mockchain.ts`'i kullanır.
4. **Koordinatör:**
   - `src/protocol.ts`'e `coreProtocol({ arcadeUrl, policy?, broadcast? })`: `planSettlement` (PledgeView + kaynak tx → A'nın `PledgeCandidate`'i; `ChainInfo` = yükseklik + `fetchChainPolicy` ücret oranı, 60 sn önbellek), `assembleSettlement`, `broadcastEF`. Sunucu varsayılanı bu: `npm run coordinator` artık gerçek imza turları çalıştırır.
   - `verifyOffer.ts` / `verifyListing.ts`: imza ve kredi kontrolü A'nın `verifyOffer` / `verifyListing`'ine devredilir (`BAD_OFFER` / `BAD_LISTING`); koordinatörde yalnızca zincir durumu kalır (overlay'de var mı, açık mı, harcanmamış mı, terms zincirdeki kayıtla aynı mı).
   - `test/helpers/devProtocol.ts` silinir; testler `coreProtocol`'u mock yayınla kullanır.
5. **Uçtan uca entegrasyon testi** (`apps/coordinator/test/e2e.integration.mockchain.test.ts`): A'nın builder'larıyla, `tm_agentcoop` overlay'i ve koordinatör üzerinden: `TokenKit.deploy` → `buildReserveAndAnnounce` → `signOffer` → `POST /offers` → iki ajan `buildPledge` (600/400) → koordinatör turu (A'nın `planSettlement`'ı) → ajan botları `verifySettlementPlan` + `signSettlementInput(P2pkhWalletSigner)` → yayın → overlay `settled` → `internalizeSettlement` + `TokenKit.sync()` 600/400. Bu, doğrulama testi 1'in A'nın gerçek tx'leriyle tekrarı ve S1'in mockchain karşılığı.
6. STATUS: göç bitti, geçici kopyalar kalktı; blokaj satırları kapatılır (A.P0 yok, `pledgeListHash`).

## 3. Kabul

Kök `npm test` içinde Track B'nin bütün testleri yeşil (eski davranış testleri + entegrasyon testi); `npm run typecheck` (kök) Track B dosyalarında hatasız; Track B'de `src/kit`, `src/stub/{opreturn,types,vault}`, `devProtocol`, ayrı lock dosyaları yok.
