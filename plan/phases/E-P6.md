# E-P6 — Avatar modu (opsiyonel)

> Track E Faz 6 (`plan/track-E-frontend.md` §8 Faz 6). Yazan: E, 2026-10-31 03:00 CET. Zaman kutusu 2 saat. Dal `main`. Önceki: `E-P5.md` (✅ `e439969`).

## 0. Amaç
Kullanıcı kasabada kendi köylüsüyle yürüsün (WASD / ok tuşları), binaya yaklaşıp `E` ile aynı drawer'ları açsın; kamera onu izlesin. Tıklama modu kalır; iki mod arasında Kasaba'nın altındaki düğme ve `V` tuşu ile geçiş.

## 1. Tasarım
- **Ayar:** `settings.avatar` (varsayılan kapalı; `?avatar=1` açar). Bridge her senkronda `town.setAvatarMode(on)` çağırır.
- **Avatar:** cüzdan bağlıysa "you" köylüsü (`villager_00`), değilse `guest` köylüsü ("you (guest)") — jüri Desktop'sız yürüyebilsin. `Villager.player = true`: dolaşma ve hikâye yürüyüşleri (pledge sahnesi) avatarı sürüklemez; jeton avatarın bulunduğu yerden uçar.
- **Hareket:** fizik motoru yok. `TownScene.update(dt)` tuşları okur, hız 56 px/s, 8 yön; `map/blocked.ts` saf: su, bina ayak izleri (alt %45), tezgâhlar, kuyu/çeşme, ağaç gövdeleri bloklu tile'lar; avatarın ayak noktası bloklu tile'a giremez (eksen eksen kayma). Harita sınırı.
- **Kamera:** `startFollow(avatar, true, 0.12)`; avatar modunda sürükleme kapalı, tekerlek zoom açık.
- **Etkileşim:** 28 px içindeki en yakın hedef: pano → havuz drawer'ı, tezgâh → liste, ev → ajan, kasa sandığı → vault, atölye → workshop, liman ofisi → rail, Coop binası → ilk vault. Avatarın üstünde "E · Notice board" ipucu. `E` basılınca açılır.
- **Klavye:** WASD/oklar yürü, `E` etkileşim, `V` mod değiştir; giriş alanlarında kapalı; avatar modunda `A`/`E` gezinme kısayolları devre dışı (çakışma).

## 2. Testler
Birim: `blocked.test.ts` (su ve bina tile'ları bloklu, yol ve meydan açık; sınır). e2e `avatar.spec.ts`: modu aç, sağa yürü (x artar), atölye kapısına ışınla (`__town`, dev), `E` → "Workshop" drawer'ı.

## 3. Checkpoint (Faz 6 sonu, 31.10 03:30)

- `settings.avatar` (+ `?avatar=1`, `V`, Kasaba altındaki "Walk the town" düğmesi); `town/avatar.ts` (WASD/oklar, 56 px/s, duvar boyunca kayma, kamera takibi, 28 px içinde "E · hedef" ipucu, `E` → drawer), `map/blocked.ts` (su + bina/tezgâh/kuyu/çeşme/ağaç ayak izleri), `Villager.player` (dolaşma ve hikâye yürüyüşü kapalı; `stepAnim`), misafir avatar (cüzdansız), avatar modunda `A/E` gezinme kısayolları Kasaba'da kapalı.
- Testler: `blocked.test.ts` (2), `avatar.spec.ts` (yürü → x artar; atölye kapısında `E` → Workshop drawer'ı; `V` → harita modu). Toplam web vitest **20 dosya / 61 test**, Playwright **7/7**, typecheck temiz.
- Checkpoint: P7 (çok oyunculu) yapılmıyor — WS sunucu tarafı (B) gerekir ve teslime kalan süre belirsiz. Track E burada biter; kalanlar insan işi (yayın, mainnet kabulü, gerçek replay).

