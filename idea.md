# AgentCoop — Non-custodial buying pools for AI agents on BSV

*(working name)*

## One-liner

AI agents pool their purchasing power to buy bulk packages (GPU time, reserved LLM capacity, data bandwidth) at volume prices. The purchase settles in a single BSV transaction **only when the pool is full**. Until that moment, nobody's money leaves their own wallet.

---

## The problem

### 1. Agents already spend money, but always at list price

Agents that research, write code or process data consume paid APIs, compute and data all day long. Each call is bought individually at the retail rate.

Agent payment rails are growing fast. x402 alone passed roughly 165 million transactions and about $50M in cumulative volume by April 2026. Yet all of that volume settled at fixed per-call prices. There is no mechanism for an agent to bring its usage history and get a volume rate.

### 2. The real discounts sit behind commitments small teams cannot make

Providers do give large discounts, but only for big, long, upfront commitments:

| Resource | Retail / on-demand | Committed / bulk | The barrier |
|---|---|---|---|
| H100 GPU (Lambda) | $3.29 / GPU-hr | ~$2.63 / GPU-hr with 1-year reservation (~20% off) | 1-year term |
| H100 GPU (CoreWeave) | $6.16 / GPU-hr on-demand | Up to 60% off reserved (sales-negotiated) | Minimum unit is 8 GPUs, no exceptions |
| OpenAI Scale Tier (GPT-4.1) | Pay-as-you-go | $110/day per input unit (30k TPM), $36/day per output unit (2.5k TPM) | Each unit bought for at least 30 days |
| AWS Bedrock Provisioned Throughput | Pay per token | ~$20,160/month for 1 model unit of Claude 3 Sonnet with a 1-month commitment (third-party illustrative example) | Thousands of dollars per month upfront |
| Residential proxy bandwidth (Bright Data) | $4/GB pay-as-you-go | ~$3.50/GB on the 141 GB plan; 40–60% off is common at 1 TB+ | Monthly plan or enterprise negotiation |

On top of this, GPU providers have become resistant to H100/H200 terms shorter than six months. One-year H100 reserved prices rose about 40% (from ~$1.70 to ~$2.35 per hour) between October 2025 and March 2026.

A five-person AI startup cannot commit to eight GPUs for six months, or to $5,000+ per month of reserved model capacity. So it pays retail forever.

### 3. Pooling today needs someone to hold the money

The classic way around minimum commitments is group buying: Kickstarter, buying groups, purchasing cooperatives. All of them work the same way. Everyone sends money to an intermediary first, and the intermediary refunds if the goal is not reached.

For autonomous agents this is a bad fit:
- Funds sit with a third party during the campaign, which creates **custody risk**.
- The agent has to trust that the refund will actually happen.
- Refunds cost time and fees.

---

## The idea

AgentCoop is a **buying cooperative for AI agents** built on BSV.

1. A provider (or an organizer) publishes a **pool**: a bulk package, its discounted price, the target and a deadline.
2. Agents that need that resource **pledge** their share from their own wallets.
3. The moment the pledges add up to the target, a **single transaction** pays the provider and the pool is done.
4. If the target is never reached, the pledges are simply never used. **Nobody's money ever moved**, so there is nothing to refund.

Each participant receives its share as **credits** (tokens) in its own wallet. It spends them on the provider's API, or sells any leftover share to other agents.

### Core properties

- **All-or-nothing.** Either everyone gets the bulk price or nothing happens.
- **Non-custodial.** No platform, no organizer and no provider holds pooled funds at any point. Each pledge stays in the pledger's wallet until settlement.
- **Agent-native.** Agents discover, evaluate, join, use and resell on their own, within a budget their owner set.
- **Liquid.** Shares are tokens. Over-estimated needs can be sold, so committing is less risky.

---

## How it works

### Actors

| Actor | Role |
|---|---|
| **Provider** | Sells the bulk package (compute, model capacity, data, API calls) and issues credits to participants. |
| **Agent owner** (human / team) | Gives the agent a one-time mandate: budget, maximum per pool, allowed providers. |
| **Agent** | Does its main job; when it needs a paid resource, it evaluates pools and pledges. |
| **Pool organizer** | Optional. An agent or person who spots a volume tier and opens a pool for it, possibly for a small fee. |
| **Resale market** | Where agents buy and sell leftover pool shares. |

### Pool lifecycle

1. **Offer.** The provider publishes a pool. Example: "1,000,000 tokens of reserved capacity at 50% off list, sold as 100 shares of 10,000 tokens, target 100 shares, deadline Friday 18:00." The pool fixes the payment output: the total price goes to the provider's address.

2. **Pledge.** An agent decides it needs, say, 8 shares. It sets aside a coin of exactly that value in its own wallet and signs it into the pool. The signature says: *"this coin may only be spent in a transaction that pays exactly these outputs, whoever else contributes."* The signed pledge is shared with the pool; the coin itself stays in the agent's wallet.

3. **Fill and settle.** As pledges arrive, a progress bar fills up. When the pledged value equals the target, the pledges are combined into one transaction and broadcast. The provider is paid in one atomic step.

4. **Delivery.** The provider issues each participant's share as credit tokens to the wallet that signed the pledge.

5. **Use.** The agent spends its credits on the provider's API through an HTTP 402 payment flow, just like any other paid call.

6. **Resale.** An agent that over-estimated its need lists the remaining credits on a non-custodial order book. The tokens are locked so that the only way to take them is to pay the seller the asking price, in one transaction. Other agents buy them below list price.

7. **Failure case.** The deadline passes without enough pledges. Nothing is broadcast. Every agent still holds its coin and can use it elsewhere. An agent can also withdraw a pledge at any time before the pool fills, simply by spending that coin.

### Why the money never moves early

Bitcoin-style transactions let a signer commit to *their own input and the outputs only*, while leaving other inputs open (signature mode `SIGHASH_ALL | SIGHASH_ANYONECANPAY`). Many people can therefore each sign one coin toward the same fixed payment.

The combined transaction is **invalid until the inputs cover the outputs**, so the provider cannot claim anything before the pool is full.

This construction is called an *assurance contract*. It was used for peer-to-peer crowdfunding on Bitcoin as early as 2014 (Mike Hearn's Lighthouse). The BSV TypeScript SDK exposes the `SIGHASH_ANYONECANPAY` flag on transaction signatures. Pools are sold in **fixed-size shares** so that pledges add up exactly to the target.

---

## What the agent actually does

The agent's main job is **not** pooling. Its main job is research, coding, customer support, data processing, whatever its owner deployed it for. Pooling is how it **buys** the paid resources that job consumes. Think of a farmer who buys fertiliser through a cooperative: farming is the job, the cooperative is the purchasing method.

### The owner's one-time mandate

> "Every morning, research our sector and send me a summary. Spend at most $20 a week. Use group deals when they make sense, but never commit more than $5 to a single pool, and only with these providers."

After that, the owner never thinks about purchasing again.

### The agent's decision checklist

When the agent sees an open pool for a resource it uses, it answers four questions:

1. **Need.** Will I actually use this much? It forecasts from its own usage history, e.g. "I make ~60 searches a day, so ~420 a week."
2. **Price.** Is the pool price below what I pay today, including the resale value of any leftover?
3. **Timing.** Does the pool's deadline and validity window match when I need the resource?
4. **Budget and policy.** Does it fit the owner's limits and allowed providers?

If all four are yes, it pledges. If the pool fails, it simply keeps buying at retail.

### Example decision log

```
[09:02] Pool found: SmartRoute reserved capacity, 1M tokens, 50% below list, closes in 2 days.
[09:02] My forecast: ~80k tokens this week (based on last 14 days of usage).
[09:02] Current balance covers 3 more days. Pool timing OK.
[09:02] Cost of 8 shares = 2,000 sats, within weekly budget and per-pool cap.
[09:02] Decision: PLEDGE 8 shares.
[11:47] Pool filled (100/100). Settlement tx broadcast. 8 credit shares received.
[Fri]   Week ended with 1.5 shares unused -> listed on resale book at 90% of pool price.
```

### Roles an agent can take

- **Buyer.** Joins pools for resources it consumes.
- **Seller.** Resells unused shares so it does not waste over-commitment.
- **Organizer.** Notices that a provider has a volume tier ("20% off above $1,000 per cycle") and opens a pool to reach it, inviting other agents.
- **Hedger (future).** Commits today to next month's capacity at today's price. Relevant in markets where prices move fast, like GPU reservations that rose ~40% in five months.

---

## Example scenarios

### 1. Shared GPU block for fine-tuning

**Situation.** Twelve small AI teams each run an agent that periodically fine-tunes or evaluates models. Each needs a few dozen H100 hours a week. None of them can rent the 8-GPU minimum unit for months, so they pay on-demand rates.

**Pool.** A GPU provider (or a resale-friendly GPU marketplace) offers an 8×H100 block for one week at a reserved-style price. The agents pledge hours; when the block is fully pledged it is purchased in one transaction and each team's agent receives hour credits for its slot.

**Why it is real.** SF Compute, now a GPU marketplace, started exactly this way. A startup with excess compute organised a shared GPU arrangement with other startups, and around 170 AI companies joined within weeks. Its customers include Harvard, Princeton, Phind and Liquid AI, and its tenants can resell reserved hours they do not use. AgentCoop applies the same logic, but agents join on their own and no one holds the pooled money.

### 2. Reserved LLM capacity through a router (SmartRoute)

**Situation.** Reserved model capacity (OpenAI Scale Tier, Bedrock Provisioned Throughput) offers lower latency, SLAs and fixed pricing. But it costs thousands of dollars per month with 30-day minimums, and it is tied to a single account.

**Pool.** SmartRoute, an LLM router that is itself the service provider, opens a pool: "one month of reserved capacity for model X, sold in token shares." If enough agents pre-commit, SmartRoute buys the capacity under its own provider agreement and serves the participants through its own API. They spend credits via HTTP 402.

**Why it works.** The router turns a large, single-account commitment into many small, tradable shares, and it only buys capacity once demand is proven and paid for. That is also its main business value: zero inventory risk.

### 3. Web data and proxy bandwidth for research agents

**Situation.** Web-research and scraping agents consume residential proxy bandwidth. Pay-as-you-go is about $4/GB; committed plans and enterprise deals go much lower (40–60% off at 1 TB+ is common).

**Pool.** A partnered data provider offers a 1 TB monthly package as a pool. Thirty startups' research agents pledge GB shares, and each receives its own bandwidth credits from the provider.

### 4. Reaching API spend tiers

**Situation.** Some APIs reward spend levels rather than volume contracts. For example, the X API (pay-per-use since February 2026) returns part of the spend as xAI credits: 10% from $200 per cycle, 15% from $500, 20% from $1,000.

**Pool.** An organizer agent opens a pool to reach a higher tier on a provider that offers group or partner accounts. Participants get the better effective rate.

**Caveat.** At small volumes many APIs are moving to plain pay-per-use, so tier-pooling is the weakest scenario. The strongest scenarios are those with large minimum commitments (1–3).

### 5. Hackathon demo scenario

SmartRoute opens a pool for a token package:
1. Several demo agents with different workloads forecast their need and pledge.
2. The progress bar fills, and one settlement transaction appears on WhatsOnChain.
3. Credits land in each agent's wallet.
4. One agent pays for an LLM call with its credits via HTTP 402.
5. Another agent sells its leftover share on the order book.
6. A second pool that never fills shows that no balance changed.

### Scenario summary

| Scenario | Discount gap | Minimum-commitment barrier | Account-sharing issue | Strength |
|---|---|---|---|---|
| GPU blocks | Very high | Very high | None on resale-native markets | Strongest |
| Reserved LLM capacity via router | High | Very high | Solved by router acting as provider | Very strong |
| Proxy / web data | High | Medium | Needs provider partnership | Medium |
| API spend tiers | Low–medium | Low | Needs provider partnership | Weak |

---

## Legal model

**Joint purchasing is legal.** In EU competition law, joint purchasing arrangements are a recognised form of cooperation. When the participants' combined market share stays at or below 15% on both the purchasing and selling markets, they generally fall in a "soft safe harbour." Agent pools sit far below that threshold.

**Sharing one account is not.** Many providers forbid exactly the naive version of this idea. OpenAI's business terms prohibit:
- making account credentials available to third parties,
- sharing a login between users,
- reselling or leasing account access,
- buying, selling or transferring API keys.

A similar clause appears on 109 of 352 platforms tracked by one terms-monitoring service. "One account, twenty agents sharing the key" would get the account banned.

**What is shared is a contract, not an account.** Three compliant models:

1. **Provider-run pools (default).** The provider itself sells the group package and gives every participant its own credits or keys. The provider is the seller; AgentCoop is the venue. The provider benefits from upfront, guaranteed revenue and new customers.
2. **Resale-native markets.** Some markets explicitly allow resale of what you bought, e.g. SF Compute lets tenants sell back reserved GPU hours.
3. **Intermediary service.** A router or reseller (the OpenRouter / SmartRoute model) buys capacity under its own provider agreement and sells *its own service* to participants.

*This is not legal advice. Each provider's terms need to be checked for a real deployment.*

---

## Why BSV

- **Assurance contracts are native.** The all-or-nothing, nobody-holds-the-money mechanism comes straight from Bitcoin script signature modes. No pooled funds sit in a contract during the campaign: they stay in each participant's wallet until the pool fills. On account-based chains, the equivalent design usually requires funds to be deposited into a smart contract first.
- **Fees are negligible.** WhatsOnChain's recommended fee rate is around 100 sat/KB, roughly $0.00001 per kilobyte (June 2026). Pledges worth a few cents are viable, so hundreds of agents can join a single pool.
- **Every building block exists in the BSV stack:**
  - **BSV-21 tokens** for pool shares and credits.
  - **OrdLock order books** for non-custodial resale: the seller's tokens unlock only when the seller is paid.
  - **HTTP 402 payments (BRC-121)** for spending credits on provider APIs.
  - **BRC-100 wallets** (BSV Desktop, BSV Browser) for human owners and providers.
  - **`@bsv/simple/server`** for self-custodial agent wallets.
- **It creates on-chain demand.** Every pool is a settlement transaction, every share a token, every resale a trade, every credit spend a micropayment.

---

## Fit with the BSV "DeFi Rails for Agentic Payments" track

| Track expectation | How AgentCoop answers it |
|---|---|
| A useful DeFi product | Non-custodial group buying (collective funding) plus a secondary market for pool shares. |
| Gives people and agents a reason to use BSV | Volume prices that are otherwise out of reach, settled with fees low enough for cent-sized pledges. |
| Adoption, users or liquidity for BSV | Each provider that lists pools brings its own customer base; pool shares create tradable token markets. |
| Non-custodial | Pledges never leave the pledger's wallet until settlement; resale uses OrdLock. |
| Standard BSV wallet | Providers and agent owners act through BRC-100 wallets. |
| Real transactions | Pool settlements, credit transfers, resales and 402 payments, all visible on WhatsOnChain. |
| A real agent payment | Agents pledge into pools and pay for API calls with their credits. |
| Originality | None of the example ideas covers agents coordinating to buy together. |

---

## Market and evidence

### Pooled purchasing is a proven business model
- In the US, the group purchasing organisation industry, where hospitals buy collectively, is worth about $7.8bn in 2026.
- In AI compute, SF Compute grew out of an informal GPU-sharing collective of ~170 startups.

### The gap is documented
- Agent payments run at fixed per-call prices, with no volume-pricing mechanism.
- x402 handled ~165M transactions and ~$50M by April 2026, all at those fixed rates.

### Momentum is building
- Ramp integrated x402 for more than 70,000 businesses in August 2026.
- The x402 Foundation launched in July 2026 with members including Visa, Mastercard, Stripe, AWS and Google.

### Honest sizing
- Truly autonomous agent spending is still small. TRM Labs measured agent-moved volume on x402 at roughly $5,000–11,000 per month.
- OKX Ventures notes that most agents still run on API keys and subscriptions.

### Who the first customers are
- **Buy side:** small AI teams and agent operators whose agents consume compute, model capacity and data. A human sets the budget, the agent executes.
- **Sell side:** compute, model and data providers (including routers like SmartRoute) that want committed, prepaid demand before they buy capacity themselves.

### Value for each side

| Party | What they get |
|---|---|
| Agent owners | Volume prices without volume commitments; no custody risk; leftover shares are resellable. |
| Providers | Upfront, all-or-nothing committed revenue; a demand signal before reserving capacity; access to many small customers at once. |
| Organizers | A role (and possible fee) in discovering tiers and assembling pools. |
| BSV network | Recurring settlement transactions, token markets for shares, micropayment volume from credit spending. |

---

## Risks and open questions

- **Pledge withdrawal at the last second.** A pledger can spend its coin before settlement, which invalidates a "full" pool. Every pledge must be checked as unspent at broadcast time, and the pool must be able to replace missing pledges.
- **Credit delivery trust.** Payment is atomic, but issuing credits happens after settlement. Making payment and credit delivery atomic in the same transaction (e.g. fixed-slot pools with pre-committed credit outputs) is an open design question.
- **Wallet support.** Agents sign through the SDK, which supports the required signature mode. Whether BRC-100 wallets like BSV Desktop let humans sign `ANYONECANPAY` pledges needs confirmation.
- **Forecast errors.** Agents may over-commit. The resale market is the mitigation.
- **Provider participation.** The compliant model depends on providers (or routers) offering pools. Early on, routers like SmartRoute are the natural first sellers.
- **Market timing.** Autonomous agent spending is still small today; the near-term customer is the human team behind the agents.

---

## Glossary

| Term | Meaning |
|---|---|
| **Assurance contract** | A funding agreement that only executes if the total target is reached; otherwise nobody pays. |
| **`SIGHASH_ANYONECANPAY`** | A signature mode where a signer commits only to their own input and the outputs, so others can add inputs. |
| **BSV-21** | Fungible token standard on BSV (comparable to ERC-20). |
| **OrdLock** | A script that locks a token so it can only be taken by paying the seller a fixed price, in one transaction. |
| **HTTP 402** | "Payment Required" status code, used to gate API calls behind a micropayment. |
| **BRC-100 wallet** | Standard BSV wallet interface (BSV Desktop / BSV Browser) that signs for apps without exposing keys. |
| **Non-custodial** | No third party ever holds the user's funds. |

---

## References

- x402 at 165M transactions, fixed per-call pricing: https://dev.to/t49qnsx7qtkpanks/x402-hit-165-million-transactions-heres-what-it-still-cant-do-4f4d
- TRM Labs, measuring AI agent payments on-chain: https://www.trmlabs.com/trm-tech-blog/whos-actually-paying-measuring-ai-agent-payments-onchain
- OKX Ventures report on the agent economy: https://www.mexc.com/news/1000581
- Ramp x402 integration, x402 Foundation members: https://ecosistemastartup.com/pagos-de-agentes-ia-64m-transacciones-us120k-en-2026/
- Lambda H100 pricing 2026: https://www.spheron.network/blog/lambda-cloud-h100-pricing-2026/
- CoreWeave vs Crusoe pricing 2026: https://www.spheron.network/blog/coreweave-vs-crusoe-h100-and-b200-pricing-2026/
- GPU reservation contracts 2026: https://www.spheron.network/blog/gpu-cluster-reservation-contract-negotiation-2026/
- SF Compute origin (≈170 companies): https://www.spheron.network/blog/spheron-vs-sf-compute/
- SF Compute resale of reserved capacity: https://computeprices.com/providers/sf-compute
- SF Compute customers: https://www.bnnbloomberg.ca/business/technology/2024/07/16/jack-altmans-firm-backs-startup-for-trading-ai-computing-power/
- OpenAI Scale Tier: https://openai.com/api-scale-tier/
- AWS Bedrock provisioned throughput example: https://inventivehq.com/blog/aws-bedrock-pricing-guide
- Bright Data pricing: https://proxy-pricing.pages.dev/brightdata-pricing
- Residential proxy enterprise discounts: https://trustmyip.com/blog/best-residential-proxy-providers
- X API pay-per-use and credit kickback tiers: https://www.upload-post.com/x-api-pricing/
- OpenAI business terms (credential sharing / resale): https://openai.com/policies/aug-2023-business-terms/
- API key transfer clause frequency: https://conductatlas.com/platform/openai/openai-business-terms/provision/CA-P-059975/prohibition-on-buying-selling-or-transferring-api-keys/
- EU joint purchasing safe harbour: https://www.crowell.com/en/insights/client-alerts/getting-ready-for-a-group-discount-the-european-commissions-updated-guidance-on-joint-purchasing-arrangements
- US GPO market size: https://www.ibisworld.com/united-states/market-size/group-purchasing-organizations/5963/
- Assurance contracts / Lighthouse: https://coingeek.com/crowdfunding-on-bitcoin and https://wiki.p2pfoundation.net/Lighthouse
- `SIGHASH_ANYONECANPAY` for crowdfunding: https://www.learnbitcoin.com/glossary/sighashanyonecanpay
- BSV TS SDK `TransactionSignature` (ANYONECANPAY flag): https://cdn.jsdelivr.net/npm/@bsv/sdk@2.0.13/dist/types/src/primitives/TransactionSignature.d.ts
- BSV fee rates (WhatsOnChain): https://www.whatsonchain.com/
- ts-stack (BSV TypeScript stack): https://bsv-blockchain.github.io/ts-stack/
- BRC-121 Simple 402 Payments: https://hub.bsvblockchain.org/brc/payments/0121
- OrdLock: https://coingeek.com/?p=535615
