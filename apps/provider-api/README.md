# provider-api: simulated GPU provider

A paid GPU-job API protected with HTTP 402 (BRC-105). The GPU work is simulated; the payments, credit tokens and settlement around it are real.

```bash
npm run provider          # http://localhost:8092 (PROVIDER_API_URL), needs WALLET_PROVIDER_API_KEY
```

| Method | Path | Price | What it does |
|---|---|---|---|
| `GET` | `/healthz` | free, no auth | liveness |
| `GET` | `/v1/catalog` | free | products, retail price, credit token, `credits.redeemTo` (this server's identity), open pools from `COOP_API_URL` |
| `POST` | `/v1/jobs` `{ kind, minutes, product? }` | `ceil(minutes × retailSatsPerCredit / minutesPerCredit)` sats, or **free** if the prepaid balance covers the minutes | queue a simulated `finetune` / `eval` / `inference` job |
| `GET` | `/v1/jobs/:id` | free | status, GPU log, result hash (only for the identity that paid) |
| `POST` | `/v1/credits/redeem` `{ beef, outputIndex }` | free | claim a BSV-21 credit transfer to this server as prepaid balance |
| `POST` | `/v1/credits/return` `{ credits, product? }` | free | send unused whole credits back as tokens |
| `GET` | `/v1/credits/balance` | free | the caller's prepaid balance: `prepaidMinutes`, `returnableCredits` |

All routes except `/healthz` are mutually authenticated (BRC-103/104). Clients use the SDK's `AuthFetch`, which also pays 402 challenges automatically.

**Products are configuration.** Each file in `products/` is one product: `{ id, label, unit, retailSatsPerCredit, minutesPerCredit?, tokenId, simulate: { minutesPerSecond, gpus? } }`. `provider-cli mint` writes the credit token id into it. A second product is a second file.

**Credit unit:** one `gpu-h100` credit is **one H100 GPU-hour** (`minutesPerCredit: 60`, retail 50 sat per credit), and it is used up by the minute. A redeemed credit adds 60 minutes to the prepaid balance, each job debits its minutes, and whatever a job leaves over pays for the next job. Retail jobs are billed per minute as well: 30 min costs 25 sat and 8 h costs 400 sat.

**Redeem rules** (prepaid balances live off-chain and depend on trusting the provider, so they are capped):
- at most 20 credits per redeem and 20 credits (1,200 GPU-minutes) prepaid per agent. That is about one fine-tuning session;
- the output must be a transfer of a product's token, locked to one of this server's token addresses;
- the caller must have sent it (the transaction spends the caller's own token outputs), so nobody can claim a transfer they only saw on the overlay;
- the lineage must be genuine: Track A's `verifyLineage` when it lands, until then the overlay must vouch for the output;
- each output can be redeemed only once.

Returns are in whole credits. A remainder smaller than one credit (e.g. 20 minutes) stays prepaid.

State in `DATA_DIR` (default `./data`, gitignored): `wallets/provider-api.sqlite`, `provider/jobs.json`, `provider/balances.json`, `provider/outbox.json`.
