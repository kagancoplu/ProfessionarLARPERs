# B-P3 — Market indeksi, vault indeksi, canlı akış, barındırma, dayanıklılık (→ S3)

> Track B, Faz 3. Kaynak: `plan/track-B-overlay-coordinator.md` Faz 3; MASTER §3.3 (`Listing`), §3.5, §3.8; Track D 1.1 (vault script + `OP_RETURN vault { v, vaultId, owner, agent, guard }`), 1.2 (anahtarlar `[1,'agentcoop vault']`, keyID = vaultId, `'anyone'`); Track A 2.3 (`signListing`: SINGLE\|ACP, esas kayıt `POST /listings`, `OP_RETURN list` opsiyonel).
> Yazıldı: 30.10 ~16:46. Branch `trackB`. Node 22.

## 1. Amaç

1. **Market:** `POST /listings` (imzalı liste, zincire karşı doğrulanır) ve `GET /listings?tokenId=` (yalnızca hâlâ harcanmamış olanlar; sweep sonrası düşer).
2. **Vault indeksi:** sahibin kimliğine göre vault'lar ve bakiyeleri; sahiplik iddiası zincirden **doğrulanır**.
3. **Canlı akış ≤ 1 sn:** overlay her kabulde olay yayınlar (SSE), koordinatör anında yeniden okur.
4. **Barındırma:** overlay + koordinatör tek komutla, kalıcı veriyle, çökünce yeniden başlayarak.
5. **Dayanıklılık:** koordinatör yeniden başlayınca kara liste, tur sayısı ve son tur sonucu kaybolmaz.

## 2. Bağımlılıkların durumu (16:46)

| Bağımlılık | Durum | Ne yapıyorum |
|---|---|---|
| A.P2 `Listing`, `signListing`, `buildSweep` | Yok | `Listing` MASTER §3.3'ten geçici tipe; `apps/coordinator/src/verifyListing.ts` geçici doğrulayıcı (A'nın yoksa). Testte liste ve sweep yalnızca test yardımcılarıyla |
| D.P1 vault script + kayıt | Yok (D P0'da) | `packages/overlay/src/stub/vault.ts`: D 1.1'deki script'in geçici kopyası. Format D'nin planından birebir |
| Kök workspace | Yok | Faz 1 düzeni; `npm run infra` kök script'i A'nın dosyası → şimdilik `node infra/run.mjs`, A'dan kök `package.json`'a `"infra"` eklemesi istenir |

## 3. Tasarım

### 3.1 Vault indeksi (overlay)
- **Topic manager:** (a) geçerli bir `vault` kaydının OP_RETURN çıktısı, (b) vault şablonuna uyan **her** çıktı (`OP_IF <33> OP_CHECKSIG OP_ELSE OP_2 <33> <33> OP_2 OP_CHECKMULTISIG OP_ENDIF`) admit edilir. (b) durumsuz ve yapısal: vault'a dönen para üstleri (settlement, ödeme, sıcak cüzdan aktarımı) kayıt taşımasa da indekslenir.
- **Lookup:** `agentcoop_vaults(vault_id, txid, record_vout, owner, agent, guard, script_hex, verified)` ve `agentcoop_vault_outputs(txid, vout, script_hex, satoshis, spent, spending_txid)`; ikisi **script hex** ile birleşir (bir vault'un tüm çıktıları aynı script'i taşır).
- **Doğrulama:** anahtarlar `'anyone'` ile türetildiği için herkes hesaplayabilir: `script = vault(anyonePub(owner, vaultId), anyonePub(agent, vaultId), anyonePub(guard, vaultId))`. Kayıttaki script bununla eşleşirse `verified: true`. Eşleşmeyen kayıt (başkasının vault'una sahiplik iddiası) `owner` sorgusunda gösterilmez. Yani sahte "bu vault benim" kaydı işe yaramaz.
- **Sorgular:** `{ op:'vaults', owner?, includeUnverified? }`, `{ op:'vault', vaultId }` → vault kaydının çıktısı → `{ vaultId, owner, agent, guard, scriptHex, verified, balanceSats, utxos: [{ outpoint, satoshis }] }`.

### 3.2 Market
- **Esas kayıt koordinatörde** (A 2.3). `POST /listings` doğrular: `outpoint` overlay'de admit edilmiş, harcanmamış bir kredi çıktısı; `tokenId` ve `credits` onun `tokenId`/`amt`'ı; `lockingScriptHex`/1 sat eşleşiyor; imza baytı `0xC3`; imza, girdi ↔ aynı index'teki çıktı = `askSats → payScriptHex` ile `Spend`'den geçiyor (SINGLE imzası girdinin index'ine değil "aynı index'teki çıktıya" bağlı, yani sweep'teki her konumda geçerli). Hata kodları teklifle aynı aile + `LISTING_*`.
- `GET /listings?tokenId=` → kayıtlı listeler; her birinin outpoint'i overlay'de harcanmışsa listeden düşer (sweep veya satıcının iptali). Sıra: `askSats / credits` artan (en ucuz önce).
- Overlay'in `{ op:'listings', tokenId? }` sorgusu zincirdeki opsiyonel `OP_RETURN list` kayıtlarını ham döndürür.

### 3.3 Canlı akış
- Overlay her kayıt/kredi/vault kabulünde ve her harcanma bildiriminde bir olay yayar; `GET /agentcoop/events` (SSE, CORS açık) → `data: {"type":"admitted"|"spent","txid":…}`.
- Koordinatör bu akışa abone olur (koparsa 1→2→4… sn, en çok 30 sn ile yeniden bağlanır); olay gelince 100 ms debounce ile `feed.poll()` + `engine.tick()`. Periyodik poll (5 sn) yedek olarak kalır.
- Hedef: pledge'in overlay'e girmesinden `pool_update`'e ≤ 1 sn.

### 3.4 Barındırma (`infra/`)
- `infra/run.mjs`: kök `.env`'i okur (varsa), `data/overlay/`, `data/coordinator/` dizinlerini kurar, overlay'i ve koordinatörü başlatır, logları önekle birleştirir, çöken süreci geri çekilmeyle yeniden başlatır, SIGINT/SIGTERM'de ikisini de kapatır.
- Kalıcı veri: `OVERLAY_DB=data/overlay/overlay.db`, overlay anahtarı `data/overlay/overlay.key` (yoksa üretilir, 600), `COORDINATOR_DB=data/coordinator/coordinator.db`. `data/` gitignore'da.
- `.env.example` D'nin dosyası: eklenecek değişkenler STATUS'ta D'ye iletilir.
- Sürekli çalışan ortak makine/VPS Faz 5'te; burada yerel kanıt.

### 3.5 Dayanıklılık
- Koordinatör DB'sine `progress(pool_id, json)`: `attempts`, `blacklist`, `lastRound`, `failedAnnounced`, `gaveUp`. Her değişimde yazılır, açılışta yüklenir. Açık tur kalıcı değildir: yeniden başlayınca havuz `open` görünür ve sonraki tick yeni tur açar (katılımcılar yeni `sign_request` alır; eski turun imzaları zararsız, hiçbiri yayınlanmadı).
- Overlay: GASP kapalı (kit gibi); eksik tx'ler istemcinin outbox/`sync`'i ile gelir (guide §17.6).

## 4. Dosyalar

```
packages/overlay/src/stub/vault.ts      GEÇİCİ: D 1.1 script'i + anyone doğrulaması
packages/overlay/src/stub/types.ts      + Listing (MASTER §3.3)
packages/overlay/src/records.ts         + validateVaultRecord
packages/overlay/src/AgentCoopTopicManager.ts   + vault kaydı + vault şablonlu çıktılar
packages/overlay/src/AgentCoopLookupService.ts  + vault tabloları/sorguları, listings sorgusu, olay yayımı
packages/overlay/src/events.ts          OverlayEvents + SSE handler
packages/overlay/src/server.ts          /agentcoop/events route'u (start'tan önce)
packages/overlay/src/views.ts           + VaultView
apps/coordinator/src/verifyListing.ts   GEÇİCİ (A'nın verifyListing'i yoksa)
apps/coordinator/src/store.ts           + listings, progress tabloları
apps/coordinator/src/api.ts             + POST/GET /listings
apps/coordinator/src/events.ts          SSE abonesi
apps/coordinator/src/engine.ts          progress kalıcılığı
infra/run.mjs, infra/README.md
```

## 5. Test senaryoları

**Overlay (`packages/overlay/test/overlay.vaults.test.ts`):**
1. Doğru kurulmuş vault fonlaması → `vaults { owner }` vault'u `verified`, bakiye = fonlama.
2. Aynı script için başka bir `owner` iddia eden kayıt → `verified:false`, sahibin sorgusunda yok, iddia edenin sorgusunda da yok (`includeUnverified` ile görünür).
3. Vault çıktısı harcanıp para üstü aynı script'e dönünce: eski çıktı harcanmış, yenisi bakiyede (kayıt taşımayan tx).
4. SSE: bir submit sonrası `admitted` olayı 1 sn içinde geliyor.

**Koordinatör (`apps/coordinator/test/e2e.market-live.mockchain.test.ts`):**
5. `POST /listings`: geçerli SINGLE\|ACP liste 201; ALL imzası 400; yanlış `credits` 400; overlay'in bilmediği outpoint 404. `GET /listings` en ucuz önce.
6. İki listeyi tek tx'te süpüren alım (test yardımcısı; girdi i ↔ çıktı i) → overlay kabul ediyor → iki liste `GET /listings`'ten düşüyor; alıcının kredisi doğru.
7. Canlı akış: `pollMs` 60 sn iken bir pledge'in `pool_update`'i olay yoluyla ≤ 1 sn'de geliyor.
8. Yeniden başlatma: kara listeye düşmüş bir havuzla koordinatör kapatılıp aynı DB ile açılınca `coordinator.blacklist` ve `lastRound` aynı.

**Infra:** `node infra/run.mjs` ile iki servis kalkıyor, `/healthz` yeşil; overlay süreci öldürülünce yeniden başlıyor; Ctrl+C ikisini kapatıyor.

## 6. Kabul ve kanıtı

| Kabul (track dosyası) | Kanıt |
|---|---|
| Liste + sweep overlay'de doğru görünüyor | test 5–6 (mockchain); mainnet T8 **A.P2 + C.P3**'e bağlı |
| Vault sorgusu çalışıyor | test 1–3; mainnet D.P1'in vault fonlamasıyla |
| Canlı akış ≤ 1 sn | test 4 ve 7 |
| infra kesintisiz | yerelde `infra/run.mjs` + yeniden başlatma; 24 saat VPS'te Faz 5 |

## 7. Sonuç (17:05)

Mockchain kabulü tamam: overlay 19/19, koordinatör 14/14. `infra/run.mjs` yerelde denendi (kalkış, çökme sonrası yeniden başlatma, temiz durdurma). Plandan farklar ve bulgular:
- Kapanma sorunları düzeltildi: overlay açık SSE akışlarını, koordinatör keep-alive soketlerini kapatıyor (yoksa yeniden başlatma takılıyor ya da istemci ölü sokete gidiyordu).
- Olay testinin ölçütü "overlay kabulü onayladıktan sonra ≤ 1 sn" olarak netleşti (submit'in kendisi, overlay'in mock tx'leri gerçek yayıncılara göndermeyi denemesi yüzünden ~2 sn sürüyor).
- 24 saat kesintisiz çalışma kabulü Faz 5'teki VPS'e kaldı. Mainnet kabulleri (T8 sweep, vault) A.P2/C.P3 ve D.P1'e bağlı.
