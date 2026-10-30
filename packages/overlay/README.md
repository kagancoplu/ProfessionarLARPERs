# @agentcoop/overlay

AgentCoop's overlay: topic **`tm_agentcoop`**, lookup service **`ls_agentcoop`**. It is the BSV-21 overlay from the starter kit (`docs/starter/bsv21-token-kit/overlay/`), copied and renamed. The token rules (`src/kit/rules.ts`) are the kit's, unchanged: a credit output is admitted only if it descends, input by input, from its deploy.

Status: **Track B, Faz 0**. Faz 1 adds AgentCoop records (pools, pledges, settlements, offers, listings, vaults) to the same topic. See `plan/track-B-overlay-coordinator.md`.

## Run

Node 22 or newer (`nvm use 22`).

```bash
cd packages/overlay
npm install
npm run overlay          # http://localhost:8080
npm test                 # mock chain: validation test 1 (mixed settlement) and the size model
npm run arcade-policy    # validation test 8: Arcade policy + settlement size/fee table
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port (`OVERLAY_URL` in the root `.env`) |
| `OVERLAY_DB` | `./data/overlay.db` | SQLite file |
| `NETWORK` | `main` | `main` or `test` |
| `CHAINTRACKS_URL` / `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | SPV block headers (Arcade go-chaintracks) |
| `CHAIN_TRACKER=woc` | – | WhatsOnChain headers instead (`WOC_API_KEY` optional) |
| `TOKEN_WHITELIST` | empty = all | Comma-separated credit token ids to index |
| `OVERLAY_PRIVATE_KEY` | generated into `./data/overlay.key` | Overlay node identity. Never commit it |

`data/`, `.env` and `*.sqlite` are git-ignored.

## Endpoints

Standard overlay endpoints from `@bsv/overlay-express`:

```bash
# submit a transaction (BEEF) to the topic
curl -s -X POST http://localhost:8080/submit -H 'Content-Type: application/octet-stream' \
  -H 'X-Topics: ["tm_agentcoop"]' --data-binary @tx.beef

# lookup
curl -s -X POST http://localhost:8080/lookup -H 'Content-Type: application/json' \
  -d '{"service":"ls_agentcoop","query":{"op":"identity","identityKey":"03…"}}'
```

Queries in Faz 0 (the kit's, MASTER §3.8): `identity`, `utxos`, `token`, `tokens`, `outpoint`, `history`. Each returned output has a BEEF and a UTF-8 JSON `context` (`tokenId`, `amt`, `ownerPkh`, `spent`, `spendingTxid`, `index`, `sym`, `dec`). Faz 1 adds `pools`, `pool`, `pledges`, `settlement`, `listings`, `vaults`.

## Validation results

**Test 1, mixed settlement (mock chain, `test/validation1.mixed-settlement.test.ts`): passes with the kit rules unchanged.**
A settlement with the provider's credit UTXO as input 0 (signed `SINGLE|ANYONECANPAY|FORKID`) and three pledge coins (signed `ALL|FORKID`), paying the provider at output 0 and delivering 600/300/100 credits at outputs 1–3, with change and an `OP_RETURN agentcoop settle`, gets STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`. The overlay checks SPV and every script on submit. The same file also shows:
- the provider's `SINGLE|ACP` signature stays valid when the settlement is re-planned with other participants, shares and change (a coordinator retry round needs no new provider signature);
- lowering the provider payment by 1 sat invalidates it;
- inflation inside a mixed settlement is not admitted;
- a settlement that spends a credit UTXO the overlay never admitted is refused.

**Test 8, Arcade policy (30.10):** Arcade v0.16.0; mining fee 1–100 sat/kB across datahubs; strictest max tx size 100 MB, strictest max script size 500 kB. Settlement size measured with real script shapes (`scripts/settlementSize.ts`; matches a real settlement within 0.3 %):

| Participants | Bytes | Fee at 100 sat/kB | Per participant |
|---|---|---|---|
| 3 | 1,486 | 149 sat | 50 sat |
| 20 | 7,674 | 768 sat | 39 sat |
| 50 | 18,594 | 1,860 sat | 38 sat |
| 100 | 36,794 | 3,680 sat | 37 sat |
| 80 p2pkh + 20 vault | 39,314 | 3,932 sat | 40 sat |

Policy is not a limit on settlement size.

## Temporary copies

Until Track A's `@agentcoop/core` exists, `src/kit/{inscription,rules,addresses}.ts` and `test/helpers/mockchain.ts` are verbatim copies of the kit's files. `test/helpers/settlement.ts` is a test-only settlement builder, not Track A's. When A's root workspace lands: delete `package-lock.json` here, import from `@agentcoop/core`, and run the tests from the root config.

`npm run typecheck` covers `src/` and `scripts/`, like the kit (whose `tsconfig` also leaves out `test/`). The verbatim `mockchain.ts` reports the CJS/ESM dual-SDK type mismatch the kit's `vitest.config.ts` alias resolves at runtime.
