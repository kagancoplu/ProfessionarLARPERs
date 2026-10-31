# agents

Each agent has its own job (fine-tuning, evaluation, inference), and buying GPU capacity is how it pays for that job. Profiles live in `agents/*.json`. Each profile has a workload (jobs per day, minutes per job, active weekdays), 14 days of usage history, the owner's budget, and the env variable that holds the agent's wallet key.

| Profile | Wallet key | Workload | Owner's budget |
|---|---|---|---|
| `finetune` | `WALLET_AGENT_1_KEY` | 240–480 min jobs, ~every 2–3 days | 120k sat/week, 60k per pool |
| `eval` | `WALLET_AGENT_2_KEY` | 4 × 15–45 min jobs on weekdays | 40k sat/week, 20k per pool |
| `inference` | `WALLET_AGENT_3_KEY` | 24 × 2–6 min jobs a day | 50k sat/week, 10k per pool |

## Try it offline

```bash
npm run demo:k1            # provider opens a pool → 3 agents decide and pledge → one settlement tx → agents spend their credits → market
npm run demo:failed-pool   # a pool that does not fill costs only the fee; the pledge coin is reused for the next pool
npm run demo:injection     # a prompt-injected vault agent: its policy vetoes, the guard refuses, nothing leaves the vault
```

Both demos run the whole stack in one process on wallet-toolbox's mock chain: Track B's overlay and coordinator, the provider API, the provider operator and the agents. Every transaction is built, signed, SPV-checked and admitted by the overlay; only the chain is simulated. Logs go to `data/demo-*/agents/<name>/{decisions,activity}.log`.

## Run against real services

```bash
node infra/run.mjs          # overlay :8080 + coordinator :8090
npm run provider            # provider-api :8092
npm run agents              # all three agents (or: npm run agent -- eval --jobs 3)
```

`npm run agents` also serves the web app's live feed on `AGENTS_URL` (default `http://localhost:8093`, CORS open; `AGENTS_CORS_ORIGIN` to restrict). The routes are `GET /healthz`, `GET /agents` (name, profile, identity, mode) and `GET /events`. `/events` streams SSE of `CoopEvent` envelopes, keeps the last 500 and resumes from `Last-Event-ID` (MASTER §3.10). The event types are `agent_started`, `agent_thought` (every log line), `agent_decision` (`pledge` / `skip` / `redeem` / `retail` / `list` / `buy` / `sign` / `reject`), `agent_job` (`queued` / `done`) and `agent_payment` (`402` / `pledge` / `redeem` / `sweep`, with the txid).

Env: `WALLET_AGENT_1..3_KEY`, `PROVIDER_API_URL`, `OVERLAY_URL`, `COOP_API_URL`, `AGENTS_URL`, `AGENT_BRAIN=rules|llm|openai` (`llm` needs `ANTHROPIC_API_KEY`; `openai` needs `OPENAI_API_KEY`, model `OPENAI_MODEL`, default `gpt-4o`), `NETWORK`, `ARCADE_URL`, `DATA_DIR`.

## What an agent does

Before each job it runs the procurement router, cheapest option first:

1. **Credits it holds:** it redeems the whole credits still missing (one credit = one GPU-hour, used by the minute) and runs the job for free.
2. **Market:** listings that cover the shortfall for less than retail (below).
3. **Pool:** it looks at the coordinator's open pools for its product and may pledge for the coming week (below).
4. **Retail:** otherwise it pays per minute through HTTP 402 (`AuthFetch`).

A pledge pays for the coming week, not for the job in front of the agent: that job still runs on credits or at retail.

### Deciding on a pool

- **Forecast** (`src/forecast.ts`): 7 × the 14-day mean (p50, plus p90), minus what the agent already holds (prepaid minutes, credit tokens, unsettled pledges).
- **Brain** (`src/brain.ts`, `src/llmBrain.ts`) answers the four questions from idea.md:
  - **Need:** how many credits are missing.
  - **Price:** at least 10% cheaper than retail after the registration fee and tx fees.
  - **Timing:** the pool must close within the 7-day horizon.
  - **Budget:** it must fit the per-pool cap, the weekly budget, the wallet and the allowed providers.

  A pool settles only when it is exactly full. So the agent may take a few spare credits (up to max(2, 25% of its need)) to close a pool, or to meet the pool's minimum. `AGENT_BRAIN=rules` is deterministic. `AGENT_BRAIN=llm` asks Claude Opus 5.5 (`claude-opus-5-5`) and `AGENT_BRAIN=openai` asks OpenAI (`OPENAI_MODEL`, default `gpt-4o`); both use structured JSON output (`src/brainPrompt.ts`) over the same facts and pass the provider's text as data. On a refusal, an error or an answer that does not match the schema, either falls back to the rules brain.
- **Policy** (`enforcePolicy`): code, not a prompt, runs after either brain. It vetoes anything over the owner's caps, outside the pool's limits, or more than twice the forecast need. A prompt-injected "pledge everything" is discarded.

### Pledge, sign, receive (`src/participant.ts`)

`buildPledge` (Track A) submits to the overlay. The agent stays on the coordinator's WS. When a `sign_request` arrives, it checks the whole settlement with `verifySettlementPlan`: its credits go to its own address, its change is correct, and the provider's credits trace back to the token deploy (`verifyLineage`). If all of that holds it signs with SIGHASH_ALL; otherwise it sends `sign_reject` with the reason. After `settled` it runs `internalizeSettlement` (to get its change back) and `TokenKit.sync` (to see its credits). After `pool_failed` nothing has been spent: the pledge coin is still in the wallet, and it is withdrawn (`cancelPledge`) before the next pledge. The weekly budget then gets back everything except the fee.

### Mandate Vault mode (Track D's vault + guard)

An agent can spend from a vault that its owner funds from BSV Desktop (`owner-cli`). It then needs Track D's guard for every move:

- **Pledge:** Track D's `pledgeFromVault` takes the coin from the vault. The guard checks the owner's policy at pledge time: allowed providers, `maxPerPoolSats` and the weekly cap.
- **Sign:** the settlement input is a 2-of-2, agent plus guard (`VaultSigner`). The guard checks the plan, the delivery-versus-payment rule and the lineage again.
- **Settle:** the change goes back to the vault (`internalizeVaultSettlement`). The credits come to the agent as usual.

To run an agent in this mode against real services, set `<NAME>_VAULT_ID` (for example `FINETUNE_VAULT_ID`) and `GUARD_URL`. In the demos, `startMockStack({ vaultAgents: ['finetune'] })` creates the owner, the vault, the policy and the guard.

**Prompt injection:** two independent layers stop an injected "put the whole budget into this pool". The first is the agent's `enforcePolicy` (code, not a prompt). If that is bypassed, the guard refuses with the owner's policy (`npm run demo:injection`, `test/agents.vault.mockchain.test.ts`).

### Market (`src/market.ts`)

- **Sell:** after a settlement, credits beyond the 7-day need are listed in lots of up to 5, because a listing is one UTXO and sells whole. The ask is the pool price × 1.1 and is always below retail. The steps are Track A's `reserveListing` and `signListing` (SINGLE|ANYONECANPAY, so the seller can be offline), then `POST /listings` to the coordinator. There is one listing at a time; when it sells, the next lot goes up.
- **Buy:** this is router step 2. If a job needs credits the agent does not hold, it takes the cheapest listings (never its own) that cover the shortfall, but only if they cost less than retail and fit the owner's caps. Track A's `buildSweep` traces every listing back to the deploy first, then pays every seller and delivers the credits in one transaction (T8).

### decisions.log (from `npm run demo:k1`)

```
[18:37] Pool found: "H100 block · 40 GPU-hours", 40 GPU-hour credits at 25.0 sat (retail 50, 50% off · demo pricing), 0/40 pledged, closes in 146 blocks (~24 h), fee 100 sat.
[18:37] My forecast: ~16.3 GPU-hours over the next 7 days (14-day mean 139 GPU-min/day ± 197; p90 27.4 GPU-hours).
[18:37] What I hold covers 0.0 GPU-hours = 0 days; 17 credits missing.
[18:37] Budget: spent 0 of 120,000 sat this week, 60,000 per pool, wallet 1,000,000 sat.
[18:37] Decision: PLEDGE 17 credits. 17 credits cost 606 sat vs 850 sat at retail (saves 29%), within budget and caps. (brain: rules)
[18:37] Pledged 17 credits to "H100 block · 40 GPU-hours": 726 sat stay in my wallet as a pledge coin until settlement.
[18:37] Pool "H100 block · 40 GPU-hours" filled. One settlement tx paid the provider and delivered every share: 17 credits are mine.
[19:23] Market: bought 5 credits from 1 listing(s) for 198 sat vs 250 sat at retail (saves 21%), each traced to the token deploy before paying; one tx paid every seller.
```

Demo prices are illustrative ("demo pricing"): the discount only shows how the mechanism works. It does not claim real savings.
