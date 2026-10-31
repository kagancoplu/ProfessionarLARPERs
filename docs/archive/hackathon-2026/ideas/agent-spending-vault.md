# Idea: Agent Spending Vault

> Status: proposal, to be merged with the team's other ideas.
> Track: BSV Association, "DeFi Rails for Agentic Payments" (+ Adevar Labs security prize).

## One-liner
A non-custodial "allowance" for AI agents on BSV: the user locks funds, the agent can spend them only within rules the user sets, and the user can take the money back at any time.

## Problem
AI agents are starting to pay for APIs, data and services on their own. Today there are only two ways to give an agent money:
- give it the wallet's keys, or
- send it funds.

In both cases the user loses control. A bug, a prompt injection or a bad decision by the agent can drain everything.

## Solution
**Analogy:** instead of handing your child your credit card, you give them a prepaid card that only works in certain shops, has a limit per purchase, and you can cancel it anytime.

The vault:
- holds the user's BSV,
- lets the agent pay only **allowlisted payees**, only **up to a per-payment limit**, with a **capped fee**,
- lets the **owner withdraw or revoke** at any time,
- never lets a single party move the funds alone (non-custodial).

To keep it a real DeFi product, the vault sits on top of a small stable-payment layer:
- **tUSD**: a demo stablecoin (BSV-21), because services want predictable prices,
- **swap**: an atomic BSV -> tUSD swap, so the agent can pay services priced in tUSD.

## How it works

### Actors
| Actor | Wallet |
|---|---|
| User (owner) | BSV Desktop via `WalletClient` |
| AI agent | wallet-toolbox server wallet |
| Policy service | wallet-toolbox server wallet |
| Swap pool (team liquidity) | wallet-toolbox server wallet |
| Paid API (merchant) | wallet-toolbox server wallet |

### Flow
1. **Deposit:** the user connects BSV Desktop and locks BSV into the vault, setting the rules (per-payment limit, allowlist, max fee).
2. **Request:** the agent calls a paid API and receives `402 Payment Required` with the price.
3. **Policy check:** the agent builds a payment from the vault and asks the policy service to co-sign. The service checks:
   - payee is allowlisted,
   - amount <= per-payment limit,
   - fee <= max fee,
   - change goes back to the vault.
4. **Payment:** if valid, both sign and the payment is broadcast via Arcade. If not, the service refuses and nothing moves.
5. **Swap (if needed):** if the API prices in tUSD, the agent swaps BSV -> tUSD in one atomic transaction with the pool, then pays.
6. **Withdraw / revoke:** the user withdraws the remaining funds from BSV Desktop at any time.

### Vault design
- **MVP:** 2-of-2 multisig between the **agent key** and the **policy service key**, plus a separate **owner path** to withdraw (owner key, optionally after a timelock). Rules are enforced by the policy service off-chain, but neither the agent nor the service can move funds alone.
- **Stretch (v2):** an on-chain covenant (OP_PUSH_TX style) that enforces the same rules in Bitcoin Script, removing the policy service from the trust model. The developer guide has no tested covenant examples, so this is high risk for a 30-hour event.
- The vault holds **BSV, not tokens** (checking BSV-21 amounts in script is much harder).

### Swap design
- Liquidity comes **only from the team's own wallet** (third-party LP deposits would be custodial in this design).
- Quote: constant product `x*y=k`, expires after ~60s, includes a minimum output (slippage limit).
- One atomic transaction: BSV input from the payer and tUSD output from the pool, both sign. Nobody can take funds and run.

## Components
1. tUSD token (from `starter/bsv21-token-kit`)
2. Vault + policy service (Node/Express)
3. Swap service + swap UI (BSV Desktop)
4. Paid API (HTTP 402)
5. AI agent (decides which API to call, pays through the vault, respects its own spend/slippage limits)
6. Dashboard: vault balance and rules, pool reserves and price, recent payments and swaps with WhatsOnChain links
7. README with threat model

## Why it fits the track
| Judging criterion | How we cover it |
|---|---|
| Useful DeFi product | Stable token, liquidity, swap + agent-specific spending layer |
| Adoption potential | Every agent that handles money needs safe, limited spending authority |
| BSV stack | `@bsv/sdk`, wallet-toolbox, BSV-21 overlay, 402 payments, Arcade |
| Non-custodial | 2-of-2 + owner withdraw path; atomic swaps; no pooled user funds |
| Real agent payment | Agent pays a 402 API through the vault on testnet |
| Originality | Not "just a swap": safe delegation of money to agents |

## Security / threat model (draft)
| Threat | Mitigation |
|---|---|
| Agent pays an attacker | Payee allowlist checked by the policy service |
| Agent burns funds as "fee" | Max fee enforced |
| Many small payments under the limit drain the vault | MVP: user deposits only the agent's budget and can revoke anytime. Stretch: daily limit |
| Policy service is compromised | It cannot move funds alone (2-of-2); owner can always withdraw |
| Replay of a payment | 402 replay protection (txid claimed once) |
| Swap price manipulation | Quote expiry + minimum output |

## Scope
- **MVP:** tUSD, vault (2-of-2 + owner withdraw), policy service, paid API, agent payment, dashboard.
- **Nice to have:** atomic swap and tUSD-priced API, daily limit.
- **Stretch:** on-chain covenant vault.
- **Out of scope:** cross-chain bridge, third-party liquidity providers.

## Demo script (~2 min)
1. User connects BSV Desktop and deposits into the vault (approval window visible).
2. Agent gets a task, calls the paid API, gets 402, pays through the vault. Show tx on WhatsOnChain.
3. Agent tries an over-limit or non-allowlisted payment: refused.
4. (If done) Agent swaps BSV -> tUSD and pays a tUSD-priced API.
5. User withdraws the remaining funds from BSV Desktop.

## Open questions
- Does the BSV team accept the 2-of-2 + policy service design as non-custodial? (ask Axel)
- Is a covenant feasible with ts-stack, or is sCrypt allowed alongside it?
- Testnet funds received?

## Plugging in other ideas
The vault is a building block, so other ideas can sit on top of it:
- any agent use case (research, trading, content) can be the **customer** of the vault in the demo,
- any paid service idea can be the **merchant** the agent pays,
- any DeFi idea (swap variants, launchpad, stable token) can be the **liquidity layer** underneath.
