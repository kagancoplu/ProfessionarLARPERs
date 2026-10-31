# D-P3 — Coop Rail PoC: USDC (Base) → BSV atomic swap (detailed plan)

> Track D · phase 3 · **time box 4 hours** (start 2026-10-30 19:05, end 23:05) · target sync **S3**
> Parent plan: `plan/track-D-vault-ops-rail.md` phase 3 · Idea: `FINAL-IDEA.md §4.10, §8, §12` · Interface: `00-MASTER-PLAN.md §3.2, §3.4 (htlcLockingScript), §3.7 (kind:'rail'), §3.9, §3.10 (maker)` · Previous: `plan/phases/D-P2.md`

---

## 1. Goal and the definition of "done"

Show **once, end to end** that USDC (Base) turns into BSV atomically. The BSV lands in the agent's **vault**: the claim branch is agent + guard 2-of-2, so money from the Rail cannot bypass the vault policy. Not in the live demo. When the time box runs out, whatever exists is written into `docs/RAIL-POC.md`.

**Acceptance** (track file): `docs/RAIL-POC.md` exists and ends with an explicit **"Result: successful / unsuccessful"** line; the results of validation tests 4 and 6 in STATUS; the time box not exceeded.

**Evidence reachable in this session** (no sats, no Base Sepolia ETH/USDC, no Foundry):
- Contract: `contracts/base-htlc/HTLC.sol` + `MockUSDC.sol`, compiled with `solc` 0.8.37, tested on an in-memory EVM (`@ethereumjs/evm`): lock → claim (with the secret), a wrong secret, refusing a refund before the timeout, a refund after the timeout, a double claim.
- The BSV side on the mock chain (MockServices verifies every script): the maker's v1 funding (txid known before broadcast) → the agent signs the pre-signed refund → the maker broadcasts → agent + guard (`kind:'rail'`) claim with the secret, the output into the **vault** → the maker reads the secret from the BSV tx → takes the USDC on the EVM. Also the refund branch and guard refusals.
- The network steps **ready but not run**: the Base Sepolia deploy (`npm run deploy -w @agentcoop/maker`), validation test 4 (`scripts/validation4.ts`, ≤ 1,000 sat).

So the result line may be "**partly successful (offline)**"; the mainnet/testnet steps decide whether phase 5 is A or B (§11).

---

## 2. Human steps

| # | Step | Who | Note |
|---|---|---|---|
| H1 | SETUP-ACCOUNTS #9: two EVM addresses (maker, agent). Keys **only in `.env`** (`BASE_PRIVATE_KEY` = maker, `BASE_AGENT_PRIVATE_KEY` = agent) and the vault | human | never into chat/commits |
| H2 | #10–11: Base Sepolia ETH (to both addresses) + test USDC (to the agent; Circle faucet). Without USDC the deploy script mints MockUSDC | human | |
| H3 | On the treasury laptop (Node 24) `npm run deploy -w @agentcoop/maker` → `BASE_HTLC_ADDRESS` into `.env` | human, or D via Remote Control | Sepolia gas is a few cents |
| H4 | 30k sat to the `maker` wallet (F4) and validation 4 (`npm run validation4 -w @agentcoop/scripts`, ≤ 1,000 sat) | human + D | when the sats arrive |
| H5 | Testnet swap: `npm run swap-demo -w @agentcoop/maker -- --live` (≤ 1 USDC, ≤ 1,000 sat) | D | after H1–H4 |

---

## 3. Dependencies (19:05)

| Dependency | Status | Effect |
|---|---|---|
| A.P0 `InputSigner`, `htlcLockingScript` | ✅ (A wrote it; the body exactly as FINAL-IDEA §4.10) | the body is in D; the signature does not change |
| Base Sepolia RPC | ✅ `https://sepolia.base.org` reachable | deploy/reads ready |
| Base Sepolia ETH/USDC, EVM keys | ✗ | the testnet steps wait; tests on the in-memory EVM |
| `maker` sats, mainnet | ✗ | validations 4/6 and the mainnet funding wait |
| Foundry | ✗ (not in the container) | with `solc` (npm) + `@ethereumjs/evm`; no Foundry needed |
| C.P3 vault agent | ✗ | the Rail "agent" in tests is library calls |

---

## 4. Design decisions

1. **EVM contract (`AgentCoopHTLC`):** `lock(receiver, token, amount, hashlock, timeout) → id`, `claim(id, secret)`, `refund(id)`. `hashlock = sha256(secret)` (the same as BSV's `OP_SHA256`; not keccak). `id = keccak256(sender, receiver, token, amount, hashlock, timeout)`; the same lock cannot be opened twice. Anyone may call `claim`, the money always goes to `receiver` and `secret` is revealed in the event; `refund` only after `timeout`, the money always to `sender`. States: `1 locked, 2 claimed, 3 refunded`. The ERC-20 `transferFrom`/`transfer` return value is checked.
2. **The BSV script** is the same as A's skeleton: `OP_IF OP_SHA256 <h> OP_EQUALVERIFY OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`. Unlock: claim `OP_0 <sigA> <sigG> <secret> OP_1` (≤ **183**), refund `OP_0 <sigM> <sigA> OP_0` (≤ **150**). Sighash ALL|FORKID, subscript = the whole script (`vaultSighash` is generic: it takes the source script).
3. **Derived keys, never identity:** `[1,'agentcoop rail']`, keyID = `swapId` (16 bytes hex), counterparty `'anyone'` — the same pattern as the vault: anyone rebuilds the script from the three identities, the guard derives its own key from `swapId`.
4. **A pre-signed refund, with nLockTime:** the refund tx is `version 1`, `lockTime = H + k` (block height; `< 500 000 000`), input `sequence = 0xfffffffe` (otherwise nLockTime is not applied). The agent signs the refund before the funding is broadcast; the maker broadcasts the funding only after that. The funding is `version 1` too (Chronicle's malleability exemption is only for v > 1; validation 6). The funding txid is known before the broadcast: wallet-toolbox `createAction({ options: { noSend: true } })` + later `sendWith`.
5. **Guard `kind:'rail'`:** the input is an HTLC script; `guardPub = derive(guard, swapId)` and `agentPub = derive(agent, swapId)`; the tx is final; **the whole HTLC (minus the fee) goes to the requesting agent's registered vault script** (FINAL-IDEA §4.10 "the output is the vault script or a pledge coin"; a pledge coin is on the vault script too); unknown outputs ≤ the agent's own inputs (like G9); fee ≤ `maxFeeSats`. Since it is an **inflow** to the vault, it does not count against the weekly cap; not written to the ledger, but to the decision log and the event stream. The guard does not see the secret; the script enforces it anyway.
6. **Time windows:** BSV `k = 6` blocks (≈ 1 h), Base `T_base = now + 6 h` (room for the maker taking the BSV back in the bad case + the USDC claim). The agent tries the claim only while `height < H + k − 2` (safety margin).
7. **Maker (`apps/maker`):** a library (`quote`, `verifyBaseLock`, `fundHtlc`, `signRefund`/`agentSignRefund`, `extractSecret`, `claimBase`) + a thin HTTP layer (`GET /quote`, `GET /events` SSE `CoopEvent`, for Track E). Price: `RAIL_SATS_PER_USDC` (env, fixed) + a 150 bps spread. EVM access is abstracted behind an `EvmPort` interface: the in-memory EVM in tests, viem (Base Sepolia) when live.
8. **Amount limits (PoC):** ≤ 1 USDC, ≤ 1,000 sat per swap; no network call without `--live`.

---

## 5. Files

| File | What it does |
|---|---|
| `contracts/base-htlc/HTLC.sol`, `MockUSDC.sol` | The contracts (MIT) |
| `contracts/base-htlc/artifacts.json` | `solc` 0.8.37 output (abi + bytecode); the test compares it with a fresh compile |
| `apps/maker/package.json` | `@agentcoop/maker`: `solc`, `@ethereumjs/evm`, `viem` (pinned versions) |
| `apps/maker/src/compile.ts` | `npm run compile` → artifacts.json |
| `apps/maker/src/evm.ts` | `EvmPort`; `MemoryEvm` (`@ethereumjs/evm`, time-controlled); `ViemEvm` (Base Sepolia) |
| `apps/maker/src/rail.ts` | The swap steps (maker + agent side library) |
| `apps/maker/src/server.ts`, `main.ts` | `GET /quote`, `GET /events`, `/healthz` |
| `apps/maker/src/deploy.ts` | Base Sepolia deploy (not run) |
| `packages/core/src/scripts/htlc.ts` | (D's body) `RAIL_PROTOCOL`, `deriveRailPub`, `railScriptFor`, `parseHtlcLockingScript`, the unlocks and their lengths |
| `apps/guard/src/rail.ts` | `evaluateRail` (§4.5) |
| `apps/maker/test/htlc.evm.test.ts`, `test/e2e.rail.mockchain.test.ts` | §9 |
| `scripts/validation4.ts` | Validation 4 (mainnet, ready; `npm run validation4 -w @agentcoop/scripts`) |
| `apps/maker/test/server.test.ts` | `/quote` and the event stream |
| `docs/RAIL-POC.md` | Result |

---

## 6. Interface addition (MASTER)

- §3.2: Rail keys `[1,'agentcoop rail']`, keyID = swapId, `'anyone'`; unlock lengths claim 183 / refund 150.
- §3.7: `/cosign` `kind:'rail'` → `{ txBEEF, inputIndex, agent, agentSignatureHex, context: { kind:'rail', swapId } }`.
- §3.9: `BASE_AGENT_PRIVATE_KEY`, `BASE_HTLC_ADDRESS`, `MAKER_URL`, `RAIL_SATS_PER_USDC`.
- §3.10: maker `GET /quote?dir=usdc-bsv&amount=`, `GET /events` (`rail_quote`, `rail_locked_base`, `rail_funded_bsv`, `rail_claimed`, `rail_refunded`).

---

## 7. Guard `rail` checks

| # | Check | `reason` | Threat it closes (§8) |
|---|---|---|---|
| R1 | G1 (sources, txid binding) | same | Lying about amounts |
| R2 | The input is on the HTLC template; `guardPub` = the guard's `swapId` key; `agentPub` = the requesting agent's `swapId` key; one HTLC input in the tx | `not a rail HTLC for this guard`, `agent mismatch` | Making the guard a signing oracle for other scripts |
| R3 | G4 final, G5 the agent's signature on the guard's sighash | same | Blind signing; future-dated spends |
| R4 | The agent has a registered vault and a policy | `no vault for this agent`, `no policy` | Rail money landing outside the vault |
| R5 | The HTLC amount minus the fee to the agent's vault script; unknown ≤ the agent's own inputs; OP_RETURN 0 sat | `rail funds must land in the vault`, `vault funds to unlisted output` | **"A Coop Rail claim bypasses the vault policy"** |
| R6 | Fee ≤ `maxFeeSats` | `maxFeeSats exceeded` | Draining through the fee |

---

## 8. Flow

```
agent: s ← 32 random bytes, h = sha256(s), swapId ← 16 bytes
1 Base   agent: approve + HTLC.lock(maker, USDC, amt, h, now + 6 h)              → id
2 BSV    maker: verifyBaseLock(id) (amount, receiver, h, time) → funding v1 (noSend):
              out0 HTLC(h, agent@swapId, guard@swapId, maker@swapId) = sats
3 BSV    maker: refund v1, nLockTime H+6, seq 0xfffffffe → the agent signs (verifies the refund) → the maker signs, keeps it
4 BSV    maker: broadcasts the funding (sendWith)
5 BSV    agent: claim tx (OP_0 sigA sigG s OP_1) → vault script; guard kind:'rail' → broadcast; s revealed
6 Base   maker: extractSecret(claim tx) → HTLC.claim(id, s) → USDC to the maker
Failure: if the agent does not claim, the maker broadcasts the refund after H+6; if the maker never broadcasts the funding, the agent calls HTLC.refund after T_base
```

---

## 9. Test scenarios

**9.1 EVM (`apps/maker/test/htlc.evm.test.ts`, in-memory EVM):** artifacts.json = a fresh compile; mint + approve + lock → the balance in the contract; a wrong secret → revert; the right secret → to the maker, the secret in the event; a second claim reverts; a refund before the timeout reverts; a refund after the timeout on a second lock → to the sender; an expired claim reverts.

**9.2 End to end (`test/e2e.rail.mockchain.test.ts`):** mock chain (maker, agent, guard, owner wallets) + in-memory EVM + guard HTTP. Happy path 1–6, the agent's vault + 1 UTXO, the maker took the USDC. Refund path: a second swap, the agent does not claim → the maker's pre-signed refund is valid at the script level (`lockTime`, `sequence` correct; the mock chain does not enforce nLockTime, mainnet validation 4). Guard refusals: the output is not the vault → `rail funds must land in the vault`; another agent's swap → `agent mismatch`. The agent checks the refund before signing it: a wrong outpoint/short lockTime → refuses.

---

## 10. Implementation order (inside the time box)

1. (30 min) Contract + compilation + EVM tests.
2. (60 min) `htlc.ts` helpers, `rail.ts` (maker/agent), guard `rail`.
3. (60 min) The end-to-end mock chain + EVM test.
4. (30 min) maker HTTP (`/quote`, `/events`), the deploy script, `validation4.ts`.
5. (30 min) `docs/RAIL-POC.md`, MASTER, STATUS, checkpoint, push.

---

## 11. Checkpoint (2026-10-30 19:55; ~1 hour of the time box used)

| Question | Answer |
|---|---|
| **Is the plan still good?** | Yes, but two assumptions of FINAL-IDEA §4.10 are **still unverified**: the height semantics of nLockTime (validation 4) and a v1 tx's protection from malleability (validation 6). Nothing fell apart offline: the v1 funding gives a fixed txid before broadcast with `noSend`, the pre-signed refund verifies in the ELSE branch, the claim reveals the secret and the maker claims on Base with it. If tests 4/6 fail, §4.10 and §8 are updated (the Rail "not trustless" or "out of scope"). `solc` + `@ethereumjs/evm` were used instead of Foundry (STATUS Plan changes) |
| **Is it done?** | The offline part of the acceptance ✓: `docs/RAIL-POC.md` exists, **Result: partly successful (offline)**; the time box not exceeded. Tests: `apps/maker/test/*` (EVM + HTTP), `test/e2e.rail.mockchain.test.ts` (end-to-end swap, refund path, refusals); root `npm test` 34 files / 197 tests green, typecheck clean. **Open:** validation 4 (script ready) and 6 (plan written) need mainnet sats; the Base Sepolia deploy (script ready, the dry run connected to Sepolia) needs ETH; a live swap needs both |
| **Other tracks?** (19:50) | **S3 not done.** A: P2 ✓, P3 (the vault pledge path) not started (`buildPledge('vault')` still `NOT_IMPLEMENTED`; `pledgeFromVault` ready). B: P6a ✓ (audit + metrics), the rest after S3. C: P2 ✓ on the mock chain (agents forecast, pledge, sign), P3 (the vault agent) next. E: P0 started; the maker's `GET /quote`/`/events` ready for the harbour scene. README sections: to be requested from each track as S3 nears (phase 4) |
| **Dependencies of the next phase** | The extension phases (5, 6, 7) **do not start without S3**. Phase 5's A/B choice depends on the Rail's live steps: if funds arrive, the rest of the time box (≈ 3 h) goes to validations 4/6 + a Sepolia swap; otherwise phase 5's B path. While waiting for S3: D's S3 items (the mainnet run of a vault settlement with A.P3 + C.P3) and the independent parts of phase 4 (README skeleton, threat model, value note draft) |
| **Interface change?** | MASTER §3.2 (rail keys), §3.7 (`kind:'rail'`), §3.9 (Rail variables), §3.10 (maker endpoints ✅). STATUS "Interface changes" 19:55 |

## 12. Addendum: the live swap script (30.10 ~21:50; task a.5, user decision)

One command for mainnet/Base Sepolia, run when the funds arrive:
- `apps/maker/src/swap.ts` `runSwap(parties, { amount, satsPerUsdc, onStep })`: the 6 steps of the e2e in order, each reported through `onStep`; the PoC caps (≤ 1 USDC, ≤ 1,000 sat) before any money moves. The same code runs with `MemoryEvm` + the mock chain and with `ViemEvm` + the server wallets.
- `apps/maker/src/swap-demo.ts` (`npm run swap-demo -w @agentcoop/maker -- --vault <vaultId> [--amount 0.5] [--yes]`): a **dry run** by default: the `.env` variables, the ETH/USDC balances of both EVM addresses, the BSV balances of `maker` and the agent, guard `/healthz`, that the vault at the guard belongs to this agent and this guard, the Arcade height, the quote. Without `--yes` nothing is sent. With `--yes` it prints the steps with links, writes **the pre-signed refund before the funding is sent** to `data/rail/<swapId>.json` (600), and prints the STATUS "Mainnet transactions" rows at the end. Keys only from `.env`, never printed.
- Test: `apps/maker/test/swap.mockchain.test.ts` 3/3 (step order, 0.4 USDC → 788 sat in the vault, the maker took the USDC; the refund at `refund_ready` spends the HTLC back to the maker; nothing moves when a cap is exceeded). No `.env` in this container: the dry run listed what is missing and stopped.
