# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot…) working in this repository.

## The repository

AgentCoop is a non-custodial group-buying protocol for AI agents on BSV: an npm-workspaces monorepo in TypeScript (ESM), Node ≥ 22.

- `packages/core`: the protocol library (builders, signers, verifiers, scripts). Most security-critical code is here.
- `packages/overlay`: the overlay topic and lookup service.
- `apps/*`: coordinator, guard, provider-api, agents, maker, relay, the web app (`apps/web`, Vite + React + Phaser), and three BSV Desktop CLIs.
- `test/`: cross-component flows on the mock chain; each package also has its own `test/`.
- `docs/`: start at [docs/README.md](docs/README.md). Architecture: [docs/architecture.md](docs/architecture.md). Formats: [docs/reference/protocol.md](docs/reference/protocol.md).

`docs/archive/` is the frozen record of the hackathon that produced the project (plans, logs, the original design document), translated into English from the Turkish originals. Do not treat it as current guidance and do not edit it. Code comments that cite `FINAL-IDEA §…` or `plan/phases/…` point into that archive.

## Commands

```bash
npx npm@11 install                   # npm 10.9 cannot install this workspace
npm run typecheck                    # root; the web app: npm -w apps/web run typecheck
npm test                             # everything on the mock chain (several minutes)
npx vitest run <file or folder>      # one test file or package
npm run check:docs                   # cited paths, links and test names in the docs exist
```

Node scripts and services run under `tsx --import @agentcoop/core/register-sdk` (the npm scripts already do), so only one copy of `@bsv/sdk` is loaded.

## Working rules

- **No real transactions.** Do not run commands that broadcast, fund or spend on mainnet or Base (`fund`, `swap-demo --yes`, `validation*`, `deploy --yes`, the live services with real keys) unless the person you work for asks for that specific run.
- **No secrets.** Never print, log, commit or paste keys, seeds or `.env` values. `.env` and `data/` are git-ignored and stay that way.
- **Verify, never trust.** Anything that signs or pays checks the transaction itself; it does not trust the overlay, the coordinator or the Supabase mirror (T-1, T-2, T-22 in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)).
- **Tests with code.** A behaviour change in `packages/core/src/{scripts,signers,pool,verify,vault}` or `apps/guard/src` needs a test, and `npm run mutate` must still kill every mutant. A security fix starts as a failing test.
- **Match the code around you** in naming, comment density and idiom.
- **Docs follow code.** When an interface, a format, a variable or a threat changes, update its one home (table in [docs/README.md](docs/README.md#keeping-the-docs-current)) and run `npm run check:docs`. Cite repository paths from the root.
- Do not commit, push or rewrite history unless asked.

## BSV rules

These rules come from the BSV Association's developer pack for the hackathon (unchanged copy: [docs/vendor/bsv-hackathon-pack/AGENTS.md](docs/vendor/bsv-hackathon-pack/AGENTS.md)). They apply to this codebase as written; paths are adjusted to this repository.

### Sources of truth

1. [docs/vendor/bsv-hackathon-pack/BSV_STACK_COMPLETE_GUIDE.md](docs/vendor/bsv-hackathon-pack/BSV_STACK_COMPLETE_GUIDE.md) is the BSV stack reference. Read the relevant section before writing BSV code; prefer its tested code over code from memory, because older examples use outdated APIs.
2. The starter kit in `docs/starter/bsv21-token-kit/` is a working reference; this repository's overlay and token rules were copied from it, and several tests import its overlay server.
3. For anything the guide does not cover, use the official sources (ts-stack, BRC specifications). Do not guess API names; check the installed package's type definitions. `bsv-blockchain/ts-sdk` and `bsv-blockchain/wallet-toolbox` are superseded by the monorepo `bsv-blockchain/ts-stack`.

### Versions

Pinned exactly in the root `package.json`:

| Package | Version |
|---|---|
| `@bsv/sdk` | 3.2.1 |
| `@bsv/wallet-toolbox` | 2.14.9 |
| `@bsv/overlay` | 2.6.4 |
| `@bsv/overlay-express` | 2.7.4 |
| `@bsv/auth-express-middleware` | 2.2.9 |
| `@bsv/payment-express-middleware` | 2.1.9 |
| `@bsv/402-pay` | 0.3.3 |

### Wallet and keys

- In a browser, connect with `new WalletClient('auto')` (BSV Desktop / BSV Browser). In Node, pass the app domain as the second argument (the originator). `new WalletClient('auto', 'simple')` is wrong.
- The user's keys never leave the wallet. Build transactions with `createAction` / `signAction` and sign custom inputs with `wallet.createSignature`. Never ask for a private key or recovery phrase.
- Never lock funds, tokens or NFTs to `P2PKH(identityKey)`: BRC-100 wallets only sign with derived keys (BRC-42/43). Lock everything to a derived key.
- Keys that control value use protocol security level ≥ 1. Level 0 never asks the user for permission.

### Transactions and payments

- Set `randomizeOutputs: false` whenever you rely on an output index (token deploys, NFT origins, payments), and find an output by its locking script; never hard-code index `0`.
- BRC-29 derivation: `counterparty` is always the **other** party's identity key. The sender uses `forSelf: false`, the recipient `forSelf: true`. Never use `'self'` for a payment between two parties.
- Receiving a payment: verify it with SPV (`Transaction.fromAtomicBEEF(tx).verify(chainTracker)`), then `internalizeAction`. A received payment is spendable immediately.
- `internalizeAction` protocols: `'wallet payment'` for plain satoshis; `'basket insertion'` into a named basket for tokens, NFTs and app data. Never put tokens or NFTs in the `default` basket: the wallet would spend them as fees.

### BSV-21 tokens

- Canonical format: the content-type tag is `OP_1` (`0x51`); every JSON value is a string (`"amt":"250"`); ids are `<txid>_<vout>`.
- Bitcoin Script does not enforce BSV-21. Treat a token UTXO as valid only if the overlay admitted it and has not seen it spent, or if you verified its lineage yourself (`verifyLineage`).
- Spend only validated token UTXOs: a wallet basket validates nothing, and one bad input gets the whole transaction refused.
- Submit every token transaction to the overlay, parents first. For token spends, use the overlay's BEEF as `inputBEEF` (it has the full ancestry).
- Topic and service names match `^tm_[a-z]+(_[a-z]+)*$` / `^ls_…` (BRC-87): no digits.

### Paid APIs (HTTP 402)

- Use the official protocols; do not invent headers. BRC-105: `@bsv/auth-express-middleware` + `@bsv/payment-express-middleware`, client `AuthFetch` (what the provider API uses). BRC-121: `@bsv/402-pay`, client `create402Fetch`; with a wallet-toolbox wallet, wrap it with `withHostOriginator()` (guide §10.4).
- The server sets the price. Use an atomic, shared replay store when more than one process serves paid routes.

### Server wallets

- Create them with `@bsv/wallet-toolbox` `Setup.createWalletSQLite({ env, rootKeyHex, filePath, databaseName })` and an `env` object you build yourself (guide §14); `Setup.getEnv()` requires a specific `.env`. In this repository, open server wallets with `@agentcoop/core/node/serverWallet` (the guide's §14.2 pattern, Arcade as the broadcaster) instead of a new setup.
- Load the private key from an environment variable or secret manager. Never commit or log it.

### Non-custodial design

- User funds stay in the user's wallet. No single server key may control users' assets.

### Infrastructure

- Block headers, broadcasting and transaction status: Arcade (`https://arcade-v2-us-1.bsvblockchain.tech`, headers at `/chaintracks/v2`). The free WhatsOnChain API rate-limits (`429`).
- Explorers: WhatsOnChain for transactions, BananaBlocks for BSV-21 tokens.

### Testing

- Test offline with wallet-toolbox's mock chain: `test/helpers/mockchain.ts`.
- Load a single build of `@bsv/sdk` in tests (the alias in `vitest.config.ts`) to avoid two copies of the SDK classes.
