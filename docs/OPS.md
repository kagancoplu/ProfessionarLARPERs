# Operations: wallets, keys, funding and mainnet runs

How to run AgentCoop with real satoshis: which wallets exist, where their keys live, how to fund them, the order of a full mainnet run, and what to do when something fails. For offline development none of this is needed ([getting-started.md](getting-started.md)).

**Rule:** no private key, seed or API key goes into the repository, a chat, a log, an issue or a screenshot. Server keys live in the root `.env` (git-ignored, mode 600) and a password manager.

Start every new value at ≤ 1,000 sat. Scripts that send satoshis have a `--dry-run`, and the first mainnet payment from a machine is capped at 1,000 sat until it succeeds.

## 1. Wallets

| Wallet | Kind | Key | Funding target | Used by |
|---|---|---|---|---|
| treasury | BSV Desktop | the owner's seed, offline | the team's satoshis | funds everything else |
| provider operator | BSV Desktop | its owner's seed | fees | `provider-cli`, the web provider console: mints credits, opens pools; pool revenue lands here |
| vault owner | BSV Desktop | its owner's seed | 60,000 sat | `owner-cli`, the web owner console |
| participant | BSV Desktop | its owner's seed | 30,000 sat | `participant-cli`, the web participant console |
| `provider-api` | wallet-toolbox | `WALLET_PROVIDER_API_KEY` | 20,000 sat | the provider API: 402 revenue, redeemed credits, returns |
| `coordinator` | wallet-toolbox | `WALLET_COORDINATOR_KEY` | 5,000 sat | reserved; the coordinator service loads no key today |
| `guard` | wallet-toolbox | `WALLET_GUARD_KEY` | 5,000 sat | the guard (signs only; holds no user funds) |
| `agent-1`…`agent-3` | wallet-toolbox | `WALLET_AGENT_1_KEY` … `WALLET_AGENT_3_KEY` | 50,000 sat each | the agents `finetune`, `eval`, `inference` |
| `maker` | wallet-toolbox | `WALLET_MAKER_KEY` | 30,000 sat | Coop Rail maker, validations 4 and 6 |

Server wallet databases are `data/wallets/<name>.sqlite` (git-ignored). Public identity keys are in `config/identities.json` (committed). Server wallets are hot wallets: keep only what their work needs; the bulk stays in the treasury.

## 2. Setup (once per machine)

```bash
npx npm@11 install                                   # npm 10.9 cannot install this workspace
git check-ignore -v .env data/                       # must print two lines
grep -v '^WALLET_.*_KEY=$' .env.example > .env       # only if there is no .env yet
chmod 600 .env
npx tsx scripts/keygen.ts --only-missing >> .env     # keys go to .env only
npm run identities -w @agentcoop/scripts             # opens the wallets, writes config/identities.json
node infra/preflight.mjs                             # spends nothing, prints no key
```

- `keygen.ts` refuses to print keys to a terminal; `--show` exists for deliberate use only. Do not run it through `npm run` with `>> .env`: npm's banner lines would land in `.env`.
- Copy the `WALLET_*_KEY` lines into the team's password manager. A lost wallet is reopened from the same key and resyncs from the chain.
- Node 24 is recommended for the `tsx` scripts; the test suite runs on Node 22 or newer.

## 3. Funding (on the machine where the treasury BSV Desktop is open)

1. BSV Desktop must be open, unlocked and on mainnet. The first connection asks for permission for `agentcoop.local` (`APP_ORIGINATOR`); every payment is a separate approval.
2. **First mainnet payment (≤ 1,000 sat).** Nothing larger goes out until this one succeeds:
   ```bash
   npm run fund -w @agentcoop/scripts -- agent-1=1000
   ```
3. Then the rest, with `--dry-run` first to see the plan (at most `--max-total`, default 400,000 sat, per run):
   ```bash
   npm run fund -w @agentcoop/scripts -- agent-1=49000 agent-2=50000 provider-api=20000 --dry-run
   npm run fund -w @agentcoop/scripts -- agent-3=50000 guard=5000 maker=30000
   ```
4. **Desktop to Desktop** (vault owner, participant):
   - on the receiving machine: `npm run identities -w @agentcoop/scripts -- --desktop desktop-owner`, and share `config/identities.json`;
   - on the treasury: `npm run fund -w @agentcoop/scripts -- desktop-owner=60000 desktop-human=30000`, which writes `data/payments/*.json`;
   - move that file to the receiving machine and run `npx tsx --import @agentcoop/core/register-sdk scripts/receive.ts --desktop <file>` (from the repo root, so the path resolves).
5. Check: `npm run balances -w @agentcoop/scripts` (`--desktop` also shows the AgentCoop baskets; a Desktop's own balance is visible only in its UI).
6. Record each txid the scripts print ([reference/transactions.md](reference/transactions.md)).

## 4. Out of funds

1. `npm run balances -w @agentcoop/scripts` shows who ran out.
2. If the treasury has satoshis: `npm run fund -w @agentcoop/scripts -- <name>=<sats>`.
3. Most spending circulates inside the team: pledges and fees go to the provider. Move pool revenue back with `provider-cli sync-revenue` and `sweep-revenue`.
4. Otherwise continue on the mock chain and note the missing mainnet steps.

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `BSV Desktop not reachable` | Desktop closed or locked | Open and unlock it (ports 3321 / 2121). `WALLET_SUBSTRATE=json-api` pins the CLIs to `http://localhost:3321` if `'auto'` fails with "fetch failed" |
| `createAction failed with HTTP status 400 … nothing was sent` | Not enough satoshis in Desktop, or the approval was refused | Check the balance in Desktop; retry |
| `BSV Desktop is on testnet` | Wrong network | Use a mainnet wallet, or `NETWORK=test` in `.env` |
| `first mainnet run: send one payment of ≤ 1000 sats first` | First-payment lock | Run step 3.2 first |
| `! not accepted yet … The payment is safe in data/payments/…` | Temporary SPV or network error while receiving | `npx tsx --import @agentcoop/core/register-sdk scripts/receive.ts <file>`; receiving the same payment twice is harmless (tested) |
| `WALLET_…_KEY is not set in .env` | Missing key | `npx tsx scripts/keygen.ts --only-missing >> .env` |
| `script[serializedBytes] is not a function` | Two copies of `@bsv/sdk` | Start Node scripts with `tsx --import @agentcoop/core/register-sdk` (the npm scripts do); delete a stale `node_modules` folder inside `scripts/` left by an old checkout |
| `does not provide an export named …` | Same cause | Same fix |
| Arcade `REJECTED` / `DOUBLE_SPEND` | A spent or conflicting input | Do not rebuild blindly; in a signing round the coordinator blacklists the input and retries |
| A transaction is not on the overlay | Its parent is missing there | `npx tsx --import @agentcoop/core/register-sdk scripts/lineage-check.ts <outpoint>`; `TokenKit.sync()` resubmits parents from the chain |
| A signing round times out | A participant did not answer within 60 s | `GET /pools/:id` → `coordinator.blacklist` shows why; after 3 rounds the pool stays open and a new pledge starts a new attempt |
| A person missed the Desktop approval | Round timeout | Keep `participant-cli sign` open; the next round asks again |

## 6. Security notes

- `.env` mode 600, git-ignored; check with `git check-ignore -v .env data/` after any `.gitignore` change. `.git/info/exclude` can hold a local backup rule.
- No script prints a key; error messages name the variable only.
- Payment hand-off files (`data/payments/`) hold a transaction and BRC-29 derivation data, no secret key, and are git-ignored anyway.
- CI uses no repository secrets. Do not store wallet keys as GitHub Actions secrets: anyone with push access can write a workflow that reads them.

## 7. A full mainnet run, in order

Each step names who acts and where. Every script prints the WhatsOnChain link of what it sent.

| # | Step | Where | Command | Check |
|---|---|---|---|---|
| 1 | Services | repo machine | `npm run infra` (overlay :8080 + coordinator :8090), `npm run guard -w @agentcoop/guard`, `npm run provider` | `node infra/preflight.mjs`: services ✓, coordinator "signing rounds on" |
| 2 | First payment | treasury Desktop | `npm run fund -w @agentcoop/scripts -- agent-1=1000` | txid printed |
| 3 | Desktop signs `SINGLE\|ACP` (validations 2 and 3) | a machine with BSV Desktop | `npx tsx --import @agentcoop/core/register-sdk scripts/spike-sighash.ts` | Arcade accepts; count the approval windows |
| 4 | Fund the server wallets | treasury Desktop | §3 | `node infra/preflight.mjs --wallets` |
| 5 | Walking skeleton (T1, T2, T3 × 2, T5) | repo machine | `npx tsx --import @agentcoop/core/register-sdk scripts/skeleton.ts` | the overlay shows the pool `settled` |
| 6 | Lineage without the overlay (validation 7) | repo machine | `npx tsx --import @agentcoop/core/register-sdk scripts/lineage-check.ts <T5 txid>_1` | `ok: true` |
| 7 | Credit token (T1) | provider operator Desktop | `npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0` | token id written to `apps/provider-api/products/gpu-h100.json`; a running provider API picks it up within 5 s |
| 8 | Pool and offer (T2) | provider operator Desktop | `npm run provider-cli -- open-pool --credits 40 --price 1000 --deadline +144 --fee 100 --min 5 --label "8×H100 · 1 week"` | `GET /pools` shows `hasOffer` |
| 9 | Pledges (T3) | repo machine; a person on their Desktop | `npm run agents`; `npm run participant-cli -- pledge <poolId> 12`, then `npm run participant-cli -- sign` | `GET /pools/:id` → `pledgedCredits` |
| 10 | Settlement (T5) | coordinator, automatic | — (the person approves within 60 s) | `GET /pools/:id/audit` → `consistent`; `GET /metrics` → `custodiedSats: 0` |
| 11 | Redeem (T6) and retail 402 (T7) | repo machine | `npm run agent -- eval --jobs 3` | txids in the agents' `activity.log` |
| 12 | Vault (T9) and validation 5 | vault owner Desktop | `npm run owner -w @agentcoop/owner-cli -- create-vault --agent agent-1`, `… policy …`, `… fund <vaultId> 20000`, then `npm run adopt -w @agentcoop/guard -- agent-1 <vaultId>` | overlay `{ op: 'vaults', owner }` shows `verified: true` |
| 13 | Vault agent in a pool (T10) | repo machine | set `FINETUNE_VAULT_ID` and `GUARD_URL`, repeat steps 8–10 | guard `/decisions` shows `approved` |
| 14 | Market (T8) | repo machine | agents list surplus and sweep automatically, or `npm run market-sweep -w @agentcoop/scripts` | `GET /listings` empties |
| 15 | Owner withdrawal (T9) | vault owner Desktop | `npm run owner -w @agentcoop/owner-cli -- withdraw <vaultId>` | vault balance 0 |
| 16 | nLockTime (validation 4) | repo machine | `npm run validation4 -w @agentcoop/scripts -- --yes` | refused before, accepted after the lock height |
| 17 | Coop Rail (T11, optional) | repo machine + Base Sepolia | [RAIL-POC.md](RAIL-POC.md) | txid and BaseScan link |

**A pool settles only when it is exactly full.** Size N to the pledges you expect: the three agents' default 7-day need is 17 + 11 + 12 = 40 credits; to add a person pledging 12, open `--credits 52 --price 1300`. `--price` is the price of the whole pool, not per credit: the rules brain skips a pool that is not at least 10 % under retail (50 sat per credit) after fees.

Budget for the whole run: about 300,000 sat across the wallets in §1; only a few thousand are actually consumed (fees, non-refundable registration fees, retail 402), because pledges and pool prices go to the team's own provider. The 31 October run is recorded in [reference/transactions.md](reference/transactions.md).
