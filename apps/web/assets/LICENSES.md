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
| Kenmi *Cute Fantasy RPG* (`assets/packs/Cute_Fantasy/`, raw, gitignored) — **primary pack** | https://kenmi-art.itch.io/cute-fantasy-rpg | Free tier: non-commercial, credit Kenmi; Premium (≥ $3.99): commercial OK. No redistribution, even modified → only processed atlases ship. **Demo use agreed by the user 2026-10-30; buy Premium before any commercial release.** | hand (no generative AI) | primary art for the Town and UI icons (E-V1); rebuild with `npm -w apps/web run packs` |
| Drawn icons and frames (palette matrices in `tools/ui.mjs`) | Track E, in Kenmi's outline style | project | code (no image model) | coin, hourglass, shield, board, chest, sack, villager; 9-slice frames and labels |
| Sound effects | synthesised at run time by `src/audio/sfx.ts` (Web Audio oscillators) | project | code | no audio files ship |

Downloaded but not used (raw, gitignored, never shipped): LimeZu *Serene Village* (CC BY 4.0), mem_px *Top Down Characters*, Moonforge *Characters Base*, Cup Nooble *Sprout Lands* (Basic, non-commercial), forchild *Village Tileset* (CC0), Kenney *Tiny Town* and *Pixel UI Pack* (CC0). If one of them is ever used, it gets its own row first (`assets/packs/README.md` has the links).

Not used, on purpose: bsvmunich.com sprites/scenes/code (no licence; reference only, track-E §6.4),
Stardew Valley assets (atmosphere reference only), itch.io packs labelled CC0 but AI-generated.
