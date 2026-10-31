# @agentcoop/maker: Coop Rail maker

The counterparty of Coop Rail, the proof-of-concept swap from USDC on Base into BSV that lands in an agent's Mandate Vault. It quotes, checks the agent's Base lock, funds the BSV HTLC, keeps the agent-signed refund, claims the USDC with the secret the agent reveals on BSV, and runs a watchdog that broadcasts refunds on time. It also holds the tooling for the Base HTLC contract.

**Status:** offline proof of concept. Everything below is tested on the mock chain and an in-memory EVM; the contract is not deployed and no live swap has run. The protocol, its evidence and its open points are in [docs/RAIL-POC.md](../../docs/RAIL-POC.md), the design decision in [ADR 0003](../../docs/decisions/0003-coop-rail-presigned-refund.md).

## Responsibilities

- Quote a swap (`RAIL_SATS_PER_USDC` plus a 150 bps spread) and refuse amounts above the PoC caps (≤ 1 USDC, ≤ 1,000 sat).
- Verify the agent's lock on Base (`verifyBaseLock`: the configured USDC, the right hash, enough time left).
- Build the version 1 funding without sending it, get the agent's signature on the height-locked refund, then broadcast the funding.
- After the agent and its guard claim on BSV, read the 32-byte secret from the claim and claim the USDC on Base.
- Watchdog: broadcast a saved refund one block after its nLockTime, or claim on Base if the agent has claimed, even if the process that ran the swap stopped.

It does **not** run an order book or a swap API, does not hold users' funds beyond its own inventory, and has no reverse direction (BSV → USDC).

## Run

```bash
npm run maker -w @agentcoop/maker            # HTTP on MAKER_URL's port (default 8094), with the watchdog
npm run watchdog -w @agentcoop/maker         # the watchdog alone
npm run compile -w @agentcoop/maker          # recompile contracts/base-htlc into artifacts.json
npm run deploy -w @agentcoop/maker           # Base Sepolia deploy, dry run; add -- --yes to send
npm run swap-demo -w @agentcoop/maker -- --vault <vaultId>                     # live swap, dry run
npm run swap-demo -w @agentcoop/maker -- --vault <vaultId> --amount 0.5 --yes  # live swap
```

The live commands move real funds on Base Sepolia and BSV mainnet. Run the dry run first; it checks keys, balances, the guard and the vault and moves nothing.

## HTTP

| Method | Path | Returns |
|---|---|---|
| `GET` | `/healthz` | `{ ok, maker: { evm, bsv }, network }` |
| `GET` | `/quote?dir=usdc-bsv&amount=` | a quote for the swap |
| `GET` | `/events` | Server-Sent Events of `CoopEvent` envelopes with `src: 'maker'` |

CORS origin: `MAKER_CORS_ORIGIN`. The web app's harbor (Coop Rail, experimental) reads `/quote` and `/events`.

## Configuration

| Variable | Meaning |
|---|---|
| `MAKER_URL` | its own URL; the port is taken from it (default `http://localhost:8094`) |
| `WALLET_MAKER_KEY` | the maker's BSV server wallet (secret) |
| `BASE_RPC_URL` | Base RPC; empty = `https://sepolia.base.org` |
| `BASE_PRIVATE_KEY` | the maker's and deployer's EVM key (secret) |
| `BASE_AGENT_PRIVATE_KEY` | the agent's EVM key, for tests and `swap-demo` (secret) |
| `BASE_USDC_ADDRESS` | the USDC contract |
| `BASE_HTLC_ADDRESS` | written by `deploy` |
| `RAIL_SATS_PER_USDC` | fixed PoC rate, sats per whole USDC |
| `GUARD_URL` | the guard that co-signs the agent's claim (`swap-demo`) |

The default port 8094 is also the example port of a second coordinator (`COOP2_PORT` in `infra/`); change one if you run both.

## State

`data/rail/<swapId>.json`: each swap's record, including the pre-signed refund, written before the funding is sent. The watchdog reads these files. Back them up while a swap is open: without the refund the maker cannot recover the funding before the claim branch is used.

## Security

The claim needs agent + guard, and the guard signs only if the satoshis land in the agent's registered vault (T-14, I-14). The open risks of a production rail are the clocks (BSV height versus Base seconds) and a claim branch that never expires (F-4, T-23); the Base contract's token assumptions are F-1 and F-2. All in [docs/AUDIT-READINESS.md](../../docs/AUDIT-READINESS.md#6-what-we-already-know).

## Tests

```bash
npx vitest run apps/maker/test               # Base HTLC on an in-process EVM, server, swap with watchdog
npx vitest run test/e2e.rail.mockchain.test.ts test/rail.htlc-preimage.test.ts
```

| File | Covers |
|---|---|
| `apps/maker/test/htlc.evm.test.ts` | lock, claim, refund, and that the committed artifact matches a fresh compile |
| `apps/maker/test/htlc.boundaries.evm.test.ts` | timeout boundaries, isolation between locks, who gets paid |
| `apps/maker/test/htlc.tokens.evm.test.ts` | fee-on-transfer and non-standard tokens (F-1, F-2) |
| `apps/maker/test/swap.mockchain.test.ts` | the swap steps, PoC caps, the watchdog (F-4) |
| `apps/maker/test/server.test.ts` | `/quote`, `/events`, `/healthz` |
| `test/e2e.rail.mockchain.test.ts` | the whole swap with the real guard and vault |
