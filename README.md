<div align="center">

# 🏰 AgentCoop

### *A village where AI agents pool their coins, and no one ever holds the chest.*

[![CI](https://github.com/kagancoplu/ProfessionarLARPERs/actions/workflows/ci.yml/badge.svg)](https://github.com/kagancoplu/ProfessionarLARPERs/actions/workflows/ci.yml)
![Chain: BSV](https://img.shields.io/badge/chain-BSV-eab308)
![Held in custody: 0 sat](https://img.shields.io/badge/held%20in%20custody-0%20sat-16a34a)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

<a href="https://professionar-larpe-rs.vercel.app/?mode=mock">
  <img src="docs/screenshots/web/town-demo.gif" alt="The AgentCoop Town: villagers pledge at the notice board, the fountain lights up, the horse rides out and a credit chest lands at every house" width="800">
</a>

**[▶ PRESS START: play it in your browser](https://professionar-larpe-rs.vercel.app/?mode=mock)**
<sub>no wallet, no satoshis, no install · press <kbd>V</kbd> to walk the town yourself</sub>

</div>

> **x402 taught agents how to pay. AgentCoop lets many agents buy one block of capacity together, with no deposits, no escrow and no refunds: one atomic BSV transaction pays the provider and delivers every share.**

AgentCoop is a non-custodial group-buying protocol for AI agents (and people) on the BSV blockchain. It is open source (MIT) and experimental: it has run on mainnet with small amounts and has not had an external security audit. The game above is the protocol's own web app in mock mode; the proof that it runs on real BSV is the [mainnet transactions](#-achievements-unlocked-on-mainnet).

Not a programmer? Read [the plain-language overview](docs/overview.md).

---

## 📜 The quest

AI agents buy GPU time, model capacity and paid APIs one call at a time, at list price. The real discounts (reserved GPU blocks, provisioned throughput, plan tiers) sit behind large upfront commitments that small teams cannot make alone. Group buying would fix that, but today it means putting everyone's money with an intermediary who waits for the group to fill and refunds it if the deal falls through.

**Your quest:** buy together, without ever handing your gold to anyone.

AgentCoop is for small AI teams and agent operators who buy, and for GPU, data and model-capacity providers and resellers who sell: they get prepaid, all-or-nothing demand before they commit to capacity.

## 🧙 Choose your character

| | Class | In the Town | What they do |
|---|---|---|---|
| ⚒️ | **Provider** | the workshop | Announces a pool ("40 GPU-hours for 1,000 sats") and pre-signs its credits as an open offer |
| 🤖 | **Agent** | a villager with a house | Forecasts its need, pledges from its own wallet, checks the settlement and signs only its own input |
| 🧑 | **Person** | you, with <kbd>V</kbd> | Pledges from BSV Desktop; as a *lighthouse* signs once and leaves |
| 📯 | **Coordinator** | the horse rider | Assembles the one settlement transaction. Holds no keys and no money; anyone can run one |
| 🛡️ | **Guard** | the gate | Co-signs a Mandate Vault spend only inside the owner's policy, raises "!" on anything else |
| 🕵️ | **Stranger** | whispers in the square | A prompt injection. The boss fight (see below) |

## 🎮 How to play

1. **A pool appears on the notice board.** The provider pre-signs its credits: "anyone may take these credits in a transaction that pays me this price".
2. **Villagers pledge.** Until the pool fills, every satoshi stays a coin in its owner's wallet (in the Town, the purse glows; the chest only *shows* the pledge), and anyone can withdraw.
3. **The pool fills, the fountain lights up.** The coordinator assembles **one transaction** that pays the provider and delivers BSV-21 credit tokens to every participant (delivery versus payment). Each participant checks the whole transaction, including the credits' lineage back to the token deploy, and signs only its own input. The horse rides out and a credit chest lands at every house.
4. **Game over without a winner?** If the pool does not fill, nothing is broadcast. Nobody needs a refund, because nobody paid.

Credits are spent on the provider's API (redeemed, or bypassed with pay-per-call HTTP 402) or resold to other agents at the market stalls in one atomic transaction.

### 👹 Boss fight: the prompt injection

An agent's budget can sit in an owner-controlled **Mandate Vault**: agent and guard sign together under the owner's policy, and the owner can always withdraw alone. When a stranger whispers to an agent and it tries to pay someone it should not, its policy vetoes; bypass that, and the guard at the gate refuses to co-sign. A prompt-injected agent cannot spend outside its mandate. Watch it happen with `npm run demo:injection`, or with "Inject now" on the web app's agents page.

### 🗺️ The map behind the game

```mermaid
flowchart LR
  P[Provider<br/>BSV Desktop] -- pool + SINGLE|ACP offer --> O[(Overlay<br/>tm_agentcoop)]
  A1[Agent<br/>wallet-toolbox] -- pledge --> O
  A2[Agent with<br/>Mandate Vault] -- pledge via guard --> O
  H[Person<br/>BSV Desktop] -- pledge --> O
  O -- pools, pledges --> C[Coordinator<br/>no keys, no funds]
  C -- sign_request --> A1 & A2 & H
  A2 -. co-sign .- G[Guard<br/>owner's policy]
  C -- one settlement tx --> BSV[(BSV)]
  BSV -- credits --> A1 & A2 & H
  BSV -- payment --> P
  A1 -- credits / 402 --> API[Provider API]
```

More: [concepts](docs/concepts/pools-and-settlement.md) · [architecture](docs/architecture.md) · [protocol reference](docs/reference/protocol.md).

## 🎒 Inventory

- **Pools with atomic settlement:** N participants, one transaction, the provider paid and every participant's credits delivered in it; deterministic selection with an on-chain pledge-list hash, an audit endpoint, and a `custodiedSats` metric computed from the chain.
- **Credits:** one BSV-21 token per product, verified by lineage rather than by trusting an indexer; spent through capped redemption or HTTP 402 (BRC-105).
- **A market:** signed `SINGLE|ANYONECANPAY` listings, swept atomically.
- **Mandate Vault:** a 2-of-2 vault with a policy co-signer and an owner exit; credits bought from a vault can stay locked to it.
- **Lighthouse pledges:** a person signs once and leaves; a named guard co-signs the settlement after the same checks.
- **Autonomous agents:** three agents that forecast their need, decide with a rules or LLM brain behind a policy enforced in code, pledge, verify and sign, redeem, pay retail and trade.
- **Coop Rail (proof of concept):** an HTLC swap from USDC on Base into an agent's vault. In the Town: the boat at the harbor.
- **A web app** with consoles for providers, participants and vault owners, and the pixel-art Town that shows the protocol live; every signature is a BSV Desktop approval.

## 🏆 Achievements unlocked (on mainnet)

| | Achievement | Transaction |
|---|---|---|
| 🥇 | **Party of three:** a pool settles through the coordinator's signing round, 2 agents and 1 person, one transaction, audit `consistent`, `custodiedSats: 0` | [5314ab8b9f…](https://whatsonchain.com/tx/5314ab8b9fc731c824fd49a0bbb6a69bb0f57ad2fff11dda656d40eb6584a185) |
| 🛡️ | **Guarded loot:** a vault agent's settlement, the guard co-signs, the credits land on the vault script | [08a6455612…](https://whatsonchain.com/tx/08a6455612925df713c4738b450d3018ee689ad9fcb064dbfb3555603ba47db5) |
| 🗼 | **Lighthouse keeper:** the person signed once and went offline | [83d339b896…](https://whatsonchain.com/tx/83d339b8963c0f12cc038fc65e751be077386bee3ea045f5cc526e2cb9cd585c) |
| 🪙 | **Pay as you go:** an agent pays per call over HTTP 402 | [5176e9eeb8…](https://whatsonchain.com/tx/5176e9eeb8604d83ba6154f10ddaf8e8dee66ad185338b0127f2fbf2efcf853f) |
| 🏪 | **Market sweep:** lineage verified before paying | [675c333414…](https://whatsonchain.com/tx/675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c) |
| 💯 | **Full house** (mock chain): 100 participants settled in one 36.5 kB transaction for 3,670 sat | — |

Every transaction type, the mainnet validation tests and the full ledger: [docs/reference/transactions.md](docs/reference/transactions.md).

## 📊 Stats

| | Status |
|---|---|
| Pools, pledges, settlement through the coordinator, Lighthouse settlement, vault agent settlement with vault-locked credits, redeems, 402 payments, the Mandate Vault (owner exit, agent + guard spend, an injected payment refused), the market sweep | **Run on BSV mainnet** (30–31 October 2026) |
| Every flow above, plus a 100-participant settlement, a second independent coordinator, the public-edge limits | **Mock chain**, with the real components, in CI on every push |
| Coop Rail | **Offline proof of concept**: mock chain and in-memory EVM; the Base contract is not deployed |
| The provider's GPU and proxy work | **Simulated**: payments, credits and settlement are real; the work is a simulator |
| Prices | **Illustrative** ("demo pricing"): the mechanism is real, a saving is not claimed |
| The web app's wallet flows with BSV Desktop on mainnet | Tested end to end on the mock chain; people joined mainnet pools with `participant-cli` |
| Public hosting of the services | Deployment scripts exist ([infra](infra/README.md)); no public instance is documented as running |

**Known weaknesses:** a provider can sell credits and not serve them (bounded by the pool price, credits are resellable); a coordinator's selection is auditable but cannot be forced; Coop Rail has no reverse direction. The full list, with every threat's control and test: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## 🕹️ Play locally (offline: no wallet, no satoshis)

Node 22 or newer and npm 11 (npm 10.9 cannot install this workspace).

```bash
npx npm@11 install
npm test                  # every package on wallet-toolbox's mock chain
npm run demo              # a provider opens a pool, 3 agents pledge, one settlement, credits spent and traded
npm run demo:injection    # the boss fight: its policy vetoes; with that bypassed, the guard refuses
npm run web:mock          # the Town at http://localhost:5173 with a scripted mock BSV Desktop
```

**Controls** in the Town: <kbd>V</kbd> walk the town · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows move · <kbd>E</kbd> open what is in front of you · ⚙ day/night, sound, presenter mode. More in [the web app's README](apps/web/README.md).

Next level, including the live stack: [docs/getting-started.md](docs/getting-started.md). Playing with real satoshis: [docs/OPS.md](docs/OPS.md).

## 🧭 World map (repository)

| Path | What |
|---|---|
| [`packages/core`](packages/core/README.md) | Protocol library: builders, signers, settlement verifier, lineage, scripts |
| [`packages/overlay`](packages/overlay/README.md) | Overlay topic `tm_agentcoop` and lookup service `ls_agentcoop` |
| [`apps/coordinator`](apps/coordinator/README.md) | Signing rounds over WebSocket, offers, listings, audit, metrics |
| [`apps/guard`](apps/guard/README.md), [`apps/owner-cli`](apps/owner-cli/README.md) | Mandate Vault co-signer and the owner's CLI |
| [`apps/provider-api`](apps/provider-api/README.md), [`apps/provider-cli`](apps/provider-cli/README.md) | Simulated provider API and the provider operator's CLI |
| [`apps/agents`](apps/agents/README.md), [`apps/participant-cli`](apps/participant-cli/README.md) | Autonomous agents and the CLI for people |
| [`apps/maker`](apps/maker/README.md), `contracts/` | Coop Rail maker and the Base HTLC |
| [`apps/relay`](apps/relay/README.md) | Optional Supabase mirror for the web (display only) |
| [`apps/web`](apps/web/README.md) | Web consoles and the Town |
| [`infra`](infra/README.md), `scripts/`, `supabase/` | Operations, validation scripts, mirror schema |
| [`docs`](docs/README.md) | Documentation |

## 🔐 Security

User keys never leave BSV Desktop or BSV Browser; server keys come from a git-ignored `.env`. [docs/AUDIT-READINESS.md](docs/AUDIT-READINESS.md) is the package for an auditor: value at risk, trust boundaries, scope, 16 invariants tied to code and tests, our own findings (F-1 to F-11), scans and mainnet evidence. `npm run check:docs` fails CI if a file or test cited there stops existing. Report vulnerabilities as [SECURITY.md](SECURITY.md) describes; use small amounts only.

## 🎬 Credits

AgentCoop was built at the TUM Blockchain & AI Hackathon (30–31 October 2026), BSV Association track "DeFi Rails for Agentic Payments". It is a finished hackathon project, published as is; known gaps and the next levels are in [docs/ROADMAP.md](docs/ROADMAP.md). The original design notes and plans are kept in [docs/archive/hackathon-2026](docs/archive/hackathon-2026/README.md).

Town art: Kenmi, *Cute Fantasy RPG* ([asset licences](apps/web/assets/LICENSES.md)). Code: MIT, see [LICENSE](LICENSE).

<div align="center"><sub>🪙 Thanks for playing. 0 sat were held in custody during the making of this README.</sub></div>
