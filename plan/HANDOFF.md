# HANDOFF — 31.10 oturumu: Supabase canlı katmanı + denetim (audit) hazırlığı

> **Yeni oturum için:** önce bu dosyayı, sonra `plan/STATUS.md`'yi oku (CLAUDE.md kuralı). Açık işlerin takip listesi: **[`plan/BACKLOG.md`](BACKLOG.md)** (BL-01…). Bu dosya, 31.10 gecesi tek bir Claude oturumunda yapılanların ve **hiçbir başka belgede olmayan** bilgilerin dökümüdür. Güvenlik tarafına bakacak kişi doğrudan **§2**'ye gitsin.
>
> Yazılış: 31.10.2026 ~08:00, F-10 düzeltmesi ve doğrulama 4 sonrası güncellendi. Son commit'ler `main`'de.

## 0. İçindekiler

1. Ne yapıldı, nerede (özet)
2. **Güvenlik: yapılanlar, kalanlar, nasıl tekrar edilir**
3. Denetim ödülü (TUM Blockchain Club × Adevar Labs)
4. Supabase canlı katmanı: kurulum, anahtarlar, kararlar, ertelenenler
5. Proje hakkında sohbette netleşen bilgiler
6. Yeni bilgisayarda kurulum
7. Kararı bekleyen konular
8. Bu oturumun kuralları ve tercihleri

---

## 1. Ne yapıldı, nerede

| İş | Belge / kod | Commit'ler |
|---|---|---|
| Supabase akış raporu (Firebase kart istediği için Supabase'e geçildi) | `plan/SUPABASE-FLOW.md` | — |
| Supabase demo MVP planı ve uygulaması (relay, web taşıması, çok oyunculu Kasaba) | `plan/phases/SUPABASE-MVP.md`, `apps/relay/`, `apps/web/src/events/adapters/supabase*.ts`, `apps/web/src/api/supabase*.ts`, `apps/web/src/town/{peers,multiplayer}.ts`, `supabase/` | `d942788` ve öncesi |
| Supabase katmanının bağımsız incelemesi: 1 kritik + 9 önemli düzeltme | — | `cffaaee`, `404a164`, `78bfb0e`, `cc02f38` |
| Denetim hazırlık paketi | `plan/phases/AUDIT-PRIZE.md` (plan), `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md`, `docs/ROADMAP.md`, `SECURITY.md`, `LICENSE`, `.github/workflows/ci.yml`, `scripts/check-docs.mjs` | `86bc2fc` … `ad04620` |
| Yeni testler (yalnızca test, ürün kodu değişmedi) | `apps/maker/test/htlc.boundaries.evm.test.ts`, `test/provider.return-vault.test.ts` | `360dde7`, `27c0eab` |
| Prova betiği (mock chain + yerel Supabase + 2 tarayıcı) | `scripts/rehearsal-supabase.ts` | `6539b56` |
| **F-10 düzeltmesi + doğrulama 4 (mainnet)**: repo sahibinin oturumu ("B oturumu"), bu oturumla paralel | `apps/provider-api/src/redeem.ts`, `test/provider.return-vault.test.ts` (artık `it`, 3/3), belgeler | `740f893` |

Test durumu (31.10): kök `npm test` 86 dosya geçti / 4 atlandı (CI ve yerel aynı); web 101 test; Playwright e2e 8/8; typecheck temiz; `npm run check:docs` 198 yol, 15 link, 83 test adı.

---

## 2. Güvenlik: yapılanlar, kalanlar

### 2.1 Yapılanlar

- **Denetim paketi** `docs/AUDIT-READINESS.md`:
  - değer akışı ve güven sınırları;
  - öncelikli kapsam (dosya yolları ve satır sayılarıyla);
  - 16 değişmez (her biri zorlandığı kod ve testiyle);
  - kendi bulgularımız F-1…F-11;
  - bağımlılık ve sır taraması, mainnet kanıtı, denetçiye sorular.
- **`docs/THREAT-MODEL.md`:**
  - Mainnet sütunu txid'lerle dolduruldu (✅ kontrol mainnet'te çalıştı / ◐ akış çalıştı, saldırı yolu yalnızca mock chain'de / ☐).
  - **T-10 yeniden açıldı (F-10)**; F-10 sonra düzeltildi (`740f893`), T-10 yeniden kapalı.
  - Yeni T-22 (canlı ayna, Supabase), T-23 (Coop Rail zamanlama ve zincirler arası varsayımlar).
- **`SECURITY.md`:** bildirim yolu, kapsam, test kuralları, anahtar politikası. `LICENSE`: MIT.
- **CI** `.github/workflows/ci.yml`:
  - adımlar: typecheck (kök + web), `npm test`, `npm run check:docs`, `npm audit --omit=dev` (yalnızca rapor);
  - **hiçbir secret'a referans vermez**, `permissions: contents: read`; actions v7 (Node 24).
- **`scripts/check-docs.mjs`** (`npm run check:docs`): güvenlik belgelerinde geçen her dosya yolunu, `dosya:satır` referansını, göreli linki ve `` `x.test.ts` › "ad" `` biçimindeki her test adını kontrol eder.
  - `npm test`'e **bilerek dahil değil**: başka bir track test adı değiştirince onun paketi kırmızı olmasın diye. CI'da ayrı adım.
  - Sınırları: test adını alt dize olarak arar; atlanan (`skipIf`) testleri fark etmez.
- **HTLC sınır testleri** (`apps/maker/test/htlc.boundaries.evm.test.ts`, 6 test). Mutasyon testiyle doğrulandı: kontratın 5 bozuk kopyasının 5'ini de yakaladı (yöntem §2.4'te).
- **F-10 bulundu, tekrarlandı ve düzeltildi.** Bu oturum `it.fails` testiyle tekrarladı (`27c0eab`); repo sahibinin oturumu düzeltti (`740f893`):
  - `returnCredits` kasayı debit'ten önce okuyor; iade başarısız olursa kasa eşlemesini de geri yazıyor.
  - İlk kasadan bakiye varken ikinci kasadan redeem `409 ERR_OTHER_VAULT` alıyor.
  - Test artık normal `it` (3/3). THREAT-MODEL T-10, AUDIT F-10/I-9, README ve ROADMAP güncel.
  - Kalan risk (AUDIT F-10): bir kasa kaydı adını verdiği ajanın onayını gerektirmiyor, ama ondan yalnızca o ajan (kimliği doğrulanmış çağıran) redeem edebiliyor.
- **`apps/web/src/proof/mainnet.ts`:** 7 yanlış etiket düzeltildi. S1 ve ajan txid'leri "BSV Desktop" değil "server wallet"; `5b5e452c…` kasa fonlaması ve BSV Desktop'tan yapıldı.
- **İki bağımsız inceleme yapıldı** (ikisi de dış denetim değil, ayrı reviewer oturumları):
  - Supabase katmanı: 1 kritik bulgu (pledge'in ücret script'i mirror'dan okunuyordu), düzeltildi.
  - Denetim belgeleri: 2 kritik, 5 önemli ve 18 küçük bulgu; hepsi belgelere işlendi. Kod gerektirenlerden F-10 düzeltildi (`740f893`); F-11 de düzeltildi (31.10, `OP_SIZE <32>`, `test/rail.htlc-preimage.test.ts`).

### 2.2 Kalanlar (öncelik sırasıyla)

| # | İş | Neden önemli | Kim / nasıl |
|---|---|---|---|
| 1 | ~~F-10~~ **düzeltildi** (`740f893`, §2.1) | — | — |
| 2 | ✅ **silindi (31.10, repo sahibinin oturumu):** 7 `WALLET_*` secret'ı kalmadı (`gh secret list`). Eski açıklama: **Herkese açık repodaki `WALLET_*` GitHub Actions secret'larını sil** (mainnet cüzdan özel anahtarları, bu oturumdan önce birisi yüklemiş) | Repo PUBLIC (`kagancoplu/ProfessionarLARPERs`). Bir secret'ı yalnızca ona referans veren bir workflow okuyabilir; fork PR'ları secret almaz. Ama push yetkisi olan herkes onu okuyan bir workflow yazabilir. Hiçbir workflow kullanmıyor | Admin yetkisi gerekir (repo sahibi). Anahtarlar `.env`'de duruyor; silmek onları yok etmez |
| 3 | **GitHub "Private vulnerability reporting"i aç** | `SECURITY.md` ana kanal olarak bunu gösteriyor; şu an kapalı (`{"enabled":false}`). Bu oturumun hesabı (`kheif`) admin değil, `PUT` 404 döndü | Repo sahibi: Settings → Security → Private vulnerability reporting. Açılınca `SECURITY.md`'deki "when it is available" ifadesini sadeleştir |
| 4 | ✅ **F-11 düzeltildi (31.10)**: claim dalı `OP_SIZE <32> OP_EQUALVERIFY` ile başlıyor; `test/rail.htlc-preimage.test.ts`. Eski açıklama: (Coop Rail canlıya çıkmadan önce, High). BSV HTLC claim dalı ön görüntünün uzunluğunu kontrol etmiyor (`packages/core/src/scripts/htlc.ts:22`), Base kontratı yalnızca `bytes32` kabul ediyor, secret'ı ajan seçiyor (`apps/maker/src/swap.ts:78`). Ajan uzun bir secret seçerse BSV'yi alır; maker USDC'yi hiç alamaz, ajan da timeout'tan sonra USDC'yi geri çeker | Rail canlıda değil, PoC ve tavanlı; şu an risk yok | Düzeltme: `OP_SIZE <32> OP_EQUALVERIFY`, `OP_SHA256`'dan önce. Track D/A. `docs/ROADMAP.md` kapı 3 |
| 5 | ✅ **kodda (31.10):** F-1 (gelen bakiye ölçülüyor), F-2 (`_call` safe-transfer), F-4 (iade watchdog'u `apps/maker/src/watchdog.ts`, `minBaseTimeLeftS`, ajanın claim penceresi); ayrıntı AUDIT §6. Kalan: Base Sepolia deploy, canlı koşu. Eski açıklama: **Coop Rail'in geri kalanı:** F-1 (ücret kesen token'da kilitler arası taşma), F-2 (`bool` döndürmeyen token'lar, USDC kara listesi), F-4 (yükseklik ile saniye karışık; iadeyi otomatik yayınlayan bir watchdog yok, `apps/maker/src/swap-demo.ts` iadeyi elle yayın için kaydediyor) | Rail canlıya çıkmadan önce | `docs/AUDIT-READINESS.md` §6, `docs/ROADMAP.md` kapı 3 |
| 6 | **Mainnet doğrulamaları 3 ve 6**, T8 (market sweep), T11/T11b (Rail) mainnet'te. **Doğrulama 4 geçti** (31.10 07:32, [2f72e8b4…](https://whatsonchain.com/tx/2f72e8b489bcf3ebae7ce7b4ce0d5bc97202eade0272e59e18135d3dd851c146)). Bulgu: Arcade, tip = nLockTime iken de reddetti, bir sonraki blokta kabul edilir; Rail iadesi kilitten en az bir blok sonra gönderilmeli (T-23) | T-15 ve T-23 bunlara bağlı | Sats ve BSV Desktop gerekiyor (STATUS "Doğrulama testleri") |
| 7 | ✅ **düzeltildi (31.10):** `publicDetail` + `acceptMove`, AUDIT F-8. Eski açıklama: **F-8:** `live_health.detail` servis hata metnini (iç URL'ler dahil) anonim okuyuculara açıyor; Kasaba `move` yayınları doğrulanmıyor | Bilgi sızıntısı, para yok | `apps/relay/src/sources.ts:56` (probe), `apps/web/src/town/multiplayer.ts:76` |
| 8 | ✅ **üretimde 0 (31.10):** kök `zod` 4.6.7, `overrides.tmp` 0.2.7; CI'da `--audit-level=high`. `jimp` altındaki 30 uyarı dev, kabul edildi (AUDIT §7). Eski açıklama: **Bağımlılık uyarıları:** üretimde 3 high: `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5; `@anthropic-ai/sdk` ve `viem` üzerinden), `tmp` (GHSA-7c78-jf6q-g5cm; `solc` üzerinden, yalnızca derleme zamanı). Tüm ağaçta ek 29 high, hepsi `jimp` → `free-tex-packer-core` (web sprite aracı, devDependency) | Sürüm yükseltmek davranış değiştirebilir; bu oturumda dokunulmadı | Derin triage yapılmadı |
| 9 | ✅ **yapıldı (31.10):** `npm run mutate`, 49/49 (verify.ts 33, script şablonları 7, HTLC 9), CI'da; AUDIT §4. Eski açıklama: **Mutasyon testi yalnızca HTLC'de yapıldı.** `packages/core/src/pool/verify.ts` ve script şablonları için yapılmadı. I-2'deki "para üstü (change) kontrolü"nün özel bir kurcalama testi yok (`verify.ts:102-104` kontrol ediyor ama test etmiyor) | Denetçi bunları soracak | `docs/ROADMAP.md` kapı 6 |
| 10 | ✅ **koşuldu (31.10):** Slither 0.11.6, 6 sonuç triage edildi, CI'da `--fail-high` (AUDIT §7). Eski açıklama: **Slither / statik analiz çalıştırılmadı** (makinede kurulu değildi) | Solidity için standart sinyal | `python3 -m pip install slither-analyzer solc-select && solc-select install 0.8.37 && solc-select use 0.8.37 && slither contracts/base-htlc/HTLC.sol` |
| 11 | ✅ **kapandı (31.10):** `FileReplayStore` (`data/provider/replay/`), THREAT-MODEL T-17. Eski açıklama: **T-17:** 402 replay store paylaşımlı değil (`apps/provider-api/src/server.ts` `replayStore` geçmiyor; middleware süreç içi varsayılanı kullanıyor) | Birden fazla provider süreci çalışırsa replay mümkün | Tek süreçte sorun yok; ölçeklemeden önce |
| 12 | ✅ **CI'da (31.10, `b9c2202` yeşil):** `supabase-rls` job, yeni test "T-22: on every table anon can neither insert, update nor delete". Eski açıklama: `apps/relay/test/schema.local.test.ts` (RLS: anon yazamaz) CI'da koşmuyor; yalnızca yerel Supabase ile çalışıyor | T-22'nin RLS kanıtı CI'da değil | Barındırılan projede elle smoke test yapıldı: anon insert reddedildi |
| 13 | **Bilerek kabul edilen sınırlı riskler** (belgelenmiş, kod gerekmiyor): T-5 (sağlayıcı hizmet vermeyebilir), T-6 (≤ 20 kredi zincir dışı bakiye, kredi token'ı başına), T-12 (ajan + guard birlikte ele geçirilirse kasa bakiyesi kadar), T-13 (BRC-100 hash imzalama), F-5 (guard kotayı imza anında sayar), F-9 (koordinatörün seçimi tespit edilir, engellenmez) | — | — |

### 2.3 Gözlemler (bir belgeye girmemiş)

- `WALLET_COORDINATOR_KEY` `.env.example`'da var ve koordinatöre 5.000 sat gönderilmiş, ama **koordinatör servisi hiçbir anahtar yüklemiyor** (`apps/coordinator/src`'de cüzdan yok). Planda (`plan/00-MASTER-PLAN.md` §6.1) "yalnızca kimlik + yayın" diye geçiyor. Belgelerdeki "koordinatörün anahtarı yok" iddiası doğru; yuva kullanılmıyor.
- Provider, redeem kontrol 4 (krediyi kim gönderdi) ve kasa kayıtları için overlay'e güveniyor (`redeem.ts:145-147`, `:196-198`). Katılımcılar ve guard güvenmiyor. AUDIT §2 ve §5'e işlendi.
- Mirror, provider'ın gelir taramasının (`syncRevenue`/`sweepRevenue`, `apps/web/src/wallet/flows/live.ts:281-312`) havuz listesini besliyor. Yanlış veri taramayı başarısız kılar, parayı başka yere göndermez.
- ~~`pledge_added` reducer'ı, koordinatörün zaten saydığı krediyi bir kez daha ekliyor~~ **düzeltildi (31.10, BL-31):** reducer artık koordinatörün sayısıyla listedeki duran pledge'lerin büyüğünü alıyor, iptalde bir kez çıkarıyor; iki sıra da testli (`apps/web/test/reducers.test.ts`).

### 2.4 Kontrolleri nasıl tekrar edersin

```bash
# belgelerdeki kanıt
npm run check:docs
node scripts/check-docs.mjs README.md          # README'yi de kontrol etmek için

# git geçmişinde sızmış anahtar (gerçek değer basmaz; yalnızca sayar)
git log --all -p --no-color > /tmp/h.patch
for p in 'sb_secret_[A-Za-z0-9_-]{10,}' '(KEY|SECRET)[A-Z_]*[=:] *["'"'"']?[0-9a-f]{64}' 'BEGIN [A-Z ]*PRIVATE KEY' 'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}'; do
  printf '%s: ' "$p"; /usr/bin/grep -E '^\+' /tmp/h.patch | /usr/bin/grep -cE "$p"; done
# beklenen: yalnızca 1 sb_secret_ (apps/relay/test/config.test.ts'deki sahte değer). macOS'ta `grep` ugrep'e alias'lı olabilir: /usr/bin/grep kullan.

# bağımlılıklar
npm audit --omit=dev     # runtime
npm audit                # tüm ağaç

# HTLC mutasyon testi: kontratı geçici boz, yeniden derle, testi koş, GERİ YÜKLE
cp contracts/base-htlc/HTLC.sol /tmp/HTLC.sol.bak && cp contracts/base-htlc/artifacts.json /tmp/artifacts.json.bak
perl -0pi -e 's/block\.timestamp < l\.timeout/block.timestamp <= l.timeout/' contracts/base-htlc/HTLC.sol
npm run compile -w @agentcoop/maker            # artifacts.json'u yeniden üretir
npx vitest run apps/maker/test/htlc.boundaries.evm.test.ts   # en az bir test KIRMIZI olmalı
cp /tmp/HTLC.sol.bak contracts/base-htlc/HTLC.sol && cp /tmp/artifacts.json.bak contracts/base-htlc/artifacts.json
git diff --quiet contracts/ && echo restored
# denenen 5 mutant: claim `<`→`<=`, refund `>=`→`>`, "lock exists" kontrolü yok, claim çağırana öder, "zero amount" kontrolü yok
```

---

## 3. Denetim ödülü (Devfolio sayfasından)

- **Organizatör:** TUM Blockchain Club (tum-blockchain.com). **Ödülü veren:** Adevar Labs (adevarlabs.com). Toplam **$16.000 denetim kredisi**; para değil, güvenlik denetimi hizmeti. Ödülden itibaren 1 yıl geçerli.
  - 1.: $10.000, tam denetim;
  - 2.: $4.000, "Pre-Audit Core";
  - 3.: $2.000, "Pre-Audit Express".
- **Seçim:** Devfolio'ya gönderilen **her proje otomatik değerlendirilir**; ayrıca seçilmez ve 3 partner track'ten birini harcamaz. TUM Blockchain Club hakemleri "the three most serious projects of the hackathon: the ones that most deserve a security audit to keep building" seçer.
- **Bizim stratejimiz:** denetime hazır, kanıtı doğrulanabilir (CI + `check:docs`) ve açıklarını dürüstçe yazan bir proje görünümü. Sunumda `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md` ve `docs/ROADMAP.md`'nin "How we would use audit credits" bölümünü öne çıkarın. F-10'u kendimizin bulup yazmış olması da artı.
- Ön koşul: projenin **Devfolio'ya gönderilmiş** olması.

---

## 4. Supabase canlı katmanı

### 4.1 Mimari (kısa)

- **Kural:** Supabase yalnızca **görüntüleme katmanı**. İmza ya da ödeme yolunda değil; protokol onsuz çalışır.
  - Zincir ve overlay doğruluk kaynağı.
  - Güvenlik açısından kritik depolar (guard ledger'ı, provider bakiyeleri, replay store'ları) yerelde kalıyor.
- **Relay** (`apps/relay`): tek bir Node süreci.
  - Overlay, koordinatör, guard, ajanlar ve maker'ın SSE/WS/REST akışlarını Postgres tablolarına yazar: `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health`, `coop_events`.
  - Saniyede en fazla bir `live_ticks` satırı yazar, ayrıca 15 sn'de bir heartbeat. Tick'ler 10 dk sonra silinir.
  - `npm run infra`, `.env`'de `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` varsa relay'i de başlatır (`infra/run.mjs`).
- **Web:** önce snapshot, sonra Postgres Changes ile tick'ler (mevcut derive/hydrate yolundan).
  - Doğrudan servislere döner: snapshot başarısız olursa ya da 5 sn'yi aşarsa, veya 45 sn tick gelmezse. Uyarı toast'ı: "Live mirror unavailable: reading the services directly".
  - Koordinatör WS'i ve cüzdan akışları her iki modda da doğrudan.
  - Pledge koşullarını **her zaman koordinatörden** okur (`cffaaee`).
- **Çok oyunculu Kasaba:** `?avatar=1`, kanal `town:main` (Presence + Broadcast).
  - Konum yerine hedef gönderir (en fazla 1,5 sn'de bir, ≥ 4 px).
  - En fazla 8 oyuncu; karar ilk presence sync'te ya da 1,5 sn zaman aşımında verilir.
  - Presence anahtarı `${identity|guest}:${tabId}`.
- **RLS:** tüm tablolar `anon`/`authenticated` için yalnızca `select`. Yazma yalnızca relay'deki secret key ile. Migration: `supabase/migrations/20261031120000_live_mirror.sql`.

### 4.2 Proje ve anahtarlar (değerler burada YOK, asla yazma)

- **Barındırılan proje:** ref `cwnqclojrnyixetjqqsv`, bölge eu-west-1 (plandaki Frankfurt değil; kullanıcı bunu açtı). Migration uygulandı (`supabase link` + `supabase db push`).
- **Değerlerin bulunduğu yerler:**
  - Bu makinenin kök `.env`'i: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - GitHub: `SUPABASE_SECRET_KEY` Actions **secret** (geri okunamaz; hiçbir workflow kullanmıyor). `SUPABASE_URL`, `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` repo **variable** (okunabilir: `gh variable list`).
- **Yeni makinede secret'ı almak:**
  - `supabase login`, sonra `supabase projects api-keys --project-ref cwnqclojrnyixetjqqsv --reveal -o json`. **`--reveal` olmadan secret maskeli gelir;** relay o zaman "Invalid API key" verir. Bu oturumda bu hata yaşandı.
  - Ya da Supabase panosu → Project Settings → API keys.
- **Web neden eski anon (JWT) anahtarını kullanıyor, yeni `sb_publishable_` değil:** yerel stack'te Postgres Changes abonesine `sb_publishable_` anahtarıyla değişiklik gelmedi, anon JWT ile geldi. Değişken adı da bu yüzden `VITE_SUPABASE_ANON_KEY`. Supabase eski anahtarları kaldırırsa yalnızca değişken değişir. Publishable key barındırılan projede hiç denenmedi.
- **`.env` notu:** kök `.env`'in 64–65. satırlarındaki npm çıktı satırları (`> …`) Supabase CLI'ın dosyayı okumasını bozuyordu. `# > …` yapılarak yoruma alındı; anahtarlara dokunulmadı. Yeni makinede `.env`'i kopyalarken aynı sorun çıkarsa aynısını yap.

### 4.3 Yerel stack ve testler

```bash
supabase start                     # Docker; bu makinede hâlâ açık olabilir: `supabase stop`
supabase db reset                  # migration'ları yerelde uygular
eval "$(supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"
SUPABASE_LOCAL_URL=$SB_API_URL SUPABASE_LOCAL_ANON_KEY=$SB_ANON_KEY SUPABASE_LOCAL_SECRET_KEY=$SB_SECRET_KEY npx vitest run apps/relay
# *.local.test.ts dosyaları bu değişkenler olmadan atlanır (CI'da da atlanır)
npx tsx --import @agentcoop/core/register-sdk scripts/rehearsal-supabase.ts   # uçtan uca prova, yalnızca YEREL stack (tabloları siler; uzak URL'yi reddeder)
```

Prova sonucu (31.10 07:55, repodaki betikle):
- İki tarayıcı da havuzu ve 2 pledge'i gördü: 28 kredi, koordinatörle aynı.
- Yenilemeden sonra durum doğru, toast tekrarı yok.
- **Gözlem:** yenilenen sayfanın akışında `pool_opened` ve `pledge_added` satırları yok; durum doğru, yalnızca akış eksik. Bunlar istemcide türetilen olaylar ve mirror geçmişine yazılmıyorlar.

**Ücretsiz plan limitleri:**
- Realtime: 200 eşzamanlı bağlantı, 100 mesaj/sn, ayda 2M mesaj (organizasyon geneli, **her alıcı ayrı sayılır**).
- Edge Function: 150 sn.
- PostgREST: istek başına `max_rows` 1000 (snapshot bu yüzden sayfalı okunuyor).

### 4.4 Supabase incelemesinden ertelenen küçük maddeler (31.10: #16 dışında hepsi kapandı ya da BL-20'ye taşındı)

1. Snapshot'taki havuz sırası anahtara göre; birden fazla açık havuz varsa pano tarayıcıdan tarayıcıya farklı olabilir. ✅ (31.10, BL-34)
2. Yalnızca geçmiş olayı içeren bir flush boş tick gönderip kota harcıyor. ✅ (31.10, BL-34)
3. `hello_ack` ve her hello'dan sonra gelen `pool_update` patlamaları geçmişe yazılıyor (gürültü). ✅ (31.10, BL-34)
4. Eksik ya da kesilmiş bir tick yüküne karşı koruma yok. ✅ (31.10, BL-34)
5. Flush sırasında gelen yenileme, değişmemiş veriyi bir kez daha yayınlıyor. ✅ (31.10, BL-34)
6. Eşzamanlı yenilemeler sıraya konmamış; kısa süre eski veri sahnelenebiliyor. ✅ (31.10, BL-34)
7. Supabase kesintisinde bekleyen olay listesi sınırsız büyüyor. ✅ (31.10, BL-34)
8. Relay'in SSE bağlantısında boşta kalma zaman aşımı yok; koordinatör izleyicisinin `close()`'u yeniden bağlanma zamanlayıcısını temizlemiyor. ✅ (31.10, BL-34)
9. "Sekmeyi çoğalt" sekme kimliğini (sessionStorage) kopyalıyor; iki sekme aynı oyuncu gibi görünüyor. ✅ (31.10, BL-34)
10. Kasaba `move` mesajları doğrulanmıyor (gönderen presence'ta mı, koordinatlar sayı mı) → F-8. ✅ (31.10, F-8)
11. Kanal hatasında doğrudan moda geçiş 45 sn sürüyor; gizli sekmeler abone kalıp kota harcıyor. ✅ (31.10, BL-34)
12. `live_health.detail` iç servis adreslerini herkese açık okutuyor → F-8. ✅ (31.10, F-8)
13. `updated_at` sütunu güncellemelerde değişmiyor. ✅ (31.10, BL-34)
14. Geri dönüşte yalnızca toast var, kalıcı bir taşıma (transport) göstergesi yok. ✅ (31.10, BL-34)
15. `SUPABASE_SECRET_KEY` GitHub'da duruyor ama hiçbir workflow kullanmıyor. → BL-20 (repo sahibinin kararı)
16. Publishable key barındırılan projede denenmedi. (açık: barındırılan projede elle denenmeli)
17. Flush sürerken `stop()`'un son flush'ı hiçbir şey yapmıyor. ✅ (31.10, BL-34)
18. Tick'ler akarken de heartbeat gönderiliyor. ✅ (31.10, BL-34)
19. `apps/web/package.json` açıklamasındaki ok karakteri bağımlılık düzenlemesinde yeniden kodlandı. ✅ (31.10, BL-34)

### 4.5 Supabase uygulamasında verilen kararlar (özet)

- Çalışma `main` üzerinde yapıldı, her görevden sonra push (CLAUDE.md).
- `apps/web/src/proof/mainnet.ts` eksikti ve build'i kırıyordu; README tx tablosundan üretildi (Task 0).
- Relay mantığı `apps/relay/src/relay.ts`'te ve bağımlılıkları dışarıdan alıyor (test için); `server.ts` yalnızca bağlıyor. Kaynaklar tek bir fabrikadan: `createSources`.
- Supabase istemcisi env'den bağımsız bir dosyada (`apps/web/src/api/supabaseLiveClient.ts`), böylece yerel stack'e karşı test ediliyor.
- Uzak oyuncular kendi kendine dolaşmıyor (`busy=true`) ve ilk görüldükleri konumda beliriyor.
- Kasaba bridge'ine `town.events.once('create', sync)` eklendi. Store sessizken Kasaba boş kalıyor ve avatar açılmıyordu (yarış durumu); bunu prova yakaladı.
- Task 4'te koordinatör mainnet verisiyle başlatılmadı; imza turu açıp pledge'leri kara listeye alabilirdi. Prova bu yüzden mock chain'de yapıldı.
- **Gerçek servislerle (mainnet) prova hiç yapılmadı.** Gereken: `npm run infra`, provider, guard, ajanlar; iki makinede `npm run web`, birinde `?avatar=1`.

---

## 5. Proje hakkında sohbette netleşen bilgiler

### 5.1 Çalıştırma

| Ne | Komut | Not |
|---|---|---|
| En kolay, sunum için | `npm run web:mock` → http://localhost:5173 | Servis, cüzdan, sats gerekmez. ~35 sn'lik senaryo döngüsü; transaction'lar sahte |
| Kayıt | `?replay=mock-demo` | `apps/web/public/replays/mock-demo.jsonl`; gerçek mainnet kaydı yok (`/_debug` → "record a replay") |
| Gerçek (mainnet) | `npm run infra` → `npm run agents` → `npm run web` | Gerçek sats harcar. İnsan pledge'i için BSV Desktop gerekir. `infra` kapalıyken web panoları boş kalır |
| Çok oyunculu | `?avatar=1` | Yalnızca Supabase taşımasıyla |

### 5.2 Gerçek ve simüle olanlar

- **Gerçek:** ödeme, kredi (BSV-21) ve settlement. Mainnet'te T1–T7, T5v, T5-L, T9, T10 var.
- **Simüle:** GPU ve proxy işi (`apps/provider-api/src/runner.ts`; sahte log ve sonuç hash'i).
- **Kredi takibi:**
  - Kredi, cüzdanda bir BSV-21 token; overlay doğrular. Koddaki tiplerde son kullanma alanı yok.
  - `/me` sayfası iki sayı gösteriyor: "credits in my wallet" ve "prepaid minutes at the provider" (4 sn'de bir yenilenir).
  - Kullanılmayan kredi `/v1/credits/return` ile token olarak geri alınabilir ya da markette satılabilir.
- **Hizmete erişim:**
  - Kimlik cüzdan anahtarı; her istek BRC-103 ile karşılıklı imzalı. API key yok.
  - `POST /v1/jobs` iş başlatır, `GET /v1/jobs/:id` durumu getirir; bir işi yalnızca ödeyen kimlik görür.
- **Eksik "Siparişlerim":**
  - Provider'da "işlerimi listele" uç noktası yok.
  - `/me`'deki iş yalnızca React state'inde; sayfa yenilenince kayboluyor.
  - Önerildi (sağlayıcıya `GET /v1/jobs` + web ekranı, yaklaşık 1–2 saat), kullanıcı "yapabiliriz" dedi, **başlanmadı**.

### 5.3 `FINAL-IDEA.md` hedeflerine göre açık kalanlar (test, senaryo ve entegrasyon dışında)

- **Zorunlu teslim şartları:**
  - canlı demo ya da 2–3 dk video (§1.1 S2), **hazır değil**;
  - herkese açık URL (S4);
  - Devfolio gönderimi.
- **Mainnet'te eksik:** T8 market sweep, T11/T11b Coop Rail (Base Sepolia deploy edilmedi), doğrulama 3/4/6.
- **Sunumda iddia edilip yapılmayanlar:**
  - SmartRoute (gerçek sağlayıcı) yerine simüle GPU kullanıldı; bu, ekibin kapsam kararı;
  - LLM ajan beyni canlıda denenmedi (Anthropic anahtarı yoktu; varsayılan `rules`).
- **K3 katmanı:** yapılmadı (MCP server, OrdLock, dönemlik krediler, organizer ajan, ters yön Rail). Lighthouse ve kasaya kilitli kredi yapıldı.

### 5.4 STATUS'ta eskimiş not

Track E bölümü `POST /pledges/lighthouse`'u "açık" diye listeliyor. Uç nokta var (`apps/coordinator/src/api.ts:90`) ve mainnet'te lighthouse settlement'ı yapıldı (T5-L `83d339b8…`). Track E kendi satırını güncellemeli.

---

## 6. Yeni bilgisayarda kurulum

1. Node ≥ 22 (24 önerilir). `npx npm@11 install`: npm 10.9 bu workspace'i kuramıyor.
2. **Kök `.env`'i elle taşı** (git'te yok, olmamalı). Gerekenler:
   - `WALLET_*_KEY`, `OVERLAY_PRIVATE_KEY`, gerekirse `BASE_*`, `ANTHROPIC_API_KEY`;
   - Supabase değişkenleri (§4.2);
   - `NETWORK=main`, `VITE_NETWORK=main`, `VITE_DATA_MODE=live`.
   - Anahtarları sohbetlere, issue'lara ya da commit'lere yapıştırma.
3. Supabase CLI (bu oturumda 2.122) + Docker (yerel stack için), `gh` (`gh auth login`).
4. `npx playwright install chromium` (e2e ve prova için).
5. Doğrula:
   - `npm run typecheck && npm test && npm run check:docs`;
   - web için `npm run web:test`;
   - e2e için `npm -w apps/web run test:e2e`.

---

## 7. Kararı bekleyen konular

- ~~F-10'u kim düzeltecek?~~ Repo sahibinin oturumu düzeltti (`740f893`).
- "Siparişlerim" ekranı (§5.2): kullanıcı olumlu, başlanmadı.
- Video / canlı demo planı ve gerçek servislerle prova: insan işi.
- `WALLET_*` secret'larının silinmesi ve private vulnerability reporting: repo sahibi (admin).

## 8. Bu oturumun kuralları ve tercihleri

- Kullanıcı Türkçe yazıyor; repo belgeleri İngilizce (`docs/`, README), plan ve STATUS Türkçe.
- **Kullanıcının açık kuralı (31.10 06:40):** "ana projenin kodlarını bozma veya davranış değiştirici şekilde değiştirme". Denetim işinde yalnızca belge, test, betik ve CI eklendi. Bulunan açıklar belgelendi, düzeltilmedi.
- CLAUDE.md:
  - her mesajdan sonra `git pull --rebase --autostash` ve STATUS;
  - commit öncesi pull;
  - dosyalar adıyla eklenir;
  - `.env`, anahtar ve `data/` asla commit edilmez;
  - `main`'e push.
- Yerel Supabase stack'i (Docker) bu makinede açık kalmış olabilir: `supabase stop`.
