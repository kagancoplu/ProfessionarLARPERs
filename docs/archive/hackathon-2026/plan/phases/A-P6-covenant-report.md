# A-P6 6.6 — Covenant vault: can the guard go away? (research report, 2026-10-30)

> Time box 3 h. Code: `packages/core/src/research/covenant/vaultCovenant.ts` (not exported from `@agentcoop/core`).
> Test: `packages/core/test/research.covenant.test.ts` (7/7, interpreter only). **Nothing went to mainnet.**

## 1. Question

Can a script alone enforce what the guard enforces today for a vault's `pay` spends: "money leaves only to an
allowlisted payee, at most X per spend, change returns to the same vault, fee bounded", without a co-signer?

## 2. Answer: yes for a static payee and a per-spend cap; no for the rest of the guard's job

The prototype works in the SDK interpreter (`@bsv/sdk` 3.2.1 `Spend`):

```
OP_IF   <ownerPub> OP_CHECKSIG                       owner alone, any time
OP_ELSE OP_PUSH_TX covenant + <agentPub> OP_CHECKSIG
OP_ENDIF
unlock (covenant): <agentSig> <outputs> <preimage> OP_0
```

The covenant branch checks, in order:
1. **OP_PUSH_TX:** the script recomputes the ECDSA signature of the pushed preimage for private key 1 and nonce 1
   (`r = Gx`, `s = z + Gx mod n`), DER-encodes it and runs `OP_CHECKSIGVERIFY` with pubkey `G`. Only this
   transaction's real BIP-143 preimage passes, so every field read from it afterwards is true.
   The spender grinds the change by 1 sat until `s` encodes as a 32-byte low-S DER integer (≈ 2 tries; 1 in the run).
2. `hashPrevouts == hash256(this outpoint)`: one input only. The fee can only come from the vault coin
   (otherwise a second vault coin in the same tx could be burnt into the fee).
3. `hashOutputs == hash256(<outputs>)`: the pushed outputs are the real ones.
4. Output 0: `0 < value ≤ maxPaySats`, script = the allowlisted P2PKH.
5. Output 1 and nothing after it: script = this coin's own `scriptCode` (read from the preimage, so the script
   refers to itself without a hash loop).
6. `inputValue ≤ pay + change + maxFeeSats`.
7. The agent's ALL signature.

Refused in the test: pay over the cap, another payee, change to another script, fee over the cap, an extra
output, a second input, a preimage of another transaction, a wrong agent key. The owner path works alone.

## 3. Cost

| | bytes | fee at 100 sat/kB (Arcade policy 2026-10-30) |
|---|---|---|
| locking script | 669 | (once, at funding) |
| covenant unlock | 1,622 (preimage ≈ 828, outputs ≈ 714, sig 72) | |
| whole spend tx | 2,389 | **≈ 239 sat** |
| today's 2-of-2 vault spend (D) | ≈ 450–500 (estimate: vault input + agent fee input + 2–3 outputs; not measured) | ≈ 50 sat |

About 5× the fee of the guard path: cheap in absolute terms, but it matters for many small 402 payments.
The script carries two 32-byte reversals (124 opcodes each); `@1sat` OrdLock v2 uses the same OP_PUSH_TX primitive
in production (`A-P6-ordlock-notes.md` §4), so the technique itself is not exotic.

Opcodes used: `OP_CAT`, `OP_SPLIT`, `OP_SUBSTR`, `OP_LEFT`, `OP_NUM2BIN`, `OP_BIN2NUM`, `OP_MOD`, 33-byte script
numbers. Source of truth for availability: the interpreter in `@bsv/sdk` 3.2.1 (`dist/esm/src/script/Spend.js`).
With its default flags the number-size and Chronicle-opcode limits are not applied at all; transaction version > 1
only relaxes the malleability rules (`LOW_S`, `MINIMALDATA`, `CLEANSTACK`), and the unlock satisfies those anyway,
so version 1 and 2 both pass. **Not checked:** the official Chronicle opcode list and a real node's policy
(script size, standardness of the 1.6 kB unlock). Needs one mainnet spend before anyone relies on it.

## 4. What a covenant cannot replace

| Guard job today (D, MASTER §3.7) | Covenant? |
|---|---|
| allowlisted payee, per-spend cap, change back, fee cap | **yes** (this prototype) |
| provider payee derived per pool (`[1,'agentcoop provider']`, keyID = pool nonce, BRC-42) | **no**: EC key derivation in script is not practical. Needs a static payout script per provider, registered by the owner |
| weekly / per-pool caps | **not stateless**. Possible as a stateful covenant: state (window start, spent) in the script, change must carry the updated state; time only from the spender-chosen `nLockTime`, so the window is approximate |
| settlement DvP: "my credits arrive, genuine lineage" | **no**: BSV-21 validity is not script-enforced (same reason the guard-backed Lighthouse needs a guard). The agent's own `verifySettlementPlan` + `verifyLineage` stays |
| pause / revoke a provider instantly | only by the owner sweeping the coin to a new script |

## 5. Recommendation

- **Do not move it into the core before S4.** The guard stays the vault's policy engine; the covenant does not
  cover pool settlements (the main flow) or rolling caps.
- **Worth a README / pitch line** (FINAL-IDEA §13 "future"): "the pay path can be guard-free: a 669-byte
  covenant enforces payee, cap and change on chain; we tested it in the interpreter".
- If pursued after the hackathon: (1) one mainnet spend, (2) stateful weekly cap, (3) a small allowlist (OP_IF
  per payee, or a hash list), (4) measure node policy limits.
