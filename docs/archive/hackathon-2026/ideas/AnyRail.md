# AnyRail
### A "pay with anything" rail for AI agents

> **Let the agent pay with whatever it holds. Let the service take what it wants. The rail handles the rest.**

---

## The idea in one sentence

AnyRail is a non-custodial payment and swap rail that lets AI agents pay for paid services instantly and automatically, whatever asset or network their funds are on. Underneath it uses BSV's cheap, fast micropayments.

---

## Problem

The agent economy is growing, but the payment side is fragmented:

- **Agents carry different assets.** One holds a stablecoin, one ETH on Ethereum, one another token.
- **Services want a single asset.** An API provider does not want to support every token and every network.
- **Micropayments are expensive.** Payments of a few cents per request fall below the transaction fee on most networks.
- **Existing bridge and swap solutions need trust.** Handing funds to an intermediary is an unacceptable risk for agents.

The result is a "payment wall": the agent has money but cannot get the service.

---

## Solution

AnyRail is a thin rail between the agent and the service:

1. **The service side stays simple.** The service accepts only BSV satoshis through standard HTTP 402 ("Payment Required"). It needs to know nothing else.
2. **The agent side stays flexible.** The agent says what asset it holds; the rail converts automatically.
3. **Nobody holds anybody's money.** Every conversion either happens completely or not at all.

---

## How it works (conceptually)

The agent sends a request to a paid service and gets the answer "402: pay this many sats". Then one of three paths kicks in, depending on what it holds:

### Path 1: It already has BSV
The agent pays directly and the service answers. This is the fastest path.

### Path 2: It has a token on BSV (e.g. dUSD, BSV-21)
- The agent asks the rail for a quote.
- It converts the token to satoshis with a liquidity provider (maker) **in a single atomic transaction**. Both sides sign the same transaction: either both get their side, or the transaction never happens.
- Then it pays the service.

### Path 3: Its funds are on another network (e.g. Ethereum)
- The agent generates a secret and puts its funds on the Ethereum side into a time-limited lock tied to that secret.
- The maker locks satoshis for the agent on the BSV side, tied to the same secret.
- The agent reveals the secret when it takes the BSV. The maker takes the funds on Ethereum with that secret.
- If one side leaves halfway, everyone takes their own money back when the time runs out.
- This is not a bridge but an **atomic swap**: no intermediary holds the funds in between.

All three paths end the same way: **the service is paid in BSV and every step can be verified on chain.**

---

## Why BSV?

- **Micropayments are really micro.** A payment of a few satoshis per request makes economic sense.
- **Fast and scalable.** Agents can make many small payments per second.
- **Traceability.** Every payment and swap leaves a permanent record on chain, which makes agent behaviour easier to audit.
- **Identity + payment together.** Wallet identity keys naturally answer "who paid".

By moving value from other networks to BSV, AnyRail brings **new users and liquidity** to the network.

---

## Core principles

| Principle | Meaning |
|---|---|
| **Non-custodial** | The rail never holds the user's or the agent's funds. |
| **Atomic** | Every swap happens completely or not at all. |
| **Zero friction for the service** | The service integrates one standard (HTTP 402 + BSV). |
| **Limited authority for the agent** | The agent spends within the budget and limits its owner set. Keys are never shown to the AI model. |
| **The human in control** | The agent's owner loads the budget from their own wallet and sees every movement. |

---

## Who uses it?

- **Agent developers:** those who want to give their agents the ability to "pay anywhere".
- **API and service providers:** those who want to charge per request without subscriptions or API keys (inference, data, search, compute, content).
- **Liquidity providers (makers):** those who provide liquidity to the rail and earn a small spread on swaps.
- **Individuals and companies that own agents:** those who want to control their agents' spending with budgets and limits.

---

## Example scenario

> A research agent prepares a report with only ETH on the Ethereum testnet in its wallet.
> It sends a request to a paid data API and gets the answer "pay 100 sat".
> AnyRail converts the ETH to BSV with an atomic swap, the agent pays the API and gets the data.
> Then the agent converts part of its dUSD token into satoshis and pays a second service.
> The agent's owner follows every step, with on-chain links, from a dashboard.
> **At no stage do the funds sit with an intermediary.**

---

## What makes us different

- Swapping and cross-chain funding are combined into one **payment experience**. The agent does not have to think about them separately.
- For services the integration stays at the one-line level; the complexity hides inside the rail.
- People and agents use **the same rail**: a person can swap by hand from their wallet, an agent does the same automatically.

---

## Future vision

- **Combining swap and payment in one transaction:** converting the token and paying the service in one atomic transaction.
- **A network of makers:** an open quote market where several liquidity providers compete.
- **More networks and assets:** other EVM networks, stablecoins, other UTXO chains.
- **Agent reputation:** a trust and limit system based on on-chain payment history.
- **Spending policies:** rules such as "at most X a day", "only these services".
