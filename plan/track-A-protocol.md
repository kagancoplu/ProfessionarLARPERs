# Track A — Protokol çekirdeği (`packages/core`)

> **Rol:** Zincir üstü mekanizmanın tamamı: tipler, tx builder'ları, sighash imzalama (BRC-100 ve wallet-toolbox), DvP doğrulayıcı, `verifyLineage`, market builder'ları, walking skeleton. **Kritik yol sende**: B ve C senin builder'larını kullanır.
> **Referanslar:** `00-MASTER-PLAN.md §3` (arayüzler), `FINAL-IDEA.md §4` (mekanizma), guide §5, §6.3, §9, §17, §20; kit `client/signer.ts`, `client/token.ts`, `core/rules.ts`, `test/helpers/mockchain.ts`.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver. Prompt şablonu:
   > "`plan/00-MASTER-PLAN.md` §3 ve §4'ü, `plan/STATUS.md`'yi ve `plan/track-A-protocol.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Bitince fazın sonundaki Checkpoint'i uygula ve STATUS.md'de Track A bölümünü güncelle."
2. AI kit kodunu **kopyalar**, baştan yazmaz. API adını tahmin etmez; `node_modules/@bsv/sdk/dist/types` içinde doğrular.
3. Faz bitmeden sonraki faza geçilmez.

---

## Faz 0 — İskelet, tipler, SDK köprüsü, imza spike'ı → S0

**Amaç:** Herkesin üzerine inşa edeceği zemin 1–2 saat içinde hazır olsun; en riskli varsayım (Desktop ile özel scope imza) ilk saatte test edilsin.

**Bağımlılık:** yok. (Sats yoksa 0.4'ü D fonlayana kadar ertele; diğerlerini yap.)

**Görevler**
- 0.1 Monorepo: kök `package.json` (workspaces `packages/*`, `apps/*`, `scripts`), `tsconfig.base.json`, kök `vitest.config.ts` = kit'in alias'ı (yolu `node_modules/@bsv/sdk/dist/cjs/mod.js`), `.gitignore` (`.env`, `data/`, `*.sqlite`), `AGENTS.md` kopyası. Versiyonlar `docs/AGENTS.md` tablosundaki gibi sabit.
- 0.2 `packages/core`: `src/types.ts` (MASTER §3.3 birebir), `src/sdk.ts` (`export * from '@bsv/sdk'`), `src/index.ts`. Kit'ten kopyala: `core/inscription.ts`, `core/rules.ts`, `core/addresses.ts`, `client/signer.ts`, `client/token.ts`, `client/overlayApi.ts`, `client/payments.ts`, `client/arcadeChainTracker.ts`, `client/coinselect.ts` → `packages/core/src/kit/`. `test/helpers/mockchain.ts` → `test/helpers/`.
- 0.3 `src/scripts/opreturn.ts`: `buildOpReturn(op, json)` / `parseOpReturn(script)`; zarf MASTER §3.2. Test: round-trip, tüm sayılar string.
- 0.4 **Doğrulama testi 2 + 3 (mainnet, BSV Desktop, 1.000 sat):** `scripts/spike-sighash.ts`: Desktop'a `WalletClient('auto', APP_ORIGINATOR)` ile bağlan; 1.000 sat'lık bir coin'i `[1,'agentcoop pledge']` türevli P2PKH'ye ayır (`createAction`, basket `agentcoop`); bu girdiyi `SINGLE|ANYONECANPAY|FORKID` ile imzala (kit `signWalletP2pkhInput`'ın scope parametreli kopyası); ikinci bir wallet-toolbox cüzdanı ücret girdisi ekleyip `ALL|FORKID` ile tamamlasın; EF olarak Arcade'e yayınla. Gözlemle: Desktop kaç onay penceresi gösterdi (test 3). Sonucu STATUS "Doğrulama testleri" tablosuna yaz.
- 0.5 `src/signers/P2pkhWalletSigner.ts`: `InputSigner` arayüzünü uygular; scope parametresi alır (varsayılan ALL|FORKID). `signer.ts`'in genelleştirilmiş hali.
- 0.6 `npm test` yeşil (kit'ten taşınan rules testi + opreturn testi).

**Kabul:** `npm install && npm test` temiz; `packages/core` diğer workspace'lerden `@agentcoop/core` olarak import ediliyor; test 2/3 sonucu STATUS'ta; S0 maddeleri A için ✓.

**Çıktılar:** kök konfigürasyon; `packages/core/src/{types,sdk,index}.ts`, `src/kit/*`, `src/scripts/opreturn.ts`, `src/signers/P2pkhWalletSigner.ts`; `scripts/spike-sighash.ts`; `test/helpers/mockchain.ts`.

> **Durum (2026-10-30): ✓ mockchain, mainnet koşusu bekliyor.** Ayrıntı ve sonuç: `plan/phases/A-P0.md`. Plandan sapmalar:
> - `sdk.ts` tsconfig `paths` yerine CJS build'i **göreli dosya yoluyla** yeniden dışa aktarır (SDK `exports` haritası `dist/cjs`'e izin vermiyor). Kural: herkes `@agentcoop/core/sdk`'dan import eder.
> - Ek dosyalar: `src/errors.ts` (`AgentCoopError`), `src/signers/sighash.ts` (`signP2pkhWithScope`, `sighashFor`), `src/scripts/{vault,htlc}.ts` iskeletleri, `src/kit/lookupTypes.ts`; `OverlayClient`'a opsiyonel `topic`/`service`.
> - 0.4'ün mockchain yarısı: `test/spike-sighash.mockchain.test.ts`. Mainnet yarısı (`scripts/spike-sighash.ts`) Desktop + sats bekliyor (STATUS Blokajlar).

### ✋ Checkpoint (Faz 0 sonu)
1. **Plan hâlâ iyi mi?** Test 2 başarısızsa `FINAL-IDEA.md §12.2`'deki B planı devreye girer: sağlayıcı teklifleri sunucu cüzdanından çıkar. Bu dosyanın Faz 1.2'sini ve MASTER §3.3 `Offer` notunu güncelle; STATUS "Plan değişiklikleri"ne yaz. Başka öğrendiğin bir şey planı değiştiriyorsa aynı şekilde.
2. **Bu faz bitti** → STATUS Track A bölümünü güncelle (faz, dosya yolları, bilinen sorunlar).
3. **Diğer track'ler ne yaptı?** STATUS'un tamamını oku. B ve C senin `types.ts`'ini bekliyor; hazır olduğunu "Diğer track'lerin benden beklediği" satırına yaz.
4. **Sonraki fazın bağımlılıkları:** D.P0 (fonlanmış sunucu cüzdanları, `scripts/wallets.ts`). Yoksa Faz 1'i mockchain'de bitir, mainnet koşusunu beklet; STATUS Blokajlar'a yaz.
5. Arayüz değiştirdiysen MASTER §3'ü güncelle ve STATUS'ta duyur.

---

## Faz 1 — Offer, pledge, settlement builder'ları + walking skeleton → S1

**Amaç:** Yalnızca sunucu cüzdanlarıyla, 1 sağlayıcı + 2 ajan, mockchain'de ve sonra mainnet'te **ilk DvP settlement**. Projenin en büyük teknik riski burada kapanır.

**Bağımlılık:** D.P0 (`scripts/wallets.ts`, fonlanmış `agent-1`, `agent-2`, `provider-api`). Overlay için B.P1'in `tm_agentcoop`'u; hazır değilse kit'in `tm_tokenkit`'i ile geçici (kurallar aynı).

**Görevler**
- 1.1 `src/pool/reserve.ts` — `buildReserveAndAnnounce(wallet, tokenKit, terms)`: N krediyi tek bir UTXO'ya al (gerekirse `TokenKit.merge` + `send(…, 'self')` ile tam N'lik çıktı; çıktı 0'da olacak), aynı tx'e `OP_RETURN pool <terms>` ekle. `poolId = txid_0`. Overlay'e submit (kit outbox).
- 1.2 `src/pool/offer.ts` — `signOffer(wallet, outpoint, terms)`: girdi 0 ↔ çıktı 0 (`payScriptHex`, `priceSats`) eşlemesiyle `SINGLE|ACP|FORKID` imzası; `Offer` döndür. Doğrulayıcı: `verifyOffer(offer)` → imza, outpoint harcanmamış (Arcade `/tx` + overlay), terms tutarlı.
- 1.3 `src/pool/pledge.ts` — `buildPledge(wallet, terms, credits, 'p2pkh')`: tutar = `ceil(credits × priceSats / N)` + ücret payı tamponu (örn. +300 sat); out0 pledge coin (türev anahtar, basket `agentcoop`, customInstructions'da protocol/keyID), out1 `feeSats → payScriptHex`, out2 `OP_RETURN pledge`. `cancelPledge` = coin'i kendine BRC-29 ile harca.
- 1.4 `src/pool/plan.ts` — `planSettlement(offer, pledges, chainInfo)`: MASTER §3.2 sıralama; `%120` üst sınır; kredi toplamı tam N olacak şekilde katılımcı listesi (fazlası bekleme); ücret hesabı (Arcade `/health` policy'den sat/kB, katılımcılara eşit bölüştür); para üstü = pledge coin'in kendi script'ine; `pledgeListHash`; şablon tx: in0 offer, out0 pay, in1..n pledges, out1..n BSV-21 transfer inscription → `receivePkh(participant, tokenIndex)` (kit `addresses.ts`), out n+1.. para üstleri, son OP_RETURN settle. `templateBEEF` = tüm kaynak tx'lerle (pledge tx'leri + offer tx'i; gerekirse `beefFromArcade`).
- 1.5 `src/pool/verify.ts` — `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: false })`: çıktı 0 teklife eşit; benim girdim var; benim kredi çıktım doğru adres ve miktar; para üstüm ≥ beklenen; Σkredi = N; OP_RETURN hash'i yeniden hesaplanıp eşit; sıralama kuralına uygun. (`verifyLineage` Faz 2'de eklenir, bayrak şimdiden var.)
- 1.6 `src/pool/sign.ts` + `assemble.ts` + `broadcast.ts` — `signSettlementInput(plan, i, signer)`, `assembleSettlement(plan, scripts)`, `broadcastEF(tx, arcadeUrl)` (guide §20.1: `POST /tx` EF). Yayından sonra overlay'e submit (`X-Topics: ["tm_agentcoop"]`).
- 1.7 **`scripts/skeleton.ts`**: sunucu cüzdanlarıyla uçtan uca: token deploy (N=1.000, dec 0) → reserve+announce → offer → agent-1 pledge 600, agent-2 pledge 400 → plan → her ajan verify + sign → assemble → broadcast → overlay submit → her ajanın `TokenKit.sync()`'i kredileri görüyor → WhatsOnChain linki bas. Önce `test/skeleton.mockchain.test.ts` olarak mockchain'de (B'nin overlay'i testte HTTP ile ayağa kalkar; kit'in `e2e.mockchain.test.ts` deseni), sonra `NETWORK=main` ile mainnet.
- 1.8 Başarısız havuz testi: deadline geçti, pledge'ler harcanmamış duruyor, hiçbir yayın yok (`planSettlement` `deadlineHeight` sonrası reddeder).

**Kabul:** mockchain testi yeşil; mainnet'te settlement txid'si STATUS "Mainnet işlemleri"nde (T1, T2, T3, **T5**); her iki ajanın overlay'de kredi bakiyesi doğru; S1 ✓.

**Çıktılar:** `packages/core/src/pool/*`, `scripts/skeleton.ts`, `test/skeleton.mockchain.test.ts`.

> **Durum (2026-10-30): ✓ mockchain, mainnet (S1) bekliyor.** Ayrıntı ve sonuç: `plan/phases/A-P1.md`. Plandan sapmalar:
> - 1.1: kredi UTXO'su token receive adresinde değil, `[1,'agentcoop provider']` keyID `offer <poolNonce>` anahtarına taşınır, basket `agentcoop offers` (TokenKit dokunmasın). Pool OP_RETURN json = terms − `poolId` + `nonce`. MASTER §3.2'de.
> - 1.2: `verifyOffer(offer, { sourceTx })` çevrimdışı (miktar, token, imza Spend ile). Harcanmamışlık kontrolü çağırana (koordinatör: overlay/Arcade) kaldı.
> - 1.4: `pledgeListHash` = sha256(join(',', sort_lex(outpoint'ler))). %120 penceresi, yetersiz coin düşürülünce yeniden hesaplanır. Ücret, gerçek imza boyutu × `fetchChainPolicy()` (Arcade `/health`).
> - 1.6: sign/assemble/broadcast/internalize tek dosyada: `src/pool/settle.ts`. `broadcastEF` = `POST {arcade}/tx` JSON `{ rawTx: EF hex }` (wallet-toolbox Arcade.js ile aynı). Yeni: `internalizeSettlement` (para üstü `change:true` ile basket'e, harcanan pledge `relinquishOutput`).
> - 1.7: overlay olarak testte kit overlay'i (`tm_tokenkit`); B'nin `tm_agentcoop`'u gelince `OverlayClient(..., COOP_TOPIC, COOP_SERVICE)`.

### ✋ Checkpoint (Faz 1 sonu)
1. **Plan hâlâ iyi mi?** Skeleton'da ücret, BEEF ya da overlay kabulü ile ilgili sürpriz çıktıysa Faz 2'yi ve MASTER §3.3/3.4'ü güncelle; STATUS'a yaz. Overlay reddettiyse (doğrulama testi 1) B ile birlikte `rules.ts` genişletmesine karar ver.
2. **Bu faz bitti** → STATUS Track A güncelle; txid'leri yaz.
3. **Diğer track'ler ne yaptı?** B.P1 offers API'si hazır mı (skeleton'ı `POST /offers` kullanacak şekilde bağla); C.P1 ürün/token var mı (skeleton'ı C'nin token'ına geçir).
4. **Sonraki fazın bağımlılıkları:** Arcade/WoC erişimi (var). D.P1 vault script'i Faz 3 için; şimdi gerekmiyor.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 2 — `verifyLineage`, market builder'ları, sertleştirme → S2

**Amaç:** Katılımcı ve guard overlay'e güvenmeden kredi soyunu kendileri doğrulasın; market listeleri ve sweep çalışsın; builder'lar üretim kalitesine yaklaşsın.

**Bağımlılık:** Faz 1. (C.P2 ve D.P2 senin `verifyLineage`'ini bekliyor: **önce 2.1'i bitir ve STATUS'a yaz.**)

**Görevler**
- 2.1 `src/verify/lineage.ts` — `verifyLineage(outpoint, { arcadeUrl, wocUrl? })`: tx'i ve atalarını `beefFromArcade` (kit) ile çek, onaylanmamış ataları yürü, WoC `GET /v1/bsv/main/tx/{txid}/beef` fallback; her adımda `identifyAdmissible` (kit `rules.ts`) uygula; deploy'a ulaşınca `{ ok, tokenId, amt, ownerPkh, depth }` döndür. Derinlik sınırı (örn. 50) ve önbellek. **Doğrulama testi 7**: taze bir mainnet token transferinde çalıştır.
- 2.2 `verifySettlementPlan`'a `verifyLineage: true` yolu: offer girdisi gerçek kredi mi, `amt = N` mi.
- 2.3 `src/market/listing.ts` — `signListing(wallet, outpoint, askSats)`: `SINGLE|ACP`, `payScriptHex` satıcının türev anahtarı (`[1,'agentcoop provider']` yerine `[1,'agentcoop market']`, MASTER §3.2'ye ekle), `OP_RETURN list` ayrı küçük tx ile ilan (opsiyonel; esas kayıt B'nin `POST /listings`'i). `cancelListing` = coin'i harca.
- 2.4 `src/market/sweep.ts` — `buildSweep(wallet, listings[])`: girdi i ↔ çıktı i (satıcı ödemeleri), ardından tek kredi çıktısı alıcıya, para üstü; alıcı `ALL`; `verifyLineage` her liste için. Test: 2 liste tek tx'te.
- 2.5 Ücret ve politika: Arcade `/health`'ten sat/kB oku, settlement boyutunu gerçek imza uzunluklarıyla hesapla (p2pkh 108, vault 2-of-2 ≈ 150 — D ile teyit), katılımcıya eşit böl, yuvarlama fazlasını sağlayıcıya değil ilk katılımcıya değil **ücrete** bırak.
- 2.6 Griefing desteği: `planSettlement(…, { exclude: outpoint[] })` — kara liste; bekleme listesinden tamamlama; `round` numarası.
- 2.7 Hata mesajları ve tip güvenliği: her `verify*` fonksiyonu `AgentCoopError{code}` fırlatır; kodlar MASTER §3.4'e eklenir (koordinatör ve guard bunları loglar).
- 2.8 Test paketi: `test/core.pool.test.ts` (sıralama determinizmi, %120, hash, para üstü), `test/core.lineage.test.ts` (sahte token reddi — kit'in forgery testinden türet), `test/core.market.test.ts`.

**Kabul:** sahte kredi içeren bir plan `verifySettlementPlan`'da düşüyor (test); mainnet'te bir liste + sweep (T8) yapıldı; S2 için A tarafı ✓.

**Çıktılar:** `src/verify/lineage.ts`, `src/market/*`, testler, MASTER §3.2/3.4 güncellemeleri.

> **Durum (2026-10-30): ✓ mockchain, mainnet (test 7, T8) bekliyor.** Ayrıntı ve sonuç: `plan/phases/A-P2.md`. Plandan sapmalar:
> - 2.1: `verifyLineage` yalnız **aynı token'ın** girdilerini yürür, getirilen her tx'in txid'ini yeniden hesaplar, ata imzalarını Spend ile doğrular. `fetchTx` enjekte edilebilir. CLI: `scripts/lineage-check.ts`.
> - 2.3: liste kredisi `[1,'agentcoop market']` keyID `list <nonce>`'a taşınır (`reserveListing`, basket `agentcoop listings`), `OP_RETURN list` aynı tx'te. Sonra `signListing`, `verifyListing`. İptal = `cancelListing` (krediyi geri alır). Havuz iptali için `cancelPool`.
> - 2.4: `src/market/sweep.ts` yerine `src/market/listing.ts` içinde. **İmza değişti:** `buildSweep(wallet, kit, listings[], opts)` → `{ txid, credits, tx }` (MASTER §3.4 + STATUS).
> - 2.5 ve 2.6 Faz 1'de yapıldı. 2.7: kodlar MASTER §3.4'te (`BAD_LISTING`, `LINEAGE_FAILED` …). 2.8: test dosyaları `packages/core/test/{pool.plan,lineage}.test.ts`, `test/market.mockchain.test.ts`.

### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** `beefFromArcade` onaylanmamış atalarda yetersiz kaldıysa WoC fallback'i birincil yap ve bunu planla; `verifyLineage` çok yavaşsa önbellek stratejisini yaz. Değişiklikleri STATUS'a.
2. **Bu faz bitti** → STATUS Track A.
3. **Diğer track'ler ne yaptı?** D.P1 `vaultLockingScript` ve `VaultSigner` hazır mı (Faz 3 bunu entegre eder)? B.P2 koordinatör `planSettlement`'ı kullanıyor mu, hangi hata kodlarına ihtiyaç duydu?
4. **Sonraki fazın bağımlılıkları:** D.P1 (vault script + guard `/cosign`), B.P2 (koordinatör). Hazır değilse Faz 3'ün 3.1'ini D'nin arayüz taslağına karşı mock guard ile yaz.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 3 — Vault yolu entegrasyonu ve uçtan uca senaryolar → S3

**Amaç:** Vault'lu bir ajan settlement'a girsin (ajan + guard imzası); market ve koordinatör akışları çekirdek testlerle kilitlensin.

**Bağımlılık:** D.P1/P2 (`vaultLockingScript`, `VaultSigner`, guard `/cosign`), B.P2 (koordinatör turu).

**Görevler**
- 3.1 `buildPledge(…, 'vault', vaultScript)`: pledge coin vault script'ine kilitli (ajan vault'tan çıkarır: ajan + guard 2-of-2 ile `createAction + signAction`, guard `context.kind='pay'`); para üstü vault'a. `unlockingScriptLength` vault için D'nin değeri.
- 3.2 `test/e2e.vault-settlement.mockchain.test.ts`: 1 p2pkh ajan + 1 vault ajan + sağlayıcı; guard mock olarak süreç içinde (D'nin politika motoru import edilir); settlement başarılı; ardından aynı test guard'ın reddettiği bir plan (allowlist dışı sağlayıcı) → imza yok → yayın yok.
- 3.3 `test/e2e.coordinator.mockchain.test.ts` (B ile birlikte): 3 ajan, biri imzalamıyor → tur 2'de bekleme listesinden tamamlanıyor; kara liste çalışıyor.
- 3.4 `test/e2e.market.mockchain.test.ts`: settlement sonrası ajan 1 artan krediyi listeler, ajan 3 sweep ile alır, `verifyLineage` geçer.
- 3.5 Mainnet: vault'lu settlement (T5 + T10) bir kez.

**Kabul:** üç e2e testi yeşil; mainnet'te vault'lu settlement txid'si STATUS'ta; S3 için A ✓.

### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Vault imza uzunluğu, dummy eleman (`OP_0`) veya policy reddi gibi sürprizler varsa D ile MASTER §3.3 `InputSigner` notunu güncelle.
2. **Bu faz bitti** → STATUS Track A.
3. **Diğer track'ler ne yaptı?** C.P3 ajanlar vault modunu kullanıyor mu; D.P3 Rail PoC `htlcLockingScript` için senden bir şey istedi mi?
4. **Sonraki fazın bağımlılıkları:** yok (dokümantasyon).
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Genişletme fazları (5 ve 6) — neden ve kurallar

> Faz 0–3 mekanizmanın en az halini kurar. Jüri ağırlıkları (benimsenme %35, stack %25, teknik/non-custodial %20) karşısında fark yaratan üç şey eksik kalıyor: (1) FINAL-IDEA §8'deki tek **"Açık"** non-custodial madde (ajan krediyi satıp guard'ı atlatıyor), (2) çevrimdışı **insanların** havuza katılabilmesi (benimsenme: insanlar ajanlar gibi 60 sn'lik imza turunda beklemez), (3) mevcut 1Sat ekosistemine **görünürlük** (krediler bizim overlay'imiz dışında da alınıp satılabilmeli).
>
> **Kurallar:** Faz 5 ve 6, **S3 tamamlanmadan başlamaz**. Çekirdek builder imzaları (MASTER §3.4) değişmez; yalnızca yeni fonksiyon eklenir. Her genişletme bir bayrak arkasındadır (`creditLock: 'p2pkh' | 'vault'`, `pledgeMode: 'interactive' | 'lighthouse'`); bayrak kapalıyken davranış Faz 3 ile birebir aynıdır ve mevcut testler değişmeden yeşil kalır. Faz 4 (kapanış) genişletmelerden sonra yapılır; zaman yetmezse Faz 5/6 kesilir, Faz 4 kesilmez.
>
> **Değerlendirilip eklenmeyenler:** dönemlik (forward) krediler (likiditeyi parçalar, FINAL-IDEA §4.11), Coop Rail ters yön (D'nin alanı), MCP server (C'nin alanı). Bunlar K3'te kalır.

---

## Faz 5 — Vault'a kilitli krediler + Lighthouse modu (çevrimdışı insan pledge'i) → S3+

**Amaç:** (a) Vault'lu ajanın kredisi settlement'ta **vault script'ine kilitli** bir BSV-21 çıktısına insin; böylece kredi harcamak (redeem, liste) da guard ortak imzası ister ve FINAL-IDEA §8'deki "ajan krediyi satıp guard'ı atlatıyor" açığı **kapanır**. (b) İnsanlar havuza **bir kez imzalayıp çevrimdışı** katılabilsin (Lighthouse modu), DvP bozulmadan.

**Bağımlılık:** S3 (Faz 3 yeşil). D.P1 `vaultLockingScript` (gerçek gövde). B'nin topic manager'ı yeni çıktı tipini kabul etmeli (kural fonksiyonu A'dan gelir, B bağlar). Hazır değilse: A kendi testinde kit overlay'ini genişletilmiş `identifyAdmissible` ile ayağa kaldırır, STATUS → Blokajlar.

**Tasarım notları**
- **Vault'a kilitli kredi çıktısı:** `OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF` + **vault script'i** (P2PKH yerine). Script BSV-21'i zorlamaz ama sahiplik koşulunu zorlar: çıktıyı harcamak sahip imzası ya da ajan+guard 2-of-2 ister. Token kuralları (korunum, soy) değişmez; yalnızca **sahiplik eki** genişler: kit `decodeBsv21` P2PKH eki bekler → yeni `decodeBsv21Owned(script)` → `{ …decoded, owner: { kind: 'p2pkh', pkh } | { kind: 'vault', vaultHash } }`. `vaultHash = sha256(vaultScriptHex)` (lookup indeksi için).
- **1Sat uyumu:** 1Sat indexer P2PKH-dışı ekleri sahip adresi olmadan indeksler; BananaBlocks'ta görünürlük kaybolabilir. Bu bilinçli bir takas; README'de yazılır. Vault'tan çıkan kredi (redeem/liste) tekrar P2PKH'ye iner, görünür olur.
- **Lighthouse modu:** idea.md'deki `ALL|ACP` tasarımı DvP'yi bozuyordu (FINAL-IDEA §4.6). Biz bunun yerine **`SINGLE|ANYONECANPAY` pledge** kullanırız: insanın pledge girdisi `i`, settlement'ta **aynı index'teki** kendi kredi çıktısıyla eşlenir ("bu coin'i, aynı index'teki çıktı bana k kredi verdiği sürece harcayın"). Settlement düzeni zaten `in i ↔ out i` (in0 teklif ↔ out0 ödeme, in1..n pledge ↔ out1..n kredi) olduğundan **şablon değişmez**. Kısıt: SINGLE yalnızca bir çıktıyı kapsar → para üstü yok → pledge coin **tam tutarlı** olur (`ceil(k×P/N) + ücretPayı`); ücret payı fazlası ücrete gider. Kredi çıktısının script'i ve miktarı imzayla sabit → koordinatör değiştiremez, DvP korunur. Çıktının BSV-21 geçerliliği (girdi 0'ın gerçek kredi olması) insanın imza anında kontrol edilemez; bu yüzden insan imzası yalnızca **o havuzun `poolId`'sine** kilitli olur: pledge OP_RETURN'ünde `poolId` + `mode:'lighthouse'`, ve koordinatör + diğer katılımcılar `verifyLineage` ile girdi 0'ı zaten doğrular. Kalıntı risk: sahte bir "havuz" teklifiyle insanın pledge'i harcanıp sahte kredi verilmesi → insan yalnızca `verifyOffer` + `verifyLineage`'den geçmiş havuzlara imza atar (participant-cli bunu imza öncesi zorunlu yapar). Threat model'e satır eklenir.

- **⚠ Tasarım düzeltmesi (30.10, uygulandı):** Yukarıdaki salt `SINGLE|ACP` lighthouse **güvensiz**: BSV-21 script'le zorlanmadığı için imzayı gören herkes insanın coin'ini, aynı index'e sahte bir "k kredi" çıktısı koyup gerisini kendine yazarak alabilir (overlay sahte krediyi kabul etmez ama para gitmiştir; "yalnızca doğrulanmış havuzlara imza" bunu önlemez, hırsızın havuza ihtiyacı yok). **Uygulanan:** coin `OP_IF <insan withdraw> CHECKSIG ELSE 2 <insan> <guard> 2 CHECKMULTISIG ENDIF` script'inde; insan bir kez `SINGLE|ACP` imzalar ve çevrimdışı olur, **insanın seçtiği guard** settlement'ta tüm planı + `verifyLineage`'i kontrol edip `ALL` ortak imzalar. Tek başına çekme dalı **ayrı anahtarla** (aynı anahtar olsaydı `SINGLE|ACP` ön imzası o dalı da açardı; testte yakalandı). Lighthouse katılımcıları etkileşimlilerden sonra gelir (para üstü yok), böylece etkileşimli para üstü `n+1+j`'de kalır. Kalan güven: guard + hırsız birlikte sahte plan geçirebilir → guard'ı insan seçer (vault guard'ıyla aynı model).

**Görevler**
- 5.1 `src/scripts/creditLock.ts` — `buildVaultCreditScript(json, vaultScript)`, `decodeBsv21Owned(script)`; birim test: P2PKH ekli ve vault ekli çıktılar round-trip; kit `decodeBsv21` P2PKH için birebir aynı sonucu verir (regresyon).
- 5.2 `src/kit/rules.ts` genişletmesi **kopya üzerinde, bayrakla**: `identifyAdmissible(tx, prev, { ownerKinds: ['p2pkh','vault'] })`. Varsayılan `['p2pkh']` = kit davranışı. Kit'in rules testleri değişmeden yeşil + yeni vakalar (vault ekli transfer, vault ekli girdiden P2PKH'ye çıkış, enflasyon reddi aynen).
- 5.3 `planSettlement(…, { creditLock: 'vault' })`: `signer:'vault'` olan katılımcının kredi çıktısı `buildVaultCreditScript(…, vaultScript)`; `PledgeRecord`'a opsiyonel `vaultScriptHash` (MASTER §3.3 değişikliği, önce MASTER güncellenir). `verifySettlementPlan` bunu bekler.
- 5.4 `src/vault/creditSpend.ts` — vault'taki krediyi harcama: `buildVaultCreditTransfer(…)` ajan+guard 2-of-2 (D'nin `VaultSigner`'ı), guard `context.kind:'redeem'|'list'`. Guard API'ye `kind` eklenmesi D'ye STATUS'ta istek olarak yazılır.
- 5.5 `src/pool/lighthouse.ts` — `buildLighthousePledge(wallet, terms, credits, tokenIndex)`: tam tutarlı coin (`[1,'agentcoop pledge']`), out1 kayıt bedeli, out2 `OP_RETURN pledge {…, mode:'lighthouse'}`; ardından `signLighthouseInput(wallet, outpoint, creditOutput)` → `SINGLE|ACP|FORKID` imzası, `LighthousePledge { outpoint, unlockingScriptHex, creditLockingScriptHex, satoshis }` (zincir dışı, B'ye `POST /pledges/lighthouse`). Önemli: SINGLE|ACP ön görüntüsü yalnızca kendi girdisini ve **aynı index'teki** çıktıyı içerir; bu yüzden insan imzası index'ten bağımsız değildir → koordinatör lighthouse pledge'leri **imzalandıkları index'e** yerleştirmelidir. Çözüm: imza index'e bağlı değil (BIP-143'te `inputIndex` ön görüntüye girmez, yalnızca eşli çıktı seçimi için kullanılır) — bunu SDK'nin `TransactionSignature.format` davranışıyla **testte kanıtla**; değilse lighthouse pledge'i sabit index'e (`1`) bağlanır ve havuz başına tek lighthouse girişi olur (düşük yol).
- 5.6 `planSettlement` lighthouse girdilerini karışık kabul eder: interaktif (ALL) + lighthouse (SINGLE|ACP) aynı tx'te; para üstü yalnızca interaktiflere. `verifySettlementPlan` interaktif katılımcı için lighthouse girdilerinin kendi kredilerini de saymaya devam eder (Σk = N).
- 5.7 Testler: `test/core.creditlock.test.ts`, `test/e2e.lighthouse.mockchain.test.ts` (1 interaktif ajan + 1 lighthouse insanı + 1 vault-kilitli ajan → tek settlement; lighthouse insanı çevrimdışı, yani testte imzası önceden alınmış ve cüzdanı kapatılmış), negatif: koordinatör lighthouse kredi çıktısını değiştirir → script doğrulaması düşer.
- 5.8 Mainnet: 1 karışık settlement (T5 varyantı, "T5-L") ≤ 1.000 sat pledge'lerle.

**Kabul:** vault'lu ajanın kredisi guard'sız harcanamıyor (mockchain testinde ajan tek başına `createAction` → script hatası); lighthouse insanı çevrimdışıyken settlement tamamlanıyor; mevcut Faz 0–3 testleri değişmeden yeşil; FINAL-IDEA §8 tablosundaki "Ajan krediyi piyasada satıp guard'ı atlatıyor" satırı **Kapalı** olarak güncellenmeye hazır (threat model notu D'ye).

**Çıktılar:** `src/scripts/creditLock.ts`, `src/pool/lighthouse.ts`, `src/vault/creditSpend.ts`, `src/kit/rules.ts` (bayraklı), testler; MASTER §3.3 (`PledgeRecord.mode`, `vaultScriptHash`, `LighthousePledge`), §3.5 (`POST /pledges/lighthouse`), §3.7 (`kind:'redeem'|'list'`).

### ✋ Checkpoint (Faz 5 sonu)
1. **Plan hâlâ iyi mi?** SINGLE|ACP imzasının index'ten bağımsızlığı testte doğrulanamadıysa lighthouse "havuz başına tek" yoluna düştüğünü track dosyasına ve STATUS'a yaz. 1Sat görünürlük takası kabul edilemez bulunduysa `creditLock:'vault'` varsayılan kapalı kalır.
2. **Bu faz bitti** → STATUS Track A (dosyalar, txid'ler).
3. **Diğer track'ler ne yaptı?** B topic manager'ına `ownerKinds` bağlandı mı? C participant-cli lighthouse'u kullanıyor mu? D guard `redeem`/`list` bağlamını ekledi mi?
4. **Sonraki faz:** Faz 6'nın OrdLock kısmı yalnızca P2PKH ekli kredilerle çalışır; vault kredileri listelenmeden önce P2PKH'ye çıkarılır (guard onayıyla).
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 6 — OrdLock listeleri (1Sat Market görünürlüğü) + covenant vault araştırması (zaman kutulu) → S3+

**Amaç:** (a) Krediler bizim market'imizin yanında **mevcut 1Sat Market**'te de listelenip alınabilsin: dış likidite ve görünürlük (benimsenme). (b) Guard'ı tamamen kaldırabilecek **covenant vault**'un Chronicle opcode'larıyla yapılabilirliğini **en fazla 3 saatte** araştır; sonuç ne olursa olsun yazılı rapor.

**Bağımlılık:** Faz 2 market builder'ları; Faz 5 (vault kredisinin P2PKH'ye çıkış yolu). Dış bağımlılık: 1Sat OrdLock script formatı (resmi kaynaktan doğrulanır, tahmin edilmez: `docs.1satordinals.com`, `js-1sat-ord` kaynak kodu). Doğrulanamazsa 6.1–6.3 durur, STATUS'a yazılır.

**Görevler**
- 6.1 **OrdLock formatını kaynaktan doğrula:** 1Sat'ın `OrdLock` kilit script'i (sahip pkh + "ödeme çıktısı" serileştirmesi, satıcı iptal dalı) için resmi spec/kaynak kodu oku; `docs/` altına alıntı ve kaynak linkiyle `plan/phases/A-P6-ordlock-notes.md`. Script sabitlerini kopyala, yeniden türetme.
- 6.2 `src/market/ordlock.ts` — `buildOrdLockListing(wallet, tokenOutpoint, askSats)`: kredi UTXO'sunu OrdLock script'ine taşı (BSV-21 transfer inscription'ı + OrdLock eki); `cancelOrdLockListing`; `buildOrdLockPurchase(wallet, listingOutpoint)` (alıcı tarafı; `verifyLineage` önce). Kendi `SINGLE|ACP` listelerimiz (Faz 2) **kalır**; OrdLock ikinci bir kanal.
- 6.3 Overlay: OrdLock ekli BSV-21 çıktısı `decodeBsv21Owned` → `owner.kind:'ordlock'` (Faz 5 genişletmesinin üçüncü türü). B'ye kural ve lookup `{ op:'listings', source:'ordlock' }` isteği STATUS'ta.
- 6.4 Testler: mockchain'de listele → al → alıcının overlay bakiyesi; satıcı iptali; sahte liste (sahte kredi) `verifyLineage`'de düşer.
- 6.5 Mainnet: 1 OrdLock listesi + alım (T8b); 1Sat Market / BananaBlocks'ta göründüğünün ekran görüntüsü ve linki STATUS'a.
- 6.6 **Covenant vault araştırması (zaman kutusu 3 saat):** Chronicle'ın geri getirdiği opcode'ları (`OP_CAT`, `OP_SUBSTR`, `OP_LEFT`/`OP_RIGHT`, `OP_SPLIT`, sayısal opcode'lar; liste **resmi Chronicle spec'inden** alınır) ve OP_PUSH_TX (sighash ön görüntüsünü script içinde doğrulama) tekniğiyle: "çıktı yalnızca allowlist'teki `payScript`'e ve ≤ X sat gidebilir, para üstü aynı script'e döner" kuralını guard'sız zorlayan bir script prototipi. Çıktı: `plan/phases/A-P6-covenant-report.md` (yapılabilir mi, script boyutu, ücret maliyeti, SDK `Spend` ile yerel doğrulama sonucu, öneri). Kod yalnızca `src/research/` altında, çekirdekten import edilmez. Mainnet'e çıkmaz.

**Kabul:** 1Sat formatına uyan bir OrdLock listesi mainnet'te alındı (txid STATUS'ta) **veya** format doğrulanamadığı STATUS'ta gerekçesiyle yazıldı; covenant raporu var; çekirdek testler değişmeden yeşil.

**Çıktılar:** `src/market/ordlock.ts`, testler, `plan/phases/A-P6-*.md`, `src/research/covenant/*`.

### ✋ Checkpoint (Faz 6 sonu)
1. **Plan hâlâ iyi mi?** Covenant uygulanabilir çıktıysa bunu FINAL-IDEA §13 "gelecek vizyonu"na öneri olarak STATUS'a yaz (çekirdeğe almak S4 sonrası karar). OrdLock başarısızsa README'de yalnızca kendi market'imiz anlatılır.
2. **Bu faz bitti** → STATUS Track A.
3. **Diğer track'ler ne yaptı?** B listings indeksine `source` eklendi mi; D README'ye 1Sat linkini aldı mı?
4. **Sonraki faz:** Faz 4 (kapanış).
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 4 — Kapanış → S4

**Görevler**
- 4.1 `packages/core/README.md`: mekanizma şeması (FINAL-IDEA §4.4), fonksiyon listesi, imza scope'ları, hata kodları, "neden ACP+ALL" notu (§4.6 kısaltılmış).
- 4.2 Test kapsamı: `npm test` tüm e2e'ler ≤ 5 dk; flaky test yok.
- 4.3 Kod temizliği: TODO'lar ya kapanır ya `FINAL-IDEA.md §13`'e taşınır.
- 4.4 D'ye teslim: README ana dosyası için "Protocol" bölümü ve T1–T8 txid listesi.

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği gerekiyor mu (ör. bir builder'ın kapsam dışı bırakılması)? STATUS'a yaz.
2. STATUS Track A: "Tamamlandı".
3. Diğer track'lerin açık blokajlarından sana düşen var mı? Varsa al.
4. S4 kontrol listesinde A maddeleri ✓.
