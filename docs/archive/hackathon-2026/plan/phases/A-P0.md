# A-P0 — Skeleton, types, SDK bridge, signature spike (detailed plan)

> Track file: `plan/track-A-protocol.md` phase 0. Interfaces: `plan/00-MASTER-PLAN.md` §3 (frozen). This file is the phase's implementation plan; its scope is wider than the track file's, its interface no different.
> Date: 2026-10-30. Status: plan written → code.

## 0. Priority order (critical path)

B and C are waiting for `types.ts` and `@agentcoop/core/sdk`. So the order is:

1. **Root configuration + `npm install`** (0.1)
2. **`types.ts` + `sdk.ts` + `index.ts`** (0.2a) → announce at once in STATUS ("types ready")
3. The kit copy (0.2b) + opreturn (0.3) + P2pkhWalletSigner (0.5) + script stubs
4. Tests green (0.6)
5. The spike script (0.4) — the mainnet run needs BSV Desktop + sats (human); the code gets ready, the run waits in STATUS

## 1. State of the dependencies (STATUS 2026-10-30)

| Dependency | Status | Effect |
|---|---|---|
| D.P0 sats / wallets | not started | the 0.4 mainnet run waits; the code + a mock-chain variant are prepared |
| BSV Desktop (human) | unknown | 0.4's validation tests 2 and 3 run on a member's laptop |
| B, C | not started | waiting for my `types.ts` → first job |

## 2. File list

### Root
| File | Content |
|---|---|
| `package.json` | workspaces `packages/*`, `apps/*`, `scripts`; pinned versions (the `docs/AGENTS.md` table, no `^`); `npm test` = `vitest run`, `npm run typecheck` |
| `tsconfig.base.json` | ES2022, ESNext, `moduleResolution: Bundler`, strict, `allowImportingTsExtensions: false`, `noEmit` |
| `tsconfig.json` | extends base; `include`: `packages/*/src`, `packages/*/test`, `apps/*/src`, `scripts`, `test` |
| `vitest.config.ts` | the kit alias exactly: `@bsv/sdk` → `node_modules/@bsv/sdk/dist/cjs/mod.js`; include: `test/**`, `packages/*/test/**`, `apps/*/test/**`; timeout 120 s; `fileParallelism:false` |
| `.gitignore` | `node_modules/`, `.env*` (except `.env.example`), `data/`, `*.sqlite`, `*.db`, `graft/` |
| `AGENTS.md` | a copy of `docs/AGENTS.md` |

### `packages/core` (`@agentcoop/core`)
No build: `exports` point straight at the `.ts` sources (tsx and vitest run them). Subpaths: `.`, `./sdk`, `./types`, `./kit/*`, `./scripts/*`, `./signers/*`.

| File | What | Source |
|---|---|---|
| `src/sdk.ts` | `export * from '@bsv/sdk'` — the single SDK entry point | MASTER §3.1 |
| `src/types.ts` | MASTER §3.3 **exactly** (`PoolTerms`, `PledgeRecord`, `Offer`, `Listing`, `SettlementPlan`, `InputSigner`) + the §3.2 constants (`OP_RETURN_PREFIX`, protocol/basket names, sighash scopes, limits) | new |
| `src/errors.ts` | `AgentCoopError { code }` + an `ErrorCode` union (extended in phase 2.7; a skeleton now, the coordinator/guard use the same type) | new |
| `src/index.ts` | re-exports everything | new |
| `src/kit/inscription.ts` | an exact copy | kit `core/inscription.ts` |
| `src/kit/rules.ts` | an exact copy | kit `core/rules.ts` |
| `src/kit/addresses.ts` | an exact copy | kit `core/addresses.ts` |
| `src/kit/signer.ts` | an exact copy (scope fixed to ALL) | kit `client/signer.ts` |
| `src/kit/coinselect.ts` | exact | kit `client/coinselect.ts` |
| `src/kit/token.ts` | exact; only the import paths | kit `client/token.ts` |
| `src/kit/overlayApi.ts` | exact; one difference: the `KitQuery`/`OutputContext` types from `./lookupTypes` (the overlay package is B's; core must not import it) | kit `client/overlayApi.ts` |
| `src/kit/lookupTypes.ts` | the `KitQuery`, `OutputContext` type definitions exactly | kit `overlay/Bsv21KitLookupService.ts` (types only) |
| `src/kit/payments.ts` | exact | kit `client/payments.ts` |
| `src/kit/arcadeChainTracker.ts` | exact | kit `client/arcadeChainTracker.ts` |
| `src/scripts/opreturn.ts` | `buildOpReturn(op, json)`, `parseOpReturn(script)` | MASTER §3.2 |
| `src/scripts/vault.ts` | a `vaultLockingScript(ownerPub, agentPub, guardPub)` **skeleton**: the FINAL-IDEA §4.9 script; D verifies/changes the real body | MASTER §3.4 |
| `src/scripts/htlc.ts` | an `htlcLockingScript(hash, agentPub, guardPub, makerPub)` skeleton (FINAL-IDEA §4.10) | MASTER §3.4 |
| `src/signers/P2pkhWalletSigner.ts` | implements `InputSigner`; scope-parameterised; a generalisation of `signWalletP2pkhInput` | kit `client/signer.ts` |
| `src/signers/sighash.ts` | `signP2pkhWithScope(wallet, tx, i, key, scope, originator?)` — a scope-parameterised copy of the kit signer (used by P2pkhWalletSigner and the spike) | kit `client/signer.ts` |
| `test/opreturn.test.ts`, `test/rules.test.ts` (kit copy), `test/signer.test.ts`, `test/sdk-single-copy.test.ts` | | |

### Root `test/`
| File | What |
|---|---|
| `test/helpers/mockchain.ts` | an exact copy from the kit |
| `test/spike-sighash.mockchain.test.ts` | the mock-chain variant of 0.4: a mixed SINGLE\|ACP + ALL tx accepted by the mock chain |

### `scripts/`
| File | What |
|---|---|
| `scripts/package.json` | the `@agentcoop/scripts` workspace (D fills it later) |
| `scripts/spike-sighash.ts` | validation tests 2 + 3 (mainnet, Desktop) |

## 3. Function signatures (written in this phase)

```ts
// scripts/opreturn.ts
export type CoopOp = 'pool' | 'pledge' | 'settle' | 'list' | 'vault'
export const OP_RETURN_TAG = 'agentcoop'
export function buildOpReturn (op: CoopOp, json: Record<string, string | string[] | Record<string,string>>): LockingScript
export function parseOpReturn (script: LockingScript | Script | string): { op: CoopOp, json: Record<string, unknown> } | null
//  - buildOpReturn: throws unless every leaf value is a string (numbers/bools forbidden) — MASTER §3.2 "all numbers are strings"
//  - parseOpReturn: null unless OP_FALSE OP_RETURN "agentcoop" <op> <json>; an unknown op → null; broken JSON → null

// signers/sighash.ts
export const SCOPE_ALL, SCOPE_SINGLE_ACP: number
export async function signP2pkhWithScope (wallet, tx, inputIndex, key: KeyRef & { counterparty?: 'anyone'|'self'|string }, scope: number, originator?): Promise<UnlockingScript>

// signers/P2pkhWalletSigner.ts
export class P2pkhWalletSigner implements InputSigner {
  readonly unlockingScriptLength = 108
  constructor (wallet: WalletInterface, key: { protocolID: WalletProtocol, keyID: string, counterparty?: string }, opts?: { scope?: number, originator?: string })
  sign (tx: Transaction, inputIndex: number): Promise<UnlockingScript>
}

// scripts/vault.ts, scripts/htlc.ts — the MASTER §3.4 signatures exactly
```

## 4. Data flow (spike, validation tests 2 + 3)

```
BSV Desktop (WalletClient('auto', APP_ORIGINATOR))
 1. getPublicKey([1,'agentcoop pledge'], keyID=nonce, 'anyone', forSelf) → pub
 2. createAction: out0 = P2PKH(pub) 1,000 sat, basket 'agentcoop', customInstructions {protocolID,keyID,counterparty}
    randomizeOutputs:false → txA (Desktop broadcasts)
Spike script
 3. tx = new Transaction(); in0 = txA:0 (sourceTransaction=txA); out0 = P2PKH(the spike's temporary address) 900 sat
 4. A SINGLE|ACP|FORKID signature from Desktop: signP2pkhWithScope(desktop, tx, 0, key, SINGLE_ACP) — createSignature(hashToDirectlySign)
 5. A second signer (a local PrivateKey, sats from D's agent wallet or a coin set aside with a second createAction from Desktop):
    in1 added, out1 added → the in0 signature MUST STILL be valid (that is what SINGLE|ACP means); in1 signed with ALL|FORKID
 6. tx.verify locally (Spend) → broadcastEF(Arcade POST /tx, EF) → txid into STATUS
 7. Observation (test 3): did Desktop show an approval window at step 4 and at a second createSignature? How many times?
```

In the spike, **adding in1/out1 AFTER in0 was signed** is the heart of the test: it proves the offer's claim "sign, stay offline, let someone else complete it".

## 5. Test scenarios

### Mock chain / unit (must be green in this phase)
| Test | What it proves |
|---|---|
| `opreturn.test.ts` round-trip (5 ops), a number/bool value → throw, a number inside a nested object → throw, a foreign OP_RETURN → null, broken JSON → null, a different `agentcoop` tag → null | the MASTER §3.2 envelope |
| `rules.test.ts` (copied from the kit, import paths change) | the kit rules work exactly the same in core |
| `signer.test.ts`: `P2pkhWalletSigner` ALL and SINGLE\|ACP with `ProtoWallet`; script verification with the SDK's `Spend`; after a SINGLE\|ACP signature, adding another input + output keeps in0 valid; changing out0 invalidates it | sighash scope semantics (FINAL-IDEA §4.2) |
| `sdk-single-copy.test.ts`: the `Transaction` of `@agentcoop/core/sdk` is the same class as the one wallet-toolbox uses | the MASTER §3.1 ESM/CJS rule |
| `test/spike-sighash.mockchain.test.ts`: two wallet-toolbox wallets; A sets aside a pledge coin, signs SINGLE\|ACP; B adds its input (createAction + signAction, `inputBEEF`), the mock chain accepts | the wallet side of test 2 (without Desktop) |

### Mainnet (0.4)
- `NETWORK=main APP_ORIGINATOR=agentcoop.local npx tsx scripts/spike-sighash.ts` — Desktop open; ≤ 1,000 sat. Output: txid + WoC link + an observation note. **Prerequisite:** sats in Desktop (D.P0). Otherwise STATUS Blockers.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Two ESM/CJS SDK copies (`script[serializedBytes] is not a function`) | the vitest alias; the `sdk-single-copy` test; a check for tsx at runtime too (§8 below) |
| `TransactionSignature.format`'s ANYONECANPAY/SINGLE support | check in `node_modules/@bsv/sdk/dist/types/.../TransactionSignature.d.ts` and its source; prove with `signer.test.ts` |
| BSV Desktop refuses `hashToDirectlySign` or asks every time | tests 2/3; if it fails, FINAL-IDEA §12.2's plan B (offers from a server wallet) — Checkpoint 1 |
| Type mismatches with TypeScript 7 (native tsc) | the kit uses the same version; if there is a problem `typecheck` does not block CI, write it into STATUS |
| Concurrent tracks touch root files | the root configuration is A's (MASTER §3.1, track A 0.1); whoever wants a change writes into STATUS |

## 7. Evidence for the acceptance criteria

| Criterion | Evidence |
|---|---|
| `npm install && npm test` clean | the command output (test count) in STATUS |
| `@agentcoop/core` is imported from other workspaces | `scripts/spike-sighash.ts` imports `@agentcoop/core`; an `npx tsx -e` smoke test |
| The test 2/3 result in STATUS | after the mainnet run; if it cannot run, "waiting: Desktop+sats" + a Blockers row |
| types.ts ready | STATUS Track A "What other tracks expect from me" |

## 8. The SDK bridge decision (`sdk.ts`)

Goal: wallet-toolbox (CJS) and our code use **the same** `@bsv/sdk` build.
- **vitest:** the root alias (the kit pattern) is enough.
- **tsx / the Node runtime:** `export * from '@bsv/sdk'` resolves to the ESM build → clashes with wallet-toolbox's CJS copy. The fix is in `sdk.ts`: re-export directly from the CJS file if `@bsv/sdk`'s `exports` map allows it; otherwise tsx's tsconfig `paths` support. Whichever is chosen, a smoke test: `npx tsx scripts/check-sdk.ts` prints the `instanceof` equality of `Transaction` with wallet-toolbox's `Wallet`. The decision is written into this file and STATUS.

## 9. Result (2026-10-30)

- **The SDK bridge decision:** `packages/core/src/sdk.ts` = `export * from '../../../node_modules/@bsv/sdk/dist/cjs/mod.js'` (the SDK's `exports` map does not allow the `dist/cjs` subpath; a relative file path bypasses the map). Under tsx `Transaction === require('@bsv/sdk').Transaction` was confirmed; in vitest the root alias points at the same file (`sdk-single-copy.test.ts`). Rule: everyone imports from `@agentcoop/core/sdk`; files inside core from `../sdk`.
- **Tests:** 5 files / 25 tests green (`npm test`), `npm run typecheck` clean.
- **Lessons (affect phase 1):**
  1. The SDK makes everything after a top-level `OP_RETURN` one chunk → `parseOpReturn` re-reads the inner pushes.
  2. wallet-toolbox's `createAction` verifies a ready `unlockingScript` before broadcast → in phase 1 participants give their signatures not to `createAction` but to the raw tx the coordinator built (the plan stands as is); but for **testing an offer's liveness**, the pattern "give the foreign SINGLE|ACP input to createAction" can be used (not the cheap path for `verifyOffer`'s internal check; local verification with `Spend` is preferred).
  3. `WalletClient` methods take no originator parameter.
  4. `signP2pkhWithScope` needs only `createSignature` + `getPublicKey` (`SigningWallet`) → the guard and tests can use `ProtoWallet`.
- **Open:** the mainnet run (validations 2/3) — STATUS Blockers.
