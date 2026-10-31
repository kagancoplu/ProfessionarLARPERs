# E-V1 — Visual rebuild (interim phase, before phase 3)

Status: **implemented (30.10, `main`)** — checkpoint below. Decision (user): characters and buildings from Kenmi only; LimeZu only for missing pieces; Kenmi Premium, mem_px, Sprout Lands bought/downloaded (mem_px and Sprout not used, style clash). Phase 3 starts on top of this checkpoint.

## Why

In phases 0–2 the town was made entirely of code-drawn sprites (21 sprites, 16×16). The result is far behind the
reference images (a Stardew/LimeZu "Serene Village" style village, a market stall pack). The quality gap comes not from
the library but from the **assets and the mapping**: a hand-drawn tileset + a layered map (ground / detail / shadow / top) +
depth-sorted characters + real 9-slice UI frames. Phaser 3.90 is enough for this; what changes is the sources and the
pipeline.

## Research: what is used (Stardew-like 2D top-down)

### Engine / runtime (already there, stays)
- **Phaser 3.90** — Tiled JSON loading (`tilemapTiledJSON`), layers, camera zoom,
  y-sorting with `setDepth(y)`, day/night with tint, smoke, leaves, water with particles/tweens.
- **Animated tiles**: Phaser does not natively support Tiled tile animation →
  `phaser-animated-tiles-phaser3.5` (the nkholski fork; works with 3.5+) **or** placing animated objects such as
  water/fire as sprites and keeping the tilemap static (suggestion: the latter, no dependency, full control).
- **Light**: Phaser's built-in Light2D (WebGL) is enough for the night scene; the "lighting-2d"
  package belongs to Phaser AE, not needed. Shadows: a separate semi-transparent "shadow" layer
  (ellipse/offset shadows under buildings and trees) — a typical pixel-game technique.

### Map editor
- **Tiled 1.11** (free, macOS `brew install --cask tiled`): automatic edge/corner tiles with Terrain Sets (Wang)
  (grass→dirt→road), object layers (building doors, NPC points, market stall slots), JSON export → Phaser. The LDtk
  alternative offers better rule-based autotiling but needs an extra loader on the Phaser side. **Choice: Tiled.**

### Pixel editor
- **Aseprite** ($20, source can be compiled) or **Pixelorama** (free, MIT). To combine packs and adapt the colour
  palette, draw new props (notice board, hourglass, BSV icon) and cut 4-direction walks. The existing
  `tools/sprites.mjs` (sharp + free-tex-packer) keeps producing atlases; now packing from PNG sources instead of code drawings.

### Asset packs (licences checked on their pages)

| Role | Pack | Licence | Price | Note |
|---|---|---|---|---|
| **Main tileset + 24 houses** | LimeZu **Serene Village – revamped** [16×16] | **CC BY 4.0** (attribution required) | free | Closest to reference image 2. Ground, trees, rocks, mushrooms, props, 24 houses, animated doors/campfire. No characters (those are in Modern Interiors). |
| **Market stalls, fences, plants, animals, NPCs** | Kenmi **Cute Fantasy RPG** | Free tier **non-commercial**; Premium ≥ $3.99 commercial OK, no redistribution | $3.99 | Closest to reference image 3. Premium: houses, fences, market stalls, torches/lanterns, 11 animals, 8 NPCs, animated water. **We do not use the free tier** (a hackathon project may not count as commercial, but let us not take the risk). |
| **Characters (50 villagers, 16×32, 4-direction walk)** | mem_px **Top Down Characters** | commercial OK, no redistribution, "no generative AI" | $3 | Variety for agents/participants. |
| **Character fallback (3 people, idle+walk 4 directions)** | Moonforge **PixelArt Characters Base** | personal+commercial OK, attribution optional | free | If mem_px is not bought, or for the idle animation. |
| **UI frames (9-slice, parchment/wood)** | **Kenney Pixel UI Pack** | CC0 | free | Signboard/Scroll/Drawer frames, buttons, icons. Compatible with DESIGN.md's 0-radius/hard-shadow rule. |
| **Extra ground/cliff/farm autotiles** | Kenney **Tiny Town** (16×16) | CC0 | free | Backup fill; the style is plainer than LimeZu, care when mixing. |

Rejected: the freezepops bundle (no licence on the page, **AI-assisted**), the gegx UI kit
(AI-assisted), Sprout Lands (48 px, scale mismatch; the free tier is non-commercial),
the forchild CC0 village (too plain), Smallburg (contradictory licence text).

The AI raster ban stays: every chosen pack is declared "no generative AI" or hand-drawn.

### Total cost
$3.99 (Kenmi Premium) + $3 (mem_px) = **~$7**. It works without Kenmi too (LimeZu + Kenney +
Moonforge, all free), but then the market stalls and animals would be our own drawings.

## E-V1 implementation plan

1. **Setup** — the packs under `apps/web/assets/packs/<name>/` (the raw zip contents; not like
   `data/`: licensed redistributable files go into the repo, but Kenmi/mem_px say "no redistribution", so **only the
   processed atlas** is committed, the raw packs in `.gitignore`). An attribution row per pack in `LICENSES.md`.
   `brew install --cask tiled`.
2. **Palette fit** — the LimeZu palette is tied to the DESIGN.md tokens (day/night tints derived from the LimeZu
   grass/roof colours). Kenmi and the character packs are palette-swapped closer to LimeZu if needed (Pixelorama).
3. **Map** — `town.tmj` in Tiled: layers `ground` (Wang terrain: grass, dirt road,
   stone square, water edge), `ground_detail` (flowers, gravel, roots), `shadows`,
   `buildings_low` / `buildings_high` (roofs above the characters), `props`, `above`,
   object layer `spawns` (board, 6 building doors, market stall slots ×6, NPC paths).
   Size 40×30, camera 3× zoom (16 px → 48 px on screen).
4. **Phaser** — `TownScene` again: tilemap loading, a y-sorted sprite group, door animation at the
   building doors, chimney smoke particles, water/fire sprite animation, night
   mode (tint + lantern Light2D). Buildings are no longer code drawings; the pool/provider/vault/market/
   guard/board positions move from `town.json` to the object layer.
5. **Characters** — `Villager` 16×32 4-direction walk + idle; stopping in front of a market stall,
   looking at the board; agent identity by hat/colour variant.
6. **UI** — Signboard/Scroll/Drawer/PixelButton move to Kenney 9-slice; pixel icons
   (coin, sack, hourglass, shield) from Kenney or LimeZu, the code-drawn ones retired.
7. **Quality gate** — `/design-review` (anti-slop), side-by-side screenshots with the reference images,
   a pixel-alignment check at 1× / 3× (no half pixels), e2e 4/4,
   `npm test` green. The honesty labels stay in place.
8. **Checkpoint** → STATUS Track E → phase 3.

Phase 3 (owner console + guard, market) builds on top of this phase; the Town v2 work moved here from phase 3.

## Open decisions (user)
- [ ] Buy Kenmi Cute Fantasy **Premium** ($3.99)? (market stalls + animals)
- [ ] Buy the 50 mem_px characters ($3), or are Moonforge's 3 free characters enough?
- [ ] Aseprite ($20) or Pixelorama (free)?
- [ ] Raw packs locally in `apps/web/assets/packs/` (gitignore) — accepted?

## Checkpoint (30.10, commits `9a156c2` + E-V1 part 2)

**Pipeline** (`apps/web/tools/`): `packs/` (`npm run packs`) turns the raw packs (`assets/packs/`, gitignore) into
`public/game/` atlases — `terrain/` 47-piece blob tilesets (from Kenmi's 3×3+2×2 autotile blocks, 8×8 quarter
merging + 13 full-tile matches; water 8 frames), `town.{png,json}` 249 prop/building frames (trimmed), `chars.{png,json}`
26 characters (8 ready NPCs, 12 modular villagers, a horse, 5 animals), 810 frames. `town-map.mjs` (`npm run map`) writes a
Tiled-compatible `public/game/map.json` from `src/town/map/{terrain,places}.ts` (ground + decor layers, farm fence/soil,
object layer). `ui.mjs` (`npm run ui`) `public/ui/`: a 30-icon strip (23 Kenmi + 7 drawn: hourglass, shield, board,
chest, coin, sack, villager) and 9-slice frames (wood, parchment day/night, gold/parchment/danger buttons + pressed,
Town labels).

**Town** (`src/town/`): `TownScene` from scratch — tilemap (11 tilesets), every object `depth = y`, animated water (a
tileset image cycle), fountain, lantern, banner, campfire, chimney smoke; night: a multiply layer + lantern and window
lights (a `glow` canvas texture); camera 2×–4× integers, dragging. `Villager` 3 directions idle/walk, `Animal` (chicken ×3,
sheep, cow, duck ×3 swimming), `Building/House/Workshop` (blacksmith), the Coop building, `Board` (a hanging sign + a gold
chest fill + a lantern during the signing round), the settlement rides across on a horse, a fountain instead of the bell.
DOM labels `town-label` 9-slice.

**UI** (`src/ui/`): `Signboard` wood frame, `Scroll`/`Toast`/`ErrorState` parchment frame, `Drawer` wood,
`PixelButton` 9-slice buttons (a pressed-state image), `PxIcon` (`<Sprite>` and the code-drawn sprite pipeline retired:
`assets/sprites`, `palette.ts`, `tools/sprites.mjs`, `tools/px.mjs`, `public/game/atlas.*`, `ground.png`).

**Verification:** typecheck clean, web vitest 50/50, Playwright 4/4 (smoke uses the Town canvas instead of `atlas-status`),
day/night screenshots at 2×/3× (plaza, farm, pond, houses), `/pools` and `/_kit` day/night.

**Known gaps / next:** Kenmi has no coin → the `coin` icon is a drawing (the BSV mark to be improved with Pixelbolt);
the villager "purse" icon is gold ore; the full `/design-review` browser loop not run (checklist by hand); the wood
frame is the same in night mode (design decision); `map.json` is a generated file for hand editing in Tiled (sources
`terrain.ts`/`places.ts`); Town v2 work moved to P3: the gatekeeper NPC and the vault animation (Coop building), the
stranger/injection scene, sellers at the stalls.
