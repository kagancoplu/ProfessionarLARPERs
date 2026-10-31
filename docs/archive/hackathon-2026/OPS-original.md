# OPS — Wallets, keys, funding

> Owner: **Track D**. Plan: `plan/00-MASTER-PLAN.md §6`, detail: `plan/phases/D-P0.md`.
> Rule: no key, seed or API key goes into the repo, a chat, a log or a screenshot.

## 1. Inventory

| Wallet | Kind | Machine | Where the key is | Target | Identity key |
|---|---|---|---|---|---|
| `desktop-treasury` | BSV Desktop | *(fill in)* | seed: owner only, on paper | all of BSVA's sats | *(fill in)* |
| `desktop-owner` | BSV Desktop | *(fill in)* | seed: owner | 60k | `identities.ts --desktop desktop-owner` |
| `desktop-human` | BSV Desktop | *(fill in)* | seed: owner | 30k | `identities.ts --desktop desktop-human` |
| `provider-api` | wallet-toolbox | repo machine | `.env` `WALLET_PROVIDER_API_KEY` + vault | 20k | `config/identities.json` |
| `coordinator` | wallet-toolbox | repo machine | `.env` + vault | 5k | 〃 |
| `guard` | wallet-toolbox | repo machine | `.env` + vault | 5k | 〃 |
| `agent-1..3` | wallet-toolbox | repo machine | `.env` + vault | 50k each | 〃 |
| `maker` | wallet-toolbox | repo machine | `.env` + vault | 30k | 〃 |

Server wallet data is in `data/wallets/<name>.sqlite` (git-ignored). Public identity keys are in `config/identities.json` (committed).

## 2. Setup (once)

```bash
npm install && npm test                              # at the root (A.P0 workspace); ops tests are test/ops.*.test.ts, mock chain, no sats needed
git check-ignore -v .env data/                        # you should see two lines
grep -v '^WALLET_.*_KEY=$' .env.example > .env        # if there is no .env
npx tsx scripts/keygen.ts --only-missing >> .env      # keys ONLY into .env
npx tsx scripts/identities.ts                         # opens the wallets → config/identities.json
```

- `keygen.ts` refuses to print keys to the terminal (when there is no redirect); `--show` only on purpose.
- Copy the 7 `WALLET_*_KEY` lines in `.env` into the **shared vault** (Bitwarden). If lost, the wallet is reopened with the same key and resyncs from the chain.
- `scripts/` is now a root workspace member (`@agentcoop/scripts`): no separate `node_modules`. If an old clone still has `scripts/node_modules`, delete it (two `@bsv/sdk` copies). Runtime warning: the tsx scripts do not run until A's SDK bridge is fixed (STATUS → Blockers, 2026-10-30 17:45).

## 3. Funding (on the machine where the treasury Desktop is open)

1. BSV Desktop must be open and unlocked (mainnet). Commands ask for permission for `agentcoop.local` on the first connection; every payment is a separate approval.
2. **First mainnet trial (≤ 1,000 sat).** No large payment can go out until this lock is lifted:
   ```bash
   npx tsx scripts/fund.ts agent-1=1000
   ```
   This also prepares the fee wallet for A's validation test 2.
3. **S1:** `npx tsx scripts/fund.ts agent-1=49000 agent-2=50000 provider-api=20000`
4. **The rest:** `npx tsx scripts/fund.ts agent-3=50000 coordinator=5000 guard=5000 maker=30000`
5. **Desktop → Desktop** (owner, human):
   - On the target laptop: `npx tsx scripts/identities.ts --desktop desktop-owner` (and share `config/identities.json`).
   - On the treasury: `npx tsx scripts/fund.ts desktop-owner=60000 desktop-human=30000` → creates `data/payments/*.json`.
   - Move the file to the target laptop and run there: `npx tsx scripts/receive.ts --desktop <file>`.
6. Check: `npx tsx scripts/balances.ts` (with `--desktop` the AgentCoop baskets show too; a Desktop's own balance shows only in the Desktop UI).
7. Add the lines `fund.ts` prints at the end to `plan/STATUS.md` → "Mainnet transactions".

See the plan with `--dry-run` first. At most `--max-total` (default 400,000 sat) is sent at once.

## 4. "Out of money" procedure

1. See who ran out with `npx tsx scripts/balances.ts`.
2. If the treasury has enough sats: `fund.ts <name>=<amount>`.
3. If the treasury ran out too: most spending circulates inside the team (pledges go to the provider, i.e. to us). Move it back from `provider-api` or the `agentcoop revenue` basket in Desktop (C's `sweep-revenue` command). If that is not enough, ask @lexamaison for more sats.
4. In an emergency, continue on the mock chain. Write the mainnet steps into STATUS → Blockers.

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `BSV Desktop not reachable` | Desktop closed/locked | Open it, unlock it (3321/2121) |
| `createAction failed with HTTP status 400 … nothing was sent` | Not enough sats in Desktop, or the approval was refused | Check the Desktop balance in the UI; try again |
| `BSV Desktop is on testnet` | Wrong network | A mainnet wallet in Desktop, or `.env` `NETWORK=test` |
| `first mainnet run: send one payment of ≤ 1000 sats first` | The first-trial lock | First `fund.ts agent-1=1000` |
| `! not accepted yet … The payment is safe in data/payments/…` | A temporary error while receiving (SPV/network) | `npx tsx scripts/receive.ts <file>`; receiving the same payment twice is harmless (tested) |
| `WALLET_…_KEY is not set in .env` | No key | `keygen.ts --only-missing >> .env` |
| `script[serializedBytes] is not a function` | Two `@bsv/sdk` copies | `scripts/` must stay a CommonJS package (do not add `"type":"module"`); the cleanup in §2 when moving to the root workspace |

## 6. Security notes

- `.env` permissions `600`; `.gitignore` + `.git/info/exclude` (a local backup). Every phase: `git check-ignore -v .env data/`.
- No script prints a key; error messages contain only the variable name.
- Payment files (`data/payments/`) contain no secret key (a tx + BRC-29 derivation data), but are git-ignored.
- Server wallets are "hot" wallets: their balances hold only what their work needs. The main funds stay in the treasury Desktop.
