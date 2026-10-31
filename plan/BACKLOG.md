# BACKLOG

Açık işler, öncelik sırasıyla. Ayrıntı ve bağlam: [`plan/HANDOFF.md`](HANDOFF.md) (§ referansları oraya). Güvenlik bulgularının tam metni: [`docs/AUDIT-READINESS.md`](../docs/AUDIT-READINESS.md) §6.

**Kullanım:** Bir işi bitiren, satırın durumunu `✅ <tarih> <commit>` yapar ve aynı commit'te ilgili belgeyi (THREAT-MODEL, AUDIT-READINESS, ROADMAP) günceller. Yeni iş en alta, sıradaki boş `BL-` numarasıyla eklenir. Güvenlik belgesine dokunduysan `npm run check:docs` koş.

Durum: ☐ açık · ◐ başladı · ✅ bitti · ⏸ bilerek ertelendi

## P0: teslim ve demo öncesi

| ID | İş | Sahip | Durum | Bitti sayılır | Referans |
|---|---|---|---|---|---|
| BL-01 | **`WALLET_*` GitHub Actions secret'larını sil.** Herkese açık repoda mainnet cüzdanlarının özel anahtarları duruyor; hiçbir workflow kullanmıyor | Repo sahibi (admin) | ✅ 31.10 (7 `WALLET_*` secret silindi, `gh secret list`) | `gh secret list` içinde `WALLET_*` yok | HANDOFF §2.2 #2 |
| BL-02 | **GitHub private vulnerability reporting'i aç**, sonra `SECURITY.md`'deki "when it is available" ve issue tabanlı yedek yolu sadeleştir | Repo sahibi (admin) | ☐ | `gh api repos/kagancoplu/ProfessionarLARPERs/private-vulnerability-reporting` → `{"enabled":true}` | HANDOFF §2.2 #3 |
| BL-03 | **Projeyi Devfolio'ya gönder.** Denetim ödülüne otomatik girmenin tek koşulu | Ekip | ☐ | Gönderim linki STATUS'ta | HANDOFF §3 |
| BL-04 | **Video (2–3 dk) ya da canlı demo**; ajan ödemesi dahil. Challenge'ın zorunlu şartı (`FINAL-IDEA.md` §1.1 S2) | Ekip | ☐ | Video linki README'de | HANDOFF §5.3 |
| BL-05 | **Herkese açık URL:** web (Cloudflare Pages ya da VPS) ve servis URL'leri (planda S4) | Ekip / Track B, E | ☐ | README'de çalışan link | HANDOFF §5.3 |
| BL-06 | **Gerçek servislerle prova (mainnet):** `npm run infra`, provider, guard, `npm run agents`, iki makinede `npm run web`, birinde `?avatar=1`. Sırasında `/_debug` → "record a replay" ile gerçek bir mainnet kaydı al | İnsan + BSV Desktop + sats | ☐ | İki ekran aynı havuzu görüyor; `apps/web/public/replays/mainnet-<tarih>.jsonl` commit'li | HANDOFF §4.5, `apps/relay/README.md` › Demo |
| BL-07 | **Sunumda güvenlik paketini öne çıkar:** `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md`, ROADMAP'teki "How we would use audit credits", F-10'u kendimizin bulup düzeltmesi | Sunumu yapan | ☐ | Sunumda bir slayt ya da bölüm | HANDOFF §3 |

## P1: güvenlik

| ID | İş | Sahip | Durum | Bitti sayılır | Referans |
|---|---|---|---|---|---|
| BL-10 | **F-11 (High):** BSV HTLC claim dalına `OP_SIZE <32> OP_EQUALVERIFY` (`OP_SHA256`'dan önce). Rail canlıya çıkmadan önce şart | Track D / A | ✅ 31.10 `d734c9c` | Script testi: 33 baytlık ön görüntü reddediliyor; AUDIT F-11 "Fixed" | `packages/core/src/scripts/htlc.ts:22`, AUDIT F-11 |
| BL-11 | **Coop Rail sertleştirme:** F-1 (gelen bakiye farkını kaydet ya da token allowlist), F-2 (safe-transfer sarmalayıcısı), F-4 (iadeyi kesinleşir kesinleşmez yayınlayan maker watchdog'u; yavaş bloklara göre timeout payı). Doğrulama 4'ten öğrenilen: Arcade tip = nLockTime iken reddediyor; iade kilitten en az bir blok sonra gönderilmeli | Track D | ✅ 31.10 `b5d8531` (kodda; canlı koşu BL-13) | AUDIT F-1, F-2, F-4 "Fixed" ya da gerekçeli "Accepted" | AUDIT §6, ROADMAP kapı 3 |
| BL-12 | **Doğrulama 3 ve 6 mainnet'te:** Desktop'ın ilk imzada kaç onay penceresi açtığı; v1 malleability | Track A / D + insan | ✅ 31.10 (3: 2 pencere, ikinci imzada yok; 6: v1 malleable değil, `717d1a4`) | STATUS "Doğrulama testleri" ✅ | HANDOFF §2.2 #6 |
| BL-13 | **T8 (market sweep) ve T11/T11b (Coop Rail; Base Sepolia deploy) mainnet'te** | Track C / D | ◐ T8 ✅ 31.10 (`675c3334…`); T11/T11b faucet ETH bekliyor | README tx tablosunda txid | THREAT-MODEL §3 |
| BL-14 | **F-8:** `live_health.detail` iç URL ve hata metnini anonim okuyuculara açıyor, bunu genel bir mesaja indir; Kasaba `move` yayınlarını doğrula (gönderen presence'ta mı, koordinatlar sayı mı) | Supabase katmanı | ✅ 31.10 `b5d8531` | Test + AUDIT F-8 "Fixed" | `apps/relay/src/sources.ts:56`, `apps/web/src/town/multiplayer.ts:76` |
| BL-15 | **T-17:** provider'a paylaşımlı, atomik bir 402 replay store bağla (`createApp({ replayStore })`). Birden fazla provider süreci çalıştırmadan önce şart | Track C | ✅ 31.10 `b5d8531` | THREAT-MODEL T-17 güncel | `apps/provider-api/src/server.ts` |
| BL-16 | **Mutasyon testi:** `packages/core/src/pool/verify.ts` ve script şablonları (HTLC'de yapıldı, yöntem HANDOFF §2.4); I-2 için para üstü (change) kurcalama testi | Track A | ✅ 31.10 `b5d8531` (49/49, CI `mutation`) | Mutantlar öldürülüyor; AUDIT §4 notu güncel | AUDIT I-2, ROADMAP kapı 6 |
| BL-17 | **Slither** ile `contracts/base-htlc/HTLC.sol` statik analizi; çıktıyı AUDIT §7'ye ekle | Herkes | ✅ 31.10 `b5d8531` (CI `slither --fail-high`) | Rapor AUDIT'te | HANDOFF §2.2 #10 |
| BL-18 | **Bağımlılık triage:** `zod` < 4.6.6 (`@anthropic-ai/sdk`, `viem`), `tmp` (`solc`), `jimp` (`free-tex-packer-core`, dev). Yükseltme davranış değiştirebilir; testle | Herkes | ✅ 31.10 `b5d8531` (runtime 0; `jimp` dev kabul, AUDIT §7) | `npm audit --omit=dev` 0 high ya da gerekçeli kabul | AUDIT §7 |
| BL-19 | **RLS testi CI'da:** `apps/relay/test/schema.local.test.ts` yalnızca yerel Supabase'le koşuyor. CI'a Supabase servisi ekle ya da ayrı bir job yap | Supabase katmanı | ✅ 31.10 `b9c2202` (CI `supabase-rls`) | CI'da "anon cannot write" koşuyor | THREAT-MODEL T-22 |
| BL-20 | **`SUPABASE_SECRET_KEY` GitHub secret'ı:** hiçbir workflow kullanmıyor. Tut ya da sil kararı | Repo sahibi | ☐ | Karar STATUS'ta | HANDOFF §4.2 |

## P2: ürün ve temizlik

| ID | İş | Sahip | Durum | Bitti sayılır | Referans |
|---|---|---|---|---|---|
| BL-30 | **"Siparişlerim":** provider'a kimliğin işlerini ve ödemelerini listeleyen `GET /v1/jobs`, web'e bunu gösteren bir ekran. Şu an `/me`'deki iş yenilemede kayboluyor. Kullanıcı olumlu, başlanmadı (~1–2 sa) | Track C + E | ✅ 31.10 `125b2d8` | Yenilemeden sonra işler listeleniyor; test | HANDOFF §5.2 |
| BL-31 | **Doğrudan (direct) modda `pledge_added` çift sayımı:** reducer, koordinatörün saydığı krediyi bir daha ekliyor (Supabase yolunda düzeltildi) | Track E | ✅ 31.10 `9aec881` | Direct modda kredi toplamı koordinatörle aynı; test | HANDOFF §2.3 |
| BL-32 | **STATUS Track E notu eskimiş:** `POST /pledges/lighthouse` "açık" görünüyor ama var (`apps/coordinator/src/api.ts:90`), T5-L mainnet'te yapıldı | Track E | ✅ 31.10 `9aec881` | Track E satırı düzeltilmiş | HANDOFF §5.4 |
| BL-33 | **Supabase prova gözlemi:** yenilenen sayfanın akışında `pool_opened`/`pledge_added` yok (durum doğru, akış eksik); bu olaylar istemcide türetiliyor ve mirror geçmişine yazılmıyor | Supabase katmanı | ✅ 31.10 `f54fffe` | Yenilemeden sonra akışta görünüyorlar | HANDOFF §4.3 |
| BL-34 | **Supabase incelemesinden ertelenen 19 küçük madde** (tam liste HANDOFF §4.4). Önce: #2 boş tick, #7 sınırsız olay kuyruğu, #8 SSE boşta kalma zaman aşımı, #11 45 sn geri dönüş ve gizli sekmeler | Supabase katmanı | ✅ 31.10 (#16 açık: publishable key barındırılan projede; #15 = BL-20) | Her madde HANDOFF §4.4'te işaretli | HANDOFF §4.4 |
| BL-35 | **Guard karar log'una txid** (bugün imza anında bilinmiyor; yayın sonrası eşleştir) | Track D | ☐ | Sahip her ortak imzayı zincirde bulabiliyor | AUDIT F-5, ROADMAP |
| BL-36 | **Gerçek sağlayıcı (SmartRoute)**: ürün dosyası + runner. **LLM ajan beyni canlıda dene** (`ANTHROPIC_API_KEY`) | Track C | ☐ | Gerçek bir iş, gerçek bir LLM kararı | FINAL-IDEA §1.2, README › SmartRoute |
| BL-37 | **Sağlayıcı teminatı ve itibar** (T-5) | Track A / C | ⏸ | THREAT-MODEL T-5 güncel | ROADMAP kapı 4 |
| BL-38 | **K3 (isteğe bağlı):** MCP server, OrdLock listeleri, dönemlik krediler, organizer ajan, ters yön Rail (T-16) | — | ⏸ | — | FINAL-IDEA §10 |

## Operasyon

| ID | İş | Sahip | Durum | Referans |
|---|---|---|---|---|
| BL-40 | Bu oturumun makinesinde yerel Supabase (Docker) açık olabilir: `supabase stop` | Makinenin sahibi | ☐ | HANDOFF §8 |
| BL-41 | CI uyarısı: `ubuntu-latest` Ubuntu 26'ya geçiyor (19.10.2026'dan itibaren). CI kırmızıya dönerse `runs-on`'u sabitle | Herkes | ⏸ | `.github/workflows/ci.yml` |
| BL-42 | Yeni makineye kök `.env`'i elle taşı (git'te yok); Supabase secret'ı için `supabase projects api-keys --project-ref cwnqclojrnyixetjqqsv --reveal` | Yeni makinedeki kişi | ☐ | HANDOFF §4.2, §6 |

## Bitenler (bu oturum ve paralel oturum, referans için)

| İş | Commit |
|---|---|
| Supabase canlı katmanı (relay, web taşıması, çok oyunculu Kasaba) + inceleme düzeltmeleri | `d942788`, `cffaaee`, `404a164`, `78bfb0e`, `cc02f38` |
| Denetim paketi: AUDIT-READINESS, THREAT-MODEL tazeleme, SECURITY, LICENSE, ROADMAP, CI, check-docs, HTLC sınır testleri | `86bc2fc` … `ad04620` |
| F-10 bulundu ve tekrarlandı (bu oturum), düzeltildi (repo sahibinin oturumu) | `27c0eab`, `740f893` |
| Doğrulama 4 mainnet'te geçti | `740f893` |
| Devir belgesi + prova betiği repoda | `6539b56`, `7d5d0ef` |
| F-11 düzeltildi (Coop Rail claim yalnızca 32 baytlık secret alıyor; `test/rail.htlc-preimage.test.ts`) | `d734c9c` |
| Backlog, CLAUDE.md belge haritası | `07feaff`, `02001bc` |
