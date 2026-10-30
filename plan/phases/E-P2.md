# E-P2 — Katılımcı ve sağlayıcı akışları (Desktop ile gerçek işlemler)

> Track E Faz 2 (`plan/track-E-frontend.md` §8 Faz 2). Yazan: E, 2026-10-30 20:10 CET. Zaman kutusu 4 saat. Dal `main`. Önceki: `E-P1.md` (✅ `76fc8da`).

## 0. Amaç
Bir insan tarayıcıdan BSV Desktop ile havuza katılsın (T3), imza turunu tek tıkla tamamlasın (T5'e katılım), kredisini alıp (settlement) redeem edip (T6) iş çalıştırsın (T7, 402); sağlayıcı kredi basıp (T1) havuz açsın (T2), iptal etsin, gelirini toplasın. **B2 şartı** ("user-facing flows via BSV wallets") burada kapanır. Mock'ta aynı akışlar sahte Desktop'la uçtan uca.

## 1. Bağımlılıklar (20:10)
| | Durum | P2'de |
|---|---|---|
| A core | `main`: `buildPledge/cancelPledge/verifySettlementPlan/signSettlementInput/internalizeSettlement/P2pkhWalletSigner/TokenKit/buildReserveAndAnnounce/signOffer/publishOffer/cancelPool/receivePkh` | `wallet/flows/live.ts` sarar |
| B koordinatör | **`hello` artık kanıt istiyor** (`challenge { nonce }` → `hello { identity, poolIds, sig }`, `sig` = `createSignature` over `"agentcoop hello\n<host>\n<nonce>"`, `[1,'agentcoop hello']`, keyID `'1'`, `'anyone'`); `GET /pools?pledges=1`; `GET /offers/:poolId` | adaptör `challenge`'ı işler; host = proxy'de `location.host` (Vite `changeOrigin:false`), yayında coop URL'sinin host'u |
| C provider-api | BRC-105; **CORS yok** → yerelde Vite proxy; `AuthFetch` tarayıcıda (BRC-103 başlıkları proxy'den geçer) | `redeem { beef, outputIndex }`, `POST /v1/jobs`, `/v1/credits/balance`, `/v1/credits/return`, `/v1/catalog` |
| D guard | `main`'de | P3 |
| İnsan | Desktop (mainnet) + sats | mainnet kabulü (T3, T5 katılımı, T6, T7; T1, T2) |

## 2. Tasarım
- **Tek arayüz, iki uygulama:** `wallet/flows/types.ts` `FlowsApi`; `flows/live.ts` (gerçek cüzdan + core + AuthFetch), `flows/mock.ts` (sahte Desktop onayı + mock dünyası + olaylar). UI yalnızca `useFlows()` görür. Mock'ta `mock_` txid'ler, zincir yok.
- **Adım kaydı:** her akış `flow_step { flow, step, status, ms, detail, txid }` olayları yayınlar → "Under the hood" paneli (insan dili + protokol etiketi + ms + link).
- **Benim pledge'lerim** (`wallet/mine.ts`, zustand, localStorage `agentcoop.mine.<identity>`): `{ poolId, outpoint, credits, tokenIndex, instructions, status, plan?, settledTxid? }`. Canlıda Desktop basket'inden (`agentcoop`, customInstructions) de kurtarılır.
- **İmza merkezi:** `sign_request` (koordinatör, kanıtlı hello) → bildirim + geri sayım kartı → "Review & sign" → `reviewSignRequest` (`verifySettlementPlan` + `verifyLineage` → kontrol listesi: kredim, para üstüm, Σ = N, hash, soy) → "Sign" → `signSettlementInput` (SIGHASH_ALL, Desktop `createSignature`) → `sign_response`; "Reject" → `sign_reject { reason }`. `settled` → `internalizeSettlement` + `TokenKit.sync()`.
- **Katılımcı ekranı `/me`:** pledge formu (Pools'tan "Join" da buraya açılır), pledge'lerim, imza merkezi, kredilerim (TokenKit overlay/basket), redeem (≤ `maxRedeem`), iş çalıştır (kind, minutes; fiyat önizlemesi: ön ödemeli dakika yeterse 0, değilse 402 sat), iş kartı (log), iade.
- **Sağlayıcı `/provider`:** mint (sym, amt, dec → tokenId, "C'nin products/*.json'una yazın" notu), havuz aç (credits, price, deadline +blok, fee, min, label; sat/kredi + indirim `demo pricing`), havuzlarım, iptal, gelir (sync + sweep), kullanım (katalog).
- **Kasaba:** cüzdan bağlanınca "you" köylüsü (ziyaretçi); insan pledge'i → panoya yürür; mint → atölye tabelası; havuz açılınca pano.
- **Desktop onay noktaları:** pledge 1 (`createAction`), imza 1 (`createSignature`), cancel 1, redeem 1 (`TokenKit.send`), 402 iş 0–1 (`AuthFetch`), mint 1, open pool 2 (reserve+announce `createAction`, offer `createSignature`) + `publishOffer` 1, cancel pool 1, sweep 1. Her biri parşömende önceden yazılır.

## 3. Testler
Birim: `flows-mock.test.ts` (pledge → sign_request → sign → settled with me → credits → redeem → job → return; reddetme; cancel), `mine.test.ts` (kalıcılık), `hello.test.ts` (kanıt verisi biçimi). RTL: `participant.test.tsx` (Join → onay → "My pledges"), `provider.test.tsx` (mint → tokenId). e2e `participant.spec.ts` ve `provider.spec.ts` (mock Desktop onayları dahil).
**Mainnet kabulü (insan):** Desktop'lı üye ile T3 + T5 katılımı + T6 + T7; sağlayıcı T1 + T2. txid'ler STATUS "Mainnet işlemleri".

## 4. Riskler
| Risk | Plan |
|---|---|
| `hello` host uyuşmazlığı (proxy) | `changeOrigin:false` + `location.host`; yayında URL host'u; B'ye STATUS notu |
| AuthFetch tarayıcıda 402'yi ödeyemiyor (CORS/expose headers) | yerelde proxy; yayında C'den CORS (istek açık) |
| `verifyLineage` tarayıcıda Arcade'e gidiyor (CORS açık ✓), WoC yedeği 429 | önbellek + "lineage skipped" uyarısı yerine açık hata |
| Desktop onay sayısı fazla | parşömende önceden sayılır; A test 3 sonucu gelince birleştirme |

## 5. Checkpoint (Faz 2 sonu, 30.10 21:00)

**Kabul kanıtı (mock)**
- `wallet/flows/`: `types.ts` (`FlowsApi`), `live.ts` (BSV Desktop + core: `buildPledge`/`cancelPledge`/`verifySettlementPlan`+`verifyLineage`/`signSettlementInput`/`internalizeSettlement`/`TokenKit.sync`/`TokenKit.send`+`/v1/credits/redeem`/`AuthFetch` 402/`kit.deploy`/`buildReserveAndAnnounce`+`signOffer`+`POST /offers`+`publishOffer`/`cancelPool`/gelir `internalizeAction`+`signWalletP2pkhInput` sweep), `mock.ts` (aynı arayüz, sahte Desktop onayları, mock dünyası), `steps.ts` (`flow_step` olayları → "Under the hood"), `mine.ts` (pledge/havuz kayıtlarım, kimlik başına, localStorage + bellek yedeği), `hello.ts` (B-P5a kanıtı), `SignCenter.tsx` (geri sayım kartı → inceleme parşömeni: 5 kontrol → Sign/Reject).
- Koordinatör adaptörü `challenge { nonce }` alınca `hello { identity, poolIds, sig }` gönderiyor (`createSignature`, `[1,'agentcoop hello']`, keyID `'1'`, `'anyone'`); host = Vite proxy'de `location.host` (`changeOrigin:false`), yayında coop URL'sinin host'u.
- `/me` katılımcı sayfası (join → parşömen: coin/ücret/onay sayısı → Desktop → pledge'lerim → imza merkezi → kredilerim → redeem ≤ 20 → iş (0 sat ön ödemeli / 402) → iade), `/provider` (mint → tokenId notu, havuz aç: sat/kredi + indirim + onay sayısı, havuzlarım + iptal, gelir sync/sweep), "Under the hood" paneli her ikisinde. Kasaba: cüzdan bağlanınca "you" ziyaretçisi kapıda, insan pledge'i panoya yürüyor.
- Mock senaryosu insanı tanıyor: lock-in'de `sign_request` (plan Σ = N için son ajan payını yeniden boyutlandırır), settlement insanın imzasını 60 sn bekler, imzalarsa 4 katılımcılı settle (kredi gelir), reddederse/geç kalırsa "left-out" (coin yerinde).
- Testler: web vitest **18 dosya / 50 test** (flows-mock: pledge→sign→settle→redeem→job→return, withdraw/reject/left-out, provider mint→open→cancel; hello; mine), kök `npm test` içinde **44**; Playwright **4/4** (smoke, jüri, **katılımcı turu**, **sağlayıcı turu**); web + kök typecheck temiz; build ilk yük ≈ 1,4 MB (index 605 kB + sdk 830 kB). Anti-slop grep temiz; her girdi etiketli.

**Mainnet kabulü (insan, henüz yapılmadı):** Desktop'lı üye ile `PORT=5178 OVERLAY_URL=… npm run web` + `node infra/run.mjs` + `npm run provider` → `/provider` mint (T1) + open pool (T2); `/me` join (T3) → ajanlar (`npm run agents`) → imza turu (T5'e katılım) → redeem (T6) → 402 iş (T7). txid'ler STATUS "Mainnet işlemleri". **Canlı modda denenmeyenler:** `AuthFetch` tarayıcıdan provider-api'ye (CORS/proxy; C'den expose headers isteği açık), `verifyLineage` tarayıcıdan Arcade/WoC, `publishOffer`.

**Checkpoint soruları**
1. Plan hâlâ iyi mi? Evet. Desktop onay sayısı akışlarda parşömende yazılı (pledge 1, imza 1, redeem 1, 402 0–1, mint 1, open pool 2+1, sweep 1); A test 3 sonucu gelince birleştirme değerlendirilir.
2. Faz bitti (mock) → STATUS Track E.
3. Diğer track'ler: D guard `main`'de ✓ (P3'e hazır); A market builder'ları ✓; C ajan kararları canlıda akmıyor (SSE yok).
4. P3 bağımlılıkları: D.P1/P2 (`main`'de), B.P3 listings/vaults (var), C.P3 vault'lu ajan (yok → mock).
5. Arayüz: B'ye not — `hello` kanıtı uygulandı; proxy'de host `location.host` (STATUS).
