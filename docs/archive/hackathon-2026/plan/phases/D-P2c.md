# D-P2c — Guard `kind: 'lighthouse'` (request from A 5.5–5.7)

> Track D. STATUS "Interface changes" 30.10 22:30 A → B, D, C, E: the person who made a lighthouse pledge is offline; in the round the coordinator asks the guard named in the person's record. User decision (30.10 ~23:00): now. First `git pull` + STATUS (there was no new commit).

## Design

- `POST /cosign` body `{ context: { kind: 'lighthouse' }, plan, inputIndex, pledge: LighthousePledge }` (a top-level `kind: 'lighthouse'` is accepted too). No agent signature, no vault, no policy: the person chose this guard for this one pledge.
- `apps/guard/src/lighthouse.ts` `evaluateLighthouse`: **the offer comes from the plan** (the source of input 0 = the pool tx, bound by txid; terms + nonce via `poolFactsFromTx`, unlocking script = the provider's offer signature); the `offer` in the request is not used. Then A's `cosignLighthouse(guardWallet, { plan, offer, inputIndex, pledge, lineage })`: the guard in the record = me, the pool matches, `verifySettlementPlan` + `verifyLineage`, the person's signature is valid for this plan. `AgentCoopError` → 403, anything else → 400.
- Response `{ unlockingScriptHex }` (person + guard, the full unlock). Decision record `kind: 'lighthouse'` (participant, pool, outpoint, credits). Serialized in the guard's queue.
- Client: `lighthouseCosign(guardUrl, { plan, inputIndex, pledge })` (`@agentcoop/core/signers/VaultSigner`) → unlock hex; refusal → `CosignRejected`.

## Test

`test/guard.lighthouse.mockchain.test.ts` 3/3: over HTTP; refusals (a plan paying the credits to someone else, a guard the person did not name, a wrong input, a malformed request → 400; 4 DENY records); two people with the guard, the agent signs itself → one settlement passes script verification, broadcast on the mock chain, the people's credit outputs in place.

## Checkpoint (30.10 ~23:10)

1. No plan change.
2. Done: guard `lighthouse`, client `lighthouseCosign`, test; MASTER §3.7 row ✅; guard README; THREAT-MODEL T-20.
3. Other tracks: **B** must call `lighthouseCosign(URL of record.guard, …)` for a lighthouse participant in the round (mapping guard identity to URL is B's; `GUARD_URL` for now); **C/E** no change.
4. Next: ask the user (the mainnet laptop / funding is still pending).
5. Interface: request format and client added to the MASTER §3.7 lighthouse row.
