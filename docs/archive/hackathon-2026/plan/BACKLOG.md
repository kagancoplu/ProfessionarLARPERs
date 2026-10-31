# BACKLOG

Open work, in priority order. Detail and context: [`plan/HANDOFF.md`](HANDOFF.md) (§ references point there). The full text of the security findings: [`docs/AUDIT-READINESS.md`](../docs/AUDIT-READINESS.md) §6.

**Usage:** whoever finishes an item sets its status to `✅ <date> <commit>` and updates the related document (THREAT-MODEL, AUDIT-READINESS, ROADMAP) in the same commit. New items go at the bottom with the next free `BL-` number. Run `npm run check:docs` if you touched a security document.

Status: ☐ open · ◐ started · ✅ done · ⏸ deliberately postponed

## P0: before submission and the demo

| ID | Item | Owner | Status | Done when | Reference |
|---|---|---|---|---|---|
| BL-01 | **Delete the `WALLET_*` GitHub Actions secrets.** The public repo holds the private keys of mainnet wallets; no workflow uses them | Repo owner (admin) | ✅ 31.10 (7 `WALLET_*` secrets deleted, `gh secret list`) | no `WALLET_*` in `gh secret list` | HANDOFF §2.2 #2 |
| BL-02 | **Enable GitHub private vulnerability reporting**, then simplify the "when it is available" wording and the issue-based fallback in `SECURITY.md` | Repo owner (admin) | ☐ | `gh api repos/kagancoplu/ProfessionarLARPERs/private-vulnerability-reporting` → `{"enabled":true}` | HANDOFF §2.2 #3 |
| BL-03 | **Submit the project on Devfolio.** The only condition for automatic entry to the audit prize | Team | ☐ | submission link in STATUS | HANDOFF §3 |
| BL-04 | **Video (2–3 min) or a live demo**, including an agent payment. A mandatory requirement of the challenge (`FINAL-IDEA.md` §1.1 S2). **The video is ready (2:30):** `npm -w apps/web run film:make` → `apps/web/film-out/agentcoop-demo.mp4` (film + app tour + Why BSV + manifesto; Kokoro voice-over, chiptune, burnt-in subtitles, a "Try now" with a QR code at the end; `apps/web/VIDEO.md`). Left: uploading the video somewhere and putting the link in the README | Team | ☐ | video link in the README | HANDOFF §5.3 |
| BL-05 | **Public URL:** the web (Cloudflare Pages or a VPS) and the service URLs (S4 in the plan) | Team / Track B, E | ◐ 31.10 (web on Vercel: <https://professionar-larpe-rs.vercel.app/>, in the README; service URLs = the hybrid demo publishes no backend) | a working link in the README | HANDOFF §5.3 |
| BL-06 | **Rehearsal with the real services (mainnet):** `npm run infra`, provider, guard, `npm run agents`, `npm run web` on two machines, `?avatar=1` on one. During it, record a real mainnet replay with `/_debug` → "record a replay" | Human + BSV Desktop + sats | ☐ | both screens see the same pool; `apps/web/public/replays/mainnet-<date>.jsonl` committed | HANDOFF §4.5, `apps/relay/README.md` › Demo |
| BL-07 | **Put the security package forward in the pitch:** `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md`, ROADMAP's "How we would use audit credits", finding and fixing F-10 ourselves | Presenter | ☐ | a slide or section in the pitch | HANDOFF §3 |

## P1: security

| ID | Item | Owner | Status | Done when | Reference |
|---|---|---|---|---|---|
| BL-10 | **F-11 (High):** `OP_SIZE <32> OP_EQUALVERIFY` in the BSV HTLC claim branch (before `OP_SHA256`). Required before the Rail goes live | Track D / A | ✅ 31.10 `d734c9c` | script test: a 33-byte preimage is refused; AUDIT F-11 "Fixed" | `packages/core/src/scripts/htlc.ts:22`, AUDIT F-11 |
| BL-11 | **Coop Rail hardening:** F-1 (record the received balance difference, or a token allowlist), F-2 (a safe-transfer wrapper), F-4 (a maker watchdog that broadcasts the refund as soon as it is final; a timeout margin for slow blocks). Learned from validation 4: Arcade refuses at tip = nLockTime; the refund must be sent at least one block after the lock | Track D | ✅ 31.10 `b5d8531` (in code; the live run is BL-13) | AUDIT F-1, F-2, F-4 "Fixed" or a reasoned "Accepted" | AUDIT §6, ROADMAP gate 3 |
| BL-12 | **Validations 3 and 6 on mainnet:** how many approval windows Desktop opens on the first signature; v1 malleability | Track A / D + human | ✅ 31.10 (3: 2 windows, none on the second signature; 6: v1 not malleable, `717d1a4`) | STATUS "Validation tests" ✅ | HANDOFF §2.2 #6 |
| BL-13 | **T8 (market sweep) and T11/T11b (Coop Rail; Base Sepolia deploy) on mainnet** | Track C / D | ◐ T8 ✅ 31.10 (`675c3334…`); T11/T11b waiting for faucet ETH | txid in the README tx table | THREAT-MODEL §3 |
| BL-14 | **F-8:** `live_health.detail` exposes internal URLs and error text to anonymous readers, reduce it to a generic message; validate Town `move` broadcasts (is the sender in presence, are the coordinates numbers) | Supabase layer | ✅ 31.10 `b5d8531` | test + AUDIT F-8 "Fixed" | `apps/relay/src/sources.ts:56`, `apps/web/src/town/multiplayer.ts:76` |
| BL-15 | **T-17:** give the provider a shared, atomic 402 replay store (`createApp({ replayStore })`). Required before running more than one provider process | Track C | ✅ 31.10 `b5d8531` | THREAT-MODEL T-17 current | `apps/provider-api/src/server.ts` |
| BL-16 | **Mutation testing:** `packages/core/src/pool/verify.ts` and the script templates (done for the HTLC, method in HANDOFF §2.4); a change-tampering test for I-2 | Track A | ✅ 31.10 `b5d8531` (49/49, CI `mutation`) | mutants killed; the AUDIT §4 note current | AUDIT I-2, ROADMAP gate 6 |
| BL-17 | **Slither** static analysis of `contracts/base-htlc/HTLC.sol`; add the output to AUDIT §7 | Anyone | ✅ 31.10 `b5d8531` (CI `slither --fail-high`) | report in AUDIT | HANDOFF §2.2 #10 |
| BL-18 | **Dependency triage:** `zod` < 4.6.6 (`@anthropic-ai/sdk`, `viem`), `tmp` (`solc`), `jimp` (`free-tex-packer-core`, dev). Upgrading can change behaviour; test it | Anyone | ✅ 31.10 `b5d8531` (runtime 0; `jimp` dev accepted, AUDIT §7) | `npm audit --omit=dev` 0 high or a reasoned acceptance | AUDIT §7 |
| BL-19 | **RLS test in CI:** `apps/relay/test/schema.local.test.ts` runs only with a local Supabase. Add a Supabase service to CI or a separate job | Supabase layer | ✅ 31.10 `b9c2202` (CI `supabase-rls`) | "anon cannot write" runs in CI | THREAT-MODEL T-22 |
| BL-20 | **The `SUPABASE_SECRET_KEY` GitHub secret:** no workflow uses it. Keep or delete | Repo owner | ✅ 31.10 (kept; the secret is on the GitHub Actions side, not in the repo, `.env`/`.env.*` git-ignored) | decision in STATUS | HANDOFF §4.2 |

## P2: product and cleanup

| ID | Item | Owner | Status | Done when | Reference |
|---|---|---|---|---|---|
| BL-30 | **"My orders":** a `GET /v1/jobs` on the provider listing an identity's jobs and payments, and a web screen showing it. Today the job on `/me` is lost on reload. The user was positive, not started (~1–2 h) | Track C + E | ✅ 31.10 `125b2d8` | jobs listed after a reload; test | HANDOFF §5.2 |
| BL-31 | **`pledge_added` double counting in direct mode:** the reducer adds the credits the coordinator already counted (fixed on the Supabase path) | Track E | ✅ 31.10 `9aec881` | in direct mode the credit total equals the coordinator's; test | HANDOFF §2.3 |
| BL-32 | **Stale STATUS Track E note:** `POST /pledges/lighthouse` shows as "open" but exists (`apps/coordinator/src/api.ts:90`), T5-L was done on mainnet | Track E | ✅ 31.10 `9aec881` | Track E row corrected | HANDOFF §5.4 |
| BL-33 | **Supabase rehearsal observation:** a reloaded page's feed lacks `pool_opened`/`pledge_added` (the state is right, the feed is incomplete); these events are derived on the client and not written to the mirror's history | Supabase layer | ✅ 31.10 `f54fffe` | they show in the feed after a reload | HANDOFF §4.3 |
| BL-34 | **The 19 small items postponed from the Supabase review** (full list in HANDOFF §4.4). First: #2 empty tick, #7 unbounded event queue, #8 SSE idle timeout, #11 the 45 s fallback and hidden tabs | Supabase layer | ✅ 31.10 (#16 open: publishable key on the hosted project; #15 = BL-20) | each item ticked in HANDOFF §4.4 | HANDOFF §4.4 |
| BL-35 | **txid in the guard decision log** (unknown at signing time today; match it after broadcast) | Track D | ✅ 31.10 `8094c8a` | the owner can find every co-signature on chain | AUDIT F-5, ROADMAP |
| BL-36 | **A real provider (SmartRoute)**: a product file + runner. **Try the LLM agent brain live** (`ANTHROPIC_API_KEY`) | Track C | ☐ | a real job, a real LLM decision | FINAL-IDEA §1.2, README › SmartRoute |
| BL-37 | **Provider bond and reputation** (T-5) | Track A / C | ⏸ | THREAT-MODEL T-5 current | ROADMAP gate 4 |
| BL-38 | **K3 (optional):** MCP server, OrdLock listings, period credits, organizer agent, reverse-direction Rail (T-16) | — | ⏸ | — | FINAL-IDEA §10 |

## Operations

| ID | Item | Owner | Status | Reference |
|---|---|---|---|---|
| BL-40 | A local Supabase (Docker) may be running on this session's machine: `supabase stop` | Machine owner | ✅ 31.10 (Docker off on this machine, no local Supabase running) | HANDOFF §8 |
| BL-41 | CI warning: `ubuntu-latest` moves to Ubuntu 26 (from 19.10.2026). If CI turns red, pin `runs-on` | Anyone | ⏸ | `.github/workflows/ci.yml` |
| BL-42 | Move the root `.env` to a new machine by hand (it is not in git); for the Supabase secret, `supabase projects api-keys --project-ref cwnqclojrnyixetjqqsv --reveal` | The person on the new machine | ☐ | HANDOFF §4.2, §6 |

## Done (this session and the parallel session, for reference)

| Item | Commit |
|---|---|
| Supabase live layer (relay, web transport, multiplayer Town) + review fixes | `d942788`, `cffaaee`, `404a164`, `78bfb0e`, `cc02f38` |
| Audit package: AUDIT-READINESS, THREAT-MODEL refresh, SECURITY, LICENSE, ROADMAP, CI, check-docs, HTLC boundary tests | `86bc2fc` … `ad04620` |
| F-10 found and reproduced (this session), fixed (the repo owner's session) | `27c0eab`, `740f893` |
| Validation 4 passed on mainnet | `740f893` |
| Handoff document + rehearsal script in the repo | `6539b56`, `7d5d0ef` |
| F-11 fixed (the Coop Rail claim takes only a 32-byte secret; `test/rail.htlc-preimage.test.ts`) | `d734c9c` |
| Backlog, CLAUDE.md document map | `07feaff`, `02001bc` |
