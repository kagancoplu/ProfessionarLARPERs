# Demo video script: 0:40 – 2:30 (the product part)

The first 40 seconds are the gamified village scenes. This part follows them: the website, the three features (cross-chain swap, pledge and the failed pool, reselling leftovers), why BSV, and the manifesto. 110 seconds and about 245 words of voice-over, roughly 2.2 words per second, so the narrator has room to breathe.

Recording setup is in [`VIDEO.md`](./VIDEO.md): 1440×900, `?presenter=1`, `?replay=mock-demo` with keys `1`–`5`. Live demo: <https://professionar-larpe-rs.vercel.app/>.

## At a glance

| Time | Beat | Website page | Feature |
|---|---|---|---|
| 0:40 – 0:48 | Behind the village | Town → top bar | 0 sat held |
| 0:48 – 0:56 | The offer | Provider | provider signs once |
| 0:56 – 1:08 | Money from another chain | Metrics → Harbor, Town pond | **swap and cross-chain funding** |
| 1:08 – 1:19 | The pledge | My Agents, Town board | **pledge: the money stays in the wallet** |
| 1:19 – 1:28 | The pool doesn't fill | Pools → failed | **nothing happens** |
| 1:28 – 1:44 | The pool fills | My Agents (sign checks), Town, WhatsOnChain | one transaction |
| 1:44 – 2:03 | Why BSV | motion graphic | **BSV vs Ethereum, the BSV stack** |
| 2:03 – 2:17 | Leftovers | My Agents, Market, Town stalls | **agents resell spare credits** |
| 2:17 – 2:30 | Manifesto | Town wide shot, end card | 0 sat held |

## The script

### 1 · Behind the village (0:40 – 0:48, 8 s)

**Screen:** the camera pulls back from the fountain until the whole browser window is in frame. The cursor passes the top bar (TOWN · POOLS · MARKET · MY AGENTS · PROVIDER · OWNER · EXPLORER · METRICS) and stops on the green **MAINNET** badge, then zooms on the corner counter **Held in custody: 0 sat**.

**On screen:** `Held in custody: 0 sat`

**VO:**
> That village is a real market: AI agents buying GPU time together, on BSV. The money we hold? Zero.

### 2 · The offer (0:48 – 0:56, 8 s)

**Screen:** PROVIDER tab. The provider opens a pool and BSV Desktop asks for approval. Cut to the Town: a new notice goes up on the board with an empty chest under it.

**On screen:** `1,000 GPU-hours · 25 sat/h · retail 50 · deadline` and the `demo pricing` tag.

**VO:**
> A provider posts one bulk deal: a thousand GPU-hours at half price. It signs once, and it can go offline.

### 3 · Money from another chain (0:56 – 1:08, 12 s) · *swap and cross-chain funding*

**Screen:** in the Town, a boat crosses the pond to the **Harbor office**. Cut to METRICS → **Harbor · Coop Rail**. Type `0.50` USDC, click **Ask the maker for a quote**, and **985 sat** appears. Cut back to the Town: the vault chest in front of the agent's house glows. Keep the **EXPERIMENTAL** tag in frame the whole time.

**On screen:** `USDC on Base → BSV · hash-locked atomic swap · no custodian · refund paths on both sides`

**VO:**
> Agents on other chains can join too. Coop Rail, our experimental atomic swap, turns USDC on Base into BSV, straight into the agent's vault.

### 4 · The pledge (1:08 – 1:19, 11 s) · *pledge*

**Screen:** MY AGENTS. The fine-tune agent's thought is readable: *"Retail is 50 sat/h. The board offers 25 sat/h for 1 000 GPU-hours. I need ~300 h this week."* A **pledge** tag appears next to its decision. Cut to the Town: villagers walk to the board and drop coins into the chest while their purses only glow. One speech bubble is readable: *"Pledged 400 credits. … sat reserved, still in my wallet."* The fill bar climbs: 300 → 700 → …

**On screen:** `Pledged ≠ paid. The coin stays in the agent's wallet.`

**VO:**
> Agents pledge: "three hundred hours for me." The money stays in the agent's own wallet. It's only reserved, and the agent can cancel any time.

### 5 · The pool doesn't fill (1:19 – 1:28, 9 s) · *nothing happens*

**Screen:** a second pool on the board. Its deadline runs out with the chest half empty. Cut to POOLS with the **failed** filter: the pool's status turns **FAILED**. The villagers' purses stop glowing: their coins never left.

**On screen:** `Deadline passed · 0 coins moved · 0 refunds`

**VO:**
> If the pool isn't full by the deadline, nothing happens. No coin ever moved, so there's no refund to wait for.

### 6 · The pool fills (1:28 – 1:44, 16 s)

**Screen:** the first pool's chest fills to 1,000 / 1,000. On MY AGENTS, each agent's **sign** decision lists its five checks: *my credits ✓ · my change ✓ · Σ credits = N ✓ · pledge-list hash ✓ · lineage ✓*. (A person sees the same five checks on a sign-request card on the `/me` page and signs in BSV Desktop; that shot works too.) Cut to the Town: the fountain sparkles, one rider crosses the square, and a credit chest lands at every house. The parchment reads **1 transaction · N participants · 0 sat held**. Hard cut to WhatsOnChain showing the real mainnet settlement [`5314ab8b9f…`](https://whatsonchain.com/tx/5314ab8b9fc731c824fd49a0bbb6a69bb0f57ad2fff11dda656d40eb6584a185).

**On screen:** `The coordinator holds no keys and no money.` On the WhatsOnChain cut: `BSV mainnet`.

**VO:**
> When it fills, one transaction does it all: the provider gets paid and every agent gets its credits, in the same instant. Each agent checks it, then signs only its own coin. All of it, or none.

### 7 · Why BSV (1:44 – 2:03, 19 s) · *BSV vs Ethereum, the BSV stack*

**Screen:** a pixel-art split screen with the title card **WHY BSV**.

- **Left, "Ethereum":** 100 agents each send a deposit into one contract, so the coins pile up in a pot. The deal fails and 100 refund arrows fly back, each with its own gas icon.
- **Right, "BSV":** 100 coins stay in 100 wallets, and one transaction pulls them together. When a deal fails, nothing moves.

In the second half, five stack chips drop in one by one: **BSV Desktop (BRC-100)** · **BSV-21 credits** · **overlay** · **SIGHASH SINGLE\|ANYONECANPAY** · **HTTP 402**.

**On screen:** `100 buyers · 1 transaction · 36.5 kB · 3,670 sat fee (in our tests)`

**VO:**
> On Ethereum, every buyer deposits into a contract, and a failed deal means refunds for all. On BSV, there's nothing to deposit and nothing to refund: a hundred buyers in one transaction. All on the BSV stack: BSV Desktop, BSV-21, overlays, HTTP 402.

### 8 · Leftovers (2:03 – 2:17, 14 s) · *agents resell spare credits*

**Screen:** MY AGENTS. The fine-tune agent's bubble says: *"more credits than my jobs need this week"*. Cut to the Town: a sack appears at a market stall. Cut to MARKET, where the listing row reads **100 credits · 3,000 sat · 30.0 vs 50 · 40 %**. The eval agent's bubble says: *"cheaper than retail and than the next pool"*. It sweeps the listing, the stall in the Town empties, and the credits land at its house. Hard cut to the real mainnet sweep on WhatsOnChain: [`675c333414…`](https://whatsonchain.com/tx/675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c).

**On screen:** `Agent → agent · seller can be offline · 1 transaction · lineage checked`

**VO:**
> Bought too much? Agents resell their spare credits at the market stall. The seller signs once and can go offline. Another agent buys them in one transaction, cheaper than retail.

### 9 · Manifesto (2:17 – 2:30, 13 s)

**Screen:** a wide shot of the Town in daylight, with a credit chest at every house. Slow zoom to the **Held in custody: 0 sat** counter, then the end card.

**End card:** AgentCoop · `No deposits. No escrow. No refunds.` · `professionar-larpe-rs.vercel.app` · `Built on BSV`

**VO:**
> Agents shouldn't need a middleman to buy together. On BSV, they don't. Your coins stay yours until the deal is real, and then everything happens at once.

Alternative closing line, from our pitch: *"x402 taught agents how to pay. AgentCoop teaches them to buy together."*

## Full voice-over (for the narrator)

> That village is a real market: AI agents buying GPU time together, on BSV. The money we hold? Zero.
>
> A provider posts one bulk deal: a thousand GPU-hours at half price. It signs once, and it can go offline.
>
> Agents on other chains can join too. Coop Rail, our experimental atomic swap, turns USDC on Base into BSV, straight into the agent's vault.
>
> Agents pledge: "three hundred hours for me." The money stays in the agent's own wallet. It's only reserved, and the agent can cancel any time.
>
> If the pool isn't full by the deadline, nothing happens. No coin ever moved, so there's no refund to wait for.
>
> When it fills, one transaction does it all: the provider gets paid and every agent gets its credits, in the same instant. Each agent checks it, then signs only its own coin. All of it, or none.
>
> On Ethereum, every buyer deposits into a contract, and a failed deal means refunds for all. On BSV, there's nothing to deposit and nothing to refund: a hundred buyers in one transaction. All on the BSV stack: BSV Desktop, BSV-21, overlays, HTTP 402.
>
> Bought too much? Agents resell their spare credits at the market stall. The seller signs once and can go offline. Another agent buys them in one transaction, cheaper than retail.
>
> Agents shouldn't need a middleman to buy together. On BSV, they don't. Your coins stay yours until the deal is real, and then everything happens at once.

## Accuracy notes (read before recording)

- **Coop Rail is experimental.** It runs end to end in our tests (mock chain plus an in-memory EVM), but it has not run on Base or on BSV mainnet ([`docs/RAIL-POC.md`](../../docs/RAIL-POC.md)). That is why the voice-over says "experimental" and the tag stays in frame. Don't show a WhatsOnChain link in beat 3: the mock txids there are not real.
- **The failed pool.** No coin moves, but each pledge pays a small non-refundable registration fee (anti-griefing; 300 sat in the mock). So "no coin moved, no refund" is true, and "it cost nothing" would not be. The app's toast and the Town parchment say *"Nobody lost a satoshi"*, which is not quite true because of that fee. Use the POOLS → failed shot rather than the toast. `?presenter=1` hides toasts anyway.
- **"A hundred buyers in one transaction"** comes from our tests (36.5 kB, 3,670 sat fee). The largest mainnet settlement had 3 participants (2 agents and 1 person). The on-screen line keeps the "in our tests" label.
- **Agents only?** The voice-over says agents resell, and every shot shows agents doing it. The MARKET page also has a **Sell credits** panel that a person with BSV Desktop can use, so saying "only agents" would contradict the site. Keep that panel out of frame.
- **Mock vs. real.** The site's flow is simulated (the **MOCK** badge sits in the top bar); the payments it stands for are real BSV transactions. Each WhatsOnChain cut (beats 6 and 8) is the real proof. Keep the `demo pricing` and `simulated GPU jobs` tags visible wherever they appear.

## Where each shot comes from

| Beat | How to get it |
|---|---|
| 1, 9 | `/` with `?presenter=1`; day/night with `N` |
| 2 | `/provider` (mint → open pool); or `?replay=mock-demo` and key `1` |
| 3 | `/metrics`, Harbor card; the boat crosses about 31 s into the mock cycle |
| 4 | `/agents` and `/`; the agents think and pledge 1.5 – 7.5 s into the cycle |
| 5 | pool B fails about 26.5 s into the cycle; `/pools` → **failed** |
| 6 | `/agents` (sign decisions about 11 s into the cycle) or the `/me` sign card; `?replay=mock-demo`, keys `2` (lock-in) and `3` (settlement) |
| 7 | motion graphic (not in the app) |
| 8 | `/agents`, then `/market` about 23 – 30 s into the cycle; or key `5` in replay |

Mainnet transactions for cut-ins: pool opened [`9118788a77…`](https://whatsonchain.com/tx/9118788a77efb3854878d47c1edb199d03ecbf00ab8e3da32b0a907c8f18c77c), pledge [`00f50d70bd…`](https://whatsonchain.com/tx/00f50d70bd5aa27c5e5333c92462ba9997cb57037ef9101df2c9ec4a0f423aef), settlement [`5314ab8b9f…`](https://whatsonchain.com/tx/5314ab8b9fc731c824fd49a0bbb6a69bb0f57ad2fff11dda656d40eb6584a185), market sweep [`675c333414…`](https://whatsonchain.com/tx/675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c). The full list is in the [README](../../README.md#example-transactions).
