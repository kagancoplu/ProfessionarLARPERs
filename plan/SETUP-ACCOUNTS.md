# Kodlama dışı kurulum: hesaplar, cüzdanlar, servisler

> Sahibi: **Track D** (ops). Her satırın bir sorumlusu olmalı; "Kim" sütununu siz doldurun.
> Sıra önemli: **Hemen** olanlar, kodlamanın önünü tıkayanlardır.
> Kural: hiçbir anahtar, seed veya API key repoya, sohbete ya da ekran görüntüsüne girmez. Hepsi ortak şifre kasasına.

---

## 1. Hemen (ilk 30 dakika)

| # | Ne | Nereden | Ne yapılacak | Kim | Maliyet | Engellediği şey |
|---|---|---|---|---|---|---|
| 1 | **BSV Desktop** ×3 (treasury, owner, human) | <https://desktop.bsvb.tech> | Üç ayrı laptopa kur, **mainnet** cüzdanı oluştur. Kurtarma ifadesini kağıda yaz; fotoğrafını çekme, kasaya koyma (her üye kendi seed'inden sorumlu) | | 0 | Her mainnet işlemi, B2 şartı |
| 2 | **Telegram** hesabı | Telegram uygulaması | `@lexamaison`'a: treasury Desktop adresi (Payments → Receive → BSV Address) + takım adı. Aynı kanaldan Axel soruları (`00-MASTER-PLAN.md §6.4`) | | 0 | Sats (S1) |
| 3 | **Ortak şifre kasası** | Bitwarden (ücretsiz organizasyon) veya 1Password | Bir kasa aç, 4 kişiyi davet et. İçine: 7 sunucu cüzdan anahtarı, Anthropic key, Base anahtarları, VPS erişimi | | 0 | Anahtarların güvenli paylaşımı |
| 4 | **GitHub reposu** | github.com | Repo **public** olmalı (open-source şartı). 4 kişiyi collaborator yap. MIT lisansı ekle. `main` her zaman çalışır kalsın. (Not: bu ortamda GitHub MCP bağlantısı kopuk; `gh` CLI kullanın) | | 0 | Herkesin ortak çalışması, teslim |
| 5 | **Hackathon gönderim platformu** | Organizatörlere sorun (TUM Blockchain Club) | Takımı kaydedin, **BSV track**'ini seçin, teslim saatini ve formatını (repo linki, video linki, açıklama alanları) öğrenin | | 0 | Teslim |
| 6 | **Takım iletişim kanalı** | WhatsApp/Discord/Slack | Tek kanal; blokajlar burada ve `plan/STATUS.md`'de | | 0 | Koordinasyon |

## 2. Bugün (ilk birkaç saat)

| # | Ne | Nereden | Ne yapılacak | Kim | Maliyet |
|---|---|---|---|---|---|
| 7 | **Yerel geliştirme ortamı** (her laptop) | nodejs.org, git | Node **≥ 22**, git, `npm`. Starter kit'te `npm install && npm test` (38 test yeşil olmalı) | herkes | 0 |
| 8 | **Anthropic API anahtarı** (ajan beyni) | <https://console.anthropic.com> | Organizasyon aç, billing ekle veya hackathon kredisi varsa onu kullan. **Aylık harcama limiti koy** (örn. $20). Key'i kasaya, `.env`'e `ANTHROPIC_API_KEY`. Key yoksa ajanlar `AGENT_BRAIN=rules` ile çalışır, iş durmaz | | ~$5–20 |
| 9 | **EVM cüzdanı (Coop Rail PoC)** | MetaMask veya `cast wallet new` (Foundry) | İki adres: *maker* ve *agent*. Base Sepolia ağını ekle. Anahtarlar kasaya | | 0 |
| 10 | **Base Sepolia ETH (gas)** | Coinbase Developer Platform faucet, Alchemy veya QuickNode Base Sepolia faucet | İki adrese de az miktar ETH. Bazı faucet'ler giriş veya mainnet bakiyesi ister; biri olmazsa diğerini dene | | 0 |
| 11 | **Base Sepolia USDC** | <https://faucet.circle.com> (Base Sepolia seç) | *agent* adresine test USDC. Olmazsa planda kendi mock ERC-20'mizi deploy ederiz | | 0 |
| 12 | **Base RPC** | Public `https://sepolia.base.org` veya Alchemy/Infura ücretsiz hesap | Public RPC yeterli; rate limit olursa Alchemy hesabı aç | | 0 |
| 13 | **Foundry** (kontrat testi/deploy) | <https://getfoundry.sh> | D'nin laptopuna kur (`forge`, `cast`) | D | 0 |
| 14 | **BaseScan API anahtarı** (opsiyonel) | <https://basescan.org> hesabı | Kontrat doğrulama (verify) için. Jüriye okunabilir kaynak kodu gösterir | | 0 |

## 3. Altyapı (S2–S3 civarı; genişletme fazları için gerekli)

| # | Ne | Nereden | Ne yapılacak | Kim | Maliyet |
|---|---|---|---|---|---|
| 15 | **VPS** (overlay + koordinatör + sağlayıcı API + guard herkese açık çalışsın) | Hetzner, DigitalOcean, Fly.io veya Railway | 2 vCPU / 4 GB yeterli. Node 22, kalıcı disk (`data/`). Tek makinede `npm run infra`. Kredi kartı gerekiyor | | ~€5–10/ay |
| 16 | **Alan adı** | Cloudflare Registrar veya Namecheap | Örn. `agentcoop.xyz`. Alt alan adları: `overlay.`, `coop.`, `provider.`, `guard.`. **Önemli:** BSV Desktop uygulamaları originator olarak kanonik bir DNS hostname ister; gerçek bir alan adı `APP_ORIGINATOR` için de doğru seçim | | ~$2–12/yıl |
| 17 | **HTTPS** | Caddy (otomatik Let's Encrypt) veya Cloudflare proxy | Overlay ve API'ler HTTPS arkasında (guide §16.4). Tarayıcıdan erişim için CORS ayarı | | 0 |
| 18 | **WhatsOnChain API anahtarı** (opsiyonel) | <https://developers.whatsonchain.com> | Ücretsiz katman; `verifyLineage` fallback'inde 429 yememek için. Birincil kaynak Arcade, key gerekmez | | 0 |
| 19 | **Base mainnet ETH** (gas; yalnızca Faz 5 A yolu) | Coinbase veya bir borsadan **Base ağına** çekim | *maker* ve *agent* EVM adreslerine ~$1'er ETH. HTLC deploy + 2 swap birkaç sent tutar; fazlası tampon | | ~$2 |
| 20 | **Base mainnet USDC** (yalnızca Faz 5 A yolu) | Coinbase → Base ağı (köprü değil, doğrudan Base çekimi) | *agent* adresine $2, *maker* adresine $2 USDC (ileri ve ters yön birer swap). Önce ≤ $0,50 deneme | | ~$4 |
| 21 | **Claude Desktop veya Claude Code** (Faz 7 MCP demosu) | <https://claude.ai/download> | Bir üyede kurulu; `mcpServers` konfigürasyonu README'de | | 0 |

## 4. Hesap gerektirmeyen ama bilinmesi gerekenler

| Servis | Durum |
|---|---|
| **Arcade** (yayın, header'lar) | Anahtar yok. Mainnet `https://arcade-v2-us-1.bsvblockchain.tech` |
| **MessageBox** | Varsayılan public host `https://message-box-us-1.bsvb.tech`, hesap yok |
| **BananaBlocks** | Hesap yok. Kredi token'ımız otomatik "Discovered" listelenir. "Verified" yapmak **1.000 sat / token çıktısı** ücretlidir; isteğe bağlı, karar ver |
| **BSV Browser (mobil)** | <https://mobile.bsvb.tech>. Şart değil; frontend aşamasında mobil test için bir üyede kurulu olması iyi olur |
| **bOpen Claude Code plugin'leri** | Opsiyonel (`bsv-skills`, `1sat`, `bsv-mcp`); BSVA bakımında değil |

## 5. Para akışı özeti

- **BSV:** tek kaynak `desktop-treasury` (BSVA'nın gönderdiği sats). Dağıtım `scripts/fund.ts` ile (`00-MASTER-PLAN.md §6`). Hedef toplam ≈ 300k sat; genişletme fazlarındaki 50 ajanlık ölçek testi için +250k sat iste (ajan başına ~5k).
- **USD harcamaları:** Anthropic (~$5–20), VPS (~€5–10), alan adı (~$2–12), Base mainnet ETH + USDC (~$6, yalnızca Faz 5 A yolu). Toplam < $60. Kimin kartıyla ödeneceğini bugün kararlaştırın.
- **Test ağı varlıkları:** Base Sepolia ETH ve USDC ücretsiz (faucet).

## 6. Kontrol listesi (STATUS.md'ye kopyalayın)

- [ ] 3× BSV Desktop mainnet kurulu, seed'ler çevrimdışı
- [ ] `@lexamaison`'a adres gönderildi · sats geldi (miktar: …)
- [ ] Axel'e sorular gönderildi · cevaplar STATUS'ta
- [ ] Şifre kasası kuruldu, 4 kişi içeride
- [ ] Public GitHub reposu, 4 collaborator, MIT lisansı
- [ ] Hackathon platformunda kayıt + BSV track + teslim saati öğrenildi
- [ ] Herkeste Node 22 + kit testleri yeşil
- [ ] Anthropic key + harcama limiti
- [ ] 2 EVM adresi + Sepolia ETH + Sepolia USDC
- [ ] Foundry kurulu (D)
- [ ] VPS + alan adı + HTTPS (S2'ye kadar)
- [ ] USD harcamaları için kart sahibi belli
- [ ] (Faz 5 A yolu) Base mainnet ETH + USDC, maker ve agent adreslerinde
- [ ] (Faz 7) Claude Desktop/Code bir üyede kurulu
