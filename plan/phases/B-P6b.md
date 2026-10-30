# B-P6b — Faz 6'nın mockchain kısmı: teklif zincirde, ikinci koordinatör, 50/100 katılımcı

> Track B. `plan/track-B-overlay-coordinator.md` Faz 6.1, 6.2, 6.5, 6.6. Kullanıcı kararıyla S3 beklenmeden, mockchain'de. Mainnet kısımları (koordinatör 2'nin mainnet settlement'ı, ≥ 50 katılımcılı mainnet T5) D'nin sats'ı ve C'nin ajan sürüsüyle.
> Yazıldı: 30.10 akşam, B-P5a'dan sonra. `git pull` yapıldı; başka track'ten yeni commit yoktu.

## 1. Teklif zincirde (6.1) — MASTER §3.2 `offer` op'u, §3.8 `offers` sorgusu

- Kayıt: `OP_FALSE OP_RETURN "agentcoop" "offer" { v:'1', poolId, unlockingScriptHex }`, 0 sat, ayrı küçük bir tx (imza havuz tx'inin kendi çıktısını harcadığı için aynı tx'e giremez). Terms ve kilit script'i zaten zincirde.
- Core (yalnız ekleme): `COOP_OPS`'a `offer`; `packages/core/src/pool/offerRecord.ts` → `publishOffer`, `offerFromRecord`, `offerRecordOf`.
- Overlay: kayıt yapısal doğrulamayla admit edilir; `{ op:'offers', poolId }` hepsini döndürür (doğrulamaz: herkes yayınlayabilir).
- Koordinatör `src/offers.ts` `OfferSource`: önce kendi deposu, yoksa zincirdeki kayıtlar → `offerFromRecord` + `verifyOffer` → ilk geçerli saklanır. Terms havuz görünümünden **yalnız `PoolTerms` anahtarlarıyla** kurulur (zincir kaydındaki `nonce` imzalanan terms'te yok), böylece `termsHash` sağlayıcının imzaladığıyla aynı. Engine her açık havuz için arar (bulunamazsa 15 sn sonra tekrar; overlay olayında hemen). Denetim settle edilmiş havuzun teklifini "açık" şartı olmadan kabul eder.
- C'ye: `provider-cli open-pool`, `signOffer`'dan sonra `publishOffer` + overlay submit yapmalı (POST /offers yine yapılır).

## 2. İkinci koordinatör (6.2)

Aynı kod, ayrı DB, aynı overlay. `infra/run.mjs` `COOP2_PORT` ile ikinciyi kaldırır (Caddy `COOP2_HOST` bloğu yorumda). Test `e2e.second-coordinator.mockchain.test.ts`: K1 havuz B'yi kapatır → K1 kapanır → K2 havuz B'yi yalnız zincirden denetler (`consistent`, `termsHashMatches`, teklif bayt bayt aynı) → havuz A'nın teklifi yalnız zincirde (önce sahte bir kayıt) → K2 bulur, turu çalıştırır, settle eder; `/metrics` iki settlement'ı sayar.

## 3. Ölçek (6.5, 6.6)

`e2e.scale.mockchain.test.ts`: her katılımcı ayrı wallet-toolbox cüzdanı, kanıtlı WS, A'nın `verifySettlementPlan` (soy dahil) + `signSettlementInput`. Sonuçlar STATUS'ta. 6.6: plan tur başına bir kez serileştiriliyor. Bulunan sorun: 100 katılımcıda overlay-express'in keep-alive soket kapanışıyla yarışan lookup'lar `ECONNRESET` → `OverlayLookup.lookup` soket hatasında 2 kez yeniden dener.

## 4. Kabul (mockchain)

İki koordinatör aynı overlay'de; K2 zincirdeki teklifle bir havuzu kapattı ve K1'in settlement'ını denetledi; 50 ve 100 katılımcı tek settlement'ta, `consistent`, 100 sat/kB; kök `npm test` ve typecheck temiz.
