# Track C — handoff note (31.10 01:00)

Track C's plan (phases 0–4) is done on the mock chain and on `main`. The remaining work happens on the **main laptop**, where the accounts are. This file is the to-do list for that session. Tick each item in STATUS when done; write txids into the STATUS "Mainnet transactions" table.

Environment: Node ≥ 22, install with `npx npm@11 install` (npm 10 breaks on this workspace). Scripts run with `tsx --import @agentcoop/core/register-sdk` (the root `package.json` scripts already do).

## 1. Mainnet acceptance (runbook steps 9–15)

Prerequisite: services up (`node infra/run.mjs`, `npm run guard -w @agentcoop/guard`). T1 (mint), T2 (pool `53a240f5…3ca6_0`) and T7 (402 ×4) are already on chain.

### ✅ 1.1 Close why the agents do not pledge (do this first) — **solved 31.10 01:45** (provider-api had started before the mint; S2 settled, STATUS)
1. `git pull`. If provider-api was running from before, restart it **once**: `DATA_DIR=$PWD/data npm run provider`. From then on a new `mint`'s tokenId is picked up within 5 s by itself (`refreshTokenIds`).
2. `curl -s localhost:8092/v1/catalog | jq '.products[] | {id, tokenId}'` → `gpu-h100`'s `tokenId` must be `0ae50b8b…437d_0`, not `null`.
3. `npm run agents`, then `tail -f data/agents/*/activity.log`. Every pool check that cannot decide writes a **"Pool check: …"** line once:
   - `not on the coordinator's WS …` → `COOP_API_URL` / the coordinator's WS;
   - `the provider's catalog has no credit token …` → step 1;
   - `no pools at the coordinator` → no pool at the coordinator;
   - `no pool to decide on: <poolId>… <status>, no offer / other token / decided` → why the pool was filtered out;
   - if the pool check passed, the decision (`pledge` or `skip` and its reason, e.g. price) is written to `decisions.log`.
4. **Pool price:** `--price` is the price of the **whole** pool. If T2 was opened at 1000 sat per credit (`GET /pools/<id>` → `terms.priceSats` = 40000), the rules brain deliberately says SKIP (retail is 50 sat/credit, the pool must be at least 10 % cheaper). Then:
   ```sh
   npm run provider-cli -- cancel-pool 53a240f5c44123211c3befa737f7ce1cae356c15bd72256279e47f5e43d93ca6_0
   npm run provider-cli -- open-pool --credits 40 --price 1000 --deadline +144 --fee 100 --min 5 --label "8×H100 · 1 week"
   ```
   If a person joins too, grow the pool by their credits (e.g. 12 credits → `--credits 52 --price 1300`). A pool settles only when exactly full; the agents' 7-day need is 17 + 11 + 12 = 40.

### 1.2 Mainnet transactions to do

> **Status at 31.10 02:40:** a ✅ (T3 ×3 agents), b ✅ (the person's T3 `67e3b14b…`, the Desktop signature made the 60 s round), c ✅ (T5 `5314ab8b…`, `consistent`, `custodiedSats: 0`), e ✅ (T6: finetune 7+4+6, inference 1×3, STATUS). Left: d (revenue), f (T8), g–h (the vault agent, D's vault + the owner's Desktop). finetune ran out of sats (retail 325 sat/job): it needs funding.

| # | Type | Who / where | Command | Acceptance |
|---|---|---|---|---|
| a | T3 | agents (repo machine) | keep `npm run agents` running | `pledge` in each agent's `decisions.log`; `GET /pools/<id>` → `pledgedCredits` |
| b | T3 | person (`desktop-human`, BSV Desktop) | `npm run participant-cli -- pledge <poolId> 12`, then keep `npm run participant-cli -- sign` open | does the Desktop approval make the 60 s round? If not, note it (a longer round for people, with B) |
| c | T5 | coordinator (automatic) | when the pool fills | `GET /pools/<id>/audit` → `consistent`; `GET /metrics` → `custodiedSats: 0`; `settled` in the agents' `activity.log` |
| d | revenue | provider Desktop | `npm run provider-cli -- sync-revenue`, then `sweep-revenue` | the pool price in the provider's Desktop balance |
| e | T6 | agent | `npm run agent -- eval --jobs 3` | the `/v1/credits/redeem` txid; the job is paid from credits (402 = 0 sat) |
| f | T8 | agents | after the settlement, an agent with surplus credits lists lots of 5 and one that is short sweeps (by itself, while `npm run agents` runs) | `GET /listings` first full, then empty; the sweep txid |
| g | T10 | vault agent | if D's vault is ready (`create-vault` → `policy` → `fund` → `adopt`; runbook 13): `FINETUNE_VAULT_ID=<vaultId>`, `GUARD_URL=http://localhost:8091` in `.env`; repeat 1.1/a–c with a new pool | `activity.log`: "in my owner's vault (the guard approved it)"; `approved` in guard `/decisions` |
| h | injection | vault agent | `npm run demo:injection` on the mock chain; on mainnet a `denied` record in guard `/decisions` is enough | guard 403, vault balance unchanged |

A STATUS row per txid: `| <date> | <T> | [txid](https://whatsonchain.com/tx/<txid>) | C | <what it was> |`.

## 2. Code work other tracks asked for (A-P5 additions)

None of it blocks mainnet; with the flag off the old flow works the same. Suggested order 2.1 → 2.2 → 2.3 → 2.4. Each with a mock-chain test (under `test/`, the `startMockStack` helper in `apps/agents/src/demo/harness.ts`).

### ✅ 2.1 Credits redeemed from a vault return to the vault (security; D → C, 30.10 22:45) — **done (31.10, `df558b3`, tested)**
- **Problem:** `apps/provider-api/src/redeem.ts` `returnCredits` always sends the credits to the caller's P2PKH (`kit.send(…, caller)`). Credits redeemed from a vault thus move to the agent's key and the guard's policy is bypassed (≤ 20 credits per redeem).
- **To do:** at redeem time, record in the ledger that the credits came from a vault (the input has the `buildVaultCreditScript` shape, `vaultKeysOfScript`) (`credits.ts`, separate by balance source). If a return comes from that balance, the output is `buildVaultCreditScript(insc, vaultScript)`, not a P2PKH.
- **Acceptance:** redeem from a vault → return → the credits on the same vault script. Credits redeemed from a P2PKH go back to a P2PKH as before.

### ✅ 2.2 A vault agent's credits arrive locked to the vault (A → C, 30.10 21:30 and 20:45) — **done (31.10, `df558b3`, tested)**
- **Now:** `apps/agents/src/participant.ts:172` `pledgeFromVault` has the credit output planned to the agent's P2PKH. This is the last non-custodial gap in FINAL-IDEA §8.
- **To do:** `pledgeFromVault(…, { …, creditLock: 'vault' })` (or `buildPledge(…, 'vault', …, { vault: { …, creditLock: 'vault' } })`). At settlement, `internalizeVaultCredits` (`packages/core/src/vault/creditSpend.ts`) instead of `internalizeVaultSettlement`. The agent's credit count for `ownedCredits()` via `listVaultCredits` (basket `VAULT_CREDITS_BASKET`).
- **Redeem:** send the vault credits to the provider with `transferVaultCredits` (guard `/cosign kind:'redeem'`, `creditPayees`); provider-api's redeem must accept this tx (sender check = the vault's agent key). Tested together with 2.1.
- **Acceptance:** in `test/agents.vault.mockchain.test.ts`: after settlement the credits are on the overlay with `ownerVaultHash` (`{ op:'vaultCredits', vaultHash }`), 0 on the agent's P2PKH. Examples: `test/e2e.vault-credits.mockchain.test.ts`, `test/vault-credits.spend.mockchain.test.ts`.

### ✅ 2.3 Listing a vault agent's surplus credits (A → C, 31.10 00:50) — **done (31.10, `a3a8d5d`, tested)**
- **To do:** in `apps/agents/src/market.ts` `considerListing`, if the agent is in vault mode, `signVaultCreditListing` (guard `kind:'list'`, SINGLE\|ACP; payment to the vault script) instead of `signListing`. Then the usual `POST {COOP_API_URL}/listings`. Without `minAskSatsPerCredit` in the guard policy listing is off; the agent then writes the reason to `activity.log` and does not list.
- **Acceptance:** the vault agent lists, another agent takes it with `buildSweep`, the sats arrive in the vault.

### ✅ 2.4 participant-cli: "sign and leave" (lighthouse; A → C 30.10 22:30, B → C 31.10 00:40) — **done (31.10, `bfcba2b`, tested)**
- **To do:** add `pledge <poolId> <credits> --lighthouse --guard <guardIdentity>` to `apps/participant-cli/src/cli.ts`: `buildLighthousePledge` (`packages/core/src/pool/lighthouse.ts`) → `POST {COOP_API_URL}/pledges/lighthouse`. Body `LighthousePledge`; add `beef` if the tx is not on the overlay. The coordinator submits to the overlay. Guard identity from `GET {GUARD_URL}/healthz`. Withdrawal: `cancel` recognises the lighthouse record and runs `cancelLighthousePledge` → overlay submit.
- **Acceptance:** a person pledges and leaves; in the round the guard gives the signature; the pool settles. Example: `apps/coordinator/test/e2e.lighthouse.mockchain.test.ts`. A "sign and leave" section in the README.

## 3. When done
1. `npm run typecheck`, `npm test` (without the scale tests; ~15–30 min).
2. Phase row + "What other tracks expect from me" update in STATUS's Track C section; ✅ on the requesting tracks' rows.
3. Track C txids into the root README's "Mainnet run" table (D's section).
