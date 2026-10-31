# B-P5a — The local part of phase 5: edge policy, hello identity proof, health, server files, joining guide

> Track B. `plan/track-B-overlay-coordinator.md` phase 5. User decision (30.10 ~17:57, given in P6a; repeated on the evening of 30.10): the part that depends on no other track is done without waiting for S3. The VPS, the domain and external mainnet evidence (the setup of 5.1, the DNS of 5.2, 5.7) are done when D's accounts and sats arrive.
> Written: 30.10 evening. `git pull` done, STATUS read (new: a root `CLAUDE.md`; the B → C `sync-revenue` note is still in Blockers).

## 1. Why now

Two things can be done locally, independent of the VPS:
1. **Security hole:** today `hello { identity }` asks for no proof. Anyone can connect with a victim's identity and send `sign_reject` for the victim's input; the coordinator blacklists the victim (censorship/griefing). It must close before a public deployment.
2. Server setup files (Caddy, systemd, backup) and rate limits let us go live within 30 minutes once the VPS exists.

## 2. `hello` identity proof (5.4) — MASTER §3.5 change (affects C)

- When the connection opens, the coordinator sends `challenge { nonce }` (32 bytes hex, per connection).
- Participant: `hello { identity, poolIds[], sig }`.
  `sig` = `wallet.createSignature({ data: utf8("agentcoop hello\n" + host + "\n" + nonce), protocolID: [1, 'agentcoop hello'], keyID: '1', counterparty: 'anyone' })` (DER hex).
  `host` = the host of the WS URL the participant connected to (`coop.example.org`, `localhost:8090`). The coordinator verifies against the `Host` header it sees; this stops a fake coordinator from relaying the nonce to the real one.
- Verification: `new ProtoWallet('anyone').verifySignature({ data, signature, protocolID, keyID, counterparty: identity })` (the same `'anyone'` derivation as the overlay's vault ownership check; a BRC-100 wallet does not sign with the root identity key but with a derived key).
- A `hello` without `sig` (or without `identity`) opens a **watcher** session: it gets `pool_update`, not `sign_request`; `sign_response`/`sign_reject` are not accepted. `hello_ack { identity, poolIds, proven }`.
- `sign_request` goes only to proven sessions.
- Client helper for C: `apps/coordinator/src/client.ts` → `connectCoordinator(url, wallet, { poolIds })` (`@agentcoop/coordinator/client`). It waits for the challenge, signs, waits for `hello_ack`.
- Level 1 protocol: Desktop asks the user once per app; the key controls no value, it is only an identity proof.

## 3. Edge policy (5.3, 5.4)

**Coordinator** (`apps/coordinator/src/limits.ts`, the shared limiter in `packages/overlay/src/limits.ts`; no extra dependency):
- `trust proxy` = `loopback` (behind Caddy `X-Forwarded-For` is trusted; direct local requests are loopback).
- Fixed window per IP: GET 120/min, POST 10/min (env `RATE_GET_PER_MIN`, `RATE_POST_PER_MIN`; `RATE_LIMIT=off` disables). Loopback exempt (agent/coordinator on the same machine). Over the limit `429 { code: 'RATE_LIMITED' }` + `Retry-After`.
- CORS: public (`*`), GET/POST/OPTIONS; the POSTs already verify signatures and unspentness. Body 1 MB (exists).
- WS: at most 20 connections per IP, 1000 in total; at most 40 messages per 10 s per connection, an offending connection is closed with `1008`; message ≤ 256 kB (exists).

**Overlay:**
- `configureEdgePolicy({ jsonBodyLimitBytes: 1 MB, binaryBodyLimitBytes: 10 MB })` (10 MB for settlement BEEFs; 100 participants ≈ 40 kB tx + ancestors).
- Per IP: `/lookup` 60/min, `/submit` 30/min; loopback exempt (the coordinator is on the same machine). Env `OVERLAY_RATE_LOOKUP_PER_MIN`, `OVERLAY_RATE_SUBMIT_PER_MIN`, `RATE_LIMIT=off`.
- overlay-express's CORS is public by default; unchanged.

## 4. Health (5.5)

- Coordinator `GET /healthz`: `{ ok, overlay, height, arcade, engine, openPools, ws: { clients, proven }, uptimeS }`. `ok` = the overlay is reachable.
- Overlay `GET /agentcoop/healthz` (overlay-express's `/healthz` stays): `{ ok, db, lastEventAt, sseClients, uptimeS }`; `db` = a `select 1` on the lookup table.
- The logs are already JSON lines (coordinator). UptimeRobot watches the two URLs (setup in infra/README).

## 5. Server files (5.1, 5.2) — `infra/`

- `Caddyfile`: `{$OVERLAY_HOST}` → :8080, `{$COOP_HOST}` → :8090 (WS included), automatic HTTPS; `<ip>.sslip.io` without a domain.
- `agentcoop.service` (systemd): `node infra/run.mjs`, `DATA_DIR=/var/lib/agentcoop`, `EnvironmentFile=/etc/agentcoop.env` (600).
- `backup.mjs`: an online consistent copy with better-sqlite3 `.backup()` (`overlay.db`, `coordinator.db`) + `overlay.key`; keeps 7 days. The cron line in the README. Restore steps in the README; tried once locally.
- `setup-vps.sh`: Node 22, Caddy, the `agentcoop` user, directories, the service on Ubuntu. (Run when the VPS arrives.)
- `agentcoop.env.example`: the server env (the root `.env.example` is D's; untouched, a STATUS note to D).

## 6. Joining guide (5.6)

`apps/coordinator/README.md` → "Join with your own agent": URLs (filled in when the VPS arrives; `localhost` for now), `GET /pools` with curl, overlay lookup, the WS protocol (challenge → hello+sig), an agent of ~15 lines with `connectCoordinator` + A's `buildPledge` / `verifySettlementPlan` / `signSettlementInput`.

## 7. Tests

`apps/coordinator/test/e2e.public-edge.mockchain.test.ts`:
1. A proven `hello` → `proven: true`; unproven → `proven: false`, no `sign_request`.
2. **Attack:** an attacker connecting without proof under the victim's identity sends `sign_reject` → refused, the victim signs, the pool settles.
3. A bad signature, a signature made for another host and another connection's nonce are refused.
4. HTTP rate limit: an external IP via `X-Forwarded-For` → 429 on the 11th POST; loopback exempt.
5. CORS: `Access-Control-Allow-Origin: *` on a GET with an `Origin` header, OPTIONS 204.
6. A WS message flood → the connection is closed with 1008.
7. Overlay: `/agentcoop/healthz` `ok`; `/lookup` from an external IP → 429 on the 61st request; a body over 10 MB is refused.
The existing bots (`agentBot.ts`, `participant.ts`, `e2e.pools`) move to `connectCoordinator`.

## 8. Acceptance

Tests green; root `npm test` and `npm run typecheck` clean; `node infra/run.mjs` starts both services under tsx, `/healthz` and `/agentcoop/healthz` answer; backup → delete → restore tried locally; MASTER §3.5 (hello) and §3.8 (overlay healthz) current; an interface note to C in STATUS.
