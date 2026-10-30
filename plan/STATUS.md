# STATUS — AgentCoop

> Her track **yalnızca kendi bölümünü** günceller; her faz sonunda. Diğer bölümler okunur.
> Tarih/saat yaz (yerel). Dosya yollarını tam ver. Arayüz değişikliğini hem burada hem `00-MASTER-PLAN.md §3`'te yap.

## Senkron noktaları

| Senkron | Durum | Tarih | Not |
|---|---|---|---|
| S0 | ☐ | | |
| S1 walking skeleton | ☐ | | txid: |
| S2 K1 entegre | ☐ | | |
| S3 K2 entegre | ☐ | | |
| S4 freeze | ☐ | | |

## Blokajlar (herkes yazar, çözen siler)

| Tarih | Track | Blokaj | Kimden bekleniyor | Geçici çözüm |
|---|---|---|---|---|
| 2026-10-30 16:20 | D (herkes) | **Mainnet sats yok:** sats talebi henüz gönderilmedi. Treasury Desktop'ta bakiye yok, fonlama (F1–F4) yapılamıyor. Bu makinedeki Desktop'tan 1.000 sat deneme ödemesi HTTP 400 ile reddedildi, hiçbir şey gönderilmedi | **İnsan:** Telegram mesaj 1 + 2 (`plan/phases/D-P0.md` §2) | Herkes mockchain'de devam; S1'in mainnet koşusu sats gelince. Sats gelince D önce F1 (agent-1=1000, A'nın test 2'si için) |
| 2026-10-30 16:20 | D | Bu makinedeki BSV Desktop (`03e8836800…94a45a`, mainnet) **treasury mi?** Değilse treasury Desktop'ın identity key'i ve hangi laptopta olduğu | **İnsan** | `fund.ts` hangi Desktop açıksa onu kaynak kullanır; yanlış Desktop'tan fonlamamak için F1'den önce teyit |

## Arayüz değişiklikleri (herkes okur)

| Tarih | Track | Değişen | Neden | MASTER-PLAN güncellendi mi |
|---|---|---|---|---|
| 2026-10-30 16:20 | D → **A, B, C** | **ESM/CJS:** tsx altında `"type":"module"` paketler `@bsv/sdk`'nın iki kopyasını yüklüyor; §3.1'deki tsconfig `paths` yöntemi ESM'den isimli import'ta kırılıyor. Çalışan yol: wallet-toolbox kullanan paketler **CommonJS** + tsconfig `NodeNext`. Kanıt ve örnek MASTER §3.1 notunda, `scripts/` bu şekilde kuruldu. **A, `@agentcoop/core` için seçtiği yolu buraya yazsın** | Deneyle doğrulandı (16:00–16:15) | ✅ §3.1'e not eklendi (kural metni A'nın, değiştirilmedi) |
| 2026-10-30 16:20 | D | **`openWallet(name, { startMonitor?, dir? })`** → `{ wallet, identityKey, monitor, close }`: `scripts/wallets.ts` (Arcade birincil, `data/wallets/<ad>.sqlite`, anahtar `.env`'den). Kullanılabilir adlar: `provider-api, coordinator, guard, agent-1..3, maker`. Sunucu cüzdanı açan herkes bunu kullanır (C 0.1, A 1.7) | MASTER §6.2 adım 3 | §6.2'de zaten tanımlı |
| 2026-10-30 16:20 | D | `.env.example` (MASTER §3.9 birebir, satır başına bir değişken), `.env` bu makinede hazır (7 anahtar), `config/identities.json` (7 public identity key, commit edilir) | MASTER §3.9, §6.2 | — |
| 2026-10-30 16:20 | D → **A** | Kök **`.gitignore` D tarafından erken oluşturuldu** (`.env*`, `data/`, `*.sqlite*`, `node_modules/` …). A.P0 0.1'de bu dosyayı **genişletin, silmeyin**. A kök workspace'i kurunca: `rm -rf scripts/node_modules scripts/package-lock.json && npm install` (kökte), aksi halde iki SDK kopyası | Anahtar güvenliği A.P0'ı bekleyemezdi | — |

## Plan değişiklikleri

| Tarih | Track | Faz | Değişiklik | Neden |
|---|---|---|---|---|
| 2026-10-30 16:02 | D | 5 (yeni) | **Faz 5 eklendi:** Rail PoC başarılıysa tam Coop Rail (ters yön BSV→USDC, maker envanter dengelemesi, Base mainnet'te $1–2'lik gerçek swap; guard'da `rail-in`/`rail-out`). Başarısızsa B yolu: vault filosu, sahip düzeyinde toplam tavan, politika şablonları, acil durdurma, zincirde politika taahhüdü. Zaman kutusu A 5 sa / B 3 sa | Benimsenme %35 ("başka zincirden likidite") ve non-custodial %20 |
| 2026-10-30 16:02 | D | 6 (yeni) | **Faz 6 eklendi:** maliyet benchmark'ı (BSV'de N katılımcılı tek settlement ve mainnet'te N=50'ye karşı EVM'de deposit+refund emanet kontratı; Sepolia'da gerçek ölçüm) + `test/attacks/*` saldırı paketi; her test FINAL-IDEA §8'deki bir satıra etiketli. Zaman kutusu 4 sa | "Neden BSV" ve "non-custodial" iddialarını ölçüme ve teste bağlamak |
| 2026-10-30 16:02 | D | 7 (yeni, D önerisi) | **Faz 7 eklendi:** vault'u her ajana açan `VaultFetch` + vault MCP server (Claude Desktop/Code ajanı sahibinin tavanıyla 402 öder). Zaman kutusu 3 sa | Vault'u AgentCoop dışında bir giriş kapısına çevirir (benimsenme + ajan ödemeleri); mevcut guard ve sıcak cüzdanı yeniden kullanır |
| 2026-10-30 16:02 | D | sıra | Yürütme sırası 0→1→2→3→5→6→7→**4**. Genişletme fazları S3'ten önce başlamaz; teslime 4 saat kala nerede olunursa olunsun Faz 4'e geçilir. D fazlarına "Çıktılar" eklendi | Teslim fazı asla atlanmasın |
| 2026-10-30 16:02 | D | 0 | MASTER §6.4'e 6. soru eklendi (Base HTLC = cross-chain flow mu, Base mainnet'te $1–2 uygun mu). Sats talebi sorulardan ayrı ve önce gönderilir. SETUP-ACCOUNTS'a #19–21 eklendi (Base mainnet ETH/USDC, Claude Desktop) | Faz 5 A yolu ve Faz 7 için |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ☐ | |
| 2 | Desktop SINGLE\|ACP imzalıyor, Arcade kabul ediyor | A | ☐ | |
| 3 | Desktop izin davranışı | A | ☐ | |
| 4 | nLockTime yükseklik semantiği | D | ☐ | |
| 5 | Vault script'i politikadan geçiyor | D | ☐ | |
| 6 | v1 tx malleability kuralları | D | ☐ | |
| 7 | `beefFromArcade` soyu yürüyor | A | ☐ | |
| 8 | Arcade policy (boyut/ücret) | B | ☐ | |

---

## Track A — Protokol

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track B — Overlay + Koordinatör

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track C — Sağlayıcı + Ajanlar

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track D — Vault + Ops + Rail + Teslim

- **Faz:** P0. Kod tarafı bitti (16:20); **insan adımları ve mainnet fonlaması bekliyor**. Checkpoint yapıldı (`plan/phases/D-P0.md` §11). Sıradaki: P1, sats beklenmeden mockchain'de
- **Bitenler:**
  - Plan: `plan/phases/D-P0.md`; track dosyasına Faz 5/6/7 eklendi (bkz. "Plan değişiklikleri")
  - Güvenlik: kök `.gitignore` + `.git/info/exclude` (yerel yedek); `git check-ignore -v .env data/ data/wallets/x.sqlite` ✓
  - `scripts/` paketi (CJS; `@bsv/sdk` 3.2.1, wallet-toolbox 2.14.9): `keygen.ts`, `wallets.ts` (`openWallet`), `identities.ts`, `fund.ts`, `receive.ts`, `balances.ts`, `lib/{env,keys,funding,cli}.ts`, `lib/kit/{payments,arcadeChainTracker}.ts` (kit kopyası)
  - Testler: `cd scripts && npm test` → **9/9 yeşil** (mockchain: fonlama, blok beklemeden harcama, yanlış alıcı reddi, tutar yalanı reddi, ödeme dosyası gidiş-dönüş, tekrar içeri alma idempotent; keygen). `npx tsc --noEmit` temiz
  - `.env` (7 anahtar, izin 600, değerler hiçbir yerde basılmadı) → **kasaya kopyalanmalı (insan)**; 7 cüzdan açıldı, `data/wallets/*.sqlite`; `config/identities.json`
  - `fund.ts` güvenlikleri denendi: ilk mainnet kilidi (> 1.000 sat reddedilir), `--max-total`, bilinmeyen hedef, `--dry-run`, keygen'in terminale basmayı reddetmesi
  - `docs/OPS.md` (envanter, fonlama, "para bitti", sorun giderme)
- **Devam eden:** F1–F4 fonlaması (sats bekleniyor) → sonra Checkpoint kapanışı
- **Bilinen sorunlar:**
  - BSV Desktop uygulamaların `default` basket'ini okumasına izin vermiyor (`isAdminBasket`). Treasury bakiyesi yalnızca Desktop arayüzünde görünür; `balances.ts --desktop` yalnızca AgentCoop basket'lerini gösterir
  - `WalletClient` HTTP 400'de hata gövdesini vermiyor; `fund.ts` bunu "hiçbir şey gönderilmedi, muhtemelen sats yetersiz veya onay reddedildi" diye açıklıyor
  - Kök workspace gelince `scripts/node_modules` temizliği gerekli (bkz. Arayüz değişiklikleri)
- **Diğer track'lerin benden beklediği:** A → F1'den sonra `agent-1` 1.000 sat (test 2 ücret girdisi) · A/C → `openWallet` hazır, kullanılabilir · herkes → mainnet sats
- **Cüzdan/fon durumu:** sats talebi: ☐ gönderildi ☐ geldi (miktar: ) · bu makinedeki Desktop: `03e8836800f10ea1524f2a3035270335991fa62a6ed5b3cff4b265831d0394a45a` (mainnet; treasury mi? teyit bekleniyor) · fonlanan cüzdanlar: yok (7 sunucu cüzdanı 0 sat)
- **Axel soruları:** ☐ gönderildi (metin: `plan/phases/D-P0.md` §2) · cevaplar:
- **SETUP-ACCOUNTS kontrol listesi** (D yürütür):
  - [ ] 3× BSV Desktop mainnet kurulu, seed'ler çevrimdışı (1 tanesi bu makinede açık görünüyor)
  - [ ] `@lexamaison`'a adres gönderildi · sats geldi (miktar: …)
  - [ ] Axel'e sorular gönderildi · cevaplar burada
  - [ ] Şifre kasası kuruldu, 4 kişi içeride · `.env`'deki 7 anahtar kasada
  - [ ] Public GitHub reposu, 4 collaborator, MIT lisansı
  - [ ] Hackathon platformunda kayıt + BSV track + teslim saati öğrenildi
  - [ ] Herkeste Node 22 + kit testleri yeşil (bu makine: Node 24.13.1 ✓)
  - [ ] Anthropic key + harcama limiti
  - [ ] 2 EVM adresi + Sepolia ETH + Sepolia USDC
  - [ ] Foundry kurulu (D) (bu makinede yok)
  - [ ] VPS + alan adı + HTTPS (S2'ye kadar)
  - [ ] USD harcamaları için kart sahibi belli
  - [ ] (Faz 5 A) Base mainnet ETH + USDC · (Faz 7) Claude Desktop/Code
