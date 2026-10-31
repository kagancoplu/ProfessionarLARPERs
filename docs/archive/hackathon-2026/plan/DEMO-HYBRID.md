# Hybrid demo: mocked flow, real payments

Decision of 31.10 (user). For the pitch, the public demo runs **only on Vercel + Supabase**, for free. The backend (coordinator, overlay, guard, provider-api, agents, maker, relay) is not published. A teammate on the business side will bring scenarios, demo scenes and flows from another Claude session. When one of them is implemented, the rules below apply.

## Rules

1. **Mocked flow, real money.** The story of the scenario (the pool filling, the service delivered, the town animation, the agents talking) runs in the web app's mock mode. But every payment in the scenario is a real mainnet transaction: the visitor connects their own BSV Desktop with a button (`new WalletClient('auto')`, `apps/web/src/wallet/client.ts`), the money really leaves their balance, and the other side really receives it.
2. **Both sides are real.** Example scenario: 5 users buy a shared service, each pays their share to the provider. The payer's balance drops; the provider's wallet takes the payment with `internalizeAction` and its balance grows. Each payment's WhatsOnChain link is shown on screen.
3. **No lobby.** No matchmaking, rooms or invitations. Communication between the parties (who paid, counter 2/5, the provider received it) is shown on screen through Supabase Realtime; that is enough.
4. **No backend.** No scenario may need the coordinator, the overlay or a server wallet. If one does, ask the user first: it breaks the decision for a free, serverless deployment.
5. **Payment format** (`AGENTS.md`): BRC-29. The payer creates, with `createAction`, a P2PKH output derived for the provider's identity key (`counterparty` = provider, `forSelf: false`), `randomizeOutputs: false`, and finds the output index by locking script. The provider verifies with SPV (`Transaction.fromAtomicBEEF(beef).verify(chainTracker)`, Arcade chaintracks), then `internalizeAction` (`protocol: 'wallet payment'`, `paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey }`). No tokens or NFTs; no token goes into the `default` basket.
6. **The hand-over happens in Supabase.** The payer's browser inserts a `demo_payments` row (txid, scenario, session, both identity keys, vout, satoshis, derivation prefix/suffix, AtomicBEEF hex). The provider's browser reads it, verifies it, takes it into the wallet and inserts a `demo_receipts` row. Tables: `supabase/migrations/20261031140000_demo_payments.sql`. Anyone can read and insert; no updates or deletes. Rows cannot carry money: a fake row cannot pass SPV or `internalizeAction` in the provider's browser. A receipt is only a hint for the screen, not proof; the proof is the wallet balance and the chain.
7. **Configurable.** The price (default 1000 sat per person), the number of people (default 5) and the provider's identity key are scenario settings, not hard-coded. The provider's identity key comes from the build env (suggestion: `VITE_DEMO_PROVIDER_KEY`).
8. **Who plays.** The visitor needs BSV Desktop and some mainnet sats. The jury most likely has neither; on stage the team plays the payers. A visitor without a wallet watches the mocked flow; the real payment step tells them "BSV Desktop required".
9. **Fallback.** If the wallet or the network fails during the demo, the same link with `?mode=mock` falls back to a fully fake flow. The proof of earlier real mainnet transactions is in the `README.md` tx table.

## Deploy

- **Vercel**: `apps/web/vercel.json`. In Vercel, take the project from the `web` (Vite) row with **Import single project**, Root Directory `apps/web`, Node 22.x. Install (`cd ../.. && npm ci`), build (`npm run build:demo`) and output (`dist`) come from the file. The SPA rewrite and the security headers are also in the file (the Vercel counterpart of Cloudflare's `public/_redirects` and `public/_headers`). The CSP allows BSV Desktop's local ports (`http://localhost:3301`, `http://localhost:3321`, `https://localhost:2121`).
- **Env (Vercel → Settings → Environment Variables)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (only the anon/publishable key; never the secret key), `VITE_NETWORK=main`. `VITE_*` values are compiled into the build and visible in the browser. A change needs a redeploy.
- **Supabase**: `supabase db push` applies the missing migrations under `supabase/migrations/` to the remote project (linked with `supabase link`). Local trial: `supabase migration up --local`.
- `build:demo` is `vite build --mode mock` today. When the hybrid step is added, this script changes to turn on the hybrid mode; the Vercel settings need not change.

## Status

- ✅ 31.10: Supabase tables (`demo_payments`, `demo_receipts`, RLS, Realtime), `apps/web/vercel.json`, `build:demo`.
- ⏳ The real payment step in the web app and the provider's "receive incoming payments" button: when the business scenarios arrive, under these rules.
