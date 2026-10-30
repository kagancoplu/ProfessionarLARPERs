# STATUS — AgentCoop

> Her track **yalnızca kendi bölümünü** günceller; her faz sonunda. Diğer bölümler okunur.
> Tarih/saat yaz (yerel). Dosya yollarını tam ver. Arayüz değişikliğini hem burada hem `00-MASTER-PLAN.md §3`'te yap.

## Senkron noktaları

| Senkron | Durum | Tarih | Not |
|---|---|---|---|
| S0 | ☐ | | |
| S1 walking skeleton | ☐ | | txid: |
| S2 K1 entegre | ☐ | | |
| S3 K2 entegre | ☐ | | |
| S4 freeze | ☐ | | |

## Blokajlar (herkes yazar, çözen siler)

| Tarih | Track | Blokaj | Kimden bekleniyor | Geçici çözüm |
|---|---|---|---|---|
| 30.10 16:15 | B | B.P1 için A.P0 yok: kök workspace, `packages/core` (`types.ts`, `opreturn.ts` `parseOpReturn`, kit kopyaları) | A | `packages/overlay` bağımsız paket olarak çalışıyor; `src/kit/*` geçici kopya; P1'de MASTER §3.3 tiplerinin ve §3.2 OP_RETURN zarfının geçici kopyasıyla devam |
| 30.10 16:15 | B | `pledgeListHash` biçimi belirsiz: MASTER §3.2 `sha256(join(outpoints sorted))` ayırıcıyı ve outpoint yazımını (`txid_vout` mı `txid.vout` mu) söylemiyor; ayrıca sıralama kuralı `(blockHeight, txid)` iken "outpoints sorted" leksikografik sıralama gibi okunuyor. Koordinatör (B), katılımcı doğrulaması (A) ve denetim (B Faz 6) aynı baytları üretmeli | A (`planSettlement` sahibi) | B'nin testleri şimdilik `txid_vout`, leksikografik sıra, `,` ayırıcı kullanıyor (yalnızca test). A karar verip MASTER §3.2'ye yazınca B uyar |

## Arayüz değişiklikleri (herkes okur)

| Tarih | Track | Değişen | Neden | MASTER-PLAN güncellendi mi |
|---|---|---|---|---|

## Plan değişiklikleri

| Tarih | Track | Faz | Değişiklik | Neden |
|---|---|---|---|---|
| 30.10 16:00 | B | 5 (yeni) | **Faz 5 — Herkese açık yayın** eklendi: VPS, HTTPS (Caddy), alan adı (yoksa sslip.io), CORS, hız sınırı, WS `hello` kimlik kanıtı, `/healthz` + uptime izleme, "kendi ajanınla katıl" kılavuzu. S3'ten sonra başlar | Jüri ve dış ajanlar ürünü yerelde olmadan deneyemiyor (adoption %35, clear demo). `plan/SETUP-ACCOUNTS.md` repoda yok; D'nin yazması bekleniyor |
| 30.10 16:15 | B | 1 | Faz 1.1: topic manager pledge coin'lerini ve vault çıktılarını harcayan girdileri de **`coinsToRetain`**'e koymalı | Engine (`@bsv/overlay` 2.6.4 `classifyPreviousCoins`) önceki topic çıktılarından `coinsToRetain`'de olmayanları "stale" sayıp **siliyor**. Kit kuralı yalnızca token girdilerini tutuyor; pledge'ler tutulmazsa settlement/iptal (T4) geçmişi ve Faz 6.3 denetimi kaybolur |
| 30.10 16:00 | B | 6 (yeni) | **Faz 6 — İzinsizlik ve ölçek kanıtı** eklendi: ikinci bağımsız koordinatör, `GET /metrics` (`custodiedSats = 0` zincirden hesaplı), `GET /pools/:id/audit` (sıralama + pledge-list hash'ini yeniden hesaplar), 50+ katılımcılı mainnet settlement (C'nin ajan sürüsüyle). S3'ten sonra; sıra 5 → 6 → 4 | FINAL-IDEA §8 "seçim yetkisi tespit edilebilir" iddiasının ve §11 kapanış rakamlarının kanıtı. **Önerilen arayüz eki (henüz MASTER'a yazılmadı, Faz 6.1'de):** teklif imzasını ayrı bir `OP_RETURN agentcoop offer` tx'iyle zincire yazmak, böylece ikinci koordinatör birinciye bağımlı kalmaz |

## Mainnet işlemleri

| Tarih | Tip (T1–T11) | txid | Track | Not |
|---|---|---|---|---|

## Doğrulama testleri (MASTER-PLAN §5 / FINAL-IDEA §12.1)

| # | Test | Sahip | Sonuç | Not |
|---|---|---|---|---|
| 1 | Overlay karışık settlement'ı kabul ediyor | B | ✅ 30.10 16:05 (mockchain) | `tm_agentcoop`, kit kuralları **değişmeden** kabul ediyor. Settlement: in0 sağlayıcı kredi UTXO'su (N=1000, `SINGLE\|ACP\|FORKID`) + 3 pledge coin (`ALL\|FORKID`) → out0 4.500 sat sağlayıcıya, out1–3 kredi 600/300/100, out4–6 para üstü (pledge coin'in kendi script'ine), out7 OP_RETURN settle. STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`; overlay SPV + tüm script'leri doğruladı; lookup'ta her ajan payını görüyor, teklif UTXO'su `spent` + `spendingTxid`. Ek kanıtlar: **(1b)** sağlayıcının SINGLE\|ACP imzası farklı katılımcı/pay/para üstüyle yeniden kurulan planda da geçerli, yani koordinatörün yeniden planlaması (3 tur) yeni sağlayıcı imzası istemiyor; **(1c)** out0 1 sat düşünce imza geçersiz; **(1d)** karışık tx'te enflasyon admit edilmiyor; **(1e)** overlay'in admit etmediği kredi girdisiyle settlement tamamen reddediliyor. Test: `packages/overlay/test/validation1.mixed-settlement.test.ts`. **A için sonuç: `rules.ts` genişletmesi gerekmiyor; FINAL-IDEA §12.2 B planına gerek yok** |
| 2 | Desktop SINGLE\|ACP imzalıyor, Arcade kabul ediyor | A | ☐ | |
| 3 | Desktop izin davranışı | A | ☐ | |
| 4 | nLockTime yükseklik semantiği | D | ☐ | |
| 5 | Vault script'i politikadan geçiyor | D | ☐ | |
| 6 | v1 tx malleability kuralları | D | ☐ | |
| 7 | `beefFromArcade` soyu yürüyor | A | ☐ | |
| 8 | Arcade policy (boyut/ücret) | B | ✅ 30.10 16:10 | Arcade v0.16.0 (`/health`): ücret datahub'lara göre **1–100 sat/kB** (planlamada 100 kullan); en sıkı maks. tx 100 MB, en sıkı maks. script 500 kB; girdi sayısı sınırı yok. Gerçek script şekilleriyle ölçülen boyut (gerçek settlement'la %0,3 tutarlı): 3 katılımcı 1.486 B / 149 sat; 20 → 7.674 B / 768 sat; 50 → 18.594 B / 1.860 sat; 100 → 36.794 B / 3.680 sat; 80 p2pkh + 20 vault → 39.314 B / 3.932 sat. Katılımcı başına ~37–50 sat ücret. **Politika settlement boyutunu sınırlamıyor; MASTER §3.2 %120 ve katılımcı sayısı sınırı değişmiyor.** Betik: `packages/overlay/scripts/arcadePolicy.ts` (`npm run arcade-policy`), model: `packages/overlay/scripts/settlementSize.ts` |

---

## Track A — Protokol

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track B — Overlay + Koordinatör

- **Faz:** P0 ✅ (30.10 16:15) → P1 başlıyor
- **Bitenler:**
  - Faz planı: `plan/phases/B-P0.md`. Track dosyasına Faz 5 (herkese açık yayın) ve Faz 6 (izinsizlik + ölçek kanıtı) eklendi.
  - `packages/overlay/`: kit overlay'inin kopyası, `tm_agentcoop` / `ls_agentcoop`, tablolar `agentcoop_token_outputs` / `agentcoop_tokens`. `npm run overlay` → :8080 (Arcade header'ları). Bağımsız paket (`@agentcoop/overlay`, AGENTS.md sürümleri sabit, Node 22: `nvm use 22`).
  - Doğrulama testi 1 ✅ ve 8 ✅ (yukarıdaki tablo). `npm test` 8/8 yeşil (`packages/overlay/test/validation1.mixed-settlement.test.ts`).
  - `packages/overlay/README.md`.
- **Devam eden:** B.P1 planı (`plan/phases/B-P1.md`).
- **Bilinen sorunlar:** `src/kit/{inscription,rules,addresses}.ts` ve `test/helpers/mockchain.ts` A.P0 gelene kadar geçici kopya. `test/helpers/settlement.ts` yalnızca test için bir settlement kurucu (A'nın builder'ı değil). Typecheck kit gibi `test/`'i kapsamıyor.
- **Diğer track'lerin benden beklediği:**
  - **A:** Test 1 sonucu: kit kuralları karışık settlement'ı **değiştirilmeden** kabul ediyor, `rules.ts` genişletmesi gerekmiyor. Settlement'ı overlay'e `X-Topics: ["tm_agentcoop"]` ile submit et (kit `tm_tokenkit`'i yerine). Sağlayıcının SINGLE\|ACP imzası yeniden planlamada geçerli kalıyor (test 1b). `test/helpers/settlement.ts`, A'nın `planSettlement`/`signSettlementInput`'ına referans olarak kullanılabilir.
  - **A/C/D:** Overlay URL'si yerelde `http://localhost:8080`, lookup servisi `ls_agentcoop`. Kredi token deploy'u ve transferleri de bu topic'e gider.

## Track C — Sağlayıcı + Ajanlar

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Diğer track'lerin benden beklediği:**

## Track D — Vault + Ops + Rail + Teslim

- **Faz:** P0 başlamadı
- **Bitenler:**
- **Devam eden:**
- **Bilinen sorunlar:**
- **Cüzdan/fon durumu:** sats talebi: ☐ gönderildi ☐ geldi (miktar: ) · fonlanan cüzdanlar:
- **Axel soruları:** ☐ gönderildi · cevaplar:
