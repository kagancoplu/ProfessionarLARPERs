# Coop Rail PoC — USDC (Base) → BSV, straight into the agent's vault

Track D · Faz 3 · time box 4 h (2026-10-30 19:05 → 23:05) · plan: [`plan/phases/D-P3.md`](../plan/phases/D-P3.md) · idea: `FINAL-IDEA.md` §4.10

An agent (or a human) holding USDC on Base gets BSV on the other chain, atomically, and the BSV lands in its **Mandate Vault**. The claim branch is agent + guard 2-of-2, so money from the Rail cannot bypass the owner's policy.

```
Base   agent: USDC → AgentCoopHTLC.lock(maker, h = sha256(s), T_base = now + 6 h)
BSV    maker: funding v1 (signed, NOT sent): OP_IF OP_SHA256 <h> OP_EQUALVERIFY 2 <agent> <guard> 2 CHECKMULTISIG
                                             OP_ELSE 2 <maker> <agent> 2 CHECKMULTISIG OP_ENDIF
BSV    maker: refund v1, nLockTime = H + 6, sequence 0xfffffffe → agent checks and signs → maker keeps it
BSV    maker: sends the funding (its txid is the one the refund spends)
BSV    agent + guard (kind:'rail'): OP_0 <sigA> <sigG> <s> OP_1 → the agent's vault script     (s is now public)
Base   maker: claim(id, s) → USDC to the maker
If it goes wrong: the maker sends its refund after H + 6; the agent calls refund(id) after T_base.
```

No `OP_CHECKLOCKTIMEVERIFY` on BSV (NOP since Genesis), so the BSV refund path is a pre-signed nLockTime transaction, not a script branch with a time lock.

## What works (offline, tested)

| Part | Where | Evidence |
|---|---|---|
| Base HTLC (`lock`, `claim(secret)`, `refund` after timeout; sha256 hashlock; id = keccak of the terms) + MockUSDC | `contracts/base-htlc/*.sol`, compiled with solc 0.8.37 (`artifacts.json`) | `apps/maker/test/htlc.evm.test.ts` on an in-memory EVM (`@ethereumjs/evm`): claim pays the receiver, wrong secret / double claim / early refund / late claim revert, refund after the timeout. The test recompiles and compares the committed artifact |
| BSV HTLC: rail keys `[1,'agentcoop rail']` (keyID = swapId, `'anyone'`), claim unlock (≤ 183 B), refund unlock (≤ 150 B) | `packages/core/src/scripts/htlc.ts` | e2e below; the mock chain verifies every script |
| Maker + agent steps: quote (spread 150 bps), Base lock check, v1 funding with `noSend` (txid fixed before broadcast), pre-signed refund, `sendWith`, claim, secret extraction | `apps/maker/src/rail.ts`, `base.ts`, `evm.ts` | `test/e2e.rail.mockchain.test.ts`: 0.5 USDC → 985 sat into the vault, the maker claims the USDC with the secret read from the BSV claim, the owner withdraws the vault alone |
| Guard `kind:'rail'` (R1–R6): the HTLC names this guard and agent for this swap, final tx, agent signature over the guard's sighash, **the HTLC's sats land in the agent's registered vault**, fee ≤ `maxFeeSats` | `apps/guard/src/rail.ts` | e2e: claim to the agent's own address → `rail funds must land in the vault`; another wallet → `agent mismatch` |
| Agent-side refund checks before signing: spends the swap's HTLC, version 1, sequence enforces nLockTime, lockTime ≥ H + k | `checkAndSignRefund` | e2e: early lockTime and a final sequence are refused |
| Refund path | e2e | the maker's pre-signed refund verifies (ELSE branch) and is accepted by the mock chain |
| Maker HTTP for Track E: `GET /quote?dir=usdc-bsv&amount=`, `GET /events` (SSE, `CoopEvent` src `maker`), `/healthz` | `apps/maker/src/server.ts` (`npm run maker -w @agentcoop/maker`) | `apps/maker/test/server.test.ts` |

## Ready but not run (needs funds)

| Step | Command | Needs |
|---|---|---|
| Deploy to Base Sepolia (HTLC + MockUSDC if no Circle test USDC) | `npm run deploy -w @agentcoop/maker` (dry run) → `-- --yes` | Base Sepolia ETH on the deployer (`BASE_PRIVATE_KEY`); dry run was checked against `https://sepolia.base.org` |
| Validation test 4: nLockTime (time-based now + 15 min, height-based H + 2 refused early, accepted at H + 2) | `npm run validation4 -w @agentcoop/scripts` (dry run) → `-- --yes` | ≤ 1,000 sats in `maker` (or `--wallet agent-1`), Node 24 laptop; dry run read Arcade's height |
| Validation test 6: version 1 malleability | not written | see below |
| Live swap: Base Sepolia + BSV mainnet, ≤ 1 USDC / ≤ 1,000 sat | the e2e steps with `ViemEvm` and server wallets | everything above + `BASE_HTLC_ADDRESS` |

**Validation 6 (open).** Chronicle lifts the malleability restrictions only for transactions with version > 1; a version 1 funding should therefore keep its txid, so the pre-signed refund stays valid. Not observed yet. Plan: on mainnet, send a version 1 transaction whose input signature is high-S (the guard and the agent already refuse high-S signatures themselves) and record whether Arcade refuses it; then the same with version 2. If version 1 is malleable, the refund must be signed after the funding is mined (the agent waits one block before claiming).

## Assumptions and open points

- **Height-based refund** (H + 6 ≈ 1 h), not time-based: no dependence on median-time-past (validation 4 records both).
- **Funding not broadcast before the refund is signed**: the maker could still refuse to fund (the agent's USDC then returns after `T_base`); the agent never loses both sides.
- **`T_base` = now + 6 h** against H + 6 blocks: the maker needs the secret before `T_base`; the agent must claim before H + 6 − 2 (safety margin).
- **One direction only** (USDC → BSV). The maker's BSV inventory runs down and is rebalanced by hand. The reverse direction swaps the roles with the same two contracts (Faz 5 A).
- **PoC limits**: ≤ 1 USDC and ≤ 1,000 sat per swap; fixed rate `RAIL_SATS_PER_USDC` plus spread; no price oracle.
- The swap steps are library calls (tests, scripts); the maker exposes only `/quote` and `/events` over HTTP. A swap API (`POST /swaps …`) is Faz 5 A.
- The mock chain does not enforce nLockTime; that is what validation 4 is for.

## Result

**Sonuç: kısmen başarılı (offline).** Swap uçtan uca çalışıyor: mock chain + bellek içi EVM, gerçek kontrat bytecode'u, gerçek guard. İade yolu ve guard redleri de test edildi. Base Sepolia ve BSV mainnet'te koşmadı (test ETH/USDC ve sats yok). Doğrulama 4 hazır, doğrulama 6 açık. Faz 5'in A yolu (tam Coop Rail) ancak testnet swap'ı ve doğrulama 4/6 geçerse seçilir; aksi halde B yolu.
