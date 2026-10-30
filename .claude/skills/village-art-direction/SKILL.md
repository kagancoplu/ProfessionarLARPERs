---
name: village-art-direction
description: Art direction for the AgentCoop Town (apps/web): consistent 16x16 top-down pixel-art village built from the Kenmi Cute Fantasy / LimeZu Serene Village packs plus Pixelbolt / pixel-art-mcp drawn props. Use when adding, editing, placing or reviewing any Town sprite, tile, map layer or UI frame.
---

# Village Art Direction — AgentCoop Town

Target: the look of a cozy farming RPG (Stardew Valley atmosphere, nothing copied). Every asset must sit
in the same scene as the reference packs without looking foreign. `apps/web/DESIGN.md` stays the source of
truth for tokens, type and UI; this skill governs the game canvas and pixel assets.

## Grid, scale, perspective
- Base tile 16×16. Characters 16×32 (one tile wide, two tall). Buildings span whole tiles.
- 3/4 top-down RPG perspective: fronts visible, roofs foreshortened, no isometric or pure orthographic mixing.
- Canvas rendered at 1× in Phaser, camera zoom 3 (integer only). `pixelArt: true`, nearest-neighbor, no
  sub-pixel positions (round every x/y). A half-pixel is a defect.
- Light comes from top-left. Shadows fall bottom-right, 1 tile long max, drawn as semi-transparent dark ellipses
  on a dedicated `shadows` layer.

## Palette
- Primary palette is the one in the Kenmi Cute Fantasy pack; LimeZu Serene Village is the secondary pack and
  may be palette-swapped toward Kenmi when both appear in one scene. Save the merged palette as
  `apps/web/assets/palette.ts` (also exported as `.hex` for Pixelbolt / pixel-art-mcp).
- Every drawn prop is palette-locked: no colour outside the merged palette. Outlines use the darkest step of the
  material's own ramp, never pure black unless the pack does.
- Day/night: night is a tint + Light2D pass in Phaser, never a second asset set.

## Sources, in order of preference
1. Kenmi Cute Fantasy (primary: terrain, market stalls, fences, props, animals, NPCs).
2. LimeZu Serene Village revamped (houses, extra terrain, trees).
3. mem_px Top Down Characters (villagers), Moonforge Characters Base (fallback / idle).
4. Sprout Lands, forchild Village, Kenney Tiny Town / Pixel UI: fallback only, re-coloured to the palette.
5. Props that no pack has (notice board, hourglass, BSV coin, vault chest, guard shield, stall signs):
   draw with Pixelbolt (recipe JSON, kept in `apps/web/assets/recipes/`) or pixel-art-mcp, palette-locked,
   reviewed at 1× and 3× inside the scene before acceptance.
- Raw packs live in `apps/web/assets/packs/` (gitignored, licences forbid redistribution). Only processed
  atlases and the Tiled map ship. Every source gets a row in `apps/web/assets/LICENSES.md` before first use.
- No generative image models. Pixelbolt / pixel-art-mcp are deterministic pixel tools and are allowed.

## Map (Tiled)
- `apps/web/assets/maps/town.tmj`, 40×30 tiles. Layers bottom→top: `ground` (terrain sets / Wang),
  `ground_detail`, `shadows`, `buildings_low`, `props`, `buildings_high` (roofs, above characters), `above`
  (tree crowns, chimney smoke origin). Object layer `spawns`: board, 6 building doors, 6 stall slots, NPC paths.
- Grow the map in this order: paths and ground transitions → buildings → props → detail. A path must read
  as a path from one screen away.
- Water, fire, doors are sprites with Phaser animations, not animated tiles.

## Quality gate (every asset, every map change)
- Check seams: tile the asset 3×3 and look for lines.
- Check scale against a 16×32 villager standing next to it.
- Check perspective and light direction against a Kenmi house.
- Check palette: run the palette audit (`npm -w apps/web run sprites` fails on off-palette colours).
- Screenshot at 1× and 3×; compare side by side with the two reference images in `plan/phases/E-V1.md`.
- Honesty tags ("demo pricing", "simulated GPU jobs", "experimental") stay visible on the canvas overlay.
