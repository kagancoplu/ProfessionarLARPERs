# AgentCoop — Final Idea

> **A group-buying and capacity market for AI agents. They already know how to pay; AgentCoop lets them buy together, without custody.**
>
> BSV Association Track — "DeFi Rails for Agentic Payments" · TUM Blockchain & AI Hackathon, 30–31 October 2026
> Status: **v1.1**. A merge of the team's 4 ideas; patched after an independent review (list of changes in §16). The main idea is `idea.md`; the other three ideas were added to it as components.

---

## 0. Short summary

Agents buy paid APIs, LLM and GPU capacity one at a time, at list price. The real discounts (reserved GPU blocks, provisioned throughput, proxy plan tiers) sit behind large upfront commitments small teams cannot make. Group buying solves this, but today it always needs the money collected by an intermediary.

**AgentCoop** is a **non-custodial DeFi layer** that pools agents' purchasing power so they can buy bulk packages. Until the pool fills, everyone's money stays in their own wallet. When it fills, **one atomic BSV transaction** does two things at once: it pays the provider and delivers each participant's **credit token** (BSV-21). These credits can be spent on the provider's API over HTTP 402 or sold atomically to other agents. The agent's budget sits in a **Mandate Vault** its owner manages from BSV Desktop. Agents arriving from another chain (e.g. with USDC on Base) can join a pool with an **atomic swap**.

**One-sentence pitch (EN):** *x402 taught agents how to pay. AgentCoop lets many agents buy one block of capacity together, with no deposits, no escrow and no refunds: one atomic BSV transaction pays the provider and delivers every share.*

---

## 1. How we read the challenge

### 1.1 Mandatory requirements (all must be met)

| # | Requirement | How AgentCoop meets it |
|---|---|---|
| B1 | BSV TS SDK + (where a wallet is needed) Wallet Toolbox | Every transaction is built with `@bsv/sdk`. The agent, provider server, guard and maker wallets run on `@bsv/wallet-toolbox` |
| B2 | User-facing flows connected to BSV Desktop / BSV Browser | The provider opens pools and mints credits, the agent owner funds and withdraws the vault, a human participant joins pools, an LP gives a backstop. All of it through `WalletClient('auto')` |
| B3 | Real transactions (testnet or mainnet) | Mainnet with the sats BSVA gives. Every step is a transaction: pool announcement, pledge, settlement, credit spending, secondary sale, swap |
| B4 | Non-custodial wherever funds are involved | No money collected in a pool. The settlement is one atomic transaction (DvP). The guard cannot spend the vault alone, the owner can always withdraw. The swap uses HTLCs. The remaining trust points are listed openly in §8 |
| B5 | At least one AI agent that pays using the project | Agents join pools (settlement payment), spend credits, pay retail with 402 when credits run out, buy credits on the secondary market |
| S1 | An open-source repo + README | A monorepo, everything comes up with `npm run demo` |
| S2 | A live demo or a 2–3 min video (including an agent payment) | The scenario in §11 |
| S3 | Example transaction links (WhatsOnChain) | At least one link of every transaction type in §7 in the README |
| S4 | A usage and value note | An English draft in §14 |

### 1.2 Jury weights and our answer

| Criterion | Weight | Our main card |
|---|---|---|
| Adoption potential, real utility | **35%** | Prepaid, all-or-nothing demand for the provider without inventory. Access for small teams to packages they could not buy alone. A reason for x402 agents on Base to come to BSV. A provider that really works (SmartRoute) |
| Use of the BSV stack | **25%** | SDK (custom sighash, script, BEEF/SPV), Wallet Toolbox, BSV Desktop, our own overlay, BSV-21, BRC-105/103/29, MessageBox, Arcade, baskets |
| Technical implementation and a sound non-custodial design | **20%** | Payment and delivery in the same transaction (DvP). Participants verify the credit lineage themselves. The provider's offer can be signed offline. The guard can do nothing alone. Threat model and mock-chain tests |
| Agent payments | **10%** | The agent does real work (research) and manages its purchasing itself |
| Originality and presentation | **10%** | Nobody is doing "agents buy together". A progress bar filling live and, at the end, one transaction on WhatsOnChain |

### 1.3 Design rules we took from the challenge

1. **The core product must be the DeFi layer, the agent secondary.** The real product is the pool, the credit market and the on-ramp. The agent is their customer.
2. **"Working code alone is not enough."** A real provider must sell a real service (LLM inference), and the mechanism's value must be measurable on chain (N participants, 1 transaction, 0 sat in custody).
3. The gaps the track lists are **stable value, liquidity, swap and moving between chains**. We have an answer to each (§3.2).
4. We touch three of the track's example ideas naturally:
   - **Launchpad:** the pool lets the provider raise funds before buying the capacity.
   - **DEX / token swap:** the credit market.
   - **Cross-chain flows:** Coop Rail.

---

## 2. What we took from the four ideas, what we left

| Source | What we took | What we changed or dropped (why) |
|---|---|---|
| **`idea.md`** (AgentCoop, the main idea) | The product itself: an assurance contract, all-or-nothing, credit tokens, secondary sales, the owner's mandate to the agent, provider models, the legal frame, the SmartRoute scenario | We dropped the design that relied only on ACP. In its place came the **2-phase design** where the provider signs with `SINGLE\|ANYONECANPAY` and the participants with `ALL`. This **solves** open problem #2 in idea.md (trust in credit delivery) (§4.6). We did not make OrdLock mandatory on day one; signed listings come first. We use wallet-toolbox as AGENTS.md recommends instead of `@bsv/simple/server` |
| **`agent-spending-vault.md`** | **The Mandate Vault**: agent + guard 2-of-2, the owner can always withdraw; guard policy checks; the threat model approach | The "owner's mandate" in idea.md is no longer just a rule written in a prompt; it is enforced cryptographically. We dropped tUSD: a "stablecoin" minted by the team is an IOU, and the jury would question it. We dropped the x\*y=k pool: a third-party LP depositing needs either custody or a covenant; our signed listings and HTLCs need neither. (The demo's liquidity still comes from the team, §4.8) |
| **`AnyRail-fikir.md`** | The "pay with what you have" router. A cross-chain **atomic swap** (HTLC) and the maker model. Only 402 stays on the service side. A one-line integration | We use AnyRail not as a general payment rail but as AgentCoop's **on-ramp (Coop Rail)**. Since BSV has no CLTV, we redesigned the refund path (§4.10) |
| **`a`** (3 user needs) | **Shared data order** = the group pool (the core). **Capacity reservation** = period (forward) credits (K3). **Order advance** = the underwriter/backstop role | Unsecured agent credit (an advance) cannot be done with a sound non-custodial design in 30 hours; we put it in the future vision (§13). The on-chain purchase history from pools will be its credit score later |

---

## 3. Product

### 3.1 Five components

```
                 ┌──────────────────────── AgentCoop ────────────────────────┐
   Provider ───▶ │  ① POOLS     group-buying pool, one atomic settlement (DvP) │
 (BSV Desktop)   │  ② CREDITS   BSV-21 capacity credits → spent over 402       │
                 │  ③ MARKET    atomic credit ↔ sats secondary market + backstop│ ◀── LP / underwriter
   Agent owner ─▶│  ④ MANDATE VAULT  agent budget: agent+guard 2-of-2, owner exits│
 (BSV Desktop)   │  ⑤ COOP RAIL USDC (Base) ↔ BSV atomic swap: entry from outside │ ◀── x402 agents
                 └───────────────────────────────────────────────────────────┘
                        ▲ all of it: overlay (tm_agentcoop) + Arcade + WhatsOnChain
   Agents (wallet-toolbox) — agent SDK + procurement router (+ MCP server)
```

| Component | What it does | From which idea |
|---|---|---|
| ① **Pools** | A provider announces a block of capacity, agents join. When the target is reached, payment and delivery happen in one transaction; if not, nobody's money moves | idea.md |
| ② **Credits** | **Default: one perpetual BSV-21 token per provider product** (e.g. a "SmartRoute Sonnet credit", 1 credit = 1k output tokens). Period tokens are used only for the K3 forward feature; they are not the default, so as not to split liquidity. Spent on the 402 API | idea.md + a |
| ③ **Market** | Leftover credits are sold with signed listings, a buyer gathers several listings in one transaction. Underwriters take the unfilled part of a pool and sell it on the market | idea.md + a + vault |
| ④ **Mandate Vault** | The owner says "$20 a week, at most $5 per pool, only these providers" and the rule is enforced by an on-chain 2-of-2 | agent-spending-vault |
| ⑤ **Coop Rail** | An agent or person holding USDC on Base moves to BSV with an HTLC and joins a pool or funds its vault | AnyRail |

### 3.2 Our answers to the gaps the track lists

| Gap the track names | AgentCoop's answer |
|---|---|
| **Stable value to pay with** | Credits are denominated in service units (tokens, GPU-hours), so the agent holds a stable value measured by what it consumes. USDC from outside is converted to BSV **before the pledge**; the exchange-rate risk lasts from the pledge to the lock-in and is bounded by an X % buffer added to the pledge (the excess returns as change). If the pool does not fill, the BSV stays in the vault and is used in later pools. **There is no way back to USDC yet** (§4.10) |
| **Liquidity** | The credit market and backstop/underwriter LPs. Pools fill more often, credits stay liquid |
| **Swap** | Credit ↔ sats (atomic, signed listings) and USDC ↔ BSV (HTLC) |
| **Move funds between chains** | Coop Rail: a non-custodial entry from the x402 economy on Base to BSV |

### 3.3 Why it is a niche, why it makes a difference

- What other teams will probably build: a bridge, a DEX, a stablecoin, a spending vault, a 402 paywall. These answer **"how to pay"**. We answer **"how to buy together"**: we build the procurement layer.
- It is a financial primitive. A multi-party, all-or-nothing **group-buying protocol** with atomic delivery, and its secondary market. The pieces "everyone builds", such as a bridge, a swap and a vault, are not the product for us but the **components** that feed it.
- **BSV-specific:** a 100-participant pool on Ethereum needs approve + deposit for each participant (the money waits in the contract), and on failure everyone pays refund gas. On BSV there is neither a deposit nor a refund; hundreds of parties meet in one transaction for well under a cent (§5).

---

## 4. Mechanism (the technical core)

### 4.1 The single principle

> **Everyone's assets stay in their own wallet until the last moment. Then a single transaction happens either for everyone or for no one.**

The provider's credits sit in the provider's wallet, the agents' sats in the agents' wallets (or vaults). During the pool there is no shared account, contract balance or custody. **The one exception:** the limited, short-lived prepaid balance in credit usage (§4.7); a trust point bounded to one session's amount, listed openly in the threat model.

### 4.2 The technical fact that makes it possible (verified)

- `TransactionSignature.format` in `@bsv/sdk` 3.2.1 can compute the `SIGHASH_ALL`, `SIGHASH_SINGLE`, `SIGHASH_NONE` and `SIGHASH_ANYONECANPAY` scopes.
- The starter kit's `client/signer.ts` computes the sighash preimage **on the application side** and has the wallet sign it with `createSignature({ hashToDirectlySign })`. This path was verified on mainnet with BSV Desktop for token transfers. So **both BSV Desktop and wallet-toolbox agents** can sign their own inputs with any scope in a multi-party transaction someone else built. (This answers the "Wallet support" question in idea.md. The live test of SINGLE|ACP in BSV Desktop is validation 2 in §12.)

### 4.3 The pool lifecycle

```
1. OFFER     The provider (BSV Desktop) opens a pool:
             - sets aside a BSV-21 UTXO of N credits for itself and writes the pool announcement
               (terms, price P, target, deadline, backstop share Y) on chain in one tx
             - signs that credit UTXO with SIGHASH_SINGLE|ANYONECANPAY:
               "Whoever takes these N credits, as long as the output at the same index
               pays me P sat." So the provider can stay offline.
2. PLEDGE    An agent or person sets aside a "pledge coin" in a separate basket (agentcoop)
             of its own wallet and writes the record on chain with OP_RETURN.
             In the same tx it pays the provider a small, non-refundable registration fee
             (anti-griefing, §4.5). The money is still under its own key; the overlay
             counts the progress from the chain.
3. WITHDRAW  Free until the last moment: spending the coin cancels the pledge.
4. LOCK-IN   The target is reached. The coordinator builds the participant list with
             the deterministic ordering rule (§4.5), prepares the settlement tx template
             and sends it to each participant over MessageBox/WS.
5. SIGN      Each participant verifies THE WHOLE transaction: are my credits there, is my
             change right, does the pledge-list hash in the OP_RETURN follow the rule, and
             is the provider's credit input REAL. That last check is done not by asking the
             overlay but BY ITSELF with `verifyLineage` (ancestors fetched from Arcade/WoC,
             the kit rules applied locally; the lineage is short: deploy → reserve →
             settlement). Then it signs with SIGHASH_ALL. For vault agents the guard does
             the same checks and signs too (§4.9).
6. SETTLE    When all signatures are in, the tx is broadcast to Arcade (EF format) and
             submitted to the overlay. The provider is paid, each agent has its credits:
             one tx, one WhatsOnChain link.
7. FAIL      The deadline passed: nothing is broadcast, nobody's balance changes.
             The pledge coins can be used in the next pool.
```

### 4.4 The structure of the settlement transaction

```
INPUTS                                          OUTPUTS
[0] The provider's credit UTXO (N credits, 1 sat) ─▶ [0] P sat → provider
    signature: SINGLE|ANYONECANPAY (when the pool opens)  (paired with input 0, the provider signs only this)
[1] Pledge coin — agent A (vault script)        [1] BSV-21 transfer kA credits → A's token address
[2] Pledge coin — agent B (wallet-toolbox)      [2] BSV-21 transfer kB credits → B
[3] Pledge coin — person C (BSV Desktop)        [3] BSV-21 transfer kC credits → C
 …                                               …   (Σ k = N, exactly; excess credits would burn)
    signature: SIGHASH_ALL (at lock-in,          [n+1 … 2n] change → each participant's vault / basket
           seeing the whole transaction)        [2n+1] OP_RETURN  agentcoop · settle · poolId · terms hash
                                                                  · pledge-list hash (§4.5)
```

- **Payment and delivery in the same transaction.** There is no scenario in which the provider takes the money and does not send the credits.
- The provider's signature is not valid in any transaction where it does not receive P sat in return. The participants' signatures cover everything (ALL), so the coordinator cannot change any output.
- **Fee:** at about 100 sat/kB a 20-participant settlement is ~7 kB, i.e. a few hundred sat (< $0.001). The fee is deducted equally from the participants' change. (Check the real fee policy through Arcade `/health`.)
- Pledge coins need not be exact amounts, because there is a change output. idea.md's "fixed-size share" constraint goes away.

### 4.5 Edge cases and coordinator rules

| Case | What happens |
|---|---|
| **Participant selection and ordering** | A deterministic rule: pledges are taken in **(block height, txid)** order; unmined ones last by txid. The OP_RETURN in the settlement contains the hash of the pledge list at that moment. Anyone can check whether the rule was applied. Since the provider's offer is open, **anyone can run their own coordinator**. Censorship becomes detectable but is not fully prevented (§8) |
| **Griefing (not signing / spending the coin at the last moment)** | Three measures: (1) **a small, non-refundable fee** paid to the provider in the pledge record (e.g. a few hundred sat); (2) the pool is **over-filled up to 120 %**, the excess is the waiting list; (3) **at most 3 signing rounds** are tried, a timeout of ~60 s per round, coins that do not sign are blacklisted by outpoint. The remaining risk: a determined, funded attacker can still drop a pool; the cost is no longer zero and the attempts are limited |
| A participant does not sign at lock-in or spends its coin | Its place goes to someone on the waiting list or the backstop and the template is rebuilt. Nobody loses money |
| A whale takes the provider's whole offer alone | Economically not a problem: the provider sold its block. The pool participants' coins are untouched (this is also "underwriter" behaviour) |
| The provider cancels the pool | It spends the credit UTXO, the offer becomes invalid, nobody is affected |
| Partial fill | Fill-or-kill (exactly N) in the MVP. The backstop fills the shortfall up to the share Y fixed in the offer (§4.11) |

### 4.6 Decision note: why we left idea.md's ACP-Lighthouse design

In idea.md participants pre-signed with `ALL|ANYONECANPAY`. That signature must fix **all outputs**, but when the first participant signs, it is not known who will come. So the credit outputs cannot be put in the same transaction, and delivery remains a separate transaction the provider makes later (idea.md risk #2). Also an ACP pledge can be withdrawn at any time by spending the coin. So ACP is no stronger against griefing than the 2-phase design.

**Insight:** Lighthouse was designed for *people* who pledge and disappear. Agents are always online; a second signing round costs them nothing. So we can do what Lighthouse cannot:

1. Payment and delivery in one transaction (DvP).
2. The guard can see the whole transaction and enforce the rule "the agent pays **and** receives its credits".
3. Pledges need not be exact amounts.

On the provider side we keep ACP's strength: thanks to `SINGLE|ANYONECANPAY` the provider can sign its offer once and stay offline. As a design note, a "Lighthouse mode" (an ACP pledge) for offline people could be added later (§10, layer 3).

### 4.7 Using credits (402)

- **Retail (no credits):** SmartRoute uses **BRC-105** with `@bsv/auth-express-middleware` and `@bsv/payment-express-middleware`. The agent pays with `AuthFetch`. We use the official protocol; we do not invent our own headers.
- **With credits:** the agent sends the credits to the provider's token address with an authenticated (BRC-103) `/credits/redeem` call (an ordinary BSV-21 transfer). The provider verifies it and writes a prepaid balance to the agent's identity. On later calls `calculateRequestPrice` returns 0 (and debits the balance) as long as the prepaid balance covers it, and switches to the retail sats price when it does not.
- **Balance limit:** a redeem is made **for at most one session's need** (e.g. ≤ 20 credits). The unused part can be asked back as tokens with `/credits/return`. This balance **is off chain and relies on trusting the provider**; it is bounded by keeping the amount small and the time short, not removed entirely (§8).
- Returned credits go into the provider's stock. The provider can burn them or resell them in the next pool.

### 4.8 Market: signed listings and sweeps

- **Listing:** the seller signs its credit UTXO with `SINGLE|ANYONECANPAY`: "I give these k credits as long as the output at the same index pays me q sat". This is **the same primitive** as the provider's offer: one mechanism, two products. No covenant is needed and the seller can be offline.
- **Buying:** the buyer gathers several listings in one transaction (input i ↔ payment output i). The credits go to the buyer in one output. Before signing with `ALL`, the buyer verifies the lineage of the credit inputs with `verifyLineage`.
- **Cancelling:** the seller spends its coin.
- **Source of liquidity (an honest note):** the design is permissionless, i.e. anyone can open a listing, give a backstop or be a maker. But **all the demo's liquidity comes from the team**. The initial liquidity problem is not solved; we do not hide it in the pitch.
- **Layer 3:** with OrdLock listings (the 1Sat ecosystem's `createOrdTokenListings` / `buyBsv21`) the credits become visible in the existing 1Sat Market too.

### 4.9 Mandate Vault (enforcing the owner's authority on chain)

```
locking script:
OP_IF
    <ownerPub> OP_CHECKSIG                              ← the owner alone, any time (BSV Desktop)
OP_ELSE
    OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG    ← the agent + the guard together
OP_ENDIF
```

- **Funding:** the owner locks money to this script from BSV Desktop with `createAction`. The output is tracked in the owner's own wallet in the `agentcoop vault` basket, with `customInstructions`. Funds from Coop Rail can also land only on this script (§4.10).
- **Guard (a wallet-toolbox server) policies:**
  - Is the payee on the allowlist?
  - Are the per-pool cap and the rolling weekly total exceeded?
  - **DvP:** in the same transaction, do at least the expected credits go to the agent's token address, and was the lineage of that credit input verified with `verifyLineage`?
  - Does the change return to the same vault script?
  - Is the fee cap exceeded?
  - In a Coop Rail claim, is the output the vault script or a pledge coin?

  The guard sees the whole transaction (ALL), so it can check all of this.
- **A hot wallet for small spending:** for retail 402 calls, money moves to the agent's hot wallet (the wallet-toolbox `default` basket) within small daily caps the guard approves. So `AuthFetch` works in the standard way. Large commitments (pools, market) are made straight from the vault.
- **Non-custodial:** neither the guard alone nor the agent alone can move the funds. The owner can always withdraw with one signature. The guard is open source and the owner can run it on their own server if they wish.
- **Known limits (staying open):**
  - The credit outputs go to the agent's own token address, so the agent can sell the credits on the market and bypass the guard. The amount is small and the credits are tied to a specific provider. Closing it needs our own overlay rule that locks the credit output to the vault script (K3).
  - **Blind hash signing:** a BRC-100 wallet cannot see what it signs with `hashToDirectlySign`, and at security level 1 the permission is given once per protocol. So the damage a malicious application can do is not one pledge but **the total in the `agentcoop` basket**. Mitigation: the basket holds **only one active pledge** at any time, and an open-source DvP verifier runs on the client before signing. (The permission behaviour is validation 3 in §12.)
- **The demo moment:** a prompt-injected agent says "put 100 % of the budget into pool X". The guard refuses to sign and nothing moves.

### 4.10 Coop Rail: USDC (Base) ↔ BSV atomic swap

**A verified constraint:** with the Genesis upgrade, `OP_CHECKLOCKTIMEVERIFY` and `OP_CHECKSEQUENCEVERIFY` became NOPs on BSV, and Chronicle (2026) did not bring them back. `nLockTime`, however, works with its original meaning. So the refund path on the BSV side is built not in the script but with **a pre-signed refund transaction with nLockTime**.

```
Agent (secret s, h = SHA256(s))                       Maker (LP bot)
1. Base: locks USDC into a Solidity HTLC (h, maker, timeout T_base)
2.                                                    builds the BSV HTLC funding tx (version 1, does not broadcast yet)
   BSV script:
     OP_IF   OP_SHA256 <h> OP_EQUALVERIFY
             OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG      ← claim: agent + GUARD together
     OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG      ← refund: pre-signed, nLockTime = H + k
     OP_ENDIF
3. The agent signs the maker's refund tx (the ELSE branch, nLockTime = current BLOCK HEIGHT + k)
                                                  ──▶ the maker broadcasts the funding
4. Agent + guard take the BSV with s. The guard signs only if the output is the vault
   script or a pledge coin. s is revealed on chain
5.                                                    The maker takes the USDC on Base with s (before T_base)
   If something goes wrong: the maker takes its BSV back after H+k; the agent takes its USDC back after T_base.
```

- **Time reference:** the BSV refund is set by **block height** (+k blocks), not a timestamp. So we do not depend on whether the median-time-past rule holds on BSV. `T_base` is chosen as the bad-case duration for k blocks plus room for the maker to claim the USDC (e.g. k=3, T_base = +6 hours). On the happy path nobody waits for a timeout, so long windows do not slow the demo. The semantics are validation 4 in §12.
- **Through the guard:** the claim branch needs the guard's signature, so funds from the Rail cannot bypass the vault policy. If the funds are the owner's own (the human flow, MetaMask → vault), the claim branch is built with the owner's key and the output is the vault directly.
- **Version 1:** we build the funding transaction as version 1. Chronicle lifted the malleability constraints only for version > 1 transactions; with version 1 we aim to protect the pre-signed refund transaction's txid from malleability (validation 6 in §12).
- **Maker economics:** a 1–2 % spread is added to the quote; the spread prices the time the capital stays locked until H+k. **There is no reverse direction (BSV → USDC) yet**; so the maker's inventory runs down one way and is rebalanced by hand. The reverse direction can be built with the same two contracts, roles swapped (K3).
- **Network choice:** Base Sepolia for development. For the demo we suggest $1–2 USDC on Base mainnet, gas under a cent. So both sides are real.

### 4.11 Pool types (from the file `a`)

| Type | What the user says | Mechanism |
|---|---|---|
| **Shared order** (group pool) | "I need it, but I don't want to carry the whole cost alone" | §4.3, the core |
| **Capacity reservation** (forward, K3) | "I have the money, I want the service ready on time" | A period credit token (e.g. "SR-Sonnet-2611"). The provider opens it for use only within the period. Future periods' credits are priced on the market, which creates a **forward curve** for AI capacity. Not the default: it splits liquidity |
| **Backstop / underwriter** (the sound version of the order advance) | "Let me take the risk so the pool fills, and earn a margin for it" | An LP pledges "I will fill at most **Y** of the shortfall in the last X minutes". **Y is fixed in the offer**, so the LP's risk is known up front. The provider gives backstop shares an **extra discount** (e.g. +5 %), because the LP raises the pool's chance of filling; the LP earns its return from this extra discount |

---

## 5. Why BSV

- **Multi-party atomic transactions are cheap and natural.** The UTXO model lets dozens of parties sign their own inputs in one transaction. No deposit or refund is needed. Thanks to the sighash scopes (ALL, SINGLE|ACP) the provider can make an offer offline. On account-based chains the same thing means the money waiting in a contract.
- **The fee is negligible.** Penny pledges, settlements with hundreds of participants and per-call 402 make economic sense.
- **Every piece is ready in the stack:** BRC-100 wallets, BSV-21 with overlays, BRC-105 and 402, BRC-29, MessageBox, Arcade.
- **It creates on-chain demand for the network.** Every pool announcement, pledge, settlement, credit spend, secondary sale and swap is a transaction. The credits also become real BSV-21 markets visible on BananaBlocks.

---

## 6. Actors and wallets

| Actor | Wallet | What it does |
|---|---|---|
| **Provider operator** (a person) | **BSV Desktop** | Mints the credit token, opens pools, signs the offer, cancels |
| **The SmartRoute server** | wallet-toolbox | 402 collection, credit use and return, (later) a re-offer per pool |
| **Agent owner** (a person) | **BSV Desktop** (+ MetaMask, for the Rail) | Funds the vault, sets the policy, withdraws, watches the agent's decisions |
| **Human participant / LP** | **BSV Desktop** | Joins pools directly, gives a backstop, buys and sells on the market |
| **AI agents** (3–5) | wallet-toolbox (+ vault) | Do research work; purchasing, pledging, spending credits, secondary sales, swaps |
| **Guard** | wallet-toolbox | The co-signer that enforces the vault policy |
| **Coordinator** | wallet-toolbox (identity only) | Builds the template, collects the signatures, broadcasts. **Holds no money**; bound to the deterministic rule; anyone can run this role |
| **Maker** | wallet-toolbox + an EVM key | Coop Rail's counterparty |

---

## 7. On-chain transaction catalogue (the WhatsOnChain links in the README)

| # | Transaction | Signer / scope | What you see on WhatsOnChain |
|---|---|---|---|
| T1 | Credit token deploy | Provider (BSV Desktop) | BSV-21 deploy+mint (also visible on BananaBlocks) |
| T2 | Pool announcement and setting the credits aside | Provider | An N-credit UTXO and the OP_RETURN terms |
| T3 | Pledge | Agent / person | Pledge coin, the registration fee to the provider and the OP_RETURN (poolId, share) |
| T4 | Pledge cancellation | Pledge owner | The coin spent, the pool's progress dropped |
| **T5** | **Settlement (DvP)** | Provider SINGLE\|ACP, everyone ALL | **N inputs; the payment to the provider and everyone's credits in one tx; the pledge-list hash** |
| T6 | Credit use (redeem) and return | Agent / provider | A BSV-21 transfer → provider, and back |
| T7 | Retail 402 payment | Agent (AuthFetch) | A BRC-29 payment → SmartRoute |
| T8 | Filling market listings (sweep) | Sellers SINGLE\|ACP, buyer ALL | Payments to several sellers and the credits to the buyer |
| T9 | Vault funding and the owner's withdrawal | Owner (BSV Desktop) | A custom script output and a spend through the OP_IF branch |
| T10 | A guard-approved payment | Agent + guard 2-of-2 | A spend through the multisig branch |
| T11 | Coop Rail (BSV side) | Maker funding, agent + guard claim | A hash-locked output, the preimage s visible in the claim |
| T11b | Coop Rail (Base side) | Agent lock, maker claim | The HTLC contract on BaseScan |

---

## 8. Non-custodial analysis and threat model

| Threat | Mitigation | Status |
|---|---|---|
| The coordinator tries to steal | The coordinator has no key and no money. Everyone verifies the whole transaction and signs ALL; an open-source DvP verifier runs on the client | Closed |
| The coordinator (or the overlay) shows fake credits as "valid" | Participants and the guard verify the lineage of the credit input **themselves with `verifyLineage`** instead of trusting the overlay (ancestors from Arcade/WoC, rules locally). The overlay is only for discovery | Closed (independent verification) |
| The coordinator's power to choose (censorship, favouritism) | Deterministic ordering, the pledge-list hash in the OP_RETURN, anyone can run a coordinator | **Detectable, not prevented** |
| The provider takes the money and sends no credits | Impossible, because payment and delivery are in the same transaction | Closed |
| The provider delivers credits but not the service | A residual trust present in any prepayment. Credits can be sold on the market (an exit), on-chain reputation, later a provider bond | **Open (residual trust)** |
| A redeemed balance is held off chain by the provider | The redeem amount is limited to one session (≤ 20 credits), returned with `/credits/return` | **Open, bounded and trust-based** |
| A participant runs at lock-in (griefing, Sybil) | A non-refundable registration fee, a 120 % over-fill, at most 3 rounds, an outpoint blacklist | **Made costly, residual risk** |
| Fake credits (BSV-21 forgery) | `verifyLineage` + overlay rules (source, inflation, cross-token) | Closed |
| The agent is prompt-injected | The guard policy and the vault cap; the owner can cancel at any time | Closed (within the vault) |
| The agent sells its credits on the market and bypasses the guard | The amount is small; closing it needs an overlay rule that locks the credit output to the vault (K3) | **Open** |
| The guard is compromised | It cannot move the funds alone, the owner's exit path is open | Closed |
| Agent and guard compromised together | The loss is limited to the vault balance (the owner loads a weekly budget) | **Open, bounded** |
| BRC-100 "blind hash signing" | Damage = the total in the `agentcoop` basket; one active pledge at any time; client verification | **Open, bounded** |
| A Coop Rail claim bypasses the vault policy | The claim branch is agent + guard 2-of-2 | Closed |
| The HTLC counterparty disappears | A height-based pre-signed refund (BSV), a timeout (Base); a version 1 transaction | Closed (depends on validations 4 and 6) |
| No reverse direction for the HTLC | The maker's inventory is rebalanced by hand; an agent in an unfilled pool keeps its BSV in the vault | **Open** |
| 402 replay | The middleware's replay store (a shared, atomic store if there is more than one process) | Closed |

---

## 9. Architecture and repo structure

```
agentcoop/
├─ AGENTS.md                      ← a copy of docs/AGENTS.md (for AI assistants)
├─ packages/
│  ├─ core/        pool/pledge/offer/settlement/listing builders, sighash signing
│  │               (BRC-100 + wallet-toolbox), the DvP verifier, verifyLineage,
│  │               vault & HTLC scripts                                         ← critical path
│  ├─ overlay/     tm_agentcoop + ls_agentcoop (pool, pledge, offer, listing, settlement, vault)
│  │               + the credit token topic (kit rules, multi-party tx tests)
│  ├─ agent-sdk/   procurement router: credits → market → pool → retail 402 → rail
│  └─ mcp/         (K3) AgentCoop tools as an MCP server: any LLM agent joins pools
├─ apps/
│  ├─ web/         Pool explorer (live progress), provider console, owner console, market  [BSV Desktop]
│  ├─ smartroute/  LLM gateway + BRC-105 402 + /credits/redeem + /credits/return
│  ├─ coordinator/ deterministic lock-in, signing round (MessageBox/WS), Arcade broadcast
│  ├─ guard/       vault policy engine
│  ├─ agents/      3–5 research agents + demo orchestration
│  └─ maker/       Coop Rail LP bot
├─ contracts/base-htlc/   Solidity HTLC (USDC) + its tests
└─ test/          end-to-end scenarios with the wallet-toolbox mock chain
```

**The source of the discount (corrected):** the discount comes from **capacity that needs a commitment**: GPU blocks (8 GPUs minimum, 6 months+ commitment), provisioned throughput (Bedrock, OpenAI Scale Tier; 30-day minimums, thousands of dollars a month), proxy plan tiers (1 TB+ deals). Batch APIs are **not** on this list: they need no volume commitment, so a single agent gets the same discount. **In the demo SmartRoute pays list price upstream; the pool discount shown is demo pricing** and is labelled as such. Only committed capacity could show the real economics; it cannot be bought within the hackathon, so the savings claim stays **unproven** in the demo. What is proven is the mechanism (§14).

---

## 10. Scope and build order

> The role table in this section will be **replaced** by separate per-person plan files (the frontend excluded in the first phase). The layers are a build order, not a cut list; but what does not fit once the 18-hour correction load is added depends on the team size and the time left.

| Layer | Content |
|---|---|
| **K1 — Spine** | Pools (offer, pledge + registration fee, deterministic lock-in, DvP settlement), BSV-21 credits, overlay, `verifyLineage`, SmartRoute (402, capped redeem, return), 3–5 agents, provider console, a human pledge with BSV Desktop, a live pool explorer, the failed pool scenario |
| **K2 — Full vision** (in parallel from the first hour) | Mandate Vault, guard and owner console; Market (signed listings and sweep); Coop Rail (Base HTLC, guarded claim, height-based refund, maker); a backstop underwriter; the agent SDK router; **an end-to-end test: USDC → BSV pledge → credits → 402** |
| **K3 — Leap** | An MCP server; 1Sat Market listings with OrdLock; period (forward) credits; an organizer agent; locking the credit output to the vault; a covenant vault; Coop Rail's reverse direction; a Lighthouse mode for offline people |

### Role table (old, for reference)

| Role | Ownership | First delivery |
|---|---|---|
| **A — Protocol** | `packages/core`: builders, sighash signing, the DvP verifier, `verifyLineage`, mock-chain tests | The first settlement on mainnet with 2 agents and 1 provider |
| **B — Overlay** | `packages/overlay` + the explorer API + the live feed (WS) | Pool progress counted from the chain |
| **C — Provider** | `apps/smartroute` + the provider console (BSV Desktop) | 402 retail, credit use and return |
| **D — Agents** | `apps/agents` + `agent-sdk` + the coordinator + demo orchestration | Agents pledging with decision logs |
| **E — Vault** | vault scripts + `apps/guard` + the owner console (BSV Desktop) | Fund → a guard-approved payment → a refused injection → withdraw |
| **F — Rail and Market** | `contracts/base-htlc` + `apps/maker` + the market module | A USDC → BSV swap and a listing sweep |

### Milestones (H0 = start of coding; adjust backwards from the submission time)

| Time | Goal |
|---|---|
| **H+0 → H+2** | **Validations 1, 2 and 4 in §12 must be done.** The monorepo set up; BSV Desktop wallets ready; sats requested from @lexamaison; the starter kit's 38 tests green; an LLM API key and a Base wallet ready |
| **H+5** | **Walking skeleton:** the first DvP settlement on mainnet with 2 hard-coded agents and 1 provider. The first WhatsOnChain link. The project's biggest technical risk closes here |
| **H+10** | Overlay indexing, opening pools and pledging with BSV Desktop, SmartRoute 402 + redeem/return, agents end to end, `verifyLineage` on the signing path |
| **H+16** | Vault and guard, market, Coop Rail swap, the failed pool integrated. **End to end: USDC on Base → BSV pledge → credits → 402, with a mock-chain test** |
| **H+20** | Feature freeze, UI polish, demo recording, collecting the transaction links |
| **H+22–24** | README, value note, video editing, submission |

---

## 11. Demo scenario (≈3 min video)

| Time | Scene |
|---|---|
| 0:00–0:20 | **Problem:** packages that need commitments and small teams; group buying needs custody |
| 0:20–0:45 | The provider (BSV Desktop) opens a "1,000 Sonnet credits, 24 hours" pool (approval windows visible; the discount labelled "demo pricing"). The agent owner funds the vault and writes the policy |
| 0:45–1:30 | 4 agents find the pool on the overlay, forecast their need and pledge (decision logs on screen), the progress bar fills. One agent arrives from Base with USDC, swaps with Coop Rail (links on both chains) and **the swap output becomes the pledge coin directly**. The guard refuses the injected agent |
| 1:30–1:55 | Lock-in and the signing round (each participant verifies the lineage itself) → **one settlement transaction** on WhatsOnChain: N inputs, the provider paid, every agent has its credits. *"Nobody held anybody's money for a second."* |
| 1:55–2:25 | The agents, including the one from Base, spend their credits and call SmartRoute (402) and produce a real research summary. Another agent lists what it has left, a late agent buys the listing atomically |
| 2:25–2:45 | An unfilled pool's deadline passes; the balances never changed. The owner withdraws the vault from BSV Desktop |
| 2:45–3:00 | Numbers: participant count, transaction count, fee per settlement, sat held in custody = 0. Why BSV |

---

## 12. Validation list and risks

### 12.1 Assumptions to test before writing code

| # | Assumption | Fastest test | Time |
|---|---|---|---|
| **1** | The kit overlay accepts a settlement mixing plain inputs and a token input | Copy the kit's `e2e.mockchain.test.ts` and submit a tx with 1 token input + 2 plain inputs and 3 credit outputs. Expected: `outputsToAdmit` contains the 3 outputs | before H+2 |
| **2** | BSV Desktop signs a SINGLE\|ACP sighash with `hashToDirectlySign` and Arcade accepts the completed tx | Set aside a coin with 1,000 sat on mainnet and sign it SINGLE\|ACP, complete it with ALL from a second wallet and `POST /tx` to Arcade | before H+2 |
| 3 | BSV Desktop's permission behaviour: does it ask for approval on every signature at level 1/2? | Request two consecutive signatures in test 2 and observe the approval window. The size of the damage in blind hash signing depends on it | H+2 |
| **4** | nLockTime semantics: a height-based locktime works as expected; a future-dated transaction does not enter the mempool; (for information) is there an MTP rule for time-based ones | Broadcast a small transaction with locktime height+1 and another with time now+15 min; compare when they are accepted with the `/chaintracks` header timestamps | before H+2 (if the Rail is done) |
| 5 | The vault script (bare multisig + OP_IF) passes the miner policy | Fund the vault with 1,000 sat and spend both branches | H+4 |
| 6 | Rules like LOW_S are still mandatory for version 1 transactions (for the refund's malleability) | Read the Chronicle spec; broadcast a v1 transaction with a high-S signature and see it refused | H+4 (if the Rail is done) |
| 7 | `beefFromArcade` can walk the lineage to the deploy through unconfirmed ancestors (a prerequisite of `verifyLineage`) | Call the function on a fresh token transfer and apply the `rules.ts` rules locally | H+4 |
| 8 | The settlement's size and input count fit the policy | Arcade `GET /health` | H+1 |

### 12.2 Risks and plan B

| Risk | Plan B |
|---|---|
| Test 1 fails (the kit overlay refuses a mixed settlement) | We extend `rules.ts` in our own `tm_agentcoop` topic manager; DvP on chain does not change, only the indexing becomes ours |
| Test 2 fails (BSV Desktop cannot sign a custom scope) | Provider offers come from the provider's server wallet; human participation goes through vault funding (the agent pledges); BSV Desktop stays in the user-facing flows |
| Test 4 fails (the locktime semantics differ from expected) | Coop Rail cannot be trustless → labelled as a "trust the maker" PoC on Base Sepolia or left out of scope; funding the vault from Base moves to the roadmap |
| Coordinating the signing round | Mock-chain tests, timeouts, the waiting list, the backstop, the 3-round limit |
| Two SDK copies with CJS/ESM | The `vitest.config.ts` alias from the starter kit; one build in Node |
| The `@bsv/402-pay` originator bug | BRC-105 (AuthFetch) as primary; 402-pay with `withHostOriginator()` if needed |
| WhatsOnChain 429 | Arcade for headers and broadcast |

---

## 13. Future vision

- **A revenue-backed advance** (the order advance in `a`): the on-chain purchase history in pools becomes the agent's credit score.
- **A non-custodial stablecoin bridge with ICP chain-key** (a track example). Pools paid directly with bridged USDC. Regulated stable assets once STAS arrives.
- **A provider bond and reputation**, to reduce the residual trust in service delivery.
- **A multi-provider open offer market:** providers compete for the same pool (AnyRail's multi-maker vision).
- **Organizer and hedger agents:** agents that discover volume tiers and open pools, and buy forward capacity.
- **Coop Rail's reverse direction and multiple makers.**

---

## 14. Usage & value note (submission draft, EN)

**Problem.** AI agents buy compute, model capacity and data one call at a time. The packages with real discounts (reserved GPU blocks, provisioned throughput, enterprise data plans) require large upfront commitments small teams cannot make, and pooling today means trusting an intermediary with everyone's money.

**What AgentCoop is.** A non-custodial group-buying layer on BSV. Providers publish a pool and pre-sign their credits as an open offer. Agents pledge from their own wallets; when the pool fills, a single atomic transaction pays the provider and delivers BSV-21 credits to every participant. No deposits, no escrow, no refunds. Credits are spent on the provider's API over HTTP 402 or resold on an atomic secondary market. Agent budgets live in owner-controlled Mandate Vaults, and agents holding USDC on Base can join via an atomic swap.

**What we prove on chain.** N independent parties, one transaction, zero satoshis held by any intermediary at any point, and delivery-versus-payment in the same transaction. Demo pricing is illustrative; the mechanism is real.

**Target users.** Small AI teams and agent operators (buyers); AI infra resellers, LLM routers, GPU and data providers (sellers, who get pre-paid, all-or-nothing demand before they buy capacity); liquidity providers (underwriters).

**Value for BSV.** New users and liquidity from other chains (x402 agents on Base), recurring multi-party settlement transactions, tradable BSV-21 credit markets, and per-call micropayment volume. All of it is only practical because BSV makes multi-party atomic transactions and cent-sized payments cheap.

---

## 15. To do right away, and questions for Axel (@lexamaison)

**Now:**
1. BSV Desktop → Payments → Receive → send the address and the team name to @lexamaison (for sats).
2. Copy `docs/AGENTS.md` to the repo root. Run `npm test` in the starter kit.
3. Do validations 1, 2 and 4 in §12.1.
4. Prepare the LLM API key (for SmartRoute) and a Base wallet ($1–2 USDC + gas).

**Questions for Axel:**
1. Does a vault made of an agent + guard 2-of-2 and the owner's exit path count as "non-custodial" for the jury?
2. Does an HTLC-based cross-chain flow with Base count as a "cross-chain flow"? Is it OK for us to work with small amounts on Base mainnet?
3. Is writing our own overlay topic (`tm_agentcoop`) encouraged? Is public overlay hosting available?
4. Is there a plan for a structured (transaction-showing) signature for `hashToDirectlySign` in BSV Desktop? We ask for our threat model note.
5. Is it enough for the "BSV wallet" requirement that agents use wallet-toolbox server wallets and people use BSV Desktop?
6. Does the limited prepaid balance in credit use (≤ one session, returnable) affect the non-custodial assessment?

---

## 16. v1.1 changes (after the review)

| Change | Section | Gap closed |
|---|---|---|
| The "no exchange-rate risk" claim withdrawn; the swap before the pledge, a buffer, the BSV in the vault on FAIL | §3.2, §4.10 | #1, #2 |
| The Coop Rail claim branch is agent + guard 2-of-2 | §4.9, §4.10, §8 | #3 |
| The BSV refund by block height; the Base timeout set accordingly | §4.10, §12 | #4 |
| The end-to-end USDC → pledge → credits → 402 flow added to H+16 and the demo | §10, §11 | #5 |
| Redeem limited to one session, `/credits/return` added, the trust point written openly | §4.1, §4.7, §8 | #6 (reduced) |
| `verifyLineage`: participants and the guard verify the credit lineage themselves | §4.3, §4.8, §4.9, §8 | #7 |
| Deterministic ordering + the pledge-list hash | §4.3, §4.4, §4.5, §8 | #8 (detectable) |
| A non-refundable registration fee, a 120 % fill, the 3-round limit, an outpoint blacklist | §4.3, §4.5, §8 | #9 (made costly) |
| The batch example removed; the discount only from committed capacity; the demo pricing label | §9, §11, §14 | #10, #11 |
| The x\*y=k reasoning corrected; written that the demo liquidity comes from the team | §2, §4.8 | #12 |
| A single perpetual credit token by default; period tokens in K3 | §3.1, §4.11 | #13 |
| The backstop Y fixed in the offer, an extra discount | §4.11 | #14 |
| The maker spread, written that there is no reverse direction | §4.10, §8 | #15 |
| The blind hash signing damage corrected to the basket total; one active pledge | §4.9, §8 | an open item |
| The validation list and plan B | §12 | — |
