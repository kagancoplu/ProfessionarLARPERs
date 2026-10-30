# OPS — Cüzdanlar, anahtarlar, fonlama

> Sahibi: **Track D**. Plan: `plan/00-MASTER-PLAN.md §6`, ayrıntı: `plan/phases/D-P0.md`.
> Kural: hiçbir anahtar, seed veya API key repoya, sohbete, log'a ya da ekran görüntüsüne girmez.

## 1. Envanter

| Cüzdan | Tür | Makine | Anahtar nerede | Hedef | Identity key |
|---|---|---|---|---|---|
| `desktop-treasury` | BSV Desktop | *(doldurun)* | seed: yalnızca sahibi, kağıtta | BSVA sats'ının tamamı | *(doldurun)* |
| `desktop-owner` | BSV Desktop | *(doldurun)* | seed: sahibi | 60k | `identities.ts --desktop desktop-owner` |
| `desktop-human` | BSV Desktop | *(doldurun)* | seed: sahibi | 30k | `identities.ts --desktop desktop-human` |
| `provider-api` | wallet-toolbox | repo makinesi | `.env` `WALLET_PROVIDER_API_KEY` + kasa | 20k | `config/identities.json` |
| `coordinator` | wallet-toolbox | repo makinesi | `.env` + kasa | 5k | 〃 |
| `guard` | wallet-toolbox | repo makinesi | `.env` + kasa | 5k | 〃 |
| `agent-1..3` | wallet-toolbox | repo makinesi | `.env` + kasa | 50k her biri | 〃 |
| `maker` | wallet-toolbox | repo makinesi | `.env` + kasa | 30k | 〃 |

Sunucu cüzdanlarının verisi `data/wallets/<ad>.sqlite` (gitignore'lu). Public identity key'ler `config/identities.json`'da (commit edilir).

## 2. Kurulum (bir kez)

```bash
cd scripts && npm install && npm test && cd ..       # 9 test, mockchain, sats gerekmez
git check-ignore -v .env data/                        # iki satır görmelisiniz
grep -v '^WALLET_.*_KEY=$' .env.example > .env        # .env yoksa
npx tsx scripts/keygen.ts --only-missing >> .env      # anahtarlar YALNIZCA .env'e
npx tsx scripts/identities.ts                         # cüzdanları açar → config/identities.json
```

- `keygen.ts` terminale anahtar basmayı reddeder (yönlendirme yoksa); `--show` yalnızca bilerek kullanılır.
- `.env`'deki 7 `WALLET_*_KEY` satırını **ortak kasaya** (Bitwarden) kopyalayın. Kayıpta aynı anahtarla cüzdan yeniden açılır ve zincirden senkronlanır.
- Kök workspace (A.P0) kurulunca: `rm -rf scripts/node_modules scripts/package-lock.json && npm install` (kökte). Yoksa iki `@bsv/sdk` kopyası olur.

## 3. Fonlama (treasury Desktop'ın açık olduğu makinede)

1. BSV Desktop açık ve kilidi açık olmalı (mainnet). Komutlar ilk bağlantıda `agentcoop.local` için izin ister; her ödeme ayrı bir onaydır.
2. **İlk mainnet denemesi (≤ 1.000 sat).** Bu kilit açılmadan büyük ödeme yapılamaz:
   ```bash
   npx tsx scripts/fund.ts agent-1=1000
   ```
   Bu aynı zamanda A'nın doğrulama testi 2'si için ücret cüzdanını hazırlar.
3. **S1:** `npx tsx scripts/fund.ts agent-1=49000 agent-2=50000 provider-api=20000`
4. **Gerisi:** `npx tsx scripts/fund.ts agent-3=50000 coordinator=5000 guard=5000 maker=30000`
5. **Desktop → Desktop** (owner, human):
   - Hedef laptopta: `npx tsx scripts/identities.ts --desktop desktop-owner` (ve `config/identities.json`'u paylaşın).
   - Treasury'de: `npx tsx scripts/fund.ts desktop-owner=60000 desktop-human=30000` → `data/payments/*.json` oluşur.
   - Dosyayı hedef laptopa taşıyın, orada: `npx tsx scripts/receive.ts --desktop <dosya>`.
6. Kontrol: `npx tsx scripts/balances.ts` (`--desktop` ile AgentCoop basket'leri de görünür; Desktop'ın kendi bakiyesi yalnızca Desktop arayüzünde görünür).
7. `fund.ts`'in sonunda bastığı satırları `plan/STATUS.md` → "Mainnet işlemleri"ne ekleyin.

Önce `--dry-run` ile planı görün. Tek seferde en fazla `--max-total` (varsayılan 400.000 sat) gönderilir.

## 4. "Para bitti" prosedürü

1. `npx tsx scripts/balances.ts` ile kimin bittiğini görün.
2. Treasury'de yeterli sats varsa: `fund.ts <ad>=<tutar>`.
3. Treasury de bittiyse: harcamaların çoğu takım içinde dolaşır (pledge'ler sağlayıcıya, yani bize gider). `provider-api` veya Desktop'taki `agentcoop revenue` basket'inden geri aktarın (C'nin `sweep-revenue` komutu). Yetmezse @lexamaison'dan ek sats isteyin.
4. Acil durumda mockchain'de devam edin. Mainnet adımlarını STATUS → Blokajlar'a yazın.

## 5. Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| `BSV Desktop not reachable` | Desktop kapalı/kilitli | Açın, kilidi açın (3321/2121) |
| `createAction failed with HTTP status 400 … nothing was sent` | Desktop'ta yeterli sats yok veya onay reddedildi | Desktop bakiyesini arayüzde kontrol edin; tekrar deneyin |
| `BSV Desktop is on testnet` | Yanlış ağ | Desktop'ta mainnet cüzdanı veya `.env` `NETWORK=test` |
| `first mainnet run: send one payment of ≤ 1000 sats first` | İlk deneme kilidi | Önce `fund.ts agent-1=1000` |
| `! not accepted yet … The payment is safe in data/payments/…` | İçeri alma (SPV/ağ) geçici hata | `npx tsx scripts/receive.ts <dosya>`; aynı ödemeyi iki kez almak zararsızdır (test edildi) |
| `WALLET_…_KEY is not set in .env` | Anahtar yok | `keygen.ts --only-missing >> .env` |
| `script[serializedBytes] is not a function` | İki `@bsv/sdk` kopyası | `scripts/` CommonJS paketi olarak kalmalı (`"type":"module"` eklemeyin); kök workspace'e geçişte §2'deki temizlik |

## 6. Güvenlik notları

- `.env` izni `600`; `.gitignore` + `.git/info/exclude` (yerel yedek). Her fazda: `git check-ignore -v .env data/`.
- Hiçbir script anahtar basmaz; hata mesajları yalnızca değişken adını içerir.
- Ödeme dosyaları (`data/payments/`) gizli anahtar içermez (tx + BRC-29 türetme verisi), ama gitignore'ludur.
- Sunucu cüzdanları "sıcak" cüzdanlardır: bakiyeleri yalnızca işleri kadar tutulur. Ana para treasury Desktop'ta kalır.
