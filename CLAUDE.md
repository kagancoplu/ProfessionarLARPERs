# CLAUDE.md

Proje kuralları: @AGENTS.md

Bu repoda dört track (A, B, C, D) aynı anda, aynı `main` dalında çalışıyor.

## Her kullanıcı mesajından sonra

1. `git pull --rebase --autostash` çalıştır.
2. Yeni commit geldiyse `plan/STATUS.md`'yi oku: Blokajlar, Arayüz değişiklikleri ve sana yazılmış notlar ("→ A", "**A:**" gibi).
3. Gelen değişiklik senin işini etkiliyorsa önce ona göre uyum sağla, sonra isteğe devam et.

## Commit ve push'tan önce

1. `git pull --rebase --autostash` çalıştır.
2. Çakışma varsa dur ve kullanıcıya sor; başkasının değişikliğini ezme.
3. Gelen commit'ler senin dokunduğun dosyaları değiştirdiyse `npm test` ve `npm run typecheck` koş.
4. Dosyaları adıyla ekle (`git add -A` yok). `.env`, anahtar, seed ve `data/` asla commit edilmez.
5. Sonra commit et ve push et. Push reddedilirse 1. adıma dön.
