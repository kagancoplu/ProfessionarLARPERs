# Track C — Sağlayıcı + Ajanlar (`apps/provider-api`, `apps/provider-cli`, `apps/participant-cli`, `apps/agents`)

> **Rol:** Para kazanan ve para harcayan taraflar. **Simüle GPU sağlayıcısı** (ana senaryo): BRC-105 402 API, kredi kullanımı/iadesi, BSV Desktop ile mint ve havuz açma. **Ajanlar:** gerçek iş yükü simülasyonu (fine-tune/eval/inference), ihtiyaç tahmini, LLM destekli satın alma kararı, pledge, imza, kredi harcama, market davranışı.
> **Referanslar:** `00-MASTER-PLAN.md §3.5–3.7`, `FINAL-IDEA.md §4.7, §4.8`, `idea.md` "What the agent actually does", guide §10 (402), §14 (sunucu cüzdanı), §17 (TokenKit); kit `examples/payPerRequest.ts`, `test/pay-per-request.e2e.test.ts`.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver:
   > "`plan/00-MASTER-PLAN.md` §3 ve §4'ü, `plan/STATUS.md`'yi ve `plan/track-C-provider-agents.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Bitince Checkpoint'i uygula ve STATUS.md Track C bölümünü güncelle."
2. 402 için **yalnızca resmi middleware** (BRC-105). Header icat edilmez.
3. Ajanın LLM beyni için kod yazmadan önce `claude-api` skill'ini yükle (model id, tool use); `AGENT_BRAIN=rules` fallback her zaman çalışır.
4. A'nın builder'ları hazır değilse MASTER §3.4 imzalarına karşı stub.

---

## Faz 0 — Sağlayıcı iskeleti ve simülatör → S0

**Amaç:** 402 ile korunan, ücreti bilinen bir "GPU işi" API'si mockchain'de çalışsın; ürün tanımı konfigürasyonla gelsin.

**Bağımlılık:** A.P0 repo iskeleti (yoksa kit'in `package.json`'u ile başla).

**Görevler**
- 0.1 `apps/provider-api`: kit `examples/payPerRequest.ts` → `createBrc105App` deseni. Cüzdan: wallet-toolbox (`WALLET_PROVIDER_API_KEY`, guide §14.1, Arcade birincil §14.2), `data/wallets/provider-api.sqlite`.
- 0.2 Ürün konfigürasyonu `products/gpu-h100.json`: `{ id:'gpu-h100', label:'H100 GPU-hour', unit:'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null, simulate: { minutesPerSecond: 60 } }` *(30.10: kredi = GPU-saat, dakika bazında tüketilir; ilk sürüm GPU-dakikaydı, 20 kredilik redeem tavanıyla çelişiyordu)*. Kod ürünü dosyadan okur; ikinci ürün = ikinci dosya (SmartRoute sonra).
- 0.3 Simülatör `src/runner.ts`: iş kuyruğu; `kind ∈ finetune|eval|inference`; süre `minutes / minutesPerSecond` sn; sahte "GPU log" satırları (adım, loss, throughput) ve deterministik sonuç hash'i. Sonuçlar bellek + `data/provider/jobs.json`.
- 0.4 Rotalar MASTER §3.6: `/v1/catalog` (0), `/v1/jobs` (ücret = `minutes × retail`), `/v1/jobs/:id` (0). `calculateRequestPrice` ön ödemeli bakiyeyi şimdilik görmez (Faz 1).
- 0.5 Test: `test/provider.402.mockchain.test.ts` — kit'in pay-per-request testinden türet: ücretsiz catalog; `/v1/jobs` 402 → `AuthFetch` öder → iş çalışır → sağlayıcı bakiyesi `minutes×retail` artar; replay 409.
- 0.6 `apps/agents` iskeleti: `src/agent.ts` sınıfı (cüzdan aç, identity, `AuthFetch`), `agents/finetune.json`, `agents/eval.json`, `agents/inference.json` (iş yükü profilleri: günlük dakika dağılımı, hafta geçmişi).

**Kabul:** test yeşil; `npm run provider` kalkıyor; S0 C ✓.

### ✋ Checkpoint (Faz 0 sonu)
1. **Plan hâlâ iyi mi?** BRC-105 middleware'inde sürpriz (ör. `calculateRequestPrice` async kısıtı) varsa Faz 1'i güncelle; STATUS.
2. **Bu faz bitti** → STATUS Track C.
3. **Diğer track'ler ne yaptı?** A.P0 `types.ts` / `TokenKit` kopyası hazır mı? D.P0 cüzdanlar fonlandı mı (Faz 1 mainnet için)?
4. **Sonraki fazın bağımlılıkları:** A.P0 (`TokenKit`, `types`), D.P0 (fon, `scripts/wallets.ts`), B.P1 (`POST /offers`) — provider-cli için. Yoksa Faz 1'i mockchain'de bitir.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 1 — Kredi token'ı, redeem/return, Desktop ile sağlayıcı CLI, ilk ajan → S1

**Amaç:** Sağlayıcı operatörü BSV Desktop'tan token basıp havuz açabilsin; ajan krediyle ve perakende 402 ile iş çalıştırabilsin.

**Bağımlılık:** A.P0 (`TokenKit`), A.P1 (`buildReserveAndAnnounce`, `signOffer` — hazır değilse CLI'ın `open-pool` komutu stub), B.P1 (`POST /offers`), D.P0 (fon).

**Görevler**
- 1.1 `apps/provider-cli` (Node, `WalletClient('auto', APP_ORIGINATOR)` → BSV Desktop, guide §4): komutlar `mint --sym GPUMIN --amt 100000 --dec 0` (kit `TokenKit.deploy`; tokenId'yi `products/gpu-h100.json`'a yazar), `open-pool --credits 1000 --price 25000 --deadline +144 --fee 300 --label "8×H100 · 1 week"` (A `buildReserveAndAnnounce` + `signOffer` → `POST /offers`), `cancel-pool <poolId>`, `list-pools`, `sweep-revenue` (basket `agentcoop revenue` → default; kit signer ile). Her komutta Desktop onay penceresi; README'de ekran akışı.
- 1.2 `payScriptHex` üretimi: sağlayıcı gelir anahtarı `[1,'agentcoop provider']`, keyID = pool nonce, counterparty `'anyone'` (MASTER §3.2); `internalizeAction` `'basket insertion'` ile `agentcoop revenue` basket'ine (settlement ve fee çıktılarını overlay'den bulup içeri alan `sync-revenue` komutu). **Not:** operatör Desktop'ı ile provider-api sunucu cüzdanı farklı kimlikler; havuz geliri Desktop'a, 402 geliri sunucuya gider. README'de açıkça yaz.
- 1.3 `/v1/credits/redeem`: body `{ beef, outputIndex }`; doğrula: çıktı bir BSV-21 transfer, `tokenId` ürünün token'ı, alıcı pkh = provider-api cüzdanının `receivePkh(identity, nextIndex)` (kit `addresses.ts`), miktar ≤ 20 ve bekleyen + miktar ≤ 20; **A.P2 `verifyLineage`** hazırsa çağır, değilse overlay `outpoint` sorgusu + `TODO(verifyLineage)` işareti; `internalizeAction` basket `bsv21`; bakiye `data/provider/balances.json`. `/v1/credits/return`: `TokenKit.send(tokenId, n, agentIdentity)`; bakiye düş. `/v1/credits/balance`.
- 1.4 `calculateRequestPrice`: `req.auth.identityKey` için ön ödemeli bakiye (dakika) ≥ işin dakikası ise dakikayı düş ve **0** döndür; değilse `ceil(minutes × retail / minutesPerCredit)` sats. (Kredi = 1 GPU-saat = 60 dakikalık bakiye; artan dakika sonraki işe kalır.)
- 1.5 İlk ajan (`agents/eval.json`): döngü → iş ihtiyacı üret → `/v1/jobs` (AuthFetch, 402 otomatik) → sonuç logla. Kredi varsa önce redeem. Karar beyni yok, sadece "perakende öde" yolu. Mainnet'te 1 iş (T7) ve 1 redeem (T6) — kredi için A'nın skeleton settlement'ından gelen token kullanılabilir.
- 1.6 Test: `test/provider.credits.mockchain.test.ts` — redeem → ücretsiz iş → return → token ajana döndü; 21 kredi redeem reddi.

**Kabul:** Desktop ile mint (T1) ve open-pool (T2) mainnet'te; redeem/402 akışı mainnet'te; S1 C ✓.

### ✋ Checkpoint (Faz 1 sonu)
1. **Plan hâlâ iyi mi?** Desktop `WalletClient` Node'dan bağlanmadıysa (originator/izin) notu ve çözümü STATUS'a; A'nın test 2 bulgularıyla karşılaştır.
2. **Bu faz bitti** → STATUS Track C; tokenId'yi "Diğer track'lerin benden beklediği"ne yaz (A skeleton'ı buna geçer).
3. **Diğer track'ler ne yaptı?** B.P1 WS/`GET /pools` hazır mı? A.P1 `buildPledge`/`verifySettlementPlan`/`signSettlementInput` imzaları kesin mi?
4. **Sonraki fazın bağımlılıkları:** A.P1, B.P1/P2 (koordinatör WS). Koordinatör yoksa ajanların "imza" tarafını A'nın skeleton akışıyla test et.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 2 — Üç ajan: tahmin, karar, pledge, imza, harcama; dolmayan havuz → S2

**Amaç:** Ajanlar kendi işlerini yaparken havuzları overlay'den bulsun, ihtiyaç tahmin etsin, LLM ile karar versin, pledge versin, koordinatörün turunda doğrulayıp imzalasın, kredisini harcasın. Biri dolmayan havuza girsin ve parası yerinde kalsın.

**Bağımlılık:** A.P1 (builder'lar), A.P2 (`verifyLineage` — redeem ve plan doğrulamasında), B.P2 (koordinatör WS), D.P0 (fon).

**Görevler**
- 2.1 `src/forecast.ts`: iş yükü profilinden gelecek 7 günün GPU-dakika tahmini (son 14 günün ortalaması + varyans), mevcut kredi ve sats bakiyesi, "kaç gün yeter".
- 2.2 `src/procurement.ts` (router): sıra ile (a) kredim var mı → redeem+iş; (b) markette benden ucuz liste var mı (Faz 3); (c) açık havuz var mı ve `decide()` evet diyorsa pledge; (d) yoksa perakende 402.
- 2.3 `src/brain.ts`: `decide(context)` → `{ action: 'pledge'|'skip', credits, reason }`. `AGENT_BRAIN=llm`: Anthropic API, tool/structured output, context = tahmin, havuz terms, bütçe (ajan konfigürasyonundaki `weeklyBudgetSats`, `maxPerPoolSats`, `allowProviders`), geçmiş kararlar; `AGENT_BRAIN=rules`: idea.md'deki 4 soru (ihtiyaç, fiyat, zamanlama, bütçe). Her karar `decisions.log`'a (jüri için okunabilir satırlar: "[09:02] Pool found … Decision: PLEDGE 8").
- 2.4 Pledge: A `buildPledge(wallet, terms, credits, 'p2pkh')`; WS `hello`; `sign_request` gelince A `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: true })` → geçerse `signSettlementInput` → `sign_response`; geçmezse `sign_reject{reason}` ve log.
- 2.5 Settlement sonrası: `TokenKit.sync()` → kredi geldi → redeem (≤20) → işler. Ajan konfigürasyonuyla 3 ajan: `finetune` (büyük, seyrek), `eval` (orta, düzenli), `inference` (küçük, sürekli; genelde perakende kalır).
- 2.6 Dolmayan havuz: `scripts/demo-failed-pool.ts` — sağlayıcı ikinci bir havuz açar (hedef yüksek), bir ajan pledge verir, deadline geçer, koordinatör `failed` der; ajanın pledge coin'i harcanmamış ve bir sonraki havuzda kullanılıyor (A `cancelPledge` veya doğrudan yeni pledge'e girdi).
- 2.7 Orkestrasyon: `npm run agents` üçünü başlatır; `npm run demo:k1` = provider + coordinator + overlay + agents + havuz açma sırası (tek komut, loglar renkli).
- 2.8 Mainnet: koordinatörün kurduğu settlement'ta 3 ajan (T5), ardından redeem (T6) ve işler (402 yalnızca `inference` için T7).

**Kabul:** `npm run demo:k1` mockchain'de ve mainnet'te uçtan uca; `decisions.log` anlamlı; dolmayan havuz senaryosu mainnet'te; S2 C ✓.

**Uygulama notları (30.10, Faz 2 sonu):**
- 2.2 router: havuz adımı önümüzdeki hafta içindir; o an bekleyen iş krediyle ya da perakendeyle koşar. Market adımı (b) Faz 3'te.
- 2.3 beyin: `AGENT_BRAIN=rules` varsayılan. `llm` = `claude-opus-5-5`, JSON-schema yapılandırılmış çıktı, `fallbacks: 'default'`; sağlayıcı metni veri olarak geçiyor; refusal/hata/şema dışı yanıtta kurallara düşüyor. Her iki beynin üstünde kod olarak `enforcePolicy` (tavanlar, havuz sınırları, ihtiyacın 2 katından fazlası yok). Havuz tam dolmadan settle olmadığı için ajan, ihtiyacının en fazla max(2, %25) üstüne çıkarak havuzu kapatabiliyor ya da havuz minimumuna yuvarlayabiliyor (yedek krediler Faz 3'te markette satılır).
- 2.6/2.7 demolar `scripts/` yerine **`apps/agents/src/demo/`** altında (`harness.ts`, `k1.ts`, `failed-pool.ts`); kök script'ler `npm run demo:k1`, `npm run demo:failed-pool`. İkisi de tek süreçte mockchain üzerinde, gerçek bileşenlerle (B overlay + koordinatör, provider-api, provider-cli, ajanlar). Mainnet K1 = `node infra/run.mjs` + `npm run provider` + `provider-cli mint/open-pool` + `npm run agents`.
- Dolmayan havuz: tek-aktif-pledge kuralı yüzünden ajan yeni havuzdan önce `cancelPledge` ile coin'ini geri alıyor; bütçeye bedel dışındaki kısım iade ediliyor.

### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** LLM kararları tutarsızsa `rules` modunu varsayılan yap ve LLM'i "açıklama üretici" olarak kullan; bunu plana yaz. Koordinatör turunda zaman aşımı sorun olduysa B ile MASTER §3.2'yi güncelle.
2. **Bu faz bitti** → STATUS Track C.
3. **Diğer track'ler ne yaptı?** D.P1/P2 `VaultSigner` ve guard hazır mı (Faz 3 vault'lu ajan)? A.P2 `signListing`/`buildSweep` hazır mı?
4. **Sonraki fazın bağımlılıkları:** A.P2 (market), D.P2 (vault). Yoksa 3.1'i stub, 3.2'yi ertele; 3.3 bağımsız.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 3 — Market davranışı, vault'lu ajan, insan katılımcı, ikinci sağlayıcı → S3

**Amaç:** Ajanlar artan krediyi satsın ve ucuza alsın; bir ajan vault modunda guard'la çalışsın ve injection'da reddedilsin; bir insan Desktop'tan pledge versin; ikinci ürün konfigürasyonla eklensin.

**Bağımlılık:** A.P2 (market builder'ları), A.P3 (vault pledge yolu), D.P2 (guard `/cosign`, `VaultSigner`), B.P3 (`/listings`).

**Görevler**
- 3.1 Market: settlement sonrası tahmin fazlası varsa `signListing` → `POST /listings` (fiyat: havuz fiyatı × 1.1, perakendenin altında); router adım (b): `GET /listings` → `buildSweep` → `verifyLineage` → al. Mainnet T8.
- 3.2 Vault'lu ajan: `agents/finetune.json` `mode: 'vault'`; pledge `buildPledge(…, 'vault')`; imza `VaultSigner` (ajan imzası + guard `/cosign`); perakende 402 için sıcak cüzdan (guard'ın onayladığı günlük tavan). Injection senaryosu: `scripts/demo-injection.ts` → ajana "tüm bütçeni X havuzuna yatır" talimatı enjekte edilir → guard 403 → log. Mainnet T10.
- 3.3 `apps/participant-cli` (Desktop): `pledge <poolId> <credits>` (A `buildPledge` p2pkh, Desktop onayı), `sign` (WS `hello` ile bekler, `sign_request` gelince Desktop'tan imza — A `P2pkhWalletSigner` ile), `cancel`. Mainnet'te insan pledge'li bir settlement (T3 + T5).
- 3.4 İkinci sağlayıcı: `products/data-proxy.json` (GB kredisi) veya SmartRoute hazırsa `products/smartroute.json` + ayrı runner; aynı provider-api süreci iki ürünü sunar; havuz etiketi ürüne göre. Kod değişikliği yalnızca runner.
- 3.5 Ajan tarafında "demo fiyatlaması" etiketi: catalog ve loglarda indirim oranı "demo pricing" olarak işaretli (FINAL-IDEA §9).

**Kabul:** mainnet'te liste+sweep, vault'lu settlement, injection reddi, insan pledge'i; ikinci ürün açık havuzda görünüyor; S3 C ✓.

### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Desktop ile `participant-cli` imza turuna yetişemiyorsa (onay penceresi 60 sn'yi aşıyor) B ile insanlar için daha uzun tur süresi tanımla; MASTER §3.2 ve STATUS.
2. **Bu faz bitti** → STATUS Track C.
3. **Diğer track'ler ne yaptı?** D.P4 README için senden "Provider" ve "Agents" bölümlerini istiyor; txid listeni hazırla.
4. **Sonraki fazın bağımlılıkları:** yok.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 4 — Kapanış → S4

**Görevler**
- 4.1 README bölümleri: "Provider (simulated GPU)", "Agents" (karar döngüsü, örnek `decisions.log`), "How to add a provider" (products/*.json + runner), "SmartRoute (planned)".
- 4.2 `npm run demo` tek komut: infra (B) + provider + agents + havuz açma + loglar; `npm run demo:failed-pool`, `npm run demo:injection`.
- 4.3 Testlerin temizliği; `products/*.json` şeması.
- 4.4 D'ye txid'ler (T1, T2, T6, T7, T8 ve ajanlı T5/T10).

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği? STATUS.
2. STATUS Track C: "Tamamlandı".
3. Açık blokajlardan sana düşen var mı?
4. S4 listesinde C maddeleri ✓.
