# Getting started

Everything on this page except the last section runs offline: no wallet, no satoshis, no services. The test suite and the demos use wallet-toolbox's **mock chain** with the real components, so every transaction is built, signed, SPV-checked and admitted by the overlay; only the chain is simulated.

## Prerequisites

- **Node.js 22 or newer** (24 recommended; CI uses 24). The `tsx` service scripts need Node 24 on some 22.x versions (`ERR_INVALID_RETURN_PROPERTY_VALUE` from the SDK import hook); the tests run on either.
- **npm 11.** npm 10.9 cannot install this workspace; use `npx npm@11` if your npm is older.
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker for the mirror's row-level-security tests; Python 3 with Slither for the contract analysis CI runs.

## Install and test

```bash
git clone https://github.com/kagancoplu/ProfessionarLARPERs.git && cd ProfessionarLARPERs
npx npm@11 install
npm run typecheck          # root projects; the web app has its own: npm -w apps/web run typecheck
npm test                   # every package on the mock chain (several minutes)
npm run check:docs         # every path, link and test name cited in the docs exists
```

More checks, all offline:

| Command | What |
|---|---|
| `npm run web:test` | web unit and component tests (the pure ones also run in `npm test`) |
| `npm -w apps/web run test:e2e` | Playwright, mock mode (first time: `npx playwright install chromium`) |
| `npm run test:scale` | settlements with 50 and 100 participants (about six minutes; skipped by `npm test`) |
| `npm run mutate` | mutation testing of the verifier, the script templates and the Base HTLC; restores every file |
| `npx vitest run apps/maker/test` | the Base HTLC on an in-process EVM |

Tests live in `test/` (cross-component end-to-end flows) and in each package's `test/` folder. Files named `*.mockchain.test.ts` run real components on the mock chain; `*.local.test.ts` need a local Supabase stack and are skipped without it ([apps/relay/README.md](../apps/relay/README.md#tests)).

## Run the demos

```bash
npm run demo               # provider opens a pool → 3 agents forecast, decide and pledge → one settlement → credits spent → surplus traded
npm run demo:failed-pool   # an unfilled pool costs only the registration fee; the agent withdraws and joins a right-sized pool
npm run demo:injection     # a prompt-injected vault agent: its own policy vetoes the pledge; with that bypassed, the guard refuses
npm run demo-injection -w @agentcoop/scripts   # the guard's side of the same attack
```

Logs go to `data/demo-*/agents/<name>/{decisions,activity}.log`. `npm run demo` is the same as `npm run demo:k1`.

## Open the web app

```bash
npm run web:mock           # http://localhost:5173: a scripted village and a mock BSV Desktop, no services
```

Add `?replay=mock-demo` to play a recorded run, `?presenter=1` for larger type. The routes and modes are in [apps/web/README.md](../apps/web/README.md).

## Where to go next

- How it works: [concepts](concepts/pools-and-settlement.md) and [architecture](architecture.md).
- A component: its README, linked from [the documentation index](README.md).

## Run the live stack locally

This part uses real services against **BSV mainnet**: server wallets need keys and satoshis, and human flows need BSV Desktop. Set up keys and funding first ([OPS.md](OPS.md)), then:

```bash
# once: create .env and the server wallet keys as OPS.md §2 describes
npm run infra              # overlay :8080 + coordinator :8090 (WS /ws), persistent data/, restarts on crash
npm run guard -w @agentcoop/guard          # :8091, for vaults and Lighthouse pledges
npm run provider           # provider API :8092
npm run agents             # three agents; their event feed on :8093
npm run maker -w @agentcoop/maker          # optional: Coop Rail quotes :8094
npm run web                # the web app; Vite proxies /api/* to the services above
```

- `FULL_STACK=1 npm run infra` also starts the guard, the provider API and the agents in the same runner.
- With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set, `npm run infra` also starts the relay, and the web reads the mirror when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
- `node infra/preflight.mjs` checks the machine (runtime, `.env` names, identities, Arcade, WhatsOnChain, services, BSV Desktop) without spending or printing anything.
- Every variable: [reference/configuration.md](reference/configuration.md).
