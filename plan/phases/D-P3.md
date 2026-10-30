# D-P3 — Coop Rail PoC: USDC (Base) → BSV atomik swap (ayrıntılı plan)

> Track D · Faz 3 · **zaman kutusu 4 saat** (başlangıç 2026-10-30 19:05, bitiş 23:05) · hedef senkron **S3**
> Üst plan: `plan/track-D-vault-ops-rail.md` Faz 3 · Fikir: `FINAL-IDEA.md §4.10, §8, §12` · Arayüz: `00-MASTER-PLAN.md §3.2, §3.4 (htlcLockingScript), §3.7 (kind:'rail'), §3.9, §3.10 (maker)` · Önceki: `plan/phases/D-P2.md`

---

## 1. Amaç ve "bitti" tanımı

USDC'nin (Base) BSV'ye atomik olarak döndüğünü **bir kez uçtan uca** göstermek. BSV ajanın **vault'una** iner: claim dalı ajan + guard 2-of-2 olduğu için Rail'den gelen para vault politikasını atlayamaz. Canlı demoda yok. Zaman kutusu dolunca ne varsa `docs/RAIL-POC.md`'ye yazılır.

**Kabul** (track dosyası): `docs/RAIL-POC.md` var ve sonunda açık bir **"Sonuç: başarılı / başarısız"** satırı taşıyor; doğrulama testleri 4 ve 6'nın sonuçları STATUS'ta; zaman kutusu aşılmadı.

**Bu oturumda ulaşılabilecek kanıt** (sats yok, Base Sepolia ETH/USDC yok, Foundry yok):
- Kontrat: `contracts/base-htlc/HTLC.sol` + `MockUSDC.sol`, `solc` 0.8.37 ile derlenir, bellek içi EVM'de (`@ethereumjs/evm`) test edilir: lock → claim (secret ile), yanlış secret, süre dolmadan iade reddi, süre sonrası iade, çift claim.
- BSV tarafı mockchain'de (MockServices her script'i doğrular): maker v1 funding (yayınlanmadan txid belli) → ajan ön-imzalı iadeyi imzalar → maker yayınlar → ajan + guard (`kind:'rail'`) secret ile claim eder, çıktı **vault**'a → maker secret'ı BSV tx'inden okur → EVM'de USDC'yi alır. Ayrıca iade dalı ve guard redleri.
- Ağa bağlı adımlar **hazır ama koşulmamış**: Base Sepolia deploy (`npm run deploy -w @agentcoop/maker`), doğrulama testi 4 (`scripts/validation4.ts`, ≤ 1.000 sat).

Sonuç satırı bu yüzden "**kısmen başarılı (offline)**" olabilir; Faz 5'in A mı B mi olacağını mainnet/testnet adımları belirler (§11).

---

## 2. İnsan adımları

| # | Adım | Kim | Not |
|---|---|---|---|
| H1 | SETUP-ACCOUNTS #9: iki EVM adresi (maker, agent). Anahtarlar **yalnızca `.env`** (`BASE_PRIVATE_KEY` = maker, `BASE_AGENT_PRIVATE_KEY` = ajan) ve kasa | insan | Sohbete/commit'e asla |
| H2 | #10–11: Base Sepolia ETH (iki adrese) + test USDC (ajana; Circle faucet). USDC yoksa deploy betiği MockUSDC basar | insan | |
| H3 | Treasury laptopunda (Node 24) `npm run deploy -w @agentcoop/maker` → `BASE_HTLC_ADDRESS` `.env`'e | insan veya Remote Control'le D | Sepolia gas birkaç sent |
| H4 | `maker` cüzdanına 30k sat (F4) ve doğrulama 4 (`npm run validation4 -w @agentcoop/scripts`, ≤ 1.000 sat) | insan + D | Sats gelince |
| H5 | Testnet swap: `npm run swap-demo -w @agentcoop/maker -- --live` (≤ 1 USDC, ≤ 1.000 sat) | D | H1–H4 sonrası |

---

## 3. Bağımlılıklar (19:05)

| Bağımlılık | Durum | Etki |
|---|---|---|
| A.P0 `InputSigner`, `htlcLockingScript` | ✅ (A yazdı; gövde FINAL-IDEA §4.10 ile birebir) | Gövde D'de; imza değişmez |
| Base Sepolia RPC | ✅ `https://sepolia.base.org` erişilebilir | Deploy/okuma hazır |
| Base Sepolia ETH/USDC, EVM anahtarları | ✗ | Testnet adımları bekler; testler bellek içi EVM'de |
| `maker` sats, mainnet | ✗ | Doğrulama 4/6 ve mainnet funding bekler |
| Foundry | ✗ (konteynerde yok) | `solc` (npm) + `@ethereumjs/evm` ile; Foundry gerekmez |
| C.P3 vault'lu ajan | ✗ | Rail "ajanı" testte kütüphane çağrıları |

---

## 4. Tasarım kararları

1. **EVM kontratı (`AgentCoopHTLC`):** `lock(receiver, token, amount, hashlock, timeout) → id`, `claim(id, secret)`, `refund(id)`. `hashlock = sha256(secret)` (BSV'nin `OP_SHA256`'sı ile aynı; keccak değil). `id = keccak256(sender, receiver, token, amount, hashlock, timeout)`; aynı kilit iki kez açılamaz. `claim` herkes çağırabilir, para hep `receiver`'a gider ve `secret` olayla açığa çıkar; `refund` yalnızca `timeout`'tan sonra, para hep `sender`'a. Durumlar: `1 locked, 2 claimed, 3 refunded`. ERC-20 `transferFrom`/`transfer` dönüş değeri kontrol edilir.
2. **BSV script'i** A'nın iskeletiyle aynı: `OP_IF OP_SHA256 <h> OP_EQUALVERIFY OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`. Unlock: claim `OP_0 <sigA> <sigG> <secret> OP_1` (≤ **183**), iade `OP_0 <sigM> <sigA> OP_0` (≤ **150**). Sighash ALL|FORKID, subscript = tüm script (`vaultSighash` genel: kaynak script'i alıyor).
3. **Anahtarlar türev, asla identity:** `[1,'agentcoop rail']`, keyID = `swapId` (16 bayt hex), counterparty `'anyone'` — vault'la aynı desen: herkes üç identity'den script'i yeniden kurar, guard kendi anahtarını `swapId`'den türetir.
4. **Ön-imzalı iade, nLockTime ile:** iade tx'i `version 1`, `lockTime = H + k` (blok yüksekliği; `< 500 000 000`), girdi `sequence = 0xfffffffe` (aksi halde nLockTime uygulanmaz). Ajan iadeyi funding yayınlanmadan imzalar; maker funding'i ancak bundan sonra yayınlar. Funding de `version 1` (Chronicle malleability muafiyeti yalnızca v > 1; doğrulama 6). Funding txid'i yayından önce belli: wallet-toolbox `createAction({ options: { noSend: true } })` + sonra `sendWith`.
5. **Guard `kind:'rail'`:** girdi bir HTLC script'i; `guardPub = derive(guard, swapId)` ve `agentPub = derive(agent, swapId)`; tx final; **HTLC'nin tamamı (ücret hariç) isteği yapan ajanın kayıtlı vault script'ine** gider (FINAL-IDEA §4.10 "çıktı vault script'i veya pledge coin"; pledge coin da vault script'inde); bilinmeyen çıktı ≤ ajanın kendi girdileri (G9 benzeri); ücret ≤ `maxFeeSats`. Vault'a **giriş** olduğu için haftalık tavana sayılmaz; ledger'a yazılmaz, karar günlüğüne ve olay akışına yazılır. Guard secret'ı görmez; script zaten zorlar.
6. **Zaman pencereleri:** BSV `k = 6` blok (≈ 1 sa), Base `T_base = şimdi + 6 sa` (kötü senaryoda maker'ın BSV'yi geri alması + USDC claim payı). Ajan claim'i yalnızca `yükseklik < H + k − 2` iken dener (güvenlik payı).
7. **Maker (`apps/maker`):** kütüphane (`quote`, `verifyBaseLock`, `fundHtlc`, `signRefund`/`agentSignRefund`, `extractSecret`, `claimBase`) + ince HTTP (`GET /quote`, `GET /events` SSE `CoopEvent`, Track E için). Fiyat: `RAIL_SATS_PER_USDC` (env, sabit) + spread 150 bps. EVM erişimi `EvmPort` arayüzüyle soyut: testte bellek içi EVM, canlıda viem (Base Sepolia).
8. **Tutar sınırları (PoC):** ≤ 1 USDC, ≤ 1.000 sat/swap; `--live` olmadan hiçbir ağ çağrısı yok.

---

## 5. Dosyalar

| Dosya | Ne yapar |
|---|---|
| `contracts/base-htlc/HTLC.sol`, `MockUSDC.sol` | Kontratlar (MIT) |
| `contracts/base-htlc/artifacts.json` | `solc` 0.8.37 çıktısı (abi + bytecode); test taze derlemeyle karşılaştırır |
| `apps/maker/package.json` | `@agentcoop/maker`: `solc`, `@ethereumjs/evm`, `viem` (sabit sürümler) |
| `apps/maker/src/compile.ts` | `npm run compile` → artifacts.json |
| `apps/maker/src/evm.ts` | `EvmPort`; `MemoryEvm` (`@ethereumjs/evm`, zaman kontrollü); `ViemEvm` (Base Sepolia) |
| `apps/maker/src/rail.ts` | Swap adımları (maker + ajan tarafı kütüphane) |
| `apps/maker/src/server.ts`, `main.ts` | `GET /quote`, `GET /events`, `/healthz` |
| `apps/maker/src/deploy.ts` | Base Sepolia deploy (koşulmadı) |
| `packages/core/src/scripts/htlc.ts` | (D gövdesi) `RAIL_PROTOCOL`, `deriveRailPub`, `railScriptFor`, `parseHtlcLockingScript`, unlock'lar ve uzunluklar |
| `apps/guard/src/rail.ts` | `evaluateRail` (§4.5) |
| `apps/maker/test/htlc.evm.test.ts`, `test/e2e.rail.mockchain.test.ts` | §9 |
| `scripts/validation4.ts` | Doğrulama 4 (mainnet, hazır; `npm run validation4 -w @agentcoop/scripts`) |
| `apps/maker/test/server.test.ts` | `/quote` ve olay akışı |
| `docs/RAIL-POC.md` | Sonuç |

---

## 6. Arayüz eki (MASTER)

- §3.2: Rail anahtarları `[1,'agentcoop rail']`, keyID = swapId, `'anyone'`; unlock uzunlukları claim 183 / iade 150.
- §3.7: `/cosign` `kind:'rail'` → `{ txBEEF, inputIndex, agent, agentSignatureHex, context: { kind:'rail', swapId } }`.
- §3.9: `BASE_AGENT_PRIVATE_KEY`, `BASE_HTLC_ADDRESS`, `MAKER_URL`, `RAIL_SATS_PER_USDC`.
- §3.10: maker `GET /quote?dir=usdc-bsv&amount=`, `GET /events` (`rail_quote`, `rail_locked_base`, `rail_funded_bsv`, `rail_claimed`, `rail_refunded`).

---

## 7. Guard `rail` kontrolleri

| # | Kontrol | `reason` | Kapattığı tehdit (§8) |
|---|---|---|---|
| R1 | G1 (kaynaklar, txid bağı) | aynı | Tutar yalanı |
| R2 | Girdi HTLC şablonunda; `guardPub` = guard'ın `swapId` anahtarı; `agentPub` = isteyen ajanın `swapId` anahtarı; tx'te tek HTLC girdisi | `not a rail HTLC for this guard`, `agent mismatch` | Guard'ı başka script'ler için imza kâhini yapmak |
| R3 | G4 final, G5 ajan imzası guard'ın sighash'inde | aynı | Kör imza; ileri tarihli harcama |
| R4 | Ajanın kayıtlı vault'u ve politikası var | `no vault for this agent`, `no policy` | Rail parasının vault dışına inmesi |
| R5 | HTLC tutarı − ücret kadarı ajanın vault script'ine; bilinmeyen ≤ ajanın kendi girdileri; OP_RETURN 0 sat | `rail funds must land in the vault` , `vault funds to unlisted output` | **"Coop Rail claim'i vault politikasını atlıyor"** |
| R6 | Ücret ≤ `maxFeeSats` | `maxFeeSats exceeded` | Ücretle boşaltma |

---

## 8. Akış

```
ajan: s ← 32 rastgele bayt, h = sha256(s), swapId ← 16 bayt
1 Base   ajan: approve + HTLC.lock(maker, USDC, amt, h, now + 6 sa)              → id
2 BSV    maker: verifyBaseLock(id) (tutar, alıcı, h, süre) → funding v1 (noSend):
              out0 HTLC(h, agent@swapId, guard@swapId, maker@swapId) = sats
3 BSV    maker: refund v1, nLockTime H+6, seq 0xfffffffe → ajan imzalar (iadeyi doğrular) → maker imzalar, saklar
4 BSV    maker: funding'i yayınlar (sendWith)
5 BSV    ajan: claim tx (OP_0 sigA sigG s OP_1) → vault script; guard kind:'rail' → yayın; s açığa çıkar
6 Base   maker: extractSecret(claim tx) → HTLC.claim(id, s) → USDC maker'a
Aksilik: ajan claim etmezse maker H+6'dan sonra iadeyi yayınlar; maker funding'i yayınlamazsa ajan T_base sonra HTLC.refund
```

---

## 9. Test senaryoları

**9.1 EVM (`apps/maker/test/htlc.evm.test.ts`, bellek içi EVM):** artifacts.json = taze derleme; mint + approve + lock → bakiye kontratta; yanlış secret → revert; doğru secret → maker'a, olayda secret; ikinci claim revert; süre dolmadan refund revert; ikinci kilitte süre sonrası refund → gönderene; süresi geçmiş claim revert.

**9.2 Uçtan uca (`test/e2e.rail.mockchain.test.ts`):** mockchain (maker, ajan, guard, sahip cüzdanları) + bellek içi EVM + guard HTTP. Mutlu yol 1–6, ajanın vault'u + 1 UTXO, maker USDC aldı. İade yolu: ikinci swap, ajan claim etmez → maker'ın ön-imzalı iadesi script düzeyinde geçerli (`lockTime`, `sequence` doğru; mockchain nLockTime'ı uygulamıyor, mainnet doğrulama 4). Guard redleri: çıktı vault değil → `rail funds must land in the vault`; başka ajanın swap'ı → `agent mismatch`. Ajan iadeyi imzalamadan önce kontrol eder: yanlış outpoint/kısa lockTime → reddeder.

---

## 10. Uygulama sırası (zaman kutusu içinde)

1. (30 dk) Kontrat + derleme + EVM testleri.
2. (60 dk) `htlc.ts` yardımcıları, `rail.ts` (maker/ajan), guard `rail`.
3. (60 dk) Uçtan uca mockchain + EVM testi.
4. (30 dk) maker HTTP (`/quote`, `/events`), deploy betiği, `validation4.ts`.
5. (30 dk) `docs/RAIL-POC.md`, MASTER, STATUS, Checkpoint, push.

---

## 11. Checkpoint (2026-10-30 19:55; zaman kutusunun ~1 saati kullanıldı)

| Soru | Cevap |
|---|---|
| **Plan hâlâ iyi mi?** | Evet, fakat FINAL-IDEA §4.10'un iki varsayımı **hâlâ doğrulanmadı**: nLockTime'ın yükseklik semantiği (doğrulama 4) ve v1 tx'in malleability'den korunması (doğrulama 6). Offline'da çürüyen bir şey çıkmadı: v1 funding `noSend` ile yayından önce sabit txid veriyor, ön-imzalı iade ELSE dalında doğrulanıyor, claim secret'ı açığa çıkarıyor ve maker bununla Base'de claim ediyor. Testler 4/6 başarısız çıkarsa §4.10 ve §8 güncellenir (Rail "trustless değil" ya da "kapsam dışı"). Foundry yerine `solc` + `@ethereumjs/evm` kullanıldı (STATUS Plan değişiklikleri) |
| **Bitti mi?** | Kabulün offline kısmı ✓: `docs/RAIL-POC.md` var, **Sonuç: kısmen başarılı (offline)**; zaman kutusu aşılmadı. Testler: `apps/maker/test/*` (EVM + HTTP), `test/e2e.rail.mockchain.test.ts` (uçtan uca swap, iade yolu, redler); kök `npm test` 34 dosya / 197 test yeşil, typecheck temiz. **Açık:** doğrulama 4 (betik hazır) ve 6 (plan yazıldı) mainnet sats; Base Sepolia deploy (betik hazır, dry-run Sepolia'ya bağlandı) ETH; canlı swap ikisini de ister |
| **Diğer track'ler?** (19:50) | **S3 tamamlanmadı.** A: P2 ✓, P3 (vault pledge yolu) başlamadı (`buildPledge('vault')` hâlâ `NOT_IMPLEMENTED`; `pledgeFromVault` hazır). B: P6a ✓ (denetim + metrikler), kalanlar S3 sonrası. C: P2 ✓ mockchain (ajanlar tahmin, pledge, imza), P3 (vault'lu ajan) sırada. E: P0 başladı; liman sahnesi için maker `GET /quote`/`/events` hazır. README bölümleri: S3'e yaklaşırken her track'ten istenecek (Faz 4) |
| **Sonraki faz bağımlılıkları** | Genişletme fazları (5, 6, 7) **S3 olmadan başlamaz**. Faz 5'in A/B seçimi Rail'in canlı adımlarına bağlı: fon gelirse kalan zaman kutusu (≈ 3 sa) doğrulama 4/6 + Sepolia swap'a; gelmezse Faz 5 B yolu. S3 beklenirken: D'nin S3 maddeleri (vault'lu settlement'ın mainnet koşusu A.P3 + C.P3 ile) ve Faz 4'ün bağımsız kısımları (README iskeleti, threat model, value note taslağı) |
| **Arayüz değişikliği?** | MASTER §3.2 (rail anahtarları), §3.7 (`kind:'rail'`), §3.9 (Rail değişkenleri), §3.10 (maker uçları ✅). STATUS "Arayüz değişiklikleri" 19:55 |

## 12. Ek: canlı swap betiği (30.10 ~21:50; görev a.5, kullanıcı kararı)

Mainnet/Base Sepolia için tek komut, fon gelince koşulur:
- `apps/maker/src/swap.ts` `runSwap(parties, { amount, satsPerUsdc, onStep })`: e2e'deki 6 adım sırayla, her adım `onStep` ile bildirilir; PoC tavanları (≤ 1 USDC, ≤ 1.000 sat) para hareketinden önce. Aynı kod `MemoryEvm` + mockchain ve `ViemEvm` + sunucu cüzdanlarıyla çalışır.
- `apps/maker/src/swap-demo.ts` (`npm run swap-demo -w @agentcoop/maker -- --vault <vaultId> [--amount 0.5] [--yes]`): varsayılan **dry run**: `.env` değişkenleri, iki EVM adresinin ETH/USDC bakiyesi, `maker` ve ajanın BSV bakiyesi, guard `/healthz`, guard'da vault'un bu ajana ve bu guard'a ait olduğu, Arcade yüksekliği, teklif. `--yes` olmadan hiçbir şey göndermez. `--yes` ile adımları linkleriyle basar, **ön-imzalı iadeyi funding gönderilmeden önce** `data/rail/<swapId>.json`'a (600) yazar, sonunda STATUS "Mainnet işlemleri" satırlarını basar. Anahtarlar yalnız `.env`'den, ekrana basılmaz.
- Test: `apps/maker/test/swap.mockchain.test.ts` 3/3 (adım sırası, 0,4 USDC → 788 sat vault'ta, maker USDC'yi aldı; `refund_ready`'deki iade HTLC'yi maker'a geri harcıyor; tavan aşımında hiçbir şey hareket etmiyor). Bu konteynerde `.env` yok: dry run eksikleri listeledi ve durdu.
