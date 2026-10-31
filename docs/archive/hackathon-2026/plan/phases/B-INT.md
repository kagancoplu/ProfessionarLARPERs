# B-INT — Integration with Track A (root workspace, `@agentcoop/core`, the real protocol)

> Track B. Not a phase: it closes the items of phases 0–3 that were left "for when A arrives". Done before phase 4 (wrap-up) and phases 5/6 (after S3).
> Written: 30.10 ~17:20. Branch: `main` (user decision: trackB closed, everyone works from main).

## 1. Why now

A put phases 0–2 on `main`: the root workspace (`packages/*`, `apps/*`, `scripts`), `@agentcoop/core` (types, `parseOpReturn`, `vaultLockingScript`, kit copies, `planSettlement`, `verifyOffer`, `verifyListing`, `verifySettlementPlan`, `signSettlementInput`, `assembleSettlement`, `broadcastEF`, `fetchChainPolicy`, `buildReserveAndAnnounce`, `buildPledge`, `cancelPledge`). Track B's temporary copies and test-only planner are now duplicated code (the problem the user pointed out at 16:25).

## 2. Tasks

1. **Workspace migration:** delete the own `package-lock.json`, `node_modules` and `vitest.config.ts` of `packages/overlay` and `apps/coordinator`; root `npm install` + root `vitest.config.ts`. Packages depend on `@agentcoop/core`. Package `test` scripts run from the root.
2. **One SDK copy:** in Track B code, `@bsv/sdk` → `@agentcoop/core/sdk` (MASTER §3.1).
3. **Overlay:** delete `src/kit/*` → `@agentcoop/core`; `src/stub/opreturn.ts` → core `parseOpReturn/buildOpReturn`; `src/stub/types.ts` → core types (`SettleRecord` stays local); `src/stub/vault.ts` → core `vaultLockingScript` + `VAULT_PROTOCOL`, the overlay-specific `expectedVaultScript` / `isVaultScriptHex` in `src/vault.ts`. Tests use the root `test/helpers/mockchain.ts`.
4. **Coordinator:**
   - `coreProtocol({ arcadeUrl, policy?, broadcast? })` in `src/protocol.ts`: `planSettlement` (PledgeView + source tx → A's `PledgeCandidate`; `ChainInfo` = height + `fetchChainPolicy` fee rate, 60 s cache), `assembleSettlement`, `broadcastEF`. This is the server default: `npm run coordinator` now runs real signing rounds.
   - `verifyOffer.ts` / `verifyListing.ts`: signature and credit checks delegate to A's `verifyOffer` / `verifyListing` (`BAD_OFFER` / `BAD_LISTING`); only chain state stays in the coordinator (is it on the overlay, open, unspent, are the terms the same as the on-chain record).
   - Delete `test/helpers/devProtocol.ts`; tests use `coreProtocol` with a mock broadcast.
5. **End-to-end integration test** (`apps/coordinator/test/e2e.integration.mockchain.test.ts`): with A's builders, through the `tm_agentcoop` overlay and the coordinator: `TokenKit.deploy` → `buildReserveAndAnnounce` → `signOffer` → `POST /offers` → two agents `buildPledge` (600/400) → coordinator round (A's `planSettlement`) → agent bots `verifySettlementPlan` + `signSettlementInput(P2pkhWalletSigner)` → broadcast → overlay `settled` → `internalizeSettlement` + `TokenKit.sync()` 600/400. This repeats validation test 1 with A's real transactions and is the mock-chain counterpart of S1.
6. STATUS: migration done, temporary copies gone; close the blocker rows (no A.P0, `pledgeListHash`).

## 3. Acceptance

All Track B tests green in the root `npm test` (the old behaviour tests + the integration test); `npm run typecheck` (root) clean on Track B files; no `src/kit`, `src/stub/{opreturn,types,vault}`, `devProtocol` or separate lock files left in Track B.
