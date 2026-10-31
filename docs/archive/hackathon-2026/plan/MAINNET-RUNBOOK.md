# Mainnet runbook — from the moment the sats arrive to submission

> Prepared by: Track B (30.10 ~21:30). Puts every track's mainnet steps **in one order**; the details of each command are in each track's own README and in `docs/OPS.md`. This file does not repeat them; it orders them.
> Status (21:40): every track green on the mock chain, **sats in hand**, no mainnet transaction yet. Next: steps 1–5 (S1).

## 0. Before starting (human, 5 min)

1. **Sats:** in hand (30.10). Write the amount into STATUS → Track D "Wallet/funding status".
2. **Which Desktop is the treasury?** The Desktop on this repo machine is `03e8836800…94a45a`, mainnet and unlocked (preflight). If it is the treasury, write that into STATUS → Track D; otherwise write the treasury laptop's identity key.
3. **`.env` permissions:** `chmod 600 .env` (preflight saw 644). Copy the keys to the vault (`docs/OPS.md` §2).
4. **Preflight:** `node infra/preflight.mjs`. Spends nothing, prints no key. Fix the `✗` rows until you see `Ready for S1`; `!` rows are warnings.

## 1. Order

For each step: **who · where · command · cost (sat) · record.** "Record" = a row in `plan/STATUS.md` → "Mainnet transactions" (date, T number, txid, track, note). Every script prints the WhatsOnChain link.

| # | Step | Who · where | Command | Sat | Record / check |
|---|---|---|---|---|---|
| 1 | Services | B · repo machine | `node infra/run.mjs` (overlay :8080 + coordinator :8090), in separate terminals `npm run guard -w @agentcoop/guard`, `npm run provider` | 0 | `node infra/preflight.mjs` → services ✓, coordinator "signing rounds on" |
| 2 | First mainnet payment (the lock) | D · treasury Desktop | `npx tsx --import @agentcoop/core/register-sdk scripts/fund.ts agent-1=1000` | 1,000 | funding txid; the `fund.ts` row into STATUS |
| 3 | **Validations 2 + 3** (Desktop signs SINGLE\|ACP, Arcade accepts; how many approval windows) | A · a machine with Desktop | `npx tsx --import @agentcoop/core/register-sdk scripts/spike-sighash.ts` | ~2,000 (returned, the fee stays) | validation table #2, #3 (count the windows by eye) |
| 4 | S1 funding | D · treasury | `…/fund.ts agent-1=49000 agent-2=50000 provider-api=20000` (`--dry-run` first) | 119,000 | funding txids; `node infra/preflight.mjs --wallets` → S1 ✓ |
| 5 | **S1 — walking skeleton** (T1, T2, T3×2, T5) | A · repo machine | `OVERLAY_URL=http://localhost:8080 npx tsx --import @agentcoop/core/register-sdk scripts/skeleton.ts` | ~1,000 price + fees (circulates in the team) | 5 txids into STATUS; **sync S1 ✓**; overlay `GET /pools` shows the pool `settled` |
| 6 | **Validation 7** (lineage, without the overlay) | A | `npx tsx --import @agentcoop/core/register-sdk scripts/lineage-check.ts <T5 txid>_1` | 0 | validation #7 |
| 7 | Remaining funding | D · treasury | `…/fund.ts agent-3=50000 coordinator=5000 guard=5000 maker=30000`; Desktop→Desktop `desktop-owner=60000 desktop-human=30000` (`docs/OPS.md` §3.5) | 180,000 | funding txids |
| 8 | Provider product token (T1) | C · provider Desktop | `npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0` | ~fee | T1 txid; tokenId written to `products/gpu-h100.json` |
| 9 | Pool + offer (T2) | C · provider Desktop | Agents only: `npm run provider-cli -- open-pool --credits 40 --price 1000 --deadline +144 --fee 100 --label "8×H100 · 1 week" --min 5`. If a person joins too, grow it by their credits, e.g. a person with 12 credits → `--credits 52 --price 1300`. **A pool settles only when exactly full** (fill-or-kill, A's `planSettlement` needs exactly N): the three agents' 7-day need is 17 + 11 + 12 = 40 credits; set N to the sum of the pledges, 25 sat per credit fixed | ~fee | T2 txid; the offer both at the coordinator and on chain (`offer` record); `GET /pools` `hasOffer` |
| 10 | Agents + person pledge (T3) | C · repo machine; person · `desktop-human` | `npm run agents` (they stay on the WS); person: `npm run participant-cli -- pledge <poolId> 12` then `npm run participant-cli -- sign` (if the pool was opened with 52 in step 9) | pledges (to the provider when the pool settles) | T3 txids; `GET /pools/:id` `pledgedCredits` |
| 11 | **Coordinator settlement (T5) — S2** | B (automatic) | by itself when full; the person approves in Desktop within 60 s | fee ≈ 40 sat/participant | T5 txid; `GET /pools/:id/audit` → `consistent`; `GET /metrics` → `custodiedSats: 0`; **sync S2 ✓** |
| 12 | Using credits (T6) + retail 402 (T7) | C | `npm run agent -- eval --jobs 3` | retail job price | T6, T7 txids |
| 13 | Vault (T9) + validation 5 | D · owner Desktop | `npm run owner -w apps/owner-cli -- create-vault --agent agent-1` → `… policy …` → `… fund <vaultId> 20000` → `npm run adopt -w @agentcoop/guard -- agent-1 <vaultId>` | 20,000 (the owner's) | T9 txid; validation #5; overlay `{ op:'vaults', owner }` `verified:true` |
| 14 | Vault agent in a settlement (T10) + injection refusal | C + D | a pool with the vault agent (repeat steps 9–11); injection: `npm run demo-injection -w @agentcoop/scripts` if it has a mainnet mode, otherwise the `denied` record in the guard's `/decisions` | fee | T5 + T10 txid; guard 403 record |
| 15 | Market (T8) | C / A | list an agent's surplus credits + let another agent sweep (C's market behaviour) | ask price | T8 txid; `GET /listings` empties |
| 16 | The owner withdraws from the vault (T9) | D · owner Desktop | `npm run owner -w apps/owner-cli -- withdraw <vaultId>` | fee | T9 txid |
| 17 | Validation 4 (nLockTime) | D | `npm run validation4 -w @agentcoop/scripts -- --yes` | ≤ 1,000 | validation #4 |
| 18 | Rail (T11, optional) | D | `docs/RAIL-POC.md` | Base gas + a little USDC | T11 + BaseScan link |
| 19 | Web live mode (video) | E | `npm run web` (with the services up) | 0 | — |

**Minimum path (if time runs short):** 0 → 1 → 2 → 3 → 4 → 5 → 7 (agent-3 only) → 8 → 9 → 10 → 11 → 12. This order meets every elimination requirement: real mainnet transactions, a user flow with BSV Desktop (provider + human participant), a non-custodial settlement (`custodiedSats: 0` + audit) and a real payment by an AI agent (pledge + T7).

## 2. Budget

| Item | Sat |
|---|---|
| Server wallets (`docs/OPS.md` §1): provider-api 20k, coordinator 5k, guard 5k, agent-1..3 150k, maker 30k | 210,000 |
| Desktops: owner 60k, human 30k | 90,000 |
| **Total** | **≈ 300,000** |
| Actually consumed (fees, non-refundable registration fees, retail 402) | a few thousand; the pledges go to the provider at settlement, i.e. back to the team |

≈ 125,000 sat is enough for the minimum path (steps 2–5 + agent-3).

## 3. If something goes wrong

| Symptom | What to do |
|---|---|
| Arcade `REJECTED` / `DOUBLE_SPEND` | Do not rebuild the tx; txid + message into STATUS → Blockers. In a coordinator round this means `round_failed` and blacklisting the input WoC reports as spent (automatic) |
| The overlay did not take the tx (empty STEAK) | `npx tsx … scripts/lineage-check.ts <outpoint>`; is the parent on the overlay? TokenKit `sync()` resubmits the parent from the chain (guide §17.6) |
| The coordinator round timed out | `GET /pools/:id` → `coordinator.blacklist` reasons; after 3 rounds the pool stays open, a new pledge starts a new attempt |
| I missed the Desktop approval | keep `participant-cli sign` open; the next round asks again |
| Out of money | `docs/OPS.md` §4 |
| A service died | `infra/run.mjs` restarts it itself; the blacklist/round history persists (`data/coordinator/`) |
| `does not provide an export named …` | start the script with `tsx --import @agentcoop/core/register-sdk` |

## 4. To collect for submission (D's README)

- Every row of STATUS "Mainnet transactions" → README "Example transactions" (with WhatsOnChain links).
- The `GET /metrics` output (participant count, fee, `custodiedSats`), the `/audit` output of at least one settlement.
- The mainnet columns of the validation table (#2, #3, #4, #5, #7).
