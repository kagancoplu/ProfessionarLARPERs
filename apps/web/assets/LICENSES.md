# Asset licences — apps/web

Every visual and audio asset shipped by the frontend, with its origin (track-E §6.1). Anything not in
this table does not ship. "Hand / AI / code" says how the asset was made; no AI-generated raster image
is used (track-E §6.2).

| File(s) | Source | Licence | Hand / AI / code | Changes |
|---|---|---|---|---|
| `public/game/terrain/*.png`, `public/game/town.{png,json}`, `public/game/chars.{png,json}`, `public/game/map.json` | built by `tools/packs` + `tools/town-map.mjs` from Kenmi *Cute Fantasy* (below) | Kenmi Premium licence (derived, processed atlases only; raw pack not in the repo) | hand (Kenmi) | blob tilesets composed from the pack's autotile blocks; frames trimmed and packed |
| `public/ui/icons.png` (23 Kenmi icons + 7 drawn: hourglass, shield, board, chest, coin, sack, villager), `public/ui/frame-*.png`, `btn-*.png`, `label*.png` | `tools/ui.mjs` (Track E; drawn pieces are palette matrices in the script, Kenmi's outline style and colours) | Kenmi icons: Kenmi Premium licence; drawn pieces: project (MIT with the repo) | hand (Kenmi) / code (drawn) | — |
| `public/favicon.svg` | Track E (code) | project | code | — |
| Fonts: Pixelify Sans, VT323, IBM Plex Sans (`@fontsource/*` packages) | Google Fonts via fontsource | SIL Open Font License 1.1 | — | subset by fontsource, self-hosted |
| Kenmi *Cute Fantasy RPG* (`assets/packs/kenmi-cute-fantasy/`, raw, gitignored) — **primary pack** | https://kenmi-art.itch.io/cute-fantasy-rpg | Free tier: non-commercial, credit Kenmi; Premium (≥ $3.99): commercial OK. No redistribution, even modified → only processed atlases ship. **Demo use agreed by the user 2026-10-30; buy Premium before any commercial release.** | hand (no generative AI) | primary art for the Town and UI icons (E-V1); rebuild with `npm -w apps/web run packs` |
| LimeZu *Serene Village – revamped* (`assets/packs/limezu-serene-village/`) | https://limezu.itch.io/serenevillagerevamped | CC BY 4.0 — credit "LimeZu" | hand | **not used yet** (only if a piece is missing from Kenmi) |
| mem_px *Top Down Characters* (`assets/packs/mempx-characters/`) | https://mem-px.itch.io/top-down-characters | $3, commercial OK, no redistribution ("no generative AI") | hand | **not used** (style clash with Kenmi's chibi NPCs; kept as reference) |
| Moonforge *PixelArt Characters Base* (`assets/packs/moonforge-characters/`) | https://moonforgestudios.itch.io/pixelart-characters-base | personal + commercial OK, credit appreciated, no redistribution | hand | fallback / idle frames |
| Cup Nooble *Sprout Lands* (`assets/packs/sprout-lands/`) | https://cupnooble.itch.io/sprout-lands-asset-pack | Basic: non-commercial; Premium ($3.99): commercial. Demo use agreed by the user. | hand | **not used** (fallback only) |
| forchild *Village Tileset* (`assets/packs/forchild-village/`) | https://forchild.itch.io/village-tileset | CC0 | hand | **not used** (fallback only) |
| Kenney *Tiny Town*, *Pixel UI Pack* (`assets/packs/kenney/`) | https://kenney.nl/assets/tiny-town · https://kenney.nl/assets/pixel-ui-pack | CC0 1.0 (credited anyway) | hand (Kenney) | **not used**; UI frames are drawn in `tools/ui.mjs` |
| Drawn props (`assets/recipes/*.pixel.json` → atlas) | Track E with Pixelbolt / pixel-art-mcp (deterministic pixel tools, MIT) | project | code (palette-locked tools, no image model) | notice board, hourglass, BSV coin, vault chest, guard shield, stall signs |
| Sounds (planned, P4): Kenney *RPG Audio* / *Interface Sounds* | https://kenney.nl | CC0 1.0 | hand | not downloaded yet |

Not used, on purpose: bsvmunich.com sprites/scenes/code (no licence; reference only, track-E §6.4),
Stardew Valley assets (atmosphere reference only), itch.io packs labelled CC0 but AI-generated.
