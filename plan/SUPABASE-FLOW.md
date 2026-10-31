# Supabase katmanı: inceleme ve akış raporu

> **Uygulama:** demo MVP'si (F1 canlı ayna + F2 çok oyunculu Kasaba, kimlik doğrulamasız) `plan/phases/SUPABASE-MVP.md` ile yapıldı; rapordan sapmalar orada "MVP kararları" başlığında.
> Durum: **taslak** (31.10.2026). Firebase sürümünün yerine geçer: Firebase faturalı plan (kart) istediği için Supabase'e geçildi. Supabase'in ücretsiz planı kart istemiyor; aynı rolleri karşılayan araçları var.
> Amaç: frontend ile backend arasına bir iletişim katmanı, bir geçici defter ve bir kayıt sistemi koymak; Supabase'in hangi parçasının nereye oturduğunu ve akışların sırasını netleştirmek. İmplementasyon planı bu rapor onaylandıktan sonra ayrı yazılacak.
> Kaynaklar: `plan/00-MASTER-PLAN.md` §3 (arayüzler), `plan/STATUS.md`, `plan/track-E-frontend.md` (P7), `docs/THREAT-MODEL.md`, `infra/README.md`, `apps/web/src/**`, `apps/coordinator/src/**`, `apps/guard/src/**`, `packages/overlay/src/**`.

---

## 0. Kısa özet

1. Supabase **iletişim, görünürlük ve kayıt** katmanı olur; **para ve doğruluk katmanı asla olmaz**. Doğruluk kaynağı zincir + overlay olarak kalır. Supabase'deki her kayıt ya zincirden yeniden türetilebilen bir aynadır, ya sahibinin identity key'iyle imzaladığı bir beyandır, ya da kaybolsa zararı olmayan geçici durumdur.
2. Protokol Supabase'siz de çalışmaya devam eder. Koordinatör, guard, provider-api, overlay ve ajanlar Supabase'i bilmez. "Herkes koordinatör çalıştırabilir" (T-3) iddiası bozulmaz.
3. Önerilen yapı: **tek bir relay süreci** (`apps/relay`, VPS'te `infra/run.mjs` yanında) bugünkü tüm akışlara abone olur, Postgres tablolarına yazar ve değişiklikleri **Realtime Broadcast** ile toplu yayınlar. Tarayıcı bugün açtığı 5 akış + 6 poll döngüsü yerine tek bir Supabase bağlantısı açar.
4. **Postgres (+ RLS):** hem canlı durum (havuzlar, pledge'ler, turlar, listeler) hem kayıt sistemi (kimlikler, sağlayıcılar, servisler, ürünler, tx defteri, kararlar, metrik geçmişi) aynı veritabanında. İlişkisel olduğu için tarayıcıda yapılan toplamalar (sıralama tablosu, tasarruf, havuz zaman çizelgesi, sağlayıcı istatistikleri) SQL view'larına iner.
5. **Realtime:** Broadcast (relay'den toplu değişiklikler, Kasaba hareketleri), Presence (kim çevrimiçi), Postgres Changes (yalnız kişisel gelen kutusu gibi düşük hacimli akışlar).
6. **Auth:** anonim oturum + BSV imzasını doğrulayan bir Edge Function, identity key'i kullanıcının `app_metadata`'sına yazar; RLS `auth.jwt() -> 'app_metadata' ->> 'identity_key'` ile çalışır. Özel JWT basmaya gerek yok.
7. **Edge Functions:** BSV imza doğrulaması (giriş, imzalı profil/servis/niyet/devir yazımı), opsiyonel web push. **pg_cron + pg_net:** zamanlanmış temizlik ve özetler. Uzun ömürlü abonelik (SSE/WS) Edge Function'a uymaz (ücretsiz planda 150 sn duvar saati); o iş relay'de.
8. İmza turu, guard `/cosign`, provider-api 402/redeem ve overlay `submit` **doğrudan kalır**. Bunlar kimlik doğrulamalı protokol çağrıları; Supabase bu yolun içine girmez.
9. **En sıkı kısıt Realtime kotası:** ücretsiz planda saniyede 100 mesaj ve ayda 2 milyon mesaj; her alıcı ayrı mesaj sayılıyor. Bu yüzden canlı ayna saniyede en fazla bir toplu yayınla akar ve Kasaba'da konum değil **hedef** gönderilir (§9.8).
10. Zaman: hackathon 31.10'da bitiyor; S3/S4 açık. Teslime yetişecekse yalnızca F1 + F2 (canlı ayna + presence/çok oyunculu) mantıklı, gerisi sonrası.

---

## 1. Bugün sistem nasıl konuşuyor

### 1.1 Kanallar (canlı mod, `apps/web`)

Servis URL'leri build zamanında `VITE_*`'den gelir; geliştirmede Vite proxy `/api/<svc>` (`apps/web/src/env.ts:40-71`).

| Servis | Kanal | Ne taşıyor | Sıklık |
|---|---|---|---|
| koordinatör :8090 | WS `/ws` | `challenge`, `hello`/`hello_ack`, `pool_update`, `sign_request`/`sign_response`/`sign_reject`, `settled`, `round_failed`, `pool_failed` | push; yeniden bağlanma 1→30 sn |
| koordinatör | REST | `GET /pools` (her overlay olayından sonra), `GET /pools/:id/pledges` (değişen her havuz için ayrı: N+1), `GET /listings` (10 sn poll), `POST /offers`, `POST /listings`, `POST /pledges/lighthouse`, `GET /metrics`, `/healthz` | olay + poll |
| overlay :8080 | SSE `/agentcoop/events` | yalnızca `admitted`/`spent { txid }`; web gerisini `derive.ts` ile kendisi türetir | push, 150 ms debounce |
| overlay | REST `POST /lookup` | `vaults` (20 sn poll) + her vault için ayrı `vaultCredits` (20 sn), akışlarda `settlement`/`outpoint`/`pledges` | poll |
| provider-api :8092 | REST + BRC-103/105 `AuthFetch` | katalog, bakiye (4 sn poll), redeem, iş (800 ms poll), iade | poll; SSE yok |
| guard :8091 | SSE `/events` + REST `AuthFetch` | `cosign_*`, `policy_updated`, `vault_registered`; vault/politika/karar okuma (vault durumu 5 sn poll) | push + poll |
| ajanlar :8093 | SSE `/events` + `GET /agents` | `agent_*` olayları; ajan listesi 30 sn | push + poll |
| maker :8094 | SSE `/events` + `GET /quote` | `rail_*` | push |
| Arcade | REST | yükseklik, BEEF, SPV | 30 sn sağlık |

Tüm kaynaklar web'de aynı zarfa sarılıyor: `CoopEvent { id, ts, src, type, data, txid?, poolId?, agent? }` (`apps/web/src/events/types.ts:11-23`, ~45 olay tipi). Akış: adaptör → `bus.publish` (`src|id` ile tekilleştirme) → `store.applyEvent` → Kasaba, konsollar, ses, kaydedici. Bu zarf, Supabase katmanının da ortak dili olmalı.

### 1.2 Backend: kim neyi nerede tutuyor

Gerçek veritabanı yalnızca overlay ve koordinatörde var (SQLite, knex); ikisi VPS'te `infra/run.mjs` altında tek süreç olarak çalışıyor ve yedekleniyor. Guard, provider-api, ajanlar ve maker durumlarını `data/` altındaki JSON dosyalarında veya bellekte tutuyor; `infra/` bunları dağıtmıyor ve yedeklemiyor.

Kategoriler: **E** geçici (yeniden başlatmada kaybolur), **D** kalıcı ve yalnız zincir dışı, **M** zincirin aynası.

| Durum | Sahibi | Depo | Kat. | Supabase için anlamı |
|---|---|---|---|---|
| Kabul edilmiş çıktılar, havuz/pledge/settlement/vault/list/offer kayıtları; havuz durumu sorgu anında türetiliyor | overlay | `data/overlay/overlay.db` | M | Doğruluk kaynağı. GASP senkronu kapalı: yalnızca kendisine submit edileni biliyor. Aynanın kaynağı burası |
| Teklifler (SINGLE\|ACP imza) | koordinatör | `coordinator.db` `offers` | D (zincirdeki `offer` kaydından yeniden türetilebilir) | Aynalanabilir |
| **Liste defteri** | koordinatör | `listings` tablosu | D, **tek kopya** | Aynalanır (`listings` tablosu); esas defter koordinatörde kalır |
| Havuz ilerlemesi: denemeler, kara liste, son tur, vazgeçme | koordinatör | `progress` tablosu | D | `rounds` tablosu |
| Lighthouse pledge'leri (insan imzası + BEEF) | koordinatör | `lighthouse_pledges` | D; kaybolursa ortak imza atılamaz | **Aynalanmaz** (imza guard'la birlikte kullanılabilir, T-20); yalnız varlığı ve durumu |
| Çalışan tur (plan, imzalananlar), WS oturumları | koordinatör | bellek | E | Tur ilerlemesi WS'te yayınlanmıyor, yalnız `GET /pools/:id` → `coordinator { round, signed, total, blacklist }`. Relay bunu okur |
| Vault kayıtları, sahip politikaları, harcama defteri (7 gün / 24 sa pencereleri) | guard | `data/guard/state.json` (tüm dosya yeniden yazılır) | D, **güvenlik kritik** | **Taşınmaz, aynalanmaz** (kırmızı çizgi 4) |
| Karar günlüğü | guard | `data/guard/decisions.jsonl` | D (denetim) | SSE'de zaten kamuya açık → `guard_decisions` |
| Ön ödemeli bakiyeler, redeem edilmiş outpoint'ler | provider-api | `data/provider/balances.json` | D (güvenilen, ≤ 20 kredi) | Taşınmaz |
| İşler; overlay outbox (sıralı token tx kuyruğu) | provider-api | `data/provider/jobs.json`, `outbox.json` | D | İş durumları aynalanabilir (SSE eklenirse) |
| 402 replay deposu | provider-api | bellek (`InMemoryPaymentReplayStore`) | E | Tek süreçte yeterli; çok süreçte Postgres'te atomik bir tablo seçeneği (T-17) |
| Ürünler + tokenId | provider-api/cli | `apps/provider-api/products/*.json` (5 sn poll) | yapılandırma | `products` tablosu |
| Sunucu cüzdanları | her servis | `data/wallets/<ad>.sqlite` | M + yerel meta | Taşınmaz |
| Olay tamponları (500), ajan listesi | ajanlar, guard, maker | bellek; sayaçlar yeniden başlatmada sıfırlanıyor | E | Relay kalıcı id verir |
| Haftalık harcama, `activity.log`, `decisions.log` | ajanlar | `data/agents/<ad>/` | D | Kararlar `agent_decisions` tablosuna |
| **Havuz kaydı (nonce = gelir keyID'si; yoksa `sweep-revenue` imzalayamaz)** | provider-cli | `data/provider-cli/pools.json` | D, yerel | Şifreli `user_records` (web'deki `mine.ts` ile aynı sorun) |
| Kendi lighthouse pledge'leri | participant-cli | `data/participant-cli/pledges.json` | D, yerel | Şifreli `user_records` |
| Vault devri: `vault.json`, `fund-<txid>.json` → guard `adopt` | owner-cli → guard | `data/vaults/<id>/` (dosya taşıyarak) | D, dosya tabanlı devir | Makineler arası devir `handoffs` tablosuyla (içerik zaten zincirde/kamuya açık; guard zincirden doğrular) |
| Kamuya açık identity key'ler | scripts | `config/identities.json` (commit'li) | kayıt | `identities` tohumu |

Servisler birbirini yalnızca env URL'leriyle buluyor (`OVERLAY_URL`, `COOP_API_URL`, `GUARD_URL`, `LIGHTHOUSE_GUARDS`, …); koordinatör guard kimliklerini `/healthz`'ten öğreniyor. Push: overlay → koordinatör (SSE), koordinatör → katılımcılar (WS), guard/ajanlar/maker → web (SSE). Poll: koordinatör → overlay 5 sn, ajanlar → `/pools` 30 sn, provider-api → koordinatör (katalog), web → §1.1'deki döngüler.

Tek süreç varsayımları: koordinatörün turu bellekte (iki süreç aynı DB'de çift tur koşar; tasarım ikinci koordinatörü ayrı DB ile çalıştırıyor), guard `/cosign`'ı süreç içi kuyrukla sırayla işliyor (G13), provider-api bakiye kontrolü + düşümü senkron. Supabase bu varsayımları değiştirmemeli; bu yüzden §2'deki 4. kural.

### 1.3 Bugünkü boşluklar (Supabase'in çözeceği yerler)

| # | Boşluk | Kanıt | Supabase'deki karşılığı |
|---|---|---|---|
| B1 | **Soğuk açılışta havuz yok.** Overlay SSE açılışta `refresh()` çağırmıyor, koordinatör cüzdansız izleyiciye anlık görüntü göndermiyor, bilinmeyen havuzun `pool_update`'i yok sayılıyor. Kasaba ilk olaya kadar boş | `events/adapters/overlaySse.ts`, `store/reducers.ts:109-110`, `apps/coordinator/src/ws.ts:89-104,169-176` | Açılışta `pools`/`pledges`/`rounds`/`listings` tablolarından tek sorgu (PostgREST), sonra Broadcast ile değişiklikler |
| B2 | **Tarayıcıda toplama.** SSE → REST → fark; vault başına sha256 + ayrı lookup; guard vault+politika+karar birleştirme; metrikler | `overlaySse.ts:24-50`, `livePoll.ts:49-73`, `flows/live.ts:365-372` | Relay bir kez yazar; toplamalar SQL view'ları |
| B3 | **Poll yükü.** 10 sn listeler, 20 sn vault'lar, 30 sn ajanlar/sağlık, 4 sn bakiye, 5 sn vault, 800 ms iş; her `AuthFetch` çağrısı yeni BRC-103 el sıkışması | `livePoll.ts`, `ParticipantPage.tsx:82,92`, `OwnerPage.tsx:22`, `live.ts:56` | Kamuya açık veriler Broadcast'ten; kimlikli olanlar doğrudan kalır ama seyrekleşir |
| B4 | **Geçmiş yok.** Store bellekte; sayfa yenilenince metrik geçmişi, zaman çizelgeleri, sıralama tablosu gider | `store/types.ts:141-160`, `store/history.ts` | `pools`, `txs`, `events`, `metrics_snapshots` tabloları + view'lar |
| B5 | **Kimlik kaydı yok.** İsim yalnızca ajanlar için (`GET /agents`); insan, sağlayıcı, guard `short(pubkey)`. Tek provider URL'si varsayılıyor (oysa her havuzun `terms.providerApi`'si var), tek guard URL'si | `reducers.ts:67`, `live.ts:58` vs `:257` | `identities`, `provider_stats` view, `services` |
| B6 | **Kritik kişisel kayıtlar yalnız localStorage'da.** `agentcoop.mine.<id16>`: pledge'lerim + anahtar talimatları, havuzlarım + nonce (gelir keyID'si), vault'larım + script. Başka tarayıcıdan geri çekme ve gelir senkronu çalışmaz | `wallet/mine.ts:23-44`, `live.ts:286,378` | `user_records`, **cüzdanla şifreli**, RLS ile yalnız sahibi |
| B7 | **Sahte kaynak damgalı iyimser olaylar.** Tarayıcı `src:'guard'`/`'overlay'` olayları üretiyor; yerel `guard:N` id'leri sunucunun `guard:${seq}`'iyle çakışıp gerçek olayı tekilleştirmede düşürebiliyor; ajan ve maker sayaçları yeniden başlatmada sıfırlanıyor | `live.ts:340-428`, `apps/guard/src/guard.ts:121` | `txs.stage` yaşam döngüsü + relay'in kalıcı, tekil olay id'leri |
| B8 | **Çok oyunculu (P7) yapılmadı:** presence sunucusu yok | `STATUS.md:455`, `track-E-frontend.md:522` | Realtime Presence + Broadcast (`town:main` kanalı) |
| B9 | **Bildirim yok.** 60 sn'lik imza turunu, guard reddini, satılan listeyi kullanıcı ancak sekme açıksa görür | — | `inbox` tablosu + Postgres Changes (+ opsiyonel web push Edge Function'ı) |
| B10 | **Servis URL'leri build'e gömülü**, çalışma zamanı yapılandırması yok; yayında CSP `connect-src` yer tutucu | `vite.config.ts:25`, `public/_headers` | `services` tablosu (imzalı) → açılışta okunur |
| B11 | Replay kaydı elle indirilip `public/replays`'e kopyalanıyor; mainnet tx tablosu STATUS ve README'de elle tutuluyor | `replay/recorder.ts:37-43` | `txs` tablosu + Storage `replays` bucket'ı |
| B12 | **CLI'ların kayıtları yerel dosyada, devirler dosya taşıyarak.** `provider-cli/pools.json` (gelir nonce'u), `participant-cli/pledges.json`, owner-cli → guard `adopt` için `data/vaults/<id>/` | §1.2 | Şifreli `user_records` (CLI ve web aynı kaydı görür); `handoffs` |
| B13 | Guard, provider-api, ajan ve CLI durumları VPS'te değil, yedeklenmiyor | `infra/backup.mjs:24-29` | Supabase'in işi değil (güvenlik kritik olanlar yerinde kalır); `infra/backup.mjs` genişletilmeli. Supabase yalnız kamuya açık/şifreli kayıtların ikinci kopyası olur |

**Yan bulgular (Supabase'den bağımsız, ilgili track'e iletilmeli):**
- **Web build kırık:** `apps/web/src/consoles/explorer/MainnetProof.tsx:2` `../../data/mainnet`'i import ediyor; dosya repoda da bu makinede de yok, kök `.gitignore:16 data/` onu yutuyor (→ E).
- Replay modu da `createLiveFlows`'u canlı URL'lerle kuruyor; replay'de bir kullanıcı eylemi gerçek servislere gider (`apps/web/src/boot.ts:69`) (→ E).
- maker'ın varsayılan portu 8094, `infra/agentcoop.env.example`'daki `COOP2_PORT=8094` ile çakışıyor (→ B/D).
- STATUS Track E hâlâ `POST /pledges/lighthouse`'u açık sayıyor; B 31.10'da bitti yazmış (→ E).
- `.env.example`'da `VITE_MAKER_URL` yok (→ D/E).

---

## 2. Kırmızı çizgiler (değişmeyecek kurallar)

1. **Supabase değer taşımaz, anahtar tutmaz.** Özel anahtar, seed, `.env`, guard sırrı, overlay anahtarı Supabase'e gitmez. Supabase'in **secret key**'i (`sb_secret_…`, eski adıyla `service_role`; RLS'i atlar) yalnızca relay'in `.env`'inde ve Edge Function secret'larında durur. Tarayıcıda yalnızca **publishable key** (`sb_publishable_…`, eski adıyla `anon`) olur; o gizli değildir, korumayı RLS sağlar.
2. **Doğruluk kaynağı zincir + overlay.** Supabase'deki havuz, pledge, liste, kredi verisi gösterim içindir. İmza öncesi her kontrol (`verifySettlementPlan`, `verifyLineage`, `verifyListing`) Supabase'den bağımsız yapılır. Supabase'de görülen bir şeyle para hareketi başlatılacaksa (sweep, pledge), akış önce veriyi overlay/koordinatörden tazeler. Bugünkü builder'lar zaten böyle (BEEF overlay'den, soy zincirden).
3. **Protokol Supabase'siz çalışır.** Relay kapanırsa web bugünkü doğrudan adaptörlere düşer. CLI'lar ve ajanlar hiç etkilenmez.
4. **Güvenlik kritik atomik depolar yerinde kalır:** guard'ın tavan sayaçları ve karar günlüğü, provider-api'nin 402 ve redeem replay depoları, ön ödemeli bakiye. Bunlar ilgili sürecin sınırı içinde kalmalı. (İleride provider-api çok süreçli çalışırsa Postgres'te `insert … on conflict do nothing` ile atomik ortak replay deposu olabilir; AGENTS.md "atomic, shared replay store" diyor. Şimdi gerekmiyor.)
5. **Kullanıcı beyanları imzalı.** Profil, niyet, servis kaydı, vault devri sahibinin identity key'iyle imzalanır; imza satırla birlikte saklanır, herkes doğrulayabilir. Postgres secp256k1 doğrulayamadığı için bu yazmalar doğrudan tabloya değil, imzayı doğrulayan bir Edge Function'a gider.
6. **Kişisel kayıtlar şifreli.** "Benim kayıtlarım" kullanıcının cüzdanıyla (`wallet.encrypt`, `counterparty: 'self'`) şifrelenip yazılır; Supabase yalnızca şifreli metin görür.
7. **Yazma yetkisi dar, varsayılan ret.** Her tabloda RLS açık. İstemci yalnızca kendi `user_records` satırlarına, kendi `txs` `created` kaydına ve kendi `inbox` satırının `read` sütununa yazar. Aynalanan veriye yalnızca relay (secret key) yazar. Politikalar yerel Supabase yığınında testle kanıtlanır.

---

## 3. Mimari yaklaşımlar

| | A. Relay / ayna (**öneri**) | B. Servisler doğrudan yazar | C. Supabase protokol veri yolu |
|---|---|---|---|
| Ne | Tek bir `apps/relay` mevcut WS/SSE/REST'e abone olur, Postgres'e yazar, Broadcast yayınlar | Koordinatör, guard, ajanlar, provider-api'ye birer Supabase "sink" eklenir | `sign_request`/`sign_response`, pledge bildirimi vb. Realtime üzerinden akar; WS/SSE emekli |
| Servis kodu | Değişmez | Her track değiştirir | Koordinatör ve tüm istemciler yeniden yazılır |
| Secret key | Yalnız relay'de (+ Edge Functions) | Her süreçte | Her yerde |
| Veri zenginliği | Mevcut olaylar kadar; eksikler için servise küçük ekler | En zengin | En zengin |
| Merkezileşme | Opsiyonel görünüm katmanı | Supabase servislerin bağımlılığı olur | Supabase protokolün parçası olur; T-3 "herkes koordinatör çalıştırabilir" zayıflar, jüri non-custodial/merkeziyetsizlik puanında soru işareti |
| Realtime kotası | Relay toplar, saniyede ≤ 1 yayın | Her servis ayrı yayınlar, kota çabuk biter | İmza turları da kotadan yer |
| Risk | Ayna gecikebilir/eskiyebilir (uzlaştırma döngüsüyle kapanır) | 4 track'e aynı anda dokunmak | En yüksek |

**Öneri: A**, gerekirse seçici B ile (ör. koordinatör izleyicilere tur ilerlemesini daha zengin yayınlar). C önerilmez.

BSV-yerel alternatif notu: kimliğe adreslenen, alıcı çevrimdışıyken bekleyen mesajlar için ekosistemde **MessageBox** (`@bsv/message-box-client`, BRC-33, guide §5) var. Gelen kutusu (§9.3) ileride MessageBox'a da yazılabilir; jüri açısından artı. Presence, çok oyunculu hareket ve sorgulanabilir kayıt için MessageBox uygun değil; orada Supabase daha doğru.

---

## 4. Supabase araçlarının eşlemesi

| İhtiyaç | Araç | Neden bu |
|---|---|---|
| Canlı havuz/pledge/tur/liste/vault durumu (geçici defter, kamu) | **Postgres tabloları** + **Realtime Broadcast** (relay'den toplu değişiklik) | Açılışta tek sorgu, sonra değişiklik akışı. Broadcast, Postgres Changes'tan ucuz: abone başına RLS kontrolü yok ve relay saniyede bir paket yapabilir |
| Presence (kim çevrimiçi) | **Realtime Presence** | Bağlantı kopunca kendiliğinden düşer; tablo gerekmez |
| Kasaba hareketleri (P7) | **Realtime Broadcast** (`town:main`) | Kalıcı olması gerekmez; konum değil hedef gönderilir (§9.8) |
| Kişisel gelen kutusu | `inbox` tablosu + **Postgres Changes** (RLS'li, `identity_key` filtresi) | Düşük hacim; RLS her kullanıcının yalnız kendi satırlarını görmesini sağlar |
| Kayıt: kimlik, sağlayıcı, servis, ürün, havuz arşivi, tx defteri, kararlar, metrik geçmişi | **Postgres** + **PostgREST** (supabase-js `from(...).select()`) + view/materialized view | İlişkisel sorgu, birleştirme, sıralama; tarayıcıdaki toplamalar SQL'e iner |
| "Benim kayıtlarım" (şifreli) | `user_records` tablosu + **RLS** | Satır başına sahip kuralı; cihazlar arası |
| Kimlik | **Auth**: anonim oturum + `app_metadata.identity_key` (Edge Function yazar) | RLS `auth.jwt()` ile kimliği okur; özel JWT basmak gerekmez |
| İmza doğrulayan yazmalar (giriş kanıtı, profil, servis, niyet, devir) | **Edge Functions** (Deno, `npm:@bsv/sdk@3.2.1`) | Postgres secp256k1 imzası doğrulayamaz; doğrulayıp secret key'le yazar |
| Uzun ömürlü abonelik ve projeksiyon | **relay** (kendi Node sürecimiz, VPS) | SSE/WS saatlerce açık kalmalı; Edge Function ücretsiz planda 150 sn'de kapanır |
| Zamanlanmış temizlik, özetler | **pg_cron** (+ HTTP için **pg_net**) | Ücretsiz planda var; çoğu iş saf SQL |
| Bildirim tetikleyicisi | **Database Webhooks** (tetikleyici → Edge Function) | `inbox` insert → web push (opsiyonel; Supabase'in kendi push servisi yok, VAPID ile standart Web Push) |
| Replay dosyaları | **Storage** (`replays` bucket, herkese okunur) | Ücretsiz planda 1 GB |
| Kötüye kullanım | Anonim girişte **CAPTCHA** (Cloudflare Turnstile veya hCaptcha) + RLS + Realtime kanal yetkilendirmesi | Herkese açık anonim oturumu korur |
| Yerel geliştirme ve test | **Supabase CLI** (`supabase start`: Docker'da Postgres + Auth + Realtime + Storage + Edge runtime), `supabase/migrations/*.sql`, `supabase functions serve` | Firebase emulator'ın karşılığı; kural (RLS) testleri sats ve gerçek proje olmadan koşar |
| Statik yayın | **Supabase'de yok** → Cloudflare Pages (plan zaten öyle) | Değişiklik yok |

BSV ile oturum açmanın hazır yolu yok: Supabase'in "Sign in with Web3" özelliği yalnız Ethereum ve Solana'yı destekliyor. Bu yüzden §7'deki anonim oturum + Edge Function deseni.

---

## 5. Hedef mimari

```
                         ┌──────────── BSV mainnet ◀── Arcade ─────────────┐
                         │                                                  │
 overlay :8080 ──SSE + /lookup──┐                                           │
 koordinatör :8090 ──WS (izleyici) + REST──┤                                │
 guard :8091 ──SSE───────────────┤──▶  relay (apps/relay, secret key)  ──▶  Supabase
 ajanlar :8093 ──SSE + /agents───┤        • projeksiyon (derive)              ├─ Postgres (canlı tablolar + kayıt + view'lar, RLS)
 maker :8094 ──SSE───────────────┤        • uzlaştırma döngüsü                ├─ Realtime (Broadcast `live`, Presence/Broadcast `town:main`,
 provider-api :8092 ──/catalog───┘        • saniyede ≤ 1 toplu Broadcast      │            Postgres Changes `inbox`)
                                                                              ├─ Auth (anonim + app_metadata.identity_key)
                                                                              ├─ Edge Functions (bsv-auth, signed-write, push)
                                                                              ├─ pg_cron / pg_net (temizlik, özet)
                                                                              └─ Storage (replays)
                                                                                     ▲
                                                                                     │ publishable key + kullanıcı oturumu
 web ──WS (kanıtlı hello, imza turu) ─────────────────────────────▶ koordinatör      │
 web ──AuthFetch (BRC-103/105) ───────────────────────────────────▶ provider-api, guard
 web ──POST /submit ──────────────────────────────────────────────▶ overlay          │
 web ──WalletClient('auto') ──────────────────────────────────────▶ BSV Desktop (her imza)
 web ────────────────────────────────────────────────────────────────────────────────┘
```

Doğrudan kalan çağrılar kimlik doğrulamalı protokol çağrılarıdır. Supabase'e giden her şey ya kamuya açık bir aynadır, ya imzası doğrulanmış bir beyandır, ya da kullanıcının kendi satırıdır.

---

## 6. Üç katmanın tanımı

### 6.1 İletişim katmanı

- **Aşağı yön (sunucu → tarayıcı, kamu):** relay → Postgres (anlık görüntü) + Broadcast `live` kanalı (değişiklik paketleri, `CoopEvent` dizisi) → tüm tarayıcılar. Bugünkü 5 akış + 6 poll yerine tek bağlantı. Web store'u ve Kasaba değişmeden beslenir.
- **Kişiye özel aşağı yön:** relay → `inbox` tablosu → Postgres Changes (RLS'li) → yalnız sahibi (imza bekliyor, havuz doldu, settle oldu, tur başarısız, guard reddetti, listen satıldı).
- **Tarayıcılar arası:** Presence ve Kasaba hareketleri (`town:main`), yalnızca istemciler yayınlar, hiçbir şey tabloya yazılmaz.
- **Yukarı yön (tarayıcı → protokol):** değişmez; doğrudan servislere.

### 6.2 Geçici defter

"Geçici defter" dört ayrı şeyi karşılayabiliyor; hepsi zincir dışı, hepsi zincirden veya sahibinden yeniden kurulabilir:

| Tür | Ne | Ömür | Kim yazar |
|---|---|---|---|
| G1 Canlı ayna | Açık havuzlar, pledge'ler, tur ilerlemesi (round, signed/total, bitiş zamanı, kara liste), açık listeler, vault bakiyeleri, servis sağlığı | Aynı tablolarda kalır; `status` ile canlı/arşiv ayrılır (Firebase'deki ayrı canlı/arşiv ağaçlarına gerek yok) | relay |
| G2 Tx yaşam döngüsü | `txs.stage`: `created → broadcast → admitted → mined` (+ `pool_id`, `kind`). B7'deki sahte kaynak damgalı iyimser olayların yerini alır | Kalıcı (tx defteri ile aynı tablo) | Tarayıcı `created` satırını kendi oturumuyla açar; relay overlay/Arcade'den ilerletir |
| G3 Gelen kutusu / bekleyen işler | Kişiye özel bildirimler ve "imza bekliyor" kayıtları | Okununca veya 24 sa sonra pg_cron siler | relay yazar; kullanıcı yalnız `read` işaretler |
| G4 Niyet defteri (opsiyonel ürün) | Bağlayıcı olmayan, imzalı talep beyanları: "önümüzdeki 7 gün ~16 GPU-saat, kredi başına ≤ 30 sat". Sağlayıcı toplam talebi görür, doğru boyutta havuz açar; niyet sahipleri bildirim alır ve gerçek pledge'i kendisi verir | Süreli (`expires_at`), havuz açılınca kapanır | Ajan/insan imzalı yazar (Edge Function doğrular) |

G4 para tutmaz, non-custodial ilkesini bozmaz. Ajanların 7 günlük tahmini (`apps/agents` beyni) bugün zaten üretiliyor; niyete dönüşmesi küçük iş. FINAL-IDEA §13'teki "organizer ajanlar" vizyonuna doğrudan bağlanıyor. Talep toplamı bir SQL view'ı (`intent_demand`) olur.

### 6.3 Kayıt sistemi

| Tablo / view | İçerik | Kaynak | Doğrulama |
|---|---|---|---|
| `identities` | identity key, tür (provider, agent, human, guard, coordinator, maker), görünen ad, renk, bağlantılar, ilk/son görülme | profil: sahibinin imzalı beyanı (Edge Function); sunucu cüzdanları: `config/identities.json` + `GET /agents` (relay tohumlar) | `profile_sig` herkesçe doğrulanır; `verified` sütununu yalnız Edge Function/relay yazar |
| `provider_stats` (materialized view) | settle edilen havuz, teslim edilen kredi, gelir, son audit kararı | `pools` + `txs` üzerinden SQL | Sayılar zincirden yeniden hesaplanabilir. T-5'teki "zincir üstü itibar"ın temeli |
| `services` | koordinatör, guard, overlay, maker uç noktaları, ağ, sürüm, son sağlık | servisin kendi imzalı kaydı (Edge Function) | web `/healthz`'teki identity ile eşleştirir; eşleşmeyeni kullanmaz |
| `products` | `provider-api/products/*.json` aynası (birim, perakende, tokenId, demo fiyat etiketi) | `GET /v1/catalog` | tokenId zincirde |
| `pools`, `pledges`, `rounds` | terms, durum, zaman çizelgesi, katılımcılar, settlement txid, audit (`verdict`, `checks`), turlar ve kara liste nedenleri | overlay + koordinatör | `GET /pools/:id/audit` zincirden yeniden hesaplar |
| `txs` | T1–T11 tipi, ağ, havuz, aktörler, tutar, yükseklik, `stage`, WhatsOnChain linki | overlay + Arcade (+ istemcinin `created` kaydı) | txid zincirde. README ve STATUS'taki elle tutulan tx tablosu buradan üretilebilir |
| `agents`, `agent_decisions` | profil, mod (p2pkh/vault), vaultId, tasarruf, katıldığı havuzlar; karar akışı | ajanlar SSE | kararlar zaten kamuya açık SSE'de |
| `vaults` | owner, agent, guard, script, bakiye aynası, `verified` | overlay `vaults` | script kayıttan yeniden türetilir |
| `guard_decisions` | onay/ret, neden, tutar | guard SSE (zaten kimliksiz açık) | — |
| `events` | `CoopEvent` akışı (son 7 gün) | relay | — |
| `metrics_snapshots` | koordinatör `/metrics` anlık görüntüsü (`custodiedSats` dahil) | relay her saat | `/metrics` zincirden hesaplanıyor |
| `user_records` | şifreli: pledge talimatları, havuz nonce'ları, vault kayıtları (web `mine.ts` + `provider-cli/pools.json` + `participant-cli/pledges.json` aynı şemada) | kullanıcının tarayıcısı veya CLI'ı (ikisi de Desktop'a bağlı, ikisi de §7 ile oturum açabilir) | RLS: yalnız sahibi okur/yazar; içerik `wallet.encrypt` ile. Önce cüzdanın kendisinden geri kurmak denenir (ajanların `PoolParticipant.restore()` deseni); Supabase indeks ve yedektir |
| `handoffs` | owner-cli/web → guard vault devri (`vault.json` + fonlama tx'i) | sahibin imzalı belgesi (Edge Function) | guard zincirden doğrular; dosya taşıma gerekmez |
| `replays` (+ Storage) | meta + dosya yolu | kaydedici | txid'ler zincirde |
| Hazır view'lar | `leaderboard`, `village_savings`, `pool_timeline`, `listing_book` (kredi başına fiyata göre) | SQL | Bugün `store/history.ts`'te tarayıcıda hesaplananlar |

Politika içeriği (guard `/policies`) **aynalanmaz**; bugün de yalnızca sahip ve ajan BRC-103 ile okuyabiliyor. Web onu doğrudan guard'dan okumaya devam eder.

---

## 7. Kimlik akışı: BSV Desktop → Supabase Auth

Koordinatörün kanıtlı `hello`'su (B.P5a, `apps/coordinator/src/auth.ts`) ile aynı desen; doğrulama mantığı yeniden kullanılır.

1. Web açılışta `supabase.auth.signInAnonymously({ options: { captchaToken } })` ile anonim oturum alır. Cüzdansız ziyaretçi burada kalır (okuma + misafir presence).
2. Kullanıcı Desktop'a bağlanır (`WalletClient('auto')`), `getPublicKey({ identityKey: true })` ile identity key'i alır.
3. Web → Edge Function `bsv-auth` `POST /challenge` (oturum JWT'siyle) → `{ nonce }`. Nonce `auth_challenges` tablosunda kullanıcının `user_id`'sine bağlı, 60 sn ömürlü, tek kullanımlık.
4. Web, Desktop'a imzalatır: `createSignature({ data: utf8("agentcoop supabase\n" + origin + "\n" + nonce), protocolID: [1, 'agentcoop supabase'], keyID: '1', counterparty: 'anyone' })`. Desktop bu protokol için bir kez izin penceresi gösterir.
5. Web → `bsv-auth` `POST /prove { identityKey, nonce, sig }`. Fonksiyon imzayı doğrular, nonce'u yakar, `auth.admin.updateUserById(user_id, { app_metadata: { identity_key, kind } })` yazar. `app_metadata`'yı yalnız sunucu tarafı (secret key) değiştirebilir; kullanıcı kendisi değiştiremez.
6. Web `supabase.auth.refreshSession()` çağırır; yeni JWT'de `app_metadata.identity_key` var. RLS politikaları bunu okur:
   `(auth.jwt() -> 'app_metadata' ->> 'identity_key') = identity_key`.
7. Aynı identity key birden fazla cihazdaki anonim kullanıcılara bağlanabilir; her cihaz kendi kanıtını yapar.

CLI'lar (provider-cli, participant-cli) aynı akışı Node'da yapabilir; `user_records`'a erişmek için gerekir. Sunucu cüzdanlı ajanların oturuma ihtiyacı yok; onların verisini relay yazar.

Doğrulanacak nokta (F0 spike): `@bsv/sdk`'nın Deno Edge runtime'ında `npm:` belirteciyle çalışması. Çalışmazsa aynı iki uç relay'de (Node, `@bsv/sdk` zaten çalışıyor) açılır; akış değişmez, yalnız URL değişir.

---

## 8. Veri modeli taslağı

### 8.1 Tablolar (özet; `supabase/migrations/*.sql`)

```sql
-- canlı ayna + arşiv (relay yazar, herkes okur)
pools        (pool_id text pk, txid, provider_key, label, terms jsonb, status, pledged_credits int, target int,
              pledge_count int, deadline_height int, created_height int, settled_txid, audit jsonb,
              as_of_height int, updated_at timestamptz)
pledges      (outpoint text pk, pool_id fk, txid, participant_key, credits int, signer, mode, credit_lock,
              coin_sats bigint, height int, spent bool, spending_txid, valid bool, invalid_reason)
rounds       (pool_id, round int, outcome, signed int, total int, started_at, timeout_ms int,
              missing jsonb, blacklist jsonb, txid, primary key (pool_id, round))
listings     (outpoint text pk, token_id, credits int, ask_sats bigint, sats_per_credit numeric generated,
              seller_key, vault_locked bool, status, filled_txid)
vaults       (vault_id text pk, owner_key, agent_key, guard_key, script_hex, verified bool, balance_sats bigint, credits jsonb)
txs          (txid text pk, kind, network, pool_id, actors text[], sats bigint, stage, height int,
              created_by uuid, ts timestamptz)
events       (id text pk, ts, src, type, data jsonb, txid, pool_id, agent)
health       (service text pk, ok bool, last_seen timestamptz, height int, detail jsonb)
-- kayıt
identities   (identity_key text pk, kind, display_name, color, links jsonb, profile jsonb, profile_sig,
              verified bool, first_seen, last_seen)
services     (identity_key text pk, kind, url, network, version, sig, signed_at)
products     (product_id text pk, provider_key, label, unit, retail_sats_per_credit int, units_per_credit int,
              token_id, demo_pricing bool)
agents       (identity_key text pk, name, profile, mode, vault_id, savings_sats bigint)
agent_decisions (id text pk, agent_key, ts, action, pool_id, credits int, sats bigint, reason, brain)
guard_decisions (id text pk, agent_key, vault_id, kind, outcome, reason, sats bigint, ts)
metrics_snapshots (ts timestamptz pk, data jsonb)
replays      (name text pk, storage_path, recorded_at, network, txids text[])
-- kişisel ve imzalı beyanlar
user_records (id uuid pk, identity_key, kind, ciphertext text, created_at, updated_at)
inbox        (id uuid pk, identity_key, type, payload jsonb, read bool, ts)
handoffs     (vault_id text pk, owner_key, payload jsonb, sig, consumed_at)
intents      (id uuid pk, identity_key, product_id, credits int, max_sats_per_credit int, horizon_days int,
              sig, expires_at)                                                        -- G4, opsiyonel
auth_challenges (nonce text pk, user_id uuid, expires_at)                              -- yalnız Edge Function
```

### 8.2 Realtime kanalları

| Kanal | Tür | Yazan | Okuyan | Yük |
|---|---|---|---|---|
| `live` | Broadcast, herkese açık okuma | yalnız relay (REST broadcast ucu veya supabase-js, secret key) | tüm ziyaretçiler | `{ events: CoopEvent[] }`, saniyede en fazla bir paket, değişiklik yoksa hiç |
| `town:main` | Presence + Broadcast, private kanal | oturumlu istemciler (anonim dahil) | Kasaba'daki oyuncular | Presence: `{ name, color, kind }` (yalnız giriş/çıkış/ad değişiminde); Broadcast: `move { to: [x, y], t }` |
| `inbox` | Postgres Changes, `identity_key=eq.<key>` filtresi | relay (tabloya insert) | yalnız sahibi (RLS) | satır |

Private kanallar Realtime Authorization ile korunur: `realtime.messages` üzerinde RLS politikaları kimin hangi konuya (topic) katılıp yayınlayabileceğini belirler. `live`'a istemcinin yayın yapması yasak, yalnız dinler.

### 8.3 RLS ilkeleri (özet)

- **Kamu tabloları** (`pools`, `pledges`, `rounds`, `listings`, `vaults`, `txs`, `events`, `health`, `identities`, `services`, `products`, `agents`, `agent_decisions`, `guard_decisions`, `metrics_snapshots`, `replays`, view'lar): `select using (true)`. Yazma politikası yok; yalnız secret key (relay, Edge Function) yazar.
- **`user_records`**: select/insert/update/delete `using (identity_key = auth.jwt() -> 'app_metadata' ->> 'identity_key')`.
- **`txs`** istemci insert'i: yalnız `stage = 'created'`, `created_by = auth.uid()`, kimliği kanıtlanmış oturum. Sonraki aşamaları yalnız relay yazar.
- **`inbox`**: select kendi satırları; update yalnız `read` sütunu (sütun yetkisi: `grant update (read) on inbox to authenticated`).
- **İmzalı beyan tabloları** (`identities.profile`, `services`, `intents`, `handoffs`): istemciye doğrudan yazma yok; Edge Function `signed-write` imzayı doğrulayıp yazar.
- **`auth_challenges`**: istemciye kapalı.
- Politikalar yerel yığında (`supabase start`) vitest veya pgTAP (`supabase test db`) ile test edilir: mock-chain testleriyle yan yana, sats ve gerçek proje gerekmez.

---

## 9. Uçtan uca akışlar (sıralı)

Her akışta: **bugün** ne oluyor → **Supabase ile** ne ekleniyor. Para hareket ettiren adımlar değişmiyor.

### 9.0 Açılış (izleyici veya cüzdanlı kullanıcı)

1. Web açılır, `services` tablosundan uç noktaları okur (B10), `/healthz` identity eşleşmesini kontrol eder.
2. Anonim oturum (CAPTCHA'lı). Cüzdan bağlanırsa §7 ile kimlik kanıtlanır.
3. Tek seferlik anlık görüntü: `pools` (açık + son settle edilenler), `pledges`, `rounds`, `listings`, `health` → store `hydrate*` ile dolar → Kasaba ilk karede dolu (B1 kapanır).
4. `live` kanalına abone olunur; gelen paketler bus'a basılır.
5. Grafikler `metrics_snapshots` ve view'lardan geçmişle başlar (B4).
6. Sekme gizlenince (`visibilitychange`) Realtime aboneliği kapanır, görünür olunca anlık görüntü + yeniden abone: kota korunur (§13).
7. Relay'e veya Supabase'e ulaşılamıyorsa web bugünkü doğrudan adaptörlere düşer (rozet: "direct").

### 9.1 Sağlayıcı havuz açar (T1 mint, T2 pool)

1. Bugün: `provider-cli` veya web `/provider` → Desktop imzalar → overlay `submit` → koordinatöre `POST /offers` + `publishOffer` ile zincire. **Değişmez.**
2. Overlay SSE `admitted { txid }` → relay `lookup pool` → `pools` upsert, `txs` (T2), `identities` (sağlayıcı ilk görülme), `events` + `live` paketi `pool_opened`.
3. Tüm açık Kasabalar'da pano aynı anda dikilir. Sağlayıcının nonce'u (gelir keyID'si) `user_records`'a şifreli yazılır (B6, B12).
4. G4 açıksa: bu ürün için niyet bırakanların `inbox`'ına "havuz açıldı" düşer.

### 9.2 Pledge (T3)

1. Ajan: `buildPledge` → overlay `submit`. İnsan: web "Join" → Desktop → overlay `submit`. **Değişmez.**
2. Web, `submit`'ten hemen önce `txs` satırını `stage: created` olarak açar (G2); relay `admitted`'i görünce `admitted`, Arcade'den madenlenince `mined` yapar. İyimser sahte kaynaklı olay gerekmez (B7).
3. Relay: `pledges` upsert, `pools.pledged_credits`, `txs` (T3), `identities` (ilk görülme). Ajan SSE `agent_decision` → `agent_decisions` ve `live` paketi (balonlar).
4. İnsanın pledge talimatları `user_records`'a şifreli (B6). Başka cihazdan iptal mümkün olur.

### 9.3 Lock-in, imza turu, settlement (T5): kritik yol

1. Koordinatör pledge'ler hedefe ulaşınca planı kurar, `sign_request`'i **kanıtlı WS oturumlarına** gönderir. Her imzacı planı kendisi doğrular (`verifySettlementPlan` + `verifyLineage`). **Değişmez.** Supabase bu yolda değil, dolayısıyla Supabase'deki bir hata imzalanan şeyi etkileyemez.
2. Relay koordinatöre izleyici olarak bağlı (imzasız `hello`): `pool_update`, `settled`, `round_failed`, `pool_failed` alır; tur ilerlemesi için kilitlenme süresince `GET /pools/:id`'nin `coordinator { round, signed, total, blacklist }` alanını ~1 sn'de bir okur (veya koordinatöre izleyicilere `round_progress` yayını eklenir: seçici B). → `rounds` upsert + `live` paketi.
3. Relay, plandaki her katılımcı için `inbox`'a `sign_pending { poolId, round, deadline }` yazar. Sekmesi başka sayfadaysa web SignCenter'a yönlendirir; web push açıksa tarayıcı bildirimi (Database Webhook → Edge Function `push`).
   - Sınır: `sign_request` yalnızca o anda bağlı kanıtlı oturuma gider (bağlı olmayan katılımcıyı koordinatör "offline" sayar). Sekmesi kapalı insan bildirimle döndüğünde mevcut turu büyük ihtimalle kaçırır; en fazla sonraki turda (≤ 3 tur) yetişir. Çevrimdışı insanın gerçek çözümü lighthouse pledge'i (A-P5).
4. `settled { txid }` → relay: `pools.status = settled`, `settled_txid`, `GET /pools/:id/audit` → `pools.audit` (`consistent` bekleniyor), `txs` (T5), `provider_stats` yenilenir, `live` paketi → tüm Kasabalarda at arabası sahnesi.
5. `round_failed` → `rounds` sonuç + kara liste nedenleri; eksik imzacıların `inbox`'ına not.

### 9.4 Krediler: redeem ve 402 (T6, T7)

1. `AuthFetch` ile provider-api'ye doğrudan: redeem, iş, iade. **Değişmez.** Ön ödemeli bakiye provider-api'de kalır (T-6 sınırı), aynalanmaz.
2. Ajan SSE `agent_payment`, `agent_job` → relay → `events`, `txs` (T7), `agents.savings_sats`.
3. Opsiyonel: provider-api'ye `/v1/events` SSE eklenirse (plan §3.10'da düşük öncelikli) iş durumları da aynalanır; web'deki 800 ms iş poll'u kalkar.

### 9.5 Market (T8)

1. Satıcı `reserveListing` + `signListing` → koordinatöre `POST /listings` (esas defter koordinatör + zincir). **Değişmez.**
2. Relay `GET /listings`'i (ve overlay `list` kabulünü) izler → `listings` upsert. Web'deki 10 sn poll kalkar; `listing_book` view'ı kredi başına fiyata göre sıralı verir.
3. Alıcı listeleri Supabase'den görür ama `buildSweep`'ten önce listeyi ve BEEF'i koordinatör/overlay'den yeniden çeker; `buildSweep` soyu zaten zincirden doğrular (kırmızı çizgi 2).
4. Sweep madenlenince relay `listing_filled` olayını **gerçek txid ile** üretir (bugün web listenin kaybolmasından tahmin ediyor, `txid: ''`). Satıcının `inbox`'ına "satıldı".

### 9.6 Mandate Vault ve guard (T9, T10)

1. Sahip: guard `PUT /vaults` (BRC-103) → Desktop fonlar (T9) → politika `PUT`. **Değişmez.**
2. Overlay `vault` kabulü → relay `vaults` upsert, `txs` (T9). Web'deki vault başına sha256 + `vaultCredits` poll'u kalkar.
3. Guard SSE `cosign_approved`/`cosign_denied` → `guard_decisions`, `live` paketi (Kasaba bekçisi) ve **sahibin `inbox`'ı**: "ajanının şu isteği reddedildi: …". Prompt injection girişimi sahibe anında ulaşır.
4. Vault kaydı (script, record) sahibin `user_records`'ına şifreli; başka tarayıcıdan tek başına geri çekme çalışır (B6).
5. Bugün owner-cli fonlamadan sonra `data/vaults/<id>/fund-<txid>.json` yazıyor ve guard `adopt` bu dosyayı aynı diskte okuyor (B12). Sahip başka makinedeyse dosya elle taşınıyor. Supabase'le: sahip imzalı bir devir belgesi yazar (`handoffs`, Edge Function `signed-write` üzerinden; içerik zaten zincirde ve kamuya açık), guard/ajan tarafı onu okur ve **zincirden doğrulayarak** benimser. Guard'ın kendi durumu yine yerel kalır.

### 9.7 Coop Rail (T11)

Maker SSE → relay → `events` + `live` paketi. Düşük öncelik; canlı swap henüz yok.

### 9.8 Çok oyunculu Kasaba (P7)

Ücretsiz Realtime kotası konum akışına izin vermiyor: 20 oyuncu × 5 Hz × (1 gönderen + 19 alıcı) = saniyede 2.000 mesaj, sınır saniyede 100. Bu yüzden **konum değil hedef** gönderilir:

1. Oyuncu `town:main` kanalına katılır, Presence'a `{ name, color, kind }` koyar (yalnız giriş/çıkışta ve ad değişince; Presence ücretsiz planda saniyede 20 mesajla sınırlı).
2. Avatar bir yere yürümeye başladığında tek bir `move { to: [x, y], t }` yayınlanır. Diğer istemciler aynı çarpışma haritası üzerinde aynı A* yolunu (Kasaba'da NPC'ler için zaten var) kendileri hesaplayıp yürütür. WASD ile serbest yürüyüşte yön değiştikçe veya en fazla 3–4 sn'de bir hedef güncellenir.
3. Yeni katılan oyuncu son konumları Presence durumundan alır (`{ name, color, kind, at: [x, y] }`, yalnız durunca güncellenir).
4. İsim ve renk `identities`'ten (yoksa identity'den deterministik renk, misafire "Visitor #xyz"). Presence'taki ad istemcinin beyanıdır; kanıtlanmış kimlikler (oturum JWT'sinde `identity_key` olan) rozetle gösterilir, gerisi "doğrulanmamış". Kasaba kozmetik olduğu için risk düşük.
5. Kalabalık sınırı: ücretsiz planda 10 oyuncu (kota hesabı §13). Sınır aşılırsa yeni gelen izleyici olarak kalır (hareketler görünür, kendisi yürüyemez).

### 9.9 Profil ve kayıt

1. Kullanıcı görünen adını ve rengini seçer; web profili kanonik JSON yapıp Desktop'a imzalatır (`protocolID: [1, 'agentcoop profile']`) → Edge Function `signed-write` doğrular → `identities.profile`, `profile_sig`, `verified = true`.
2. Okuyan herkes imzayı kendisi de doğrulayabilir.
3. Sunucu kimlikleri (`config/identities.json`), ajanlar (`GET /agents`), servisler (`/healthz` identity'leri) relay tarafından tohumlanır.

### 9.10 (Opsiyonel ürün) Niyet defteri

1. Ajanın beyni haftalık tahmin üretince (bugün `decisions.log`'a yazıyor) imzalı niyet bırakır: `signed-write` → `intents`.
2. Sağlayıcı konsolu `intent_demand` view'ından ürün başına toplam talebi ve fiyat eğrisini görür, "bu talebe uygun havuz aç" der (havuz boyutu öneriyle dolu gelir).
3. Havuz açılınca niyet sahiplerinin `inbox`'ına bildirim; ajanlar kendi brain + `enforcePolicy` ile gerçek pledge'i verir. Niyet bağlayıcı değil, para hareket etmez. Süresi dolan niyetleri pg_cron siler.

---

## 10. Relay servisi

- **Yer:** `apps/relay` (Node ≥ 22, tsx, `@supabase/supabase-js`). `infra/run.mjs` onu üçüncü süreç olarak başlatır, yalnızca `SUPABASE_*` değişkenleri varsa. VPS'te loopback'ten okuduğu için overlay ve koordinatörün IP hız sınırlarına takılmaz (loopback muaf, `infra/README.md`).
- **Girdiler:** `OVERLAY_URL`, `COOP_API_URL`, `GUARD_URL`, `AGENTS_URL`, `MAKER_URL`, `PROVIDER_API_URL`; `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (gizli; `.env`'de, asla commit edilmez, asla loglanmaz).
- **Ortak kod:** web'in `events/types.ts` (`CoopEvent`, olay haritası) ve `derive.ts`'i paylaşılan bir pakete (`packages/events`) taşınır. Relay ve web aynı projeksiyonu kullanır; iki ayrı türetme kayması olmaz. (Track E ile koordinasyon gerekir.)
- **Yazma:** çok tabloya dokunan güncellemeler tek bir Postgres fonksiyonuyla (`rpc('apply_pool', …)`) atomik yapılır; böylece `pools.pledged_credits` ile `pledges` hiçbir an çelişmez.
- **Yayın:** relay yazdıktan sonra değişiklikleri biriktirir ve **saniyede en fazla bir** `live` paketi yayınlar (`{ events: [...] }`). Değişiklik yoksa yayın yok. Kota hesabının temeli bu (§13).
- **Olay id'leri:** relay her olaya kalıcı, kaynaktan bağımsız tekil id verir (`{src}:{txid|outpoint}:{type}`), `events.id` birincil anahtar olduğu için tekrar yazım zararsız. Sunucu sayaçlarının yeniden başlatmada sıfırlanması (B7) sorun olmaz.
- **Uzlaştırma:** 30–60 sn'de bir `GET /pools?pledges=1`, `GET /listings`, overlay `vaults` → tablolara upsert. Kaçan olaylar kendiliğinden düzelir. Her satırda `as_of_height`/`updated_at`.
- **Kaldığı yer:** SSE kaynakları için `Last-Event-ID` bir `relay_cursors` tablosunda.
- **Uçlar:** yalnız `GET /healthz` (giriş Edge Function'da). Edge runtime'da `@bsv/sdk` çalışmazsa `POST /auth/challenge` ve `/auth/prove` buraya taşınır (§7).
- **Arşivleme ve özet:** saatlik `metrics_snapshots`; `events`'in 7 günden eskisini ve süresi dolan satırları pg_cron temizler.

---

## 11. Web tarafında değişecekler

- Yeni taşıma seçeneği: `VITE_DATA_MODE=live` + `VITE_TRANSPORT=supabase|direct` (varsayılan `supabase`, düşüşte `direct`). Supabase adaptörü aynı `CoopEvent`'leri bus'a basar; store, Kasaba ve konsollar değişmez.
- Cüzdanlı akışlar (`wallet/flows/live.ts`) değişmez; yalnızca iyimser olaylar `txs.stage`'e, `mine.ts` şifreli `user_records`'a (localStorage önbellek olarak kalır) taşınır.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (kamuya açık, gizli değil; koruma RLS'te). supabase-js tembel yüklenir. CSP `connect-src`'e Supabase alan adı (`https://<ref>.supabase.co`, `wss://<ref>.supabase.co`) eklenir.
- Profil düzenleme, gelen kutusu rozeti, çok oyunculu Kasaba (Faz 7 planı zaten var; hedef tabanlı hareket §9.8).

---

## 12. Sıralı yol haritası

| Faz | İçerik | Kabul | Bağımlılık |
|---|---|---|---|
| **F0** Kurulum | Supabase projesi (Free, kart yok; bölge `eu-central-1` Frankfurt), anonim giriş + CAPTCHA açık; repo'da `supabase/` (`config.toml`, `migrations/`, `functions/`); Supabase CLI ile yerel yığın (`supabase start`, Docker); secret key `.env`'e, `.gitignore`'a `supabase/.temp`, `supabase/.env`; **spike:** `@bsv/sdk` Deno Edge runtime'ında imza doğruluyor mu | Yerel yığında RLS testleri vitest/pgTAP'te koşuyor; relay gerçek projeye yazabiliyor; spike sonucu STATUS'ta | — |
| **F1** Canlı ayna | `packages/events` (types + derive), şema migration'ları, `apps/relay` (SSE/WS/REST → tablolar, `live` paketi, uzlaştırma, kursörler), web Supabase adaptörü + `direct` düşüşü | İki tarayıcı: ajan pledge'i < 1 sn'de ikisinde görünür; soğuk açılışta Kasaba dolu; relay durdurulunca web `direct`'e düşer; mock e2e (mockchain + yerel Supabase) yeşil | F0 |
| **F2** Kimlik + presence + çok oyunculu | §7 (`bsv-auth` Edge Function), `town:main` Presence + hedef tabanlı Broadcast (P7), isim etiketleri, kanal yetkilendirmesi, oyuncu sınırı | İki makineden iki ziyaretçi birbirini görür (< 300 ms LAN); kimliksiz kişi kanıtlı rozet alamaz; 10 oyuncuda saniyede < 30 Realtime mesajı | F1 |
| **F3** Kayıt | `identities` (imzalı profil, `signed-write`), `services` (imzalı uç nokta → çalışma zamanı yapılandırması), `provider_stats`, `txs` (README/STATUS tablosu buradan), `metrics_snapshots`, `agent_decisions`, `guard_decisions`, view'lar | Sayfa yenilense de grafik geçmişi duruyor; explorer mainnet tx'lerini tablodan gösteriyor; sahte imzalı profil reddediliyor | F1 (F2 profil için) |
| **F4** Kişisel defter + gelen kutusu | `txs.stage` yaşam döngüsü, `user_records` (wallet.encrypt; web + provider-cli + participant-cli), `handoffs`, `inbox` + Postgres Changes (+ opsiyonel web push) | Başka tarayıcıdan vault geri çekme ve gelir senkronu çalışıyor; CLI'da açılan havuzun geliri web'den süpürülebiliyor; sahip guard reddini bildirim olarak görüyor; B7 tekilleştirme çakışması yok | F2 |
| **F5** Zamanlanmış işler + koruma | pg_cron (temizlik, `provider_stats` yenileme), Realtime kota izleme, gerekirse PostgREST poll'a düşüş | Kota uyarısı STATUS'ta; Realtime kotası dolsa da web 5 sn poll'la çalışıyor | F3 |
| **F6** (opsiyonel) Niyet defteri | G4: `intents`, `intent_demand` view, sağlayıcı talep paneli, havuz açılış bildirimi | Ajan niyet bırakır, sağlayıcı önerilen boyutla havuz açar, ajan bildirimle pledge verir (mockchain) | F3, F4 |

Sahiplik önerisi: relay + infra = B'nin alanı (VPS, Caddy, `infra/run.mjs`); web adaptörü, profil, P7 = E; `packages/events` ortak (E'nin `events/`'inden taşınır); şema ve Edge Functions yeni sahibine (B veya ayrı bir "F" track'i). Diğer track'lere yalnızca STATUS üzerinden istek gider.

---

## 13. Maliyet ve limitler (Free plan, kart yok)

| Kalem | Sınır | Not |
|---|---|---|
| Realtime eşzamanlı bağlantı | **200** | Firebase Spark'ın 100'ünden iyi |
| Realtime mesaj hızı | **saniyede 100** | Aşılınca bağlantılar kesilir; supabase-js hız düşünce yeniden bağlanır |
| Realtime mesaj kotası | **ayda 2 milyon, organizasyon geneli** | Her alıcı ayrı sayılır: 4 dinleyiciye bir broadcast = 5 mesaj; bir tablo değişikliği 5 dinleyiciye = 5 mesaj |
| Presence | saniyede 20 mesaj, nesne başına 10 anahtar | Presence yalnız giriş/çıkışta |
| Kanal | bağlantı başına 100 kanal, saniyede 100 katılım | Sorun değil |
| Postgres | 500 MB | Arşiv küçük; `events` 7 günle sınırlı |
| Storage | 1 GB | Replay dosyaları |
| Auth | 50.000 aylık aktif kullanıcı | Anonim kullanıcılar da sayılır; CAPTCHA şart |
| Edge Functions | 150 sn duvar saati, istek başına 2 sn CPU, 256 MB | Uzun abonelik olmaz; imza doğrulama rahat sığar |
| Egress | kaynaklar çelişkili (5 GB veya daha az) | F0'da panelden doğrula |
| Proje | hesap başına 2 aktif ücretsiz proje; **7 gün hareketsiz kalan proje duraklatılır** | Relay sürekli yazdığı sürece aktif kalır; demo öncesi kontrol |

**Kota hesabı (demo):**
- Canlı ayna: relay saniyede en fazla bir paket; 30 izleyici → hareketli dakikalarda saniyede ≤ 31 mesaj, sessizken ~0.
- Kasaba: 10 oyuncu, kişi başı 4 sn'de bir hedef → saniyede 2,5 yayın × (1 + 9) = 25 mesaj.
- Toplam ~56 mesaj/sn, sınırın altında. Bu hızda sürekli kullanımda 2 milyon mesaj ~10 saat yeter: demo günü için yeterli, uzun süre herkese açık yayın için yetmez.
- Önlemler: gizli sekme aboneliği kapatır, Kasaba çok oyunculu modu yalnız avatar modunda açılır, kota dolarsa web `live` yerine PostgREST'ten 5 sn'de bir anlık görüntü çeker (API istekleri Realtime kotasından sayılmaz).

Kesin rakamları F0'da resmi fiyat ve limit sayfalarından doğrula.

---

## 14. Riskler

| Risk | Önlem |
|---|---|
| Jüri "merkezi bir veritabanı eklemişler" der | Kırmızı çizgiler README'de açık: Supabase opsiyonel görünüm katmanı, her şey zincirden doğrulanabilir, protokol onsuz çalışıyor (relay kapalı demo); `custodiedSats: 0` aynı kalır |
| Ayna eski veya yanlış | Uzlaştırma döngüsü, `as_of_height`, imza ve sweep öncesi tazeleme; Supabase'deki veri asla imza kararı vermez |
| Secret key sızar veya RLS hatalı | Değer yok; profiller ve servis kayıtları imzalı; kişisel kayıtlar şifreli; secret key yalnız relay `.env`'i ve Edge Function secret'larında; RLS testleri yerel yığında CI'da; her tabloda RLS açık (varsayılan ret) |
| Servis kaydı zehirlenir (web sahte koordinatöre yönlenir) | Kayıt servis kimliğiyle imzalı; web `/healthz` identity'siyle eşleştirir. Sahte koordinatör yine çalamaz (T-1), en fazla turu bozar |
| Realtime kotası biter | Saniyede ≤ 1 toplu paket, hedef tabanlı Kasaba, gizli sekmede abonelik yok, PostgREST poll düşüşü |
| `@bsv/sdk` Deno'da çalışmaz | Giriş ve imzalı yazma uçları relay'de (Node) açılır |
| Ücretsiz proje 7 günde duraklar | Relay'in sürekli yazması; demo öncesi panel kontrolü |
| Anonim oturum kötüye kullanılır | CAPTCHA, Realtime kanal yetkilendirmesi, oyuncu sınırı |
| İki taşıma (supabase/direct) farklılaşır | Ortak `packages/events`; iki modda aynı e2e senaryosu |
| Zaman (teslim 31.10) | Yalnızca F1 + F2; geri kalanı teslimden sonra |

---

## 15. Açık kararlar

1. **Zaman ve kapsam:** teslime (bugün) yetişmesi gereken bir dilim mi (F1 + F2), yoksa teslim sonrası tam yol haritası mı?
2. **"Geçici defter"den kastın:** G1 canlı ayna mı, G2 tx yaşam döngüsü mü, G4 bağlayıcı olmayan niyet defteri gibi yeni bir ürün özelliği mi, hepsi mi?
3. **Sahiplik:** relay B'de ve web E'de mi, yoksa şema + Edge Functions + relay için ayrı bir track mı?
4. **Kasaba ölçeği:** ücretsiz planla 10 oyunculuk sınır kabul mü, yoksa demo günü Pro'ya geçiş düşünülür mü (kart gerektirir)?
5. **Gelen kutusu taşıması:** yalnız Supabase mi, yoksa BSV-yerel MessageBox'a da yazılsın mı (jüri için artı)?

---

### Kaynaklar (limitler)

- [Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Realtime Quotas](https://supabase.com/docs/guides/realtime/quotas)
- [Manage Realtime Messages usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)
- [Edge Functions limits](https://supabase.com/docs/guides/functions/limits)
- [JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase Free Plan 2026 (costbench)](https://costbench.com/software/database-as-service/supabase/free-plan/)
- [Supabase free tier limits 2026 (automationatlas)](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
