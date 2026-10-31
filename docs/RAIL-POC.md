# Coop Rail: USDC on Base → BSV, straight into the agent's vault

**Status: proof of concept, offline.** The swap runs end to end on the mock chain and an in-memory EVM with the real contract bytecode and the real guard. The Base contract is not deployed and no live swap has run (T11, T11b). Mainnet validations 4 (nLockTime) and 6 (version 1 malleability), which the design depends on, passed on 31 October 2026.

An agent (or a person) holding USDC on Base gets BSV atomically, and the BSV lands in its **Mandate Vault**. The claim branch is agent + guard 2-of-2, so money arriving through the Rail cannot bypass the owner's policy. The component that runs it is [`apps/maker`](../apps/maker/README.md); why the refund is a pre-signed transaction is [ADR 0003](decisions/0003-coop-rail-presigned-refund.md).

## The swap

```
Base   agent: USDC → AgentCoopHTLC.lock(maker, h = sha256(s), T_base = now + 6 h)
BSV    maker: funding v1 (signed, NOT sent): OP_IF OP_SIZE <32> OP_EQUALVERIFY OP_SHA256 <h> OP_EQUALVERIFY 2 <agent> <guard> 2 CHECKMULTISIG
                                             OP_ELSE 2 <maker> <agent> 2 CHECKMULTISIG OP_ENDIF
BSV    maker: refund v1, nLockTime = H + 6, sequence 0xfffffffe → the agent checks and signs → the maker keeps it
BSV    maker: sends the funding (its txid is the one the refund spends)
BSV    agent + guard (kind: 'rail'): OP_0 <sigA> <sigG> <s> OP_1 → the agent's vault script     (s is now public)
Base   maker: claim(id, s) → USDC to the maker
If it goes wrong: the maker's watchdog sends its refund once the tip is past H + 6; the agent calls refund(id) after T_base.
```

BSV has no working `OP_CHECKLOCKTIMEVERIFY` (a NOP since Genesis), so the BSV refund is a pre-signed nLockTime transaction, not a script branch with a time lock.

## What works (offline, tested)

| Part | Where | Evidence |
|---|---|---|
| Base HTLC: `lock`, `claim(secret)`, `refund` after the timeout; sha256 hash lock; id = keccak of the terms; plus a mock USDC for tests | `contracts/base-htlc/HTLC.sol`, `contracts/base-htlc/MockUSDC.sol`, compiled with solc 0.8.37 (`contracts/base-htlc/artifacts.json`) | `apps/maker/test/htlc.evm.test.ts` on an in-memory EVM (`@ethereumjs/evm`): a claim pays the receiver; a wrong secret, a double claim, an early refund and a late claim revert; the refund works after the timeout. The test recompiles and compares the committed artifact |
| Base HTLC boundaries and token handling (F-1, F-2): a fee-on-transfer token is refused at lock, a token returning nothing works, one returning false is refused; `nonReentrant` | `contracts/base-htlc/HTLC.sol` | `apps/maker/test/htlc.boundaries.evm.test.ts`, `apps/maker/test/htlc.tokens.evm.test.ts` |
| BSV HTLC: rail keys `[1, 'agentcoop rail']` (keyID = swapId, counterparty `anyone`), claim unlock (≤ 183 B), refund unlock (≤ 150 B), 32-byte secrets only (F-11) | `packages/core/src/scripts/htlc.ts` | `test/e2e.rail.mockchain.test.ts`, `test/rail.htlc-preimage.test.ts` |
| Maker and agent steps: quote (150 bps spread), Base lock check, version 1 funding with `noSend` (txid fixed before broadcast), pre-signed refund, `sendWith`, claim, secret extraction | `apps/maker/src/rail.ts`, `apps/maker/src/base.ts`, `apps/maker/src/evm.ts`, `apps/maker/src/swap.ts` | `test/e2e.rail.mockchain.test.ts`: 0.5 USDC → 985 sat into the vault; the maker claims the USDC with the secret read from the BSV claim; the owner withdraws the vault alone |
| Guard `kind: 'rail'` (R1–R6): the HTLC names this guard and agent for this swap; final transaction; the agent's signature over the guard's sighash; **the HTLC's satoshis land in the agent's registered vault**; fee ≤ `maxFeeSats` | `apps/guard/src/rail.ts` | e2e: a claim to the agent's own address → `rail funds must land in the vault`; another wallet → `agent mismatch` |
| The agent's refund checks before signing: spends the swap's HTLC, version 1, a sequence that enforces nLockTime, lockTime ≥ H + k | `checkAndSignRefund` in `apps/maker/src/rail.ts` | e2e: an early lockTime and a final sequence are refused |
| Refund path | e2e | the maker's pre-signed refund verifies (`OP_ELSE` branch) and is accepted by the mock chain |
| Refund watchdog and timing margins (F-4): the maker broadcasts the saved refund one block after its nLockTime (Arcade refuses it at the lock height itself, validation 4); when the agent has claimed, it reads the secret from that claim and claims the USDC on Base; it funds only with a Base timeout that survives blocks 3× slower; the agent will not claim within 2 blocks of the refund | `apps/maker/src/watchdog.ts`, `apps/maker/src/rail.ts` | `apps/maker/test/swap.mockchain.test.ts` |
| Maker HTTP: `GET /quote?dir=usdc-bsv&amount=`, `GET /events` (SSE), `GET /healthz` | `apps/maker/src/server.ts` | `apps/maker/test/server.test.ts` |

## Ready, not run (needs funds)

| Step | Command | Needs |
|---|---|---|
| Deploy to Base Sepolia (HTLC, plus a mock USDC if no Circle test USDC) | `npm run deploy -w @agentcoop/maker` (dry run), then `-- --yes` | Base Sepolia ETH on the deployer (`BASE_PRIVATE_KEY`); the dry run was checked against `https://sepolia.base.org` |
| Live swap: Base Sepolia + BSV mainnet, ≤ 1 USDC / ≤ 1,000 sat | `npm run swap-demo -w @agentcoop/maker -- --vault <vaultId>` (dry run: checks keys, balances, guard and vault, moves nothing), then `-- --vault <vaultId> --amount 0.5 --yes`. The pre-signed refund is saved to `data/rail/<swapId>.json` before the funding is sent | everything above + `BASE_HTLC_ADDRESS`, `BASE_USDC_ADDRESS`, `RAIL_SATS_PER_USDC`, a funded `maker` and agent, a guard with the agent's vault |

## Mainnet validations

- **4, nLockTime (passed, 31 Oct):** `npm run validation4 -w @agentcoop/scripts`. A future time-based lock and a tip below the lock height were refused. Arcade also refused the height-locked refund at tip = nLockTime (twice, although consensus allows it in the next block) and accepted it later ([2f72e8b489…](https://whatsonchain.com/tx/2f72e8b489bcf3ebae7ce7b4ce0d5bc97202eade0272e59e18135d3dd851c146)). A refund must be broadcast at least one block after its lock height; the watchdog does.
- **6, version 1 malleability (passed, 31 Oct):** `npm run validation6 -w @agentcoop/scripts`. Chronicle lifts the malleability rules only for version > 1. A version 1 spend with a high-S signature was refused ("unlocking scripts are invalid"), the same spend with low-S accepted ([e6955d7a3f…](https://whatsonchain.com/tx/e6955d7a3fc883cf3833f85184f8aca291a3a03aef1782483e3d4ab9a3bc45a9)); a version 2 spend with high-S was accepted ([01374a77bf…](https://whatsonchain.com/tx/01374a77bf2f5e7fe38d4bf7b9cd56c0b5e2c79639092a52cbe8553d4c717cd4)). A version 1 funding keeps its txid, so the pre-signed refund stays valid.

## Assumptions and open points

- **Height-based refund** (H + 6 ≈ 1 h), not time-based: no dependence on median-time-past.
- **The funding is not broadcast before the refund is signed.** The maker can still refuse to fund (the agent's USDC returns after `T_base`), but the agent never loses both sides.
- **`T_base` = now + 6 h** against H + 6 blocks: the maker needs the secret before `T_base`; the agent must claim before H + 6 − 2.
- **The claim branch never expires.** Safety relies on the maker broadcasting its refund on time (F-4, T-23).
- **One direction only** (USDC → BSV). The maker's BSV inventory runs down and is rebalanced by hand; the reverse direction would swap the roles with the same two contracts (T-16).
- **PoC limits:** ≤ 1 USDC and ≤ 1,000 sat per swap; fixed rate `RAIL_SATS_PER_USDC` plus spread; no price oracle; USDC assumed to be a standard ERC-20 apart from what F-1 and F-2 handle.
- The swap steps are library calls (tests, `swap-demo`); the maker exposes only `/quote`, `/events` and `/healthz` over HTTP. There is no swap API.
- The mock chain does not enforce nLockTime; that is what validation 4 is for.

Security findings for the Rail (F-1 to F-4, F-11) and the threats (T-14, T-15, T-16, T-23): [AUDIT-READINESS.md §6](AUDIT-READINESS.md#6-what-we-already-know), [THREAT-MODEL.md](THREAT-MODEL.md).
