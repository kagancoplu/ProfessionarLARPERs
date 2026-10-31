# A-P1 — Offer, pledge, settlement builders + walking skeleton (detailed plan)

> Track file: `plan/track-A-protocol.md` phase 1. Interface: MASTER §3.3/§3.4 (signatures frozen; the parameter shapes are settled here). Date: 2026-10-30.

## 1. State of the dependencies (STATUS 2026-10-30)

| Dependency | Status | Decision |
|---|---|---|
| D.P0 server wallets + sats | not started | phase 1 finishes **on the mock chain**; the mainnet run (`scripts/skeleton.ts`) waits → Blockers |
| B.P1 `tm_agentcoop` overlay | not started | in tests the kit overlay (`docs/starter/bsv21-token-kit/overlay/server.ts` → `startOverlay`, topic `tm_tokenkit`) runs over HTTP. Same rules (track A 1.x note). When B is ready, `OverlayClient(..., COOP_TOPIC, COOP_SERVICE)` |
| B.P1 `POST /offers` | not started | the skeleton takes the offer straight from the builder; connected when B is ready |
| C.P1 product token | not started | the skeleton mints its own token (N=1,000, dec 0) |

## 2. Decisions (clarifying MASTER, non-breaking)

1. **Outpoint format:** always `txid_vout` in AgentCoop data (terms, plan, OP_RETURN, API); converted to `txid.vout` only for wallet calls (`toWalletOutpoint`).
2. **`pledgeListHash`** = `sha256_hex( join(',', sort_lex(the included pledge outpoints)) )`. Lexicographic order needs no chain data; anyone recomputes it. (The selection order is separate: the §3.2 rule.) → a note in MASTER §3.2.
3. **The offer UTXO's key:** the credit UTXO is moved **not to the provider's token receive address** but to a P2PKH derived with `[1,'agentcoop provider']` / keyID `offer <poolNonce>` / `'anyone'`, and kept in the `agentcoop offers` basket. Why: on the token address, `TokenKit.sync()` would pull it into the `bsv21` basket and `TokenKit.send` could cancel the pool unknowingly. BSV-21 validity is unchanged (the owner suffix is still P2PKH). → an `OFFERS_BASKET` row in MASTER §3.2.
4. **Revenue key:** `payScriptHex` = P2PKH(`[1,'agentcoop provider']`, keyID = `poolNonce`, `'anyone'`). `poolNonce` lives in the offer output's `customInstructions` (`{ protocolID, keyID, payKeyID }`) and in the pool OP_RETURN (`nonce`) → C's `sweep-revenue` finds it.
5. **Pool OP_RETURN:** `op=pool`, json = terms − `poolId` + `nonce` (poolId = `<this txid>_0`, which cannot be known inside its own tx).
6. **Fee:** `planSettlement` is a pure function; `chain.satsPerKb` from outside (Arcade `/health` policy; 100 on the mock chain). The size is measured by **serializing a filled template** with the real unlocking lengths (offer: real; p2pkh 108; vault: `InputSigner.unlockingScriptLength`). The fee is split equally among participants, the remainder (rounding) as 1 sat each to the first participants; the `ceil` excess of the payment shares goes to the fee (output 0 is exactly P).
7. **After change:** after the broadcast, a participant takes its change into the `agentcoop` basket (same customInstructions) with `internalizeSettlement(wallet, tx, myOutpoint, record)` and drops the spent pledge coin from the basket with `relinquishOutput`. Credits arrive via `TokenKit.sync()`.

## 3. Settlement layout (FINAL-IDEA §4.4, n participants)

```
in 0      offer (N credits, 1 sat)  SINGLE|ACP|FORKID  ↔ out 0      P sat → payScript
in 1..n   pledge coins              ALL|FORKID         ↔ out 1..n   BSV-21 transfer k_i → receivePkh(participant_i, tokenIndex_i), 1 sat
                                                         out n+1..2n change_i → pledge coin_i's own script (no output if 0? → NO: always present, ≥ 1 sat; the plan guarantees it or the pledge is refused)
                                                         out 2n+1     OP_RETURN settle { v, poolId, termsHash, pledgeListHash, round }
```
Participant i's debt: `pay_i = ceil(k_i·P/N)`, `+1` (the credit output's sat), `+fee_i`. `change_i = coin_i − pay_i − 1 − fee_i ≥ 1`, otherwise the pledge is too small → waiting list. Input 0's 1 sat contributes to the fee.

## 4. Files and signatures

```ts
// src/util/outpoint.ts
toWalletOutpoint('txid_0') → 'txid.0' · fromWalletOutpoint · parseOutpoint → { txid, vout }

// src/pool/terms.ts
termsHash(terms): string                          // sha256 hex of canonical JSON (sorted keys)
validateTerms(terms): void                        // BAD_TERMS: string numbers, N>0, P>0, minCredits ≤ N, payScript hex
creditsCost(terms, credits): bigint               // ceil(k·P/N)

// src/pool/reserve.ts
buildReserveAndAnnounce(wallet, kit: TokenKit, terms: Omit<PoolTerms,'poolId'|'payScriptHex'> & { payScriptHex?: string }, opts?: { originator?, poolNonce? })
  : Promise<{ txid, poolId, terms: PoolTerms, offerKey: { protocolID, keyID }, beef: number[] }>
  // kit.spendable → selectUtxos(N) → createAction(inputBEEF = overlay BEEF, inputs = token UTXOs,
  //   out0 = transfer N → P2PKH(offer key) [basket 'agentcoop offers', customInstructions],
  //   out1 = token change → my own receive address [basket bsv21] (if any),
  //   out2 = OP_RETURN pool) → signAction (kit signWalletP2pkhInput) → kit.overlay.submit

// src/pool/offer.ts
signOffer(wallet, outpoint, terms, opts?: { sourceBEEF?, offerKey?, originator? }): Promise<Offer>
  // the offer UTXO from listOutputs('agentcoop offers') or opts; tx = in0 + out0(payScript, P); SINGLE|ACP signature
verifyOffer(offer, opts: { sourceTx: Transaction }): void
  // signature via Spend; terms consistent; outpoint = poolId; the source output is a BSV-21 transfer/deploy, amt = N, tokenId equal
  // (checking unspentness needs the network → phase 2 `verifyOfferLive`)

// src/pool/pledge.ts
buildPledge(wallet, terms, credits, signer: 'p2pkh'|'vault', vaultScript?, opts?: { tokenIndex: number, originator?, bufferSats?, allowMultiple? })
  : Promise<{ txid, outpoint, record: PledgeRecord, keyID, beef: number[], satoshis }>
cancelPledge(wallet, outpoint, opts?: { originator? }): Promise<string>
pledgeAmount(terms, credits, bufferSats = 300): number

// src/pool/plan.ts
export interface PledgeCandidate { outpoint, satoshis, lockingScriptHex, record: PledgeRecord, sourceTx: Transaction, blockHeight?: number, unlockingScriptLength?: number }
export interface ChainInfo { height: number, satsPerKb: number, offerSourceTx: Transaction }
planSettlement(offer, pledges: PledgeCandidate[], chain: ChainInfo, opts?: { round?: number, exclude?: string[] }): SettlementPlan
orderPledges(pledges): PledgeCandidate[]          // (blockHeight asc, txid asc), unmined ones last
pledgeListHash(outpoints): string

// src/pool/verify.ts
verifySettlementPlan(plan, offer, myOutpoint, opts: { expectedCredits: string, maxFeeSats?: number, verifyLineage?: false }): Promise<void>

// src/pool/sign.ts / assemble.ts / broadcast.ts
planTransaction(plan): Transaction                 // templateBEEF → tx (sources attached)
signSettlementInput(plan, inputIndex, signer: InputSigner): Promise<UnlockingScript>
assembleSettlement(plan, unlockingScripts: Record<number, UnlockingScript>): Transaction   // every input filled + a local Spend check
broadcastEF(tx, arcadeUrl): Promise<string>        // POST {arcade}/tx, JSON { rawTx: tx.toHexEF() } (same as wallet-toolbox Arcade.js)
internalizeSettlement(wallet, tx, myOutpoint, plan, opts?): Promise<void>
```

## 5. Test scenarios

| File | Scenario |
|---|---|
| `packages/core/test/pool.plan.test.ts` (unit, no network, `ProtoWallet` + fake source txs) | ordering determinism (mixed order → same plan); the 120 % upper bound; exact N selection (an overshooting pledge is skipped, the next taken); `BAD_PLAN` if N cannot be reached; `exclude`; `minCredits`; deadline passed → `DEADLINE_PASSED`; a pledge skipped if change is not ≥ 1; `pledgeListHash` lexicographic; fee ≥ size×rate; output 0 = P; Σk = N |
| same file | `verifySettlementPlan`: an honest plan passes; output 0 changed → `BAD_PLAN`; my credit output to another address → error; my change short → error; OP_RETURN hash corrupted → error; Σk ≠ N → error; fee cap → error |
| `test/skeleton.mockchain.test.ts` (e2e) | mock chain + kit overlay (HTTP, SPV): the provider deploys a token N=1,000 → reserve+announce (overlay admits) → signOffer + verifyOffer → agent-1 pledges 600, agent-2 pledges 400 → plan → each agent verifies + signs → assemble → (mock) broadcast → overlay submit: 2 credit outputs admitted → `TokenKit.sync` → agent balances 600/400; P to the provider's `payScript`; change internalized; **negative:** if the coordinator changes the plan after agent-2 signed, assemble fails the Spend check |
| same file | failed pool: deadline passed → `planSettlement` refuses; pledge coins unspent; `cancelPledge` takes the coin back |

"Broadcast" on the mock chain: the assembled tx is given to one agent's wallet with `internalizeAction` via `tx.toAtomicBEEF()` (the wallet broadcasts; the kit's `mockchain.ts` "already known" patch exists for this) — `broadcastEF` on the real network.

## 6. Risks

| Risk | Mitigation |
|---|---|
| wallet-toolbox `internalizeAction` leaves the spent pledge coin in the basket | `relinquishOutput` (decision 7) |
| The kit overlay has trouble with many plain inputs in a settlement tx (validation test 1) | the skeleton test tests it directly (same as B's test 1) |
| `toAtomicBEEF` lacks the source chain on an unsigned tx | candidates come with full ancestry via `Transaction.fromAtomicBEEF(createAction.tx)`; test |
| The fee estimate does not match the mock chain's feeModel | the wallet's `internalizeAction` does the mock-chain broadcast; fee policy 100 sat/kB in tests |

## 7. Acceptance evidence

mock-chain e2e green (command output in STATUS); mainnet `scripts/skeleton.ts` after D.P0 (txids T1, T2, T3, T5 in STATUS) — until then in Blockers.

## 8. Result (2026-10-30)

- Mock chain: `test/skeleton.mockchain.test.ts` 8/8, `packages/core/test/pool.plan.test.ts` 5/5; 38 tests green in total.
- Deviations from the plan: (1) `settle.ts` gathers sign/assemble/broadcast/internalize into one file. (2) The 120 % window is **recomputed** after insufficient coins are dropped (otherwise the waiting list never kicked in). (3) `buildPledge`'s "one active pledge" check does not count `change:true` outputs. (4) The default vault unlocking length is 150 (D to confirm).
- Mainnet (`scripts/skeleton.ts`) waits for D.P0 + the overlay (STATUS Blockers).
