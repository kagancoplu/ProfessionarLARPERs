# participant-cli: join a pool yourself from BSV Desktop

```bash
npm run participant-cli -- pools                       # open pools, with demo pricing
npm run participant-cli -- pledge <poolId> <credits>   # T3: a pledge coin stays in your wallet
npm run participant-cli -- sign                        # keep it open; when the pool fills, check and sign (T5)
npm run participant-cli -- cancel                      # withdraw your pledge; the coin comes back
```

BSV Desktop must be running and unlocked (mainnet). Every signature shows an approval prompt. Env: `APP_ORIGINATOR`, `OVERLAY_URL`, `COOP_API_URL`, `NETWORK`, `ARCADE_URL`, `DATA_DIR`.

A human joins on the same terms as the agents and with the same code (`apps/agents/src/participant.ts`):

1. `pledge` calls Track A's `buildPledge`. Your sats stay in your wallet as a pledge coin, and a small non-refundable registration fee goes to the provider.
2. `sign` stays on the coordinator's WS. When the pool fills, it receives the settlement plan. Before Desktop signs your pledge input with SIGHASH_ALL, it checks the whole transaction: your credits go to your own address, your change is correct, and the provider's credits trace back to the token deploy (`verifyLineage`). Otherwise it sends `sign_reject` with the reason. After settlement your change and credits come back to your wallet.
3. If the pool does not fill by its deadline, nothing is spent. `cancel` returns the coin and tells the overlay.

Approve the Desktop prompt within the coordinator's round timeout (60 s by default). If you miss it, the coordinator retries without you and you can sign the next round.

Your pledges are recorded in `DATA_DIR/participant-cli/pledges.json`. The file holds no secrets; the keys stay in Desktop.

## Sign now and leave (`--lighthouse`)

You do not have to keep `sign` open. With `--lighthouse` you sign once, over your own credit output only, and name a guard; when the pool fills, the coordinator asks that guard, which checks the whole settlement as you would and co-signs. Your coin sits on a script that only you (alone) or you with that guard can spend, so the guard cannot take it and nobody can redirect your credits.

```bash
npm run participant-cli -- pledge <poolId> 12 --lighthouse            # guard = GUARD_URL (default http://localhost:8091)
npm run participant-cli -- pledge <poolId> 12 --lighthouse --guard https://guard.example
npm run participant-cli -- sync                                       # after the pool settles: your credits
npm run participant-cli -- cancel                                     # take the coin back alone, any time before settlement
```

The coordinator must accept lighthouse pledges (`POST /pledges/lighthouse`) and be able to reach that guard; otherwise the CLI stops before anything is signed. Test: `test/participant-cli.mockchain.test.ts`.
