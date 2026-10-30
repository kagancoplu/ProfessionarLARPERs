# D-P2b — Vault'a kilitli kredileri harcama: imzalayıcı, guard `redeem` / `list`, basket

> Track D. A'nın 30.10 21:30 isteği (STATUS "Arayüz değişiklikleri" A → B, D, C; `plan/track-A-protocol.md` Faz 5.4). A 5.1–5.3 krediyi vault script'ine kilitledi (`creditLock: 'vault'`); onu **harcamak** (redeem, liste) agent + guard ister ve guard'ın politikası olmadan yapılamaz. Bu faz D'nin payı; işlem kurucuları (`src/vault/creditSpend.ts`) A'nın. Bitince FINAL-IDEA §8 / `docs/THREAT-MODEL.md` T-10 "Kapalı" olur.
> Kullanıcı kararı (30.10 ~22:00): şimdi yapılsın. Önce `git pull` + STATUS. Aynı dalda başka bir D oturumu var: başlamadan `origin/trackD`'de bu işi alan commit yok (kontrol edildi).

## 1. Vault kredisi çıktısı (A 5.1)

`OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF` + vault script'i (109 B). Unlock vault'unki (zarf no-op); sighash alt-script'i **tüm** kilit script'i (zarf dahil): `vaultSighash` zaten kaynağın tam script'ini kullanıyor.

## 2. İmzalayıcı (`packages/core/src/signers/VaultSigner.ts`, `scripts/vault.ts`)

- `VaultSigner` / `VaultOwnerSigner`: girdinin anahtarları `vaultKeysOfScript` (A) ile: düz vault çıktısı **ya da** vault kredisi. Bugün kredi girdisi "not a vault output" ile reddediliyor.
- Sighash kapsamı parametre: `vaultSighash(tx, i, scope = ALL|FORKID)`, `toChecksigSignature(der, scope)`, `verifyVaultSignature(pub, h, sig, scope)`; varsayılanlar aynı (mevcut çağrılar değişmez). `VaultSignerOptions.scope?` (liste için `SINGLE|ANYONECANPAY|FORKID` = 0xC3).
- `CosignKind`'a `'redeem' | 'list'`; `CosignContext.creditPayees?: [{ vout, provider, index }]` (redeem alıcısının kanıtı).
- Basket: `VAULT_CREDITS_BASKET = 'agentcoop vault credits'`, `adoptVaultCredits(wallet, vaultId, tx, vout)` (yalnızca bu vault'un kredisi kabul), `listVaultCredits(wallet, vaultId)` → `{ outpoint, satoshis, lockingScriptHex, tokenId, amount, beef }`. Vault'un sat basket'inden ayrı: `spendFromVault` kredi UTXO'sunu ücret için asla seçmez.

## 3. Guard `kind: 'redeem'` (ALL; harcama ya da vault içinde bölme)

Girdi `i` = bu ajanın kayıtlı bir vault'unun kredisi (`decodeBsv21Owned` → owner vault script = kayıtlı script), tx'te o vault'tan tek girdi. Diğer girdilerde BSV-21 yok (yalnız ajanın ücret sat'ları).
- **C1** G1, G4, G5 (sighash ALL), G6 aynen.
- **C2** Kredi çıktıları yalnızca iki türde: (a) `creditPayees` kanıtlı **izinli sağlayıcıya** transfer: `ownerPkh = receivePkh(provider, index)`, `provider ∈ allowProviders`; (b) **aynı vault'a** kilitli kredi (para üstü / bölme). Başka her BSV-21 çıktısı → `credits to unlisted output`.
- **C3** Korunum: Σ çıktı kredisi = girdi kredisi, aynı `tokenId` (yakma da yok) → `credits not conserved`.
- **C4** Sat'lar `pay` gibi: vault'a dönen sat vault dönüşü, kanıtsız çıktılar ≤ ajanın kendi girdileri (G9), ücret ≤ `maxFeeSats` (G10), çıkış haftalık tavana (G12; yalnızca kredi çıktılarının 1'er sat'ı).
- Payee'siz redeem = vault içinde bölme/birleştirme (liste öncesi parça ayırma).

Not: `allowProviders` havuz sağlayıcısının kimliğini tutar; redeem adresi provider-api'nin kimliğidir (`/v1/catalog` `credits.redeemTo`). Sahip ikisini de izinli listeye koyar.

## 4. Guard `kind: 'list'` (SINGLE|ANYONECANPAY|FORKID)

Tx = liste iskeleti: girdi `i` vault kredisi (C1'deki gibi), **aynı index'teki çıktı** satış bedeli. Guard ve ajan aynı 0xC3 sighash'i imzalar (alıcı süpürürken başka girdi/çıktı ekler; A 2.3 `SINGLE|ACP` listeleriyle aynı mantık).
- **L1** Çıktı `i` = **bu vault'un script'i** (bedel vault'a iner, ajana değil) → aksi `listing proceeds must go to the vault`.
- **L2** Politika `minAskSatsPerCredit` (yeni, opsiyonel alan); yoksa **liste kapalı** (`listing not enabled by the owner`, varsayılan red). Bedel ≥ kredi × `minAskSatsPerCredit` → aksi `ask below minAskSatsPerCredit`.
- **L3** Final (G4); ajan imzası 0xC3 sighash'te (G5'in kapsamlı hali).
- Ledger: çıkış yok (bedel vault'a gelir); karar günlüğüne `list` olarak yazılır.

## 5. Arayüz (MASTER §3.7, önce MASTER sonra STATUS)

- `/cosign` `context.kind`: `'pay' | 'settle' | 'rail' | 'redeem' | 'list'`; `creditPayees` (redeem). Liste isteğinde ajan imzası ve guard imzası 0xC3.
- Politika: opsiyonel `minAskSatsPerCredit` (sat, tam sayı); eski politikalar geçerli kalır.

## 6. Testler (`test/vault-credits.spend.mockchain.test.ts`, gerçek guard, mock chain)

1. Kurulum: sahip vault + politika; vault'a kilitli 20 kredilik deploy+mint (lineage kökü), ajan basket'e alır (`adoptVaultCredits`, başka vault'unkini reddeder).
2. Redeem: 5 kredi izinli sağlayıcının `receivePkh`'ına + 15 kredi aynı vault'a → ALLOW, zincir kabul eder (mock chain script doğrular).
3. Redeem redleri: izinsiz sağlayıcı, kanıtsız P2PKH (ajanın kendi adresi = guard atlatma), yakma (korunum), başka vault'a kilitli kredi.
4. Bölme: payee'siz redeem (10 + 5 aynı vault'a) → ALLOW.
5. Liste: politika yokken red; bedel ajana giderse red; tabanın altında red; geçerli liste (0xC3) → bir alıcı süpürür (kendi girdisi + kredi çıktısı kendine) → zincir kabul eder, bedel vault'ta.
6. Sahip vault kredisini guard'sız çeker (`VaultOwnerSigner`, `vaultKeysOfScript`).
7. Regresyon: mevcut guard/vault testleri değişmeden yeşil.

## 7. Kabul

Testler yeşil; kök `npm test` + typecheck temiz; MASTER §3.7 ve STATUS (D → A, C) güncel; `docs/THREAT-MODEL.md` T-10 "Closed (mock chain)" + guard tablosuna C/L satırları.

## 8. Checkpoint (30.10 ~22:45)

1. **Plan hâlâ iyi mi?** Evet. Tek sapma: test-içi kurucuda vault'a dönen kredi çıktıları `createAction` anında `agentcoop vault credits` basket'ine konuyor; ajanın kendi işleminin çıktısı sonradan `internalizeAction` ile alınamıyor (wallet-toolbox). **A'nın `creditSpend.ts`'i de böyle yapmalı** (`spendFromVault`'un vault para üstüyle aynı desen). Liste iskeletinin girdisi boş unlocking script taşımalı, yoksa guard'a giden `txBEEF` serileşmiyor.
2. **Bitti:** imzalayıcı (`vaultKeysOfScript`, `scope`), `scripts/vault.ts` kapsam parametreleri (varsayılan değişmedi), `adoptVaultCredits`/`listVaultCredits`, guard `apps/guard/src/credits.ts` (`redeem` C1–C4, `list` L1–L3), politika `minAskSatsPerCredit` (opsiyonel; owner-cli `--min-ask`), karar log'unda kredi hareketi. Test `test/vault-credits.spend.mockchain.test.ts` 7/7: kurulum + başka vault'un kredisi reddi; redeem 5 sağlayıcıya + 15 vault'a, zincir kabul; redler (izinsiz sağlayıcı, ajanın kendi adresi, sahte kanıt, yakma, başka vault); vault içinde bölme; liste redleri (taban yok, bedel ajana, taban altı); alıcı listeyi kendi girdileriyle tamamlıyor (SINGLE|ACP imzaları zincirde geçerli, 200 sat vault'ta); sahip kredileri tek başına çekiyor.
3. **Diğer track'ler:** A 5.4 `creditSpend.ts` kurucularını bu guard türlerine yazacak; C: `/v1/credits/return` vault'tan redeem edilen krediyi ajanın P2PKH'ına gönderiyor (T-10'daki sınırlı dolaylı yol) → vault'a dönmeli. STATUS'ta D → A, C.
4. **Sonraki:** S3 hâlâ tamamlanmadı; mainnet için sats/laptop yok. Kullanıcıya sorulacak.
5. **Arayüz değişikliği:** MASTER §3.7 (`kind: 'redeem' | 'list'`, `creditPayees`, `minAskSatsPerCredit`, 0xC3) güncellendi; STATUS "Arayüz değişiklikleri"nde D → A, C.

## 9. Ek: A 5.4 ile birleşme (30.10 ~23:40, kullanıcı kararı)

A 5.4 (`src/vault/creditSpend.ts`) D-P2b'yi görmeden yazılmıştı: `list`'te krediyi ajanın liste anahtarına (P2PKH) taşıyor, `redeem`'de alıcı kanıtı göndermiyordu. Kullanıcı kararı: **D'nin guard kuralları geçerli, A uyarlar.** Birleşmede: `VaultSigner.ts` D'nin sürümü (A'nın değişiklikleri onun alt kümesiydi); basket sabiti tek (`types.ts`) ve etiketler A'nınki (`id:`, `amt:`); guard, yanlış kapsamla imzalanmış `list`/`redeem` isteğine açık neden veriyor. Yeni test: A'nın `transferVaultCredits`'i gerçek guard'la (`redeem` + `creditPayees` geçiyor, kanıtsız ve P2PKH'ye "liste" reddediliyor, A'nın `listVaultCredits`'i D'nin kaydını okuyor). STATUS D → A.
