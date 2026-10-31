# CLAUDE.md

Proje kuralları: @AGENTS.md

Bu repoda beş track (A protokol, B overlay + koordinatör, C sağlayıcı + ajanlar, D vault + ops + rail, E frontend) aynı anda, aynı `main` dalında çalışıyor.

## Belge haritası

Önce durum ve açık işler, sonra ihtiyaca göre gerisi. Yeni bir belge eklersen buraya da ekle: haritada olmayan belge kalmasın.

- **Durum ve açık işler**
  - `plan/STATUS.md`: her mesajdan sonra okunur (blokajlar, arayüz değişiklikleri, mainnet işlemleri, doğrulama testleri, track bölümleri).
  - `plan/BACKLOG.md`: açık işler (BL-xx), öncelik sırasıyla. Bir işi bitirince satırını `✅ tarih commit` yap.
  - `plan/HANDOFF.md`: 31.10 oturum devri. Supabase katmanı (kurulum, anahtarların yeri), güvenlikte yapılanlar ve kalanlar, denetim ödülü.
  - `plan/phases/C-HANDOFF.md`: Track C'nin devir notu.
- **Fikir ve plan**
  - `FINAL-IDEA.md`: ürün, mekanizma, kapsam, jüri kriterleri, teslim şartları.
  - `plan/00-MASTER-PLAN.md`: arayüzler (§3), fazlar ve senkronlar (§5), cüzdanlar (§6).
  - Track planları: `plan/track-A-protocol.md`, `plan/track-B-overlay-coordinator.md`, `plan/track-C-provider-agents.md`, `plan/track-D-vault-ops-rail.md`, `plan/track-E-frontend.md`.
  - Faz planları: `plan/phases/` (`<track>-P<n>.md`). Ayrıca `plan/phases/SUPABASE-MVP.md` (Supabase canlı katmanı), `plan/phases/AUDIT-PRIZE.md` (denetim hazırlığı), `plan/phases/A-P6-covenant-report.md`, `plan/phases/A-P6-ordlock-notes.md`.
  - `plan/SUPABASE-FLOW.md`: Supabase akış raporu.
  - `plan/DEMO-HYBRID.md`: herkese açık pitch demosu (Vercel + Supabase, backend yok; akış mock, ödemeler gerçek mainnet).
  - `plan/MAINNET-RUNBOOK.md`: mainnet koşusu, adım adım.
  - `plan/SETUP-ACCOUNTS.md`: hesaplar ve servisler.
  - İlk fikirler (arşiv; `FINAL-IDEA.md`'ye birleşti): `idea.md`, `AnyRail-fikir.md`, `agent-spending-vault.md`.
- **Güvenlik**
  - `SECURITY.md`: açık bildirme yolu.
  - `docs/AUDIT-READINESS.md`: kapsam, değişmezler, kendi bulgularımız F-1…F-11, taramalar.
  - `docs/THREAT-MODEL.md`: T-1…T-23, kontrol → kod → test → mainnet txid.
  - `docs/ROADMAP.md`.
  - Bu belgelerden birine dokunursan `npm run check:docs` koş (CI'da da koşuyor: `.github/workflows/ci.yml`).
- **Operasyon**
  - `docs/OPS.md`: cüzdanlar, anahtarlar, fonlama.
  - `docs/RAIL-POC.md`: Coop Rail.
  - `infra/README.md`: herkese açık deploy.
  - `scripts/rehearsal-supabase.ts`: yalnızca yerel Supabase'le uçtan uca prova.
- **BSV referansı**
  - `AGENTS.md` (`docs/AGENTS.md` ile aynı; içindeki starter yolu bu repoda `docs/starter/`).
  - `docs/BSV_STACK_COMPLETE_GUIDE.md`, `docs/START-HERE.md` (hackathon developer pack).
  - `docs/starter/bsv21-token-kit/`.
- **Bileşenler**
  - `README.md`: genel bakış, tx tablosu, güvenlik bölümü.
  - `README-SIMPLE.md`: BSV'yi bilen ama geliştirici olmayan okur için sade anlatım; canlı demo linki ve seçili mainnet işlemleri.
  - Paketler: `packages/core/README.md`, `packages/overlay/README.md`.
  - Uygulamalar: `apps/agents/README.md`, `apps/coordinator/README.md`, `apps/guard/README.md`, `apps/owner-cli/README.md`, `apps/participant-cli/README.md`, `apps/provider-api/README.md`, `apps/provider-cli/README.md`, `apps/relay/README.md`, `apps/web/README.md`.
  - Web: `apps/web/DESIGN.md` (tasarım sistemi), `apps/web/VIDEO.md` (video çekim senaryosu; `/film` film modu ve "The Pool" senaryosu), `apps/web/assets/LICENSES.md`, `apps/web/assets/packs/README.md` (git'te olmayan sanat paketleri).
- **Proje skill'leri**: `.claude/skills/village-art-direction/SKILL.md` (Kasaba sanatı), `.claude/skills/pixelbolt-pixel-art/SKILL.md`.

## Demo senaryoları (business)

Business tarafındaki arkadaş başka bir Claude oturumundan senaryo, demo sahnesi ve akış getirebilir (ör. 5 kullanıcı ortak bir servis alır). Böyle bir senaryoyu uygularken önce `plan/DEMO-HYBRID.md`'yi oku ve kurallarına uy:

- Demo yalnızca Vercel + Supabase üzerinde, ücretsiz çalışır; backend yayınlanmaz.
- Akış mock ilerler, ama her ödeme gerçek mainnet işlemidir. Ödeyenin parası BSV Desktop'tan gerçekten düşer, karşı taraf `internalizeAction` ile gerçekten alır.
- Lobi kurulmaz; taraflar arası iletişim Supabase Realtime ile ekranda gösterilir.
- Senaryo backend gerektiriyorsa uygulamadan önce kullanıcıya sor.

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
