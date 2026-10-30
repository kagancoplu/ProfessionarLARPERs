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
| 30.10 16:15 | B | B.P1 için A.P0 yok: kök workspace, `packages/core` (`types.ts`, `opreturn.ts` `parseOpReturn`, kit kopyaları) | A | `packages/overlay` bağımsız paket olarak çalışıyor; `src/kit/*` geçici kopya; P1'de MASTER §3.3 tiplerinin ve §3.2 OP_RETURN zarfının geçici kopyasıyla devam |
| 30.10 16:15 | B | `pledgeListHash` biçimi belirsiz: MASTER §3.2 `sha256(join(outpoints sorted))` ayırıcıyı ve outpoint yazımını (`txid_vout` mı `txid.vout` mu) söylemiyor; ayrıca sıralama kuralı `(blockHeight, txid)` iken "outpoints sorted" leksikografik sıralama gibi okunuyor. Koordinatör (B), katılımcı doğrulaması (A) ve denetim (B Faz 6) aynı baytları üretmeli | A (`planSettlement` sahibi) | B'nin testleri şimdilik `txid_vout`, leksikografik sıra, `,` ayırıcı kullanıyor (yalnızca test). A karar verip MASTER §3.2'ye yazınca B uyar |

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
| 30.10 16:00 | B | 5 (yeni) | **Faz 5 — Herkese açık yayın** eklendi: VPS, HTTPS (Caddy), alan adı (yoksa sslip.io), CORS, hız sınırı, WS `hello` kimlik kanıtı, `/healthz` + uptime izleme, "kendi ajanınla katıl" kılavuzu. S3'ten sonra başlar | Jüri ve dış ajanlar ürünü yerelde olmadan deneyemiyor (adoption %35, clear demo). `plan/SETUP-ACCOUNTS.md` repoda yok; D'nin yazması bekleniyor |
| 30.10 16:15 | B | 1 | Faz 1.1: topic manager pledge coin'lerini ve vault çıktılarını harcayan girdileri de **`coinsToRetain`**'e koymalı | Engine (`@bsv/overlay` 2.6.4 `classifyPreviousCoins`) önceki topic çıktılarından `coinsToRetain`'de olmayanları "stale" sayıp **siliyor**. Kit kuralı yalnızca token girdilerini tutuyor; pledge'ler tutulmazsa settlement/iptal (T4) geçmişi ve Faz 6.3 denetimi kaybolur |
| 30.10 16:00 | B | 6 (yeni) | **Faz 6 — İzinsizlik ve ölçek kanıtı** eklendi: ikinci bağımsız koordinatör, `GET /metrics` (`custodiedSats = 0` zincirden hesaplı), `GET /pools/:id/audit` (sıralama + pledge-list hash'ini yeniden hesaplar), 50+ katılımcılı mainnet settlement (C'nin ajan sürüsüyle). S3'ten sonra; sıra 5 → 6 → 4 | FINAL-IDEA §8 "seçim yetkisi tespit edilebilir" iddiasının ve §11 kapanış rakamlarının kanıtı. **Önerilen arayüz eki (henüz MASTER'a yazılmadı, Faz 6.1'de):** teklif imzasını ayrı bir `OP_RETURN agentcoop offer` tx'iyle zincire yazmak, böylece ikinci koordinatör birinciye bağımlı kalmaz |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ✅ 30.10 16:05 (mockchain) | `tm_agentcoop`, kit kuralları **değişmeden** kabul ediyor. Settlement: in0 sağlayıcı kredi UTXO'su (N=1000, `SINGLE\|ACP\|FORKID`) + 3 pledge coin (`ALL\|FORKID`) → out0 4.500 sat sağlayıcıya, out1–3 kredi 600/300/100, out4–6 para üstü (pledge coin'in kendi script'ine), out7 OP_RETURN settle. STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`; overlay SPV + tüm script'leri doğruladı; lookup'ta her ajan payını görüyor, teklif UTXO'su `spent` + `spendingTxid`. Ek kanıtlar: **(1b)** sağlayıcının SINGLE\|ACP imzası farklı katılımcı/pay/para üstüyle yeniden kurulan planda da geçerli, yani koordinatörün yeniden planlaması (3 tur) yeni sağlayıcı imzası istemiyor; **(1c)** out0 1 sat düşünce imza geçersiz; **(1d)** karışık tx'te enflasyon admit edilmiyor; **(1e)** overlay'in admit etmediği kredi girdisiyle settlement tamamen reddediliyor. Test: `packages/overlay/test/validation1.mixed-settlement.test.ts`. **A için sonuç: `rules.ts` genişletmesi gerekmiyor; FINAL-IDEA §12.2 B planına gerek yok** |
| 2 | Desktop SINGLE\|ACP imzalıyor, Arcade kabul ediyor | A | ☐ | |
| 3 | Desktop izin davranışı | A | ☐ | |
| 4 | nLockTime yükseklik semantiği | D | ☐ | |
| 5 | Vault script'i politikadan geçiyor | D | ☐ | |
| 6 | v1 tx malleability kuralları | D | ☐ | |
| 7 | `beefFromArcade` soyu yürüyor | A | ☐ | |
| 8 | Arcade policy (boyut/ücret) | B | ✅ 30.10 16:10 | Arcade v0.16.0 (`/health`): ücret datahub'lara göre **1–100 sat/kB** (planlamada 100 kullan); en sıkı maks. tx 100 MB, en sıkı maks. script 500 kB; girdi sayısı sınırı yok. Gerçek script şekilleriyle ölçülen boyut (gerçek settlement'la %0,3 tutarlı): 3 katılımcı 1.486 B / 149 sat; 20 → 7.674 B / 768 sat; 50 → 18.594 B / 1.860 sat; 100 → 36.794 B / 3.680 sat; 80 p2pkh + 20 vault → 39.314 B / 3.932 sat. Katılımcı başına ~37–50 sat ücret. **Politika settlement boyutunu sınırlamıyor; MASTER §3.2 %120 ve katılımcı sayısı sınırı değişmiyor.** Betik: `packages/overlay/scripts/arcadePolicy.ts` (`npm run arcade-policy`), model: `packages/overlay/scripts/settlementSize.ts` |

---

## Track A — Protokol

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track B — Overlay + Koordinatör

- **Faz:** P0 ✅ (30.10 16:15) → P1 başlıyor
- **Bitenler:**
  - Faz planı: `plan/phases/B-P0.md`. Track dosyasına Faz 5 (herkese açık yayın) ve Faz 6 (izinsizlik + ölçek kanıtı) eklendi.
  - `packages/overlay/`: kit overlay'inin kopyası, `tm_agentcoop` / `ls_agentcoop`, tablolar `agentcoop_token_outputs` / `agentcoop_tokens`. `npm run overlay` → :8080 (Arcade header'ları). Bağımsız paket (`@agentcoop/overlay`, AGENTS.md sürümleri sabit, Node 22: `nvm use 22`).
  - Doğrulama testi 1 ✅ ve 8 ✅ (yukarıdaki tablo). `npm test` 8/8 yeşil (`packages/overlay/test/validation1.mixed-settlement.test.ts`).
  - `packages/overlay/README.md`.
- **Devam eden:** B.P1 planı (`plan/phases/B-P1.md`).
- **Bilinen sorunlar:** `src/kit/{inscription,rules,addresses}.ts` ve `test/helpers/mockchain.ts` A.P0 gelene kadar geçici kopya. `test/helpers/settlement.ts` yalnızca test için bir settlement kurucu (A'nın builder'ı değil). Typecheck kit gibi `test/`'i kapsamıyor.
- **Diğer track'lerin benden beklediği:**
  - **A:** Test 1 sonucu: kit kuralları karışık settlement'ı **değiştirilmeden** kabul ediyor, `rules.ts` genişletmesi gerekmiyor. Settlement'ı overlay'e `X-Topics: ["tm_agentcoop"]` ile submit et (kit `tm_tokenkit`'i yerine). Sağlayıcının SINGLE\|ACP imzası yeniden planlamada geçerli kalıyor (test 1b). `test/helpers/settlement.ts`, A'nın `planSettlement`/`signSettlementInput`'ına referans olarak kullanılabilir.
  - **A/C/D:** Overlay URL'si yerelde `http://localhost:8080`, lookup servisi `ls_agentcoop`. Kredi token deploy'u ve transferleri de bu topic'e gider.

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
