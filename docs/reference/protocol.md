# Protocol reference

The on-chain formats AgentCoop uses: transaction layouts, `OP_RETURN` records, locking scripts, signature scopes and key derivations. The builders and verifiers that produce and check them are in [`packages/core`](../../packages/core/README.md); how the overlay admits and indexes them is in [`packages/overlay`](../../packages/overlay/README.md#how-records-are-indexed). Constants: `packages/core/src/types.ts`.

## Conventions

- **Records** are `OP_FALSE OP_RETURN "agentcoop" <op> <json>`, with `op` one of `pool`, `pledge`, `settle`, `list`, `vault`, `offer`. Every JSON value is a string (as in BSV-21), and every record carries `v: "1"`. Structural validation: `packages/overlay/src/records.ts`.
- **Ids** are `<txid>_<vout>`. A pool's id is `<pool txid>_0`.
- **Identity keys** are 33-byte compressed public keys in hex. All wallet keys are derived (BRC-42/43); nothing is locked to a bare identity key.
- **Overlay names:** topic `tm_agentcoop`, lookup service `ls_agentcoop`. BSV-21 credit rules run inside the same topic.

## Pool announcement (T2)

| Output | Content |
|---|---|
| 0 | The N reserved credits: a BSV-21 transfer of N, 1 sat, locked to the provider's key `[1, 'agentcoop provider']`, keyID `offer <poolNonce>` (basket `agentcoop offers`, so the wallet never spends it as an ordinary token) |
| any | `OP_RETURN agentcoop pool` with the terms: `provider`, `providerApi`, `tokenId`, `credits` (N), `priceSats` (P), `payScriptHex`, `feeSats`, `minCredits`, `deadlineHeight`, `label`, `retailSatsPerCredit`, optional `backstopMax`. No `poolId`: a transaction cannot contain its own txid |

`payScriptHex` pays the provider's per-pool revenue key `[1, 'agentcoop provider']`, keyID `<poolNonce>`, counterparty `anyone` (basket `agentcoop revenue`).

## Offer

The provider signs input 0 of the future settlement (the reserved credit output) with `SIGHASH_SINGLE|ANYONECANPAY|FORKID` (0xC3): it commits to that input and to output 0 = `priceSats` → `payScriptHex`, nothing else. The offer is sent to the coordinator (`POST /offers`) and can be published as `OP_RETURN agentcoop offer { v, poolId, unlockingScriptHex }`. Anyone can publish such a record, so readers rebuild and verify it against the pool (`offerFromRecord`, `verifyOffer`).

## Pledge (T3)

| Output | Content |
|---|---|
| 0 | The pledge coin, at least `ceil(credits × priceSats / N) + 1` sat. P2PKH on `[1, 'agentcoop pledge']`, keyID a random nonce, counterparty `anyone` (basket `agentcoop`, one active pledge); or the owner's vault script for a vault pledge; or the Lighthouse script |
| 1 | The registration fee, at least `feeSats`, to the pool's `payScriptHex` (non-refundable) |
| any | `OP_RETURN agentcoop pledge { v, poolId, credits, participant, tokenIndex, signer, creditLock?, mode?, guard?, lhId? }` |

- `signer` is `p2pkh` or `vault`.
- `creditLock: 'vault'` (only with `signer: 'vault'`): the participant's credits settle onto its vault script.
- `mode: 'lighthouse'` (with `signer: 'vault'`, a `guard` identity key and a 32-hex `lhId`): an offline pledge; see below.
- `tokenIndex` selects the participant's credit receive address.

Whether a pledge counts is decided against its pool at query time: the pool is open, `minCredits ≤ credits ≤ N`, and outputs 0 and 1 meet the amounts above. A pledge is cancelled (T4) by spending its coin.

## Settlement (T5)

```
in 0      offer: N credits (SINGLE|ACP, signed by the provider)    out 0      P sats → payScriptHex
in 1..n   pledge coins (ALL each)                                   out 1..n   BSV-21 transfer k_i → participant i
                                                                    out …      change_i → pledge coin i's own script
                                                                    last       OP_RETURN agentcoop settle { v, poolId, termsHash, pledgeListHash, round }
```

- `version = 1`, `lockTime = 0`, input 0 `sequence = 0xffffffff` (the `SINGLE|ACP` signature covers these fields too).
- Σ k_i = N exactly. Pledges are ordered by block height, then txid; `pledgeListHash` commits to the included pledges, `termsHash` to the pool terms.
- Credit output i goes to participant i's receive address (`receivePkh(identity, tokenIndex)`), to its vault script when its pledge record says `creditLock: 'vault'`, or to its own address for a Lighthouse pledge.
- Change goes back to the coin's own script. A Lighthouse coin is exact and gets no change.
- The miner fee is shared from the participants' change; each participant caps its own share.

`verifySettlementPlan` (`packages/core/src/pool/verify.ts`) checks all of the above for one participant before it signs, and reads `creditLock` and `mode` from each pledge's on-chain record, never from the plan.

## Market listing and sweep (T8)

- Listed credits sit on `[1, 'agentcoop market']`, keyID `list <nonce>` (basket `agentcoop listings`); proceeds go to keyID `pay <nonce>`.
- The seller signs the credit input `SIGHASH_SINGLE|ANYONECANPAY|FORKID`: the output at the same index pays it `askSats`.
- Optional record: `OP_RETURN agentcoop list { v, tokenId, credits, askSats, seller }`. The listing book itself is the coordinator's.
- A sweep pairs each listing input *i* with payment output *i*, and delivers the credits to the buyer; the buyer signs its own inputs `ALL` after verifying each listing's lineage.

## Mandate Vault (T9, T10)

```
OP_IF   <ownerPub> OP_CHECKSIG
OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG
OP_ENDIF
```

- Each key is derived with `[1, 'agentcoop vault']`, keyID `<vaultId>`, counterparty `anyone`, from the owner's, the agent's and the guard's identity, so anyone can recompute the script from the record.
- Record: `OP_RETURN agentcoop vault { v, vaultId, owner, agent, guard }`. The overlay marks a record `verified` only if its script matches that derivation.
- Agent-side baskets: `agentcoop vault`, and `agentcoop vault credits` for vault-locked credits.
- Unlocking: owner branch `<sig> OP_1`; multisig branch `OP_0 <agentSig> <guardSig> OP_0` (`VAULT_COSIGN_UNLOCK_LENGTH` = 150 bytes reserved).

**Vault-locked credits** are the canonical BSV-21 inscription with the vault script as owner:

```
OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF
OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
```

Script enforces who can spend them; token rules (conservation, lineage) are unchanged. The overlay and `verifyLineage` read them with `ownerKinds: ['p2pkh', 'vault']`.

## Lighthouse pledge (T5-L)

```
OP_IF   <withdraw key> OP_CHECKSIG
OP_ELSE OP_2 <person's settlement key> <guardPub> OP_2 OP_CHECKMULTISIG
OP_ENDIF
```

The person's two keys are different (`[1, 'agentcoop vault']`, keyID `lhId` for the settlement key and `withdraw <lhId>` for the solo key): `OP_CHECKSIG` accepts any sighash type, so with one key the `SINGLE|ACP` pre-signature would also open the solo branch. The person signs once with `SINGLE|ACP` over its coin and its credit output; the guard named in the record signs `ALL` in the round after checking the whole settlement. Basket: `agentcoop lighthouse`. Builders: `packages/core/src/pool/lighthouse.ts`, `packages/core/src/scripts/lighthouse.ts`.

## Coop Rail HTLC (T11)

```
OP_IF   OP_SIZE <32> OP_EQUALVERIFY OP_SHA256 <hash> OP_EQUALVERIFY
        OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG     claim: agent + guard with the 32-byte secret
OP_ELSE OP_2 <makerPub> <agentPub> OP_2 OP_CHECKMULTISIG     refund: pre-signed, nLockTime = height + k
OP_ENDIF
```

Keys: `[1, 'agentcoop rail']`, keyID `<swapId>`, counterparty `anyone`. The funding is version 1; the refund is signed by the agent before the funding is broadcast. See [ADR 0003](../decisions/0003-coop-rail-presigned-refund.md) and [RAIL-POC.md](../RAIL-POC.md).

## Signature scopes

| Input | Scope | Signed by | When |
|---|---|---|---|
| Offer (settlement input 0) | `SINGLE\|ANYONECANPAY\|FORKID` (0xC3) | provider | once, when the pool opens |
| P2PKH pledge | `ALL\|FORKID` (0x41) | participant | in the round, after `verifySettlementPlan` |
| Vault pledge | `ALL\|FORKID`, 2-of-2 | agent + guard | in the round; the guard runs the same verifier |
| Lighthouse pledge | person `SINGLE\|ACP`, guard `ALL` | person once; guard in the round | `cosignLighthouse` |
| Listing | `SINGLE\|ANYONECANPAY\|FORKID` | seller | once |
| Vault-credit listing | `SINGLE\|ANYONECANPAY\|FORKID`, 2-of-2 | agent + guard | once; proceeds to the vault |

BRC-100 wallets (BSV Desktop, wallet-toolbox) sign these through `createSignature({ hashToDirectlySign })`, with the sighash computed by the application (`packages/core/src/signers/`).

## Authentication messages

- **Coordinator `hello`:** `createSignature` over `"agentcoop hello\n" + host + "\n" + nonce` with `[1, 'agentcoop hello']`, keyID `1`, counterparty `anyone`, where `nonce` is the server's per-connection challenge and `host` the host the client connected to.
- **HTTP services:** the provider API and the guard's owner routes use BRC-103/104 mutual authentication (`@bsv/auth-express-middleware`); the provider's paid routes add BRC-105 (`@bsv/payment-express-middleware`).

## Error codes

Library errors are listed in [packages/core/README.md](../../packages/core/README.md#errors); service error codes in each service's README.
