# D-P0 — Ops: wallets, keys, funding, Axel (detailed plan)

> Track D · phase 0 · target sync **S0** (and funding for S1) · written: 2026-10-30 16:10
> Parent plan: `plan/track-D-vault-ops-rail.md` phase 0 · Interfaces: `00-MASTER-PLAN.md §3.9, §6`

---

## 1. Goal and the definition of "done"

So the other three tracks can work on mainnet: the sats request sent, the questions sent to Axel, the keys of the 7 server wallets generated and **only** in the git-ignored `.env`, every wallet opening with `openWallet(name)`, the public identity keys in `config/identities.json`, funded in priority order when the sats arrive, and `balances.ts` showing them all.

**Acceptance evidence** (written into STATUS Track D):
- `git check-ignore -v .env data/ data/wallets/agent-1.sqlite` returns three lines.
- `cd scripts && npm test` green (the mock-chain funding test included).
- `config/identities.json` contains the 7 server wallets + at least `desktop-treasury`.
- Mainnet: the txid of the first trial payment of ≤ 1,000 sat, then the txids of the S1 funding (STATUS → "Mainnet transactions", type `FUND`).
- `agent-1`, `agent-2`, `provider-api` > 0 in the output of `npx tsx scripts/balances.ts`.
- The messages to Axel sent (time), the answers in STATUS.

---

## 2. Human steps (the AI cannot do these; in order)

| # | Step | Who | Where | Note |
|---|---|---|---|---|
| H1 | Install **BSV Desktop** (mainnet) on the treasury laptop; write the seed on paper | the treasury owner | <https://desktop.bsvb.tech> | **Suggestion:** install the treasury Desktop on the laptop that holds the server wallets (`.env`; the machine this repo runs on). Then `fund.ts` pays and receives in one step; otherwise the payment file is moved to the other machine (§5.4) |
| H2 | Desktop → Payments → Receive → BSV Address; copy the address | the treasury owner | Desktop | The address is public, safe to share |
| H3 | **Telegram message 1 (sats)** → `@lexamaison` | anyone | Telegram | Text below. Write the time sent into STATUS |
| H4 | **Telegram message 2 (questions)** → `@lexamaison` | the same person | Telegram | Text below. The answers into STATUS |
| H5 | A shared password vault (Bitwarden) | someone | bitwarden.com | When `.env` exists in §5.1, copy the 7 keys into the vault |
| H6 | Approve the Desktop approval windows during funding | the treasury owner | Desktop | Each payment = 1 approval; the first connection asks permission for `agentcoop.local` |
| H7 | (owner/human Desktops) install and provide the identity key | the members concerned | their own laptops | `npx tsx scripts/identities.ts --desktop desktop-owner` runs on that laptop |

**Message 1 — sats (now):**
```
Hi Axel! Team <TEAM NAME> (BSV track, project "AgentCoop": non-custodial group buying for AI agents).
Treasury address for mainnet sats: <BSV ADDRESS>
We'd need roughly 300k sats for the main demo, and ideally ~250k more for a 50-agent single-settlement scale test. Thank you!
```

**Message 2 — questions** (MASTER §6.4; question 6 added):
```
A few quick design questions so we build to your criteria:
1. Agent budgets sit in a 2-of-2 (agent + policy "guard") output with a unilateral owner-withdraw path. Does that count as non-custodial for judging?
2. Agents run wallet-toolbox server wallets; humans use BSV Desktop. Is that enough for the "BSV wallets" requirement?
3. We index our own overlay topic (tm_agentcoop). Is that encouraged? Is there public overlay hosting we could use?
4. Participants sign a coordinator-built multi-party tx via createSignature({ hashToDirectlySign }). Any plan for BSV Desktop to show structured sign requests? (For our threat model note.)
5. A short-lived, capped prepaid balance at the provider when credits are redeemed for API calls (max one session, returnable): acceptable under non-custodial judging?
6. Cross-chain: an HTLC atomic swap USDC (Base) <-> BSV, with the BSV refund as a pre-signed nLockTime tx (no CLTV). Does that count as a "cross-chain flow", and is a $1-2 swap on Base mainnet OK for the demo?
```

If no answer comes, continue with the assumptions in MASTER §6.4.

---

## 3. State of the dependencies (16:05)

| Dependency | Status | Effect / stopgap |
|---|---|---|
| A.P0 root monorepo (`package.json` workspaces, `.gitignore`, root `vitest.config.ts`) | **None** | `scripts/` set up as a standalone package (its own `node_modules`). D created the root `.gitignore` early (key safety does not wait); A extends it, does not delete it. **Migration:** when A sets up the root workspace, `rm -rf scripts/node_modules scripts/package-lock.json && npm install` (at the root), otherwise there are two `@bsv/sdk` copies |
| A `test/helpers/mockchain.ts` | None | The kit's file copied exactly to `scripts/test/helpers/mockchain.ts`; switch to A's when it arrives |
| BSV Desktop on this machine | **Off** (no answer on localhost:3321) | `fund.ts`/`identities.ts --desktop` do not work without H1; the code is verified with mock-chain tests |
| Sats | **Not requested** (H3 waiting) | The mainnet steps (§6) wait; the other tracks continue on the mock chain |
| Arcade | ✅ `GET /health` 200, height 973322, `miningFee` 100 sat / 1000 B | Funding fee ≈ < 50 sat per payment |

---

## 4. Design decisions (verified)

1. **`scripts/` is a CommonJS package** (no `"type"` in `package.json`). Experiment: in ESM mode under tsx, `import { PrivateKey } from '@bsv/sdk'` loads the ESM build while wallet-toolbox loads the CJS build (`PrivateKey === require('@bsv/sdk').PrivateKey` → **false**). Redirecting to the CJS build with tsconfig `paths` works in tsx but the named import from ESM fails (`does not provide an export named 'PrivateKey'`). In CJS mode both are the same copy (**true**). Consequence: no top-level await, every script in the `main().catch(...)` pattern. This finding is written as a note in MASTER §3.1 and announced in STATUS (it applies to A/B/C's apps too).
2. **Tests** with `vitest.config.mts`; the kit's alias (`@bsv/sdk` → `dist/cjs/mod.js`) unchanged.
3. **Loading `.env`:** no dependency, Node's `process.loadEnvFile(<repo>/.env)` (silently skipped if the file is missing).
4. **Wallet files:** `<repo>/data/wallets/<name>.sqlite` (git-ignored). The path is computed from `__dirname`, the same place whichever directory it runs from.
5. **Arcade primary** (guide §14.2): `Services.createDefaultOptions(chain)` + `options.arcadeUrl = ARCADE_URL`, our own `StorageKnex` + `WalletStorageManager` + `Monitor` (tasks added, **not started**; long-lived services start it with `startMonitor: true`).
6. **Desktop's `default` basket cannot be read:** wallet-toolbox `WalletPermissionsManager.isAdminBasket('default') === true`. `balances.ts` shows only the app baskets (`agentcoop`, `agentcoop vault`, `bsv21`) for Desktop; the treasury's main balance is read in the Desktop UI.
7. **Originator:** `APP_ORIGINATOR=agentcoop.local` passes the SDK's `validateOriginator` rule (a canonical hostname). Whether Desktop accepts it at run time is seen in H6; if there is a problem, a real domain (SETUP-ACCOUNTS #16).
8. **The payment to disk first, then received:** `fund.ts` writes the JSON of each broadcast payment (`data/payments/<name>-<txid>.json`) **before internalizing**. If receiving fails, the money is not lost; `receive.ts` retries with the same file. If it succeeds, the file moves to `data/payments/accepted/`.

---

## 5. Files

| File | What it does | Commit? |
|---|---|---|
| `.gitignore` | `.env`, `.env.*` (except `.env.example`), `data/`, `*.sqlite*`, `*.db*`, `node_modules/`, `dist/`, `contracts/**/{out,cache,broadcast}` | ✅ |
| `.git/info/exclude` | A local backup of the same rules (protection stays on this machine even if A overwrites `.gitignore`) | local |
| `.env.example` | MASTER §3.9 exactly + comment lines | ✅ |
| `scripts/package.json`, `tsconfig.json`, `vitest.config.mts` | a CJS package, `@bsv/sdk` 3.2.1, `@bsv/wallet-toolbox` 2.14.9 pinned | ✅ |
| `scripts/lib/env.ts` | loads `.env`; the `WALLETS` (name → env variable) table; `NETWORK` → `chain`; `ARCADE_URL`, `APP_ORIGINATOR`; `requireKey(name)` (never prints the key; says which variable is missing) | ✅ |
| `scripts/lib/funding.ts` | the wallet-independent core: `payTarget(source, targetIdentity, sats, …)` → kit `createBrc29Payment`; `acceptPayment(targetWallet, payment, tracker)` → kit `acceptBrc29Payment`; payment file read/write; `poolBalance` (guide §11) | ✅ |
| `scripts/lib/kit/payments.ts`, `arcadeChainTracker.ts` | an **exact copy** from the kit (MASTER §4.2). Imported from there once A sets up `packages/core/src/kit/` | ✅ |
| `scripts/wallets.ts` | `openWallet(name, opts?)` → `{ wallet, identityKey, close }`; `WALLET_NAMES`. The other tracks import it (`scripts/wallets.ts`; `@agentcoop/scripts/wallets` once the workspace exists) | ✅ |
| `scripts/keygen.ts` | 7 × `PrivateKey.fromRandom().toHex()` → **stdout only**, `WALLET_..._KEY=<hex>` lines. `--only-missing`: skips the ones already in `.env` (does not read or print their values). Does not write a file | ✅ |
| `scripts/identities.ts` | opens every server wallet that has a key, writes its identity key into `config/identities.json`. `--desktop <name>`: connects to Desktop, adds its identity key | ✅ |
| `config/identities.json` | `{ "<name>": "<33-byte pubkey hex>" }` (public) | ✅ |
| `scripts/fund.ts` | `fund.ts agent-1=50000 agent-2=50000 …` → BRC-29 from Desktop to each target; if the target's key is in the local `.env`, receives it at once, otherwise leaves the payment file. `--dry-run`, `--max-total` (default 400,000), the first-mainnet-trial lock (§7) | ✅ |
| `scripts/receive.ts` | receives the pending payments in `data/payments/*.json` (or a given file) with SPV + a script check | ✅ |
| `scripts/balances.ts` | each server wallet: spendable sats, UTXO count, WhatsOnChain links of the latest txs. `--desktop`: Desktop's app baskets | ✅ |
| `scripts/test/helpers/mockchain.ts` | kit copy | ✅ |
| `scripts/test/funding.mockchain.test.ts` | the scenarios in §8 | ✅ |
| `scripts/test/keygen.test.ts` | key format, uniqueness, `--only-missing` | ✅ |
| `docs/OPS.md` | inventory, who holds which Desktop, funding order, the "out of money" procedure, the vault note, troubleshooting | ✅ |
| `data/wallets/*.sqlite`, `data/payments/*.json`, `data/ops/*` | runtime | ❌ (gitignore) |

### 5.1 The path of the keys (never into chat, a log or a commit)

```
keygen.ts ──stdout──▶ (shell redirect) ──▶ .env   (gitignore + .git/info/exclude)
                                            │
                              human: copies from .env into Bitwarden
```
- The AI runs keygen **only** as `npx tsx scripts/keygen.ts --only-missing >> ../.env`; the output never reaches the screen or the chat. `git check-ignore .env` is checked first.
- No script `console.log`s a key; error messages contain only the variable **name**.

---

## 6. Script level (opcodes)

No custom script in phase 0; only BRC-29 P2PKH:

| What | Script | Note |
|---|---|---|
| A BRC-29 payment output (treasury → server wallet) | `OP_DUP OP_HASH160 <pkh(derivedPub)> OP_EQUALVERIFY OP_CHECKSIG` (25 bytes) | `derivedPub` = `getPublicKey({ protocolID: [2,'3241645161d8'], keyID: '<prefix> <suffix>', counterparty: <target identity>, forSelf: false })` (on the sender's side). **Never the identity key itself** (guide §5.1) |
| Spending | `<sig‖SIGHASH_ALL|FORKID> <pub33>` (≤ 108 bytes) | The target wallet spends it with its own `createAction` after receiving it with `'wallet payment'`; spendable at 0-conf |
| Fee | ~ 225 bytes × 100 sat/kB ≈ 23 sat / payment | Arcade `/health` `miningFee` |

**Receiving checks** (kit `acceptBrc29Payment`): SPV (`tx.verify(ArcadeChainTracker)`), the output script exactly `P2PKH(derive(forSelf:true, counterparty: sender))`, the amount equals the declaration; then the wallet's `internalizeAction` repeats the same checks.

---

## 7. Ops controls and the risks they close

The guard policy is in phase 1; phase 0's counterpart is operational controls:

| Control | Where | Risk it closes |
|---|---|---|
| The key only to stdout; `.gitignore` + `.git/info/exclude`; `git check-ignore` every phase | keygen, root | A key leaking into the repo/chat |
| Only the variable name in `requireKey`'s error message | `lib/env.ts` | A key landing in a log |
| **The first-mainnet lock:** without `data/ops/mainnet-probe.json`, `fund.ts` refuses a single payment over 1,000 sat (overridable with `--force`). The file is written once the first ≤ 1,000 sat payment is received | `fund.ts` | A big loss on an untried path (MASTER §6.3) |
| `--max-total` (default 400,000 sat) | `fund.ts` | Over-funding through a typo (`5000000`) |
| A plan dump + `--dry-run` first | `fund.ts` | A wrong target |
| The payment JSON to disk **before** internalizing | `fund.ts` / `receive.ts` | The money "getting lost" on a receiving error |
| SPV + script + amount check | kit `acceptBrc29Payment` | A fake or short payment, a wrong recipient |
| Network check: stop if `getNetwork()` does not match `NETWORK` | `fund.ts` | Mixing testnet/mainnet |

---

## 8. Test scenarios (mock chain first)

`scripts/test/funding.mockchain.test.ts` (wallet-toolbox `MockServices`, the kit harness):
1. **Funding:** treasury (1M from the mock coinbase) → `agent-1` 50k, `agent-2` 30k (`payTarget` + `acceptPayment`). Expected: `poolBalance` exactly 50,000 / 30,000.
2. **0-conf spending:** without mining a block, `agent-1` pays `agent-2` 10k and `agent-2` receives it. Funded wallets are usable immediately (S1 needs this).
3. **Wrong recipient:** `agent-2` tries to receive a payment made to `agent-1` → error (`not locked to our key`).
4. **Amount lie:** the declared `satoshis` +1 → error.
5. **File round trip:** a payment written to JSON and read back can be received as is (the `receive.ts` path).
6. **Receiving twice:** receiving the same payment a second time does not grow the balance (idempotent or an error; the behaviour is recorded).

`scripts/test/keygen.test.ts`:
7. 7 names, each 64 hex, all different, the name list exactly as MASTER §3.9.
8. `--only-missing` skips the names already in `.env`.

Real environment:
9. `identities.ts` opens the 7 wallets and writes `config/identities.json` (no network needed; a smoke test of the `openWallet` composition).
10. The first mainnet trial: `fund.ts agent-1=1000` → txid, received, `balances.ts` 1,000.

---

## 9. Mainnet funding order (when the sats arrive)

| Step | Command (on the treasury laptop) | Why in this order |
|---|---|---|
| F1 | `npx tsx scripts/fund.ts agent-1=1000` | Both D's first ≤ 1,000 sat trial and the wallet-toolbox wallet that will add the fee input for **A's validation test 2** (A.P0 0.4). A is told through STATUS |
| F2 | `… agent-1=49000 agent-2=50000 provider-api=20000` | The S1 walking skeleton (A.P1) |
| F3 | `… agent-3=50000 coordinator=5000 guard=5000 maker=30000` | S2/S3 and the Rail PoC |
| F4 | `… desktop-owner=60000 desktop-human=30000` | Desktop → Desktop: the target's identity key must have been added with `identities.ts --desktop`; receiving happens on that laptop with `receive.ts --desktop` |
| F5 | (if extra sats arrive) set aside for the phase 6 scale test, not distributed now | |

`getNetwork()` → `mainnet` is checked per Desktop. Each step's txids into STATUS → "Mainnet transactions" (type `FUND`).

---

## 10. Implementation order (AI)

1. ✅ Gitignore + `.git/info/exclude`, the `scripts/` package, the CJS decision (by experiment).
2. `.env.example`, `lib/env.ts`, the kit copies, `lib/funding.ts`, `wallets.ts`.
3. Tests (mock chain) → green.
4. `keygen.ts`, `identities.ts`, `fund.ts`, `receive.ts`, `balances.ts`; `tsc --noEmit` clean.
5. `keygen --only-missing >> .env` (without the output showing) → `identities.ts` → `config/identities.json`.
6. `docs/OPS.md`.
7. The MASTER §3.1 note + STATUS (D section, interface note, blockers).
8. Until the sats arrive: Checkpoint → continue with phase 1 on the mock chain; F1–F4 when the sats arrive.

---

## 11. Checkpoint (2026-10-30 16:21)

| Question | Answer |
|---|---|
| **Is the plan still good?** | Yes, with two corrections: (1) `scripts/` is **CommonJS** (two SDK copies in ESM; a note in MASTER §3.1, announced to A/B/C in STATUS). (2) Desktop's `default` basket is closed to apps, the treasury balance is read in the Desktop UI. Connecting to Desktop from Node with `WalletClient('auto','agentcoop.local')` **works** (`waitForAuthentication`, `getNetwork` → mainnet, `getPublicKey`); C can use the same path. `createAction` 400 → the expected behaviour with no sats in the wallet; to be confirmed with F1 when the sats arrive |
| **Is it done?** | Code, tests (9/9), keys, wallets, identities, OPS.md ✓. **Open:** H1–H5 (human), F1–F4 (sats). The mainnet rows of the acceptance evidence depend on them |
| **Other tracks?** | As of 16:20, A, B, C "P0 not started". A waits for 1,000 sat on `agent-1` for test 2 → F1. B/C have not asked for wallets yet; `openWallet` is ready |
| **Does the next phase depend on something?** | Phase 1 depends on A.P0 (`InputSigner`, `opreturn.ts`, the `packages/core` skeleton) and **A.P0 is not there**. Plan: 1.1–1.3 and 1.4's policy engine are written against the `InputSigner` interface in MASTER §3.3; only the files set aside for D (`src/scripts/vault.ts`, `src/signers/VaultSigner.ts`) are added to `packages/core`, the skeleton is not touched. Mainnet test 5 depends on the sats |
| **Interface change?** | The MASTER §3.1 note (the rule text unchanged), question 6 in §6.4; 4 rows in STATUS "Interface changes" |
