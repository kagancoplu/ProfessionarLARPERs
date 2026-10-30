# E-P5 — Teslim

> Track E Faz 5 (`plan/track-E-frontend.md` §8 Faz 5). Yazan: E, 2026-10-31 02:00 CET. Zaman kutusu 1,5 saat. Dal `main`. Önceki: `E-P4.md` (✅ `780d5b7`).

## 0. Amaç
Frontend teslim paketi: sunum modu, `apps/web/README.md` teslim bölümü (D'nin kök README'sine link/özet), ekran görüntüleri, video malzemesi listesi, bilinen sınırlar, STATUS "Tamamlandı" + insan yapılacaklar.

## 1. Görevler
- 5.1 **Presenter mode** `?presenter=1` (veya `settings.presenter`): ana içerik %115, tur afişi gizli, toast'lar sessiz (bildirimler Explorer'da kalır), replay'de sahne atlama: `1` havuz açılır, `2` kilitlenme, `3` uzlaşma, `4` guard reddi, `5` market.
- 5.2 `apps/web/README.md`: "Open the town" (URL yayın sonrası), yerel çalıştırma, modlar, Desktop bağlantısı, ekran görüntüleri (`docs/screenshots/web/`), kısayollar, bilinen sınırlar, varlık lisansları özeti. Kök README'nin `apps/web` satırı zaten var; D'ye STATUS notu.
- 5.3 Ekran görüntüleri: `tools/screenshots.mjs` güncellenir (kasaba gün/gece, havuzlar, katılımcı, sağlayıcı, sahip, ajanlar, market, explorer, metrics) → `docs/screenshots/web/*.png` (1440×900).
- 5.4 Video malzemesi: `apps/web/VIDEO.md` (sahne listesi, hangi mod, hangi kısayol, süre).
- 5.5 Son kontrol: typecheck, vitest, Playwright 6/6, build, dürüstlük etiketleri grep, BSVA logosu kullanılmıyor (kural ihlali yok).
- 5.6 STATUS Track E "Tamamlandı (mock)"; insan yapılacaklar listesi tek yerde.

## 2. Checkpoint (Faz 5 sonu, 31.10 02:40)

- **Presenter mode** `?presenter=1`: `main` %115 (`zoom`), toast'lar kapalı, tur afişi gizli; replay'de `1`–`5` sahne atlama (`pool_opened`, `sign_request`, `pool_settled`, `cosign_denied`, `listing_added`).
- **README** `apps/web/README.md`: "Open the town", modlar, Desktop, ekran görüntüleri, Kasaba sözlüğü, bilinen sınırlar, lisans özeti, Deploy. Kök README'de `apps/web` satırı var (D); D isterse "Open the town" paragrafını alır (STATUS notu).
- **Ekran görüntüleri** `docs/screenshots/web/` (11 PNG, 1440×900): kasaba gün/genel/gece, havuzlar, katılımcı, sağlayıcı, sahip, ajanlar+injection, market, explorer, metrics+liman. `tools/screenshots.mjs` yeniden üretir.
- **Video malzemesi** `apps/web/VIDEO.md` (9 sahne, mod, kısayol, süre).
- **Son kontrol:** typecheck temiz, vitest 59, Playwright 6/6, `vite build` ✓; dürüstlük etiketleri (`demo pricing`, `simulated GPU jobs`, `experimental`, `MOCK`) yerinde; BSVA logosu kullanılmıyor.
- **STATUS:** Track E "Tamamlandı (mock)"; insan yapılacaklar tek listede.

**Teslim paketi:** URL (yayın sonrası), `docs/screenshots/web/*`, `public/replays/mock-demo.jsonl` (gerçek kayıt insan koşusunda), `assets/LICENSES.md`, `VIDEO.md`.
**Açık blokajlar → "Known limitations":** mainnet kabulü, yayın, C ajan SSE'si, gerçek replay.

