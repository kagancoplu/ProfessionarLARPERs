# Design System — AgentCoop web (`apps/web`)

Source of truth for every visual decision in the frontend. Written 2026-10-30 by Track E with `/design-consultation`
(autonomous run: the user was away, so the choices below were made by the designer-agent and are listed in
"Decisions made without user confirmation" for review). the anti-slop rules of the frontend plan (§6.3 of `docs/archive/hackathon-2026/plan/track-E-frontend.md`) are binding;
every `/design-review` finding that departs from this file is a bug.

## Product context
- **What this is:** AgentCoop, non-custodial group buying for AI agents on BSV. A provider opens a pool of GPU-hour
  credits, agents and humans pledge from their own wallets, one atomic settlement transaction pays the provider and
  delivers the credits. Two layers over one store: role **consoles** (provider, agent owner, human participant,
  observer/jury) and the **Town**, a pixel-art village that shows the same data live.
- **Who it's for:** hackathon jury (BSV Association), developers running agents, a human with BSV Desktop who wants
  to join a pool. Desktop browsers only.
- **Space:** DeFi rails for agentic payments. Peers converge on dark SaaS dashboards with blue/purple gradients and
  glassy cards. We do not.
- **Project type:** web app (consoles) + game canvas (Town).

## The one thing to remember
> "Nobody held anyone's money for a second." A village square where agents pool money without a middleman.
> The Town makes a financial protocol legible; the consoles make it operable. Every screen should read as a
> **cooperative's ledger book on a market-town table**, not as a trading terminal.

## Aesthetic direction
- **Direction:** Pixel village ledger. Retro pixel grid discipline (integer scale, crisp edges) + organic warm
  materials (parchment, wood, grass, gold). Stardew Valley is atmosphere reference only; nothing is copied.
- **Decoration level:** intentional. Hard 2 px frames, 9-slice signboards, a faint 1-bit dither on large parchment
  surfaces, pixel icons drawn in code. No glow, no blur, no glassmorphism, no gradients (a two-step dither is the
  only "gradient" allowed, and only in the Town sky).
- **Mood:** calm, sturdy, a little playful. Money is serious; the village is friendly. The guard, the bell and the
  signboard are the recurring characters.
- **Differentiation (deliberate risks):**
  1. Parchment, not white or near-black, as the page surface. Costs: lower contrast ceiling, so text is near-black
     warm brown and small text is never lighter than `--ink-muted`.
  2. Square corners and hard 2 px offset shadows everywhere, including inputs and toasts. Costs: nothing may look
     "soft"; a rounded element is a defect.
  3. VT323 (a terminal pixel face) for sats counters, identity keys and txids at 18 px and up. Costs: never below
     16 px, never for paragraphs.
- **Safe choices (category baseline):** 16 px humanist sans body, left-aligned text, right-aligned numbers in
  tables, visible focus rings, conventional top navigation, one accent for actions.

## Typography (three families, no more)
| Role | Font | Why |
|---|---|---|
| Display, headings, nav labels, button labels, tags | **Pixelify Sans** (OFL, `@fontsource/pixelify-sans`) | pixel identity that stays legible at 14–32 px; not Press Start 2P (unreadable in UI) |
| Body, forms, tables, drawers, "Under the hood" lines | **IBM Plex Sans** (OFL, `@fontsource/ibm-plex-sans`) | sturdy, slightly mechanical ledger feel, excellent tabular numerals, pairs with pixel faces; it is neither Inter nor a trend font |
| Counters, sats amounts ≥ 18 px, identity keys, txids, outpoints | **VT323** (OFL, `@fontsource/vt323`) | monospace pixel terminal; reads as "ledger digits"; tabular by nature |

- **Never:** Inter, Roboto, Arial, Helvetica, system-ui, Space Grotesk, Silkscreen (jury site), Press Start 2P for
  anything but a 1-word logo mark, Courier New.
- **Loading:** self-hosted from the fontsource packages (`weight 400/500/600/700` for Plex, 400 for VT323,
  400/500/700 for Pixelify). No Google Fonts CDN (CSP: everything ships in the bundle).
- **Scale (px / line-height):** body 16/24 · small 14/20 (tables, captions; never below 14) · h3 20/28 Pixelify 500 ·
  h2 24/32 Pixelify 500 · h1 32/40 Pixelify 700 · label 14/20 Pixelify 500 uppercase 0.04em · counter-s 24/24 VT323 ·
  counter-m 40/40 VT323 · counter-l 64/64 VT323 · mono 18/24 VT323 (keys, txids).
- **Numbers:** `font-variant-numeric: tabular-nums` on every number in Plex; sats formatted with thin-space
  thousands separators (`25 000 sat`); credits as integers; euro equivalents in parentheses and always tagged
  "demo pricing".

## Color (warm village palette; day and night share token names)
- **Approach:** balanced. Parchment and wood are the neutrals, gold is the single action accent, grass/danger/sky
  are semantic. Color is never decorative.

| Token | Day | Night | Use |
|---|---|---|---|
| `--surface` | `#F3E6C8` parchment | `#161C22` night sky | page background |
| `--surface-2` | `#FBF3DF` light parchment | `#222B35` | cards, drawers, table rows |
| `--surface-3` | `#E7D6AE` worn parchment | `#2D3842` | hover rows, inset wells, disabled |
| `--ink` | `#2A1E14` | `#F1E7D0` | text, borders of primary elements |
| `--ink-muted` | `#6B5A48` | `#B4A68E` | secondary text, captions (never lighter) |
| `--wood` | `#7A4A1F` | `#A8703A` | frames, top bar, signboard posts |
| `--wood-dark` | `#4E2E12` | `#6B4420` | frame shadow, pressed state |
| `--wood-light` | `#B98650` | `#C9955E` | frame highlight |
| `--gold` | `#E0A526` | `#F2BE45` | primary action, sats, coins |
| `--gold-dark` | `#9C6B10` | `#B98A1E` | primary pressed, counter text on parchment |
| `--grass` | `#5E9E3E` | `#7FC25A` | success, `ok` badges, settled |
| `--grass-dark` | `#3C6E2A` | `#4E8C34` | success text on parchment |
| `--danger` | `#C8402E` | `#E85D47` | refusal (guard 403), errors, failed pool |
| `--danger-dark` | `#8C2418` | `#B23A28` | error text |
| `--sky` | `#7EC8E3` | `#9FD8F0` | info, water, links on night |
| `--water` | `#3F7FB5` | `#5FA0D6` | links on day, Rail/harbor |
| `--warn` | `#D97B21` | `#F09A3E` | warnings, countdowns under 20 s, "locking" |

- **Semantic aliases:** `--ok: var(--grass)`, `--error: var(--danger)`, `--info: var(--water)`, `--accent: var(--gold)`.
- **Contrast rules:** body text uses `--ink` on `--surface`/`--surface-2` (≥ 10:1). `--ink-muted` on `--surface`
  is ≥ 4.6:1. Gold is never used for text smaller than 18 px; on gold backgrounds text is `--ink`.
- **Night mode:** same tokens, "lantern" palette: dark blue-gray surfaces (no violet, no purple), warmer accents
  +10 % lightness. Follows `prefers-color-scheme` and the settings toggle; the Town switches to its night tiles.
- **Hex values live only in `src/ui/tokens.css`** (Tailwind `@theme`) and `assets/palette.ts` (sprites). Components
  use tokens.

## Spacing and layout
- **Base unit:** 4 px. Scale: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48 16=64`. Nothing off-scale.
- **Density:** comfortable in consoles (16 px cell padding), compact in tables (8×12) and the "Under the hood" panel.
- **Layout:** grid-disciplined. Top bar 56 px (wood). Content max width 1280 px, 24 px gutters. Town is full-bleed
  below the bar; drawers open from the right at 440 px. Two-column console pages: 2fr content / 1fr "Under the hood".
- **Corners:** 0 px everywhere. Pixel notch (1 px cut corners) only on Signboard and Scroll via `clip-path`.
- **Borders:** 2 px solid `--wood` (frames) or `--ink` (inputs, buttons). Dividers 1 px `--surface-3`.
- **Shadows:** hard offset only: `2px 2px 0 var(--wood-dark)` on cards, `3px 3px 0 var(--ink)` on modals,
  `1px 1px 0 var(--ink)` on buttons; pressed = translate(1px,1px) + shadow 1px. No blur radius, ever.
- **Narrow screens (< 1024 px):** a signboard says "Open AgentCoop on a desktop browser"; nothing else is adapted.

## Motion
- **Approach:** intentional. Every animation narrates an event (coin into sack, bell, guard "!"); UI transitions
  only aid comprehension.
- **UI durations:** micro 80 ms (hover), short 160 ms (drawer, toast), medium 240 ms (modal). Easing `steps(4)` for
  pixel-feel reveals, `ease-out` for drawers.
- **Town:** tween durations divided by replay speed; animations are interruptible and queued; large scenes
  (settlement) wait for the queue.
- **Reduced motion:** `prefers-reduced-motion` → no steps animations, drawers appear instantly, Town big scenes cut
  to their final frame.

## Components (`src/ui/`)
| Component | Rules |
|---|---|
| `Signboard` | the card: `--surface-2` inside the wooden 9-slice frame (`public/ui/frame-wood.png`, 8 px slices at 2×), hard shadow, optional title plate (Pixelify, `--wood-dark` bg, parchment text) |
| `Scroll` | the modal/dialog: parchment 9-slice frame (`frame-parchment`, day/night variants), 3 px ink shadow, wood bands top/bottom; used for every confirmation ("what, how many sats, which address → Approve in BSV Desktop → txid") |
| `PixelButton` | 9-slice pixel buttons (`btn9-gold`, `btn9-parchment`, `btn9-danger`: 4 px slices at 2×, bevel light top / dark bottom; pressed swaps to the `-pressed` image), `ghost` is flat; states hover (brightness), active (offset + pressed image), disabled (muted, grayscale, no shadow), loading (hourglass icon blinks in steps, label stays) |
| `Counter` | VT323 digits, sizes s/m/l, unit in Pixelify 14 px; animates by stepping digits (no easing blur) |
| `Timer` | Counter + 1-bit ring; turns `--warn` under 20 s, `--danger` under 5 s |
| `TxLink` | VT323 `ab12…cd34` + WhatsOnChain link icon; `mock_` ids show a `MOCK` tag and no link |
| `IdentityChip` | VT323 short key + role color dot + copy; full key in tooltip |
| `Tag` | Pixelify 12/16 uppercase; honesty tags are fixed: `demo pricing` (warn), `simulated GPU jobs` (sky), `experimental` (danger outline), `MOCK` / `LIVE` / `REPLAY` (mode) |
| `ServiceBadge` | 8 px square light + service name; green/red/gray |
| `Drawer` | right, 440 px, wooden 9-slice frame, title plate, close `Esc`; one at a time |
| `Toast` | bottom-right stack, signboard mini, 5 s, pause on hover |
| `EmptyState` | a pixel sprite (empty board, idle villager) + one concrete sentence + one action; never "No data" |
| `LoadingState` | hourglass sprite, "Reading the overlay…" style copy naming the service |
| `ErrorState` | which service, what happened in plain words, "Retry" button; Desktop errors translated by `wallet/errors.ts` |
| `PxIcon` | 16 px icon from `public/ui/icons.png` (Kenmi Cute Fantasy icons + a few drawn in the same cream-rim/black-line style), `image-rendering: pixelated`, integer zoom only |

- **Every interactive element** has hover, `:focus-visible` (2 px `--gold` outline, 2 px offset), disabled and
  loading states.
- **Forms:** labels above inputs (Pixelify label), inputs Plex 16 px on `--surface-2` with 2 px ink border,
  helper text `--ink-muted` 14 px, errors `--danger-dark` with a 1 px danger border.
- **Tables:** header Pixelify 12 px uppercase on `--surface-3`, rows 40 px, numbers right-aligned tabular, hover
  `--surface-3`, selected row 2 px `--gold` left bar.

## Town art (E-V1)
- **Source:** Kenmi *Cute Fantasy* (Premium) for terrain, buildings, props, NPCs, animals and icons. No other pack is
  mixed in; missing pieces are drawn in Kenmi's style (dark plum outline `#3f2832`, cream rim `#f9e6cf` on icons,
  wood `#91533b`/`#b86f50`). Rules in `.claude/skills/village-art-direction/SKILL.md`.
- **Grid:** 16 px tiles, 64 px character cells (chibi), buildings whole tiles; 3/4 top-down; light from top-left.
- **Rendering:** Phaser `pixelArt`, integer camera zoom 2–4, `depth = y` for everything that stands, animated water by
  tileset frame swap, night = multiply overlay + additive lantern/window glows.
- **Labels:** HTML in the Phaser DOM layer, `town-label` 9-slice (3 px slices at 1× world px), Pixelify 6–7 px.

## Voice and copy
- Concrete and product-specific: "Festival in 3 days · 600/1000 credits", "Guard refused: maxPerPoolSats exceeded
  (6,000 > 5,000)", "Nothing was sent", "1 transaction · 4 participants · 0 sat held by anyone".
- No marketing voice ("Seamless", "Unlock", "Revolutionize"), no "Welcome to", no lorem ipsum, no emoji as icons.
- Honesty tags are always visible where they apply: pool discounts (`demo pricing`), jobs (`simulated GPU jobs`),
  Rail (`experimental`).
- "Under the hood" lines: one human sentence + protocol stamp (`BRC-29`, `AtomicBEEF`, `SPV`, `SINGLE|ACP`, `ALL`,
  `2-of-2`, `internalizeAction`, `0-conf`) + measured ms + link.

## Town (Phaser) visual rules
- 16×16 tiles, 3× scale (48 px), `pixelArt: true`, `roundPixels: true`, `antialias: false`; camera zoom 2×–4× integer.
- Sprites come from `assets/sprites/*.ts` matrices using only `assets/palette.ts` colors (same hexes as the tokens
  above plus the tile palette). Kenney Tiny Town CC0 tiles are palette-aligned with `tools/px.mjs`.
- Night: tile palette swap + window lights; sky uses a two-step dither, never a gradient.
- Text in the Town: Pixelify Sans via DOM overlay (React), not canvas text, so it stays crisp and selectable.

## Decisions made without user confirmation (review these)
| Decision | Alternative considered | Why this one |
|---|---|---|
| Body font IBM Plex Sans | Atkinson Hyperlegible, Fira Sans, Source Sans 3 | ledger/technical character, best tabular numerals, distinct from the jury site (Inter) and from AI-default fonts |
| Three families only (VT323 also serves as the mono face) | add IBM Plex Mono for keys | four families fail the design checklist; VT323 at 18 px is readable for short keys |
| Parchment page background | white/near-black | the memorable thing is a village ledger; white reads as SaaS |
| Night palette blue-gray, not brown | darker parchment | a "lantern" night reads as night in the Town; brown-on-brown at night loses hierarchy |
| 0 px radius everywhere | 2 px radius | square is the pixel grid; one rule, no exceptions, easy to review |

## Decisions log
| Date | Decision | Rationale |
|---|---|---|
| 2026-10-30 | Initial design system | `/design-consultation` (autonomous) from FINAL-IDEA §3/§11, track-E §4–§6, jury weights (adoption 35 %, presentation 10 %) |
