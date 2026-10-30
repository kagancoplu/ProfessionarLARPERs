# Mainnet runbook — sats geldiği andan teslime

> Hazırlayan: Track B (30.10 ~21:30). Bütün track'lerin mainnet adımlarını **tek sıraya** koyar; komutların ayrıntısı her track'in kendi README'sinde ve `docs/OPS.md`'de. Bu dosya onları tekrar etmez, sıralar.
> Durum (21:30): her track mockchain'de yeşil, **mainnet'te tek işlem yok**. Tek engel sats.

## 0. Şimdi, sats gelmeden (insan, 10 dk)

1. **Sats talebi:** Treasury BSV Desktop → Payments → Receive → BSV Address. Adresi ve takım adını Telegram'da **@lexamaison**'a gönder. Metin: `plan/phases/D-P0.md` §2 (mesaj 1 + 2; Axel'e sorular da orada).
2. **Treasury hangi Desktop?** Bu repo makinesindeki Desktop `03e8836800…94a45a`, mainnet ve kilidi açık (preflight). Treasury buysa STATUS → Track D'ye yaz; değilse treasury laptopunun identity key'ini yaz.
3. **`.env` izni:** `chmod 600 .env` (preflight 644 gördü). Anahtarları kasaya kopyala (`docs/OPS.md` §2).
4. **Ön kontrol:** `node infra/preflight.mjs`. Para harcamaz, anahtar basmaz. `Ready for S1` görene kadar `✗` satırlarını düzelt; `!` satırları uyarı.

## 1. Sıra

Her adımda: **kim · nerede · komut · maliyet (sat) · kayıt.** "Kayıt" = `plan/STATUS.md` → "Mainnet işlemleri"ne (tarih, T-numarası, txid, track, not) bir satır. Bütün betikler WhatsOnChain linkini basar.

| # | Adım | Kim · nerede | Komut | Sat | Kayıt / doğrulama |
|---|---|---|---|---|---|
| 1 | Servisler | B · repo makinesi | `node infra/run.mjs` (overlay :8080 + koordinatör :8090), ayrı terminalde `npm run guard -w @agentcoop/guard`, `npm run provider` | 0 | `node infra/preflight.mjs` → services ✓, koordinatör "signing rounds on" |
| 2 | İlk mainnet ödemesi (kilit) | D · treasury Desktop | `npx tsx --import @agentcoop/core/register-sdk scripts/fund.ts agent-1=1000` | 1.000 | fon txid; `fund.ts` satırı STATUS'a |
| 3 | **Doğrulama 2 + 3** (Desktop SINGLE\|ACP imzalar, Arcade kabul eder; kaç onay penceresi) | A · Desktop'lı makine | `npx tsx --import @agentcoop/core/register-sdk scripts/spike-sighash.ts` | ~2.000 (geri döner, ücret kalır) | Doğrulama tablosu #2, #3 (pencere sayısını gözle say) |
| 4 | S1 fonlaması | D · treasury | `…/fund.ts agent-1=49000 agent-2=50000 provider-api=20000` (önce `--dry-run`) | 119.000 | fon txid'leri; `node infra/preflight.mjs --wallets` → S1 ✓ |
| 5 | **S1 — walking skeleton** (T1, T2, T3×2, T5) | A · repo makinesi | `OVERLAY_URL=http://localhost:8080 npx tsx --import @agentcoop/core/register-sdk scripts/skeleton.ts` | ~1.000 fiyat + ücretler (takım içinde döner) | 5 txid STATUS'a; **Senkron S1 ✓**; overlay `GET /pools` havuzu `settled` gösterir |
| 6 | **Doğrulama 7** (soy, overlay'siz) | A | `npx tsx --import @agentcoop/core/register-sdk scripts/lineage-check.ts <T5 txid>_1` | 0 | Doğrulama #7 |
| 7 | Kalan fonlama | D · treasury | `…/fund.ts agent-3=50000 coordinator=5000 guard=5000 maker=30000`; Desktop→Desktop `desktop-owner=60000 desktop-human=30000` (`docs/OPS.md` §3.5) | 180.000 | fon txid'leri |
| 8 | Sağlayıcı ürün token'ı (T1) | C · sağlayıcı Desktop | `npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0` | ~ücret | T1 txid; `products/gpu-h100.json`'a tokenId yazılır |
| 9 | Havuz + teklif (T2) | C · sağlayıcı Desktop | `npm run provider-cli -- open-pool --credits 1000 --price 25000 --deadline +144 --fee 100 --label "8×H100 · 1 week" --min 10` | ~ücret | T2 txid; teklif hem koordinatörde hem zincirde (`offer` kaydı); `GET /pools` `hasOffer` |
| 10 | Ajanlar + insan pledge (T3) | C · repo makinesi; insan · `desktop-human` | `npm run agents` (WS'te kalırlar); insan: `npm run participant-cli -- pledge <poolId> <credits>` sonra `npm run participant-cli -- sign` | pledge'ler (havuz settle olunca sağlayıcıya) | T3 txid'leri; `GET /pools/:id` `pledgedCredits` |
| 11 | **Koordinatör settlement'ı (T5) — S2** | B (otomatik) | dolunca kendiliğinden; insan 60 sn içinde Desktop onayı verir | ücret ≈ 40 sat/katılımcı | T5 txid; `GET /pools/:id/audit` → `consistent`; `GET /metrics` → `custodiedSats: 0`; **Senkron S2 ✓** |
| 12 | Kredi kullanımı (T6) + perakende 402 (T7) | C | `npm run agent -- eval --jobs 3` | perakende iş ücreti | T6, T7 txid'leri |
| 13 | Vault (T9) + doğrulama 5 | D · owner Desktop | `npm run owner -w apps/owner-cli -- create-vault --agent agent-1` → `… policy …` → `… fund <vaultId> 20000` → `npm run adopt -w @agentcoop/guard -- agent-1 <vaultId>` | 20.000 (sahibin) | T9 txid; Doğrulama #5; overlay `{ op:'vaults', owner }` `verified:true` |
| 14 | Vault'lu ajan settlement'ta (T10) + injection reddi | C + D | vault'lu ajanla bir havuz (adım 9–11 tekrar); injection: `npm run demo-injection -w @agentcoop/scripts` mainnet modu varsa, yoksa guard `/decisions`'taki `denied` kaydı | ücret | T5 + T10 txid; guard 403 kaydı |
| 15 | Market (T8) | C / A | ajanın artan kredisini listele + başka ajan süpürsün (C'nin market davranışı) | ask fiyatı | T8 txid; `GET /listings` boşalır |
| 16 | Sahip vault'tan çeker (T9) | D · owner Desktop | `npm run owner -w apps/owner-cli -- withdraw <vaultId>` | ücret | T9 txid |
| 17 | Doğrulama 4 (nLockTime) | D | `npm run validation4 -w @agentcoop/scripts -- --yes` | ≤ 1.000 | Doğrulama #4 |
| 18 | Rail (T11, opsiyonel) | D | `docs/RAIL-POC.md` | Base gas + az USDC | T11 + BaseScan linki |
| 19 | Web canlı modu (video) | E | `npm run web` (servisler açıkken) | 0 | — |

**Asgari yol (zaman daralırsa):** 0 → 1 → 2 → 3 → 4 → 5 → 7 (yalnız agent-3) → 8 → 9 → 10 → 11 → 12. Bu sıra eleme şartlarının hepsini karşılar: gerçek mainnet işlemleri, BSV Desktop'lı kullanıcı akışı (sağlayıcı + insan katılımcı), non-custodial settlement (`custodiedSats: 0` + denetim) ve bir AI ajanının gerçek ödemesi (pledge + T7).

## 2. Bütçe

| Kalem | Sat |
|---|---|
| Sunucu cüzdanları (`docs/OPS.md` §1): provider-api 20k, coordinator 5k, guard 5k, agent-1..3 150k, maker 30k | 210.000 |
| Desktop'lar: owner 60k, human 30k | 90.000 |
| **Toplam** | **≈ 300.000** |
| Gerçekten tüketilen (ücretler, iadesiz kayıt bedelleri, perakende 402) | birkaç bin; pledge'ler settlement'ta sağlayıcıya, yani takıma döner |

Asgari yol için ≈ 125.000 sat yeter (adım 2–5 + agent-3).

## 3. Bir şey ters giderse

| Belirti | Ne yap |
|---|---|
| Arcade `REJECTED` / `DOUBLE_SPEND` | Tx'i yeniden kurma; STATUS → Blokajlar'a txid + mesaj. Koordinatör turunda bu, `round_failed` ve WoC'un harcanmış dediği girdinin kara listeye alınması demek (otomatik) |
| Overlay tx'i almadı (STEAK boş) | `npx tsx … scripts/lineage-check.ts <outpoint>`; ebeveyn overlay'de mi? TokenKit `sync()` ebeveyni zincirden yeniden gönderir (guide §17.6) |
| Koordinatör turu zaman aşımında | `GET /pools/:id` → `coordinator.blacklist` nedenleri; 3 turdan sonra havuz açık kalır, yeni pledge yeni deneme başlatır |
| Desktop onayını kaçırdım | `participant-cli sign` açık kalsın; sonraki turda tekrar sorulur |
| Para bitti | `docs/OPS.md` §4 |
| Servis düştü | `infra/run.mjs` kendisi yeniden başlatır; kara liste/tur geçmişi kalıcı (`data/coordinator/`) |
| `does not provide an export named …` | betiği `tsx --import @agentcoop/core/register-sdk` ile başlat |

## 4. Teslim için toplanacaklar (D'nin README'si)

- STATUS "Mainnet işlemleri"ndeki her satır → README "Example transactions" (WhatsOnChain linkleriyle).
- `GET /metrics` çıktısı (katılımcı sayısı, ücret, `custodiedSats`), en az bir settlement'ın `/audit` çıktısı.
- Doğrulama tablosunun mainnet sütunları (#2, #3, #4, #5, #7).
