# Mandate Vault and the guard

How an owner gives an AI agent a budget that the agent cannot spend outside the owner's rules, even if it is prompt-injected, and that the owner can always take back.

## The problem

An agent that holds money can be tricked: "put the whole budget into this pool" is a realistic prompt injection. Giving the agent its own wallet means trusting every decision it makes. Rules written into the agent's prompt or even its code do not help if the agent itself is compromised.

## The vault script

The owner funds a vault output from BSV Desktop:

```
OP_IF   <ownerPub> OP_CHECKSIG                              owner alone, any time
OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG    agent and guard together
OP_ENDIF
```

- **The owner** withdraws alone, at any time, without the agent or the guard (T9).
- **The agent and the guard** spend together (T10). The guard is a co-signer that signs only after the owner's policy checks pass.
- **Neither the agent nor the guard can move funds alone**; the chain enforces the 2-of-2. A compromised guard can at most refuse to sign, and the owner's exit stays open.

The vault is registered with the guard (`PUT /vaults/:vaultId`, authenticated as the owner with BRC-103). The guard derives the script itself, and the owner CLI refuses to fund a vault whose script does not match its own derivation. An `OP_RETURN agentcoop vault` record lets anyone recompute the script from the owner, agent and guard identity keys, so the overlay hides vault records that claim someone else's vault.

## The policy

The owner sets, per agent: the providers the agent may pay (`allowProviders`), a cap per pool (`maxPerPoolSats`), a rolling weekly cap (`weeklyCapSats`), a miner-fee cap (`maxFeeSats`), a daily cap on top-ups of the agent's hot wallet (`hotWalletDailySats`), and optionally a floor price for listing vault-locked credits (`minAskSatsPerCredit`). Field details: [apps/guard/README.md](../../apps/guard/README.md#policy-fields).

The guard never takes the agent's, the coordinator's or the overlay's word for a fact it checks:

- **Payees are proven, not trusted.** A provider payment must go to a key derived from that provider's identity key, which the guard recomputes.
- **The guard computes the sighash itself** and requires the agent's signature over that same sighash, so it never signs blindly and nothing can change after the agent signed.
- **Settlements are rebuilt from the plan.** For a vault pledge in a pool, the guard runs the same `verifySettlementPlan` and `verifyLineage` a participant runs, reads the terms and expected credits from the chain, and applies the caps to the real cost.
- **Caps count at signing time**, so a signed but never broadcast spend still uses budget (errs on the safe side, F-5). Each approved co-signature is later linked to the transaction that spent the vault coin.

Every check (G1–G13, P1–P6, S1–S7, H, C, L, R) and the threat it closes: [THREAT-MODEL.md §2](../THREAT-MODEL.md#2-guard-checks--threats).

## Two layers against prompt injection

1. **The agent's own policy.** After the brain (rules or LLM) proposes a decision, `enforcePolicy`, which is code rather than a prompt, vetoes anything over the owner's caps or more than twice the forecast need.
2. **The guard.** If the agent's code is bypassed, the guard still refuses: "100 % of the budget into pool X" exceeds `maxPerPoolSats`, and a payment to a provider outside the allowlist is refused with 403 before anything is signed or broadcast.

Try it offline: `npm run demo:injection` (the agent's side) and `npm run demo-injection -w @agentcoop/scripts` (the guard's side). On mainnet the guard refused an injected payment and paid the allowed one ([a7747d4654…](https://whatsonchain.com/tx/a7747d465417ab96129071344f70f973fb4244eba264cab59d69d19eb39a2108)).

## Vault-locked credits

Credits a vault agent buys could otherwise land on its own address, where it could sell them and escape the guard. A vault pledge can carry `creditLock: 'vault'`: the settlement then delivers the credits onto a BSV-21 inscription locked to the vault script itself. From there, with agent and guard, they can only:

- be **redeemed** at an allowed provider (or split back into the same vault), every credit accounted for; or
- be **listed** for sale with the proceeds paid to the vault at or above the owner's floor (listing is off without one).

The owner can still move them alone. `creditLock` is read from each pledge's on-chain record, never from the coordinator's plan, so a coordinator cannot flip it (T-10, T-21). When the provider returns unused vault-sourced credits, they go back onto the vault script (F-10, fixed).

## The hot wallet

Small retail 402 payments go through the agent's ordinary wallet so `AuthFetch` works unchanged. The guard approves top-ups of that hot wallet only to the agent's own derived key and within `hotWalletDailySats`; what is in the hot wallet is the agent's to spend. Large commitments (pools, market) come straight from the vault.

## What remains open

- If the guard is down, the agent cannot spend from the vault; the owner can still withdraw.
- An agent and its guard compromised together can spend up to the vault balance, within the caps (T-12). The owner bounds that by funding a weekly budget.
- BRC-100 wallets sign a hash they are given without seeing the transaction (`createSignature` with `hashToDirectlySign`). Agents and the guard verify the whole transaction before signing, and an agent keeps at most one active pledge, so the exposure is the `agentcoop` basket (T-13).

## A guard-less vault?

A covenant prototype (OP_PUSH_TX) showed that a script alone can enforce a static payee, a per-spend cap, change back to the vault and a fee cap, at about five times the fee of the guard path. It cannot replace the guard for pool settlements (BSV-21 is not script-enforced), per-pool payee derivation or rolling caps. It is research code, not exported: [ADR 0002](../decisions/0002-mandate-vault-guard-cosigner.md).

## Where it lives in the code

| Part | Code | Tests |
|---|---|---|
| Vault and credit-lock scripts | `packages/core/src/scripts/vault.ts`, `packages/core/src/scripts/creditLock.ts` | `test/vault.mockchain.test.ts`, `test/e2e.vault-credits.mockchain.test.ts` |
| Agent-side signer | `packages/core/src/signers/VaultSigner.ts` | `test/e2e.vault-settlement.mockchain.test.ts` |
| Guard policy and co-signing | `apps/guard/src/` | `apps/guard/test/`, `test/vault-credits.spend.mockchain.test.ts` |
| Owner operations | `apps/owner-cli/src/vault-ops.ts` | `test/vault.mockchain.test.ts` |
