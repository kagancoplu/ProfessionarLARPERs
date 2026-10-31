# @agentcoop/core

The AgentCoop protocol library: types, transaction builders, signers and verifiers for pooled, atomic purchases of BSV-21 credits. Everything a participant, a coordinator, a guard, a CLI or the browser needs to build or check a transaction lives here. It holds no server state.

How the mechanism works: [docs/concepts/pools-and-settlement.md](../../docs/concepts/pools-and-settlement.md). Exact transaction layouts, records, scripts and signature scopes: [docs/reference/protocol.md](../../docs/reference/protocol.md). Types and constants: `packages/core/src/types.ts`.

## Using it

- **One SDK copy.** Import `@bsv/sdk` only through `@agentcoop/core/sdk` (the CommonJS build wallet-toolbox loads). Run Node programs with `tsx --import @agentcoop/core/register-sdk …`; tests get the same through the alias in `vitest.config.ts`.
- **Browser-safe index.** `@agentcoop/core` has no `node:` imports and no wallet-toolbox; Node-only helpers are under `@agentcoop/core/node/*` (`env`, `serverWallet`).
- Exports: `.`, `./sdk`, `./types`, `./kit/*`, `./scripts/*`, `./signers/*`, `./node/*`, `./register-sdk`.
- Wallets are BRC-100 `WalletInterface`s: BSV Desktop through `WalletClient('auto')` or a wallet-toolbox server wallet. Custom inputs are signed with `createSignature({ hashToDirectlySign })` over a sighash this library computes.

## Functions

| Area | Functions | File |
|---|---|---|
| Pool | `buildReserveAndAnnounce`, `signOffer`, `verifyOffer`, `publishOffer`, `offerFromRecord` | `packages/core/src/pool/reserve.ts`, `packages/core/src/pool/offer.ts`, `packages/core/src/pool/offerRecord.ts` |
| Pledge | `buildPledge(…, 'p2pkh' \| 'vault', …)`, `cancelPledge` | `packages/core/src/pool/pledge.ts` |
| Plan | `planSettlement`, `orderPledges`, `pledgeListHash`, `creditScriptFor`, `creditLockOf` | `packages/core/src/pool/plan.ts` |
| Verify | `verifySettlementPlan`, `planTransaction`, `pledgeRecordOf` | `packages/core/src/pool/verify.ts` |
| Settle | `signSettlementInput`, `assembleSettlement`, `broadcastEF`, `internalizeSettlement` | `packages/core/src/pool/settle.ts` |
| Lineage | `verifyLineage`, `arcadeTxFetcher` | `packages/core/src/verify/lineage.ts` |
| Market | `reserveListing`, `signListing`, `verifyListing`, `buildSweep`, `cancelListing`, `cancelPool`, `reclaimReserved` | `packages/core/src/market/listing.ts` |
| Vault-locked credits | `buildVaultCreditScript`, `decodeBsv21Owned`, `vaultKeysOfScript`; `internalizeVaultCredits`, `listVaultCredits`, `transferVaultCredits` (redeem), `signVaultCreditListing` (listing; proceeds to the vault) | `packages/core/src/scripts/creditLock.ts`, `packages/core/src/vault/creditSpend.ts` |
| Lighthouse | `buildLighthousePledge`, `verifyLighthousePledge`, `cosignLighthouse`, `cancelLighthousePledge`, `lighthouseLockingScript` | `packages/core/src/pool/lighthouse.ts`, `packages/core/src/scripts/lighthouse.ts` |
| Vault | `VaultSigner`, `VaultOwnerSigner`, `pledgeFromVault`, `spendFromVault`, `httpCosigner`, … | `packages/core/src/signers/VaultSigner.ts`, `packages/core/src/scripts/vault.ts` |
| Coop Rail | `htlcLockingScript` and the claim and refund unlocks | `packages/core/src/scripts/htlc.ts` |
| Chain | `fetchChainPolicy` (Arcade fee rate and height) | `packages/core/src/util/arcade.ts` |
| Token kit | `TokenKit`, `OverlayClient`, `identifyAdmissible` (with an `ownerKinds` option), `buildBsv21Script`, `decodeBsv21` | `packages/core/src/kit/` (copied from the starter kit) |

## What every verifier checks (`verifySettlementPlan`)

Input 0 is the offer and its signature verifies against this transaction; output 0 pays the provider exactly P; each participant's input matches its credit output (token, amount, 1 sat) and its change (back to its own coin's script, the planned amount, at least 1 sat); credits sum to N; no pledge appears twice; the settle record commits to the terms and this exact pledge list; my fee share is under my cap. With `verifyLineage: true` the offer's credits are walked back to the deploy without trusting any overlay.

Two choices are read **from each pledge's on-chain record, never from the plan**, so a coordinator cannot change them:

- `creditLock: 'vault'`: the credits land on the pledge coin's own vault script (moving them needs agent + guard, or the owner).
- `mode: 'lighthouse'`: an exact coin on `lighthouseLockingScript`, no change, credits to the person's own address.

Every check has its own tampering test, and each of its 33 hand-written mutants is killed (`npm run mutate`; [docs/AUDIT-READINESS.md §4](../../docs/AUDIT-READINESS.md#4-invariants)). Why participants sign `ALL` in a round while the provider pre-signs `SINGLE|ACP`: [ADR 0001](../../docs/decisions/0001-two-phase-settlement-signing.md).

## Options (off by default)

- **Vault-locked credits.** A vault agent's credits can settle onto its vault script, so spending them (redeem, listing) needs the guard too. Overlays and `verifyLineage` read them with `ownerKinds: ['p2pkh', 'vault']`; the default `['p2pkh']` is the starter kit's behaviour byte for byte.
- **Lighthouse pledges (offline people).** The coin sits on `OP_IF <withdraw> CHECKSIG OP_ELSE 2 <person> <guard> 2 CHECKMULTISIG OP_ENDIF`: the person signs once and leaves, its chosen guard co-signs only after checking the whole settlement and the lineage, and the person can withdraw alone with a separate key.

## Errors

`AgentCoopError.code`: `BAD_OP_RETURN`, `BAD_TERMS`, `BAD_OFFER`, `BAD_PLEDGE`, `BAD_PLAN`, `BAD_SIGNATURE`, `BAD_LISTING`, `LINEAGE_FAILED`, `DEADLINE_PASSED`. The message starts with the code.

## Tests

```bash
npx vitest run packages/core          # unit tests: plan and verifier tampering, lineage, rules, scripts
```

End-to-end flows on the mock chain: `test/skeleton.mockchain.test.ts` (one settlement), `test/e2e.market.mockchain.test.ts`, `test/e2e.vault-credits.mockchain.test.ts`, `test/e2e.lighthouse.mockchain.test.ts`, and the coordinator and guard suites in `apps/`.

## Research (not exported)

`packages/core/src/research/covenant/` is a guard-less vault prototype (OP_PUSH_TX) tested in the SDK interpreter only (`packages/core/test/research.covenant.test.ts`). Findings and why it is not used: [ADR 0002](../../docs/decisions/0002-mandate-vault-guard-cosigner.md).
