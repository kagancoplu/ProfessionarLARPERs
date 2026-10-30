# E-P3 — Sahip konsolu (vault + guard), ajanlar, market, Kasaba v2

> Track E Faz 3 (`plan/track-E-frontend.md` §8 Faz 3). Yazan: E, 2026-10-30 23:45 CET. Zaman kutusu 4 saat. Dal `main`. Önceki: `E-P2.md` (✅), ara faz `E-V1.md` (✅ görsel yeniden yapım).

## 0. Amaç
Sahip tarayıcıdan BSV Desktop ile ajanına bir vault açsın, fonlasın (T9), politikasını yazsın, guard'ın injection'ı reddettiğini bekçide ve "Denials"ta görsün, parayı tek başına geri çeksin (owner dalı). Market tezgâhları çalışsın: sat (2 onay), al/sweep (1 onay, soy doğrulaması ekranda), iptal. Ajanlar sayfası canlı karar akışını ve injection demosunu göstersin. Kasaba v2: bekçi, yabancı, kasa sandıkları, tezgâh satıcıları.

## 1. Bağımlılıklar (23:45)
| | Durum | P3'te |
|---|---|---|
| D guard | `main`: `PUT/GET /vaults/:id`, `PUT/GET /policies/:agent` (BRC-103 sahip), `GET /decisions`, `GET /events` SSE, CORS + `x-bsv-auth-*` expose; `apps/owner-cli/src/vault-ops.ts` node importsuz (`createVault/registerVault/putPolicy/fundVault/withdrawVault/ownerBasketUtxos`) | `flows/live.ts` sahip akışları bu kütüphaneyi sarar; `AuthFetch` guard'a |
| A core | `reserveListing/signListing/buildSweep/cancelListing(reclaimReserved)`, `VaultOwnerSigner`, vault script yardımcıları | market canlı akışları |
| B koordinatör | `POST /listings` (doğrular), `GET /listings?tokenId=` (en ucuz önce) | listeler buradan; overlay `listing_*` olayları zaten reducer'da |
| C ajanlar | `apps/agents` SSE `/events` + `GET /agents` henüz yok | mock senaryosu + mock "Inject now" tetikleyicisi |
| Guard `pause` (D Faz 5B) | yok | UI'da yok; politikayı `weeklyCapSats: 0` yaparak "durdur" önerisi notu |

## 2. Tasarım
- **FlowsApi eklemeleri** (`wallet/flows/types.ts`): sahip `createVault(agent) → MyVault` (vaultId, script, guard kaydı; `mine.vaults`'a kalıcı), `fundVault(vaultId, sats)` (1 onay `createAction`: out0 vault coin, out1 `OP_RETURN vault`), `putPolicy(agent, policy)` (BRC-103 `PUT`, Desktop onayı yok), `vaultStatus(vaultId)` (guard `GET /vaults/:id` + `/decisions`), `withdrawVault(vaultId)` (1 onay: `createAction signAndProcess:false` + `VaultOwnerSigner` + `signAction`); market `listCredits(credits, askSats)` (2 onay: `reserveListing` createAction, `signListing` createSignature → `POST /listings`), `cancelListing(outpoint)` (1), `sweep(outpoints[])` (1; `buildSweep verifyLineage:true`, parşömende toplam sat ve soy kontrolü), `listings()` (koordinatör).
- **Mock** (`flows/mock.ts`, `mock/state.ts`): aynı arayüz; vault oluşturma `world.vaults`'a `VaultView` + `vault_registered`; fonlama `vault_funded` (T9); politika `world.policies` + `policy_updated`; çekim `vault_spent by:'owner'`; liste `world.listings` + `listing_added`; sweep `listing_filled` + kredi bana; iptal `listing_cancelled`. `MockRuntime.injectNow(agent?)`: senaryodaki injection + 403 beat'ini anında çalar (ajanlar sayfası "Inject now (mock)" düğmesi, e2e için).
- **`/owner`:** cüzdan yoksa EmptyState; bağlıysa: (1) **Vault aç** (ajan seçimi: store ajanları, guard kimliği `GET /healthz`), (2) **Fonla** (sats, 1 onay), (3) **Politika** (allowProviders: havuz sağlayıcıları + katalog + elle; `maxPerPoolSats`, `weeklyCapSats`, `maxFeeSats`, `hotWalletDailySats`; "durdurmak için weekly 0" notu), (4) **Etkinlik**: kararlar (onay/ret, tür, havuz, sat, neden), **Denials** vurgulu, haftalık harcama vs tavan, (5) **Geri çek** (tam, 1 onay). Sağda "Under the hood" + "Köydeki vault'lar" (salt okunur: mock'ta finetune'ın vault'u ve injection reddi burada görünür).
- **`/agents`:** kart = profil, kimlik, mod, vault (bakiye + politika özeti + son ret), son düşünce, son 5 karar, işler, injected afişi; sağda canlı karar akışı (`feed` src agents/guard); mock'ta "Inject now" düğmesi; karta tıkla → drawer.
- **`/market`:** liste tablosu (kredi, istenen sat, sat/kredi vs perakende `demo pricing`, satıcı çipi, seç), **Buy selected** (toplam, "soy doğrulanır", 1 onay) → `sweep`; **Sell** (kredi ≤ bakiyem, ask sat; 2 onay) → listem tezgâhta; **Cancel** kendi listem. Boş durum: "Tezgâhlar boş".
- **Kasaba v2** (`town/`): **bekçi** (Kenmi NPC `bruno`, kapıda; `cosign_approved` → "✓ within policy" balonu; `cosign_denied` → "!" kırmızı balon, ajana yürür, ajan "Refused: …"); **yabancı** (`villager_11`, `agent_injected` → haritanın kenarından ajana yürür, fısıldar (balon: metin), kaçar; ardından bekçi); **kasa sandıkları** (vault'lu ajanın evinin önünde altın sandık + etiket "vault · 40 000 sat"; `vault_spent by owner` → sandık açılır, altın eve/kapıya uçar); **tezgâhlar** (`listing_added` → boş tezgâha sandık + "100 credits · 3 000 sat" etiketi; `listing_filled` → alıcı köylü tezgâha yürür, sandığı alır; `listing_cancelled` → boşalır); **Coop binası** `policy_updated` → "Policy updated" balonu; tıklama → `vault`/`listing` drawer'ları (`TownDrawer`'a `VaultCard`, `ListingCard`).
- **Desktop onay noktaları:** vault fonla 1, politika 0 (BRC-103 başlık imzası), geri çek 1, liste 2, iptal 1, sweep 1. Parşömende önceden yazılır.

## 3. Testler
Birim: `flows-mock.test.ts`'e sahip ve market akışları (create → fund → policy → withdraw; list → sweep → cancel). RTL yok (e2e kapsıyor). e2e: `owner.spec.ts` (bağlan → vault aç → fonla → politika → köydeki ret görünür → geri çek), `market.spec.ts` (bağlan → senaryonun listesi gelir → seç → Buy → onay → kredi bakiyem 100). Mevcut 4 e2e yeşil kalır.
**Mainnet kabulü (insan + D):** `/owner` vault aç + fonla (T9) → `npm run adopt` (D) → ajan guard onaylı pledge (T10) → bir 403 tarayıcıda; mümkünse `/market` sweep (T8).

## 4. Riskler
| Risk | Plan |
|---|---|
| `AuthFetch` tarayıcıdan guard'a BRC-103 (CORS expose ✓) ilk kez | mock'ta aynı arayüz; canlıda hata parşömende, STATUS'a not |
| Owner `withdraw` için UTXO'lar: tarayıcıda WoC yok | `ownerBasketUtxos` (Desktop basket) yeter: kendi fonlamalarımız oradadır; ajan harcadıysa kalan çıktı basket'te değil → "guard `GET /vaults/:id` utxos" ile tamamla, BEEF Arcade'den |
| Senaryo zamanlaması e2e'de (liste 28 s, ret 22,5 s) | `injectNow` ve test zaman aşımı 45 s; `postpone` zaten var |
| Guard `pause` yok | UI'da yok; not |

## 5. Checkpoint (Faz 3 sonu, 31.10 00:40)

**Kabul kanıtı (mock)**
- `wallet/flows/types.ts` `FlowsApi` + sahip (`createVault/fundVault/putPolicy/vaultStatus/withdrawVault`) ve market (`listings/listCredits/cancelListing/sweep`); `flows/vaultOps.ts` (D'nin `vault-ops.ts`'inin tarayıcı kopyası: aynı core ilkelleri; D core'a taşırsa import edilir), `flows/live.ts` (guard BRC-103 `AuthFetch`, Arcade BEEF yedeği, `reserveListing/signListing/POST /listings`, `buildSweep verifyLineage`), `flows/mock.ts` (aynı arayüz, sahte Desktop onayları, olaylar), `mine.vaults` (kalıcı: vault script'i tarayıcıda, anahtar yok), `MockRuntime.injectNow`.
- `/owner`: vault aç (ajan seçimi, guard kimliği) → fonla (1 onay, T9) → politika formu (sağlayıcı allowlist + 4 tavan; "durdurmak için weekly 0") → kararlar tablosu → **geri çek** (owner dalı, 1 onay); "Guard refusals in the village" (403 nedenleriyle), "Vaults in the village". `/agents`: kartlar (vault bakiyesi + ret sayısı + son ret, kararlar, işler, injected afişi), karar akışı, **"Inject now (mock)"**. `/market`: listeler (sat/kredi vs perakende, `demo pricing`), çoklu seçim → **sweep** parşömeni (toplam, soy kontrolü, 1 onay) → kredi bakiyem; sat (2 onay); iptal.
- Kasaba v2: **bekçi** kapıda (`cosign_approved` → "✓ within policy · N sat"; `cosign_denied` → "!" + ajana yürür + neden), **yabancı** (`agent_injected` → kenardan gelir, fısıldar, ret sonrası kaçar), **kasa sandıkları** (vault'lu ajanın evinin önünde, "vault · N sat"; sahip çekince açılır, altın uçar), **tezgâhlar** (`listing_added` → sandık + "100 credits · 3 000 sat"; `listing_filled` → alıcı tezgâha yürür, sandığı alır), Coop binası `policy_updated` balonu; tıklama → `vault`/`listing` drawer'ları.
- Testler: web vitest **18 dosya / 53 test** (sahip: create→fund→policy→status→withdraw, injectNow reddi; market: list→cancel, sweep), Playwright **6/6** (smoke, jüri, katılımcı, sağlayıcı, **sahip turu**, **market turu**); typecheck temiz.

**Mainnet kabulü (insan + D, henüz yapılmadı):** `/owner` vault aç + fonla (T9) → D `npm run adopt` → ajan guard onaylı pledge (T10) → 403 tarayıcıda; `/market` sweep (T8). Canlıda denenmeyenler: guard'a `AuthFetch` tarayıcıdan, `withdrawVault` Arcade BEEF yedeği, `buildSweep` tarayıcıdan.

**Checkpoint soruları**
1. Plan hâlâ iyi mi? Evet. Guard `pause` yok → UI'da yok (weekly 0 notu). D `vault-ops`'u core'a taşırsa `vaultOps.ts` silinir (STATUS isteği).
2. Faz bitti (mock) → STATUS Track E. `/design-review` tam döngüsü yine koşulmadı (ekran görüntüleriyle elle: çerçeveler, etiketler, dürüstlük etiketleri yerinde).
3. Diğer track'ler: D Faz 4a README/tehdit modeli; A Faz 5–6 lighthouse + OrdLock; C Faz 3 market/participant-cli. C'nin ajan SSE'si hâlâ yok → ajan balonları mock/replay.
4. P4 bağımlılıkları: D.P3 Rail (maker `/quote`, `/events` var → liman sahnesi "experimental"), B.P5 yayın URL'leri (yok → Pages varsayılan), ses (Kenney CC0 indirilmeli).
5. Arayüz: D'ye — `vault-ops.ts` → core (veya `@agentcoop/owner-cli` export) isteği; B'ye — `GET /listings` tarayıcıdan sorunsuz (mock).

