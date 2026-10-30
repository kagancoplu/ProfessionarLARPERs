# AgentCoop — Final Fikir

> **AI ajanları için toplu satın alma ve kapasite piyasası. Nasıl ödeyeceklerini zaten biliyorlar; AgentCoop onlara daha az ödemeyi sağlıyor.**
>
> BSV Association Track — "DeFi Rails for Agentic Payments" · TUM Blockchain & AI Hackathon, 30–31 Ekim 2026
> Durum: v1, takımın 4 fikrinin birleşimi. Ana fikir `idea.md`; diğer üç fikir ona bileşen olarak eklendi.

---

## 0. Kısa özet

Ajanlar ücretli API, LLM ve GPU kapasitesini tek tek, liste fiyatından alıyor. Asıl indirimler (rezerve kapasite, batch fiyatı, hacim kademeleri) küçük ekiplerin veremeyeceği büyük ve peşin taahhütlerin arkasında. Grup alımı bu sorunu çözer ama bugün hep paranın bir aracıda toplanmasını gerektiriyor.

**AgentCoop**, ajanların satın alma gücünü birleştirip toplu paketleri hacim fiyatından almasını sağlayan **non-custodial bir DeFi katmanı**. Havuz dolana kadar herkesin parası kendi cüzdanında kalıyor. Havuz dolduğunda **tek bir atomik BSV işlemi** iki şeyi birden yapıyor: sağlayıcıya ödeme yapıyor ve her katılımcıya **kredi token'ını** (BSV-21) teslim ediyor. Bu krediler sağlayıcının API'sinde HTTP 402 ile harcanabiliyor ya da başka ajanlara atomik olarak satılabiliyor. Ajanın bütçesi, sahibinin BSV Desktop'tan yönettiği bir **Mandate Vault**'ta duruyor. Başka zincirden (ör. Base üzerinde USDC ile) gelen ajanlar havuza **atomik swap** ile katılabiliyor.

**Tek cümlelik pitch (EN):** *x402 taught agents how to pay. AgentCoop lets them pay less: non-custodial group buying for AI capacity, settled in one atomic BSV transaction.*

---

## 1. Challenge'ı nasıl okuduk

### 1.1 Zorunlu şartlar (hepsi karşılanmalı)

| # | Şart | AgentCoop'ta nasıl karşılanıyor |
|---|---|---|
| B1 | BSV TS SDK + (cüzdan gereken yerde) Wallet Toolbox | Tüm işlemler `@bsv/sdk` ile kuruluyor. Ajan, sağlayıcı sunucusu, guard ve maker cüzdanları `@bsv/wallet-toolbox` ile çalışıyor |
| B2 | Kullanıcıya dönük akışlar BSV Desktop / BSV Browser'a bağlı | Sağlayıcı havuz açıyor ve kredi basıyor, ajan sahibi vault'u fonlayıp geri çekiyor, insan katılımcı havuza katılıyor, LP backstop veriyor. Bunların hepsi `WalletClient('auto')` üzerinden |
| B3 | Gerçek işlemler (testnet veya mainnet) | BSVA'nın verdiği sats ile mainnet. Her adım bir işlem: havuz ilanı, pledge, settlement, kredi harcama, ikincil satış, swap |
| B4 | Fonların olduğu her yerde non-custodial | Havuzda toplanan bir para yok. Settlement tek atomik işlem (DvP). Vault'u guard tek başına harcayamıyor, sahip her an çekebiliyor. Swap HTLC ile |
| B5 | Projeyi kullanarak ödeme yapan en az bir AI ajanı | Ajanlar havuza giriyor (settlement ödemesi), krediyi harcıyor, kredi bitince 402 ile perakende ödüyor, ikincil piyasadan kredi alıyor |
| S1 | Açık kaynak repo + README | Monorepo, `npm run demo` ile her şey ayağa kalkıyor |
| S2 | Canlı demo veya 2–3 dk video (ajan ödemesi dahil) | §11'deki senaryo |
| S3 | Örnek işlem linkleri (WhatsOnChain) | §7'deki her işlem tipinden en az bir link README'de |
| S4 | Kullanım ve değer notu | §14'te İngilizce taslak |

### 1.2 Jüri ağırlıkları ve bizim cevabımız

| Kriter | Ağırlık | Ana kozumuz |
|---|---|---|
| Benimsenme potansiyeli, gerçek fayda | **35%** | Ölçülebilir tasarruf (%30–50). Sağlayıcıya stoksuz, peşin satılmış talep. Base'deki x402 ajanları için BSV'ye gelme nedeni. Gerçekten çalışan bir sağlayıcı (SmartRoute) |
| BSV stack kullanımı | **25%** | SDK (özel sighash, script, BEEF/SPV), Wallet Toolbox, BSV Desktop, kendi overlay'imiz, BSV-21, BRC-105/103/29, MessageBox, Arcade, basket'ler |
| Teknik uygulama ve sağlam non-custodial tasarım | **20%** | Ödeme ve teslim aynı işlemde (DvP). Sağlayıcı teklifi çevrimdışı imzalanabiliyor. Guard tek başına bir şey yapamıyor. Threat model ve mockchain testleri |
| Ajan ödemeleri | **10%** | Ajan gerçek bir iş yapıyor (araştırma) ve satın almayı kendisi yönetiyor |
| Özgünlük ve sunum | **10%** | Kimse "ajanlar birlikte satın alıyor" fikrini yapmıyor. Canlı dolan ilerleme çubuğu ve sonunda WhatsOnChain'de tek işlem |

### 1.3 Challenge'dan çıkardığımız tasarım kuralları

1. **Çekirdek ürün DeFi katmanı olmalı, ajan ikincil.** Asıl ürün havuz, kredi piyasası ve rampa. Ajan bunların müşterisi.
2. **"Working code alone is not enough."** Gerçek bir sağlayıcı gerçek bir hizmet satmalı (LLM çıkarımı) ve tasarruf rakamla gösterilmeli.
3. Track'in saydığı eksikler **stable value, likidite, swap ve zincirler arası taşıma**. Hepsine birer cevabımız var (§3.2).
4. Track'in örnek fikirlerinden üçüne doğal olarak dokunuyoruz:
   - **Launchpad:** havuz, sağlayıcının kapasiteyi almadan önce fon toplamasına yarıyor.
   - **DEX / token swap:** kredi piyasası.
   - **Cross-chain akışlar:** Coop Rail.

---

## 2. Dört fikirden ne aldık, neyi bıraktık

| Kaynak | Aldığımız | Değiştirdiğimiz veya bıraktığımız (neden) |
|---|---|---|
| **`idea.md`** (AgentCoop, ana fikir) | Ürünün kendisi: assurance contract, all-or-nothing, kredi token'ları, ikincil satış, sahibin ajana verdiği yetki, sağlayıcı modelleri, hukuki çerçeve, SmartRoute senaryosu | Yalnızca ACP'ye dayanan tasarımı bıraktık. Yerine sağlayıcının `SINGLE\|ANYONECANPAY` ile, katılımcıların `ALL` ile imzaladığı **2 aşamalı tasarımı** koyduk. Böylece idea.md'deki açık problem #2 (kredi teslim güveni) **çözülüyor** (§4.6). OrdLock'u ilk gün zorunlu tutmadık; önce imzalı listeler geliyor. `@bsv/simple/server` yerine AGENTS.md'nin önerdiği wallet-toolbox'ı kullanıyoruz |
| **`agent-spending-vault.md`** | **Mandate Vault**: ajan + guard 2-of-2, sahip her an çekebiliyor; guard politika kontrolleri; threat model yaklaşımı | idea.md'deki "sahip yetkisi" artık sadece prompt'ta yazan bir kural değil, kriptografik olarak zorlanıyor. tUSD'yi bıraktık: takımın bastığı bir "stablecoin" bir IOU olur, jüri bunu sorgular. x*y=k havuzunu bıraktık: likidite yalnızca takımdan geldiği için merkezi kalırdı |
| **`AnyRail-fikir.md`** | "Elindekiyle öde" router'ı. Zincirler arası **atomik swap** (HTLC) ve maker modeli. Servis tarafında sadece 402 kalıyor. Tek satırlık entegrasyon | AnyRail'i genel bir ödeme rayı olarak değil, AgentCoop'un **giriş rampası (Coop Rail)** olarak kullanıyoruz. BSV'de CLTV olmadığı için iade yolunu yeniden tasarladık (§4.10) |
| **`a`** (3 kullanıcı ihtiyacı) | **Ortak Veri Siparişi** = grup havuzu (çekirdek). **Kapasite Rezervasyonu** = dönemlik (forward) krediler. **Sipariş Avansı** = underwriter/backstop rolü | Teminatsız ajan kredisi (avans) 30 saatte sağlam bir non-custodial tasarımla yapılamaz, gelecek vizyonuna koyduk (§13). Havuzlardan oluşan zincir üstü satın alma geçmişi ileride bunun kredi skoru olacak |

---

## 3. Ürün

### 3.1 Beş bileşen

```
                 ┌──────────────────────── AgentCoop ────────────────────────┐
   Sağlayıcı ──▶ │  ① POOLS     toplu alım havuzu, tek atomik settlement (DvP) │
 (BSV Desktop)   │  ② CREDITS   BSV-21 kapasite kredileri → 402 ile harcanır   │
                 │  ③ MARKET    kredi ↔ sats atomik ikincil piyasa + backstop  │ ◀── LP / underwriter
   Ajan sahibi ─▶│  ④ MANDATE VAULT  ajan bütçesi: ajan+guard 2-of-2, sahip çeker│
 (BSV Desktop)   │  ⑤ COOP RAIL USDC (Base) ↔ BSV atomik swap: dış zincir girişi │ ◀── x402 ajanları
                 └───────────────────────────────────────────────────────────┘
                        ▲ hepsi: overlay (tm_agentcoop) + Arcade + WhatsOnChain
   Ajanlar (wallet-toolbox) — agent SDK + procurement router (+ MCP server)
```

| Bileşen | Ne yapıyor | Hangi fikirden |
|---|---|---|
| ① **Pools** | Sağlayıcı bir blok kapasite ilan ediyor, ajanlar katılıyor. Hedefe ulaşınca tek işlemde ödeme ve teslim oluyor, ulaşılmazsa kimsenin parası kıpırdamıyor | idea.md |
| ② **Credits** | Her sağlayıcı ürünü için bir BSV-21 token (ör. "SmartRoute Sonnet, Kasım 2026", 1 kredi = 1k çıktı token'ı). 402 API'de harcanıyor | idea.md + a |
| ③ **Market** | Elde kalan krediler imzalı listelerle satılıyor, alıcı birden fazla listeyi tek işlemde topluyor. Underwriter'lar havuzun eksik kalan kısmını alıp piyasada satıyor | idea.md + a + vault |
| ④ **Mandate Vault** | Sahip "haftada $20, havuz başına en fazla $5, sadece şu sağlayıcılar" diyor ve bu kural zincir üstündeki bir 2-of-2 ile zorlanıyor | agent-spending-vault |
| ⑤ **Coop Rail** | Base'de USDC tutan bir ajan ya da insan, HTLC ile BSV'ye geçip havuza katılıyor veya vault'unu fonluyor | AnyRail |

### 3.2 Track'in saydığı eksiklere cevaplarımız

| Track'in dediği eksik | AgentCoop'taki cevabı |
|---|---|
| **Stable value to pay with** | Krediler hizmet birimiyle (token, GPU-saati) ifade ediliyor, yani ajan ne tükettiğiyle ölçülen sabit bir değer tutuyor. Dışarıdan gelen USDC havuza girmeden hemen önce (just-in-time) BSV'ye çevriliyor, böylece ajan BSV kur riski taşımıyor |
| **Liquidity** | Kredi piyasası ve underwriter/backstop LP'ler. Havuzlar daha sık doluyor, krediler likit kalıyor |
| **Swap** | Kredi ↔ sats (atomik, imzalı listeler) ve USDC ↔ BSV (HTLC) |
| **Move funds between chains** | Coop Rail: Base'deki x402 ekonomisinden BSV'ye non-custodial giriş |

### 3.3 Neden niş, neden fark yaratır

- Diğer takımların büyük ihtimalle yapacakları: bridge, DEX, stablecoin, harcama vault'u, 402 paywall. Bunlar **"nasıl ödenir"** sorusunu cevaplıyor. Biz **"nasıl daha az ödenir"** sorusunu cevaplıyoruz, yani satın alma (procurement) katmanını yapıyoruz.
- Bu bir finans primitifi. Çok taraflı, all-or-nothing, atomik teslimli bir **grup alım protokolü** ve onun ikincil piyasası. Bridge, swap ve vault gibi "herkesin yaptığı" parçalar bizde ürünün kendisi değil, ürünü besleyen **bileşenler**.
- **BSV'ye özgü:** 100 katılımcılı bir havuz Ethereum'da her katılımcı için approve + deposit gerektirir (para kontratta bekler) ve başarısızlıkta herkes refund gas'ı öder. BSV'de para yatırma da iade de yok; yüzlerce taraf tek işlemde, bir sentin çok altında bir ücretle buluşuyor (§5).

---

## 4. Mekanizma (teknik çekirdek)

### 4.1 Tek ilke

> **Herkesin varlığı, son ana kadar kendi cüzdanında kalır. Sonra tek bir işlem ya herkes için gerçekleşir ya da hiç gerçekleşmez.**

Sağlayıcının kredileri sağlayıcının cüzdanında, ajanların sats'ı ajanların cüzdanında (veya vault'unda) duruyor. Hiçbir aşamada ortak bir hesap, kontrat bakiyesi ya da emanet yok.

### 4.2 Bunu mümkün kılan teknik gerçek (doğrulandı)

- `@bsv/sdk` 3.2.1'deki `TransactionSignature.format` fonksiyonu `SIGHASH_ALL`, `SIGHASH_SINGLE`, `SIGHASH_NONE` ve `SIGHASH_ANYONECANPAY` scope'larını hesaplayabiliyor.
- Starter kit'teki `client/signer.ts`, sighash ön görüntüsünü **uygulama tarafında** hesaplayıp cüzdana `createSignature({ hashToDirectlySign })` ile imzalatıyor. Bu yol mainnet'te BSV Desktop ile token transferlerinde doğrulanmış. Dolayısıyla **BSV Desktop da wallet-toolbox ajanları da**, başkasının kurduğu çok taraflı bir işlemde kendi girdilerini istedikleri scope ile imzalayabiliyor. (idea.md'deki "Wallet support" sorusunun cevabı bu.)

### 4.3 Havuzun yaşam döngüsü

```
1. OFFER     Sağlayıcı (BSV Desktop) havuz açar:
             - N kredilik bir BSV-21 UTXO'yu kendine ayırır ve havuz ilanını
               (koşullar, fiyat P, hedef, son tarih) tek tx'te zincire yazar
             - O kredi UTXO'sunu SIGHASH_SINGLE|ANYONECANPAY ile imzalar:
               "Bu N krediyi, aynı index'teki çıktı bana P sat ödediği sürece
               kim alırsa alsın." Böylece sağlayıcı çevrimdışı kalabilir.
2. PLEDGE    Ajan veya insan, kendi cüzdanında ayrı bir basket'e (agentcoop)
             bir "pledge coin" ayırır ve kaydı OP_RETURN ile zincire yazar.
             Para hâlâ kendi anahtarında; overlay ilerlemeyi zincirden sayar.
3. WITHDRAW  Son ana kadar serbest: coin'i harcamak pledge'i iptal eder.
4. LOCK-IN   Hedefe ulaşıldı. Koordinatör settlement tx şablonunu kurar ve
             her katılımcıya MessageBox/WS üzerinden gönderir.
5. SIGN      Her katılımcı TAM işlemi doğrular (benim kredim var mı, sağlayıcı
             girdisi overlay'de geçerli mi, para üstüm doğru mu) ve SIGHASH_ALL
             ile imzalar. Vault'taki ajanlar için guard da imzalar (§4.9).
6. SETTLE    Bütün imzalar toplanınca Arcade'e yayın (EF formatı) yapılır,
             overlay'e submit edilir. Sağlayıcı ödenmiş, her ajan kredisini
             almış olur: tek tx, tek WhatsOnChain linki.
7. FAIL      Son tarih geçti: hiçbir şey yayınlanmaz, kimsenin bakiyesi
             değişmez. Pledge coin'leri bir sonraki havuzda kullanılabilir.
```

### 4.4 Settlement işleminin yapısı

```
INPUTS                                          OUTPUTS
[0] Sağlayıcı kredi UTXO'su (N kredi, 1 sat) ─▶ [0] P sat → sağlayıcı
    imza: SINGLE|ANYONECANPAY (havuz açılırken)     (input 0 ile eşli, sağlayıcı sadece bunu imzalar)
[1] Pledge coin — Ajan A (vault script)         [1] BSV-21 transfer kA kredi → A'nın token adresi
[2] Pledge coin — Ajan B (wallet-toolbox)       [2] BSV-21 transfer kB kredi → B
[3] Pledge coin — İnsan C (BSV Desktop)         [3] BSV-21 transfer kC kredi → C
 …                                               …   (Σ k = N, tam eşit; artan kredi yanardı)
    imza: SIGHASH_ALL (lock-in anında,          [n+1 … 2n] para üstü → her katılımcının vault'u / basket'i
           tüm işlemi görerek)                  [2n+1] OP_RETURN  agentcoop · settle · poolId · terms hash
```

- **Ödeme ve teslim aynı işlemde.** Sağlayıcının parayı alıp krediyi göndermemesi diye bir senaryo yok.
- Sağlayıcının imzası, karşılığında P sat almadığı hiçbir işlemde geçerli olmuyor. Katılımcıların imzası da her şeyi kapsıyor (ALL), bu yüzden koordinatör hiçbir çıktıyı değiştiremiyor.
- **Ücret:** yaklaşık 100 sat/kB ile 20 katılımcılı bir settlement ~7 kB tutuyor, bu da birkaç yüz sat demek (< $0.001). Ücret katılımcıların para üstünden eşit olarak düşülüyor. (Gerçek ücret politikasını Arcade `/health` üzerinden doğrulayın.)
- Pledge coin'ler tam tutarda olmak zorunda değil, çünkü para üstü çıktısı var. idea.md'deki "sabit boyutlu share" kısıtı kalkıyor.

### 4.5 Kenar durumlar

| Durum | Ne oluyor |
|---|---|
| Katılımcı lock-in'de imzalamıyor veya coin'ini harcıyor | Zaman aşımı (ör. 60 sn) dolunca yeri bekleme listesindeki birine ya da backstop'a geçiyor ve şablon yeniden kuruluyor. Kimse para kaybetmiyor. Kimlik anahtarına itibar cezası yazılıyor |
| Bir balina sağlayıcının teklifini tek başına alıyor | Ekonomik olarak sorun değil: sağlayıcı bloğunu satmış oluyor. Havuz katılımcılarının coin'lerine dokunulmamış oluyor (bu da bir "underwriter" davranışı) |
| Sağlayıcı havuzu iptal ediyor | Kredi UTXO'sunu harcıyor, teklif geçersiz oluyor, kimse etkilenmiyor |
| Kısmi dolum | MVP'de fill-or-kill (tam N). Backstop, eksik kalan kısmı tamamlıyor (§4.11) |

### 4.6 Karar notu: idea.md'deki ACP-Lighthouse tasarımından neden ayrıldık

idea.md'de katılımcılar `ALL|ANYONECANPAY` ile önceden imza atıyordu. Bu imza **bütün çıktıları** sabitlemek zorunda, ama ilk katılımcı imzalarken kimin geleceği bilinmiyor. Bu yüzden kredi çıktıları aynı işleme konamıyor ve teslim, sağlayıcının sonradan ayrıca yaptığı bir işlem olarak kalıyor (idea.md risk #2). Ayrıca ACP pledge'i de coin harcanarak her an geri çekilebiliyor. Yani ACP, griefing'e karşı 2 aşamalı tasarımdan daha güçlü değil.

**İçgörü:** Lighthouse, pledge verip ortadan kaybolan *insanlar* için tasarlanmıştı. Ajanlar ise sürekli çevrimiçi, onlar için ikinci bir imza turunun maliyeti sıfır. Bu sayede Lighthouse'un yapamadığını yapabiliyoruz:

1. Ödeme ve teslim tek işlemde (DvP).
2. Guard tam işlemi görüp "ajan ödüyor **ve** kredisini alıyor" kuralını zorlayabiliyor.
3. Pledge'ler tam tutarda olmak zorunda değil.

Sağlayıcı tarafında ise ACP'nin gücünü koruyoruz: `SINGLE|ANYONECANPAY` sayesinde sağlayıcı teklifini bir kez imzalayıp çevrimdışı kalabiliyor. Bir tasarım notu olarak ileride çevrimdışı insanlar için bir "Lighthouse modu" (ACP pledge) eklenebilir (§10, Katman 3).

### 4.7 Kredilerin kullanılması (402)

- **Perakende (kredi yoksa):** SmartRoute `@bsv/auth-express-middleware` ve `@bsv/payment-express-middleware` ile **BRC-105** kullanıyor. Ajan `AuthFetch` ile ödüyor. Resmi protokolü kullanıyoruz, kendi header'ımızı icat etmiyoruz.
- **Kredi ile:** Ajan, kimliği doğrulanmış (BRC-103) bir `/credits/redeem` çağrısıyla k krediyi sağlayıcının token adresine gönderiyor (normal bir BSV-21 transferi). Sağlayıcı bunu overlay'de doğrulayıp ajanın kimliğine ön ödemeli bakiye yazıyor. Sonraki çağrılarda `calculateRequestPrice` ön ödemeli bakiye yettiği sürece 0 döndürüyor (ve bakiyeyi düşüyor), yetmediğinde perakende sats fiyatına geçiyor.
- Geri dönen krediler sağlayıcının stoğuna giriyor. Sağlayıcı bunları yakabilir ya da bir sonraki havuzda yeniden satabilir.

### 4.8 Market: imzalı listeler ve toplu alım (sweep)

- **Liste:** Satıcı, kredi UTXO'sunu `SINGLE|ANYONECANPAY` ile imzalıyor: "bu k krediyi, aynı index'teki çıktı bana q sat ödediği sürece veriyorum". Bu, sağlayıcı teklifiyle **aynı primitif**: tek mekanizma, iki ürün. Covenant gerekmiyor ve satıcı çevrimdışı olabiliyor.
- **Alım:** Alıcı birden fazla listeyi tek işlemde topluyor (girdi i ↔ ödeme çıktısı i). Krediler tek bir çıktıda alıcıya gidiyor. Alıcı `ALL` ile imzalamadan önce kredi girdilerinin overlay'de geçerli ve harcanmamış olduğunu kontrol ediyor.
- **İptal:** Satıcı coin'ini harcıyor.
- **Katman 3:** OrdLock listeleri (1Sat ekosistemi `createOrdTokenListings` / `buyBsv21`) ile krediler mevcut 1Sat Market'te de görünür hale geliyor.

### 4.9 Mandate Vault (sahibin yetkisinin zincir üstünde zorlanması)

```
locking script:
OP_IF
    <ownerPub> OP_CHECKSIG                              ← sahip tek başına, her an (BSV Desktop)
OP_ELSE
    OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG    ← ajan + guard birlikte
OP_ENDIF
```

- **Fonlama:** Sahip BSV Desktop'tan `createAction` ile bu script'e para kilitliyor. Çıktı, sahibin kendi cüzdanında `agentcoop vault` basket'inde, `customInstructions` ile birlikte takip ediliyor.
- **Guard (wallet-toolbox sunucusu) politikaları:**
  - Ödenen taraf allowlist'te mi?
  - Havuz başına üst sınır ve haftalık kayan toplam aşılıyor mu?
  - **DvP:** aynı işlemde ajanın token adresine en az beklenen miktarda kredi gidiyor mu, ve o kredi girdisi overlay'de geçerli mi?
  - Para üstü aynı vault script'ine dönüyor mu?
  - Ücret tavanı aşılıyor mu?

  Guard tam işlemi gördüğü için (ALL) bütün bunları kontrol edebiliyor.
- **Küçük harcamalar için sıcak cüzdan:** Perakende 402 çağrıları için guard'ın onayladığı küçük günlük tavanlarla ajanın sıcak cüzdanına (wallet-toolbox `default` basket) para aktarılıyor. Böylece `AuthFetch` standart şekilde çalışıyor. Büyük taahhütler (havuz, market) doğrudan vault'tan yapılıyor.
- **Non-custodial:** Guard tek başına ve ajan tek başına fonu oynatamıyor. Sahip her an tek imzayla çekebiliyor. Guard açık kaynak ve sahip isterse kendi sunucusunda çalıştırabiliyor.
- **Bilinen sınır:** Kredi çıktıları ajanın kendi token adresine gidiyor, dolayısıyla ajan krediyi piyasada satıp guard'ı atlatabilir. Bu kaçağın tutarı küçük ve krediler zaten belirli bir sağlayıcıya bağlı. Katman 3'te kredi çıktısını da vault script'ine kilitleyerek (kendi topic manager'ımızla) bunu kapatıyoruz.
- **Demo anı:** Prompt injection'a uğramış ajan "bütçenin %100'ünü X havuzuna yatır" diyor. Guard imzayı reddediyor ve hiçbir şey hareket etmiyor.

### 4.10 Coop Rail: USDC (Base) ↔ BSV atomik swap

**Doğrulanmış kısıt:** BSV'de Genesis yükseltmesiyle `OP_CHECKLOCKTIMEVERIFY` ve `OP_CHECKSEQUENCEVERIFY` NOP'a döndü, Chronicle (2026) da bunları geri getirmedi. `nLockTime` ise orijinal anlamıyla çalışıyor. Bu yüzden BSV tarafındaki iade yolu script içinde değil, **önceden imzalanmış nLockTime'lı bir iade işlemiyle** kuruluyor.

```
Ajan (secret s, h = SHA256(s))                       Maker (takımın LP botu)
1. Base: USDC'yi Solidity HTLC'ye kilitler (h, maker, timeout 2T)
2.                                                    BSV HTLC funding tx'i kurar (henüz yayınlamaz)
   BSV script:  OP_IF OP_SHA256 <h> OP_EQUALVERIFY <agentPub> OP_CHECKSIG
                OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
3. Ajan, maker'ın iade tx'ini imzalar (ELSE dalı, nLockTime = T)  ──▶  maker funding'i yayınlar
4. Ajan s ile BSV'yi alır (doğrudan vault'una veya bir pledge coin'e). s zincirde açığa çıkar
5.                                                    Maker s ile Base'deki USDC'yi alır (2T'den önce)
   Aksilik olursa: ajan 2T'den sonra USDC'sini geri alır, maker T'den sonra BSV'sini geri alır.
```

- Funding işlemini **version 1** ile kuruyoruz. Chronicle, malleability kısıtlarını yalnızca version > 1 işlemler için kaldırdı; version 1 kullanarak önceden imzalanmış iade işleminin txid malleability'den korunmasını sağlıyoruz.
- **İnsan akışı:** Sahip MetaMask'teki USDC'yi Coop Rail üzerinden doğrudan Mandate Vault'una aktarabiliyor. Bu, "diğer zincirlerden kullanıcı ve likidite getirme" maddesinin insan tarafındaki karşılığı.
- **Ağ seçimi:** Geliştirme için Base Sepolia. Demo için Base mainnet'te $1–2 USDC öneriyoruz, gas bir sentin altında. Böylece iki taraf da gerçek oluyor ve jüriye "gerçek likidite" göstermiş oluyoruz.

### 4.11 Havuz tipleri (`a` dosyasından)

| Tip | Kullanıcının söylediği | Mekanizma |
|---|---|---|
| **Ortak Sipariş** (grup havuzu) | "İhtiyacım var ama bütün maliyeti tek başıma karşılamak istemiyorum" | §4.3, çekirdek |
| **Kapasite Rezervasyonu** (forward) | "Param var, hizmetin zamanında hazır olmasını istiyorum" | Dönemlik kredi token'ı (ör. "SR-Sonnet-2611"). Sağlayıcı yalnızca dönem içinde kullanıma açıyor. Gelecek dönemlerin kredileri piyasada fiyatlanıyor, bu da AI kapasitesi için bir **forward eğrisi** oluşturuyor |
| **Backstop / Underwriter** (Sipariş Avansı'nın sağlam hali) | "Havuz dolsun diye riski ben alayım, karşılığında marj kazanayım" | LP "son X dakikada eksik kalan en fazla Y payı ben tamamlarım" diye pledge veriyor. Aldığı kredileri piyasada havuz fiyatı ile perakende fiyatı arasında satıyor. Havuzların dolma oranını artıran gerçek bir likidite rolü |

---

## 5. Neden BSV

- **Çok taraflı atomik işlem ucuz ve doğal.** UTXO modeli, onlarca tarafın tek bir işlemde kendi girdisini imzalamasına izin veriyor. Ne para yatırma ne iade gerekiyor. Sighash scope'ları (ALL, SINGLE|ACP) sayesinde sağlayıcı çevrimdışı teklif verebiliyor. Hesap tabanlı zincirlerde aynı şey, paranın kontratta beklemesi demek.
- **Ücret ihmal edilebilir.** Kuruşluk pledge'ler, yüzlerce katılımcılı settlement'lar ve çağrı başına 402 ekonomik olarak anlamlı.
- **Stack'te her parça hazır:** BRC-100 cüzdanlar, BSV-21 ile overlay, BRC-105 ve 402, BRC-29, MessageBox, Arcade.
- **Ağa zincir üstü talep yaratıyor.** Her havuz ilanı, pledge, settlement, kredi harcama, ikincil satış ve swap bir işlem. Krediler de BananaBlocks'ta görünen gerçek BSV-21 piyasaları oluyor.

---

## 6. Aktörler ve cüzdanlar

| Aktör | Cüzdan | Ne yapıyor |
|---|---|---|
| **Sağlayıcı operatörü** (insan) | **BSV Desktop** | Kredi token'ını basıyor, havuz açıyor, teklifi imzalıyor, iptal ediyor |
| **SmartRoute sunucusu** | wallet-toolbox | 402 tahsilatı, kredi kullanımı, (ileride) havuz başına yeniden teklif |
| **Ajan sahibi** (insan) | **BSV Desktop** (+ MetaMask, Rail için) | Vault'u fonluyor, politikayı belirliyor, geri çekiyor, ajanın kararlarını izliyor |
| **İnsan katılımcı / LP** | **BSV Desktop** | Havuza doğrudan katılıyor, backstop veriyor, piyasada alıp satıyor |
| **AI ajanları** (3–5 adet) | wallet-toolbox (+ vault) | Araştırma işini yapıyor; satın alma, pledge, kredi harcama, ikincil satış, swap |
| **Guard** | wallet-toolbox | Vault politikasını uygulayan ortak imzacı |
| **Koordinatör** | wallet-toolbox (yalnızca kimlik) | Şablon kuruyor, imzaları topluyor, yayınlıyor. **Hiç para tutmuyor**; bu rolü herkes çalıştırabilir |
| **Maker** | wallet-toolbox + EVM anahtarı | Coop Rail'in karşı tarafı |

---

## 7. Zincir üstü işlem kataloğu (README'deki WhatsOnChain linkleri)

| # | İşlem | İmzalayan / scope | WhatsOnChain'de görünen |
|---|---|---|---|
| T1 | Kredi token deploy | Sağlayıcı (BSV Desktop) | BSV-21 deploy+mint (BananaBlocks'ta da görünür) |
| T2 | Havuz ilanı ve kredi ayırma | Sağlayıcı | N kredilik UTXO ve OP_RETURN koşulları |
| T3 | Pledge | Ajan / insan | Pledge coin ve OP_RETURN (poolId, payı) |
| T4 | Pledge iptali | Pledge sahibi | Coin harcanmış, havuz ilerlemesi düşmüş |
| **T5** | **Settlement (DvP)** | Sağlayıcı SINGLE\|ACP, herkes ALL | **N girdi; sağlayıcıya ödeme ve herkese kredi tek tx'te** |
| T6 | Kredi kullanımı (redeem) | Ajan | BSV-21 transfer → sağlayıcı |
| T7 | Perakende 402 ödemesi | Ajan (AuthFetch) | BRC-29 ödemesi → SmartRoute |
| T8 | Market listesi doldurma (sweep) | Satıcılar SINGLE\|ACP, alıcı ALL | Birden fazla satıcıya ödeme ve alıcıya kredi |
| T9 | Vault fonlama ve sahibin geri çekmesi | Sahip (BSV Desktop) | Özel script çıktısı ve OP_IF dalından harcama |
| T10 | Guard'ın onayladığı ödeme | Ajan + guard 2-of-2 | Multisig dalından harcama |
| T11 | Coop Rail (BSV tarafı) | Maker funding, ajan claim | Hashlock'lı çıktı, claim'de preimage s görünür |
| T11b | Coop Rail (Base tarafı) | Ajan lock, maker claim | BaseScan'de HTLC kontratı |

---

## 8. Non-custodial analiz ve threat model

| Tehdit | Önlem |
|---|---|
| Koordinatör çalmaya çalışıyor | Koordinatörün anahtarı ve parası yok. Herkes tam işlemi doğrulayıp ALL ile imzalıyor, istemci tarafında açık kaynak bir DvP doğrulayıcı çalışıyor |
| Sağlayıcı parayı alıp krediyi göndermiyor | İmkansız, çünkü ödeme ve teslim aynı işlemde |
| Sağlayıcı krediyi verip hizmeti vermiyor | Her ön ödemede olan bir kalıntı güven. Hafifletmeler: krediler piyasada satılabiliyor (çıkış yolu var), zincir üstü itibar, ileride sağlayıcı teminatı |
| Katılımcı lock-in'de kaçıyor | Bekleme listesi, backstop, zaman aşımı, itibar cezası. Kimse para kaybetmiyor |
| Sahte kredi (BSV-21 sahteciliği) | İmzalamadan önce overlay doğrulaması (kit kuralları: kaynak, enflasyon, çapraz token) |
| Ajan prompt injection'a uğruyor | Guard politikası ve vault tavanı; sahip her an iptal edebiliyor |
| Guard ele geçiriliyor | Tek başına fonu oynatamıyor, sahibin çıkış yolu açık |
| Ajan ve guard birlikte ele geçiriliyor | Kayıp vault bakiyesiyle sınırlı (sahip haftalık bütçe yüklüyor). Katman 3'te covenant vault (Chronicle opcode'ları OP_PUSH_TX'i kolaylaştırıyor) |
| BRC-100 "kör hash imzası" (cüzdan işlemi gösteremiyor) | Pledge coin'leri ayrı basket'te ve sınırlı tutarda, yani en kötü kayıp pledge tutarı kadar. İmzalamadan önce istemci doğrulaması yapılıyor. Bunu dürüstçe README'de yazıyoruz |
| HTLC'de karşı taraf kaçıyor | Zaman aşımı ve önceden imzalanmış iade. Version 1 işlem kullanıldığı için malleability riski yok |
| 402 tekrar oynatma (replay) | Middleware'in replay store'u (birden fazla süreç varsa paylaşılan ve atomik bir store) |

---

## 9. Mimari ve repo yapısı

```
agentcoop/
├─ AGENTS.md                      ← docs/AGENTS.md kopyası (AI asistanlar için)
├─ packages/
│  ├─ core/        havuz/pledge/teklif/settlement/listing builder'ları, sighash imzalama
│  │               (BRC-100 + wallet-toolbox), DvP doğrulayıcı, vault & HTLC script'leri  ← kritik yol
│  ├─ overlay/     tm_agentcoop + ls_agentcoop (havuz, pledge, teklif, liste, settlement, vault)
│  │               + kredi token topic'i (kit kuralları, çok taraflı tx testleri)
│  ├─ agent-sdk/   procurement router: kredi → market → havuz → perakende 402 → rail
│  └─ mcp/         (K3) AgentCoop araçları MCP server olarak: herhangi bir LLM ajanı havuza girer
├─ apps/
│  ├─ web/         Havuz gezgini (canlı ilerleme), sağlayıcı konsolu, sahip konsolu, market  [BSV Desktop]
│  ├─ smartroute/  LLM gateway (Claude API) + BRC-105 402 + /credits/redeem
│  ├─ coordinator/ lock-in, imza turu (MessageBox/WS), Arcade yayını
│  ├─ guard/       vault politika motoru
│  ├─ agents/      3–5 araştırma ajanı + demo orkestrasyonu
│  └─ maker/       Coop Rail LP botu
├─ contracts/base-htlc/   Solidity HTLC (USDC) + testleri
└─ test/          wallet-toolbox mockchain ile uçtan uca senaryolar
```

**Sağlayıcının indirim mantığı gerçek:** Peşin taahhüt edilmiş ve zamanı esnek talep, sağlayıcının upstream'de daha ucuz modlara geçmesini sağlıyor. Örnekler: LLM'lerde batch API'leri (Anthropic Message Batches, yaklaşık %50 indirim; güncel fiyatı doğrulayın), GPU'da rezerve kapasite (idea.md'deki tablo). Günlük rapor üreten araştırma ajanları zaten batch'e uygun bir iş yükü.

---

## 10. Kapsam ve inşa sırası

Kapsamı küçültmüyoruz; altı kişi paralel çalışıyor. Katmanlar **inşa sırası**, kesinti listesi değil. Her katman kendi başına demo edilebilir bir noktada bitiyor.

| Katman | İçerik |
|---|---|
| **K1 — Omurga** | Pools (teklif, pledge, DvP settlement), BSV-21 krediler, overlay, SmartRoute (402 ve redeem), 3–5 ajan, sağlayıcı konsolu, BSV Desktop ile insan pledge'i, canlı havuz gezgini, başarısız havuz senaryosu |
| **K2 — Tam vizyon** (ilk saatten paralel) | Mandate Vault, guard ve sahip konsolu; Market (imzalı listeler ve sweep); Coop Rail (Base HTLC ve maker); backstop underwriter; agent SDK router'ı |
| **K3 — Sıçrama** | MCP server; OrdLock ile 1Sat Market listeleri; dönemlik (forward) krediler ve forward eğrisi; organizer ajan (hacim kademesi bulup havuz açan); kredi çıktısını vault'a kilitleme; covenant vault; çevrimdışı insanlar için Lighthouse modu |

### Ekip planı (6 kişi; isimleri siz atayın)

| Rol | Sahiplik | İlk teslim |
|---|---|---|
| **A — Protokol** | `packages/core`: builder'lar, sighash imzalama, DvP doğrulayıcı, mockchain testleri | 2 ajan ve 1 sağlayıcı ile mainnet'te ilk settlement |
| **B — Overlay** | `packages/overlay` + gezgin API'si + canlı akış (WS) | Havuz ilerlemesinin zincirden sayılması |
| **C — Sağlayıcı** | `apps/smartroute` + sağlayıcı konsolu (BSV Desktop) | 402 perakende ve kredi kullanımı |
| **D — Ajanlar** | `apps/agents` + `agent-sdk` + MessageBox + demo orkestrasyonu (+ K3 MCP) | Karar loglarıyla pledge veren ajanlar |
| **E — Vault** | vault script'leri + `apps/guard` + sahip konsolu (BSV Desktop) | Fonla → guard onaylı ödeme → reddedilen injection → geri çek |
| **F — Rail ve Market** | `contracts/base-htlc` + `apps/maker` + market modülü | USDC → BSV swap'ı ve liste sweep'i |

Ortak UI kabuğu (`apps/web`) C ve E arasında paylaşılıyor. Video, README ve değer notu son saatlerde C ve D'de.

### Kilometre taşları (H0 = kodlamaya başlama; teslim saatinden geriye doğru ayarlayın)

| Zaman | Hedef |
|---|---|
| **H+2** | Monorepo kurulu; BSV Desktop cüzdanları hazır; @lexamaison'dan sats istendi; starter kit'in 38 testi yeşil; Claude API anahtarı ve Base cüzdanı hazır |
| **H+5** | **Walking skeleton:** sabit kodlanmış 2 ajan ve 1 sağlayıcı ile mainnet'te ilk DvP settlement. İlk WhatsOnChain linki. Projenin en büyük teknik riski burada kapanıyor |
| **H+10** | Overlay indeksleme, BSV Desktop ile havuz açma ve pledge, SmartRoute 402 ve redeem, ajanlar uçtan uca |
| **H+16** | Vault ve guard, market sweep'i, Coop Rail swap'ı, başarısız havuz entegre |
| **H+20** | Feature freeze, UI cilası, demo kaydı, işlem linklerinin toplanması |
| **H+22–24** | README, değer notu, video kurgusu, teslim |

---

## 11. Demo senaryosu (≈3 dk video)

| Zaman | Sahne |
|---|---|
| 0:00–0:20 | **Problem:** perakende ve toplu fiyat farkı; ajanlar taahhüt veremiyor; grup alımı emanet gerektiriyor |
| 0:20–0:45 | Sağlayıcı (BSV Desktop) "1.000 Sonnet kredisi, %50 indirimli, 24 saat" havuzunu açıyor (onay pencereleri görünüyor). Ajan sahibi vault'u fonlayıp politikayı yazıyor |
| 0:45–1:30 | 4 ajan havuzu overlay'den buluyor, ihtiyaçlarını tahmin ediyor ve pledge veriyor (karar logları ekranda), ilerleme çubuğu doluyor. Bir ajan Base'den USDC ile geliyor ve Coop Rail ile swap yapıyor (iki zincirde de link var). Injection'a uğrayan ajanı guard reddediyor |
| 1:30–1:55 | Lock-in ve imza turu → WhatsOnChain'de **tek settlement işlemi**: N girdi, sağlayıcı ödenmiş, her ajan kredisini almış. *"Kimse kimsenin parasını bir saniye bile tutmadı."* |
| 1:55–2:25 | Ajan kredisini harcayıp SmartRoute'u (402) çağırıyor ve gerçek bir araştırma özeti üretiyor. Başka bir ajan elinde kalanı listeliyor, geç gelen bir ajan listeyi atomik olarak alıyor |
| 2:25–2:45 | Dolmayan bir havuzun son tarihi geçiyor; bakiyeler hiç değişmemiş. Sahip BSV Desktop'tan vault'u geri çekiyor |
| 2:45–3:00 | Rakamlar: ajan başına tasarruf, işlem sayısı, settlement başına ücret. Neden BSV |

---

## 12. Riskler ve B planları (kapsamı korurken riski azaltmak)

| Risk | Erken test | B planı |
|---|---|---|
| BSV Desktop'ta özel scope ile `createSignature` | H+2: tek bir SINGLE\|ACP imzası | Cüzdan scope'u bilmiyor, sadece hash imzalıyor; düşük risk. Olmazsa insan tarafı yalnızca ALL kullanır, teklifler sunucu cüzdanından verilir |
| Token overlay'inin çok taraflı settlement'ı kabul etmesi | H+5 walking skeleton | Kit kuralları yalnızca token girdilerini topluyor; gerekirse kendi topic manager'ımızda kuralı genişletiriz |
| İmza turunun koordinasyonu | Mockchain testleri | Zaman aşımı, bekleme listesi, backstop |
| CJS/ESM ile iki SDK kopyası | Starter kit'teki `vitest.config.ts` alias'ı | Node'da tek bir build kullanmak |
| `@bsv/402-pay` originator hatası | — | Birincil olarak BRC-105 (AuthFetch); 402-pay gerekirse `withHostOriginator()` |
| WhatsOnChain 429 hataları | — | Header'lar ve yayın için Arcade |
| HTLC zamanlaması | Base Sepolia'da prova | Demoda kısa zaman aşımları (10/20 dk) |

---

## 13. Gelecek vizyonu

- **Gelir teminatlı avans** (`a`'daki Sipariş Avansı): havuzlardaki zincir üstü satın alma geçmişi ajanın kredi skoruna dönüşüyor.
- **ICP chain-key ile non-custodial stablecoin köprüsü** (track örneği). Havuzlar doğrudan köprülenmiş USDC ile ödeniyor. STAS geldiğinde düzenlenmiş stable varlıklar.
- **Sağlayıcı teminatı ve itibar**, hizmet teslimindeki kalıntı güveni azaltmak için.
- **Çok sağlayıcılı açık teklif pazarı:** sağlayıcılar aynı havuz için rekabet ediyor (AnyRail'in çoklu maker vizyonu).
- **Organizer ve hedger ajanlar:** hacim kademelerini keşfedip havuz açan ve forward kapasite alan ajanlar.

---

## 14. Usage & value note (submission draft, EN)

**Problem.** AI agents buy compute, model capacity and data one call at a time at list price. Real discounts (reserved GPUs, batch pricing, volume tiers) require large upfront commitments small teams cannot make, and pooling today means trusting an intermediary with everyone's money.

**What AgentCoop is.** A non-custodial group-buying layer on BSV. Providers publish a pool and pre-sign their credits as an open offer. Agents pledge from their own wallets, and when the pool fills a single atomic transaction pays the provider and delivers BSV-21 credits to every participant. Credits are spent on the provider's API over HTTP 402 or resold on an atomic secondary market. Agent budgets live in owner-controlled Mandate Vaults, and agents holding USDC on Base can join via an atomic swap.

**Target users.** Small AI teams and agent operators (buyers); AI infra resellers, LLM routers, GPU and data providers (sellers, who get pre-paid, all-or-nothing demand with zero inventory risk); liquidity providers (underwriters).

**Value for BSV.** New users and liquidity from other chains (x402 agents on Base), recurring multi-party settlement transactions, tradable BSV-21 credit markets, and per-call micropayment volume. All of it is only practical because BSV makes multi-party atomic transactions and cent-sized payments cheap.

---

## 15. Hemen yapılacaklar ve Axel'e (@lexamaison) sorular

**Şimdi:**
1. BSV Desktop → Payments → Receive → adres ve takım adını @lexamaison'a gönderin (sats için).
2. `docs/AGENTS.md`'yi repo köküne kopyalayın. Starter kit'te `npm test` çalıştırın.
3. Claude API anahtarını (SmartRoute için) ve Base cüzdanını ($1–2 USDC + gas) hazırlayın.
4. Rolleri (A–F) isimlere atayın ve H+5 walking skeleton'a odaklanın.

**Axel'e sorular:**
1. Ajan + guard 2-of-2 ve sahibin çıkış yolundan oluşan vault, jüri için "non-custodial" sayılır mı?
2. Base ile HTLC tabanlı bir zincirler arası akış "cross-chain flow" olarak değerlendirilir mi? Base mainnet ile küçük tutarlarda çalışmamız uygun mu?
3. Kendi overlay topic'imizi (`tm_agentcoop`) yazmamız teşvik ediliyor mu? Herkese açık overlay barındırma imkânı var mı?
4. BSV Desktop'ın `hashToDirectlySign` için yapılandırılmış (işlemi gösteren) bir imza planı var mı? Threat model notumuz için soruyoruz.
5. Ajanların wallet-toolbox sunucu cüzdanlarını, insanların BSV Desktop'ı kullanması "BSV wallet" şartı için yeterli mi?
