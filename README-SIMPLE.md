# AgentCoop

**Group buying for AI agents on BSV. Nobody holds anybody's money: one transaction pays the provider and gives every buyer their share.**

**Live demo:** <https://professionar-larpe-rs.vercel.app/>

BSV Blockchain track, "DeFi Rails for Agentic Payments" · TUM Blockchain & AI Hackathon, 30–31 October 2026. The developer documentation is in [README.md](README.md).

## The problem

AI agents buy GPU time, LLM tokens and paid APIs one call at a time, at full price. The big discounts (reserved GPU blocks, bulk plans) need a large upfront purchase that a small team cannot make alone.

Buying together would solve this. But today group buying means sending everyone's money to someone who collects it, waits for the group to fill, and hopefully pays it back if the deal falls through. That middleman can lose the money, freeze it, or run with it.

## What AgentCoop does

AgentCoop lets many agents (and people) buy one big block together **without a middleman ever holding the money**.

1. **The provider opens a pool.** For example: "40 GPU-hours for 1,000 sats". It mints its credits as a BSV-21 token and signs its half of the deal in advance: "these credits go to whoever pays this price".
2. **Buyers pledge.** Each agent or person says "I'm in for 17 credits" from their own wallet. The money stays a coin in their own wallet. They can cancel and take it back at any time.
3. **When the pool is full, one transaction does everything.** A coordinator builds a single BSV transaction. It takes every buyer's coin, pays the provider, and sends each buyer their credits. Every buyer checks the whole transaction, then signs only their own coin. Either all of it happens or none of it does.
4. **If the pool does not fill, nothing moves.** There is no refund to wait for, because the money never left anyone's wallet. The only cost is a small registration fee paid with the pledge.
5. **Buyers use or resell their credits.** Credits pay for jobs on the provider's API. Credits an agent does not need can be sold to other agents in one transaction.

The coordinator has no keys and no money. Anyone can run one. Our web app shows a counter of the money the coordinator holds. It always reads **0 sat**.

## Agents with a spending limit: the Mandate Vault

An AI agent can be tricked. A prompt injection like "put the whole budget into this pool" is a real risk once agents hold money.

So the owner can give the agent a **Mandate Vault**. Money in the vault needs two signatures to move: the agent's and a **guard's**. The guard signs only when the spend follows the owner's rules (which providers, how much, how often). The owner can always withdraw everything alone, without the agent or the guard.

In our demo, a prompt-injected agent tries to spend its whole budget. The agent's own rules stop it. If those rules are bypassed, the guard refuses to sign.

## The agents

Three AI agents run GPU jobs (fine-tuning, evaluation, inference). Before each job, an agent picks the cheapest way to pay:

1. credits it already holds;
2. cheaper credits other agents are selling;
3. a pool, if its forecast says it will need the capacity next week;
4. otherwise, full price, paid per call.

The decision can come from simple rules or from Claude. Either way, a spending policy written in code has the last word, not the AI.

## See it on mainnet

These ran on BSV mainnet on 30–31 October. Each link opens WhatsOnChain.

| What | Transaction |
|---|---|
| The provider mints its credit token from BSV Desktop | [762e6b0837…](https://whatsonchain.com/tx/762e6b083728f9cd653b938e2947a92e50d0a92218351b1c64b0fe1e696e089f) |
| The provider opens a pool | [9118788a77…](https://whatsonchain.com/tx/9118788a77efb3854878d47c1edb199d03ecbf00ab8e3da32b0a907c8f18c77c) |
| An agent pledges | [00f50d70bd…](https://whatsonchain.com/tx/00f50d70bd5aa27c5e5333c92462ba9997cb57037ef9101df2c9ec4a0f423aef) |
| **The pool settles: 2 agents and 1 person, one transaction, provider paid, credits delivered** | **[5314ab8b9f…](https://whatsonchain.com/tx/5314ab8b9fc731c824fd49a0bbb6a69bb0f57ad2fff11dda656d40eb6584a185)** |
| A pool settles for an agent with a Mandate Vault: the guard co-signs, the credits land in the vault | [08a6455612…](https://whatsonchain.com/tx/08a6455612925df713c4738b450d3018ee689ad9fcb064dbfb3555603ba47db5) |
| An agent pays per call at full price (HTTP 402) | [5176e9eeb8…](https://whatsonchain.com/tx/5176e9eeb8604d83ba6154f10ddaf8e8dee66ad185338b0127f2fbf2efcf853f) |
| An agent buys spare credits from another agent | [675c333414…](https://whatsonchain.com/tx/675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c) |

The full list is in [README.md](README.md#example-transactions). In our tests, 100 buyers settled in one transaction of 36.5 kB for a fee of 3,670 sats. This only works because BSV keeps big transactions and tiny payments cheap.

## The demo

Open <https://professionar-larpe-rs.vercel.app/>. The website shows AgentCoop as a pixel-art village:

- the agents are villagers;
- a pool is a notice board with a chest that fills as pledges come in;
- the settlement is one rider delivering credits to every house at once;
- the guard stands at the gate and turns away the prompt injection;
- a counter in the corner shows the coins held by the coordinator: **0 sat**.

On the website the agents and the flow are simulated, so you need no wallet to watch it. The proof that it runs on real BSV is the mainnet transactions above.

## What is real and what is not

- **Real:** the payments, pledges, settlements, credit tokens, vaults and signatures. They are real BSV transactions, built with the BSV SDK and BSV Desktop.
- **Simulated:** the provider's work (the GPU jobs are a simulator) and the prices (examples).
- **Not finished:** **Coop Rail**, a swap that lets agents holding USDC on Base join a pool. It works in tests but has not run on a live network.

## Words we use

| Word | Meaning |
|---|---|
| Provider | Sells capacity in bulk (GPU time, data, LLM tokens) |
| Pool | One bulk deal that buyers fill together |
| Pledge | A buyer's "I'm in", backed by a coin that stays in their own wallet |
| Settlement | The single transaction that pays the provider and delivers every buyer's credits |
| Credits | BSV-21 tokens; one credit is one unit of the provider's service |
| Coordinator | Builds the settlement transaction; holds no keys and no money |
| Mandate Vault | An agent's wallet that needs the agent's and the guard's signatures; the owner can always withdraw alone |
| Guard | Checks every vault spend against the owner's rules before co-signing |
| HTTP 402 | Pay-per-call: the API asks for a small payment with each request |

## More

- Developer documentation, setup and the full transaction table: [README.md](README.md)
- Security review and threat model: [docs/AUDIT-READINESS.md](docs/AUDIT-READINESS.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)
- License: MIT, see [LICENSE](LICENSE)
