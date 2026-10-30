# provider-api: simulated provider (GPU + proxy)

A paid job API protected with HTTP 402 (BRC-105). It sells two products: H100 GPU time and residential-proxy bandwidth. The work is simulated; the payments, credit tokens and settlement around it are real.

```bash
npm run provider          # http://localhost:8092 (PROVIDER_API_URL), needs WALLET_PROVIDER_API_KEY
```

| Method | Path | Price | What it does |
|---|---|---|---|
| `GET` | `/healthz` | free, no auth | liveness |
| `GET` | `/v1/catalog` | free | products, retail price, credit token, `credits.redeemTo` (this server's identity), open pools from `COOP_API_URL` |
| `POST` | `/v1/jobs` GPU `{ kind, minutes, product? }` · proxy `{ product: 'data-proxy', kind, mb }` | `ceil(units × retailSatsPerCredit / unitsPerCredit)` sats, or **free** if the prepaid balance covers the units | queue a simulated job (`finetune` / `eval` / `inference`, or `crawl` / `scrape`) |
| `GET` | `/v1/jobs/:id` | free | status, GPU log, result hash (only for the identity that paid) |
| `POST` | `/v1/credits/redeem` `{ beef, outputIndex }` | free | claim a BSV-21 credit transfer to this server as prepaid balance |
| `POST` | `/v1/credits/return` `{ credits, product? }` | free | send unused whole credits back as tokens |
| `GET` | `/v1/credits/balance` | free | the caller's prepaid balance per product: `prepaidUnits`, `returnableCredits` (GPU also `prepaidMinutes`) |

All routes except `/healthz` are mutually authenticated (BRC-103/104). Clients use the SDK's `AuthFetch`, which also pays 402 challenges automatically.

**Products are configuration plus a runner.** Each file in `products/` is one product: `{ id, label, unit, runner?, retailSatsPerCredit, minutesPerCredit? | unitsPerCredit?, demoPricing?, tokenId, simulate }`. `provider-cli mint --product <id>` writes the credit token id into it. A runner (`src/runners.ts`) defines the job kinds, the quantity field, the limit and the simulated log:

| Product | Runner | 1 credit | Retail | Job request |
|---|---|---|---|---|
| `gpu-h100` | `gpu` | 1 H100 GPU-hour = 60 min | 50 sat | `{ kind: 'finetune' \| 'eval' \| 'inference', minutes }` |
| `data-proxy` | `proxy` | 1 GB = 1024 MB | 40 sat | `{ product: 'data-proxy', kind: 'crawl' \| 'scrape', mb }` |

A new product of an existing kind is a new JSON file. A new kind of work is a new runner. Without `product` a request means the first GPU product.

**Credit unit:** one `gpu-h100` credit is **one H100 GPU-hour** (`minutesPerCredit: 60`, retail 50 sat per credit), and it is used up by the minute. A redeemed credit adds 60 minutes to the prepaid balance, each job debits its minutes, and whatever a job leaves over pays for the next job. Retail jobs are billed per minute as well: 30 min costs 25 sat and 8 h costs 400 sat.

**Redeem rules** (prepaid balances live off-chain and depend on trusting the provider, so they are capped):
- at most 20 credits per redeem and 20 credits (1,200 GPU-minutes) prepaid per agent. That is about one fine-tuning session;
- the output must be a transfer of a product's token, locked to one of this server's token addresses;
- the caller must have sent it (the transaction spends the caller's own token outputs), so nobody can claim a transfer they only saw on the overlay;
- the lineage must be genuine: Track A's `verifyLineage` walks the output back to the token's deploy. Ancestors come from the posted BEEF first and from Arcade after that; txids are recomputed, so a forged BEEF fails. The overlay is only used for discovery;
- each output can be redeemed only once.

Returns are in whole credits. A remainder smaller than one credit (e.g. 20 minutes) stays prepaid.

State in `DATA_DIR` (default `./data`, gitignored): `wallets/provider-api.sqlite`, `provider/jobs.json`, `provider/balances.json`, `provider/outbox.json`.
