# Setup outside the code: accounts, wallets, services

> Owner: **Track D** (ops). Every row needs someone responsible; fill in the "Who" column.
> Order matters: the **Now** items are the ones that block coding.
> Rule: no key, seed or API key goes into the repo, a chat or a screenshot. All of them go into the shared password vault.

---

## 1. Now (first 30 minutes)

| # | What | Where | What to do | Who | Cost | What it blocks |
|---|---|---|---|---|---|---|
| 1 | **BSV Desktop** ×3 (treasury, owner, human) | <https://desktop.bsvb.tech> | Install on three separate laptops, create a **mainnet** wallet. Write the recovery phrase on paper; do not photograph it or put it in the vault (each member is responsible for their own seed) | | 0 | Every mainnet transaction, requirement B2 |
| 2 | **Telegram** account | Telegram app | To `@lexamaison`: the treasury Desktop address (Payments → Receive → BSV Address) + the team name. Questions for Axel on the same channel (`00-MASTER-PLAN.md §6.4`) | | 0 | Sats (S1) |
| 3 | **Shared password vault** | Bitwarden (free organisation) or 1Password | Open a vault, invite 4 people. Inside: the 7 server wallet keys, the Anthropic key, the Base keys, VPS access | | 0 | Sharing keys safely |
| 4 | **GitHub repo** | github.com | The repo must be **public** (open-source requirement). Add 4 people as collaborators. Add an MIT licence. `main` always stays working. (Note: the GitHub MCP connection is broken in this environment; use the `gh` CLI) | | 0 | Working together, submission |
| 5 | **Hackathon submission platform** | Ask the organisers (TUM Blockchain Club) | Register the team, pick the **BSV track**, learn the submission time and format (repo link, video link, description fields) | | 0 | Submission |
| 6 | **Team channel** | WhatsApp/Discord/Slack | One channel; blockers go here and into `plan/STATUS.md` | | 0 | Coordination |

## 2. Today (first few hours)

| # | What | Where | What to do | Who | Cost |
|---|---|---|---|---|---|
| 7 | **Local development environment** (every laptop) | nodejs.org, git | Node **≥ 22**, git, `npm`. In the starter kit `npm install && npm test` (all 38 tests should be green) | everyone | 0 |
| 8 | **Anthropic API key** (the agent brain) | <https://console.anthropic.com> | Open an organisation, add billing or use hackathon credit if any. **Set a monthly spending limit** (e.g. $20). The key into the vault and into `.env` as `ANTHROPIC_API_KEY`. Without a key the agents run with `AGENT_BRAIN=rules`; nothing stops | | ~$5–20 |
| 9 | **EVM wallet (Coop Rail PoC)** | MetaMask or `cast wallet new` (Foundry) | Two addresses: *maker* and *agent*. Add the Base Sepolia network. Keys into the vault | | 0 |
| 10 | **Base Sepolia ETH (gas)** | Coinbase Developer Platform faucet, Alchemy or QuickNode Base Sepolia faucet | A small amount of ETH to both addresses. Some faucets need a login or a mainnet balance; if one fails, try another | | 0 |
| 11 | **Base Sepolia USDC** | <https://faucet.circle.com> (choose Base Sepolia) | Test USDC to the *agent* address. If it fails, the plan deploys our own mock ERC-20 | | 0 |
| 12 | **Base RPC** | Public `https://sepolia.base.org` or a free Alchemy/Infura account | The public RPC is enough; open an Alchemy account if it rate-limits | | 0 |
| 13 | **Foundry** (contract tests/deploy) | <https://getfoundry.sh> | Install on D's laptop (`forge`, `cast`) | D | 0 |
| 14 | **BaseScan API key** (optional) | a <https://basescan.org> account | For contract verification. Shows the jury readable source code | | 0 |

## 3. Infrastructure (around S2–S3; needed for the extension phases)

| # | What | Where | What to do | Who | Cost |
|---|---|---|---|---|---|
| 15 | **VPS** (overlay + coordinator + provider API + guard running publicly) | Hetzner, DigitalOcean, Fly.io or Railway | 2 vCPU / 4 GB is enough. Node 22, persistent disk (`data/`). `npm run infra` on one machine. Needs a credit card | | ~€5–10/month |
| 16 | **Domain** | Cloudflare Registrar or Namecheap | E.g. `agentcoop.xyz`. Subdomains: `overlay.`, `coop.`, `provider.`, `guard.`. **Important:** BSV Desktop apps need a canonical DNS hostname as originator; a real domain is the right choice for `APP_ORIGINATOR` too | | ~$2–12/year |
| 17 | **HTTPS** | Caddy (automatic Let's Encrypt) or the Cloudflare proxy | Overlay and APIs behind HTTPS (guide §16.4). CORS for browser access | | 0 |
| 18 | **WhatsOnChain API key** (optional) | <https://developers.whatsonchain.com> | Free tier; to avoid 429s in the `verifyLineage` fallback. The primary source is Arcade, no key needed | | 0 |
| 19 | **Base mainnet ETH** (gas; only for the phase 5 A path) | Withdraw from Coinbase or an exchange **to the Base network** | ~$1 of ETH each to the *maker* and *agent* EVM addresses. The HTLC deploy + 2 swaps cost a few cents; the rest is a buffer | | ~$2 |
| 20 | **Base mainnet USDC** (only for the phase 5 A path) | Coinbase → Base network (a direct Base withdrawal, not a bridge) | $2 USDC to the *agent* address, $2 to the *maker* address (one swap in each direction). A ≤ $0.50 trial first | | ~$4 |
| 21 | **Claude Desktop or Claude Code** (phase 7 MCP demo) | <https://claude.ai/download> | Installed on one member's machine; the `mcpServers` configuration in the README | | 0 |
| 22 | **Cloudflare Pages** (frontend hosting; Track E) | <https://pages.cloudflare.com> | Free account; connect the GitHub repo (`apps/web`, build `npm -w apps/web run build`, output `apps/web/dist`); `VITE_*` env with B's public URLs. With a domain, an `app.<domain>` CNAME | E | 0 |
| 23 | **Tiled** (map editor; Track E) | <https://www.mapeditor.org> | Install on E's laptop; maps as JSON in `apps/web/src/town/map/` | E | 0 (donation optional) |
| 24 | **CC0 asset packs** (Track E) | kenney.nl, itch.io (check each licence) | Each downloaded pack's licence into `apps/web/assets/LICENSES.md` | E | 0 |

## 4. Things that need no account but are worth knowing

| Service | Status |
|---|---|
| **Arcade** (broadcast, headers) | No key. Mainnet `https://arcade-v2-us-1.bsvblockchain.tech` |
| **MessageBox** | Default public host `https://message-box-us-1.bsvb.tech`, no account |
| **BananaBlocks** | No account. Our credit token is listed as "Discovered" automatically. Making it "Verified" costs **1,000 sat / token output**; optional, decide |
| **BSV Browser (mobile)** | <https://mobile.bsvb.tech>. Not required; good to have on one member's phone for mobile testing during the frontend phase |
| **bOpen Claude Code plugins** | Optional (`bsv-skills`, `1sat`, `bsv-mcp`); not maintained by BSVA |

## 5. Money flow summary

- **BSV:** one source, `desktop-treasury` (the sats BSVA sent). Distributed with `scripts/fund.ts` (`00-MASTER-PLAN.md §6`). Target total ≈ 300k sat; ask for +250k sat for the 50-agent scale test in the extension phases (~5k per agent).
- **USD spending:** Anthropic (~$5–20), VPS (~€5–10), domain (~$2–12), Base mainnet ETH + USDC (~$6, only for the phase 5 A path). Total < $60. Decide today whose card pays.
- **Testnet assets:** Base Sepolia ETH and USDC are free (faucets).

## 6. Checklist (copy into STATUS.md)

- [ ] 3× BSV Desktop on mainnet installed, seeds offline
- [ ] Address sent to `@lexamaison` · sats arrived (amount: …)
- [ ] Questions sent to Axel · answers in STATUS
- [ ] Password vault set up, 4 people in it
- [ ] Public GitHub repo, 4 collaborators, MIT licence
- [ ] Registered on the hackathon platform + BSV track + submission time known
- [ ] Node 22 + kit tests green for everyone
- [ ] Anthropic key + spending limit
- [ ] 2 EVM addresses + Sepolia ETH + Sepolia USDC
- [ ] Foundry installed (D)
- [ ] VPS + domain + HTTPS (by S2)
- [ ] Card holder for USD spending decided
- [ ] (Phase 5 A path) Base mainnet ETH + USDC on the maker and agent addresses
- [ ] (Phase 7) Claude Desktop/Code installed on one member's machine
- [ ] (Track E) Cloudflare Pages account + repo connected; Tiled installed
