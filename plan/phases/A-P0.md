# A-P0 — İskelet, tipler, SDK köprüsü, imza spike'ı (ayrıntılı plan)

> Track dosyası: `plan/track-A-protocol.md` Faz 0. Arayüzler: `plan/00-MASTER-PLAN.md` §3 (donmuş). Bu dosya fazın uygulama planıdır; kapsamı track dosyasından geniş, arayüzü ondan farklı değildir.
> Tarih: 2026-10-30. Durum: plan yazıldı → kod.

## 0. Öncelik sırası (kritik yol)

B ve C, `types.ts` ve `@agentcoop/core/sdk`'yı bekliyor. Bu yüzden sıra:

1. **Kök konfigürasyon + `npm install`** (0.1)
2. **`types.ts` + `sdk.ts` + `index.ts`** (0.2a) → STATUS'ta hemen duyur ("types hazır")
3. Kit kopyası (0.2b) + opreturn (0.3) + P2pkhWalletSigner (0.5) + script stub'ları
4. Testler yeşil (0.6)
5. Spike script'i (0.4) — mainnet koşusu BSV Desktop + sats gerektirir (insan); kod hazır olur, koşu STATUS'ta beklemede

## 1. Bağımlılıkların durumu (STATUS 2026-10-30)

| Bağımlılık | Durum | Etki |
|---|---|---|
| D.P0 sats / cüzdanlar | başlamadı | 0.4 mainnet koşusu bekler; kod + mockchain varyantı hazırlanır |
| BSV Desktop (insan) | bilinmiyor | 0.4 doğrulama testi 2 ve 3 bir üyenin laptopunda çalıştırılır |
| B, C | başlamadı | `types.ts`'imi bekliyorlar → ilk iş |

## 2. Dosya listesi

### Kök
| Dosya | İçerik |
|---|---|
| `package.json` | workspaces `packages/*`, `apps/*`, `scripts`; sabit versiyonlar (`docs/AGENTS.md` tablosu, `^` yok); `npm test` = `vitest run`, `npm run typecheck` |
| `tsconfig.base.json` | ES2022, ESNext, `moduleResolution: Bundler`, strict, `allowImportingTsExtensions: false`, `noEmit` |
| `tsconfig.json` | base'i genişletir; `include`: `packages/*/src`, `packages/*/test`, `apps/*/src`, `scripts`, `test` |
| `vitest.config.ts` | kit alias'ı birebir: `@bsv/sdk` → `node_modules/@bsv/sdk/dist/cjs/mod.js`; include: `test/**`, `packages/*/test/**`, `apps/*/test/**`; timeout 120 sn; `fileParallelism:false` |
| `.gitignore` | `node_modules/`, `.env*` (`.env.example` hariç), `data/`, `*.sqlite`, `*.db`, `graft/` |
| `AGENTS.md` | `docs/AGENTS.md` kopyası |

### `packages/core` (`@agentcoop/core`)
Derleme yok: `exports` doğrudan `.ts` kaynaklarını gösterir (tsx ve vitest çalıştırır). Alt yollar: `.`, `./sdk`, `./types`, `./kit/*`, `./scripts/*`, `./signers/*`.

| Dosya | Ne | Kaynak |
|---|---|---|
| `src/sdk.ts` | `export * from '@bsv/sdk'` — tek SDK giriş noktası | MASTER §3.1 |
| `src/types.ts` | MASTER §3.3 **birebir** (`PoolTerms`, `PledgeRecord`, `Offer`, `Listing`, `SettlementPlan`, `InputSigner`) + §3.2 sabitleri (`OP_RETURN_PREFIX`, protokol/basket adları, sighash scope'ları, sınırlar) | yeni |
| `src/errors.ts` | `AgentCoopError { code }` + `ErrorCode` birliği (Faz 2.7'de genişler; şimdiden iskelet, koordinatör/guard aynı tipi kullanır) | yeni |
| `src/index.ts` | hepsini yeniden dışa aktarır | yeni |
| `src/kit/inscription.ts` | birebir kopya | kit `core/inscription.ts` |
| `src/kit/rules.ts` | birebir kopya | kit `core/rules.ts` |
| `src/kit/addresses.ts` | birebir kopya | kit `core/addresses.ts` |
| `src/kit/signer.ts` | birebir kopya (scope sabit ALL) | kit `client/signer.ts` |
| `src/kit/coinselect.ts` | birebir | kit `client/coinselect.ts` |
| `src/kit/token.ts` | birebir; yalnız import yolları | kit `client/token.ts` |
| `src/kit/overlayApi.ts` | birebir; tek fark: `KitQuery`/`OutputContext` tipleri `./lookupTypes`'tan (overlay paketi B'nin; core onu import etmemeli) | kit `client/overlayApi.ts` |
| `src/kit/lookupTypes.ts` | `KitQuery`, `OutputContext` tip tanımları birebir | kit `overlay/Bsv21KitLookupService.ts` (yalnız tipler) |
| `src/kit/payments.ts` | birebir | kit `client/payments.ts` |
| `src/kit/arcadeChainTracker.ts` | birebir | kit `client/arcadeChainTracker.ts` |
| `src/scripts/opreturn.ts` | `buildOpReturn(op, json)`, `parseOpReturn(script)` | MASTER §3.2 |
| `src/scripts/vault.ts` | `vaultLockingScript(ownerPub, agentPub, guardPub)` **iskelet**: FINAL-IDEA §4.9 script'i; D gerçek gövdeyi doğrular/değiştirir | MASTER §3.4 |
| `src/scripts/htlc.ts` | `htlcLockingScript(hash, agentPub, guardPub, makerPub)` iskelet (FINAL-IDEA §4.10) | MASTER §3.4 |
| `src/signers/P2pkhWalletSigner.ts` | `InputSigner` uygular; scope parametreli; `signWalletP2pkhInput`'ın genelleştirilmiş hali | kit `client/signer.ts` |
| `src/signers/sighash.ts` | `signP2pkhWithScope(wallet, tx, i, key, scope, originator?)` — kit signer'ın scope parametreli kopyası (P2pkhWalletSigner bunu kullanır; spike de) | kit `client/signer.ts` |
| `test/opreturn.test.ts`, `test/rules.test.ts` (kit kopyası), `test/signer.test.ts`, `test/sdk-single-copy.test.ts` | | |

### Kök `test/`
| Dosya | Ne |
|---|---|
| `test/helpers/mockchain.ts` | kit'ten birebir kopya |
| `test/spike-sighash.mockchain.test.ts` | 0.4'ün mockchain varyantı: SINGLE\|ACP + ALL karışık tx'in mock chain'de kabulü |

### `scripts/`
| Dosya | Ne |
|---|---|
| `scripts/package.json` | `@agentcoop/scripts` workspace (D ileride doldurur) |
| `scripts/spike-sighash.ts` | doğrulama testi 2 + 3 (mainnet, Desktop) |

## 3. Fonksiyon imzaları (bu fazda yazılanlar)

```ts
// scripts/opreturn.ts
export type CoopOp = 'pool' | 'pledge' | 'settle' | 'list' | 'vault'
export const OP_RETURN_TAG = 'agentcoop'
export function buildOpReturn (op: CoopOp, json: Record<string, string | string[] | Record<string,string>>): LockingScript
export function parseOpReturn (script: LockingScript | Script | string): { op: CoopOp, json: Record<string, unknown> } | null
//  - buildOpReturn: tüm yaprak değerler string değilse throw (sayı/bool yasak) — MASTER §3.2 "tüm sayılar string"
//  - parseOpReturn: OP_FALSE OP_RETURN "agentcoop" <op> <json> değilse null; bilinmeyen op → null; bozuk JSON → null

// signers/sighash.ts
export const SCOPE_ALL, SCOPE_SINGLE_ACP: number
export async function signP2pkhWithScope (wallet, tx, inputIndex, key: KeyRef & { counterparty?: 'anyone'|'self'|string }, scope: number, originator?): Promise<UnlockingScript>

// signers/P2pkhWalletSigner.ts
export class P2pkhWalletSigner implements InputSigner {
  readonly unlockingScriptLength = 108
  constructor (wallet: WalletInterface, key: { protocolID: WalletProtocol, keyID: string, counterparty?: string }, opts?: { scope?: number, originator?: string })
  sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript>
}

// scripts/vault.ts, scripts/htlc.ts — MASTER §3.4 imzaları birebir
```

## 4. Veri akışı (spike, doğrulama testi 2 + 3)

```
BSV Desktop (WalletClient('auto', APP_ORIGINATOR))
 1. getPublicKey([1,'agentcoop pledge'], keyID=nonce, 'anyone', forSelf) → pub
 2. createAction: out0 = P2PKH(pub) 1.000 sat, basket 'agentcoop', customInstructions {protocolID,keyID,counterparty}
    randomizeOutputs:false → txA (Desktop yayınlar)
Spike script
 3. tx = new Transaction(); in0 = txA:0 (sourceTransaction=txA); out0 = P2PKH(spike geçici adresi) 900 sat
 4. Desktop'a SINGLE|ACP|FORKID imzası: signP2pkhWithScope(desktop, tx, 0, key, SINGLE_ACP) — createSignature(hashToDirectlySign)
 5. İkinci imzacı (yerel PrivateKey, sats D'nin agent cüzdanından ya da Desktop'tan ikinci createAction ile ayrılmış bir coin):
    in1 eklenir, out1 eklenir → in0 imzası HÂLÂ geçerli olmalı (SINGLE|ACP'nin anlamı bu); in1 ALL|FORKID ile imzalanır
 6. tx.verify yerel (Spend) → broadcastEF(Arcade POST /tx, EF) → txid STATUS'a
 7. Gözlem (test 3): adım 4 ve ikinci bir createSignature'da Desktop onay penceresi gösterdi mi? Kaç kez?
```

Spike'ta **in1/out1'in in0 imzalandıktan SONRA eklenmesi** testin özüdür: teklifin "imzala, çevrimdışı kal, başkası tamamlasın" iddiasını kanıtlar.

## 5. Test senaryoları

### Mockchain / birim (bu fazda yeşil olmalı)
| Test | Kanıtladığı |
|---|---|
| `opreturn.test.ts` round-trip (5 op), sayı/bool değer → throw, iç içe objede sayı → throw, yabancı OP_RETURN → null, bozuk JSON → null, `agentcoop` etiketi farklı → null | MASTER §3.2 zarfı |
| `rules.test.ts` (kit'ten kopya, import yolları değişir) | kit kuralları core'da birebir çalışıyor |
| `signer.test.ts`: `ProtoWallet` ile `P2pkhWalletSigner` ALL ve SINGLE\|ACP; SDK `Spend` ile script doğrulaması; SINGLE\|ACP imzasından sonra başka girdi + çıktı eklenince in0 hâlâ geçerli; out0 değişince geçersiz | sighash scope semantiği (FINAL-IDEA §4.2) |
| `sdk-single-copy.test.ts`: `@agentcoop/core/sdk`'nın `Transaction`'ı ile wallet-toolbox'ın kullandığı `Transaction` aynı sınıf | MASTER §3.1 ESM/CJS kuralı |
| `test/spike-sighash.mockchain.test.ts`: iki wallet-toolbox cüzdanı; A pledge coin'i ayırır, SINGLE\|ACP imzalar; B girdisini ekler (createAction + signAction, `inputBEEF`), mock chain kabul eder | test 2'nin cüzdan tarafı (Desktop hariç) |

### Mainnet (0.4)
- `NETWORK=main APP_ORIGINATOR=agentcoop.local npx tsx scripts/spike-sighash.ts` — Desktop açık; ≤ 1.000 sat. Çıktı: txid + WoC linki + gözlem notu. **Ön koşul:** Desktop'ta sats (D.P0). Yoksa STATUS Blokajlar.

## 6. Riskler

| Risk | Önlem |
|---|---|
| ESM/CJS iki SDK kopyası (`script[serializedBytes] is not a function`) | vitest alias; `sdk-single-copy` testi; çalışma zamanında tsx için de kontrol (aşağıda §8) |
| `TransactionSignature.format` ANYONECANPAY/SINGLE desteği | `node_modules/@bsv/sdk/dist/types/.../TransactionSignature.d.ts` ve kaynağında doğrula; `signer.test.ts` ile kanıtla |
| BSV Desktop `hashToDirectlySign`'ı reddeder ya da her seferinde sorar | Test 2/3; başarısızsa FINAL-IDEA §12.2 B planı (teklifler sunucu cüzdanından) — Checkpoint 1 |
| TypeScript 7 (native tsc) ile tip uyumsuzluğu | kit aynı versiyonu kullanıyor; sorun olursa `typecheck` CI'ı bloklamaz, STATUS'a yaz |
| Eşzamanlı track'ler kök dosyalara dokunur | Kök konfig A'nın (MASTER §3.1, track A 0.1); değişiklik isteyen STATUS'a yazar |

## 7. Kabul kriterlerinin kanıtı

| Kriter | Kanıt |
|---|---|
| `npm install && npm test` temiz | komut çıktısı (test sayısı) STATUS'ta |
| `@agentcoop/core` diğer workspace'lerden import ediliyor | `scripts/spike-sighash.ts` `@agentcoop/core` import eder; `npx tsx -e` duman testi |
| test 2/3 sonucu STATUS'ta | mainnet koşusu sonrası; koşulamazsa "beklemede: Desktop+sats" + Blokajlar satırı |
| types.ts hazır | STATUS Track A "Diğer track'lerin benden beklediği" |

## 8. SDK köprüsü kararı (`sdk.ts`)

Hedef: wallet-toolbox (CJS) ile bizim kodumuz **aynı** `@bsv/sdk` build'ini kullansın.
- **vitest:** kök alias (kit deseni) yeter.
- **tsx / Node çalışma zamanı:** `export * from '@bsv/sdk'` ESM build'e çözülür → wallet-toolbox'ın CJS kopyasıyla çakışır. Çözüm `sdk.ts`'de, `@bsv/sdk`'nın `exports` haritası izin veriyorsa doğrudan CJS dosyasından yeniden dışa aktarım; izin vermiyorsa tsx'in tsconfig `paths` desteği. Hangisi seçildiyse duman testi: `npx tsx scripts/check-sdk.ts` wallet-toolbox `Wallet` ile `Transaction` instanceof eşitliğini basar. Karar bu dosyaya ve STATUS'a yazılır.

## 9. Sonuç (2026-10-30)

- **SDK köprüsü kararı:** `packages/core/src/sdk.ts` = `export * from '../../../node_modules/@bsv/sdk/dist/cjs/mod.js'` (SDK `exports` haritası `dist/cjs` alt yoluna izin vermiyor; göreli dosya yolu haritayı atlar). tsx altında `Transaction === require('@bsv/sdk').Transaction` doğrulandı; vitest'te kök alias aynı dosyayı gösterir (`sdk-single-copy.test.ts`). Kural: herkes `@agentcoop/core/sdk`'dan import eder; core içi dosyalar `../sdk`'dan.
- **Testler:** 5 dosya / 25 test yeşil (`npm test`), `npm run typecheck` temiz.
- **Öğrenilenler (Faz 1'i etkiler):**
  1. SDK top-level `OP_RETURN` sonrasını tek chunk yapar → `parseOpReturn` iç pushları yeniden okur.
  2. wallet-toolbox `createAction` hazır `unlockingScript`'i yayından önce doğrular → Faz 1'de katılımcılar imzalarını `createAction`'a değil koordinatörün kurduğu ham tx'e verir (plan aynen geçerli); ama **teklifin canlılık testi** için "yabancı SINGLE|ACP girdisini createAction'a ver" deseni kullanılabilir (`verifyOffer` iç doğrulaması için ucuz yol değil; `Spend` ile yerel doğrulama tercih).
  3. `WalletClient` metotları originator parametresi almaz.
  4. `signP2pkhWithScope` yalnız `createSignature` + `getPublicKey` ister (`SigningWallet`) → guard ve testler `ProtoWallet` kullanabilir.
- **Açık:** mainnet koşusu (doğrulama 2/3) — STATUS Blokajlar.
