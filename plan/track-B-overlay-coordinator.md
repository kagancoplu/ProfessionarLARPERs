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
- 1.1 `AgentCoopTopicManager`: kit'in token kurallarını **aynen** çalıştırır (kredi çıktıları için) **ve** OP_RETURN `agentcoop` zarfı taşıyan tx'leri tanır: `pool` → out0 kredi UTXO'su + terms; `pledge` → out0 pledge coin, out1 fee, out2 kayıt; `settle` → settlement; `list` → liste; `vault` → vault çıktısı (D'nin formatı, şimdilik ham kaydet). Admit edilen çıktılar: kredi çıktıları (kit kuralı), pledge coin'ler, vault çıktıları. OP_RETURN çıktıları admit edilmez ama parse edilip lookup'a yazılır.
- 1.2 `AgentCoopLookupService` (knex/SQLite): tablolar `pools(poolId, terms json, status, createdHeight)`, `pledges(outpoint, poolId, participant, credits, signer, height, spent, spendingTxid)`, `settlements(poolId, txid, pledgeListHash)`, `offers(poolId, offer json)`, `listings(outpoint, …, spent)`, `vaults(outpoint, owner, agent, guard, spent)`. Spent işaretleme: engine'in `outputSpent` çağrısı (kit lookup'ındaki desen).
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

## Faz 4 — Kapanış → S4

**Görevler**
- 4.1 `apps/coordinator/README.md` ve `packages/overlay/README.md`: sorgular, WS protokolü, sıralama kuralı, "koordinatör para tutmaz, herkes çalıştırabilir" notu, nasıl kendi koordinatörünü çalıştırırsın.
- 4.2 Test süreleri ve flaky temizliği.
- 4.3 D'ye teslim: README "Overlay & Coordinator" bölümü; mainnet'te koordinatörün kurduğu settlement txid'leri.

### ✋ Checkpoint (Faz 4 sonu)
1. Plan değişikliği? STATUS.
2. STATUS Track B: "Tamamlandı".
3. Açık blokajlardan sana düşen var mı?
4. S4 listesinde B maddeleri ✓.
