# B-P6a — The local part of phase 6: audit (`/pools/:id/audit`) and metrics (`/metrics`)

> Track B. `plan/track-B-overlay-coordinator.md` phase 6.3 and 6.4. User decision (30.10 ~17:57): the part of phase 6 that depends on no other track is done without waiting for S3. The second coordinator (6.1, 6.2) and the 50+ participant mainnet test (6.5) stay until after S3.
> Written: 30.10 ~18:00. `main`. First `git pull` + STATUS read (A's 17:50 fixes, C's `register-sdk` hook).

## 1. Goal

Make two claims demonstrable with data **recomputed from the chain**:
1. **The coordinator's selection is auditable** (FINAL-IDEA §8 "power to choose: detectable"). For any settlement, anyone can check: is the `pledgeListHash` in the OP_RETURN really the hash of the included inputs, does the selection follow A's deterministic rule, are there pledges ahead in line that were left out, and why.
2. **Satoshis held in custody = 0** (FINAL-IDEA §11 closing numbers). Every output of every settlement is classified: provider payment, a participant's credits, a participant's change, OP_RETURN. Every satoshi outside these counts as "unaccounted". `custodiedSats` is that total; it is not a hard-coded zero.

## 2. Dependencies

None. A's `planSettlement`, `orderPledges`, `pledgeListHash`, `termsHash`, `parseOpReturn`, `decodeBsv21`, `receivePkh` are ready. The data comes from the overlay (the `pool`, `pledges` (`includeSpent`, `includeInvalid`), `settlement` queries, with BEEF) and from the coordinator's own DB (offer, blacklist).

## 3. Audit — `GET /pools/:poolId/audit`

Only for a settled pool; otherwise `409 NOT_SETTLED`.

| Check | How | Source |
|---|---|---|
| `hashMatches` | `pledgeListHash(the settlement's in1..n outpoints)` = OP_RETURN `settle.pledgeListHash` | chain |
| `termsHashMatches` | `termsHash(stored offer.terms)` = OP_RETURN `settle.termsHash` (`null` without an offer) | chain + coordinator |
| `providerPaid` | out0 = `priceSats` → `payScriptHex` | chain |
| `creditsDelivered` | for each included pledge, a BSV-21 output of exactly `credits` to `receivePkh(participant, tokenIndex)`; total = N | chain |
| `allIncludedValid` | every included outpoint is a valid pledge of this pool | overlay (indexed from the chain) |
| `selectionMatches` | A's `planSettlement` is rerun with these candidates: this pool's pledges; those spent by a tx other than the settlement (cancellations) are removed; the coordinator's **declared** blacklist is passed as `exclude`. The resulting outpoint set is compared with the set actually included | chain + the coordinator's declaration |
| `skippedEarlier` | every pledge that comes before the last included pledge in line (height, txid) and was not included, with its reason: the declared reason if blacklisted (`timeout`, `bad signature`…), `cancelled` if cancelled, otherwise `not explained` | chain + the coordinator's declaration |

`verdict`:
- `consistent`: all chain checks hold and the selection matches the rule;
- `inconsistent`: the hash, payment or credit check fails;
- `unexplained-skips`: the chain is right but there is an unexplained skipped pledge, or the selection does not match.

**Honest limit (in the README):** the blacklist reasons (timeout, bad signature) are the coordinator's off-chain declaration; the audit cannot verify them, only list them. What the chain proves is that, with the declared blacklist, the selection follows the rule and every pledge left out is explained. Censorship is not prevented; it becomes **detectable** (as in FINAL-IDEA §8).

## 4. Metrics — `GET /metrics` (`?format=prom` Prometheus text)

From every pool and settlement on the overlay, cached for 10 s:
- `pools` (by status: open/locking/settled/failed/cancelled), `pledges` (open, cancelled, included in a settlement);
- `settlements`; `participants` (total, average per settlement, largest);
- `avgFeeSats`, `avgFeeSatsPerParticipant`, `avgSettlementBytes` (fee = Σ inputs − Σ outputs; input values from the source txs in the BEEF);
- `rounds` (the `round` in the settle record: average, largest);
- `custodiedSats` and `custodyCheck: { settlementsChecked, outputsClassified, unaccountedOutputs: [...] }`: every output must fall into one of the four classes above; those that do not are listed.

## 5. Files

```
apps/coordinator/src/audit.ts     auditPool(deps, poolId) → AuditReport
apps/coordinator/src/metrics.ts   computeMetrics(deps) → Metrics; classifySettlement(tx, terms, included) (custody classifier); toProm(m)
apps/coordinator/src/overlay.ts   + settlementTx(poolId), pledgesAll(poolId) (with BEEF)
apps/coordinator/src/api.ts       + GET /pools/:poolId/audit, GET /metrics
apps/coordinator/test/e2e.audit-metrics.mockchain.test.ts
```

## 6. Test scenarios

1. A settlement built by the coordinator (with A's builders, including a waiting-list round) → `verdict: consistent`, `skippedEarlier` only the blacklisted pledge with its declared reason.
2. **A coordinator that breaks the rule:** for the same kind of pool, a settlement that leaves out the first pledge in line with no declaration (A's `planSettlement` with `exclude:[first]`, built outside the coordinator and broadcast) → `selectionMatches:false`, `skippedEarlier: [{ reason: 'not explained' }]`, `verdict: unexplained-skips`.
3. `/metrics`: settlement and participant counts, fee averages, `custodiedSats: 0`; the same values in the Prometheus output.
4. Classifier unit test: an output to an unknown script falls into `unaccountedOutputs` and `custodiedSats` > 0.

## 7. Acceptance

Tests 1–4 green; root `npm test` and `npm run typecheck` clean; the services start under tsx and both endpoints answer; both endpoints written into MASTER §3.5; STATUS current.
