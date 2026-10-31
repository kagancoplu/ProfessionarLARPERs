# B-A5 — Track B's side of Track A phase 5 (vault-locked credits + lighthouse)

> 31.10 00:00. A's code was done on the mock chain (A-P5 5.1–5.7); A's checkpoint was waiting for two B items: overlay `ownerKinds` and `POST /pledges/lighthouse`. Also A's request 4.2: the scale test behind a flag.

## 1. Overlay (packages/overlay)

- `AgentCoopTopicManager` defaults to `ownerKinds: ['p2pkh','vault']` (A's `RuleOptions`): BSV-21 outputs locked to a vault script are admitted and count as inputs when spent.
- Lookup: token outputs via `decodeBsv21Owned`; migration 004 adds `owner_vault_hash` (token table) and `credit_lock`, `mode`, `guard`, `lh_id` to the pledge table. New query `{ op:'vaultCredits', vaultHash, tokenId?, includeSpent? }`; `ownerVaultHash` in the context.
- `validatePledgeRecord`: the structural rule for the A-P5 fields (MASTER §3.8).

## 2. Coordinator (apps/coordinator)

- `src/candidates.ts`: overlay pledge → A's `PledgeCandidate`; the record comes **from the pledge tx** (`pledgeRecordOf`). Before, `coreProtocol` built the record from the view and dropped `creditLock`/`mode`/`guard`/`lhId` (a vault-locked pledge's credits would have been planned to a P2PKH, and A's `verifySettlementPlan` would have refused).
- `audit.ts` (`creditsDelivered`) and `metrics.ts` (`classifySettlement`): the credit output via A's `creditScriptFor`; vault-locked credits are not counted as `unaccounted`.
- `POST /pledges/lighthouse` (`src/lighthouse.ts`, MASTER §3.5) + store table `lighthouse_pledges`; `GuardDirectory` (`LIGHTHOUSE_GUARDS`, default `GUARD_URL`): identity → URL, from `/healthz`.
- Engine: for a `mode:'lighthouse'` input, `lighthouseCosign(guardUrl, { plan, inputIndex, pledge })` instead of a WS `sign_request`; the returned unlock is checked with `inputIsValid` on the template. A lighthouse pledge that was not stored does not enter the plan.

## 3. Scale test

`e2e.scale.mockchain.test.ts` only with `SCALE=1` (`npm run test:scale`).

## 4. Tests

- `packages/overlay/test/overlay.vaults.test.ts` 5–6: vault-locked credits admitted → `vaultCredits` → the owner spends; pledge fields and the refusal of malformed records.
- `apps/coordinator/test/e2e.lighthouse.mockchain.test.ts`: two lighthouse people + one agent; a lighthouse pledge not given to the coordinator does not enter the plan; once given, the guard co-signs for both people, one settlement, `audit consistent`, `custodiedSats: 0`; a bad signature / unknown guard → 422.
- `apps/coordinator/test/metrics.credit-locks.test.ts`: vault-locked credits count as `credits`, ones going elsewhere as `unaccounted`.

## 5. Effect on mainnet

A running overlay/coordinator keeps the old code until restarted. Migration 004 runs when the overlay restarts (adds columns, deletes no data); no vault-locked output was admitted before (no vault-locked credits have been minted on mainnet yet).
