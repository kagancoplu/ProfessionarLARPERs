# Track C — devir notu (31.10 01:00)

Track C'nin planı (Faz 0–4) mockchain'de bitti ve `main`'de. Kalan işler hesapların olduğu **ana laptoptan** yapılacak. Bu dosya o oturum için yapılacakların listesidir. Her madde bitince STATUS'ta işaretleyin; txid'leri STATUS "Mainnet işlemleri" tablosuna yazın.

Ortam: Node ≥ 22, kurulum `npx npm@11 install` (npm 10 bu workspace'te kırılıyor). Betikler `tsx --import @agentcoop/core/register-sdk` ile çalışır (kök `package.json` script'leri bunu zaten yapıyor).

## 1. Mainnet kabulü (runbook adım 9–15)

Önkoşul: servisler ayakta (`node infra/run.mjs`, `npm run guard -w @agentcoop/guard`). T1 (mint) ve T2 (havuz `53a240f5…3ca6_0`) ve T7 (402 ×4) zaten zincirde.

### 1.1 Ajanların neden pledge etmediğini kapatın (önce bu)
1. `git pull`. provider-api açılıştan önce çalışıyorsa **bir kez** yeniden başlatın: `DATA_DIR=$PWD/data npm run provider`. Bundan sonra yeni bir `mint`'in tokenId'si 5 sn içinde kendiliğinden alınır (`refreshTokenIds`).
2. `curl -s localhost:8092/v1/catalog | jq '.products[] | {id, tokenId}'` → `gpu-h100`'ün `tokenId`'si `0ae50b8b…437d_0` olmalı, `null` değil.
3. `npm run agents`, sonra `tail -f data/agents/*/activity.log`. Karar veremeyen her havuz kontrolü bir kez **"Pool check: …"** satırı yazar:
   - `not on the coordinator's WS …` → `COOP_API_URL` / koordinatör WS'i;
   - `the provider's catalog has no credit token …` → adım 1;
   - `no pools at the coordinator` → koordinatörde havuz yok;
   - `no pool to decide on: <poolId>… <durum>, no offer / other token / decided` → havuz neden elendi;
   - havuz kontrolü geçtiyse karar (`pledge` ya da `skip` ve nedeni, ör. fiyat) `decisions.log`'a yazılır.
4. **Havuz fiyatı:** `--price` havuzun **tamamının** fiyatıdır. T2 kredi başına 1000 sat ile açıldıysa (`GET /pools/<id>` → `terms.priceSats` = 40000) kural beyni bilinçli olarak SKIP der (perakende 50 sat/kredi, havuz en az %10 ucuz olmalı). O zaman:
   ```sh
   npm run provider-cli -- cancel-pool 53a240f5c44123211c3befa737f7ce1cae356c15bd72256279e47f5e43d93ca6_0
   npm run provider-cli -- open-pool --credits 40 --price 1000 --deadline +144 --fee 100 --min 5 --label "8×H100 · 1 week"
   ```
   İnsan da katılacaksa havuzu onun kredisi kadar büyütün (ör. 12 kredi → `--credits 52 --price 1300`). Havuz yalnız tam dolunca settle olur; ajanların 7 günlük ihtiyacı 17 + 11 + 12 = 40.

### 1.2 Yapılacak mainnet işlemleri

| # | Tip | Kim / nerede | Komut | Kabul |
|---|---|---|---|---|
| a | T3 | ajanlar (repo makinesi) | `npm run agents` açık kalsın | her ajanın `decisions.log`'unda `pledge`; `GET /pools/<id>` → `pledgedCredits` |
| b | T3 | insan (`desktop-human`, BSV Desktop) | `npm run participant-cli -- pledge <poolId> 12`, sonra `npm run participant-cli -- sign` açık kalsın | Desktop onayı 60 sn'lik tura yetişiyor mu? Yetişmiyorsa not düşün (B ile insan için daha uzun tur) |
| c | T5 | koordinatör (otomatik) | havuz dolunca | `GET /pools/<id>/audit` → `consistent`; `GET /metrics` → `custodiedSats: 0`; ajanların `activity.log`'unda `settled` |
| d | gelir | sağlayıcı Desktop | `npm run provider-cli -- sync-revenue`, sonra `sweep-revenue` | sağlayıcının Desktop bakiyesinde havuz bedeli |
| e | T6 | ajan | `npm run agent -- eval --jobs 3` | `/v1/credits/redeem` txid'si; iş kredilerden düşer (402 = 0 sat) |
| f | T8 | ajanlar | settle sonrası artan kredisi olan ajan 5'lik lot listeler, eksiği olan süpürür (kendiliğinden, `npm run agents` açıkken) | `GET /listings` önce dolu, sonra boş; sweep txid'si |
| g | T10 | vault'lu ajan | D'nin vault'u hazırsa (`create-vault` → `policy` → `fund` → `adopt`; runbook 13): `.env`'e `FINETUNE_VAULT_ID=<vaultId>`, `GUARD_URL=http://localhost:8091`; yeni bir havuzla 1.1/a–c'yi tekrarlayın | `activity.log`: "in my owner's vault (the guard approved it)"; guard `/decisions`'ta `approved` |
| h | injection | vault'lu ajan | `npm run demo:injection` mockchain'de; mainnet'te guard `/decisions`'taki `denied` kaydı yeterli | guard 403, vault bakiyesi aynı |

Her txid için STATUS satırı: `| <tarih> | <T> | [txid](https://whatsonchain.com/tx/<txid>) | C | <ne olduğu> |`.

## 2. Diğer track'lerin istediği kod işleri (A-P5 eklemeleri)

Hiçbiri mainnet'i engellemiyor; bayrak kapalıyken eski akış aynı çalışıyor. Önerilen sıra 2.1 → 2.2 → 2.3 → 2.4. Her biri mockchain testiyle gelsin (`test/` altında, `startMockStack` yardımcısı `apps/agents/src/demo/harness.ts`).

### 2.1 Vault'tan redeem edilen kredinin iadesi vault'a dönsün (güvenlik; D → C, 30.10 22:45)
- **Sorun:** `apps/provider-api/src/redeem.ts` `returnCredits` krediyi her zaman çağıranın P2PKH'ına yolluyor (`kit.send(…, caller)`). Vault'tan redeem edilmiş kredi böylece ajanın anahtarına geçer ve guard'ın politikası atlatılır (redeem başına ≤ 20 kredi).
- **Yapılacak:** redeem sırasında kredinin vault'tan geldiğini (girdi `buildVaultCreditScript` biçimli, `vaultKeysOfScript`) ledger'a kaydedin (`credits.ts`, bakiye kaynağına göre ayrı). İade o bakiyeden yapılıyorsa çıktı `buildVaultCreditScript(insc, vaultScript)` olsun, P2PKH değil.
- **Kabul:** vault'tan redeem → return → kredi aynı vault script'inde. P2PKH'tan redeem edilen kredi eskisi gibi P2PKH'a döner.

### 2.2 Vault'lu ajanın kredisi vault'a kilitli gelsin (A → C, 30.10 21:30 ve 20:45)
- **Şu an:** `apps/agents/src/participant.ts:172` `pledgeFromVault` kredi çıktısını ajanın P2PKH'ına planlatıyor. Bu, FINAL-IDEA §8'deki son non-custodial açık.
- **Yapılacak:** `pledgeFromVault(…, { …, creditLock: 'vault' })` (ya da `buildPledge(…, 'vault', …, { vault: { …, creditLock: 'vault' } })`). Settlement'ta `internalizeVaultSettlement` yerine `internalizeVaultCredits` (`packages/core/src/vault/creditSpend.ts`). Ajanın kredi sayımı `ownedCredits()` için `listVaultCredits` (basket `VAULT_CREDITS_BASKET`).
- **Redeem:** vault kredisini sağlayıcıya `transferVaultCredits` (guard `/cosign kind:'redeem'`, `creditPayees`) ile gönderin; provider-api'nin redeem'i bu tx'i kabul etmeli (gönderen kontrolü = vault'un ajan anahtarı). Bu, 2.1 ile birlikte test edilir.
- **Kabul:** `test/agents.vault.mockchain.test.ts`'e: settle sonrası kredi `ownerVaultHash` ile overlay'de (`{ op:'vaultCredits', vaultHash }`), ajanın P2PKH'ında 0. Örnek: `test/e2e.vault-credits.mockchain.test.ts`, `test/vault-credits.spend.mockchain.test.ts`.

### 2.3 Vault'lu ajanın artan kredisini satışa çıkarma (A → C, 31.10 00:50)
- **Yapılacak:** `apps/agents/src/market.ts` `considerListing`, ajan vault modundaysa `signListing` yerine `signVaultCreditListing` (guard `kind:'list'`, SINGLE\|ACP; ödeme vault script'ine). Sonra her zamanki `POST {COOP_API_URL}/listings`. Guard politikasında `minAskSatsPerCredit` yoksa liste kapalıdır; bu durumda ajan `activity.log`'a nedenini yazsın ve listelemesin.
- **Kabul:** vault'lu ajan listeler, başka ajan `buildSweep` ile alır, sat vault'a gelir.

### 2.4 participant-cli: "imzala ve çık" (lighthouse; A → C 30.10 22:30, B → C 31.10 00:40)
- **Yapılacak:** `apps/participant-cli/src/cli.ts`'e `pledge <poolId> <credits> --lighthouse --guard <guardIdentity>` ekleyin: `buildLighthousePledge` (`packages/core/src/pool/lighthouse.ts`) → `POST {COOP_API_URL}/pledges/lighthouse`. Gövde `LighthousePledge`; tx overlay'de değilse `beef` ekleyin. Overlay'e submit'i koordinatör yapar. Guard kimliği `GET {GUARD_URL}/healthz`'ten. Geri çekme: `cancel` lighthouse kaydını tanıyıp `cancelLighthousePledge` → overlay submit.
- **Kabul:** insan pledge edip çıkar; turda imzayı guard verir; havuz settle olur. Örnek: `apps/coordinator/test/e2e.lighthouse.mockchain.test.ts`. README'de "imzala ve çık" bölümü.

## 3. Bitince
1. `npm run typecheck`, `npm test` (ölçek testleri hariç; ~15–30 dk).
2. STATUS Track C bölümünde Faz satırı + "Diğer track'lerin benden beklediği" güncellemesi; isteyen track'lerin satırlarına ✅.
3. Kök README "Mainnet run" tablosuna Track C txid'leri (D'nin bölümü).
