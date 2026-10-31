# 0001: Two-phase settlement signing

**Status:** accepted, implemented (`packages/core/src/pool/`), on mainnet since 30 October 2026.
**Source:** design document §4.6 ([FINAL-IDEA.md](../archive/hackathon-2026/FINAL-IDEA.md), Turkish), original proposal [idea.md](../archive/hackathon-2026/ideas/idea.md).

## Context

The original proposal used a Lighthouse-style assurance contract: every participant pre-signs its pledge `ALL|ANYONECANPAY`, and the transaction becomes valid once enough pledges are combined. An `ALL|ACP` signature must fix every output when it is made, but the first participant to sign does not know who else will join. The credit outputs therefore cannot be in the same transaction, and delivery becomes a separate, later transaction by the provider: the provider could be paid and not deliver (the proposal's open risk #2). An ACP pledge can also be withdrawn at any time by spending its coin, so it is no stronger against griefing.

## Decision

- The **provider** signs its reserved credit input once with `SIGHASH_SINGLE|ANYONECANPAY`: valid in any transaction whose output 0 pays it P. It can then stay offline.
- **Participants** pledge a coin they keep, and sign the finished settlement with `SIGHASH_ALL` in a signing round, after verifying the whole transaction.

## Reasoning

Agents are online, so a second signing round costs them nothing. In return:

1. Payment and delivery are in one transaction (delivery versus payment).
2. Each participant, and the guard for vault agents, sees the whole transaction and can enforce "I pay **and** I receive my credits".
3. Pledges need not be exact amounts, because the settlement returns change.

The provider keeps the one advantage of ACP that matters to it: sign once, stay offline. The `SINGLE|ACP` signature also survives re-planning with other participants, so a retry round needs no new provider signature (validation 1).

## Alternatives considered

- Lighthouse `ALL|ACP` pledges for everyone (above).
- For people who cannot stay online, the Lighthouse idea came back as an opt-in mode with a guard co-signer, because a bare `SINGLE|ACP` pledge could be paired with a fake credit output (BSV-21 is not script-enforced).

## Consequences

- A coordinator is needed to run rounds. It holds no keys or funds; its remaining power is selection, which is made detectable (deterministic order, pledge-list hash, audit endpoint) rather than impossible.
- Participants must be reachable during the round (60 s timeout by default); griefing is made costly with a registration fee, a waiting list, a round limit and outpoint blacklisting.
- BSV Desktop had to sign a custom sighash scope through `createSignature({ hashToDirectlySign })`; validation 2 confirmed it on mainnet.
