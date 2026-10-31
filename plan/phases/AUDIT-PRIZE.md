# Denetim ödülü (TUM Blockchain Club × Adevar Labs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hakemler "güvenlik denetimini en çok hak eden, geliştirilmeye devam edilecek en ciddi 3 proje"yi seçiyor; AgentCoop'u denetime hazır, kanıtı doğrulanabilir ve dürüst bir proje olarak göstermek.

**Architecture:** Yalnızca belge, test, kontrol betiği ve CI eklenir. Ürün kodunun davranışı değişmez (kullanıcı kuralı, 31.10). Bulunan açıklar düzeltilmez, belgelenir; düzeltme kararı ekibindir.

**Tech Stack:** Markdown, vitest (mevcut `@ethereumjs/evm` test altyapısı), Node betiği, GitHub Actions.

**Spec:** Kullanıcının isteği (31.10 06:40): "kapsamlı bir plan oluştur, gerekli geliştirmeleri acilen yap; inisiyatif alabilirsin ama ana projenin kodunu bozma ya da davranışını değiştirme". Ödül sayfası: Devfolio'daki her proje otomatik değerlendirilir; ölçüt "the three most serious projects… that most deserve a security audit to keep building".

## Global Constraints

- Ürün kodu (`packages/*/src`, `apps/*/src`, `contracts/*.sol`) değişmez. Yeni dosyalar: belge, test, `scripts/check-docs.mjs`, `.github/workflows/ci.yml`, `LICENSE`.
- Belgeler İngilizce (hakemler uluslararası); plan ve STATUS Türkçe.
- Her iddia kanıtlı olur: dosya yolu, test adı ya da txid. Kanıtı olmayan iddia yazılmaz.
- Açık riskler gizlenmez; "Open"/"Bounded" olarak yazılır.
- Gizli değer (anahtar, `.env` içeriği) hiçbir dosyaya, log'a, commit'e girmez. CI workflow'u hiçbir secret'a referans vermez, `permissions: contents: read`.
- CLAUDE.md: `main`, commit öncesi `git pull --rebase --autostash`, dosyalar adıyla eklenir.

## Review Focus

1. Belgedeki bir test adı ya da dosya yolu gerçekte yoksa hakem bunu "sahte kanıt" olarak okur: Task 1'in betiği hepsini mekanik olarak kontrol eder.
2. Eski iddialar (T-10 iade yolu, "mainnet'te hiçbir şey koşmadı", README limitations) kod ve testle çelişiyor: Task 2 ve 6 düzeltir, final review yeniden doğrular.
3. CI kırmızı görünürse olumsuz sinyal: Task 5 yeşil koşuyu `gh run` ile doğrular; yeşil değilse badge eklenmez.
4. HTLC sınır durumları (timeout'a tam eşit zaman, aynı parametrelerle ikinci kilit, iki kilidin bakiye ayrımı) test edilmemiş: Task 3.
5. Denetim belgesindeki "kendi bulgularımız" yanlış ya da abartılı olursa güven kaybı: her bulgu kod satırına bağlanır, final review kontrol eder.

---

### Task 0: Kanıt toplama (yapıldı, 31.10 06:45)

Bulgular (Task 4'ün girdisi):
- Git geçmişi taraması (`git log --all -p`; `sb_secret_`, 64-hex `*KEY=`, PEM, WIF, JWT kalıpları): gerçek anahtar yok. Tek eşleşme `apps/relay/test/config.test.ts`'teki sahte `sb_secret_value_that_must_not_leak`. `.env`, `data/`, `*.sqlite` hiç commit edilmemiş.
- `npm audit --omit=dev`: 3 high. `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, bellek tüketimi; `@anthropic-ai/sdk` ve `viem` üzerinden), `tmp` (GHSA-7c78-jf6q-g5cm; `solc` derleyicisi üzerinden, derleme zamanı). Tüm ağaçta ek 29 high: `jimp` → `free-tex-packer-core` (web varlık aracı, yalnızca geliştirme).
- Mainnet kanıtı (`apps/web/src/proof/mainnet.ts`): T1, T2, T3, T4, T5, T5v, T5-L, T6, T7, T9, T10. Eksik: T8, T11, T11b.
- T-10: iade artık kasaya dönüyor (`apps/provider-api/src/redeem.ts:215`, test `test/agents.vault.mockchain.test.ts` › "its credits are locked to the vault; it redeems them with the guard; a return goes back to the vault"). THREAT-MODEL ve README eski.
- HTLC.sol öz incelemesi: CEI sırası doğru (durum transferden önce). Notlar: ücret kesen (fee-on-transfer) token'da kayıtlı `amount` > alınan miktar, aynı token'daki başka kilitlerden ödenir; `bool` döndürmeyen token'larla `require(transfer)` geri döner; aynı parametrelerle ikinci kilit `lock exists`; BSV iadesi blok yüksekliğine (6 blok), Base zaman aşımı saniyeye (≥ 3 sa) bağlı: blok süresi sapmasında güvenlik payı daralır (`apps/maker/src/rail.ts:34-35`).

### Task 1: Belge kanıt denetleyicisi

**Files:** Create `scripts/check-docs.mjs`; Modify `package.json` (script `check:docs`)

**Interfaces:** Produces `node scripts/check-docs.mjs [files…]` → çıkış 0 = her referans var; 1 = eksikleri listeler. Varsayılan dosyalar: `docs/THREAT-MODEL.md`, `docs/AUDIT-READINESS.md` (varsa), `SECURITY.md` (varsa).

- [ ] Kurallar: (a) backtick içindeki, repo köküne göre var olması gereken yol (`/` içeren, `.ts|.sol|.md|.mjs|.json` ile biten ya da `/` ile biten) → dosya/dizin var mı; (b) tablo satırında `` `x.test.ts` › "ad" `` kalıbı → o dosyada `ad` metni geçiyor mu (`, ` ile ayrılmış birden çok ad); (c) `:N` satır ekli yollar için dosya ≥ N satır.
- [ ] Bugünkü `docs/THREAT-MODEL.md`'ye karşı koş. Beklenen: ya 0 ya da gerçekten eskimiş referanslar (Task 2'de düzeltilir).
- [ ] `npm test`'e eklenmez (diğer track'lerin test adlarını değiştirmesi onların paketini kırmasın); CI'da ayrı adım.
- [ ] Commit: `docs: check-docs verifies paths and test names cited in security docs`

### Task 2: THREAT-MODEL tazeleme

**Files:** Modify `docs/THREAT-MODEL.md`

- [ ] Kanıt durumu satırı: mainnet'te gözlenenler (Task 0 listesi, txid'li).
- [ ] Mainnet sütunu: T-1 (T5 `5314ab8b…`, audit `consistent`), T-4 (T5), T-9/T-11/T-12 (T9/T10), T-10 (T5v `08a64556…`, T10 `43906050…`), T-20 (T5-L `83d339b8…`), T-17 (T7). Txid'ler WhatsOnChain linkli.
- [ ] T-10 düzeltmesi: dolaylı yol kapandı (iade kasaya); test adı Task 0'daki.
- [ ] Yeni: T-22 canlı ayna (Supabase) yalan söyler → tarayıcı havuz koşullarını koordinatörden okur (`apps/web/src/wallet/flows/live.ts`), RLS yalnızca select, yazma anahtarı yalnızca relay'de; test `test/web.live-flows.mockchain.test.ts` › "a pledge pays the pool's real fee script even when the store holds tampered terms". T-23 Coop Rail zamanlama (yükseklik ↔ saniye) ve token varsayımları: Open, belgelenmiş.
- [ ] §3 "What still needs mainnet" güncel (2, 5 ✓; 3 kısmi; 4, 6, T8, T11 bekliyor).
- [ ] `npm run check:docs` → 0. Commit: `docs(threat-model): mainnet evidence, T-10 closed, T-22 live mirror, T-23 rail timing`

### Task 3: HTLC sınır testleri (yalnızca test)

**Files:** Create `apps/maker/test/htlc.boundaries.evm.test.ts` (mevcut `MemoryEvm`, `deployHtlc`, `lockUsdc`, `claimUsdc`, `refundUsdc`, `getLock`, `usdcBalance` yardımcıları; `.sol` eklenmez, artefakt testi bozulmaz)

- [ ] `claim at exactly the timeout reverts; refund one second before it reverts, at it succeeds`
- [ ] `a second lock with identical parameters reverts (lock exists); a different timeout makes a new id`
- [ ] `zero amount and zero addresses are refused`
- [ ] `two locks of the same token are isolated: claiming one leaves the other's tokens in the contract`
- [ ] `a refund pays the sender and a claim pays the receiver whoever calls`
- [ ] Bunlar mevcut davranışı belgeler; ilk koşuda geçmeleri beklenir (davranış değişmiyor). TDD notu: her testin yakaladığı bozulmayı doğrulamak için geçici olarak beklentiyi tersine çevirip kırmızı gör, geri al (kontrat değişmez).
- [ ] `npx vitest run apps/maker/test/htlc.boundaries.evm.test.ts` → PASS. Commit: `test(maker): HTLC boundary and isolation tests`

### Task 4: `docs/AUDIT-READINESS.md`

**Files:** Create `docs/AUDIT-READINESS.md`

Bölümler: 1) Neden denetim (değer akışı, kim kaybeder); 2) Sistem ve güven sınırları (mermaid); 3) Kapsam: öncelik sırasıyla yol + satır sayısı (script şablonları 504, settlement/pool 1041, imzalayıcılar 668, lineage 154, overlay kuralları 1265, guard 1794, koordinatör 2090, provider-api 1082, HTLC.sol 62, maker 861); kapsam dışı (web, relay, simüle runner'lar); 4) Değişmezler: her biri → zorlandığı yer → test; 5) Varsayımlar; 6) Kendi bulgularımız (Task 0 HTLC notları, T-5/T-6/T-12/T-13 sınırları, Supabase ertelenmiş güvenlik maddeleri: `live_health.detail`, doğrulanmayan `move` yayınları); 7) Bağımlılık ve sır taraması (Task 0, komutlarıyla); 8) Mainnet kanıtı; 9) Nasıl derlenir/test edilir; 10) Önceki incelemeler (Supabase katmanı final review: 1 kritik + 9 önemli düzeltildi, commit'ler); 11) Denetçiden istediğimiz odak.

- [ ] `npm run check:docs` → 0. Commit: `docs: audit readiness package`

### Task 5: SECURITY.md, LICENSE, CI

**Files:** Create `SECURITY.md`, `LICENSE` (MIT; README zaten MIT diyor), `.github/workflows/ci.yml`

- [ ] SECURITY.md: GitHub private vulnerability reporting ile bildirim, kapsam, anahtar politikası (repo'da anahtar yok; sunucu anahtarları env'den), denetim belgesine bağlantı. `gh api -X PUT repos/{owner}/{repo}/private-vulnerability-reporting` ile özelliği aç.
- [ ] CI: `push`/`pull_request` (main); Node 24; `npx npm@11 ci` (yoksa `install`); `npm run typecheck`; `npm test`; `npm run check:docs`; `npm audit --omit=dev` (bilgi amaçlı, `continue-on-error`). Secret referansı yok, `permissions: contents: read`.
- [ ] Push → `gh run watch` → yeşil. Kırmızıysa nedeni ürün kodu değişmeden giderilir (ortam/kurulum); giderilemezse badge eklenmez, rapor edilir.
- [ ] Commit: `chore: LICENSE, SECURITY.md, CI (typecheck, tests, docs check)`

### Task 6: README ve ROADMAP

**Files:** Modify `README.md`; Create `docs/ROADMAP.md`

- [ ] README: CI badge (yalnızca yeşilse); "Security and audit" bölümü (SECURITY.md, AUDIT-READINESS, THREAT-MODEL, check-docs); eski durum satırı ve "Known limitations" mainnet gerçeğine göre; T-10 cümlesi; License satırı.
- [ ] ROADMAP: ana ağ öncesi kapılar (denetim, doğrulama 4/6, sağlayıcı teminatı T-5, gerçek runner/SmartRoute), denetim kredisinin kullanım planı (1./2./3. paket neyi kapsar), sonraki 3 ay.
- [ ] `npm run check:docs README.md docs/ROADMAP.md` → 0. Commit: `docs: README security section, roadmap`

### Task 7: STATUS, final review, rapor

- [ ] `plan/STATUS.md` "Plan değişiklikleri" satırı.
- [ ] Taze bir reviewer (en yetenekli model): belge iddialarını kod/testle karşılaştırır, abartı ve yanlışları listeler. Kritik/önemli bulgular tek düzeltme turunda giderilir.
- [ ] Kullanıcıya: ne eklendi, CI sonucu, açık kalan insan adımları (GitHub `WALLET_*` secret'ları, Devfolio gönderimi).
