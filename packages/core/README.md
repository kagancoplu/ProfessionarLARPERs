# @agentcoop/core

The AgentCoop protocol core (Track A): types, transaction builders, signers and verifiers for
pooled, atomic purchases of BSV-21 compute credits. Everything a participant, a coordinator, a
guard or a browser console needs to build or check a transaction lives here. No server state.

- **SDK:** import `@bsv/sdk` only through `@agentcoop/core/sdk` (one CJS copy). Apps and scripts run
  under `tsx --import @agentcoop/core/register-sdk …` (MASTER-PLAN §3.1).
- **Browser-safe:** the index has no `node:` imports and no wallet-toolbox; Node helpers are under `@agentcoop/core/node/*`.
- **Interfaces:** frozen in `plan/00-MASTER-PLAN.md` §3.2–§3.4; this file is the overview.

## The mechanism

A provider reserves N credits and signs one input `SINGLE|ANYONECANPAY`: "anyone may spend these N
credits if output 0 pays me P". Agents pledge coins to the pool. When pledges add up to exactly N,
the coordinator builds one transaction, every participant checks the whole of it and signs `ALL`:

```
in 0      offer: N credits (provider, SINGLE|ACP, signed offline)   ↔  out 0       P sats → provider payScript
in 1..n   pledge coins (ALL each)                                    ↔  out 1..n    BSV-21 transfer k_i → participant i
                                                                       out n+1..    change_i → coin_i's own script (interactive only)
                                                                       last         OP_RETURN agentcoop settle { poolId, termsHash, pledgeListHash, round }
```

Payment and delivery happen in the same transaction (DvP): nobody can be paid without everyone
getting their credits. Nobody holds anyone else's funds at any point.

**Why `SINGLE|ACP` for the provider and `ALL` for participants (FINAL-IDEA §4.6):** an `ALL|ACP` pledge
signed in advance must fix every output before the other participants are known, so credits could
not be delivered in the same transaction. Agents are online, so a second signing round costs
nothing and buys DvP plus a full-transaction check. The provider keeps ACP's advantage: it signs once
and can stay offline. Offline humans get a separate, guard-backed Lighthouse mode (below).

## Functions

| Area | Functions | File |
|---|---|---|
| Pool | `buildReserveAndAnnounce`, `signOffer`, `verifyOffer`, `publishOffer`, `offerFromRecord` | `pool/reserve.ts`, `pool/offer.ts`, `pool/offerRecord.ts` |
| Pledge | `buildPledge(…, 'p2pkh' \| 'vault', …)`, `cancelPledge` | `pool/pledge.ts` |
| Plan | `planSettlement`, `orderPledges`, `pledgeListHash`, `creditScriptFor`, `creditLockOf` | `pool/plan.ts` |
| Verify | `verifySettlementPlan`, `planTransaction`, `pledgeRecordOf` | `pool/verify.ts` |
| Settle | `signSettlementInput`, `assembleSettlement`, `broadcastEF`, `internalizeSettlement` | `pool/settle.ts` |
| Lineage | `verifyLineage`, `arcadeTxFetcher` | `verify/lineage.ts` |
| Market | `reserveListing`, `signListing`, `verifyListing`, `buildSweep`, `cancelListing`, `cancelPool`, `reclaimReserved` | `market/listing.ts` |
| Vault-locked credits | `buildVaultCreditScript`, `decodeBsv21Owned`, `vaultKeysOfScript`; `internalizeVaultCredits`, `listVaultCredits`, `transferVaultCredits` | `scripts/creditLock.ts`, `vault/creditSpend.ts` |
| Lighthouse | `buildLighthousePledge`, `verifyLighthousePledge`, `cosignLighthouse`, `cancelLighthousePledge`, `lighthouseLockingScript` | `pool/lighthouse.ts`, `scripts/lighthouse.ts` |
| Vault (Track D) | `VaultSigner`, `VaultOwnerSigner`, `pledgeFromVault`, `spendFromVault`, … | `signers/VaultSigner.ts`, `scripts/vault.ts` |
| Chain | `fetchChainPolicy` (Arcade fee rate and height) | `util/arcade.ts` |
| Kit (copied) | `TokenKit`, `OverlayClient`, `identifyAdmissible` (+ `ownerKinds` flag), `buildBsv21Script`, `decodeBsv21` | `kit/*` |

Tests show every flow end to end on the mock chain: `test/skeleton.mockchain.test.ts` (one
settlement), `test/e2e.market.mockchain.test.ts`, `test/e2e.vault-credits.mockchain.test.ts`,
`test/e2e.lighthouse.mockchain.test.ts`, and the coordinator/guard suites in `apps/`.

## Signatures

| Input | Scope | Signed by | When |
|---|---|---|---|
| offer (in 0) | `SINGLE\|ANYONECANPAY\|FORKID` (0xC3) | provider | once, offline; binds out 0 = P → payScript |
| P2PKH pledge | `ALL\|FORKID` (0x41) | agent | in the round, after `verifySettlementPlan` |
| vault pledge | `ALL\|FORKID`, 2-of-2 | agent + guard (`VaultSigner`) | in the round; the guard runs the same verifier |
| lighthouse pledge | human `SINGLE\|ACP`, guard `ALL` (2-of-2) | human once offline; guard in the round | `cosignLighthouse` |
| listing | `SINGLE\|ANYONECANPAY\|FORKID` | seller | once; binds "pay me askSats at my index" |

The offer and the settlement use `version = 1`, `lockTime = 0`, input 0 `sequence = 0xffffffff`
(`SINGLE|ACP` signs those fields too).

## What every verifier checks (`verifySettlementPlan`)

Input 0 is the offer and its signature verifies against this transaction; output 0 pays the provider
exactly P; each participant's input matches its credit output (token, amount, 1 sat) and its change
(back to its own coin's script, the planned amount); credits sum to N; no duplicate pledge; the settle
record commits to the terms and this exact pledge list; my fee is under my cap. With
`verifyLineage: true` the offer's credits are walked back to the deploy without trusting any overlay.

Two choices are read **from each pledge's on-chain record, never from the plan**, so a coordinator
cannot change them:
- `creditLock: 'vault'`: the credits land on the pledge coin's own vault script (moving them needs agent + guard or the owner).
- `mode: 'lighthouse'`: an exact coin on `lighthouseLockingScript`, no change, credits to the human's own address.

## Extensions (A-P5, off by default)

- **Vault-locked credits.** A vault agent's credits can settle onto its vault script, so spending them
  (redeem, listing) needs the guard too. Overlays and `verifyLineage` read them with
  `ownerKinds: ['p2pkh', 'vault']`; the default `['p2pkh']` is the 1Sat kit's behaviour byte for byte.
- **Lighthouse (offline humans).** A plain `SINGLE|ACP` pledge would let anyone take the coin with a fake
  credit output (BSV-21 is not script-enforced). The coin is therefore
  `OP_IF <human withdraw> CHECKSIG OP_ELSE 2 <human> <guard> 2 CHECKMULTISIG OP_ENDIF`: the human signs
  once and leaves, its chosen guard co-signs only after checking the whole settlement and the lineage,
  and the human can withdraw alone with a separate key.

## Errors

`AgentCoopError.code`: `BAD_OP_RETURN`, `BAD_TERMS`, `BAD_OFFER`, `BAD_PLEDGE`, `BAD_PLAN`, `BAD_SIGNATURE`,
`BAD_LISTING`, `LINEAGE_FAILED`, `DEADLINE_PASSED`. The message starts with the code.

## Research (not exported)

`src/research/covenant/` is a guard-less vault prototype (OP_PUSH_TX); see `plan/phases/A-P6-covenant-report.md`.
