# Credits, redemption and the market

What a buyer gets from a pool, how it spends it, and how it sells what it does not need.

## Credits are BSV-21 tokens

Each provider product has one BSV-21 token, minted once by the provider (T1). One credit is one unit of the product: in the bundled simulated provider, one `gpu-h100` credit is one H100 GPU-hour (used by the minute) and one `data-proxy` credit is one GB of proxy bandwidth (used by the MB). Credits never expire; there is one token per product so liquidity is not split.

Bitcoin Script does not enforce BSV-21, so a credit is only worth something if it descends, input by input, from its token's deploy:

- The overlay (`tm_agentcoop`) admits a credit output only under the BSV-21 rules: no inflation, no transfer minted from plain satoshis, no token X funding token Y (`packages/core/src/kit/rules.ts`).
- Participants, the guard and the provider do not take the overlay's word for it. `verifyLineage` fetches the ancestors (from the posted BEEF, Arcade or WhatsOnChain), recomputes every txid from the bytes and applies the same rules locally (`packages/core/src/verify/lineage.ts`). The overlay is used for discovery.

## Spending credits at the provider

The provider sells access to a paid API. A caller can pay in two ways.

**With credits (redeem).** The caller sends credits to one of the provider's token addresses in an ordinary BSV-21 transfer and posts it to `POST /v1/credits/redeem`. The provider adds the units to the caller's prepaid balance, and later jobs draw on that balance for free. The provider accepts a transfer only if:

- it is the product's token, sent to one of the provider's own token addresses;
- it moves at most 20 credits and leaves at most 20 credits prepaid for this caller;
- the caller itself spent its own token outputs in that transaction, so nobody can claim a transfer they only saw on the overlay;
- its lineage walks back to the token's deploy;
- it has not been redeemed before.

Unused whole credits can be sent back as tokens (`POST /v1/credits/return`). The prepaid balance is the one place where a provider holds value off chain, which is why it is capped at about one session's worth (T-6).

**At retail (HTTP 402).** Without enough prepaid balance, a job costs `ceil(units × retailSatsPerCredit / unitsPerCredit)` sats, charged through HTTP 402 with BRC-105 (`@bsv/auth-express-middleware`, `@bsv/payment-express-middleware`). Agents use the SDK's `AuthFetch`, which pays the challenge automatically (T7). Every route is mutually authenticated (BRC-103/104); the caller's identity key is its account. A payment is accepted once: the replay store is on disk and shared by every provider process on the host (T-17).

Endpoints and state: [apps/provider-api/README.md](../../apps/provider-api/README.md).

## The market

Credits a buyer does not need can be resold, atomically, with the same primitive the provider uses for its offer.

- **Listing.** A seller signs its credit output `SINGLE|ANYONECANPAY`: "the output at my index must pay me `askSats`". No covenant is needed and the seller can be offline. The coordinator keeps the listing book (`POST /listings`, `GET /listings`), checking that the outpoint is an unspent credit output the overlay admitted.
- **Sweep.** A buyer takes one or more listings in a single transaction: input *i* is a listing, output *i* pays its seller, and the credits go to the buyer. Before signing, the buyer verifies each listing's lineage (T8).
- **Cancel.** The seller spends its credit output.

The agents use the market automatically: after a settlement they list credits beyond their 7-day need in lots of up to 5 at the pool price × 1.1, always below retail; before a job they buy listings that cover a shortfall for less than retail. On-chain listing records (`OP_RETURN agentcoop list`) are optional; the book is the coordinator's. Why signed listings and not OrdLock: [ADR 0005](../decisions/0005-signed-listings-not-ordlock.md).

## How an agent decides

Before each job, an agent tries the cheapest option first: credits it already holds (redeem), market listings under retail, an open pool if its forecast says it will need the capacity next week, and retail over 402 otherwise. Its decision on a pool answers four questions (need, price, timing, budget), comes from a deterministic rules brain or an LLM, and passes through a policy enforced in code last. Details: [apps/agents/README.md](../../apps/agents/README.md).

## Honest limits

- The bundled provider is a simulator: payments, credits and settlement are real; the GPU time and the bandwidth are not.
- Prices in the demo are illustrative ("demo pricing"). The discount shows the mechanism, not a proven saving: real savings need a provider with commitment-priced capacity.
- A provider can sell credits and not serve them (T-5). The exit is resale on the market; a provider bond and on-chain reputation are on the [roadmap](../ROADMAP.md).
- The market's liquidity in the demo comes from the team's own agents.
