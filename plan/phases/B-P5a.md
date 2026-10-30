# B-P5a — Faz 5'in yerel kısmı: kenar politikası, hello kimlik kanıtı, sağlık, sunucu dosyaları, katılım kılavuzu

> Track B. `plan/track-B-overlay-coordinator.md` Faz 5. Kullanıcı kararı (30.10 ~17:57, P6a'da verildi; 30.10 akşamı yinelendi): başka track'e bağlı olmayan kısım S3'ü beklemeden yapılır. VPS, alan adı ve dışarıdan mainnet kanıtı (5.1'in kurulumu, 5.2'nin DNS'i, 5.7) D'nin hesapları ve sats'ı gelince yapılır.
> Yazıldı: 30.10 akşam. `git pull` yapıldı, STATUS okundu (yeni gelen: kök `CLAUDE.md`; Blokajlar'da B → C `sync-revenue` notu duruyor).

## 1. Neden şimdi

İki şey yerelde yapılabilir ve VPS'ten bağımsız:
1. **Güvenlik açığı:** bugün `hello { identity }` hiçbir kanıt istemiyor. Herhangi biri kurbanın identity'siyle bağlanıp kurbanın girdisi için `sign_reject` gönderebilir; koordinatör kurbanı kara listeye alır (sansür/griefing). Herkese açık yayından önce kapanmalı.
2. Sunucuya kurulum dosyaları (Caddy, systemd, yedek) ve hız sınırları, VPS geldiği anda 30 dakikada yayına çıkmayı sağlar.

## 2. `hello` kimlik kanıtı (5.4) — MASTER §3.5 değişikliği (C'yi etkiler)

- Bağlantı açılınca koordinatör: `challenge { nonce }` (32 bayt hex, bağlantıya özel).
- Katılımcı: `hello { identity, poolIds[], sig }`.
  `sig` = `wallet.createSignature({ data: utf8("agentcoop hello\n" + host + "\n" + nonce), protocolID: [1, 'agentcoop hello'], keyID: '1', counterparty: 'anyone' })` (DER hex).
  `host` = katılımcının bağlandığı WS URL'sinin host'u (`coop.example.org`, `localhost:8090`). Koordinatör kendi gördüğü `Host` başlığıyla doğrular; bu, sahte bir koordinatörün nonce'u gerçeğine aktarmasını (relay) engeller.
- Doğrulama: `new ProtoWallet('anyone').verifySignature({ data, signature, protocolID, keyID, counterparty: identity })` (overlay'in vault sahipliği kontrolüyle aynı `'anyone'` türetmesi; BRC-100 cüzdanı kök kimlik anahtarıyla imzalamaz, türetilmiş anahtarla imzalar).
- `sig` olmadan `hello` (ya da `identity` olmadan) **izleyici** oturumu açar: `pool_update` alır, `sign_request` almaz; `sign_response`/`sign_reject` kabul edilmez. `hello_ack { identity, poolIds, proven }`.
- `sign_request` yalnızca kanıtlı oturumlara gider.
- İstemci yardımcısı C için: `apps/coordinator/src/client.ts` → `connectCoordinator(url, wallet, { poolIds })` (`@agentcoop/coordinator/client`). Challenge'ı bekler, imzalar, `hello_ack`'i bekler.
- Seviye 1 protokol: Desktop kullanıcısına uygulama başına bir kez sorar; anahtar değer kontrol etmiyor, yalnızca kimlik kanıtı.

## 3. Kenar politikası (5.3, 5.4)

**Koordinatör** (`apps/coordinator/src/limits.ts` paylaşılan sınırlayıcı, `packages/overlay/src/limits.ts`'te; ek bağımlılık yok):
- `trust proxy` = `loopback` (Caddy arkasında `X-Forwarded-For` güvenilir; doğrudan yerel istekler loopback).
- IP başına sabit pencere: GET 120/dk, POST 10/dk (env `RATE_GET_PER_MIN`, `RATE_POST_PER_MIN`; `RATE_LIMIT=off` kapatır). Loopback muaf (aynı makinedeki ajan/koordinatör). Aşımda `429 { code: 'RATE_LIMITED' }` + `Retry-After`.
- CORS: herkese açık (`*`), GET/POST/OPTIONS; POST'lar zaten imza ve harcanmamışlık doğruluyor. Gövde 1 MB (var).
- WS: IP başına en çok 20 bağlantı, toplam 1000; bağlantı başına 10 sn'de en çok 40 mesaj, aşan bağlantı `1008` ile kapanır; mesaj ≤ 256 kB (var).

**Overlay:**
- `configureEdgePolicy({ jsonBodyLimitBytes: 1 MB, binaryBodyLimitBytes: 10 MB })` (settlement BEEF'leri için 10 MB; 100 katılımcı ≈ 40 kB tx + atalar).
- IP başına: `/lookup` 60/dk, `/submit` 30/dk; loopback muaf (koordinatör aynı makinede). Env `OVERLAY_RATE_LOOKUP_PER_MIN`, `OVERLAY_RATE_SUBMIT_PER_MIN`, `RATE_LIMIT=off`.
- overlay-express'in CORS'u varsayılan herkese açık; değişmiyor.

## 4. Sağlık (5.5)

- Koordinatör `GET /healthz`: `{ ok, overlay, height, arcade, engine, openPools, ws: { clients, proven }, uptimeS }`. `ok` = overlay erişilebilir.
- Overlay `GET /agentcoop/healthz` (overlay-express'in `/healthz`'i kalır): `{ ok, db, lastEventAt, sseClients, uptimeS }`; `db` = lookup tablosuna bir `select 1`.
- Loglar zaten JSON satırı (koordinatör). UptimeRobot iki URL'yi izler (kurulum infra/README'de).

## 5. Sunucu dosyaları (5.1, 5.2) — `infra/`

- `Caddyfile`: `{$OVERLAY_HOST}` → :8080, `{$COOP_HOST}` → :8090 (WS dahil), otomatik HTTPS; alan adı yoksa `<ip>.sslip.io`.
- `agentcoop.service` (systemd): `node infra/run.mjs`, `DATA_DIR=/var/lib/agentcoop`, `EnvironmentFile=/etc/agentcoop.env` (600).
- `backup.mjs`: better-sqlite3 `.backup()` ile çevrim içi tutarlı kopya (`overlay.db`, `coordinator.db`) + `overlay.key`; 7 gün saklar. Cron satırı README'de. Geri yükleme adımları README'de; yerelde bir kez denenir.
- `setup-vps.sh`: Ubuntu'ya Node 22, Caddy, `agentcoop` kullanıcısı, dizinler, servis. (VPS gelince çalıştırılır.)
- `agentcoop.env.example`: sunucu env'i (kökteki `.env.example` D'nin; ona dokunulmaz, D'ye STATUS'ta not).

## 6. Katılım kılavuzu (5.6)

`apps/coordinator/README.md` → "Kendi ajanınla katıl": URL'ler (VPS gelince doldurulur; şimdilik `localhost`), curl ile `GET /pools`, overlay lookup, WS protokolü (challenge → hello+sig), `connectCoordinator` + A'nın `buildPledge` / `verifySettlementPlan` / `signSettlementInput` ile ~15 satırlık ajan.

## 7. Testler

`apps/coordinator/test/e2e.public-edge.mockchain.test.ts`:
1. Kanıtlı `hello` → `proven: true`; kanıtsız → `proven: false`, `sign_request` almaz.
2. **Saldırı:** kurbanın identity'siyle kanıtsız bağlanan saldırgan `sign_reject` gönderir → reddedilir, kurban imzalar, havuz settle olur.
3. Bozuk imza, başka host'a verilmiş imza ve başka bağlantının nonce'u reddedilir.
4. HTTP hız sınırı: `X-Forwarded-For` ile dış IP → 11. POST'ta 429; loopback muaf.
5. CORS: `Origin` başlıklı GET'te `Access-Control-Allow-Origin: *`, OPTIONS 204.
6. WS mesaj seli → bağlantı 1008 ile kapanır.
7. Overlay: `/agentcoop/healthz` `ok`; `/lookup` dış IP'den 61. istekte 429; 10 MB üstü gövde reddedilir.
Mevcut botlar (`agentBot.ts`, `participant.ts`, `e2e.pools`) `connectCoordinator`'a geçer.

## 8. Kabul

Testler yeşil; kök `npm test` ve `npm run typecheck` temiz; `node infra/run.mjs` ile iki servis tsx altında kalkıyor, `/healthz` ve `/agentcoop/healthz` cevap veriyor; yedekle → sil → geri yükle yerelde denendi; MASTER §3.5 (hello) ve §3.8 (overlay healthz) güncel; STATUS'ta C'ye arayüz notu.
