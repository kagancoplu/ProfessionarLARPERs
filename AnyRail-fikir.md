# AnyRail
### Yapay zeka ajanları için "her şeyle öde" rayı

> **Ajanın elinde ne varsa onunla ödesin. Servis ne istiyorsa onu alsın. Gerisini ray halletsin.**

---

## Tek cümlede fikir

AnyRail, yapay zeka ajanlarının elinde hangi varlık veya hangi ağda fon olursa olsun ücretli servislere anında ve otomatik ödeme yapabilmesini sağlayan non-custodial bir ödeme ve takas rayıdır. Arka planda BSV'nin ucuz ve hızlı mikro-ödemelerini kullanır.

---

## Problem

Ajan ekonomisi büyüyor ama ödeme tarafı dağınık:

- **Ajanlar farklı varlıklarla dolaşıyor.** Biri stablecoin tutuyor, biri Ethereum'da ETH, biri başka bir token.
- **Servisler tek bir varlık istiyor.** Bir API sağlayıcısı her token'ı ve her ağı desteklemek istemez.
- **Mikro-ödeme pahalı.** İstek başına birkaç sentlik ödemeler, çoğu ağda ödeme ücretinin altında kalıyor.
- **Mevcut köprü ve takas çözümleri güven istiyor.** Fonu bir aracıya teslim etmek ajanlar için kabul edilemez bir risk.

Sonuçta ajanın parası olduğu halde hizmet alamadığı bir "ödeme duvarı" oluşuyor.

---

## Çözüm

AnyRail ajan ile servis arasına oturan ince bir ray:

1. **Servis tarafı basit kalır.** Servis yalnızca standart HTTP 402 ("Payment Required") ile BSV satoshi kabul eder. Başka hiçbir şey bilmesi gerekmez.
2. **Ajan tarafı esnek kalır.** Ajan elindeki varlığı söyler, ray dönüşümü otomatik yapar.
3. **Kimse kimsenin parasını tutmaz.** Her dönüşüm ya tamamen gerçekleşir ya da hiç gerçekleşmez.

---

## Nasıl çalışır (kavramsal)

Ajan ücretli bir servise istek atar ve "402: şu kadar sat öde" yanıtını alır. Sonra elindeki varlığa göre üç yoldan biri devreye girer:

### Yol 1: Zaten BSV'si var
Ajan doğrudan öder ve servis yanıt verir. En hızlı yol budur.

### Yol 2: BSV üzerindeki bir token'ı var (ör. dUSD, BSV-21)
- Ajan raydan fiyat teklifi ister.
- Bir likidite sağlayıcı (maker) ile **tek bir atomik işlemde** token'ı satoshi'ye çevirir. İki taraf aynı işlemi imzalar: ya ikisi de karşılığını alır ya da işlem hiç olmaz.
- Ardından servise öder.

### Yol 3: Fonu başka bir ağda (ör. Ethereum)
- Ajan bir gizli değer üretir ve fonunu Ethereum tarafında bu gizliye bağlı, süreli bir kilide koyar.
- Maker, BSV tarafında aynı gizliye bağlı satoshi'leri ajan için kilitler.
- Ajan BSV'yi alırken gizliyi açığa çıkarır. Maker da bu gizliyle Ethereum'daki fonu alır.
- Bir taraf yarı yolda bırakırsa süre dolunca herkes kendi parasını geri alır.
- Bu bir köprü değil, **atomik takastır**: arada fonu tutan bir aracı yoktur.

Üç yolun sonu aynı: **servis BSV ile ödenmiş olur ve her adım zincir üzerinde doğrulanabilir.**

---

## Neden BSV?

- **Mikro-ödeme gerçekten mikro.** İstek başına birkaç satoshilik ödeme ekonomik olarak anlamlı.
- **Hızlı ve ölçeklenebilir.** Ajanlar saniyede çok sayıda küçük ödeme yapabilir.
- **İzlenebilirlik.** Her ödeme ve takas zincir üzerinde kalıcı bir kayıt bırakır, bu da ajan davranışını denetlemeyi kolaylaştırır.
- **Kimlik + ödeme bir arada.** Cüzdan kimlik anahtarları sayesinde "kim ödedi" sorusu doğal olarak cevaplanır.

AnyRail başka ağlardaki değeri BSV'ye taşıyarak ağa **yeni kullanıcı ve likidite** getirir.

---

## Temel ilkeler

| İlke | Anlamı |
|---|---|
| **Non-custodial** | Ray hiçbir zaman kullanıcının veya ajanın fonunu tutmaz. |
| **Atomik** | Her takas ya tamamen olur ya da hiç olmaz. |
| **Servis için sıfır sürtünme** | Servis tek bir standart (HTTP 402 + BSV) entegre eder. |
| **Ajan için sınırlı yetki** | Ajan, sahibinin belirlediği bütçe ve limitler içinde harcar. Anahtarlar yapay zeka modeline asla gösterilmez. |
| **İnsan kontrolde** | Ajanın sahibi bütçeyi kendi cüzdanından yükler ve tüm hareketleri görür. |

---

## Kimler kullanır?

- **Ajan geliştiricileri:** Ajanlarına "her yerde ödeme yapabilme" yeteneği kazandırmak isteyenler.
- **API ve servis sağlayıcıları:** Abonelik veya API anahtarı olmadan istek başına ücret almak isteyenler (inference, veri, arama, hesaplama, içerik).
- **Likidite sağlayıcıları (maker'lar):** Takaslardan küçük bir fark kazanarak ray'a likidite verenler.
- **Ajan sahibi bireyler ve şirketler:** Ajanlarının harcamasını bütçe ve limitlerle kontrol etmek isteyenler.

---

## Örnek senaryo

> Bir araştırma ajanı, cüzdanında yalnızca Ethereum test ağında ETH ile bir rapor hazırlıyor.
> Ücretli bir veri API'sine istek atıyor ve "100 sat öde" yanıtı alıyor.
> AnyRail ETH'yi atomik takasla BSV'ye çeviriyor, ajan API'ye ödüyor ve veriyi alıyor.
> Ardından ajan elindeki dUSD token'ının bir kısmını satoshi'ye çevirip ikinci bir servise ödüyor.
> Ajanın sahibi her adımı, zincir üstü linkleriyle birlikte panelden izliyor.
> **Hiçbir aşamada fonlar bir aracının elinde durmuyor.**

---

## Bizi farklı kılan

- Takas (swap) ve zincirler arası fonlama tek bir **ödeme deneyiminde** birleşiyor. Ajan bunları ayrı ayrı düşünmek zorunda kalmıyor.
- Servisler için entegrasyon tek satır seviyesinde kalıyor; karmaşıklık rayın içinde saklanıyor.
- İnsanlar ve ajanlar **aynı rayı** kullanıyor: insan cüzdanından elle takas yapabiliyor, ajan aynı işlemi otomatik yapıyor.

---

## Gelecek vizyonu

- **Takas ve ödemeyi tek işlemde birleştirmek:** Token'ı çevirip servise ödemeyi tek atomik işlemde yapmak.
- **Çoklu maker ağı:** Birden fazla likidite sağlayıcının rekabet ettiği açık bir teklif pazarı.
- **Daha fazla ağ ve varlık:** Diğer EVM ağları, stablecoin'ler, başka UTXO zincirleri.
- **Ajan itibarı:** Zincir üstü ödeme geçmişine dayalı güven ve limit sistemi.
- **Harcama politikaları:** "Günde en fazla X", "yalnızca şu servislere" gibi kurallar.
