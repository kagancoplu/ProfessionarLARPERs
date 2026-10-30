# Guard — Mandate Vault policy engine and co-signer (Track D)

An agent's budget sits in a vault output:

```
OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
```

- **Owner** (BSV Desktop) withdraws alone, at any time, without the guard or the agent.
- **Agent + guard** spend together. The guard signs only after its policy checks pass.
- **The guard cannot move funds alone, and neither can the agent**: the chain enforces the 2-of-2. A compromised guard can at most refuse to sign; the owner's exit path stays open. The guard holds no funds; its wallet only signs.

Plans: [`plan/phases/D-P1.md`](../../plan/phases/D-P1.md) (script, G1–G13), [`plan/phases/D-P2.md`](../../plan/phases/D-P2.md) (settle, pledges, hot wallet). Script and signers: [`packages/core/src/scripts/vault.ts`](../../packages/core/src/scripts/vault.ts), [`packages/core/src/signers/VaultSigner.ts`](../../packages/core/src/signers/VaultSigner.ts). Owner CLI: [`apps/owner-cli`](../owner-cli).

## Run

```bash
npm install                                  # at the repo root (workspace)
npm test                                     # root: test/vault.mockchain.test.ts, test/e2e.vault-settlement.mockchain.test.ts, apps/guard/test/*
npm run typecheck                            # root
npm run guard -w @agentcoop/guard            # GUARD_URL port (default 8091); wallet WALLET_GUARD_KEY; ARCADE_URL; state data/guard/
npm run demo-injection -w @agentcoop/scripts # the injection demo, offline (mock chain), ~15 s
```

**Node 24** (tested 24.22; the treasury laptop runs 24.13). The npm scripts start with `tsx --import @agentcoop/core/register-sdk` (MASTER §3.1). On Node 22.22 that hook fails on CommonJS packages (`ERR_INVALID_RETURN_PROPERTY_VALUE`); tests (vitest) run on either.

## API (MASTER §3.7)

| Method | Path | Auth | Does |
|---|---|---|---|
| `PUT` | `/vaults/:vaultId` | BRC-103, identity = owner | Body = vault record `{ v:'1', vaultId, owner, agent, guard }`. The guard derives the script itself and returns `{ vaultId, lockingScriptHex, guardPub }`; the owner CLI refuses to fund unless it matches its own |
| `PUT` | `/policies/:agentIdentity` | BRC-103, identity = owner | `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }`, stored for the (owner, agent) pair |
| `GET` | `/vaults/:vaultId` | BRC-103, owner or agent | Record, script, policy, `spentLast7dSats`, `hotLast24hSats` |
| `GET` | `/policies/:agentIdentity` | BRC-103, owner or agent | `{ owner, agent, policy, updatedAt }` (the agent gets the latest policy stored for it); 404 if none |
| `GET` | `/decisions?agent=&limit=` | BRC-103, the agent or an owner of one of its vaults | `{ agent, decisions: [{ id, ts, agent, vaultId?, kind, poolId?, sats?, outcome: 'approved'\|'denied', reason? }] }`, newest first (≤ 500) |
| `GET` | `/events` | none | SSE, MASTER §3.10 `CoopEvent` (`src:'guard'`): `cosign_approved`, `cosign_denied`, `policy_updated`, `vault_registered`; last 500 kept, `Last-Event-ID` resumes, `: keepalive` every 15 s. Identity keys are public; no secrets |
| `POST` | `/cosign` | none (the agent's signature is in the request) | see below → `{ signatureHex, guardPub }` or `403 / 400 { reason }` |
| `GET` | `/healthz` | none | `{ ok, identityKey, network }` |

CORS: `Access-Control-Allow-Origin` = `GUARD_CORS_ORIGIN` (default `*`), and the BRC-103 headers (`x-bsv-auth-*`) are exposed so a browser's `AuthFetch` (Track E's owner console) works.

`/cosign` body: `{ txBEEF?, plan?, inputIndex, agent, agentSignatureHex, context }`. Signatures are in checksig format (DER ‖ `0x41`), hex.

| `context.kind` | The transaction | `context` |
|---|---|---|
| `pay` | `txBEEF`: AtomicBEEF with every input's source | `payees?: [{ vout, provider, keyID }]` (provider payments) · `hotWallet?: [{ vout, derivationPrefix, derivationSuffix }]` (top-up of the agent's own hot wallet) · `poolBEEF?` (the pool tx, when the tx is a vault pledge; otherwise the guard fetches it) |
| `settle` | `plan`: the coordinator's `SettlementPlan`; **the guard builds the tx itself** (`planTransaction`) | `poolId` (required), `expectedCredits?`, `tokenId?` (cross-checks; the guard reads the truth from the chain) |
| `rail` | `txBEEF`: the claim of a Coop Rail HTLC (D-P3) | `swapId` (required). The guard signs with its rail key `[1,'agentcoop rail']`/swapId; the BSV must land in the agent's vault |

Agent side (`@agentcoop/core/signers/VaultSigner`): `spendFromVault`, `pledgeFromVault`, `cancelVaultPledge`, `internalizeVaultSettlement`, `topUpHotWallet`, `new VaultSigner(wallet, { vaultId, cosign, context, plan? })` (an `InputSigner` for A's `signSettlementInput`); `httpCosigner(GUARD_URL)`. A refusal throws `CosignRejected { status, reason }`.

## Policy fields

| Field | Meaning |
|---|---|
| `allowProviders` | Provider identity keys the agent may pay. The recipient is **proven**, not trusted: a payment output must equal `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))`, which the guard recomputes; for a pool the guard also checks that the offer UTXO sits on the provider's `offer <nonce>` key |
| `maxPerPoolSats` | Max sats committed to one pool over 7 days: registration fee + pledge coin at pledge time, fee + real cost after the settlement. For plain payments: max per transaction |
| `weeklyCapSats` | Max outflow of the vault over a rolling 7 days; a pledge coin counts from pledge time (reserved), the settlement replaces it with its real cost |
| `maxFeeSats` | Max miner fee of one transaction; in a settlement, max fee share of this agent |
| `hotWalletDailySats` | Max top-ups of the agent's hot wallet over a rolling 24 hours (they also count in the weekly cap) |

## What each check closes (FINAL-IDEA §8)

The project-wide threat model, with every threat mapped to its control and test, is [docs/THREAT-MODEL.md](../../docs/THREAT-MODEL.md); this table is the guard's part of it in detail.

| Check | Refusal | Threat closed |
|---|---|---|
| Every input's source hashes to its prevout txid (G1) | `source txid mismatch` | Lying about other inputs' amounts (BIP-143 signs only the input's own amount) to hide vault money in "agent change" |
| Input = a registered vault of this agent, one per tx (G3) | `not a registered vault input`, `agent mismatch` | The guard as a signing oracle for other scripts or another owner's vault |
| Final tx (G4) | `non-final transaction` | Pre-signed future spends that dodge the weekly window |
| The guard computes the sighash (ALL\|FORKID); the agent's signature must verify on it (G5) | `agent signature invalid` | **Blind signing**; tampering after signing; budget griefing without the agent |
| A policy exists (G6) | `no policy` | Default deny |
| Payee proof + allowlist (G7, G8) | `provider not allowed`, `payee proof mismatch` | **Prompt injection** paying an attacker, without trusting the overlay or the coordinator for who the payee is |
| Unlisted outputs ≤ the agent's own inputs (G9) | `vault funds to unlisted output` | Vault money to the agent's change or a third party |
| Fee cap (G10) | `maxFeeSats exceeded` | Draining through the miner fee |
| **Pledge** (2.1b): record names this agent, `signer:'vault'`, A.3.1 layout, coin on this vault (P1, P2) | `pledge record does not name this agent`, `pledge layout: …` | Pledging the owner's money for someone else's credits; the coin leaving the vault |
| **Pledge**: pool tx bound by txid; provider allowed, revenue key and offer key are the provider's (P3, P4) | `provider not allowed: …`, `pool payScript is not the provider's revenue key`, `offer UTXO is not the provider's` | **"Put 100% of the budget into pool X"** refused before any fee is paid; a fake pool naming an allowed provider |
| **Pledge**: fee + coin within `maxPerPoolSats`, coin reserved in the weekly cap (P5) | `maxPerPoolSats exceeded (pledge …)`, `weeklyCapSats exceeded` | **"Put 100% of the budget into the (allowed) pool"**; splitting the budget across many pools |
| **Pledge**: `verifyLineage` of the offer's credits, cached (P6) | `LINEAGE_FAILED: …` | Paying a fee for fake credits; makes the settlement round fast |
| **Settle** (2.1): tx built from the plan; terms + nonce from the offer input's source tx; expected credits from the pledge record on chain (S1, S3, S4) | `pool mismatch`, `no pledge record for this input`, `expectedCredits mismatch` | Signing a transaction other than the plan; a coordinator moving the coin into another pool or share |
| **Settle**: provider proofs (S5) | `provider not allowed: …`, … | A provider the owner revoked after the pledge |
| **Settle**: A's `verifySettlementPlan` with `verifyLineage` (S6) | `BAD_PLAN: …`, `LINEAGE_FAILED: …` | **Coordinator theft** (credits to another address, fewer credits, smaller change, higher fee share); **fake credits shown as valid by the coordinator or the overlay** (lineage checked by the guard itself) |
| **Settle**: per-pool and weekly caps on the real cost (S7) | `maxPerPoolSats exceeded`, `weeklyCapSats exceeded` | A policy tightened between pledge and settlement |
| **Hot wallet** (2.2): output = the agent's own BRC-29 key from 'anyone' (H1, H2) | `hot wallet proof mismatch` | Paying a third party disguised as a top-up |
| **Hot wallet**: rolling 24 h cap (H3) | `hotWalletDailySats exceeded` | A compromised agent draining the vault through its hot wallet |
| **Rail** (D-P3): the HTLC names this guard's and this agent's keys for the swap; final; agent signature; the HTLC's sats land in the agent's registered vault; fee cap (R1–R6) | `not a rail HTLC for this guard`, `agent mismatch`, `rail funds must land in the vault` | **"Coop Rail claim bypasses the vault policy"** (closed: claim = agent + guard 2-of-2 and the guard only signs into the vault) |
| Rolling weekly cap, one ledger entry per vault input (G12) | `weeklyCapSats exceeded` | Bounded loss if the agent (or the agent and the guard) is compromised |
| One request at a time, decision log (G13) | — | Racing two requests under the cap; auditability |

Every decision is a line in the log and in `data/guard/decisions.jsonl`:

```
[guard] DENY pay agent=0288c20fe0… vault=8c7f639586… reason="provider not allowed: 02e6f62179…"
[guard] DENY pay agent=0288c20fe0… vault=8c7f639586… reason="maxPerPoolSats exceeded (pledge 10351 > 6000)"
[guard] ALLOW pay/pledge agent=0288c20fe0… vault=8c7f639586… outflow=50 paid=50 fee=115 pool=518c04cd3e… committed=4301
[guard] ALLOW settle agent=0288c20fe0… vault=8c7f639586… outflow=4068 paid=4068 fee=67 pool=518c04cd3e…
[guard] DENY settle agent=0288c20fe0… vault=8c7f639586… reason="BAD_PLAN: my credit output pays someone else"
[guard] ALLOW pay/hot agent=0394574bdd… vault=17b7964da2… outflow=1500 paid=0 fee=54 hot=1500
[guard] DENY pay agent=0394574bdd… vault=17b7964da2… reason="hotWalletDailySats exceeded (1500 + 1000 > 2000)"
```

(From `test/e2e.vault-settlement.mockchain.test.ts` and `test/vault.mockchain.test.ts`. `fee` is the miner fee; the agent's own inputs pay it for `pay`, for `settle` it is this agent's share.)

### What the guard trusts, and what it does not

- **Nothing from the coordinator or the overlay.** The settlement tx comes from the plan, but every fact the guard checks is bound to the chain: input sources by txid (G1), the pool's terms and nonce by the offer input's source txid, the expected credits by the pledge tx's txid, the credits' genuineness by `verifyLineage` (ancestors fetched from Arcade/WhatsOnChain, txids recomputed, kit rules applied locally). `poolBEEF` and the overlay's pool lookup are transport only.
- **The hot wallet** is outside the guard's control by design: whatever is topped up is the agent's to spend (bounded by `hotWalletDailySats`).
- **Timing:** `verifyLineage` costs one Arcade fetch per ancestor (measured 250–950 ms); A's pools are 1–3 deep. It runs at pledge time and is cached, so the settlement round (60 s) sees it from cache.

Still open: if the guard is down the agent cannot spend (the owner can still withdraw); the ledger counts at signing time, so a signed but never broadcast spend still uses the window; credits go to the agent's own token address, so an agent can sell them on the market and bypass the guard (K3, A Faz 5 `creditLock:'vault'`).

## Other scripts

- `npm run adopt -w @agentcoop/guard -- <agent-name> <vaultId>`: takes the owner's fundings (`data/vaults/<vaultId>/fund-*.json`) into the agent's `agentcoop vault` basket (also after a spend failed and the UTXO was relinquished but is still unspent).
- `npm run validation5 -w @agentcoop/guard`: mainnet validation test 5 (≤ 1,000 sats; Desktop as owner, `agent-1`, guard in-process, `provider-api`). See D-P1 §9.3.

## For other tracks

- **A** (A.3.1 `buildPledge(…,'vault')`, A.3.2): `pledgeFromVault(wallet, { vaultId, utxo, terms, credits, tokenIndex, cosign, poolBEEF? })` builds the A.3.1 layout the guard checks (out0 coin on the vault script, out1 fee, out2 record `signer:'vault'`); `buildPledge` can delegate to it. Settlement: `signSettlementInput(plan, i, new VaultSigner(wallet, { vaultId, cosign, plan, context: { kind:'settle', poolId, expectedCredits, tokenId } }))`, then `internalizeVaultSettlement`. `unlockingScriptLength` = `VAULT_COSIGN_UNLOCK_LENGTH = 150` (= A's `VAULT_UNLOCKING_SCRIPT_LENGTH`). Shared e2e: `test/e2e.vault-settlement.mockchain.test.ts`.
- **B** (coordinator): nothing to change; vault inputs are verified with `Spend` like any other. A guard refusal arrives as `sign_reject` with reason `guard: <reason>`.
- **C** (vault agent): `pledgeFromVault` + `httpCosigner(GUARD_URL)` for pools; `topUpHotWallet(wallet, { vaultId, utxo, satoshis, cosign })` before retail 402 calls (the sats land in the agent's `default` basket, so `AuthFetch`/402 work as usual). Use `CosignRejected.reason` as the `sign_reject` reason.
