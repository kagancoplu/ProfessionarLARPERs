# D-P0 — Ops: cüzdanlar, anahtarlar, fonlama, Axel (ayrıntılı plan)

> Track D · Faz 0 · hedef senkron **S0** (ve S1 için fon) · yazıldı: 2026-10-30 16:10
> Üst plan: `plan/track-D-vault-ops-rail.md` Faz 0 · Arayüzler: `00-MASTER-PLAN.md §3.9, §6`

---

## 1. Amaç ve "bitti" tanımı

Diğer üç track'in mainnet'te çalışabilmesi için: sats talebi gönderilmiş, Axel'e sorular gitmiş, 7 sunucu cüzdanının anahtarları üretilmiş ve **yalnızca** gitignore'lu `.env`'de duruyor, her cüzdan `openWallet(name)` ile açılıyor, public identity key'ler `config/identities.json`'da, sats gelince öncelik sırasıyla fonlanmış ve `balances.ts` hepsini gösteriyor.

**Kabul kanıtı** (STATUS Track D'ye yazılır):
- `git check-ignore -v .env data/ data/wallets/agent-1.sqlite` üç satır döndürüyor.
- `cd scripts && npm test` yeşil (mockchain fonlama testi dahil).
- `config/identities.json` 7 sunucu cüzdanı + en az `desktop-treasury` içeriyor.
- Mainnet: ≤ 1.000 sat'lık ilk deneme ödemesinin txid'si, ardından S1 fonlamasının txid'leri (STATUS → "Mainnet işlemleri", tip `FUND`).
- `npx tsx scripts/balances.ts` çıktısında `agent-1`, `agent-2`, `provider-api` > 0.
- Axel mesajları gönderildi (saat), cevaplar STATUS'ta.

---

## 2. İnsan adımları (AI yapamaz; sırayla)

| # | Adım | Kim | Nerede | Not |
|---|---|---|---|---|
| H1 | Treasury laptopuna **BSV Desktop** (mainnet) kur; seed'i kağıda yaz | treasury sahibi | <https://desktop.bsvb.tech> | **Öneri:** treasury Desktop'ını sunucu cüzdanlarının (`.env`) bulunduğu laptopa (bu repo'nun çalıştığı makine) kur. Böylece `fund.ts` ödemeyi tek adımda yapıp içeri alır; aksi halde ödeme dosyası diğer makineye taşınır (§5.4) |
| H2 | Desktop → Payments → Receive → BSV Address; adresi kopyala | treasury sahibi | Desktop | Adres public, paylaşmak güvenli |
| H3 | **Telegram mesajı 1 (sats)** → `@lexamaison` | herhangi biri | Telegram | Metin aşağıda. Gönderim saatini STATUS'a yaz |
| H4 | **Telegram mesajı 2 (sorular)** → `@lexamaison` | aynı kişi | Telegram | Metin aşağıda. Cevapları STATUS'a |
| H5 | Ortak şifre kasası (Bitwarden) | biri | bitwarden.com | §5.1'de `.env` oluşunca 7 anahtarı kasaya kopyala |
| H6 | Fonlama sırasında Desktop onay pencerelerini onayla | treasury sahibi | Desktop | Her ödeme = 1 onay; ilk bağlantıda `agentcoop.local` için izin istenir |
| H7 | (owner/human Desktop'ları) kur ve identity key'i ver | ilgili üyeler | kendi laptopları | `npx tsx scripts/identities.ts --desktop desktop-owner` o laptopta çalışır |

**Mesaj 1 — sats (hemen):**
```
Hi Axel! Team <TEAM NAME> (BSV track, project "AgentCoop": non-custodial group buying for AI agents).
Treasury address for mainnet sats: <BSV ADDRESS>
We'd need roughly 300k sats for the main demo, and ideally ~250k more for a 50-agent single-settlement scale test. Thank you!
```

**Mesaj 2 — sorular** (MASTER §6.4; 6. soru eklendi):
```
A few quick design questions so we build to your criteria:
1. Agent budgets sit in a 2-of-2 (agent + policy "guard") output with a unilateral owner-withdraw path. Does that count as non-custodial for judging?
2. Agents run wallet-toolbox server wallets; humans use BSV Desktop. Is that enough for the "BSV wallets" requirement?
3. We index our own overlay topic (tm_agentcoop). Is that encouraged? Is there public overlay hosting we could use?
4. Participants sign a coordinator-built multi-party tx via createSignature({ hashToDirectlySign }). Any plan for BSV Desktop to show structured sign requests? (For our threat model note.)
5. A short-lived, capped prepaid balance at the provider when credits are redeemed for API calls (max one session, returnable): acceptable under non-custodial judging?
6. Cross-chain: an HTLC atomic swap USDC (Base) <-> BSV, with the BSV refund as a pre-signed nLockTime tx (no CLTV). Does that count as a "cross-chain flow", and is a $1-2 swap on Base mainnet OK for the demo?
```

Cevap gelmezse MASTER §6.4'teki varsayımlarla devam edilir.

---

## 3. Bağımlılıkların durumu (16:05)

| Bağımlılık | Durum | Etki / geçici çözüm |
|---|---|---|
| A.P0 kök monorepo (`package.json` workspaces, `.gitignore`, kök `vitest.config.ts`) | **Yok** | `scripts/` bağımsız paket olarak kuruldu (kendi `node_modules`'ü). Kök `.gitignore`'u D erken oluşturdu (anahtar güvenliği beklemez); A genişletir, silmez. **Göç:** A kök workspace'i kurunca `rm -rf scripts/node_modules scripts/package-lock.json && npm install` (kökte), yoksa iki `@bsv/sdk` kopyası olur |
| A `test/helpers/mockchain.ts` | Yok | Kit'in dosyası `scripts/test/helpers/mockchain.ts`'e birebir kopyalandı; A'nınki gelince ona geçilir |
| BSV Desktop bu makinede | **Kapalı** (localhost:3321 yanıt yok) | `fund.ts`/`identities.ts --desktop` H1 olmadan çalışmaz; kod mockchain testleriyle doğrulanır |
| Sats | **İstenmedi** (H3 bekliyor) | Mainnet adımları (§6) bekler; diğer track'ler mockchain'de devam eder |
| Arcade | ✅ `GET /health` 200, yükseklik 973322, `miningFee` 100 sat / 1000 B | Fonlama ücreti ≈ 1 ödeme başına < 50 sat |

---

## 4. Tasarım kararları (doğrulanmış)

1. **`scripts/` CommonJS paketi** (`package.json`'da `"type"` yok). Deney: ESM modunda tsx altında `import { PrivateKey } from '@bsv/sdk'` ESM build'i, wallet-toolbox ise CJS build'i yüklüyor (`PrivateKey === require('@bsv/sdk').PrivateKey` → **false**). tsconfig `paths` ile CJS build'e yönlendirme tsx'te çalışıyor ama ESM'den isimli import başarısız oluyor (`does not provide an export named 'PrivateKey'`). CJS modunda ikisi aynı kopya (**true**). Sonuç: top-level await yok, her script `main().catch(...)` deseninde. Bu bulgu MASTER §3.1'e not ve STATUS'a duyuru olarak yazılır (A/B/C'nin app'leri için de geçerli).
2. **Testler** `vitest.config.mts` ile; kit'teki alias (`@bsv/sdk` → `dist/cjs/mod.js`) aynen.
3. **`.env` yükleme:** bağımlılık yok, Node'un `process.loadEnvFile(<repo>/.env)`'i (dosya yoksa sessizce geçilir).
4. **Cüzdan dosyaları:** `<repo>/data/wallets/<name>.sqlite` (gitignore'lu). Yol `__dirname`'den hesaplanır, hangi dizinden çalıştırılırsa çalıştırılsın aynı yer.
5. **Arcade birincil** (guide §14.2): `Services.createDefaultOptions(chain)` + `options.arcadeUrl = ARCADE_URL`, kendi `StorageKnex` + `WalletStorageManager` + `Monitor` (görevler eklenir, **başlatılmaz**; uzun yaşayan servisler `startMonitor: true` ile başlatır).
6. **Desktop `default` basket'i okunamaz:** wallet-toolbox `WalletPermissionsManager.isAdminBasket('default') === true`. `balances.ts` Desktop için yalnızca uygulama basket'lerini (`agentcoop`, `agentcoop vault`, `bsv21`) gösterir; treasury'nin ana bakiyesi Desktop arayüzünden okunur.
7. **Originator:** `APP_ORIGINATOR=agentcoop.local` SDK `validateOriginator` kuralından geçiyor (kanonik hostname). Desktop'ın çalışma anında kabul edip etmediği H6'da görülür; sorun çıkarsa gerçek alan adı (SETUP-ACCOUNTS #16).
8. **Ödeme önce diske, sonra içeri alma:** `fund.ts` yayınlanan her ödemenin JSON'unu (`data/payments/<name>-<txid>.json`) **internalize'dan önce** yazar. İçeri alma başarısız olursa para kaybolmaz; `receive.ts` aynı dosyayla tekrar dener. Başarılıysa dosya `data/payments/accepted/`'a taşınır.

---

## 5. Dosyalar

| Dosya | Ne yapar | Commit? |
|---|---|---|
| `.gitignore` | `.env`, `.env.*` (`.env.example` hariç), `data/`, `*.sqlite*`, `*.db*`, `node_modules/`, `dist/`, `contracts/**/{out,cache,broadcast}` | ✅ |
| `.git/info/exclude` | Aynı kuralların yerel yedeği (A `.gitignore`'u ezse bile bu makinede koruma sürer) | yerel |
| `.env.example` | MASTER §3.9 birebir + açıklama satırları | ✅ |
| `scripts/package.json`, `tsconfig.json`, `vitest.config.mts` | CJS paket, `@bsv/sdk` 3.2.1, `@bsv/wallet-toolbox` 2.14.9 sabit | ✅ |
| `scripts/lib/env.ts` | `.env`'i yükler; `WALLETS` (ad → env değişkeni) tablosu; `NETWORK` → `chain`; `ARCADE_URL`, `APP_ORIGINATOR`; `requireKey(name)` (anahtarı asla basmaz, yoksa hangi değişkenin eksik olduğunu söyler) | ✅ |
| `scripts/lib/funding.ts` | Cüzdandan bağımsız çekirdek: `payTarget(source, targetIdentity, sats, …)` → kit `createBrc29Payment`; `acceptPayment(targetWallet, payment, tracker)` → kit `acceptBrc29Payment`; ödeme dosyası okuma/yazma; `poolBalance` (guide §11) | ✅ |
| `scripts/lib/kit/payments.ts`, `arcadeChainTracker.ts` | Kit'ten **birebir kopya** (MASTER §4.2). A `packages/core/src/kit/`'i kurunca oradan import edilir | ✅ |
| `scripts/wallets.ts` | `openWallet(name, opts?)` → `{ wallet, identityKey, close }`; `WALLET_NAMES`. Diğer track'ler import eder (`scripts/wallets.ts`; workspace kurulunca `@agentcoop/scripts/wallets`) | ✅ |
| `scripts/keygen.ts` | 7 × `PrivateKey.fromRandom().toHex()` → **yalnızca stdout**, `WALLET_..._KEY=<hex>` satırları. `--only-missing`: `.env`'de zaten olanları atlar (değerleri okumaz, basmaz). Dosyaya yazmaz | ✅ |
| `scripts/identities.ts` | Anahtarı olan her sunucu cüzdanını açar, identity key'i `config/identities.json`'a yazar. `--desktop <name>`: Desktop'a bağlanır, identity key'ini ekler | ✅ |
| `config/identities.json` | `{ "<name>": "<33-byte pubkey hex>" }` (public) | ✅ |
| `scripts/fund.ts` | `fund.ts agent-1=50000 agent-2=50000 …` → Desktop'tan her hedefe BRC-29; hedefin anahtarı yerel `.env`'de varsa hemen içeri alır, yoksa ödeme dosyasını bırakır. `--dry-run`, `--max-total` (vars. 400.000), ilk mainnet denemesi kilidi (§7) | ✅ |
| `scripts/receive.ts` | `data/payments/*.json`'daki bekleyen ödemeleri (veya verilen dosyayı) SPV + script kontrolüyle içeri alır | ✅ |
| `scripts/balances.ts` | Her sunucu cüzdanı: spendable sats, UTXO sayısı, son tx'lerin WhatsOnChain linkleri. `--desktop`: Desktop'ın uygulama basket'leri | ✅ |
| `scripts/test/helpers/mockchain.ts` | Kit kopyası | ✅ |
| `scripts/test/funding.mockchain.test.ts` | §8'deki senaryolar | ✅ |
| `scripts/test/keygen.test.ts` | Anahtar biçimi, benzersizlik, `--only-missing` | ✅ |
| `docs/OPS.md` | Envanter, kim hangi Desktop'ı tutuyor, fonlama sırası, "para bitti" prosedürü, kasa notu, sorun giderme | ✅ |
| `data/wallets/*.sqlite`, `data/payments/*.json`, `data/ops/*` | Çalışma zamanı | ❌ (gitignore) |

### 5.1 Anahtarların yolu (asla sohbete, log'a, commit'e girmez)

```
keygen.ts ──stdout──▶ (kabuk yönlendirmesi) ──▶ .env   (gitignore + .git/info/exclude)
                                                 │
                                   insan: .env'den Bitwarden'a kopyalar
```
- AI keygen'i **yalnızca** `npx tsx scripts/keygen.ts --only-missing >> ../.env` biçiminde çalıştırır; çıktı ekrana ve sohbete düşmez. Öncesinde `git check-ignore .env` doğrulanır.
- Hiçbir script anahtarı `console.log`'lamaz; hata mesajları yalnızca değişken **adını** içerir.

---

## 6. Script düzeyi (opcode)

Faz 0'da özel script yok; yalnızca BRC-29 P2PKH:

| Ne | Script | Not |
|---|---|---|
| BRC-29 ödeme çıktısı (treasury → sunucu cüzdanı) | `OP_DUP OP_HASH160 <pkh(derivedPub)> OP_EQUALVERIFY OP_CHECKSIG` (25 bayt) | `derivedPub` = `getPublicKey({ protocolID: [2,'3241645161d8'], keyID: '<prefix> <suffix>', counterparty: <hedef identity>, forSelf: false })` (gönderen tarafta). **Asla identity key'in kendisi değil** (guide §5.1) |
| Harcama | `<sig‖SIGHASH_ALL|FORKID> <pub33>` (≤ 108 bayt) | Hedef cüzdan `'wallet payment'` ile içeri aldıktan sonra kendi `createAction`'ı ile harcar; 0-conf'ta harcanabilir |
| Ücret | ~ 225 bayt × 100 sat/kB ≈ 23 sat / ödeme | Arcade `/health` `miningFee` |

**İçeri alma kontrolleri** (kit `acceptBrc29Payment`): SPV (`tx.verify(ArcadeChainTracker)`), çıktı script'i `P2PKH(derive(forSelf:true, counterparty: sender))` ile birebir, tutar beyanla eşit; sonra wallet `internalizeAction` aynı kontrolleri tekrar yapar.

---

## 7. Ops kontrolleri ve kapattıkları riskler

Guard politikası Faz 1'de; Faz 0'ın karşılığı operasyonel kontroller:

| Kontrol | Nerede | Kapattığı risk |
|---|---|---|
| Anahtar yalnızca stdout; `.gitignore` + `.git/info/exclude`; her fazda `git check-ignore` | keygen, kök | Anahtarın repoya/sohbete sızması |
| `requireKey` hata mesajında yalnızca değişken adı | `lib/env.ts` | Log'a anahtar düşmesi |
| **İlk mainnet kilidi:** `data/ops/mainnet-probe.json` yoksa `fund.ts` 1.000 sat'tan büyük tek ödemeyi reddeder (`--force` ile aşılır). İlk ≤ 1.000 sat ödeme içeri alınınca dosya yazılır | `fund.ts` | Denenmemiş yolda büyük kayıp (MASTER §6.3) |
| `--max-total` (vars. 400.000 sat) | `fund.ts` | Yazım hatasıyla aşırı fonlama (`5000000`) |
| Önce plan dökümü + `--dry-run` | `fund.ts` | Yanlış hedef |
| Ödeme JSON'u internalize'dan **önce** diske | `fund.ts` / `receive.ts` | İçeri alma hatasında paranın "kaybolması" |
| SPV + script + tutar kontrolü | kit `acceptBrc29Payment` | Sahte veya eksik ödeme, yanlış alıcı |
| Ağ kontrolü: `getNetwork()` `NETWORK` ile uyuşmazsa dur | `fund.ts` | Testnet/mainnet karışması |

---

## 8. Test senaryoları (önce mockchain)

`scripts/test/funding.mockchain.test.ts` (wallet-toolbox `MockServices`, kit harness'ı):
1. **Fonlama:** treasury (mock coinbase'den 1M) → `agent-1` 50k, `agent-2` 30k (`payTarget` + `acceptPayment`). Beklenen: `poolBalance` tam 50.000 / 30.000.
2. **0-conf harcama:** blok üretmeden `agent-1` → `agent-2` 10k öder ve `agent-2` içeri alır. Fonlanan cüzdanlar hemen kullanılabilir (S1 bunu gerektirir).
3. **Yanlış alıcı:** `agent-2`, `agent-1`'e yapılan ödemeyi içeri almaya çalışır → hata (`not locked to our key`).
4. **Tutar yalanı:** beyan edilen `satoshis` +1 → hata.
5. **Dosya gidiş-dönüş:** ödeme JSON'a yazılıp okununca aynen içeri alınabiliyor (`receive.ts` yolu).
6. **Tekrar içeri alma:** aynı ödeme ikinci kez içeri alınınca bakiye artmıyor (idempotent veya hata; davranış kaydedilir).

`scripts/test/keygen.test.ts`:
7. 7 ad, her biri 64 hex, hepsi farklı, ad listesi MASTER §3.9 ile birebir.
8. `--only-missing` `.env`'de olan adları atlıyor.

Gerçek ortam:
9. `identities.ts` 7 cüzdanı açıp `config/identities.json`'u yazıyor (ağ gerekmez; `openWallet` kompozisyonunun dumanı).
10. Mainnet ilk deneme: `fund.ts agent-1=1000` → txid, içeri alındı, `balances.ts` 1.000.

---

## 9. Mainnet fonlama sırası (sats gelince)

| Adım | Komut (treasury laptopunda) | Neden bu sırada |
|---|---|---|
| F1 | `npx tsx scripts/fund.ts agent-1=1000` | Hem D'nin ≤ 1.000 sat ilk denemesi hem de **A'nın doğrulama testi 2** için ücret girdisi ekleyecek wallet-toolbox cüzdanı (A.P0 0.4). A'ya STATUS'tan haber verilir |
| F2 | `… agent-1=49000 agent-2=50000 provider-api=20000` | S1 walking skeleton (A.P1) |
| F3 | `… agent-3=50000 coordinator=5000 guard=5000 maker=30000` | S2/S3 ve Rail PoC |
| F4 | `… desktop-owner=60000 desktop-human=30000` | Desktop → Desktop: hedefin identity key'i `identities.ts --desktop` ile eklenmiş olmalı; içeri alma o laptopta `receive.ts --desktop` ile yapılır |
| F5 | (ek sats gelirse) Faz 6 ölçek testi için ayrılır, şimdi dağıtılmaz | |

Desktop başına `getNetwork()` → `mainnet` doğrulanır. Her adımın txid'leri STATUS → "Mainnet işlemleri"ne (tip `FUND`).

---

## 10. Uygulama sırası (AI)

1. ✅ Gitignore + `.git/info/exclude`, `scripts/` paketi, CJS kararı (deneyle).
2. `.env.example`, `lib/env.ts`, kit kopyaları, `lib/funding.ts`, `wallets.ts`.
3. Testler (mockchain) → yeşil.
4. `keygen.ts`, `identities.ts`, `fund.ts`, `receive.ts`, `balances.ts`; `tsc --noEmit` temiz.
5. `keygen --only-missing >> .env` (çıktı görünmeden) → `identities.ts` → `config/identities.json`.
6. `docs/OPS.md`.
7. MASTER §3.1 notu + STATUS (D bölümü, arayüz notu, blokajlar).
8. Sats gelene kadar: Checkpoint → Faz 1'e mockchain'de devam; F1–F4 sats gelince.

---

## 11. Checkpoint (2026-10-30 16:21)

| Soru | Cevap |
|---|---|
| **Plan hâlâ iyi mi?** | Evet, iki düzeltmeyle: (1) `scripts/` **CommonJS** (ESM'de iki SDK kopyası; MASTER §3.1'e not, STATUS'ta A/B/C'ye duyuru). (2) Desktop `default` basket'i uygulamalara kapalı, treasury bakiyesi Desktop arayüzünden okunur. Desktop'a Node'dan `WalletClient('auto','agentcoop.local')` ile bağlantı **çalışıyor** (`waitForAuthentication`, `getNetwork` → mainnet, `getPublicKey`); C aynı yolu kullanabilir. `createAction` 400 → cüzdanda sats yokken beklenen davranış; sats gelince F1 ile teyit edilecek |
| **Bitti mi?** | Kod, testler (9/9), anahtarlar, cüzdanlar, identities, OPS.md ✓. **Açık:** H1–H5 (insan), F1–F4 (sats). Kabul kanıtının mainnet satırları bunlara bağlı |
| **Diğer track'ler?** | 16:20 itibarıyla A, B, C "P0 başlamadı". A test 2 için `agent-1`'e 1.000 sat bekliyor → F1. B/C henüz cüzdan istemedi; `openWallet` hazır |
| **Sonraki faz bağımlı mı?** | Faz 1, A.P0'a (`InputSigner`, `opreturn.ts`, `packages/core` iskeleti) bağlı ve **A.P0 yok**. Plan: 1.1–1.3 ve 1.4'ün politika motoru MASTER §3.3'teki `InputSigner` arayüzüne karşı yazılır; `packages/core`'a yalnızca D'ye ayrılmış dosyalar (`src/scripts/vault.ts`, `src/signers/VaultSigner.ts`) eklenir, iskelete dokunulmaz. Mainnet test 5 sats'a bağlı |
| **Arayüz değişikliği?** | MASTER §3.1 notu (kural metni değişmedi), §6.4 6. soru; STATUS "Arayüz değişiklikleri"nde 4 satır |
