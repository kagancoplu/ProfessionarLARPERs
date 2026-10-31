# @agentcoop/provider-cli: the provider operator on BSV Desktop

Mints a provider's credit token, opens and cancels pools, and collects pool revenue, with every signature approved in BSV Desktop. The web app's provider console does the same in a browser.

```bash
npm run provider-cli -- whoami
npm run provider-cli -- mint --sym GPUMIN --amt 100000 --dec 0
npm run provider-cli -- open-pool --credits 1000 --price 25000 --deadline +144 --fee 100 --label "8×H100 · 1 week" --min 10
npm run provider-cli -- post-offer <poolId>
npm run provider-cli -- list-pools
npm run provider-cli -- cancel-pool <poolId>
npm run provider-cli -- sync-revenue
npm run provider-cli -- sweep-revenue
```

BSV Desktop must be running and unlocked (mainnet). The CLI connects with `WalletClient('auto', APP_ORIGINATOR)`, and Desktop asks you to approve every action that signs or spends.

| Command | On chain | Notes |
|---|---|---|
| `mint` | T1: BSV-21 deploy+mint | writes the token id into `apps/provider-api/products/<product>.json` |
| `open-pool` | T2: reserve N credits in one UTXO and announce the pool, then sign the offer `SIGHASH_SINGLE\|ANYONECANPAY` and `POST /offers` | `buildReserveAndAnnounce` + `signOffer` from `@agentcoop/core`. If the coordinator is down, the signed offer is kept locally |
| `post-offer` | none | sends a saved offer to the coordinator again |
| `cancel-pool` | spends the reserved offer UTXO back to you; the signed offer becomes void | `cancelPool` |
| `list-pools` | none | coordinator `GET /pools` plus local records |
| `sync-revenue` | none (wallet bookkeeping) | finds pledge fees and settlement payments of your pools on the overlay and tracks them in the `agentcoop revenue` basket |
| `sweep-revenue` | one tx | moves the `agentcoop revenue` basket into your wallet balance |

## Two provider identities

The provider runs on **two separate wallets with different identity keys**:

- **Operator (BSV Desktop):** mints the credit token, opens and signs pools. **Pool revenue goes here**: settlement output 0 and the pledge registration fees pay a per-pool key derived from the operator's identity (`[1,'agentcoop provider']`, keyID = pool nonce, counterparty `anyone`). Desktop does not discover these payments by itself, so `sync-revenue` tracks them and `sweep-revenue` moves them into the normal balance.
- **provider-api server (wallet-toolbox, `WALLET_PROVIDER_API_KEY`):** **402 retail revenue goes here**, and so do redeemed credits; credit returns are sent from here.

The pool nonce is stored in `DATA_DIR/provider-cli/pools.json`. It is not a secret, but without it `sweep-revenue` cannot sign for that pool's revenue key.
