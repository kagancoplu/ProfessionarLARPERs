# Track B — Overlay + Koordinatör (`packages/overlay`, `apps/coordinator`)

> **Rol:** Zincirin doğrulanmış görünümü (overlay) ve havuzları dolduran/kapatan süreç (koordinatör). Overlay = keşif ve ilerleme kaynağı; koordinatör = deterministik lock-in, imza turu, yayın. **Koordinatör para tutmaz.**
> **Referanslar:** `00-MASTER-PLAN.md §3.2, §3.5, §3.8`, `FINAL-IDEA.md §4.3–4.5`, guide §16, §20; kit `overlay/*`, `client/overlayApi.ts`, `test/e2e.mockchain.test.ts`.

## Bu dosyayı AI ile nasıl kullanırsın

1. AI'a **yalnızca bir faz** ver:
   > "`plan/00-MASTER-PLAN.md` §3 ve §4'ü, `plan/STATUS.md`'yi ve `plan/track-B-overlay-coordinator.md` **Faz N**'i oku. Yalnızca Faz N'i uygula. Bitince Checkpoint'i uygula ve STATUS.md Track B bölümünü güncelle."
2. Overlay kit'ten kopyalanır (`overlay/server.ts`, `Bsv21KitTopicManager.ts`, `Bsv21KitLookupService.ts`, `chainTracker.ts`, `noopAdvertiser.ts`), yeniden yazılmaz.
3. A'nın `types.ts` ve `planSettlement`'ı hazır değilse MASTER §3.3'teki tiplere karşı stub ile ilerle.

---

## Faz 0 — Overlay'i kit'ten kaldır, doğrulama testleri 1 ve 8 → S0

**Amaç:** `tm_agentcoop` adıyla çalışan bir overlay; karışık girdili settlement'ın kabul edildiğinin kanıtı.

**Bağımlılık:** A.P0 repo iskeleti (yoksa `packages/overlay`'i kit'in kendi `package.json`'u ile ayağa kaldır, sonra workspace'e taşı).

**Görevler**
- 0.1 `packages/overlay`: kit `overlay/` → kopyala; topic `tm_agentcoop`, service `ls_agentcoop` (BRC-87, rakam yok); env `PORT=8080`, `OVERLAY_DB=./data/overlay.db`, `CHAINTRACKS_URL` Arcade. `npm run overlay` kalkıyor.
- 0.2 **Doğrulama testi 1:** kit'in `test/e2e.mockchain.test.ts`'inden türet: 1 token girdisi (N=1000) + 2 düz sats girdisi, 3 kredi çıktısı (600/300/100) + 1 düz çıktı + OP_RETURN. Overlay `/submit` → `outputsToAdmit` 3 kredi çıktısını içermeli. Sonuç STATUS "Doğrulama testleri" tablosuna. Reddederse nedenini (`rules.ts` hangi satır) yaz; A ile birlikte topic manager genişletilir.
- 0.3 **Doğrulama testi 8:** Arcade `GET /health` → policy (sat/kB, maks tx boyutu, maks girdi?) STATUS'a. 20 ve 100 katılımcılı settlement boyutu tahminini yaz.
- 0.4 `packages/overlay/README.md`: nasıl kalkar, env, sorgular.

**Kabul:** overlay kalkıyor; test 1 ve 8 sonucu STATUS'ta; S0 B maddeleri ✓.

### ✋ Checkpoint (Faz 0 sonu)
1. **Plan hâlâ iyi mi?** Test 1 başarısızsa Faz 1'e "kuralları genişlet" görevi ekle ve A'ya haber ver (STATUS Blokajlar değil, "Arayüz/Plan değişiklikleri"). Arcade policy settlement boyutunu kısıtlıyorsa MASTER §3.2 %120 / katılımcı sayısı sınırını güncelle.
2. **Bu faz bitti** → STATUS Track B.
3. **Diğer track'ler ne yaptı?** A.P0 `types.ts` hazır mı? C.P0 ürün tanımı var mı (indekslenecek `label` alanları)?
4. **Sonraki fazın bağımlılıkları:** A.P0 `types.ts`, `opreturn.ts`. Yoksa MASTER §3.3'ten kendi geçici kopyanla başla, A hazır olunca import'u değiştir.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 1 — `tm_agentcoop` indeksleme + yan API (offers) → S1

**Amaç:** Havuz ilanı, pledge, settlement ve teklif kayıtları zincirden sayılsın; A'nın skeleton'ı `POST /offers` ve `GET /pools/:id` ile çalışabilsin.

**Bağımlılık:** A.P0 (`types.ts`, `parseOpReturn`). A.P1 builder'ları paralel geliştiriliyor; test verisi için kendi sahte tx'lerini kur.

**Görevler**
- 1.1 `AgentCoopTopicManager`: kit'in token kurallarını **aynen** çalıştırır (kredi çıktıları için) **ve** OP_RETURN `agentcoop` zarfı taşıyan tx'leri tanır: `pool` → out0 kredi UTXO'su + terms; `pledge` → out0 pledge coin, out1 fee, out2 kayıt; `settle` → settlement; `list` → liste; `vault` → vault çıktısı (D'nin formatı, şimdilik ham kaydet). Admit edilen çıktılar: kredi çıktıları (kit kuralı), pledge coin'ler, vault çıktıları. OP_RETURN çıktıları admit edilmez ama parse edilip lookup'a yazılır. **`coinsToRetain`'e kit kuralının token girdilerine ek olarak pledge coin ve vault çıktısı harcayan girdiler de konur** (B.P0 bulgusu: engine `coinsToRetain`'de olmayan önceki topic çıktılarını siliyor; tutulmazsa settlement/iptal geçmişi ve Faz 6.3 denetimi kaybolur).
- 1.2 `AgentCoopLookupService` (knex/SQLite): tablolar `pools(poolId, terms json, status, createdHeight)`, `pledges(outpoint, poolId, participant, credits, signer, height, spent, spendingTxid)`, `settlements(poolId, txid, pledgeListHash)`, `listings(outpoint, …, spent)`, `vaults(outpoint, owner, agent, guard, spent)`. **(B.P1 değişikliği:** teklifler zincirde olmadığı için overlay'de değil, koordinatörün kendi SQLite'ında; Faz 6.1 kabul edilirse overlay'e taşınır. Listings/vaults Faz 1'de ham `agentcoop_records` tablosunda.) Spent işaretleme: engine'in `outputSpent` çağrısı (kit lookup'ındaki desen).
- 1.3 Lookup sorguları MASTER §3.8. `pool` sorgusu ilerlemeyi hesaplar: `pledgedCredits = Σ harcanmamış pledge.credits`, `status`.
- 1.4 **Yan API** `apps/coordinator` içinde Express (port 8090): `POST/GET /offers`, `GET /pools`, `/pools/:id`, `/pools/:id/pledges` (overlay lookup'ı sarar + `Offer`'ı doğrular: A'nın `verifyOffer`; hazır değilse yalnızca imza formatı). Aynı süreçte `WS /ws` iskeleti: `hello`, `pool_update` yayını (overlay'e her yeni admit'te — basit yol: 5 sn'de bir lookup poll).
- 1.5 Test: `test/overlay.agentcoop.test.ts` — sahte pool/pledge/settle tx'leri (A'nın builder'ları varsa onlarla) → lookup sonuçları doğru; pledge harcanınca ilerleme düşüyor.
- 1.6 Skeleton entegrasyonu: A'nın `scripts/skeleton.ts`'i offer'ı `POST /offers`'a yazsın, settlement'ı `tm_agentcoop`'a submit etsin; `GET /pools/:id` `settled` göstersin.

**Kabul:** mainnet skeleton settlement'ı overlay'de `settled`; S1 B maddeleri ✓.

### ✋ Checkpoint (Faz 1 sonu)
1. **Plan hâlâ iyi mi?** OP_RETURN parse veya spent-tracking'te engine davranışı beklediğinden farklıysa Faz 2'yi güncelle; STATUS'a yaz.
2. **Bu faz bitti** → STATUS Track B; `COOP_API_URL` ve örnek curl'ler.
3. **Diğer track'ler ne yaptı?** A.P1 `planSettlement` imzası kesinleşti mi? C.P1 ajanların WS'e nasıl bağlanacağını okudu mu (MASTER §3.5)?
4. **Sonraki fazın bağımlılıkları:** A.P1 (`planSettlement`, `assembleSettlement`, `broadcastEF`). Yoksa koordinatörün tur mantığını `plan` üreten bir stub'la yaz; gerçek builder gelince bağla.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 2 — Koordinatör: lock-in, imza turu, yayın → S2

**Amaç:** Havuz dolunca koordinatör deterministik planı kursun, katılımcılardan imzaları toplasın, 3 tura kadar deneyip yayınlasın; dolmayan havuz süresi dolunca `failed` olsun.

**Bağımlılık:** A.P1. C.P2 ajanları WS istemcisi olarak gelecek; o zamana kadar `test/` içinde sahte katılımcılar.

**Görevler**
- 2.1 `apps/coordinator/src/engine.ts`: havuz izleme döngüsü (overlay poll veya WS admit); koşul: `pledgedCredits ≥ N` ve `height < deadlineHeight` → `locking`. `planSettlement(offer, pledges, { excluded })` çağır (MASTER §3.2 sıralama + %120). Her pledge'in **hâlâ harcanmamış** olduğunu Arcade `/tx` ile son kez kontrol et.
- 2.2 İmza turu: her katılımcıya `sign_request` (WS; katılımcı `hello` ile kayıtlı değilse MessageBox fallback — guide §9.5, `@bsv/message-box-client`; PoC olarak yalnızca WS yeterli, MessageBox'ı "varsa" yap). 60 sn zaman aşımı. Gelen `sign_response`'ları A'nın `assembleSettlement`'ı ile birleştir. Eksikler → `round_failed`, eksik outpoint'leri kara listeye al, bekleme listesinden tamamla, `round+1`. 3 turdan sonra `open`'a geri dön (havuz ölmez, pledge'ler yerinde).
- 2.3 Yayın: `broadcastEF` → Arcade; başarılıysa overlay'e submit; `settled` yayını; `settlements` tablosu overlay'den dolar.
- 2.4 Dolmayan havuz: `height ≥ deadlineHeight` ve `pledgedCredits < N` → `pool_failed`, status `failed`. Hiçbir yayın yok.
- 2.5 Durum ve loglar: `GET /pools/:id` → `round`, `signed/total`, `blacklist`. Her karar bir log satırı (jüri videosunda görünebilir).
- 2.6 Test: `test/e2e.coordinator.mockchain.test.ts` (A ile ortak): 3 sahte katılımcı, biri tur 1'de imzalamıyor → tur 2 bekleme listesiyle tamam; dolmayan havuz `failed`.
- 2.7 Koordinatör cüzdanı: wallet-toolbox (`WALLET_COORDINATOR_KEY`) yalnızca kimlik için (`AuthFetch` sunucu tarafı ve MessageBox). Para tutmaz; README'de yazılır.

**Kabul:** C'nin ajanlarıyla mainnet'te koordinatörün kurduğu bir settlement (T5) STATUS'ta; dolmayan havuz senaryosu mainnet'te bir kez (pledge tx'leri + `failed`); S2 B ✓.

### ✋ Checkpoint (Faz 2 sonu)
1. **Plan hâlâ iyi mi?** WS yerine MessageBox'a mecbur kaldıysan ya da 60 sn yetmediyse MASTER §3.2'yi güncelle; STATUS'a yaz.
2. **Bu faz bitti** → STATUS Track B.
3. **Diğer track'ler ne yaptı?** A.P2 `signListing`/`buildSweep` tipleri hazır mı (Faz 3 indeksler)? D.P1 vault OP_RETURN formatı kesinleşti mi? C.P2 ajanlar `sign_reject` ne zaman gönderiyor (politika reddi) — loglarda görünsün.
4. **Sonraki fazın bağımlılıkları:** A.P2 (listing tipleri), D.P1 (vault formatı). Yoksa Faz 3.1'i MASTER §3.3 `Listing`'e göre yaz.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 3 — Market indeksi, vault indeksi, canlı akış, barındırma → S3

**Amaç:** Listeler ve vault'lar overlay'de; `pool_update` gerçek zamanlı; overlay ve koordinatör bir makinede sürekli çalışıyor.

**Bağımlılık:** A.P2 (listing), D.P1 (vault çıktı formatı).

**Görevler**
- 3.1 `POST /listings` (A'nın `Listing` tipi; imza ve harcanmamışlık doğrulaması), `GET /listings?tokenId=`; overlay `listings` tablosu `spent` takibi (sweep sonrası düşer).
- 3.2 `vaults` sorgusu: owner identity'ye göre vault çıktıları ve bakiyeleri (D'nin owner-cli'ı kullanır).
- 3.3 Canlı akış: poll yerine overlay admit kancası (engine event'i varsa) → WS `pool_update` ≤ 1 sn.
- 3.4 Barındırma: overlay + coordinator tek bir `docker-compose.yml` veya `npm run infra`; `data/` kalıcı; `.env.example` güncel. Takımın ortak makinesinde (veya bir VPS'te) sürekli çalışır; URL'ler STATUS'ta.
- 3.5 Dayanıklılık: koordinatör yeniden başlayınca açık turları `open`'a döndürür; overlay yeniden başlayınca `GASPSync` kapalı kalır (kit gibi), eksik tx'ler `sync` ile çağrılır (guide §17.6).

**Kabul:** mainnet'te liste + sweep overlay'de doğru görünüyor; vault sorgusu çalışıyor; infra 24 saat kesintisiz kalkmış; S3 B ✓.

### ✋ Checkpoint (Faz 3 sonu)
1. **Plan hâlâ iyi mi?** Barındırma için VPS gerektiyse ve yoksa STATUS Blokajlar.
2. **Bu faz bitti** → STATUS Track B.
3. **Diğer track'ler ne yaptı?** D.P4 README için senden overlay/koordinatör bölümü istiyor.
4. **Sonraki fazın bağımlılıkları:** yok.
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

> **Genişletme fazları (5 ve 6).** Faz 0–3 en az hali tarif ediyor. İki eksik var: jüri ve dış ajanlar ürünü deneyemiyor (her şey yerelde) ve ne izinsizlik ne de ölçek gösteriliyor. Faz 5 ve 6 bunları kapatıyor. **Kural: S3 tamamlanmadan başlamaz.** Sıra 5 → 6 → 4: Faz 4 (kapanış) her zaman en son yapılır. Süre kalmazsa Faz 6, Faz 5'ten önce kesilir; Faz 5'in 5.1–5.3'ü tek başına bile değerli.

## Faz 5 — Herkese açık yayın (overlay + koordinatör + yan API) → S3 sonrası

**Amaç:** Jüri, diğer takımlar ve dış ajanlar AgentCoop'u kendi makinelerinden deneyebilsin: `https://overlay.<alan>` ve `https://coop.<alan>` üzerinden havuzları görsün, lookup yapsın, WS'e bağlansın ve kendi ajanıyla pledge verip imza turuna katılsın. Jüri kriterlerinde "adoption" (%35) ve "clear demo" doğrudan buna bağlı; yerelde çalışan bir demo bunu gösteremez.

**Bağımlılık:** S3. D'nin hesap ve alan adı kurulumu (`plan/SETUP-ACCOUNTS.md` §3: VPS, DNS, sertifika). Bu dosya repoda henüz yok; yoksa 5.1'i kendin yap ve STATUS Blokajlar'a "SETUP-ACCOUNTS §3 yok" yaz. C'nin ajanlarının `OVERLAY_URL` / `COOP_API_URL`'yi env'den okuması (MASTER §3.9).

**Görevler**
- 5.1 **Sunucu:** tek bir küçük VPS (2 vCPU, 4 GB, Ubuntu; Node 22 + pm2 veya docker compose). `packages/overlay` ve `apps/coordinator` Faz 3.4'teki `npm run infra` ile kalkar. `data/` ayrı bir dizinde (`/var/lib/agentcoop`), günlük `sqlite3 .backup` (cron) + `overlay.key` / koordinatör anahtarı yalnızca sunucuda (`.env`, 600 izin).
- 5.2 **HTTPS + alan adı:** Caddy reverse proxy (otomatik Let's Encrypt). `overlay.<alan>` → :8080, `coop.<alan>` → :8090 (WS dahil, `/ws` upgrade). HTTP → HTTPS yönlendirme. Alan adı yoksa geçici çözüm: `<ip>.sslip.io` alt alanları (DNS gerektirmez, Let's Encrypt ile çalışır).
- 5.3 **CORS ve kenar politikası:** overlay `configureEdgePolicy` / yan API `cors()`: GET/lookup herkese açık; `POST /offers`, `POST /listings` herkese açık ama doğrulamalı (imza + harcanmamışlık). BRC-105/402 başlıkları gerekmez (o C'nin sağlayıcısında). Gövde sınırı (ör. 1 MB; settlement BEEF'leri için overlay `/submit` 10 MB).
- 5.4 **Kötüye kullanım sınırları:** IP başına hız sınırı (`express-rate-limit`; lookup 60/dk, POST 10/dk); WS: bağlantı başına mesaj sınırı, `hello`'da **kimlik kanıtı** (koordinatörün gönderdiği nonce'u katılımcının identity anahtarıyla imzalaması; `sign_request` yalnızca kanıtlanmış kimliğe gider). Overlay `/submit` zaten SPV + kurallarla korunuyor; boyut sınırı yeter.
- 5.5 **İzleme:** `GET /healthz` (overlay: DB erişimi + son admit zamanı; koordinatör: açık havuz sayısı, bağlı WS istemcisi, Arcade erişimi). UptimeRobot (veya benzeri ücretsiz) 1 dk aralıkla iki URL'yi izler; düşerse ekip Telegram'ına bildirim. Yapılandırılmış log (JSON satırları) → `journalctl`/pm2 log; her koordinatör kararı tek satır (Faz 2.5).
- 5.6 **Dış katılım kılavuzu:** `apps/coordinator/README.md`'ye "Kendi ajanınla katıl" bölümü: herkese açık URL'ler, lookup örnekleri (curl), WS protokolü (MASTER §3.5), C'nin ajan SDK'sıyla 10 satırlık örnek. Kılavuzu takım dışı bir makinede (ör. bir takım üyesinin telefon hotspot'u + temiz klon) baştan sona dene.
- 5.7 **Mainnet kanıtı:** yerel olmayan bir makinedeki bir ajan, herkese açık koordinatör üzerinden bir havuza katılıyor ve settlement'a giriyor; txid STATUS'ta.

**Kabul:** iki HTTPS URL dışarıdan erişilebilir ve 5.5 izlemesi yeşil; CORS tarayıcıdan (başka origin) lookup ile doğrulandı; takım dışı bir makineden kılavuzla bir pledge + settlement yapıldı (txid STATUS'ta); sunucu yeniden başlatılınca veri kaybı yok (5.1 yedekten geri yükleme bir kez denendi).

**Çıktılar:** `infra/` (Caddyfile, `docker-compose.yml` veya `ecosystem.config.cjs`, `backup.sh`, `.env.example` eki), `apps/coordinator/src/auth.ts` (hello kimlik kanıtı), `apps/coordinator/README.md` "Kendi ajanınla katıl", STATUS'ta herkese açık URL'ler.

### ✋ Checkpoint (Faz 5 sonu)
1. **Plan hâlâ iyi mi?** WS kimlik kanıtı MASTER §3.5 `hello` mesajını değiştirdiyse (`hello { identity, poolIds[], nonceSig }`) önce MASTER §3, sonra STATUS "Arayüz değişiklikleri"; C'ye haber ver. VPS bulunamadıysa STATUS Blokajlar.
2. **Bu faz bitti** → STATUS Track B; herkese açık URL'ler "Diğer track'lerin benden beklediği" satırına (C ajanları, D README ve video).
3. **Diğer track'ler ne yaptı?** C'nin ajanları herkese açık URL'lerle çalışıyor mu? D README'ye URL'leri aldı mı?
4. **Sonraki fazın bağımlılıkları:** Faz 6 için C'nin ajan sürüsü (çok sayıda wallet-toolbox ajanı) ve fonlama (D).
5. Arayüz değişikliği varsa MASTER §3 + STATUS.

---

## Faz 6 — İzinsizliğin ve ölçeğin kanıtı: ikinci koordinatör, metrikler, denetim, 50+ katılımcı → S3 sonrası

**Amaç:** Üç iddiayı zincir üstünde kanıtlamak: (1) koordinatör **izinsiz** bir rol, aynı teklifi bağımsız başka bir koordinatör de kapatabiliyor; (2) koordinatör seçimi **denetlenebilir**, herkes deterministik sıralamayı yeniden hesaplayıp OP_RETURN'deki hash'le karşılaştırabiliyor; (3) mekanizma **ölçekleniyor**, 50+ katılımcı tek settlement işleminde. Bu, "teknik uygulama ve non-custodial tasarım" (%20) kriterinin ve FINAL-IDEA §8'deki "koordinatörün seçim yetkisi: tespit edilebilir" satırının somut kanıtı. Ayrıca FINAL-IDEA §11 demo kapanışındaki rakamların (katılımcı sayısı, işlem sayısı, settlement başına ücret, **emanetteki sat = 0**) kaynağı.

**Bağımlılık:** S3, Faz 5 (ikinci koordinatör herkese açık overlay'i okur). A'nın `planSettlement`'ının deterministik olması (A.P2.8 testi). C'nin ajan sürüsü: 50+ wallet-toolbox ajanı ve otomatik pledge (C ile birlikte; C'nin track dosyasında yoksa C'ye STATUS üzerinden iste). D'den fonlama: 50 ajan × (pledge + kayıt bedeli + ücret payı); sats settlement'ta sağlayıcıya, yani takıma geri döner.

**Görevler**
- 6.1 **Teklifin zincir üstünde yayınlanması (önerilen arayüz eki):** Bugün `Offer` (sağlayıcının SINGLE|ACP imzası) yalnızca koordinatör 1'in `POST /offers`'ında duruyor; bu, ikinci koordinatörü birinciye bağımlı kılar. Teklif imzası, havuz tx'inin kendi çıktısını harcadığı için aynı tx'e konamaz; bu yüzden ayrı ve küçük bir `OP_RETURN agentcoop offer <json>` tx'i (veya provider-cli'ın `open-pool` adımının ikinci tx'i) ile zincire yazılır, overlay `offers` tablosuna indeksler, `{ op:'offer', poolId }` lookup'ı eklenir. **Önce MASTER §3.2 op listesine `offer` ve §3.8'e lookup eklenir**, A ve C'ye STATUS'ta duyurulur. A/C kabul etmezse geçici yol: koordinatör 2, teklifi koordinatör 1'in `GET /offers/:poolId`'inden çeker (README'de dürüstçe yazılır).
- 6.2 **İkinci bağımsız koordinatör:** aynı `apps/coordinator` kodu, farklı kimlik anahtarı (`WALLET_COORDINATOR_2_KEY`), farklı port/alt alan (`coop2.<alan>`), aynı herkese açık overlay. Senaryo: koordinatör 1 kapatılır (veya bir havuzu kasıtlı olarak "sansürler"); koordinatör 2 teklifi zincirden/overlay'den bulur, aynı deterministik planı kurar, ajanlar (C, `COOP_API_URL` değişikliğiyle) koordinatör 2'nin turuna katılır, settlement yayınlanır. Mainnet'te bir kez; txid ve "hangi koordinatör kapattı" STATUS'ta.
- 6.3 **Denetim endpoint'i (önerilen ek):** `GET /pools/:poolId/audit` → o havuzun zincirdeki pledge'leri (overlay'den), MASTER §3.2 kuralıyla yeniden hesaplanmış sıralama ve `pledgeListHash`, settlement tx'inin OP_RETURN'ündeki hash ve `match: true|false`; atlanan (kara listeye alınan) outpoint'ler ve nedenleri (`round_failed` kayıtları). Herhangi bir koordinatörün kapattığı herhangi bir havuz için çalışır, yani koordinatör 2 koordinatör 1'i denetleyebilir. Komut satırı eşi: `npx tsx apps/coordinator/scripts/audit.ts <poolId>`.
- 6.4 **Metrik endpoint'i:** `GET /metrics` (JSON; ayrıca Prometheus metni `?format=prom`): `settlements` (sayı), `participants` (toplam ve havuz başına ortalama, en büyük settlement), `avgFeeSats` ve `avgFeeSatsPerParticipant`, `avgSettlementBytes`, `pledges` (açık/iptal/settle), `failedPools`, `rounds` (ortalama tur sayısı), ve **`custodiedSats = 0`** ile nasıl hesaplandığı: her settlement tx'inde hiçbir girdinin koordinatör anahtarlarından gelmediği ve hiçbir çıktının koordinatör anahtarlarına kilitlenmediği tek tek kontrol edilir; koordinatör cüzdanının bakiyesi zaman serisi olarak yalnızca kimlik/yayın ücretleriyle azalır. Değerler overlay'deki zincir kayıtlarından hesaplanır (koordinatörün kendi beyanından değil).
- 6.5 **Ölçek testi (C ile):** önce mockchain: `test/e2e.scale.mockchain.test.ts` 50 ve 100 katılımcı (ajan başına ayrı wallet-toolbox cüzdanı; tur zaman aşımı, WS eşzamanlılığı, BEEF boyutu, overlay `/submit` süresi ölçülür). Sonra mainnet: **50+ katılımcılı bir settlement** (T5). Doğrulama testi 8'e göre 50 katılımcı ≈ 17–18 kB ≈ 1.800 sat ücret; Arcade politikası (maks. tx 100 MB, maks. script ≥ 500 kB) sınır değil. Ölçülenler STATUS'a: imza turunun süresi, tx boyutu, ücret, overlay kabul süresi.
- 6.6 Gerekirse koordinatör optimizasyonu: `sign_request`'leri paralel gönder, `templateBEEF`'i tek seferde serileştir (katılımcı başına kopyalama yok), imza doğrulamasını girdi başına artımlı yap.

**Kabul:** iki koordinatör aynı overlay üzerinde çalışıyor ve koordinatör 2 mainnet'te bir havuzu kapattı (txid STATUS'ta); `/pools/:id/audit` bu settlement için `match: true` döndürüyor ve sahte bir hash'le `false` döndürdüğü test edildi; `/metrics` herkese açık URL'de `custodiedSats: 0` ile birlikte; mainnet'te ≥ 50 katılımcılı settlement txid'si STATUS'ta, mockchain'de 100 katılımcılı test yeşil.

**Çıktılar:** `apps/coordinator/src/{audit,metrics}.ts`, `apps/coordinator/scripts/audit.ts`, `packages/overlay` `offer` indeksi (6.1 kabul edildiyse), `test/e2e.scale.mockchain.test.ts`, `infra/` ikinci koordinatör servisi, STATUS'ta ölçek sonuçları ve README için rakamlar (D'ye).

### ✋ Checkpoint (Faz 6 sonu)
1. **Plan hâlâ iyi mi?** 6.1 reddedildiyse README'deki izinsizlik iddiasını "teklif herkese açık API'de" olarak yumuşat; ölçek testinde bir darboğaz (WS, BEEF boyutu, overlay süresi) bulunduysa STATUS'a sınırı yaz.
2. **Bu faz bitti** → STATUS Track B; metrik URL'si ve ölçek rakamları "Diğer track'lerin benden beklediği" satırına (D: README, value note, video kapanışı).
3. **Diğer track'ler ne yaptı?** C'nin ajan sürüsü ve D'nin fonlaması yeterli miydi? D README'ye rakamları aldı mı?
4. **Sonraki fazın bağımlılıkları:** Faz 4 (kapanış): yok.
5. Arayüz değişikliği varsa (6.1 `offer` op'u, 6.3/6.4 endpoint'leri) MASTER §3.2/§3.5/§3.8 + STATUS.

---

## Faz 4 — Kapanış → S4

> Faz 5 ve 6'dan sonra (yapıldılarsa) yapılır.

**Görevler**
- 4.1 `apps/coordinator/README.md` ve `packages/overlay/README.md`: sorgular, WS protokolü, sıralama kuralı, "koordinatör para tutmaz, herkes çalıştırabilir" notu, nasıl kendi koordinatörünü çalıştırırsın; Faz 5/6 yapıldıysa herkese açık URL'ler, `/metrics`, `/audit` ve ikinci koordinatör settlement'ı.
- 4.2 Test süreleri ve flaky temizliği.
- 4.3 D'ye teslim: README "Overlay & Coordinator" bölümü; mainnet'te koordinatörün kurduğu settlement txid'leri.

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği? STATUS.
2. STATUS Track B: "Tamamlandı".
3. Açık blokajlardan sana düşen var mı?
4. S4 listesinde B maddeleri ✓.
