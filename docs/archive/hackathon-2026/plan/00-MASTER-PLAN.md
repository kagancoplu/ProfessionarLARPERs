# AgentCoop — Master Plan (v1)

> Source idea: [`FINAL-IDEA.md`](../FINAL-IDEA.md) (v1.1). This file describes **how we will build it**; it does not repeat the idea.
> The frontend is outside this plan (planned separately). Human flows are done for now with **Node CLIs** connected to BSV Desktop; the web UI wraps them later.

---

## 1. How to use this plan

- There are 5 parallel tracks: **A Protocol**, **B Overlay + Coordinator**, **C Provider + Agents**, **D Vault + Ops + Rail + Submission**, **E Frontend** (`apps/web`: consoles + the pixel-art "Town" live view; added 30.10). Each track has its own file: `plan/track-*.md`.
- Each track file is split into **phases**. The AI is given **only one phase at a time**; the whole file is not given as one prompt.
- At the start of each phase the AI reads these three: (1) §3 Interfaces and §4 Rules of this file, (2) [`STATUS.md`](STATUS.md), (3) the relevant phase in its own track file.
- At the end of each phase the AI follows the **Checkpoint** ritual (written at the end of each phase): is the plan still good, is there anything to change → if so update the plan; this phase is done → update STATUS; what did the other tracks do → read STATUS; is the dependency ready → if not, continue with a stub or write the blocker.
- **Single source of truth:** the interfaces are in this file (§3). If a track has to change an interface, it first updates this file, then announces it in STATUS.
- Technical reference: `docs/AGENTS.md` (rules), `docs/BSV_STACK_COMPLETE_GUIDE.md` (cited by § number), `docs/starter/bsv21-token-kit/` (tested code to copy).

---

## 2. Scope decisions (final)

| Decision | Result |
|---|---|
| Main scenario | **A simulated GPU provider.** Product: "H100 GPU-hour credit" (1 credit = 1 GPU-hour, consumed by the minute; C, 30.10). Pool: a GPU block. The jobs (fine-tune, eval, inference) are simulated, but payment, credits and settlement are real and on chain |
| SmartRoute | **Not** in the first stage. The provider layer is written so that "product = configuration"; SmartRoute can be plugged in later as a second provider |
| Mandate Vault | **Full scope** (K2) |
| Coop Rail | **Time-boxed PoC**: Base Sepolia, at most 4 hours, not in the live demo, documented with a recording. If it succeeds, "experimental" in the README |
| Market | Signed listings + a sweep in one transaction (A builder, B index, C agent behaviour) |
| Backstop underwriter | Only the `backstopMax` field in the terms; the behaviour is K3 |
| Network | **Mainnet** (BSVA gives sats). Development and tests on the mockchain, no sats needed |
| Agent "brain" | Decisions with an LLM (Anthropic API) + a deterministic fallback (`AGENT_BRAIN=rules`). Rules mode if there is no API key |
| Demo / video | Not planned now. Only the submission requirements (README, value note, tx links) in D's last phase |
| Adevar Labs | Later |

---

## 3. Interfaces (frozen at S0; a change = update this file first)

### 3.1 Repo layout (npm workspaces, Node ≥ 22, TypeScript, tsx, vitest)

```
/                         (existing repo root)
├─ package.json           workspaces: packages/*, apps/*, scripts
├─ tsconfig.base.json
├─ vitest.config.ts       the kit's @bsv/sdk CJS alias exactly (docs/starter/bsv21-token-kit/vitest.config.ts)
├─ AGENTS.md              a copy of docs/AGENTS.md
├─ .env.example           every variable (the real .env is git-ignored)
├─ plan/                  these files
├─ packages/
│  ├─ core/               [A] protocol: types, builders, signers, verifiers, scripts (vault/htlc)
│  └─ overlay/            [B] tm_agentcoop + ls_agentcoop + the kit's token rules
├─ apps/
│  ├─ coordinator/        [B] lock-in, signing round (WS), broadcast, side API (offers/listings/feed)
│  ├─ provider-api/       [C] simulated GPU provider: BRC-105 402, redeem/return, job runner
│  ├─ provider-cli/       [C] with BSV Desktop: mint, open-pool, cancel-pool, sweep-revenue
│  ├─ participant-cli/    [C] with BSV Desktop: a human pledge
│  ├─ agents/             [C] 3 agents + procurement router + orchestration
│  ├─ guard/              [D] vault policy engine and co-signer
│  ├─ owner-cli/          [D] with BSV Desktop: fund vault / policy / withdraw
│  └─ maker/              [D] Coop Rail PoC maker bot
├─ contracts/base-htlc/   [D] Solidity HTLC (PoC)
│  └─ web/             [E] frontend: React consoles + Phaser "Town" (browser → BSV Desktop; REST/WS/SSE with the services)
├─ scripts/               [D] keygen, fund, receive, balances, skeleton (A)
├─ data/                  (git-ignored) wallet sqlites, overlay db
└─ test/                  end-to-end mockchain scenarios (everyone adds)
```

**ESM/CJS rule:** wallet-toolbox is CJS. The SDK is imported **only through `@agentcoop/core/sdk`** (`packages/core/src/sdk.ts` re-exports the CJS build). In tests, the root `vitest.config.ts` alias points `@bsv/sdk` to the same CJS file. At runtime (tsx/Node), every app and script that uses wallet-toolbox is started with **`tsx --import @agentcoop/core/register-sdk <file>`**: a synchronous Node hook (`packages/core/register-sdk.mjs`, `module.registerHooks`) redirects every ESM import of the SDK's CJS entry (`sdk.ts`'s re-export or a bare `@bsv/sdk`) to an ESM wrapper whose export list is read at load time; the wrapper hands out the same copy that wallet-toolbox `require`s. The same wrapper exists for `knex` (the shared `test/helpers/mockchain.ts` does `import { knex }`, and the demos use this helper at runtime). *(C, 30.10: without the hook, under `tsx`, `import { Transaction } from '@agentcoop/core/sdk'` → `does not provide an export named 'Transaction'`, because Node cannot see the CJS build's named exports statically; it did not show in tests because of the vitest alias. With the hook, a single copy was verified.)* Error symptom: `script[serializedBytes] is not a function`.

> **Validation note (D, 2026-10-30 16:20; tsx 4.23 + Node 24, `@bsv/sdk` 3.2.1, wallet-toolbox 2.14.9).** (a) In a `"type":"module"` package under tsx, `import { PrivateKey } from '@bsv/sdk'` loads the ESM build and wallet-toolbox the CJS build: `PrivateKey === require('@bsv/sdk').PrivateKey` → **false** (two copies). (b) With tsconfig `paths`, `@bsv/sdk` → `dist/cjs/mod.js` is applied in tsx, but a **named** import from ESM fails (`does not provide an export named 'PrivateKey'`). So the method above does not work as is at tsx runtime. (c) **The working path:** a package that uses wallet-toolbox runs as **CommonJS** (no `"type"` in `package.json`; tsx turns imports into `require` → a single copy, **true**). For the type check, tsconfig `"module": "NodeNext", "moduleResolution": "NodeNext"` (both our code and wallet-toolbox see the `dist/cjs` types). `main().catch(…)` instead of top-level await. Example: `scripts/package.json`, `scripts/tsconfig.json`. In tests the kit's vitest alias works as is. A writes in STATUS which path it chose for `@agentcoop/core`.
>
> **Addendum (D, 2026-10-30 17:45, after A.P0 reached `main`; Node 22.22, tsx 4.23).** A's bridge `packages/core/src/sdk.ts` → `export * from '…/@bsv/sdk/dist/cjs/mod.js'` **works in vitest** (alias) but **not at tsx/Node runtime**: Node's ESM→CJS bridge (cjs-module-lexer) **cannot see 58** of the 186 exports of the SDK CJS build (`PrivateKey`, `PublicKey`, `Transaction`, `Script`, `LockingScript`, `P2PKH`, `WalletClient`, `CachedKeyDeriver`…). Symptom: `SyntaxError: The requested module '../sdk' does not provide an export named 'LockingScript'` (every `@agentcoop/core` user, A's `scripts/lineage-check.ts` included). **Tried fix:** removing `"type": "module"` from the root, `packages/core`, `scripts`, `apps/*` `package.json` files (CJS; tsx turns imports into `require`) loads core + guard + `verifyLineage`, and there is a **single** SDK copy in the process (`PrivateKey === require('@bsv/sdk').PrivateKey`); only scripts using top-level `await` (`lineage-check.ts`) must be turned into `main().catch(…)`. The decision is A's (STATUS → Blockers).
>
> **Addendum (D, 2026-10-30 18:20): solved — on Node 24.** A did not change `sdk.ts`; C's `register-sdk` hook (the rule above) is used. On **Node 24.22** the guard (`/healthz` 200, empty `/cosign` 400, unauthenticated `PUT` 401), owner-cli and `scripts/balances.ts` load with the hook; D's `npm run …` scripts add the hook. The hook error on Node 22.22 (`ERR_INVALID_RETURN_PROPERTY_VALUE`) was fixed by B's 20:00 fix (below); `scripts/lib/register-cjs.mjs` removed.
> **Addendum (B, 2026-10-30 20:00):** the hook now uses only `resolve` (the wrappers are files under `node_modules/.cache/agentcoop/`); it works on Node **22.22** too, and wraps `@bsv/sdk` and `knex`. `scripts/lib/register-cjs.mjs` removed.

### 3.2 Constants

| Name | Value | Note |
|---|---|---|
| OP_RETURN envelope | `OP_FALSE OP_RETURN "agentcoop" <op> <json>` | `op ∈ pool \| pledge \| settle \| list \| vault \| offer`; json UTF-8, all numbers **strings**. `offer { v, poolId, unlockingScriptHex }` (B.P6b): the provider's SINGLE\|ACP offer signature, on chain in a separate small tx; the terms and the locking script come from the pool record/tx. A reader verifies it with `verifyOffer` |
| Credit token | BSV-21, the kit's `TOKEN_PROTOCOL = [1,'bsv21 token']`, basket `bsv21` | The kit's `TokenKit` and `addresses.ts` are **copied**, not rewritten |
| Pledge coin key | protocol `[1,'agentcoop pledge']`, keyID = a random nonce, counterparty `'anyone'`, basket `agentcoop` | **Only one active pledge** in the basket at any time (to limit blind-signing damage) |
| Vault keys | protocol `[1,'agentcoop vault']`, keyID = vaultId, counterparty `'anyone'`, basket `agentcoop vault` | Owner (Desktop), agent and guard (wallet-toolbox). Anyone can compute the agent's and the guard's vault key with `new KeyDeriver('anyone').derivePublicKey(proto, vaultId, identityKey)` (= their own `getPublicKey(forSelf:true)`; verified in D.P1) |
| Vault script and record (D.P1) | `OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF` (109 B, hex `6321{o}ac675221{a}21{g}52ae68`). Unlock: owner `<sig> OP_1` (**75**), 2-of-2 `OP_0 <sigA> <sigG> OP_0` (**150**); sighash ALL\|FORKID, subscript = the whole script. Record: `OP_RETURN agentcoop vault {v:'1', vaultId (32 hex), owner, agent, guard}` (**identity keys**, all three distinct) | Funding tx: `out0` vault coin, `out1` record (`randomizeOutputs:false`). Validity for the overlay: the record is valid **and** the `out0` script = the script derived from the record. Vault coins without a record (change, vault pledge coins) are recognised by script equality. Details: `plan/phases/D-P1.md` §6, code `packages/core/src/scripts/vault.ts` |
| Provider revenue key | protocol `[1,'agentcoop provider']`, keyID = poolNonce, counterparty `'anyone'`, basket `agentcoop revenue` | Settlement output 0 and registration fees go here; moved to default with `sweep-revenue` |
| Rail keys (D.P3) | protocol `[1,'agentcoop rail']`, keyID = swapId (16 bytes hex), counterparty `'anyone'`; HTLC `htlcLockingScript(h, agentPub, guardPub, makerPub)` (FINAL-IDEA §4.10), h = `sha256(secret)`. Unlock: claim `OP_0 <sigA> <sigG> <secret> OP_1` (**183**), refund `OP_0 <sigM> <sigA> OP_0` (**150**); ALL\|FORKID | Funding and refund are **version 1**; refund `nLockTime = H + 6`, input `sequence = 0xfffffffe`. Base: `contracts/base-htlc/HTLC.sol` (sha256 hashlock). Code: `packages/core/src/scripts/htlc.ts`, `apps/maker`, details `plan/phases/D-P3.md` |
| Overlay names | topic `tm_agentcoop`, service `ls_agentcoop` (BRC-87: no digits) | The kit's rules for credit tokens in the same topic |
| Offer UTXO (A-P1) | the credit UTXO is moved to the `[1,'agentcoop provider']`, keyID `offer <poolNonce>`, `'anyone'` P2PKH; basket `agentcoop offers`; customInstructions `{ protocolID, keyID, counterparty, payKeyID: poolNonce, tokenId, credits }` | It does not stay at the token receive address → `TokenKit.sync/send` do not touch it. `payScriptHex` = P2PKH(`[1,'agentcoop provider']`, keyID = poolNonce). Pool OP_RETURN json = terms − `poolId` + `nonce` |
| Market keys (A-P2) | the listed credit `[1,'agentcoop market']` keyID `list <nonce>` P2PKH, basket `agentcoop listings`; the sale price keyID `pay <nonce>`; in the same tx `OP_RETURN list { v, tokenId, credits, askSats, seller }` | Same reason as the offer UTXO: TokenKit does not touch it |
| Outpoint format (A-P1) | `txid_vout` everywhere in AgentCoop data; `txid.vout` only in wallet calls (`toWalletOutpoint`) | |
| `pledgeListHash` (A-P1) | `sha256_hex(join(',', sort_lex(included outpoints)))` | The selection order is a separate rule (blockHeight, txid); the hash needs no chain information |
| Settlement change (A-P1) | After broadcast the participant takes its change into the `agentcoop` basket with `internalizeSettlement`, marked `change:true`, and `relinquishOutput`s the spent pledge coin | The "one active pledge" check does not count `change:true` outputs |
| Settlement sighash | the provider input `SIGHASH_SINGLE \| ANYONECANPAY \| FORKID`; participant inputs `SIGHASH_ALL \| FORKID` | The BIP-143 preimage contains the tx `version`, `lockTime` and the input's `sequence` under SINGLE\|ACP too: the offer is signed with `version=1`, `lockTime=0`, in0 `sequence=0xffffffff` and **the settlement must be built with these values**, otherwise the offer becomes invalid (B.P1). The coordinator's `verifyOffer` verifies with these values |
| Listing (market) sighash | seller `SINGLE \| ANYONECANPAY \| FORKID`; buyer `ALL \| FORKID` | The same primitive as the provider offer |
| Arcade | `https://arcade-v2-us-1.bsvblockchain.tech` | Broadcast (EF), tx status, headers `/chaintracks/v2` |
| Redeem limit | ≤ 20 credits at a time, ≤ 20 credits pending per agent | §4.7. In gpu-h100 1 credit = 1 GPU-hour, so pending ≤ 20 GPU-hours (≈ one fine-tune session). The pending balance is kept in minutes |
| Coordinator ordering | `(blockHeight asc, txid asc)`; unmined ones last by `txid asc` | OP_RETURN `settle.pledgeListHash = sha256(join(outpoints sorted))` |
| Over-fill / rounds | pledges accepted up to 120 % of the target; at most 3 signing rounds; round timeout 60 s | An outpoint that does not sign goes on the blacklist |

### 3.3 Types (`packages/core/src/types.ts`, written by A, imported by everyone)

```ts
export interface PoolTerms {
  v: '1'
  poolId: string              // the credit UTXO outpoint "txid_vout" (= the offer input). NOT in the pool
                              // json of the on-chain OP_RETURN (a tx cannot contain its own txid); the overlay derives it as `${txid}_0` (B.P1)
  provider: string            // provider identity key (the wallet that signs the offer)
  providerApi: string         // https://... provider-api root
  tokenId: string             // BSV-21 credit token id
  credits: string             // N, base units
  priceSats: string           // P, for the whole block
  payScriptHex: string        // the locking script of output 0 (provider revenue key P2PKH)
  feeSats: string             // non-refundable registration fee per pledge (to the same payScript)
  minCredits: string          // the fewest credits a pledge may take
  deadlineHeight: string      // block height
  backstopMax?: string        // Y (K3; information for now)
  label: string               // "8×H100 · 1 week"
  retailSatsPerCredit: string // information: retail price
}

export interface PledgeRecord {       // OP_RETURN op=pledge
  v: '1'; poolId: string; credits: string
  participant: string                 // identity key
  tokenIndex: string                  // the receive address index the credit output goes to (kit addresses.ts)
  signer: 'p2pkh' | 'vault'           // the type of the pledge coin → the coordinator knows unlockingScriptLength from this
  creditLock?: 'vault'                // A-P5 5.3, only with signer:'vault': in the settlement the credit output is locked to the pledge coin's vault script
                                      // (the on-chain record is authoritative: verifiers check the plan against it, the coordinator cannot choose)
  mode?: 'lighthouse'                 // A-P5 5.5, with signer:'vault': the person signs SINGLE|ACP once and goes offline; the guard co-signs ALL at settlement
  guard?: string                      // lighthouse: the guard the person chose (identity key)
  lhId?: string                       // lighthouse: keyID (32 hex). coin = lighthouseLockingScript({ participant, guard, lhId }); no change
}
// Pledge tx layout (randomizeOutputs:false): out0 = pledge coin, out1 = feeSats → payScript, out2 = OP_RETURN pledge
// Change rule: in the settlement the participant's change returns to the pledge coin's OWN locking script.

export interface Offer {              // the provider's pre-signed input (off-chain data)
  poolId: string                      // = outpoint
  unlockingScriptHex: string          // <sig SINGLE|ACP|FORKID> <pubkey>
  lockingScriptHex: string; satoshis: number
  terms: PoolTerms
}

export interface Listing {            // market (op=list OP_RETURN + an off-chain signature)
  outpoint: string; tokenId: string; credits: string; askSats: string
  seller: string; unlockingScriptHex: string; lockingScriptHex: string
  payScriptHex: string                // the seller's payment script (the output at the same index)
}

export interface SettlementPlan {     // produced by the coordinator, verified by participants
  poolId: string; round: number
  participants: Array<{ outpoint: string; participant: string; credits: string; signer: 'p2pkh'|'vault'; changeSats: string; creditLock?: 'vault'; mode?: 'lighthouse' }>
// A-P5 5.6: lighthouse participants come AFTER the interactive ones; outputs 1 + n + nInteractive + 1 (a lighthouse has no change, changeSats '0')
  pledgeListHash: string
  templateBEEF: number[]              // the unsigned tx + the source txs of all inputs (AtomicBEEF)
}

export interface InputSigner {        // defined by A; A: P2pkhWalletSigner, D: VaultSigner
  unlockingScriptLength: number
  sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript>
}
// VaultSigner (D, packages/core/src/signers/VaultSigner.ts): unlockingScriptLength = 150; EVERY input in `tx` must have its
// sourceTransaction (the guard computes the fee and the vault outflow from them). If the guard refuses, it throws CosignRejected { status, reason }.
// D.P2: in a settlement, new VaultSigner(wallet, { vaultId, cosign, plan, context: { kind:'settle', poolId, expectedCredits, tokenId } }) — the plan
// is sent, not the tx. A vault pledge: pledgeFromVault (A.3.1 layout); then internalizeVaultSettlement; hot wallet: topUpHotWallet.
```

### 3.4 Core function surface (A; signatures frozen, bodies evolve)

```ts
// scripts
buildOpReturn(op, json): LockingScript
parseOpReturn(script): { op, json } | null
vaultLockingScript(ownerPub, agentPub, guardPub): LockingScript        // D: packages/core/src/scripts/vault.ts (written in D.P1; stays in place when A's skeleton arrives)
htlcLockingScript(hash, agentPub, guardPub, makerPub): LockingScript     // filled by D

// offer / pledge / settlement
buildReserveAndAnnounce(wallet, kitTokenKit, terms): Promise<{ txid, poolId }>   // take N credits into one UTXO + OP_RETURN pool
signOffer(wallet, outpoint, terms): Promise<Offer>                                 // SINGLE|ACP
buildPledge(wallet, terms, credits, signer:'p2pkh'|'vault', vaultScript?): Promise<{ txid, outpoint }>
cancelPledge(wallet, outpoint): Promise<{ txid, beef }>                           // beef = AtomicBEEF; the caller submits it to tm_agentcoop (B.P1)
planSettlement(offer, pledges, chain): SettlementPlan                              // deterministic: the lexicographically first subset making exactly N in rule order; fee, change
verifySettlementPlan(plan, offer, myOutpoint, opts): Promise<void>                 // DvP check + verifyLineage; throws on error
signSettlementInput(plan, inputIndex, signer: InputSigner): Promise<UnlockingScript>
assembleSettlement(plan, unlockingScripts): Transaction
broadcastEF(tx, arcadeUrl): Promise<string>

// market
signListing(wallet, outpoint, askSats): Promise<Listing>
buildSweep(wallet, listings[]): Promise<{ plan }>                                  // buyer side

// verification
verifyLineage(outpoint, { arcadeUrl, wocUrl }): Promise<{ ok, tokenId, amt, ownerPkh }>  // fetch the ancestors, apply rules.ts locally

// signers
new P2pkhWalletSigner(wallet, { protocolID, keyID })

// A-P1 additions (not breaking; full signatures in packages/core/src/pool/*.ts)
verifyOffer(offer, { sourceTx }): void                                             // offline: credit amount/token, the SINGLE|ACP signature with Spend
planTransaction(plan): Transaction                                                  // templateBEEF → tx
internalizeSettlement(wallet, tx, plan, myOutpoint, pledgeInstructions): Promise<void>
fetchChainPolicy(arcadeUrl): Promise<{ height, satsPerKb, maxTxSize? }>            // Arcade /health; planSettlement's `chain`
// A-P2: verification and market (MASTER's `buildSweep(wallet, listings[]): { plan }` CHANGED to this; nobody used it yet)
verifyLineage(outpoint, { fetchTx?, arcadeUrl?, wocUrl?, maxDepth?, cache?, ownerKinds? }): Promise<{ ok, tokenId?, amt?: bigint, ownerPkh?, owner?: CreditOwner, depth, reason? }>
// A-P5 (vault-locked credits, scripts/creditLock.ts; additions only):
//   buildVaultCreditScript(insc, vaultScript): LockingScript       // BSV-21 envelope + vault script (instead of P2PKH)
//   decodeBsv21Owned(script): { ...Bsv21Inscription, amount, owner: { kind:'p2pkh', pkh } | { kind:'vault', vaultScriptHex, vaultHash } } | null
//   vaultKeysOfScript(script): VaultKeys | null                       // a plain vault output or a vault-locked credit
//   identifyAdmissible(tx, prev, { ownerKinds?: ['p2pkh'] | ['p2pkh','vault'] })   // default = the kit, exactly
//   creditLockOf(record), creditScriptFor(tokenId, candidate), pledgeRecordOf(pledgeTx)
//   buildPledge(…,'vault', …, { vault: { …, creditLock?: 'vault' } }) · pledgeFromVault({ …, creditLock?: 'vault' })
// A-P5 5.4 (vault/creditSpend.ts): basket 'agentcoop vault credits'
//   internalizeVaultCredits(wallet, settlementTx, plan, myOutpoint, vaultId) → VaultCredit { outpoint, tokenId, amt, lockingScriptHex, beef }
//   listVaultCredits(wallet, vaultId, tokenId?) → VaultCredit[]
//   transferVaultCredits(wallet, { vaultId, credit, amt, toPkh, kind: 'redeem', cosign, context? }) → { txid, beef, rest? }   // redeem: context.creditPayees; 'list' is refused at the guard
//   signVaultCreditListing(wallet, { vaultId, credit, askSats, cosign }) → Listing   // 31.10: the vault credit UTXO SINGLE|ACP (agent + guard 'list'), payScriptHex = the vault script; verifyListing/buildSweep accept a vault-locked listing
//   TokenKit.sendToVault(tokenId, amount, vaultScriptHex) → { txid }   // 31.10: provider-api, returning a credit redeemed from a vault to the vault script
//     out0 amt → toPkh (P2PKH), out1 the rest → the same vault script; input 0 agent + guard (VaultSigner, CosignKind += 'redeem'|'list')
// A-P5 Lighthouse (pool/lighthouse.ts, scripts/lighthouse.ts):
//   buildLighthousePledge(wallet, terms, credits, { tokenIndex, guard, feeSats? }) → LighthousePledge
//     { outpoint, record, satoshis, humanSignatureHex (DER‖0xc3), creditLockingScriptHex, beef }   // off chain; to the coordinator
//   verifyLighthousePledge(lp, { sourceTx, tokenId }) → record           // at the coordinator on POST, at the guard before signing
//   cosignLighthouse(guardWallet, { plan, offer, inputIndex, pledge, lineage?, maxFeeSats? }) → UnlockingScript   // the guard side
//   cancelLighthousePledge(wallet, outpoint) → { txid, beef }            // the person alone, with a separate 'withdraw <lhId>' key
//   lighthouseLockingScript({ participant, guard, lhId }) = OP_IF <person withdraw> CHECKSIG ELSE 2 <person lhId> <guard lhId> 2 CHECKMULTISIG ENDIF
reserveListing(wallet, kit, tokenId, credits, askSats): Promise<{ txid, outpoint, beef }>   // before signListing
signListing(wallet, outpoint, askSats): Promise<Listing> · verifyListing(listing, { sourceTx }): void
buildSweep(wallet, kit, listings[], { verifyLineage?=true, lineage?, getBeef? }): Promise<{ txid, credits, tx }>
cancelListing(wallet, kit, outpoint) · cancelPool(wallet, kit, poolId) · reclaimReserved(wallet, kit, outpoint, basket)
// B.P6b (additions only, packages/core/src/pool/offerRecord.ts): publish the offer on chain → submit to tm_agentcoop; other coordinators find it
publishOffer(wallet, offer, originator?): Promise<{ txid, beef }> · offerFromRecord(record, terms, poolTx): Offer · offerRecordOf(offer)
// error codes (AgentCoopError.code): BAD_OP_RETURN, BAD_TERMS, BAD_OFFER, BAD_PLEDGE, BAD_PLAN, BAD_SIGNATURE, BAD_LISTING, LINEAGE_FAILED, DEADLINE_PASSED
// parameter shapes: buildPledge(..., opts: { tokenIndex, originator?, bufferSats?, allowMultiple? })
//   signer 'vault' (A.3.1): opts.vault: { vaultId, utxo: VaultUtxo, cosign: Cosigner, poolBEEF? } required; if vaultScript is given it must be the utxo's script.
//   Delegates to D's pledgeFromVault → VaultPledge { txid, outpoint, record, satoshis, beef, instructions: VaultPledgeInstructions }
//   planSettlement(offer, PledgeCandidate[], { height, satsPerKb, offerSourceTx }, { round?, exclude? })
//   verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, expectedCreditPkh?, maxFeeSats?, verifyLineage? })
```

### 3.5 Coordinator / side API (B) — `COOP_API_URL`

| Method | Path | What it does |
|---|---|---|
| `POST` | `/offers` | Store an `Offer` (called by the provider CLI). Verifies: the outpoint is unspent, the signature is valid |
| `GET` | `/offers/:poolId` | Get an offer |
| `GET` | `/pools` · `/pools/:poolId` | Terms + progress (`pledgedCredits`, `target`, `status: open\|locking\|settled\|failed\|cancelled`, `hasOffer`). `cancelled` = the credit UTXO was spent by a tx other than the settlement. `failed` and `locking` are derived in the side API (height / coordinator round); the overlay knows only `open\|settled\|cancelled` |
| `GET` | `/pools/:poolId/pledges` | Unspent pledges (from the overlay) |
| `POST` | `/pledges/lighthouse` **(A-P5, B-A5 ✅)** | Body `LighthousePledge` (`beef` = the AtomicBEEF bytes of the pledge tx; if the tx is already on the overlay, `beef` may be omitted and the coordinator reads it from `record.poolId`'s pledges, otherwise `404 LIGHTHOUSE_NOT_ON_OVERLAY`). The coordinator checks `verifyLighthousePledge(lp, { sourceTx, tokenId })` (the record **from the chain**), the pool is `open`, `minCredits ≤ credits ≤ N`, and whether it can reach the `guard` in the record (`LIGHTHOUSE_GUARDS` URLs, identity from `GET /healthz`); it submits the tx to the overlay and stores it → `201 { outpoint, poolId, guard, accepted }`; errors `400 LIGHTHOUSE_INVALID_FORMAT`, `404 POOL_NOT_FOUND`, `409 POOL_NOT_OPEN`, `422 LIGHTHOUSE_INVALID \| GUARD_UNKNOWN`. In a round a `mode:'lighthouse'` input goes not to WS but to the `guard` in its record (`lighthouseCosign` → `/cosign kind:'lighthouse'`); the full unlock that comes back is verified in the template; a refusal/unreachable = failed for that round (blacklist reason `guard: …`). A lighthouse pledge not given to the coordinator does not enter the plan (nobody to sign) |
| (addition) | `coordinator` in the `/pools/:poolId` response | If the pool had rounds: `{ round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome: 'settled'\|'failed', missing, txid? } }` (B.P2). `GET /healthz` → `engine: true\|false` |
| `POST` | `/listings` · `GET /listings?tokenId=` | Market listings. `POST` verifies against the chain (the outpoint is a credit output admitted by the overlay and unspent; `tokenId`/`credits` match; the signature is `0xC3` and input ↔ the output at the same index = `askSats → payScriptHex`). `GET` returns only those still unspent, cheapest (`askSats/credits`) first (B.P3) |
| `GET` | `/pools/:poolId/audit` | (B.P6a) Audit of a settled pool, recomputed from the chain: `{ poolId, settlement: { txid, round, pledgeListHash, termsHash }, included[], checks: { hashMatches, termsHashMatches, providerPaid, creditsDelivered, allIncludedValid, selectionMatches }, skippedEarlier: [{ outpoint, participant, credits, reason }], verdict: 'consistent'\|'inconsistent'\|'unexplained-skips' }`. Blacklist reasons are the coordinator's declaration; the selection is checked by rerunning A's `planSettlement` with that declaration. `409 NOT_SETTLED` if not settled |
| `GET` | `/metrics` (`?format=prom`) | (B.P6a) Numbers computed from the overlay: pool/pledge states, settlement count, participants (total/average/largest), average fee and size, round count, **`custodiedSats`** (every settlement output must fall into one of the classes provider payment / participant's credit / participant's change / OP_RETURN; the total of those that do not) and `custodyCheck` |
| `GET` | `/healthz` | (B.P5a) `{ ok, overlay, height, arcade, engine, openPools, ws: { clients, proven }, uptimeS }`. On the overlay, `GET /agentcoop/healthz` → `{ ok, db, lastEventAt, sseClients, uptimeS }`. A rate-limit hit everywhere is `429 { code: 'RATE_LIMITED' }` + `Retry-After` |
| `WS` | `/ws` | Participant session and live feed |

**WS messages** (JSON, `type` field):
- `challenge { nonce }` (server, when the connection opens; per connection) (B.P5a)
- `hello { identity, poolIds[], sig }` → the participant registers (to be called into signing rounds). `sig` = `createSignature({ data: utf8("agentcoop hello\n" + host + "\n" + nonce), protocolID: [1,'agentcoop hello'], keyID: '1', counterparty: 'anyone' })` DER hex; `host` = the host of the URL connected to. Answer `hello_ack { identity, poolIds, proven }`. A hello without `sig` only watches: it receives no `sign_request`, and its `sign_response`/`sign_reject` are refused. Client: `connectCoordinator(url, wallet, { poolIds, onMessage })` (`@agentcoop/coordinator/client`) (B.P5a)
- `pool_update { poolId, pledgedCredits, status }` (to everyone)
- `sign_request { poolId, round, plan: SettlementPlan, yourInputIndex }`
- `sign_response { poolId, round, inputIndex, unlockingScriptHex }` | `sign_reject { poolId, round, reason }`
- `settled { poolId, txid }` · `round_failed { poolId, round, missing: outpoint[] }` · `pool_failed { poolId }`

### 3.6 Provider API (C) — BRC-105 (`@bsv/auth-express-middleware` + `@bsv/payment-express-middleware`)

| Method | Path | Price | What it does |
|---|---|---|---|
| `GET` | `/healthz` | 0 (no auth) | liveness |
| `GET` | `/v1/catalog` | 0 | `provider.server`, products (`retailSatsPerCredit`, `minutesPerCredit`, `tokenId`), `credits: { maxRedeem, maxPending, redeemTo }` (`redeemTo` = the provider-api identity, where credits are sent), open pools (from COOP_API) |
| `POST` | `/v1/jobs` GPU: `{ kind, minutes, product? }` · proxy: `{ product, kind, mb }` | `ceil(units × retailSatsPerCredit / unitsPerCredit)` sat (per unit); **0** if the prepaid balance covers `units` (debited from the balance). Without `product`, the first GPU product | queue the simulated job; `{ jobId, payment }`. A credit payment `{ method:'credits', units, minutes? (GPU only), tokenId }`; the job record has `units`, `unit`, and `minutes` for GPU |
| `GET` | `/v1/jobs/:id` | 0 | status, "GPU log", result hash |
| `POST` | `/v1/credits/redeem` `{ beef, outputIndex }` | 0 (auth required) | Verify the BSV-21 transfer: the product's token, the output locked to one of provider-api's token addresses, ≤ 20 credits and pending ≤ 20, **sender = caller** (the tx spends the caller's own token outputs; nobody else can claim a transfer it saw on the overlay), lineage (`verifyLineage`; the overlay until A.P2), single use. Take it into the `bsv21` basket, write it to the balance. Error codes: `ERR_WRONG_TOKEN`, `ERR_NOT_OURS`, `ERR_REDEEM_LIMIT`, `ERR_NOT_SENDER` (403), `ERR_BAD_LINEAGE`, `ERR_REDEEM_REPLAYED` (409) |
| `POST` | `/v1/credits/return` `{ credits, product? }` | 0 (auth) | send unused **whole** credits back as tokens (kit `TokenKit.send`); a remainder smaller than one credit stays prepaid. `{ txid, credits, prepaidMinutes }` |
| `GET` | `/v1/credits/balance` | 0 (auth) | prepaid balance: per product `{ unit, unitsPerCredit, prepaidUnits, returnableCredits }` + `minutesPerCredit`, `prepaidMinutes` for GPU products. Redeem/return responses `prepaidUnits` (+ `prepaidMinutes` for GPU) |

Product configuration `apps/provider-api/products/<id>.json`: `{ id, label, unit, runner?, retailSatsPerCredit, minutesPerCredit? | unitsPerCredit?, demoPricing?, tokenId, simulate: { minutesPerSecond? | unitsPerSecond?, gpus? | slots? } }`. The **runner** (`apps/provider-api/src/runners.ts`) defines the job kinds, the quantity field (`minutes` / `mb`), the upper limit and the simulation: `gpu` (finetune/eval/inference, minutes) and `proxy` (crawl/scrape, MB). Products: **gpu-h100** (1 credit = 1 GPU-hour = 60 min, 50 sat) and **data-proxy** (1 credit = 1 GB = 1024 MB, 40 sat). In the catalogue each product carries `runner`, `kinds`, `quantityField`, `unitsPerCredit`. A new product = a new JSON; a new job kind = a new runner. SmartRoute later becomes a separate runner.

### 3.7 Guard API (D) — `GUARD_URL`

| Method | Path | What it does |
|---|---|---|
| `PUT` | `/vaults/:vaultId` **(D.P1 addition)** | owner registration (BRC-103 AuthFetch, identity = `owner`): body = the vault record `{ v:'1', vaultId, owner, agent, guard }`. The guard derives the script itself → `{ vaultId, lockingScriptHex, guardPub }`; the owner CLI does not fund if they differ. The same vaultId with other keys → 409 |
| `PUT` | `/policies/:agentIdentity` | written by the owner CLI: `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats, minAskSatsPerCredit? }` (numbers in sat, integers; with the owner's signature, BRC-103 AuthFetch). **(D-P2b)** `minAskSatsPerCredit` optional: the floor price for listing vault credits; without it, listing is off. **Written to the (owner, agent) pair**; 404 if the owner has no registered vault with that agent |
| `GET` | `/vaults/:vaultId` **(D.P1 addition)** | owner or agent (BRC-103): record, script, policy, spent in the last 7 days (`spentLast7dSats`), **(D.P2)** hot wallet in the last 24 h (`hotLast24hSats`) |
| `POST` | `/cosign` `{ txBEEF? \| plan?, inputIndex, agent, agentSignatureHex, context: { kind: 'settle'\|'pay'\|'rail'\|'redeem'\|'list', poolId?, expectedCredits?, tokenId?, payees?: [{ vout, provider, keyID }], poolBEEF?, hotWallet?: [{ vout, derivationPrefix, derivationSuffix }], creditPayees?: [{ vout, provider, index }] } }` | checks the policy and DvP → `{ signatureHex, guardPub }` or `403 { reason }` / `400 { reason }`. **(D-P2b, vault-locked credits, A 5.4):** `redeem` (ALL): input = this agent's vault credit; the credit outputs go either to an allowed provider proven by `creditPayees` (`ownerPkh = receivePkh(provider, index)`) or locked to the same vault; Σ credits preserved (no burning); a redeem without payees = a split inside the vault. `list` (**SINGLE\|ANYONECANPAY\|FORKID, 0xC3**: the agent's and the guard's signatures in this scope): input `i` a vault credit, output `i` = **the vault script** ≥ credits × `minAskSatsPerCredit`; the skeleton input carries an empty unlocking script (serialisation). Credit basket `agentcoop vault credits` (`adoptVaultCredits`, `listVaultCredits`). **(D.P1 additions:)** `agentSignatureHex` = the agent's signature on the same sighash (the guard computes the sighash **itself** and verifies this first); signatures in checksig format (DER ‖ `0x41`), hex; `txBEEF` AtomicBEEF (`number[]` or hex), with every input's source; `payees` = the payee proof of the payment outputs (the guard recomputes `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))`). One input per vault per tx; the tx must be final (lockTime 0). Check list: `plan/phases/D-P1.md` §7.2. **(D.P2 additions, `plan/phases/D-P2.md` §6–7:)** **`kind:'settle'`** → **`plan` (SettlementPlan) required, `txBEEF` not sent/ignored**: the guard builds the tx itself with `planTransaction(plan)`; `context.poolId` required (= `plan.poolId`), `expectedCredits`/`tokenId` only as a cross-check; terms + `nonce` from the `pool` record in input 0's source tx, the expected credits from the `pledge` record in the pledge coin's source tx (`participant` = agent, `signer:'vault'`); provider ∈ allowlist, `payScriptHex` = the provider's revenue key, the offer UTXO on the provider's `offer <nonce>` key; A's `verifySettlementPlan(…, { expectedCredits, expectedCreditPkh: receivePkh(agent, tokenIndex), maxFeeSats, verifyLineage: true })`; per-pool + weekly cap. **`kind:'pay'` + an `agentcoop pledge` record** (A.3.1 layout: out0 pledge coin = the vault script, out1 fee → `payScriptHex`, out2 record) → at pledge time the same provider proofs + `verifyLineage(poolId)` (cached), fee + coin ≤ `maxPerPoolSats`, the coin reserved against the weekly cap; the pool tx from `poolBEEF` (AtomicBEEF/BEEF/raw, verified by txid) or the guard fetches it from Arcade. **`hotWallet`** → output = `P2PKH(KeyDeriver('anyone').derivePublicKey([2,'3241645161d8'], '<prefix> <suffix>', vault.agent))` (BRC-29, sender `'anyone'`; the agent takes it with `internalizeAction` `senderIdentityKey` = `1·G`), rolling 24 h `hotWalletDailySats`. **`kind:'rail'` (D.P3):** `txBEEF` + `context.swapId`; the input must be an HTLC carrying the `swapId` keys of the guard and the requesting agent, the tx final, the HTLC amount (minus the miner fee) lands on the agent's **registered vault script**, fee ≤ `maxFeeSats`; since it is an inflow it does not count against the cap; the guard signs with its rail key (`guardPub` in the answer) |
| `POST` | `/cosign` `kind:'lighthouse'` **(A-P5 request, D ✅ D-P2c)** | `{ context: { kind: 'lighthouse' }, plan, inputIndex, pledge: LighthousePledge }` → the guard builds the offer **from the plan's input 0** (an `offer` in the request is not used), A's `cosignLighthouse(guardWallet, …)` (the record's guard = me, the pool matches, `verifySettlementPlan` + `verifyLineage`, the person's signature valid for this plan) → `{ unlockingScriptHex }` (person + guard, the full unlock) or `403/400 { reason }`. No vault record/policy needed (the guard the person chose). Client: `lighthouseCosign(guardUrl, { plan, inputIndex, pledge })` (`@agentcoop/core/signers/VaultSigner`) |
| `POST` | `/cosign` `kind:'redeem'\|'list'` **(A-P5 5.4 request; D ✅ D-P2b, user decision 30.10: D's rules apply)** | A's `transferVaultCredits` and D's guard with the same rules: **`redeem`** (ALL) the credit outputs go either to an allowed provider proven by `context.creditPayees: [{ vout, provider, index }]` (`receivePkh(provider, index)`) or locked to the same vault; an unproven P2PKH (the agent's own key included) is refused. **`list`**: the credit is **not moved** to one of the agent's keys (that would bypass the guard); the listing is a SINGLE\|ACP (0xC3) signature on the vault credit itself, output `i` = the vault script ≥ credits × `minAskSatsPerCredit`. Basket `agentcoop vault credits`, tags `vault:<id>`, `id:<tokenId>`, `amt:<n>` |
| `GET` | `/healthz` | `{ ok, identityKey, network }` |
| `GET` | `/policies/:agentIdentity` **(for E; D.P2 ✅)** | owner or agent (BRC-103): `{ owner, agent, policy, updatedAt }` (the agent gets the latest one written for it); 404 if none |
| `GET` | `/decisions?agent=&limit=` **(for E; D.P2 ✅)** | the agent itself or the owner of one of the agent's vaults (BRC-103): `{ agent, decisions: [{ id, ts, agent, vaultId?, kind, poolId?, sats?, outcome: 'approved'\|'denied', reason? }] }` newest → oldest, ≤ 500 (`data/guard/decisions.jsonl`). No `txid`: at signing time the guard does not know the tx's final txid (the other inputs are not signed yet). `kind`: `pay`, `pay/pledge`, `pay/hot`, `settle` |
| `GET` | `/events` **(for E; D.P2 ✅)** | SSE, the MASTER §3.10 envelope (`src:'guard'`): `cosign_approved { agent, vaultId, kind, poolId?, sats, paidSats, feeSats, committedSats?, hotSats? }`, `cosign_denied { agent, vaultId?, kind, poolId?, reason }`, `policy_updated { agent, owner }`, `vault_registered { vaultId, owner, agent }`; `vault_paused`/`vault_resumed` Phase 5B. Readable without identity: identity keys are public, amounts included, no secrets; the last 500 events, resume with `Last-Event-ID`, `: keepalive` every 15 s. CORS: `GUARD_CORS_ORIGIN` (default `*`), the `x-bsv-auth-*` headers are exposed |

### 3.8 Overlay lookup (B) — `POST /lookup { service:'ls_agentcoop', query }`

`{ op:'pools', status? }`, `{ op:'pool', poolId }`, `{ op:'pledges', poolId, includeSpent?, includeInvalid? }`, `{ op:'settlement', poolId }`, `{ op:'listings', tokenId? }`, `{ op:'vaults', owner? }`, `{ op:'vaultCredits', vaultHash, tokenId?, includeSpent? }` (B-A5) + the kit's token queries (`identity`, `utxos`, `token`, `outpoint`, `history`).

**Credit owners (B-A5, A-P5 5.3/5.4):** `tm_agentcoop` runs the kit rules with `ownerKinds: ['p2pkh','vault']`: a BSV-21 output locked to a Mandate Vault script (`buildVaultCreditScript`) is a token just like a P2PKH one (admitted, counted as an input). Token output context: `{ tokenId, op, amt, ownerPkh, ownerVaultHash?, spent, … }`; if vault-locked, `ownerPkh: ''` and `ownerVaultHash = vaultScriptHash(vault script)` (sha256 hex). `vaultCredits` finds a vault's credits by this hash (it does not mix with the vault's sat balance).

The `context` of each output in the answer (UTF-8 JSON, B.P1):
- `pools`/`pool` → `{ poolId, txid, terms, status: open|settled|cancelled, pledgedCredits, pledgeCount, target, settledTxid?, spendingTxid?, createdHeight?, invalidReason? }` (output = the pool's OP_RETURN record)
- `pledges` → `{ outpoint, txid, vout, poolId, participant, credits, tokenIndex, signer, creditLock?, mode?, guard?, lhId?, coinSats, height?, spent, spendingTxid?, valid, invalidReason? }` (A-P5 fields from the record; structural rule: `creditLock:'vault'` only with `signer:'vault'` and without `mode`; `mode:'lighthouse'` requires `signer:'vault'` + a `guard` identity key + a 32-hex `lhId`; `guard`/`lhId` cannot appear without `mode`; any other record is not admitted) (output = the pledge coin; order `height` asc, unmined last, then `txid`)
- `settlement` → `{ poolId, txid, pledgeListHash, inputs: outpoint[] }`

**Pledge validity rule** (at query time; `buildPledge` must follow it): the pool exists and is `open`; `minCredits ≤ credits ≤ credits(N)`; `out1.satoshis ≥ feeSats` and `out1.lockingScript = payScriptHex`; `out0.satoshis ≥ ceil(credits × priceSats / N) + 1`. `pledgedCredits` = the sum of `credits` of valid, unspent pledges.

**Record indexing:** `agentcoop` OP_RETURN record outputs (0 sat) are **admitted** to the topic (because lookup answers resolve to stored outputs). A settle record is valid only if `in0 = poolId`.

**Vaults (B.P3):** the output of a `vault` record and **every** output matching the vault template (`OP_IF <33> OP_CHECKSIG OP_ELSE OP_2 <33> <33> OP_2 OP_CHECKMULTISIG OP_ENDIF`, change without a record included) are admitted; they are joined by script hex. `{ op:'vaults', owner?, includeUnverified? }` / `{ op:'vault', vaultId }` → `{ vaultId, owner, agent, guard, scriptHex, verified, balanceSats, utxos: [{ outpoint, satoshis }] }`. `verified` = the script in the record equals the script recomputed with the keys derived from the `owner/agent/guard` identities with `[1,'agentcoop vault']`, keyID = `vaultId`, `'anyone'`. Unverified records are not shown by default. **D:** the funding tx must carry this record; the script as in D 1.1.
`{ op:'listings', tokenId? }` → the optional on-chain `OP_RETURN list` records (raw). The authoritative listing book is the coordinator's `GET /listings`.
`{ op:'offers', poolId }` (B.P6b) → offer records published on chain, oldest to newest: `{ txid, v, poolId, unlockingScriptHex }`. Unverified (anyone can publish); the coordinator tries each with `offerFromRecord` + `verifyOffer` and uses the first valid one.

**Event stream (B.P3):** overlay `GET /agentcoop/events` (SSE) → on every admit/spend `data: { type: 'admitted'|'spent', txid }`. The coordinator and the UI can subscribe for live updates.

### 3.9 Environment variables (`.env.example`, managed by D)

```
NETWORK=main
ARCADE_URL=https://arcade-v2-us-1.bsvblockchain.tech
OVERLAY_URL=http://localhost:8080
COOP_API_URL=http://localhost:8090
GUARD_URL=http://localhost:8091
PROVIDER_API_URL=http://localhost:8092
# server wallets (64 hex; produced by scripts/keygen.ts; NEVER commit)
WALLET_PROVIDER_API_KEY=   WALLET_COORDINATOR_KEY=   WALLET_GUARD_KEY=
WALLET_AGENT_1_KEY=  WALLET_AGENT_2_KEY=  WALLET_AGENT_3_KEY=  WALLET_MAKER_KEY=
# overlay + coordinator (B; infra/run.mjs) — added in D.P1
OVERLAY_PORT=8080  COOP_PORT=8090  OVERLAY_PRIVATE_KEY=(secret, if empty data/overlay/overlay.key)  TOKEN_WHITELIST=
ROUND_TIMEOUT_MS=60000  MAX_ROUNDS=3  SPENT_CHECK=woc|none  DATA_DIR=(optional; infra/run.mjs and core/node/env, D's scripts always <repo>/data)
# guard (D.P2): CORS origin for the browser console
GUARD_CORS_ORIGIN=*
# originator for the CLIs that connect to Desktop
APP_ORIGINATOR=agentcoop.local
# agent brain
ANTHROPIC_API_KEY=   AGENT_BRAIN=llm|rules
# Rail PoC
BASE_RPC_URL=  BASE_PRIVATE_KEY=(maker)  BASE_AGENT_PRIVATE_KEY=  BASE_USDC_ADDRESS=  BASE_HTLC_ADDRESS=  MAKER_URL=http://localhost:8094  RAIL_SATS_PER_USDC=   # D.P3
# agent event stream (C; §3.10)
AGENTS_URL=http://localhost:8093
# frontend (E, apps/web; Vite build time; URLs only, no secrets)
VITE_COOP_API_URL=  VITE_OVERLAY_URL=  VITE_PROVIDER_API_URL=  VITE_GUARD_URL=  VITE_AGENTS_URL=  VITE_ARCADE_URL=  VITE_NETWORK=main  VITE_DATA_MODE=live|mock|replay
```

### 3.10 Frontend event streams and browser rules (E; added 30.10)

**Browser rule.** `apps/web` runs in the browser and contains no wallet-toolbox; it uses the **ESM** build of `@bsv/sdk` (a single copy). The `@agentcoop/core` **index** must stay browser-safe (`node:*` and wallet-toolbox imports only under `@agentcoop/core/node/*`). Because `packages/core/src/sdk.ts` re-exports the CJS path, the web redirects `/@bsv\/sdk\/dist\/cjs\/mod\.js$/` → `@bsv/sdk` with Vite `resolve.alias` (if that is not enough, A adds a `"browser"` condition to `exports`). Every signature is in the user's **BSV Desktop** (`WalletClient('auto')`, originator = the page origin); a private key is never in the browser. Locally the Vite proxy bypasses CORS; when published, the overlay/coordinator (B Phase 5.3), provider-api (C) and guard (D) give CORS; provider-api and the guard also expose the BRC-103/105 headers (`Access-Control-Expose-Headers: x-bsv-auth-*, x-bsv-payment-*`; guide §10.5).

**Event envelope** (`CoopEvent`; each source's adapter produces it; a replay file is its JSONL):

```ts
export interface CoopEvent<T extends string = string, D = unknown> {
  id: string          // increasing within the source ("coordinator:1042") or a ulid; the same as SSE `id:`
  ts: string          // ISO-8601
  src: 'coordinator' | 'overlay' | 'provider' | 'agents' | 'guard' | 'maker' | 'web'
  type: T
  data: D
  txid?: string; poolId?: string; agent?: string   // identity key; for filtering
}
```

SSE format (the same for every source): `id: <id>\ndata: <CoopEvent json>\n\n`; `: keepalive` every 15 s; resume with `Last-Event-ID` (the source keeps at least the last 500 events). Existing sources may stay without the envelope (coordinator WS messages, overlay `{ type, txid }`); the web adapter wraps them. **New** streams (agents, guard, provider, maker) produce the envelope directly.

| Source | Path | Event types (`type`) → `data` | State |
|---|---|---|---|
| coordinator (B) | WS `/ws` | `pool_update`, `sign_request`, `settled`, `round_failed`, `pool_failed`, `hello_ack`, `error` (§3.5) | exists |
| overlay (B) | SSE `/agentcoop/events` | `admitted { txid }`, `spent { txid }` (§3.8). The web derives from these: `pool_opened`, `pledge_added`, `pledge_cancelled`, `pool_settled`, `pool_cancelled`, `listing_added`, `listing_filled`, `listing_cancelled`, `vault_funded`, `vault_spent` | exists |
| agents (C) | SSE `{AGENTS_URL}/events`, `GET {AGENTS_URL}/agents` | `agent_started { name, profile, identity }`, `agent_thought { text }`, `agent_decision { action: 'pledge'\|'skip'\|'redeem'\|'retail'\|'list'\|'buy'\|'sign'\|'reject', poolId?, credits?, sats?, reason }`, `agent_job { jobId, kind, minutes, status }`, `agent_payment { kind: '402'\|'pledge'\|'redeem'\|'sweep', txid, sats? }`, `agent_injected { text }` (demo-injection). `GET /agents` → `[{ name, profile, identity, mode: 'p2pkh'\|'vault', vaultId? }]`, `GET /healthz` | ✅ C (`apps/agents/src/events.ts`; `npm run agents` :8093, CORS open, the last 500 events, `Last-Event-ID`). `agent_injected` comes with Phase 3.2 |
| guard (D) | SSE `{GUARD_URL}/events` | `cosign_approved { agent, vaultId, kind, poolId?, sats, txid? }`, `cosign_denied { agent, vaultId, kind, poolId?, sats?, reason }`, `policy_updated { agent }`, `vault_registered { vaultId, owner, agent }`, `vault_paused { agent }` | ✅ D.P2 (`vault_paused` Phase 5B) |
| provider (C, optional) | SSE `/v1/events` | `job_queued`/`job_running`/`job_done { jobId, owner, kind, minutes, resultHash? }`, `credits_redeemed { agent, credits, txid }`, `payment_received { txid, sats, owner }` | low priority; fallback `GET /v1/jobs/:id` poll |
| maker (D, Rail) | SSE `{MAKER_URL}/events`, `GET /quote?dir=&amount=` | `rail_quote`, `rail_locked_base { txHash }`, `rail_funded_bsv { txid }`, `rail_claimed { txid, txHash }`, `rail_refunded` | ✅ D.P3: `GET /quote?dir=usdc-bsv&amount=<USDC base units>` → `{ usdc, sats, satsPerUsdc, spreadBps, expiresAt, maker: { evm, bsv }, htlc, token, terms }`, `GET /events` (only `rail_quote` for now; the other types in a live swap), `/healthz`; `MAKER_URL` (8094) |

**Replay file:** `apps/web/public/replays/<name>.jsonl`, one `CoopEvent` per line; `apps/web/tools/record.mjs` subscribes to every source and writes it. Real mainnet runs are recorded and committed (the txids are real).

---

## 4. Rules (for everyone)

1. The `docs/AGENTS.md` rules apply as written. In particular: `randomizeOutputs:false`; find the output index by script; never `P2PKH(identityKey)`; tokens and pledges never in the `default` basket; in BRC-29 the counterparty is the other party; in 402, the official middleware, no invented headers.
2. **Copy from the kit, do not rewrite:** `TokenKit`, `OverlayClient`, `signWalletP2pkhInput`, `createBrc29Payment/acceptBrc29Payment`, `ArcadeChainTracker`, `beefFromArcade`, `rules.ts`, `inscription.ts`, `mockchain.ts`. All under `docs/starter/bsv21-token-kit/` and in guide Appendix A.
3. **Mockchain first, then mainnet.** For each builder, first a mockchain test under `test/`, then mainnet with a small amount.
4. **Do not guess API names.** Verify in `node_modules/@bsv/*/dist/**/*.d.ts`. Guide §24 cheat sheet.
5. **An interface change** = first §3 of this file, then `STATUS.md` → "Interface changes".
6. A **Checkpoint** at the end of each phase (written in the track files). Not skipped.
7. Private keys, seeds, `.env`, `data/` are never committed. Add by file name instead of `git add -A`.
8. The txid of every transaction made on mainnet is written to the `STATUS.md` → "Mainnet transactions" table (type, txid, who, when). These will be collected for the README.

---

## 5. Phases and sync points

| Sync | Definition | Who must have finished |
|---|---|---|
| **S0** | The repo skeleton and `types.ts` exist; the interfaces frozen; wallets generated; the sats request sent; kit tests green; validation tests 1, 2, 3, 8 done | A.P0, B.P0, C.P0, D.P0 |
| **S1 — Walking skeleton** | With server wallets only, 1 provider + 2 agents, **the first DvP settlement on mainnet** (`scripts/skeleton.ts`), admitted by the overlay, the WhatsOnChain link in STATUS | A.P1, B.P1 (offer record + index), C.P1 (token/product), D.P0 (funds) |
| **S2 — K1 integrated** | `provider-cli` mint + open-pool with Desktop; agents find a pool on the overlay and pledge; the coordinator round; settlement; redeem + a 402 job; an unfilled pool; `verifyLineage` on the signing path; **web: the pool explorer + Town v1 live** | A.P2, B.P2, C.P2, D.P1, E.P1 |
| **S3 — K2 integrated** | A vault agent enters a settlement (guard co-signature); injection refused; market listing + sweep; a human pledge (participant-cli **and from the browser**); the Rail PoC result recorded; **web: participant/provider/owner/market flows with Desktop** | A.P3, B.P3, C.P3, D.P2, D.P3, E.P2, E.P3 |
| **S4 — Freeze** | Tests green; README; value note; threat model; tx links; `npm run demo` one command; **web at a public URL, with a real replay** | everyone P4, E.P5 |

Dependency graph (arrow = "needs"):

```
A.P0 types/sdk ──▶ B.P1, C.P1, D.P1
A.P1 builders  ──▶ B.P2 (the coordinator uses planSettlement), C.P2 (agent pledge/sign), S1
B.P1 offers+index ──▶ C.P2 (agent pool discovery), B.P2
C.P1 product+token ──▶ S1 (the skeleton can mint its own token too; C's token at S2)
D.P0 wallets/funds ──▶ S1 and mainnet after it
D.P1 vault+guard ──▶ A.P3 (VaultSigner integration test), C.P3 (vault agent)
A.P2 verifyLineage ──▶ C.P2 redeem verification, D.P2 guard DvP
A.P2 listing/sweep ──▶ B.P3 index, C.P3 agent market behaviour
B.P1–P3 (pools, WS, SSE, vaults, listings) ──▶ E.P1 (explorer, Town v1), E.P3 (market, vault view)
A.P1/P2 builders (in the browser) + C.P1 provider-api (CORS) ──▶ E.P2 (participant, provider flows)
D.P1/P2 guard API + SSE ──▶ E.P3 (owner console, watchman) · D.P3 Rail ──▶ E.P4 (harbour) · B.P5 URLs ──▶ E.P4 (publishing)
C agent event stream (§3.10) ──▶ E.P1 bubbles (fallback: log-relay)
```

The rule if a dependency is not ready: **continue with a stub** (the interface is in this file), write the blocker in STATUS.

---

## 6. Wallet and fund management (owned by D; everyone follows)

### 6.1 Inventory

| Wallet | Type | Where | Key | Target balance | For |
|---|---|---|---|---|---|
| `desktop-treasury` | BSV Desktop | a member's laptop | Desktop seed (only that member) | all sats from BSVA | Funds everything else; the provider operator role (mint, open-pool) |
| `desktop-owner` | BSV Desktop | a second laptop | Desktop seed | 60k sat | Agent owner: fund/withdraw vault |
| `desktop-human` | BSV Desktop | a third laptop (or the same as owner) | Desktop seed | 30k sat | Human participant pledge |
| `provider-api` | wallet-toolbox SQLite | server/laptop | `WALLET_PROVIDER_API_KEY` | 20k sat | 402 collection, credit returns, fees |
| `coordinator` | wallet-toolbox | same | `WALLET_COORDINATOR_KEY` | 5k sat | identity + broadcast only; holds no money |
| `guard` | wallet-toolbox | same | `WALLET_GUARD_KEY` | 5k sat | signing only; no fees needed |
| `agent-1..3` | wallet-toolbox | same | `WALLET_AGENT_n_KEY` | 50k sat each | pledge, 402, market |
| `maker` | wallet-toolbox (+ Base EOA) | same | `WALLET_MAKER_KEY`, `BASE_PRIVATE_KEY` | 30k sat + Sepolia ETH/USDC | Rail PoC |

Total ≈ **300k sat** including margin. A settlement fee is a few hundred sat, 402 payments hundreds of sat; the real consumption is pledge amounts, and in a pool these go back to the provider (our wallet), so **the sats circulate within the team**.

### 6.2 Steps

1. **Install Desktop (mainnet):** <https://desktop.bsvb.tech>. Write the recovery phrase down offline. Each Desktop belongs to one member.
2. **Ask for sats (right away):** in `desktop-treasury`, Payments → Receive → BSV Address; send the address and the team name to `@lexamaison` on Telegram. Until they arrive, develop **on the mockchain**; 50k sat is enough for S1.
3. **Generate the server wallets:** `npx tsx scripts/keygen.ts` → prints 7 64-hex keys; paste them into `.env`. `scripts/wallets.ts` → `openWallet(name)` opens `data/wallets/<name>.sqlite` for each (guide §14.1 `Setup.createWalletSQLite`, Arcade primary §14.2). `scripts/identities.ts` prints the identity keys; these go not into `.env` but into `config/identities.json` (committable, public).
4. **Fund:** `npx tsx scripts/fund.ts agent-1=50000 agent-2=50000 provider-api=20000 ...` → connects to Desktop with `WalletClient('auto', APP_ORIGINATOR)`, creates a BRC-29 payment to each target (kit `createBrc29Payment`); if the target wallet is on the same machine it takes it in directly with `acceptBrc29Payment`; otherwise it writes `data/payments/<name>.json` and `scripts/receive.ts` is run on that machine. Desktop shows an approval window for each payment.
5. **Check:** `npx tsx scripts/balances.ts` → the balance of every wallet and WhatsOnChain links.
6. **Desktop → Desktop funding** (owner, human): the same BRC-29 script from the treasury; the target identity key is taken from the other Desktop (`scripts/identities.ts --desktop`).

### 6.3 Safety and order

- `.env`, `data/`, `*.sqlite` are git-ignored. Keys are backed up in the team password vault (seeds are not backed up; each member writes down their own).
- The only "money source" is `desktop-treasury`; other wallets are funded from there again when they run dry.
- Everything tried on mainnet for the first time is done with **1,000 sat** first.
- In case of loss: a wallet-toolbox wallet `sync`s from scratch with the same root key; credit tokens come back from the overlay (guide §17.6).

### 6.4 The message to send to Axel (sent in D.P0; continue with assumptions until an answer comes)

> Hi Axel, team **<team name>** here (BSV track). Our project is a non-custodial group-buying layer for AI agents on BSV (pool fills → one atomic tx pays the provider and delivers BSV-21 credits). Five quick questions so we design to your criteria:
> 1. Agent budgets sit in a 2-of-2 (agent + policy "guard") output with a unilateral owner-withdraw path. Does that count as non-custodial for judging?
> 2. Agents run wallet-toolbox server wallets; humans use BSV Desktop. Is that sufficient for the "BSV wallets" requirement?
> 3. We index our own overlay topic (`tm_agentcoop`). Is that encouraged? Any public overlay hosting we can use?
> 4. Participants sign a coordinator-built multi-party tx with `createSignature({ hashToDirectlySign })`. Any plan for BSV Desktop to show structured sign requests? (For our threat model note.)
> 5. A short-lived, capped prepaid balance at the provider when credits are redeemed for API calls (≤ one session, returnable): acceptable within non-custodial judging?
> 6. Cross-chain: an HTLC atomic swap USDC (Base) ↔ BSV, with the BSV refund as a pre-signed nLockTime tx (no CLTV). Does that count as a "cross-chain flow", and is a $1–2 swap on Base mainnet OK for the demo?
> 7. We love the pixel-art style of bsvmunich.com. Is its source or art open source, and would it be OK to build on its sprite-rendering approach or reuse any assets with attribution?
> Our treasury address for sats: `<address>`. Thanks!

The sats request is sent **separately from and before** the question message (address + team name + amount: ~300k for the main demo, an extra ~250k sat for the 50-agent scale test). Ready text: `plan/phases/D-P0.md` §2.

Assumptions (if there is no answer): 1 yes, 2 yes, 3 we run our own overlay locally, 4 none, 5 written openly in the README, 6 yes; Base mainnet only on the Phase 5 A path and with amounts not exceeding $2; 7 no (reference only, track-E §6.4).

---

## 7. STATUS.md discipline

- Each track has a section. It writes **only its own section** and reads the others.
- Updated at the end of each phase: phase, artefacts (file paths), known issues, blockers, interface changes, plan changes, mainnet txs.
- What is written in "Blockers" is also told to the humans verbally; the AI does not write it and wait, it continues with a stub.

---

## 8. Definitions: what "done" means

- **A builder is done** = it has a mockchain test, green + it ran once on mainnet (txid in STATUS).
- **A service is done** = it comes up with `npm run <app>`, `.env.example` is current, it has a README section, it has at least one integration test.
- **A phase is done** = the acceptance criteria are met + the Checkpoint is done + STATUS is updated.
