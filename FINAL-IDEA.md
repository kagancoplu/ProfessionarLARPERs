# AgentCoop — Final Fikir

> **AI ajanları için toplu satın alma ve kapasite piyasası. Nasıl ödeyeceklerini zaten biliyorlar; AgentCoop onlara birlikte ve emanetsiz satın almayı sağlıyor.**
>
> BSV Association Track — "DeFi Rails for Agentic Payments" · TUM Blockchain & AI Hackathon, 30–31 Ekim 2026
> Durum: **v1.1**. Takımın 4 fikrinin birleşimi; bağımsız inceleme sonrası yama uygulandı (değişiklik listesi §16). Ana fikir `idea.md`; diğer üç fikir ona bileşen olarak eklendi.

---

## 0. Kısa özet

Ajanlar ücretli API, LLM ve GPU kapasitesini tek tek, liste fiyatından alıyor. Asıl indirimler (rezerve GPU blokları, provisioned throughput, proxy plan kademeleri) küçük ekiplerin veremeyeceği büyük ve peşin taahhütlerin arkasında. Grup alımı bu sorunu çözer ama bugün hep paranın bir aracıda toplanmasını gerektiriyor.

**AgentCoop**, ajanların satın alma gücünü birleştirip toplu paketleri almasını sağlayan **non-custodial bir DeFi katmanı**. Havuz dolana kadar herkesin parası kendi cüzdanında kalıyor. Havuz dolduğunda **tek bir atomik BSV işlemi** iki şeyi birden yapıyor: sağlayıcıya ödeme yapıyor ve her katılımcıya **kredi token'ını** (BSV-21) teslim ediyor. Bu krediler sağlayıcının API'sinde HTTP 402 ile harcanabiliyor ya da başka ajanlara atomik olarak satılabiliyor. Ajanın bütçesi, sahibinin BSV Desktop'tan yönettiği bir **Mandate Vault**'ta duruyor. Başka zincirden (ör. Base üzerinde USDC ile) gelen ajanlar havuza **atomik swap** ile katılabiliyor.

**Tek cümlelik pitch (EN):** *x402 taught agents how to pay. AgentCoop lets many agents buy one block of capacity together, with no deposits, no escrow and no refunds: one atomic BSV transaction pays the provider and delivers every share.*

---

## 1. Challenge'ı nasıl okuduk

### 1.1 Zorunlu şartlar (hepsi karşılanmalı)

| # | Şart | AgentCoop'ta nasıl karşılanıyor |
|---|---|---|
| B1 | BSV TS SDK + (cüzdan gereken yerde) Wallet Toolbox | Tüm işlemler `@bsv/sdk` ile kuruluyor. Ajan, sağlayıcı sunucusu, guard ve maker cüzdanları `@bsv/wallet-toolbox` ile çalışıyor |
| B2 | Kullanıcıya dönük akışlar BSV Desktop / BSV Browser'a bağlı | Sağlayıcı havuz açıyor ve kredi basıyor, ajan sahibi vault'u fonlayıp geri çekiyor, insan katılımcı havuza katılıyor, LP backstop veriyor. Bunların hepsi `WalletClient('auto')` üzerinden |
| B3 | Gerçek işlemler (testnet veya mainnet) | BSVA'nın verdiği sats ile mainnet. Her adım bir işlem: havuz ilanı, pledge, settlement, kredi harcama, ikincil satış, swap |
| B4 | Fonların olduğu her yerde non-custodial | Havuzda toplanan bir para yok. Settlement tek atomik işlem (DvP). Vault'u guard tek başına harcayamıyor, sahip her an çekebiliyor. Swap HTLC ile. Kalan güven noktaları §8'de açıkça listeli |
| B5 | Projeyi kullanarak ödeme yapan en az bir AI ajanı | Ajanlar havuza giriyor (settlement ödemesi), krediyi harcıyor, kredi bitince 402 ile perakende ödüyor, ikincil piyasadan kredi alıyor |
| S1 | Açık kaynak repo + README | Monorepo, `npm run demo` ile her şey ayağa kalkıyor |
| S2 | Canlı demo veya 2–3 dk video (ajan ödemesi dahil) | §11'deki senaryo |
| S3 | Örnek işlem linkleri (WhatsOnChain) | §7'deki her işlem tipinden en az bir link README'de |
| S4 | Kullanım ve değer notu | §14'te İngilizce taslak |

### 1.2 Jüri ağırlıkları ve bizim cevabımız

| Kriter | Ağırlık | Ana kozumuz |
|---|---|---|
| Benimsenme potansiyeli, gerçek fayda | **35%** | Sağlayıcıya stoksuz, peşin satılmış, all-or-nothing talep. Küçük ekiplere tek başlarına giremeyecekleri paketlere erişim. Base'deki x402 ajanları için BSV'ye gelme nedeni. Gerçekten çalışan bir sağlayıcı (SmartRoute) |
| BSV stack kullanımı | **25%** | SDK (özel sighash, script, BEEF/SPV), Wallet Toolbox, BSV Desktop, kendi overlay'imiz, BSV-21, BRC-105/103/29, MessageBox, Arcade, basket'ler |
| Teknik uygulama ve sağlam non-custodial tasarım | **20%** | Ödeme ve teslim aynı işlemde (DvP). Katılımcılar kredi soyunu kendileri doğruluyor. Sağlayıcı teklifi çevrimdışı imzalanabiliyor. Guard tek başına bir şey yapamıyor. Threat model ve mockchain testleri |
| Ajan ödemeleri | **10%** | Ajan gerçek bir iş yapıyor (araştırma) ve satın almayı kendisi yönetiyor |
| Özgünlük ve sunum | **10%** | Kimse "ajanlar birlikte satın alıyor" fikrini yapmıyor. Canlı dolan ilerleme çubuğu ve sonunda WhatsOnChain'de tek işlem |

### 1.3 Challenge'dan çıkardığımız tasarım kuralları

1. **Çekirdek ürün DeFi katmanı olmalı, ajan ikincil.** Asıl ürün havuz, kredi piyasası ve rampa. Ajan bunların müşterisi.
2. **"Working code alone is not enough."** Gerçek bir sağlayıcı gerçek bir hizmet satmalı (LLM çıkarımı) ve mekanizmanın değeri zincir üstünde ölçülebilir olmalı (N katılımcı, 1 işlem, 0 sat emanet).
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
| **`agent-spending-vault.md`** | **Mandate Vault**: ajan + guard 2-of-2, sahip her an çekebiliyor; guard politika kontrolleri; threat model yaklaşımı | idea.md'deki "sahip yetkisi" artık sadece prompt'ta yazan bir kural değil, kriptografik olarak zorlanıyor. tUSD'yi bıraktık: takımın bastığı bir "stablecoin" bir IOU olur, jüri bunu sorgular. x\*y=k havuzunu bıraktık: üçüncü taraf LP'nin mevduat yatırması ya emanet ya da covenant gerektirir; bizim imzalı listelerimiz ve HTLC'lerimiz bunu gerektirmiyor. (Demodaki likidite yine de takımdan geliyor, §4.8) |
| **`AnyRail-fikir.md`** | "Elindekiyle öde" router'ı. Zincirler arası **atomik swap** (HTLC) ve maker modeli. Servis tarafında sadece 402 kalıyor. Tek satırlık entegrasyon | AnyRail'i genel bir ödeme rayı olarak değil, AgentCoop'un **giriş rampası (Coop Rail)** olarak kullanıyoruz. BSV'de CLTV olmadığı için iade yolunu yeniden tasarladık (§4.10) |
| **`a`** (3 kullanıcı ihtiyacı) | **Ortak Veri Siparişi** = grup havuzu (çekirdek). **Kapasite Rezervasyonu** = dönemlik (forward) krediler (K3). **Sipariş Avansı** = underwriter/backstop rolü | Teminatsız ajan kredisi (avans) 30 saatte sağlam bir non-custodial tasarımla yapılamaz, gelecek vizyonuna koyduk (§13). Havuzlardan oluşan zincir üstü satın alma geçmişi ileride bunun kredi skoru olacak |

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
| ② **Credits** | **Varsayılan: her sağlayıcı ürünü için tek ve süresiz bir BSV-21 token** (ör. "SmartRoute Sonnet kredisi", 1 kredi = 1k çıktı token'ı). Dönemlik token'lar yalnızca K3'teki forward özelliğinde kullanılır; likiditeyi parçalamamak için varsayılan değildir. 402 API'de harcanıyor | idea.md + a |
| ③ **Market** | Elde kalan krediler imzalı listelerle satılıyor, alıcı birden fazla listeyi tek işlemde topluyor. Underwriter'lar havuzun eksik kalan kısmını alıp piyasada satıyor | idea.md + a + vault |
| ④ **Mandate Vault** | Sahip "haftada $20, havuz başına en fazla $5, sadece şu sağlayıcılar" diyor ve bu kural zincir üstündeki bir 2-of-2 ile zorlanıyor | agent-spending-vault |
| ⑤ **Coop Rail** | Base'de USDC tutan bir ajan ya da insan, HTLC ile BSV'ye geçip havuza katılıyor veya vault'unu fonluyor | AnyRail |

### 3.2 Track'in saydığı eksiklere cevaplarımız

| Track'in dediği eksik | AgentCoop'taki cevabı |
|---|---|
| **Stable value to pay with** | Krediler hizmet birimiyle (token, GPU-saati) ifade ediliyor, yani ajan ne tükettiğiyle ölçülen sabit bir değer tutuyor. Dışarıdan gelen USDC **pledge'den önce** BSV'ye çevriliyor; kur riski pledge'den lock-in'e kadar sürüyor ve pledge'e eklenen %X tamponla sınırlanıyor (fazlası para üstü olarak geri dönüyor). Havuz dolmazsa BSV vault'ta kalıyor ve sonraki havuzlarda kullanılıyor. **USDC'ye geri dönüş yolu henüz yok** (§4.10) |
| **Liquidity** | Kredi piyasası ve underwriter/backstop LP'ler. Havuzlar daha sık doluyor, krediler likit kalıyor |
| **Swap** | Kredi ↔ sats (atomik, imzalı listeler) ve USDC ↔ BSV (HTLC) |
| **Move funds between chains** | Coop Rail: Base'deki x402 ekonomisinden BSV'ye non-custodial giriş |

### 3.3 Neden niş, neden fark yaratır

- Diğer takımların büyük ihtimalle yapacakları: bridge, DEX, stablecoin, harcama vault'u, 402 paywall. Bunlar **"nasıl ödenir"** sorusunu cevaplıyor. Biz **"nasıl birlikte satın alınır"** sorusunu cevaplıyoruz, yani satın alma (procurement) katmanını yapıyoruz.
- Bu bir finans primitifi. Çok taraflı, all-or-nothing, atomik teslimli bir **grup alım protokolü** ve onun ikincil piyasası. Bridge, swap ve vault gibi "herkesin yaptığı" parçalar bizde ürünün kendisi değil, ürünü besleyen **bileşenler**.
- **BSV'ye özgü:** 100 katılımcılı bir havuz Ethereum'da her katılımcı için approve + deposit gerektirir (para kontratta bekler) ve başarısızlıkta herkes refund gas'ı öder. BSV'de para yatırma da iade de yok; yüzlerce taraf tek işlemde, bir sentin çok altında bir ücretle buluşuyor (§5).

---

## 4. Mekanizma (teknik çekirdek)

### 4.1 Tek ilke

> **Herkesin varlığı, son ana kadar kendi cüzdanında kalır. Sonra tek bir işlem ya herkes için gerçekleşir ya da hiç gerçekleşmez.**

Sağlayıcının kredileri sağlayıcının cüzdanında, ajanların sats'ı ajanların cüzdanında (veya vault'unda) duruyor. Havuz aşamasında ortak bir hesap, kontrat bakiyesi ya da emanet yok. **Tek istisna:** kredi kullanımındaki sınırlı ve kısa ömürlü ön ödemeli bakiye (§4.7); bu, bir oturumluk tutarla sınırlanmış, güvene dayalı bir noktadır ve threat model'de açıkça yer alır.

### 4.2 Bunu mümkün kılan teknik gerçek (doğrulandı)

- `@bsv/sdk` 3.2.1'deki `TransactionSignature.format` fonksiyonu `SIGHASH_ALL`, `SIGHASH_SINGLE`, `SIGHASH_NONE` ve `SIGHASH_ANYONECANPAY` scope'larını hesaplayabiliyor.
- Starter kit'teki `client/signer.ts`, sighash ön görüntüsünü **uygulama tarafında** hesaplayıp cüzdana `createSignature({ hashToDirectlySign })` ile imzalatıyor. Bu yol mainnet'te BSV Desktop ile token transferlerinde doğrulanmış. Dolayısıyla **BSV Desktop da wallet-toolbox ajanları da**, başkasının kurduğu çok taraflı bir işlemde kendi girdilerini istedikleri scope ile imzalayabiliyor. (idea.md'deki "Wallet support" sorusunun cevabı bu. BSV Desktop'ta SINGLE|ACP için canlı test §12'de 2 numaralı doğrulama.)

### 4.3 Havuzun yaşam döngüsü

```
1. OFFER     Sağlayıcı (BSV Desktop) havuz açar:
             - N kredilik bir BSV-21 UTXO'yu kendine ayırır ve havuz ilanını
               (koşullar, fiyat P, hedef, son tarih, backstop payı Y) tek tx'te zincire yazar
             - O kredi UTXO'sunu SIGHASH_SINGLE|ANYONECANPAY ile imzalar:
               "Bu N krediyi, aynı index'teki çıktı bana P sat ödediği sürece
               kim alırsa alsın." Böylece sağlayıcı çevrimdışı kalabilir.
2. PLEDGE    Ajan veya insan, kendi cüzdanında ayrı bir basket'e (agentcoop)
             bir "pledge coin" ayırır ve kaydı OP_RETURN ile zincire yazar.
             Aynı tx'te sağlayıcıya küçük ve iadesiz bir kayıt bedeli öder
             (anti-griefing, §4.5). Para hâlâ kendi anahtarında; overlay
             ilerlemeyi zincirden sayar.
3. WITHDRAW  Son ana kadar serbest: coin'i harcamak pledge'i iptal eder.
4. LOCK-IN   Hedefe ulaşıldı. Koordinatör, deterministik sıralama kuralıyla
             (§4.5) katılımcı listesini kurar, settlement tx şablonunu hazırlar
             ve her katılımcıya MessageBox/WS üzerinden gönderir.
5. SIGN      Her katılımcı TAM işlemi doğrular: benim kredim var mı, para üstüm
             doğru mu, OP_RETURN'deki pledge listesi hash'i kurala uyuyor mu, ve
             sağlayıcının kredi girdisi GERÇEK mi. Bu son kontrol overlay'e
             sorularak değil, `verifyLineage` ile KENDİSİ tarafından yapılır
             (atalar Arcade/WoC'tan çekilir, kit kuralları yerelde uygulanır;
             soy kısa: deploy → ayırma → settlement). Sonra SIGHASH_ALL ile
             imzalar. Vault'taki ajanlar için guard da aynı kontrolleri yapıp imzalar (§4.9).
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
                                                                  · pledge-list hash (§4.5)
```

- **Ödeme ve teslim aynı işlemde.** Sağlayıcının parayı alıp krediyi göndermemesi diye bir senaryo yok.
- Sağlayıcının imzası, karşılığında P sat almadığı hiçbir işlemde geçerli olmuyor. Katılımcıların imzası da her şeyi kapsıyor (ALL), bu yüzden koordinatör hiçbir çıktıyı değiştiremiyor.
- **Ücret:** yaklaşık 100 sat/kB ile 20 katılımcılı bir settlement ~7 kB tutuyor, bu da birkaç yüz sat demek (< $0.001). Ücret katılımcıların para üstünden eşit olarak düşülüyor. (Gerçek ücret politikasını Arcade `/health` üzerinden doğrulayın.)
- Pledge coin'ler tam tutarda olmak zorunda değil, çünkü para üstü çıktısı var. idea.md'deki "sabit boyutlu share" kısıtı kalkıyor.

### 4.5 Kenar durumlar ve koordinatör kuralları

| Durum | Ne oluyor |
|---|---|
| **Katılımcı seçimi ve sıralama** | Deterministik kural: pledge'ler **(blok yüksekliği, txid)** sırasına göre alınır; mine edilmemişler en sonda txid'e göre. Settlement'taki OP_RETURN, o anki pledge listesinin hash'ini içerir. Herkes kuralın uygulanıp uygulanmadığını kontrol edebilir. Sağlayıcı teklifi açık olduğu için **herkes kendi koordinatörünü çalıştırabilir**. Sansür böylece tespit edilebilir hale geliyor ama tamamen engellenmiyor (§8) |
| **Griefing (imzalamama / son anda coin harcama)** | Üç önlem: (1) pledge kaydında sağlayıcıya ödenen **küçük ve iadesiz bedel** (örn. birkaç yüz sat); (2) havuz **%120'ye kadar fazla doldurulur**, fazlası bekleme listesidir; (3) **en fazla 3 imza turu** denenir, zaman aşımı turu başına ~60 sn, imzalamayan coin'ler outpoint bazında kara listeye alınır. Kalan risk: kararlı ve parası olan bir saldırgan havuzu yine düşürebilir; maliyet artık sıfır değil ve deneme sayısı sınırlı |
| Katılımcı lock-in'de imzalamıyor veya coin'ini harcıyor | Yeri bekleme listesindeki birine ya da backstop'a geçiyor ve şablon yeniden kuruluyor. Kimse para kaybetmiyor |
| Bir balina sağlayıcının teklifini tek başına alıyor | Ekonomik olarak sorun değil: sağlayıcı bloğunu satmış oluyor. Havuz katılımcılarının coin'lerine dokunulmamış oluyor (bu da bir "underwriter" davranışı) |
| Sağlayıcı havuzu iptal ediyor | Kredi UTXO'sunu harcıyor, teklif geçersiz oluyor, kimse etkilenmiyor |
| Kısmi dolum | MVP'de fill-or-kill (tam N). Backstop, teklifte sabitlenen Y payına kadar eksik kalan kısmı tamamlıyor (§4.11) |

### 4.6 Karar notu: idea.md'deki ACP-Lighthouse tasarımından neden ayrıldık

idea.md'de katılımcılar `ALL|ANYONECANPAY` ile önceden imza atıyordu. Bu imza **bütün çıktıları** sabitlemek zorunda, ama ilk katılımcı imzalarken kimin geleceği bilinmiyor. Bu yüzden kredi çıktıları aynı işleme konamıyor ve teslim, sağlayıcının sonradan ayrıca yaptığı bir işlem olarak kalıyor (idea.md risk #2). Ayrıca ACP pledge'i de coin harcanarak her an geri çekilebiliyor. Yani ACP, griefing'e karşı 2 aşamalı tasarımdan daha güçlü değil.

**İçgörü:** Lighthouse, pledge verip ortadan kaybolan *insanlar* için tasarlanmıştı. Ajanlar ise sürekli çevrimiçi, onlar için ikinci bir imza turunun maliyeti sıfır. Bu sayede Lighthouse'un yapamadığını yapabiliyoruz:

1. Ödeme ve teslim tek işlemde (DvP).
2. Guard tam işlemi görüp "ajan ödüyor **ve** kredisini alıyor" kuralını zorlayabiliyor.
3. Pledge'ler tam tutarda olmak zorunda değil.

Sağlayıcı tarafında ise ACP'nin gücünü koruyoruz: `SINGLE|ANYONECANPAY` sayesinde sağlayıcı teklifini bir kez imzalayıp çevrimdışı kalabiliyor. Bir tasarım notu olarak ileride çevrimdışı insanlar için bir "Lighthouse modu" (ACP pledge) eklenebilir (§10, Katman 3).

### 4.7 Kredilerin kullanılması (402)

- **Perakende (kredi yoksa):** SmartRoute `@bsv/auth-express-middleware` ve `@bsv/payment-express-middleware` ile **BRC-105** kullanıyor. Ajan `AuthFetch` ile ödüyor. Resmi protokolü kullanıyoruz, kendi header'ımızı icat etmiyoruz.
- **Kredi ile:** Ajan, kimliği doğrulanmış (BRC-103) bir `/credits/redeem` çağrısıyla krediyi sağlayıcının token adresine gönderiyor (normal bir BSV-21 transferi). Sağlayıcı bunu doğrulayıp ajanın kimliğine ön ödemeli bakiye yazıyor. Sonraki çağrılarda `calculateRequestPrice` ön ödemeli bakiye yettiği sürece 0 döndürüyor (ve bakiyeyi düşüyor), yetmediğinde perakende sats fiyatına geçiyor.
- **Bakiye sınırı:** Redeem, **en fazla bir oturumluk ihtiyaç kadar** yapılır (örn. ≤ 20 kredi). Kullanılmayan kısım `/credits/return` ile token olarak geri istenebilir. Bu bakiye **zincir dışı ve sağlayıcıya güvene dayalıdır**; tutarı küçük ve süresi kısa tutularak sınırlanır, tamamen kaldırılmaz (§8).
- Geri dönen krediler sağlayıcının stoğuna giriyor. Sağlayıcı bunları yakabilir ya da bir sonraki havuzda yeniden satabilir.

### 4.8 Market: imzalı listeler ve toplu alım (sweep)

- **Liste:** Satıcı, kredi UTXO'sunu `SINGLE|ANYONECANPAY` ile imzalıyor: "bu k krediyi, aynı index'teki çıktı bana q sat ödediği sürece veriyorum". Bu, sağlayıcı teklifiyle **aynı primitif**: tek mekanizma, iki ürün. Covenant gerekmiyor ve satıcı çevrimdışı olabiliyor.
- **Alım:** Alıcı birden fazla listeyi tek işlemde topluyor (girdi i ↔ ödeme çıktısı i). Krediler tek bir çıktıda alıcıya gidiyor. Alıcı `ALL` ile imzalamadan önce kredi girdilerinin soyunu `verifyLineage` ile doğruluyor.
- **İptal:** Satıcı coin'ini harcıyor.
- **Likidite kaynağı (dürüst not):** Tasarım izinsiz, yani herkes liste açabilir, backstop verebilir veya maker olabilir. Ama **demodaki bütün likidite takımdan geliyor**. Başlangıç likiditesi sorunu çözülmüş değil; pitch'te bunu saklamıyoruz.
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

- **Fonlama:** Sahip BSV Desktop'tan `createAction` ile bu script'e para kilitliyor. Çıktı, sahibin kendi cüzdanında `agentcoop vault` basket'inde, `customInstructions` ile birlikte takip ediliyor. Coop Rail'den gelen fon da yalnızca bu script'e inebiliyor (§4.10).
- **Guard (wallet-toolbox sunucusu) politikaları:**
  - Ödenen taraf allowlist'te mi?
  - Havuz başına üst sınır ve haftalık kayan toplam aşılıyor mu?
  - **DvP:** aynı işlemde ajanın token adresine en az beklenen miktarda kredi gidiyor mu, ve o kredi girdisinin soyu `verifyLineage` ile doğrulanmış mı?
  - Para üstü aynı vault script'ine dönüyor mu?
  - Ücret tavanı aşılıyor mu?
  - Coop Rail claim'inde çıktı vault script'i veya pledge coin mi?

  Guard tam işlemi gördüğü için (ALL) bütün bunları kontrol edebiliyor.
- **Küçük harcamalar için sıcak cüzdan:** Perakende 402 çağrıları için guard'ın onayladığı küçük günlük tavanlarla ajanın sıcak cüzdanına (wallet-toolbox `default` basket) para aktarılıyor. Böylece `AuthFetch` standart şekilde çalışıyor. Büyük taahhütler (havuz, market) doğrudan vault'tan yapılıyor.
- **Non-custodial:** Guard tek başına ve ajan tek başına fonu oynatamıyor. Sahip her an tek imzayla çekebiliyor. Guard açık kaynak ve sahip isterse kendi sunucusunda çalıştırabiliyor.
- **Bilinen sınırlar (açık kalıyor):**
  - Kredi çıktıları ajanın kendi token adresine gidiyor, dolayısıyla ajan krediyi piyasada satıp guard'ı atlatabilir. Tutar küçük ve krediler belirli bir sağlayıcıya bağlı. Kapatmak için kredi çıktısını vault script'ine kilitleyen kendi overlay kuralımız gerekiyor (K3).
  - **Kör hash imzası:** BRC-100 cüzdan `hashToDirectlySign` ile ne imzaladığını göremiyor ve security level 1'de izin protokol başına bir kez veriliyor. Dolayısıyla kötü niyetli bir uygulamanın verebileceği zarar tek bir pledge değil, **`agentcoop` basket'indeki toplam tutar**. Önlem: basket'te her an **tek bir aktif pledge** tutulur ve imzalamadan önce istemci tarafında açık kaynak DvP doğrulayıcı çalışır. (İzin davranışı §12'de 3 numaralı doğrulama.)
- **Demo anı:** Prompt injection'a uğramış ajan "bütçenin %100'ünü X havuzuna yatır" diyor. Guard imzayı reddediyor ve hiçbir şey hareket etmiyor.

### 4.10 Coop Rail: USDC (Base) ↔ BSV atomik swap

**Doğrulanmış kısıt:** BSV'de Genesis yükseltmesiyle `OP_CHECKLOCKTIMEVERIFY` ve `OP_CHECKSEQUENCEVERIFY` NOP'a döndü, Chronicle (2026) da bunları geri getirmedi. `nLockTime` ise orijinal anlamıyla çalışıyor. Bu yüzden BSV tarafındaki iade yolu script içinde değil, **önceden imzalanmış nLockTime'lı bir iade işlemiyle** kuruluyor.

```
Ajan (secret s, h = SHA256(s))                       Maker (LP botu)
1. Base: USDC'yi Solidity HTLC'ye kilitler (h, maker, timeout T_base)
2.                                                    BSV HTLC funding tx'i kurar (version 1, henüz yayınlamaz)
   BSV script:
     OP_IF   OP_SHA256 <h> OP_EQUALVERIFY
             OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG      ← claim: ajan + GUARD birlikte
     OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG      ← iade: önceden imzalı, nLockTime = H + k
     OP_ENDIF
3. Ajan, maker'ın iade tx'ini imzalar (ELSE dalı, nLockTime = şimdiki BLOK YÜKSEKLİĞİ + k)
                                                  ──▶ maker funding'i yayınlar
4. Ajan + guard, s ile BSV'yi alır. Guard yalnızca çıktı vault script'i veya pledge coin
   ise imzalar. s zincirde açığa çıkar
5.                                                    Maker s ile Base'deki USDC'yi alır (T_base'den önce)
   Aksilik olursa: maker H+k'dan sonra BSV'sini geri alır; ajan T_base'den sonra USDC'sini geri alır.
```

- **Zaman referansı:** BSV iadesi **blok yüksekliğiyle** belirlenir (+k blok), zaman damgasıyla değil. Böylece median-time-past kuralının BSV'de geçerli olup olmadığına bağımlı kalmıyoruz. `T_base`, k blok için kötü senaryodaki süre artı maker'ın USDC'yi claim etmesi için pay kadar seçilir (örn. k=3, T_base = +6 saat). Mutlu yolda kimse zaman aşımını beklemediği için uzun pencereler demoyu yavaşlatmıyor. Semantik §12'de 4 numaralı doğrulama.
- **Guard'dan geçiş:** Claim dalı guard imzası istediği için Rail'den gelen fon vault politikasını atlayamıyor. Fon sahibin kendisiyse (insan akışı, MetaMask → vault) claim dalı sahibin anahtarıyla kurulur ve çıktı doğrudan vault'tur.
- **Version 1:** Funding işlemini version 1 ile kuruyoruz. Chronicle, malleability kısıtlarını yalnızca version > 1 işlemler için kaldırdı; version 1 ile önceden imzalanmış iade işleminin txid malleability'den korunmasını hedefliyoruz (§12'de 6 numaralı doğrulama).
- **Maker ekonomisi:** Fiyat teklifine %1–2 spread eklenir; spread, sermayenin H+k'ya kadar kilitli kalma süresini fiyatlar. **Ters yön (BSV → USDC) henüz yok**; dolayısıyla maker envanteri tek yönlü tükenir ve elle yeniden dengelenir. Ters yön aynı iki kontratla, roller değiştirilerek kurulabilir (K3).
- **Ağ seçimi:** Geliştirme için Base Sepolia. Demo için Base mainnet'te $1–2 USDC öneriyoruz, gas bir sentin altında. Böylece iki taraf da gerçek oluyor.

### 4.11 Havuz tipleri (`a` dosyasından)

| Tip | Kullanıcının söylediği | Mekanizma |
|---|---|---|
| **Ortak Sipariş** (grup havuzu) | "İhtiyacım var ama bütün maliyeti tek başıma karşılamak istemiyorum" | §4.3, çekirdek |
| **Kapasite Rezervasyonu** (forward, K3) | "Param var, hizmetin zamanında hazır olmasını istiyorum" | Dönemlik kredi token'ı (ör. "SR-Sonnet-2611"). Sağlayıcı yalnızca dönem içinde kullanıma açıyor. Gelecek dönemlerin kredileri piyasada fiyatlanıyor, bu da AI kapasitesi için bir **forward eğrisi** oluşturuyor. Varsayılan değil: likiditeyi parçalar |
| **Backstop / Underwriter** (Sipariş Avansı'nın sağlam hali) | "Havuz dolsun diye riski ben alayım, karşılığında marj kazanayım" | LP "son X dakikada eksik kalan en fazla **Y** payı ben tamamlarım" diye pledge veriyor. **Y teklifte sabitlenir**, yani LP'nin riski baştan bellidir. Sağlayıcı backstop paylarına **ek indirim** verir (örn. +%5), çünkü LP havuzun dolma olasılığını yükseltiyor; LP getirisini bu ek indirimden alır |

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
| **SmartRoute sunucusu** | wallet-toolbox | 402 tahsilatı, kredi kullanımı ve iadesi, (ileride) havuz başına yeniden teklif |
| **Ajan sahibi** (insan) | **BSV Desktop** (+ MetaMask, Rail için) | Vault'u fonluyor, politikayı belirliyor, geri çekiyor, ajanın kararlarını izliyor |
| **İnsan katılımcı / LP** | **BSV Desktop** | Havuza doğrudan katılıyor, backstop veriyor, piyasada alıp satıyor |
| **AI ajanları** (3–5 adet) | wallet-toolbox (+ vault) | Araştırma işini yapıyor; satın alma, pledge, kredi harcama, ikincil satış, swap |
| **Guard** | wallet-toolbox | Vault politikasını uygulayan ortak imzacı |
| **Koordinatör** | wallet-toolbox (yalnızca kimlik) | Şablon kuruyor, imzaları topluyor, yayınlıyor. **Hiç para tutmuyor**; deterministik kurala bağlı; bu rolü herkes çalıştırabilir |
| **Maker** | wallet-toolbox + EVM anahtarı | Coop Rail'in karşı tarafı |

---

## 7. Zincir üstü işlem kataloğu (README'deki WhatsOnChain linkleri)

| # | İşlem | İmzalayan / scope | WhatsOnChain'de görünen |
|---|---|---|---|
| T1 | Kredi token deploy | Sağlayıcı (BSV Desktop) | BSV-21 deploy+mint (BananaBlocks'ta da görünür) |
| T2 | Havuz ilanı ve kredi ayırma | Sağlayıcı | N kredilik UTXO ve OP_RETURN koşulları |
| T3 | Pledge | Ajan / insan | Pledge coin, sağlayıcıya kayıt bedeli ve OP_RETURN (poolId, pay) |
| T4 | Pledge iptali | Pledge sahibi | Coin harcanmış, havuz ilerlemesi düşmüş |
| **T5** | **Settlement (DvP)** | Sağlayıcı SINGLE\|ACP, herkes ALL | **N girdi; sağlayıcıya ödeme ve herkese kredi tek tx'te; pledge-list hash'i** |
| T6 | Kredi kullanımı (redeem) ve iadesi (return) | Ajan / sağlayıcı | BSV-21 transfer → sağlayıcı, ve geri |
| T7 | Perakende 402 ödemesi | Ajan (AuthFetch) | BRC-29 ödemesi → SmartRoute |
| T8 | Market listesi doldurma (sweep) | Satıcılar SINGLE\|ACP, alıcı ALL | Birden fazla satıcıya ödeme ve alıcıya kredi |
| T9 | Vault fonlama ve sahibin geri çekmesi | Sahip (BSV Desktop) | Özel script çıktısı ve OP_IF dalından harcama |
| T10 | Guard'ın onayladığı ödeme | Ajan + guard 2-of-2 | Multisig dalından harcama |
| T11 | Coop Rail (BSV tarafı) | Maker funding, ajan + guard claim | Hashlock'lı çıktı, claim'de preimage s görünür |
| T11b | Coop Rail (Base tarafı) | Ajan lock, maker claim | BaseScan'de HTLC kontratı |

---

## 8. Non-custodial analiz ve threat model

| Tehdit | Önlem | Durum |
|---|---|---|
| Koordinatör çalmaya çalışıyor | Koordinatörün anahtarı ve parası yok. Herkes tam işlemi doğrulayıp ALL ile imzalıyor; açık kaynak DvP doğrulayıcı istemcide çalışıyor | Kapalı |
| Koordinatör (veya overlay) sahte krediyi "geçerli" gösteriyor | Katılımcı ve guard, overlay'e güvenmek yerine kredi girdisinin soyunu **`verifyLineage` ile kendileri doğruluyor** (atalar Arcade/WoC'tan, kurallar yerelde). Overlay yalnızca keşif için | Kapalı (bağımsız doğrulama) |
| Koordinatörün seçim yetkisi (sansür, kayırma) | Deterministik sıralama, OP_RETURN'de pledge-list hash'i, herkesin koordinatör çalıştırabilmesi | **Tespit edilebilir, engellenmiyor** |
| Sağlayıcı parayı alıp krediyi göndermiyor | İmkansız, çünkü ödeme ve teslim aynı işlemde | Kapalı |
| Sağlayıcı krediyi verip hizmeti vermiyor | Her ön ödemede olan bir kalıntı güven. Krediler piyasada satılabiliyor (çıkış yolu var), zincir üstü itibar, ileride sağlayıcı teminatı | **Açık (kalıntı güven)** |
| Redeem edilen bakiye sağlayıcıda zincir dışı tutuluyor | Redeem tutarı bir oturumla sınırlı (≤ 20 kredi), `/credits/return` ile iade | **Açık, sınırlı ve güvene dayalı** |
| Katılımcı lock-in'de kaçıyor (griefing, Sybil) | İadesiz kayıt bedeli, %120 fazla dolum, en fazla 3 tur, outpoint kara listesi | **Maliyetli hale geldi, kalan risk var** |
| Sahte kredi (BSV-21 sahteciliği) | `verifyLineage` + overlay kuralları (kaynak, enflasyon, çapraz token) | Kapalı |
| Ajan prompt injection'a uğruyor | Guard politikası ve vault tavanı; sahip her an iptal edebiliyor | Kapalı (vault kapsamında) |
| Ajan krediyi piyasada satıp guard'ı atlatıyor | Tutar küçük; kapatmak için kredi çıktısını vault'a kilitleyen overlay kuralı gerek (K3) | **Açık** |
| Guard ele geçiriliyor | Tek başına fonu oynatamıyor, sahibin çıkış yolu açık | Kapalı |
| Ajan ve guard birlikte ele geçiriliyor | Kayıp vault bakiyesiyle sınırlı (sahip haftalık bütçe yüklüyor) | **Açık, sınırlı** |
| BRC-100 "kör hash imzası" | Zarar = `agentcoop` basket'indeki toplam; her an tek aktif pledge; istemci doğrulaması | **Açık, sınırlı** |
| Coop Rail claim'i vault politikasını atlıyor | Claim dalı ajan + guard 2-of-2 | Kapalı |
| HTLC'de karşı taraf kaçıyor | Yükseklik tabanlı önceden imzalı iade (BSV), zaman aşımı (Base); version 1 işlem | Kapalı (doğrulama 4 ve 6'ya bağlı) |
| HTLC'de ters yön yok | Maker envanteri elle dengelenir; ajan dolmayan havuzda BSV'yi vault'ta tutar | **Açık** |
| 402 tekrar oynatma (replay) | Middleware'in replay store'u (birden fazla süreç varsa paylaşılan ve atomik bir store) | Kapalı |

---

## 9. Mimari ve repo yapısı

```
agentcoop/
├─ AGENTS.md                      ← docs/AGENTS.md kopyası (AI asistanlar için)
├─ packages/
│  ├─ core/        havuz/pledge/teklif/settlement/listing builder'ları, sighash imzalama
│  │               (BRC-100 + wallet-toolbox), DvP doğrulayıcı, verifyLineage,
│  │               vault & HTLC script'leri                                     ← kritik yol
│  ├─ overlay/     tm_agentcoop + ls_agentcoop (havuz, pledge, teklif, liste, settlement, vault)
│  │               + kredi token topic'i (kit kuralları, çok taraflı tx testleri)
│  ├─ agent-sdk/   procurement router: kredi → market → havuz → perakende 402 → rail
│  └─ mcp/         (K3) AgentCoop araçları MCP server olarak: herhangi bir LLM ajanı havuza girer
├─ apps/
│  ├─ web/         Havuz gezgini (canlı ilerleme), sağlayıcı konsolu, sahip konsolu, market  [BSV Desktop]
│  ├─ smartroute/  LLM gateway + BRC-105 402 + /credits/redeem + /credits/return
│  ├─ coordinator/ deterministik lock-in, imza turu (MessageBox/WS), Arcade yayını
│  ├─ guard/       vault politika motoru
│  ├─ agents/      3–5 araştırma ajanı + demo orkestrasyonu
│  └─ maker/       Coop Rail LP botu
├─ contracts/base-htlc/   Solidity HTLC (USDC) + testleri
└─ test/          wallet-toolbox mockchain ile uçtan uca senaryolar
```

**İndirimin kaynağı (düzeltilmiş):** İndirim, **taahhüt gerektiren kapasiteden** geliyor: GPU blokları (8 GPU minimum, 6 ay+ taahhüt), provisioned throughput (Bedrock, OpenAI Scale Tier; 30 günlük minimumlar, aylık binlerce dolar), proxy plan kademeleri (1 TB+ anlaşmalar). Batch API'ler bu listede **değil**: hacim taahhüdü gerektirmedikleri için tek bir ajan da aynı indirimi alır. **Demoda SmartRoute upstream'e liste fiyatı ödüyor; gösterilen havuz indirimi demo fiyatlamasıdır** ve öyle etiketlenir. Gerçek ekonomiyi ancak taahhütlü bir kapasite gösterebilir; bu hackathon süresinde satın alınamaz, dolayısıyla tasarruf iddiası demoda **kanıtlanmamış** kalır. Kanıtlanan şey mekanizmadır (§14).

---

## 10. Kapsam ve inşa sırası

> Bu bölümdeki rol tablosu, kişi bazlı ayrı plan dosyalarıyla **değiştirilecek** (frontend ilk fazda hariç). Katmanlar inşa sırası, kesinti listesi değil; ama 18 saatlik düzeltme yükü eklendikten sonra neyin sığmadığı ekip büyüklüğüne ve kalan süreye bağlı.

| Katman | İçerik |
|---|---|
| **K1 — Omurga** | Pools (teklif, pledge + kayıt bedeli, deterministik lock-in, DvP settlement), BSV-21 krediler, overlay, `verifyLineage`, SmartRoute (402, sınırlı redeem, return), 3–5 ajan, sağlayıcı konsolu, BSV Desktop ile insan pledge'i, canlı havuz gezgini, başarısız havuz senaryosu |
| **K2 — Tam vizyon** (ilk saatten paralel) | Mandate Vault, guard ve sahip konsolu; Market (imzalı listeler ve sweep); Coop Rail (Base HTLC, guard'lı claim, yükseklik tabanlı iade, maker); backstop underwriter; agent SDK router'ı; **uçtan uca test: USDC → BSV pledge → kredi → 402** |
| **K3 — Sıçrama** | MCP server; OrdLock ile 1Sat Market listeleri; dönemlik (forward) krediler; organizer ajan; kredi çıktısını vault'a kilitleme; covenant vault; Coop Rail ters yön; çevrimdışı insanlar için Lighthouse modu |

### Rol tablosu (eski, referans için)

| Rol | Sahiplik | İlk teslim |
|---|---|---|
| **A — Protokol** | `packages/core`: builder'lar, sighash imzalama, DvP doğrulayıcı, `verifyLineage`, mockchain testleri | 2 ajan ve 1 sağlayıcı ile mainnet'te ilk settlement |
| **B — Overlay** | `packages/overlay` + gezgin API'si + canlı akış (WS) | Havuz ilerlemesinin zincirden sayılması |
| **C — Sağlayıcı** | `apps/smartroute` + sağlayıcı konsolu (BSV Desktop) | 402 perakende, kredi kullanımı ve iadesi |
| **D — Ajanlar** | `apps/agents` + `agent-sdk` + koordinatör + demo orkestrasyonu | Karar loglarıyla pledge veren ajanlar |
| **E — Vault** | vault script'leri + `apps/guard` + sahip konsolu (BSV Desktop) | Fonla → guard onaylı ödeme → reddedilen injection → geri çek |
| **F — Rail ve Market** | `contracts/base-htlc` + `apps/maker` + market modülü | USDC → BSV swap'ı ve liste sweep'i |

### Kilometre taşları (H0 = kodlamaya başlama; teslim saatinden geriye doğru ayarlayın)

| Zaman | Hedef |
|---|---|
| **H+0 → H+2** | **§12'deki 1, 2 ve 4 numaralı doğrulamalar bitmiş olmalı.** Monorepo kurulu; BSV Desktop cüzdanları hazır; @lexamaison'dan sats istendi; starter kit'in 38 testi yeşil; LLM API anahtarı ve Base cüzdanı hazır |
| **H+5** | **Walking skeleton:** sabit kodlanmış 2 ajan ve 1 sağlayıcı ile mainnet'te ilk DvP settlement. İlk WhatsOnChain linki. Projenin en büyük teknik riski burada kapanıyor |
| **H+10** | Overlay indeksleme, BSV Desktop ile havuz açma ve pledge, SmartRoute 402 + redeem/return, ajanlar uçtan uca, `verifyLineage` imza yolunda |
| **H+16** | Vault ve guard, market, Coop Rail swap'ı, başarısız havuz entegre. **Uçtan uca: Base'deki USDC → BSV pledge → kredi → 402, mockchain testiyle birlikte** |
| **H+20** | Feature freeze, UI cilası, demo kaydı, işlem linklerinin toplanması |
| **H+22–24** | README, değer notu, video kurgusu, teslim |

---

## 11. Demo senaryosu (≈3 dk video)

| Zaman | Sahne |
|---|---|
| 0:00–0:20 | **Problem:** taahhüt gerektiren paketler ve küçük ekipler; grup alımı emanet gerektiriyor |
| 0:20–0:45 | Sağlayıcı (BSV Desktop) "1.000 Sonnet kredisi, 24 saat" havuzunu açıyor (onay pencereleri görünüyor; indirim "demo fiyatlaması" etiketli). Ajan sahibi vault'u fonlayıp politikayı yazıyor |
| 0:45–1:30 | 4 ajan havuzu overlay'den buluyor, ihtiyaçlarını tahmin ediyor ve pledge veriyor (karar logları ekranda), ilerleme çubuğu doluyor. Bir ajan Base'den USDC ile geliyor, Coop Rail ile swap yapıyor (iki zincirde de link var) ve **swap çıktısı doğrudan pledge coin oluyor**. Injection'a uğrayan ajanı guard reddediyor |
| 1:30–1:55 | Lock-in ve imza turu (her katılımcı soyu kendisi doğruluyor) → WhatsOnChain'de **tek settlement işlemi**: N girdi, sağlayıcı ödenmiş, her ajan kredisini almış. *"Kimse kimsenin parasını bir saniye bile tutmadı."* |
| 1:55–2:25 | Base'den gelen ajan dahil, ajanlar kredisini harcayıp SmartRoute'u (402) çağırıyor ve gerçek bir araştırma özeti üretiyor. Başka bir ajan elinde kalanı listeliyor, geç gelen bir ajan listeyi atomik olarak alıyor |
| 2:25–2:45 | Dolmayan bir havuzun son tarihi geçiyor; bakiyeler hiç değişmemiş. Sahip BSV Desktop'tan vault'u geri çekiyor |
| 2:45–3:00 | Rakamlar: katılımcı sayısı, işlem sayısı, settlement başına ücret, emanette tutulan sat = 0. Neden BSV |

---

## 12. Doğrulama listesi ve riskler

### 12.1 Kod yazmadan önce test edilecek varsayımlar

| # | Varsayım | En hızlı test | Zaman |
|---|---|---|---|
| **1** | Kit overlay'i, düz girdiler ve token girdisi karışık olan bir settlement'ı kabul ediyor | Kit'in `e2e.mockchain.test.ts` dosyasını kopyalayıp 1 token girdisi + 2 düz girdili, 3 kredi çıktılı bir işlemi submit etmek. Beklenen: `outputsToAdmit` 3 çıktıyı içeriyor | H+2'den önce |
| **2** | BSV Desktop, `hashToDirectlySign` ile SINGLE\|ACP sighash'ini imzalıyor ve tamamlanan tx'i Arcade kabul ediyor | Mainnet'te 1.000 sat ile bir coin ayırıp SINGLE\|ACP ile imzalamak, ikinci bir cüzdandan ALL ile tamamlayıp Arcade'e `POST /tx` yapmak | H+2'den önce |
| 3 | BSV Desktop izin davranışı: level 1/2'de her imzada onay soruyor mu? | 2 numaralı testte iki ardışık imza isteyip onay penceresini gözlemlemek. Kör hash imzasındaki zararın boyutu buna bağlı | H+2 |
| **4** | nLockTime semantiği: yükseklik tabanlı locktime beklendiği gibi çalışıyor; gelecek tarihli işlem mempool'a girmiyor; (bilgi için) zaman tabanlıda MTP kuralı var mı | Locktime'ı yükseklik+1 olan küçük bir işlem ve zamanı şimdi+15 dk olan başka bir işlem yayınlamak; hangi anda kabul edildiklerini `/chaintracks` header zaman damgalarıyla karşılaştırmak | H+2'den önce (Rail yapılacaksa) |
| 5 | Vault script'i (bare multisig + OP_IF) miner politikasından geçiyor | 1.000 sat ile vault'u fonlayıp iki dalı da harcamak | H+4 |
| 6 | Version 1 işlemlerde LOW_S gibi kurallar hâlâ zorunlu (iade malleability'si için) | Chronicle spec'ini okumak; high-S imzalı bir v1 işlem yayınlayıp reddedildiğini görmek | H+4 (Rail yapılacaksa) |
| 7 | `beefFromArcade`, onaylanmamış atalarda soyu deploy'a kadar yürüyebiliyor (`verifyLineage` ön koşulu) | Taze bir token transferinde fonksiyonu çağırıp `rules.ts` kurallarını yerelde çalıştırmak | H+4 |
| 8 | Settlement'ın boyut ve girdi sayısı politikaya uyuyor | Arcade `GET /health` | H+1 |

### 12.2 Riskler ve B planları

| Risk | B planı |
|---|---|
| Test 1 başarısız (kit overlay karışık settlement'ı reddediyor) | Kendi `tm_agentcoop` topic manager'ımızda `rules.ts`'i genişletiriz; DvP zincirde değişmez, sadece indeksleme bize geçer |
| Test 2 başarısız (BSV Desktop özel scope imzalayamıyor) | Sağlayıcı teklifleri sağlayıcının sunucu cüzdanından çıkar; insan katılımı vault fonlama üzerinden olur (ajan pledge verir); BSV Desktop kullanıcıya dönük akışlarda kalır |
| Test 4 başarısız (locktime semantiği beklenenden farklı) | Coop Rail trustless olamaz → Base Sepolia'da "maker'a güvenli" PoC olarak etiketlenir ya da kapsam dışı kalır; vault'un Base'den fonlanması yol haritasına geçer |
| İmza turunun koordinasyonu | Mockchain testleri, zaman aşımı, bekleme listesi, backstop, 3 tur sınırı |
| CJS/ESM ile iki SDK kopyası | Starter kit'teki `vitest.config.ts` alias'ı; Node'da tek build |
| `@bsv/402-pay` originator hatası | Birincil olarak BRC-105 (AuthFetch); 402-pay gerekirse `withHostOriginator()` |
| WhatsOnChain 429 | Header'lar ve yayın için Arcade |

---

## 13. Gelecek vizyonu

- **Gelir teminatlı avans** (`a`'daki Sipariş Avansı): havuzlardaki zincir üstü satın alma geçmişi ajanın kredi skoruna dönüşüyor.
- **ICP chain-key ile non-custodial stablecoin köprüsü** (track örneği). Havuzlar doğrudan köprülenmiş USDC ile ödeniyor. STAS geldiğinde düzenlenmiş stable varlıklar.
- **Sağlayıcı teminatı ve itibar**, hizmet teslimindeki kalıntı güveni azaltmak için.
- **Çok sağlayıcılı açık teklif pazarı:** sağlayıcılar aynı havuz için rekabet ediyor (AnyRail'in çoklu maker vizyonu).
- **Organizer ve hedger ajanlar:** hacim kademelerini keşfedip havuz açan ve forward kapasite alan ajanlar.
- **Coop Rail ters yön ve çoklu maker.**

---

## 14. Usage & value note (submission draft, EN)

**Problem.** AI agents buy compute, model capacity and data one call at a time. The packages with real discounts (reserved GPU blocks, provisioned throughput, enterprise data plans) require large upfront commitments small teams cannot make, and pooling today means trusting an intermediary with everyone's money.

**What AgentCoop is.** A non-custodial group-buying layer on BSV. Providers publish a pool and pre-sign their credits as an open offer. Agents pledge from their own wallets; when the pool fills, a single atomic transaction pays the provider and delivers BSV-21 credits to every participant. No deposits, no escrow, no refunds. Credits are spent on the provider's API over HTTP 402 or resold on an atomic secondary market. Agent budgets live in owner-controlled Mandate Vaults, and agents holding USDC on Base can join via an atomic swap.

**What we prove on chain.** N independent parties, one transaction, zero satoshis held by any intermediary at any point, and delivery-versus-payment in the same transaction. Demo pricing is illustrative; the mechanism is real.

**Target users.** Small AI teams and agent operators (buyers); AI infra resellers, LLM routers, GPU and data providers (sellers, who get pre-paid, all-or-nothing demand before they buy capacity); liquidity providers (underwriters).

**Value for BSV.** New users and liquidity from other chains (x402 agents on Base), recurring multi-party settlement transactions, tradable BSV-21 credit markets, and per-call micropayment volume. All of it is only practical because BSV makes multi-party atomic transactions and cent-sized payments cheap.

---

## 15. Hemen yapılacaklar ve Axel'e (@lexamaison) sorular

**Şimdi:**
1. BSV Desktop → Payments → Receive → adres ve takım adını @lexamaison'a gönderin (sats için).
2. `docs/AGENTS.md`'yi repo köküne kopyalayın. Starter kit'te `npm test` çalıştırın.
3. §12.1'deki 1, 2 ve 4 numaralı doğrulamaları yapın.
4. LLM API anahtarını (SmartRoute için) ve Base cüzdanını ($1–2 USDC + gas) hazırlayın.

**Axel'e sorular:**
1. Ajan + guard 2-of-2 ve sahibin çıkış yolundan oluşan vault, jüri için "non-custodial" sayılır mı?
2. Base ile HTLC tabanlı bir zincirler arası akış "cross-chain flow" olarak değerlendirilir mi? Base mainnet ile küçük tutarlarda çalışmamız uygun mu?
3. Kendi overlay topic'imizi (`tm_agentcoop`) yazmamız teşvik ediliyor mu? Herkese açık overlay barındırma imkânı var mı?
4. BSV Desktop'ın `hashToDirectlySign` için yapılandırılmış (işlemi gösteren) bir imza planı var mı? Threat model notumuz için soruyoruz.
5. Ajanların wallet-toolbox sunucu cüzdanlarını, insanların BSV Desktop'ı kullanması "BSV wallet" şartı için yeterli mi?
6. Kredi kullanımındaki sınırlı ön ödemeli bakiye (≤ bir oturum, iade edilebilir) non-custodial değerlendirmesini etkiler mi?

---

## 16. v1.1 değişiklikleri (inceleme sonrası)

| Değişiklik | Bölüm | Kapanan açık |
|---|---|---|
| "Kur riski yok" iddiası geri çekildi; swap pledge'den önce, tampon, FAIL'de BSV vault'ta | §3.2, §4.10 | #1, #2 |
| Coop Rail claim dalı ajan + guard 2-of-2 | §4.9, §4.10, §8 | #3 |
| BSV iadesi blok yüksekliğiyle; Base zaman aşımı buna göre | §4.10, §12 | #4 |
| Uçtan uca USDC → pledge → kredi → 402 akışı H+16'ya ve demoya eklendi | §10, §11 | #5 |
| Redeem bir oturumla sınırlı, `/credits/return` eklendi, güven noktası açıkça yazıldı | §4.1, §4.7, §8 | #6 (küçültüldü) |
| `verifyLineage`: katılımcı ve guard kredi soyunu kendisi doğruluyor | §4.3, §4.8, §4.9, §8 | #7 |
| Deterministik sıralama + pledge-list hash'i | §4.3, §4.4, §4.5, §8 | #8 (tespit edilebilir) |
| İadesiz kayıt bedeli, %120 dolum, 3 tur sınırı, outpoint kara listesi | §4.3, §4.5, §8 | #9 (maliyetlendirildi) |
| Batch örneği kaldırıldı; indirim yalnızca taahhütlü kapasiteden; demo fiyatlaması etiketi | §9, §11, §14 | #10, #11 |
| x\*y=k gerekçesi düzeltildi; demo likiditesinin takımdan geldiği yazıldı | §2, §4.8 | #12 |
| Varsayılan tek ve süresiz kredi token'ı; dönemlik K3 | §3.1, §4.11 | #13 |
| Backstop Y teklifte sabit, ek indirim | §4.11 | #14 |
| Maker spread'i, ters yönün olmadığı yazıldı | §4.10, §8 | #15 |
| Kör hash imzası zararı basket toplamı olarak düzeltildi; tek aktif pledge | §4.9, §8 | açık madde |
| Doğrulama listesi ve B planları | §12 | — |
