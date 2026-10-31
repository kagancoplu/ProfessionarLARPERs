# Pools and atomic settlement

The core of AgentCoop: many buyers fill one bulk order together, and one transaction pays the provider and delivers every buyer's share. Nobody holds anybody else's money at any point.

## The problem

AI agents buy GPU time, model capacity and data one call at a time, at list price. The real discounts (reserved GPU blocks, provisioned throughput, plan tiers) sit behind large upfront commitments that small teams cannot make alone. Group buying solves that, but it usually means sending everyone's money to an intermediary who waits for the group to fill and refunds it if the deal falls through.

AgentCoop removes the intermediary. It is an assurance contract: either the whole order happens, in one transaction, or nothing moves.

## Roles

| Role | Wallet | Does |
|---|---|---|
| Provider | BSV Desktop (operator) and a server wallet (its API) | Mints a credit token, opens pools, signs each pool's offer once |
| Participant | wallet-toolbox (agents) or BSV Desktop (people) | Pledges, verifies the settlement, signs its own input |
| Coordinator | none | Collects pledges, plans the settlement, runs the signing round, broadcasts. Anyone can run one |
| Guard | server wallet | Co-signs for vault agents and offline (Lighthouse) participants after the same checks a participant runs ([mandate-vault.md](mandate-vault.md)) |

## Lifecycle

1. **Offer.** The provider reserves N credits in one BSV-21 output and announces the pool's terms on chain (price P, target N, minimum share, registration fee, deadline height) in the same transaction (T2). It then signs the credit input with `SIGHASH_SINGLE|ANYONECANPAY`: "anyone may take these N credits in a transaction whose output 0 pays me P". The provider can go offline. The signed offer is stored by the coordinator and can also be published on chain, so any coordinator can find it.
2. **Pledge.** A participant sets aside a pledge coin in its own wallet and records the pledge on chain, paying a small non-refundable registration fee to the provider in the same transaction (T3). The coin stays under the participant's own key.
3. **Withdraw.** Until the settlement, a participant can cancel by spending its coin back to itself (T4).
4. **Lock-in.** When valid, unspent pledges add up to N, the coordinator builds the settlement plan and sends it to each participant.
5. **Sign.** Each participant rebuilds the whole transaction from the plan and checks it: its credits go to its own address, its change goes back to its own coin's script, the provider is paid exactly P, its fee share is under its cap, the on-chain pledge-list hash matches, and the provider's credits trace back to the token deploy (`verifyLineage`, without trusting the overlay). Only then does it sign its input with `SIGHASH_ALL`.
6. **Settle.** With every signature in, the coordinator broadcasts the settlement (T5) and submits it to the overlay. The provider is paid and every participant has its credits: one transaction, one WhatsOnChain link.
7. **Fail.** If the deadline passes before the pool fills, nothing is broadcast. The only cost was the registration fee; the pledge coin can be withdrawn or reused.

## The settlement transaction

```
in 0      offer: N credits (provider, SINGLE|ACP)      out 0     P sats → provider
in 1..n   pledge coins (each participant, ALL)          out 1..n  k_i credits → participant i
                                                        out …     change_i → participant i's coin script
                                                        last      OP_RETURN agentcoop settle { poolId, termsHash, pledgeListHash, round }
```

Payment and delivery are outputs of the same transaction (delivery versus payment): the provider cannot be paid without every participant getting its credits, and no participant can be left without them. The provider's signature is valid only in a transaction that pays it P; each participant's `ALL` signature covers every output, so the coordinator cannot change anything after signing. Exact formats: [reference/protocol.md](../reference/protocol.md).

Why the provider signs `SINGLE|ACP` while participants sign `ALL` in a round, instead of everyone pre-signing: [ADR 0001](../decisions/0001-two-phase-settlement-signing.md).

## Rules that keep it honest

- **Exact fill.** A pool settles only when the selected pledges add up to exactly N credits (fill-or-kill). Agents may take a few spare credits to close a pool.
- **Deterministic selection.** Pledges are taken in order of block height, then txid. The settlement's `OP_RETURN` commits to the hash of the pledge list it used.
- **Anti-griefing.** A participant who pledges and then does not sign costs others time, so pledges pay a non-refundable registration fee, the coordinator over-fills the waiting list up to 120 %, a round times out after 60 s, at most three rounds run per attempt, and a pledge that timed out, rejected or signed badly is blacklisted by outpoint.
- **Anyone can coordinate.** The coordinator holds no keys and no funds. Because the offer can be published on chain, a second coordinator reading the same overlay can close any pool.
- **Auditable selection.** `GET /pools/:poolId/audit` re-derives a settlement from the chain: whether the pledge-list hash matches the inputs, whether the provider was paid exactly P, whether every included pledge got its credits, and which pledges ahead in line were left out and why. `GET /metrics` classifies every settlement output and reports `custodiedSats`, computed rather than assumed.

What is **detectable but not prevented**: a coordinator can still choose to leave someone out (censorship) or stall. The audit makes it visible and anyone can run another coordinator (T-3 in [THREAT-MODEL.md](../THREAT-MODEL.md)).

## Offline participants: Lighthouse pledges

Agents are online, so a signing round costs them nothing. A person may not want to wait for it. A Lighthouse pledge lets a person sign once and leave:

- The person's coin sits on `OP_IF <withdraw key> OP_CHECKSIG OP_ELSE 2 <person> <guard> 2 OP_CHECKMULTISIG OP_ENDIF`: the person alone can always take it back; otherwise it needs the person and a guard the person named.
- The person signs `SINGLE|ACP` over the coin and its own credit output only, and gives the pledge to the coordinator (`POST /pledges/lighthouse`).
- When the pool fills, the coordinator asks that guard. The guard runs the same checks the person would (delivery versus payment, fee cap, lineage) and co-signs with `ALL`.

A plain `SINGLE|ACP` pledge would not be safe: BSV-21 is not enforced by script, so anyone could pair the signature with a fake credit output. The guard closes that gap (T-20). Mainnet example: [83d339b896…](https://whatsonchain.com/tx/83d339b8963c0f12cc038fc65e751be077386bee3ea045f5cc526e2cb9cd585c).

## Pool types not implemented

The design notes describe two further pool types that are not built: forward credits for a future period (a capacity reservation market) and a backstop underwriter who commits to take a fixed share Y of a pool if it does not fill, in exchange for an extra discount. They remain ideas ([archive](../archive/hackathon-2026/README.md)).

## Where it lives in the code

| Step | Code | Tests |
|---|---|---|
| Offer, pledge, plan, verify, settle | `packages/core/src/pool/` | `packages/core/test/pool.plan.test.ts`, `test/skeleton.mockchain.test.ts` |
| Lineage | `packages/core/src/verify/lineage.ts` | `packages/core/test/lineage.test.ts` |
| Signing rounds, blacklist, audit, metrics | `apps/coordinator/src/` | `apps/coordinator/test/` |
| Lighthouse | `packages/core/src/pool/lighthouse.ts`, `apps/guard/src/lighthouse.ts` | `test/e2e.lighthouse.mockchain.test.ts` |
