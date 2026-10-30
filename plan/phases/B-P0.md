# B-P0 — Overlay'i kit'ten kaldır, doğrulama testleri 1 ve 8 (→ S0)

> Track B, Faz 0. Kaynak: `plan/track-B-overlay-coordinator.md` Faz 0, `00-MASTER-PLAN.md` §3.2/§3.8, `FINAL-IDEA.md` §4.4, §12.1.
> Yazıldı: 30.10, ~16:00. Branch: `trackB`. Node 22 (`nvm use 22`; sistem varsayılanı 20, kit ≥ 22 istiyor).

## 1. Amaç

1. `tm_agentcoop` / `ls_agentcoop` adlarıyla çalışan, kit'ten **kopyalanmış** bir overlay: `npm run overlay` → `http://localhost:8080`.
2. **Doğrulama testi 1:** overlay, girdileri karışık (1 sağlayıcı kredi girdisi `SINGLE|ACP|FORKID` + düz sats pledge girdileri `ALL|FORKID`) ve çıktıları karışık (sağlayıcı ödemesi + 3 kredi çıktısı + para üstleri + OP_RETURN) bir settlement'ı kabul ediyor mu? Sonuç **en kısa sürede** STATUS'a (A'nın Faz 1 kararları buna bağlı).
3. **Doğrulama testi 8:** Arcade policy'si ve 20 / 50 / 100 katılımcılı settlement boyutu ve ücret tahmini.

## 2. Bağımlılıkların durumu (16:00)

| Bağımlılık | Durum | Ne yapıyorum |
|---|---|---|
| A.P0 kök iskelet (workspaces, kök `vitest.config.ts`, `.gitignore`) | Yok (A kendi branch'inde) | `packages/overlay` **bağımsız paket** olarak kurulur: kendi `package.json` (adı `@agentcoop/overlay`, workspace'e hazır), kendi `vitest.config.ts`, kendi `.gitignore`. **Kök dosyalara dokunulmaz** (merge çakışması olmasın). A'nın kökü gelince: `package-lock.json` silinir, `node_modules` köke taşınır, testler kök config'e geçer |
| A.P0 `packages/core` (`kit/inscription.ts`, `kit/rules.ts`, `kit/addresses.ts`, `types.ts`, `opreturn.ts`) | Yok | Kit'in `core/{inscription,rules,addresses}.ts` dosyaları `packages/overlay/src/kit/` altına **geçici kopya** (başlıkta "GEÇİCİ: @agentcoop/core hazır olunca import değişecek"). Değişiklik yapılmaz, birebir kopya. `opreturn` için testte küçük yerel yardımcı (MASTER §3.2 zarfı) |
| `test/helpers/mockchain.ts` (A kopyalayacak) | Yok | `packages/overlay/test/helpers/mockchain.ts` geçici kopya |
| Sats (D.P0) | Gerekmiyor | Faz 0 tamamen mockchain + Arcade `/health` (okuma) |

## 3. Dosyalar

```
packages/overlay/
├─ package.json            kit'ten türetildi; sürümler docs/AGENTS.md ile birebir (sabit, ^ yok);
│                          wallet-toolbox yalnızca devDependency (mockchain testleri), 402/auth paketleri yok
├─ package-lock.json       kit'in lock'undan türetildi (A'nın kökü gelince silinecek)
├─ .gitignore              node_modules/, data/, .env, *.sqlite
├─ tsconfig.json           kit'inki; include src, scripts, test
├─ vitest.config.ts        kit'in @bsv/sdk → CJS alias'ı (createRequire ile çözülür: hem bu paketin
│                          node_modules'ünde hem hoist edilmiş kökte çalışır)
├─ README.md               nasıl kalkar, env, topic/service, sorgular, test 1/8 sonuçları
├─ src/
│  ├─ kit/inscription.ts   GEÇİCİ kopya (kit core/inscription.ts)
│  ├─ kit/rules.ts         GEÇİCİ kopya (kit core/rules.ts)
│  ├─ kit/addresses.ts     GEÇİCİ kopya (kit core/addresses.ts)
│  ├─ AgentCoopTopicManager.ts   kit Bsv21KitTopicManager; TOPIC='tm_agentcoop'. Faz 0'da kurallar = kit kuralları
│  ├─ AgentCoopLookupService.ts  kit Bsv21KitLookupService; SERVICE='ls_agentcoop'; tablolar yeniden adlandırıldı
│  ├─ chainTracker.ts      kit (ResilientChainTracker, testnet/WoC yolu)
│  ├─ noopAdvertiser.ts    kit
│  └─ server.ts            kit startOverlay; isim 'agentcoop'; env okuma
├─ scripts/
│  └─ arcadePolicy.ts      doğrulama testi 8: GET /health → policy özeti + boyut/ücret modeli
└─ test/
   ├─ helpers/mockchain.ts GEÇİCİ kopya (kit)
   ├─ helpers/settlement.ts  YALNIZCA TEST: karışık settlement kurucu (A'nın builder'ı DEĞİL; A.P1 gelince
   │                         testler A'nın planSettlement/assembleSettlement'ına geçebilir)
   └─ validation1.mixed-settlement.test.ts  (boyut modelinin gerçek tx'le tutarlılığı da burada; ayrı dosya gerekmedi)
```

## 3a. Sonuç (16:15)

Faz 0 bitti. Test 1 ✅ (8/8 yeşil), test 8 ✅; ikisi de STATUS'ta. Planlanandan farklar: boyut testi ayrı dosya değil; `tsconfig` kit gibi `test/`'i typecheck dışında tutuyor (kopya `mockchain.ts` çift SDK tipi hatası veriyor, runtime'da alias çözüyor). Faz 1'e taşınan bulgu: §8.

### 3.1 Yeniden adlandırmalar (kit → AgentCoop)

| Kit | AgentCoop | Neden |
|---|---|---|
| `tm_tokenkit` | `tm_agentcoop` | MASTER §3.2; BRC-87 `^tm_[a-z]+(_[a-z]+)*$` (rakam yok) |
| `ls_tokenkit` | `ls_agentcoop` | aynı |
| `bsv21kit_outputs` / `bsv21kit_tokens` tabloları | `agentcoop_token_outputs` / `agentcoop_tokens` | Faz 1'de `agentcoop_pools`, `agentcoop_pledges`… eklenecek; ön ek tutarlı olsun |
| migration `2026-10-17-001-bsv21kit` | `2026-10-30-001-agentcoop-tokens` | Faz 1 migration'ı `…-002-agentcoop-records` olacak |
| `OverlayExpress('bsv21kit', …)` | `OverlayExpress('agentcoop', …)` | — |

Kurallar (`rules.ts`) ve sorgu davranışı **değişmiyor**. Lookup'taki `identity` taraması (GAP_LIMIT 20) ve diğer kit sorguları (`token`, `tokens`, `utxos`, `outpoint`, `history`) MASTER §3.8 gereği aynen kalıyor.

### 3.2 Ortam değişkenleri (server.ts)

| Değişken | Varsayılan | Not |
|---|---|---|
| `PORT` | `8080` | MASTER §3.9 `OVERLAY_URL` |
| `OVERLAY_DB` | `./data/overlay.db` | gitignore |
| `NETWORK` | `main` | `main` / `test` |
| `CHAINTRACKS_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | MASTER §3.2 `ARCADE_URL` ile aynı; `ARCADE_URL` verilmişse o kullanılır |
| `CHAIN_TRACKER=woc` | — | yedek |
| `OVERLAY_PRIVATE_KEY` | `./data/overlay.key`'e üretilir | asla commit edilmez |
| `TOKEN_WHITELIST` | boş | Faz 1'de C'nin kredi token id'si ile doldurulabilir |

## 4. Doğrulama testi 1 — senaryo (mockchain, overlay HTTP üzerinden, SPV açık)

Kit'in `e2e.mockchain.test.ts` deseni: `createMockChain()`, gerçek wallet-toolbox cüzdanları, overlay `startOverlay({ chainTracker: chain.chainTracker })` ile ayağa kalkar.

**Aktörler:** `provider`, `agent1`, `agent2`, `agent3` (hepsi wallet-toolbox; fonlanmış).

**Adımlar**
1. **T1 deploy:** provider `createAction` ile `deploy+mint amt=1000 dec=0` çıktısını `receivePkh(provider, 0)`'a kilitler (randomizeOutputs:false, basket `bsv21`). AtomicBEEF → `POST /submit` (`X-Topics: ["tm_agentcoop"]`). Beklenen: `outputsToAdmit=[0]`.
2. **T3 pledge coin'leri:** her ajan `createAction` ile bir P2PKH çıktısı oluşturur: anahtar `[1,'agentcoop pledge']`, keyID rastgele, counterparty `'anyone'` (MASTER §3.2), basket `agentcoop`. Tutarlar 3.000 / 2.000 / 1.000 sat. (Faz 0'da OP_RETURN pledge kaydı ve kayıt bedeli yok; onlar Faz 1 indeksleme konusu.)
3. **T5 settlement şablonu** (`test/helpers/settlement.ts`, FINAL-IDEA §4.4 düzeni):
   - `in0` = deploy çıktısı (1 sat, N=1000), `in1..3` = pledge coin'leri.
   - `out0` = P=4.500 sat → sağlayıcı gelir script'i (P2PKH, `[1,'agentcoop provider']`, keyID poolNonce, `'anyone'`).
   - `out1..3` = BSV-21 `transfer` 600 / 300 / 100 → `receivePkh(agentN, 0)`, 1 sat.
   - `out4..6` = para üstleri (her ajanın pledge coin script'ine; MASTER §3.3 para üstü kuralı), ücret eşit düşülür.
   - `out7` = `OP_FALSE OP_RETURN "agentcoop" "settle" {"v":"1","poolId":…,"pledgeListHash":…}`.
4. **İmzalar:** provider `in0`'ı `SIGHASH_SINGLE|ANYONECANPAY|FORKID` (0xC3) ile, ajanlar kendi girdilerini `SIGHASH_ALL|FORKID` (0x41) ile imzalar. İmzalama: kit `signWalletP2pkhInput`'ın scope parametreli kopyası (`createSignature({ hashToDirectlySign })`, counterparty `'anyone'`). A'nın `P2pkhWalletSigner`'ı gelince ona geçilir.
5. **Yayın:** mock chain `postBeef` (Arcade'in mockchain karşılığı; script'leri doğrular). Sonra `POST /submit` (plain BEEF).

**Beklenen (geçme kriteri)**
- STEAK `tm_agentcoop.outputsToAdmit` = `[1,2,3]` (yalnızca kredi çıktıları; ödeme, para üstü ve OP_RETURN BSV-21 değil).
- `coinsToRetain` = `[0]` (sağlayıcının kredi girdisi harcandı olarak işaretlendi, geçmişte tutuluyor).
- `ls_agentcoop` `identity` sorgusu: agent1 600, agent2 300, agent3 100; `outpoint` sorgusu deploy için `spent:true, spendingTxid = settlement txid`.
- Kredi toplamı korunuyor (600+300+100 = 1000).

**Ek kontroller (aynı test dosyası; koordinatör tasarımı için gerekli)**
- **1b — Teklif yeniden kullanılabilir:** sağlayıcı imzası (SINGLE|ACP) **bir kez** atılır; iki farklı plan (tur 1: agent1+agent2+agent3; tur 2: farklı paylar/para üstleri ve farklı katılımcı sırası) kurulur ve `in0`'ın aynı unlocking script ile **her iki planda da geçerli** olduğu SDK `Spend.validate()` ile gösterilir. Bu, Faz 2'deki 3 turluk yeniden planlamanın sağlayıcının yeniden imzasını gerektirmediğinin kanıtı.
- **1c — Koordinatör sağlayıcı ödemesini değiştiremez:** `out0` 1 sat azaltılınca `in0` doğrulaması düşer.
- **1d — Enflasyon reddi karışık tx'te de çalışıyor:** kredi çıktıları 1.000'i aşınca (601/300/100) overlay kredi çıktılarını admit etmez (girdi yine harcanır, kit kuralı).
- **1e — Overlay'in hiç admit etmediği kredi girdisi:** deploy overlay'e submit edilmeden yapılan bir settlement tamamen reddedilir (`UnknownTokenInputError` → STEAK'te kabul yok).

Başarısızlık olursa: hangi `rules.ts` satırının reddettiği (pass 1/pass 2/per-token karar) teşhis edilip STATUS'a yazılır ve FINAL-IDEA §12.2 B planı (kendi topic manager'ımızda kuralı genişletmek) Faz 1'e görev olarak eklenir. **Beklenti, kodu okuyarak:** geçer. Pass 2 düz girdileri `decodeBsv21 === null` ile atlıyor; token girdisi `previousCoins`'te (deploy admit edildiği için) olduğundan `tokensIn = 1000 ≥ out = 1000`.

## 5. Doğrulama testi 8 — Arcade policy ve boyut modeli

- `scripts/arcadePolicy.ts`: `GET {ARCADE_URL}/health` → her datahub'ın `miningFee`, `maxtxsizepolicy`, `maxscriptsizepolicy` değerleri; en kötü durum (en yüksek ücret, en düşük sınırlar) özetlenir.
- Boyut modeli (gerçek script'lerle, sahte ama maksimum uzunlukta imzalarla tx kurulup `toBinary().length` ölçülür, varsayım yok):
  - sabit kısım: version/locktime/sayaçlar + sağlayıcı girdisi + `out0` + OP_RETURN settle
  - katılımcı başına: pledge girdisi (p2pkh, 108 baytlık unlock) + kredi çıktısı (inscription) + para üstü
  - vault'lu katılımcı girdisi için D'nin 2-of-2 unlock'u (≈ OP_0 + 2×73 + OP_FALSE) tahmini ayrı satır.
- Çıktı: n = 2, 3, 20, 50, 100 için bayt ve ücret (100 sat/kB ile, ve en düşük 1 sat/kB ile).
- `settlementSize.test.ts`: test 1'deki gerçek settlement'ın boyutu model tahminiyle ±%2 içinde.

**İlk ölçüm (16:00, `curl /health`):** Arcade v0.16.0, yükseklik 973321; datahub'ların çoğu `miningFee 100 sat / 1000 B`, biri 1 sat/kB; `maxtxsizepolicy 100 MB`; en sıkı `maxscriptsizepolicy` 500 kB; sigops sınırı pratikte yok. Yani settlement boyutu için politika sınırı yok; ücret ~0,1 sat/bayt.

## 6. Hata durumları

| Durum | Davranış |
|---|---|
| Arcade `/health` erişilemiyor | `arcadePolicy.ts` hata kodu ile çıkar; STATUS'a "erişilemedi + zaman" yazılır, test 8 tekrar edilir |
| Overlay chain tracker (Arcade) geçici hata | kit davranışı: engine 4xx/5xx döner; istemci (A'nın `OverlayClient` outbox'ı) tekrar dener |
| Mock chain `postBeef` reddi | test o adımda hata mesajıyla düşer (script hatası = imza/sighash sorunu; ilk şüpheli scope baytı) |
| Overlay STEAK boş | test, nedenini ayırmak için `outpoint` lookup + overlay log'unu basar |

## 7. Kabul ve kanıtı

| Kabul | Kanıt |
|---|---|
| Overlay kalkıyor | `npm run overlay` → `GET /listTopicManagers` içinde `tm_agentcoop`, `GET /listLookupServiceProviders` içinde `ls_agentcoop` (log STATUS'a) |
| Test 1 sonucu STATUS'ta | `npx vitest run test/validation1.mixed-settlement.test.ts` yeşil; STEAK ve lookup sonuçları STATUS "Doğrulama testleri" #1 |
| Test 8 sonucu STATUS'ta | `npm run arcade-policy` çıktısı STATUS #8 + boyut tablosu |
| S0 B maddeleri | STATUS Track B: Faz 0 tamam, dosya yolları, A'ya not (test 1 sonucu, SINGLE\|ACP teklif yeniden kullanımı) |

## 8. Faz 1'e taşınan notlar

- Engine, topic'te admit edilmiş **her** çıktıyı harcayan girdiyi `previousCoins`'e koyuyor ve harcanmış olarak işaretliyor. Faz 1'de pledge coin'leri admit edildiğinde, settlement ve iptal (T4) pledge'leri otomatik olarak `outputSpent`'e düşecek; kit kuralı pass 2 token olmayan girdileri atladığı için kurallar çakışmıyor. Ama `coinsToRetain` yalnızca token girdilerini içeriyor; pledge coin'leri tutulmazsa engine onları siliyor olabilir. Faz 1'de pledge'ler de `coinsToRetain`'e eklenmeli (geçmiş ve denetim için, Faz 6.3).
- `previousCoins`'in pledge'leri de içermesi, 1e'deki gibi "bilinmeyen token girdisi" kontrolünü etkilemez.
