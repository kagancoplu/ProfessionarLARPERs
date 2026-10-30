# E-V1 — Görsel yeniden yapım (ara faz, Faz 3'ten önce)

Durum: **araştırma bitti, paket seçimi kullanıcıda.** Faz 3 bu faz bitmeden başlamaz.

## Neden

Faz 0–2'de kasaba tamamen kod-çizimi (21 sprite, 16×16) ile yapıldı. Sonuç referans
görsellerin (Stardew/LimeZu "Serene Village" tarzı köy, pazar tezgâhı paketi) çok
gerisinde. Kalite farkının kaynağı kütüphane değil, **asset ve haritalama**:
el çizimi tileset + katmanlı harita (zemin / detay / gölge / üst) + derinlik sıralı
karakterler + gerçek 9-slice UI çerçeveleri. Phaser 3.90 bu iş için yeterli; değişen şey
kaynaklar ve boru hattı.

## Araştırma: ne kullanılıyor (Stardew benzeri 2D top-down)

### Motor / çalışma zamanı (zaten var, kalıyor)
- **Phaser 3.90** — Tiled JSON yükleme (`tilemapTiledJSON`), katmanlar, kamera zoom,
  `setDepth(y)` ile y-sıralama, tint ile gün/gece, partikül/tween ile duman, yaprak, su.
- **Animasyonlu tile'lar**: Phaser Tiled tile animasyonunu doğal desteklemiyor →
  `phaser-animated-tiles-phaser3.5` (nkholski fork; 3.5+ ile çalışır) **ya da** su/ateş
  gibi animasyonlu objeleri sprite olarak yerleştirip tilemap'i statik tutmak (öneri:
  ikincisi, bağımlılık yok, kontrol tam).
- **Işık**: Phaser'ın yerleşik Light2D (WebGL) gece sahnesi için yeterli; "lighting-2d"
  paketi Phaser AE'ye ait, buna gerek yok. Gölgeler: ayrı yarı saydam "shadow" katmanı
  (binaların ve ağaçların altına elips/ofset gölge) — tipik piksel oyunu tekniği.

### Harita editörü
- **Tiled 1.11** (ücretsiz, macOS `brew install --cask tiled`): Terrain Sets (Wang)
  ile otomatik kenar/köşe tile'ları (çimen→toprak→yol), nesne katmanları (bina kapıları,
  NPC noktaları, pazar tezgâh slotları), JSON export → Phaser. LDtk alternatifi daha iyi
  kural-tabanlı autotile sunar ama Phaser tarafında ek yükleyici gerekir. **Seçim: Tiled.**

### Piksel editörü
- **Aseprite** ($20, kaynak derlenebilir) ya da **Pixelorama** (ücretsiz, MIT). Paketleri
  birleştirip renk paletini uyarlamak, yeni prop çizmek (ilan panosu, kum saati, BSV ikonu)
  ve 4-yönlü yürüyüş kesmek için. Mevcut `tools/sprites.mjs` (sharp + free-tex-packer)
  atlas üretimine devam eder; artık kod-çizim yerine PNG kaynaklardan paketler.

### Asset paketleri (lisans doğrulandı, sayfalardan)

| Rol | Paket | Lisans | Fiyat | Not |
|---|---|---|---|---|
| **Ana tileset + 24 ev** | LimeZu **Serene Village – revamped** [16×16] | **CC BY 4.0** (atıf şart) | ücretsiz | Referans görsel 2'ye en yakın. Zemin, ağaç, kaya, mantar, prop, 24 ev, animasyonlu kapı/kamp ateşi. Karakter yok (Modern Interiors'tan). |
| **Pazar tezgâhları, çit, bitki, hayvan, NPC** | Kenmi **Cute Fantasy RPG** | Ücretsiz katman **ticari değil**; Premium ≥ $3.99 ticari OK, yeniden dağıtım yok | $3.99 | Referans görsel 3'e en yakın. Premium: evler, çitler, pazar tezgâhları, meşale/fener, 11 hayvan, 8 NPC, animasyonlu su. **Ücretsiz katmanı kullanmıyoruz** (hackathon projesi ticari sayılmayabilir ama riski almayalım). |
| **Karakterler (50 köylü, 16×32, 4-yön yürüyüş)** | mem_px **Top Down Characters** | ticari OK, yeniden dağıtım yok, "no generative AI" | $3 | Ajanlar/katılımcılar için çeşitlilik. |
| **Karakter yedek (3 kişi, idle+walk 4-yön)** | Moonforge **PixelArt Characters Base** | kişisel+ticari OK, atıf isteğe bağlı | ücretsiz | mem_px alınmazsa ya da idle animasyonu için. |
| **UI çerçeveleri (9-slice, parşömen/ahşap)** | **Kenney Pixel UI Pack** | CC0 | ücretsiz | Signboard/Scroll/Drawer çerçeveleri, butonlar, ikonlar. DESIGN.md'nin 0-radius/sert gölge kuralıyla uyumlu. |
| **Ek zemin/uçurum/çiftlik autotile** | Kenney **Tiny Town** (16×16) | CC0 | ücretsiz | Yedek dolgu; stil LimeZu'dan daha sade, karıştırırken dikkat. |

Elenenler: freezepops bundle (sayfada lisans yok, **AI-assisted**), gegx UI kit
(AI-assisted), Sprout Lands (48 px, ölçek uyumsuz; ücretsiz katman ticari değil),
forchild CC0 village (çok sade), Smallburg (lisans metni çelişkili).

AI raster yasağı korunur: seçilen tüm paketler "no generative AI" ya da el çizimi beyanlı.

### Toplam maliyet
$3.99 (Kenmi Premium) + $3 (mem_px) = **~$7**. Kenmi'siz de olur (LimeZu + Kenney +
Moonforge, hepsi ücretsiz) ama pazar tezgâhları ve hayvanlar o zaman bizim çizimimiz olur.

## E-V1 uygulama planı

1. **Kurulum** — paketler `apps/web/assets/packs/<ad>/` altına (ham zip içerikleri
   `data/` gibi değil; lisanslı dağıtılabilir dosyalar repo'ya girer, Kenmi/mem_px
   "yeniden dağıtım yok" dediği için **yalnızca işlenmiş atlas** commit edilir, ham
   paketler `.gitignore`). `LICENSES.md` her paket için atıf satırı.
   `brew install --cask tiled`.
2. **Palet uyumu** — LimeZu paleti DESIGN.md token'larına bağlanır (gün/gece tint'leri
   LimeZu çimen/çatı renklerinden türetilir). Kenmi ve karakter paketleri gerekirse
   palet-swap ile LimeZu'ya yaklaştırılır (Pixelorama).
3. **Harita** — Tiled'da `town.tmj`: katmanlar `ground` (Wang terrain: çimen, toprak yol,
   taş meydan, su kenarı), `ground_detail` (çiçek, çakıl, kök), `shadows`,
   `buildings_low` / `buildings_high` (çatılar karakterin üstünde), `props`, `above`,
   nesne katmanı `spawns` (board, 6 bina kapısı, pazar tezgâh slotları ×6, NPC yolları).
   Boyut 40×30, kamera 3× zoom (16 px → 48 px ekran).
4. **Phaser** — `TownScene` yeniden: tilemap yükleme, y-sıralı sprite grubu, bina
   kapılarında kapı animasyonu, baca dumanı partikülü, su/ateş sprite animasyonu, gece
   modu (tint + fener Light2D). Binalar artık kod-çizim değil; pool/provider/vault/market/
   guard/board konumları `town.json`'dan nesne katmanına taşınır.
5. **Karakterler** — `Villager` 16×32 4-yön yürüyüş + idle; pazar tezgâhı önünde durma,
   panoya bakma; ajan kimliği şapka/renk varyantı ile.
6. **UI** — Signboard/Scroll/Drawer/PixelButton Kenney 9-slice'a geçer; piksel ikonlar
   (coin, sack, hourglass, shield) Kenney veya LimeZu'dan, kod-çizim olanlar emekli.
7. **Kalite kapısı** — `/design-review` (anti-slop), referans görsellerle yan yana ekran
   görüntüsü, 1× / 3× ölçekte piksel hizası kontrolü (hiç yarı piksel yok), e2e 4/4,
   `npm test` yeşil. Dürüstlük etiketleri yerinde kalır.
8. **Checkpoint** → STATUS Track E → Faz 3.

Faz 3 (owner console + guard, market) bu fazın üstüne inşa edilir; Town v2 işi Faz 3'ten
buraya çekildi.

## Açık kararlar (kullanıcı)
- [ ] Kenmi Cute Fantasy **Premium** ($3.99) alınacak mı? (pazar tezgâhları + hayvanlar)
- [ ] mem_px 50 karakter ($3) alınacak mı, yoksa ücretsiz Moonforge 3 karakter yeter mi?
- [ ] Aseprite ($20) mi Pixelorama (ücretsiz) mi?
- [ ] Ham paketler yerel `apps/web/assets/packs/` (gitignore) — kabul?
