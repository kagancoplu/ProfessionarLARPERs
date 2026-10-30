# Raw art packs (gitignored)

Nothing in this folder is committed: the licences forbid redistributing the packs. The repo carries only what
`npm -w apps/web run packs` builds from them (`public/game/*`). On a new machine download the zips again and
unpack them here so the folders below exist, then run `npm -w apps/web run packs && npm -w apps/web run map && npm -w apps/web run ui`.

| Folder (after unzipping) | Used | From |
|---|---|---|
| `Cute_Fantasy/` (Premium) | **yes**: terrain, buildings, props, NPCs, modular villagers, animals, icons | https://kenmi-art.itch.io/cute-fantasy-rpg |
| `Cute_Fantasy_Free/`, `Old_Sprites/`, `Player_Aseprite_Files/` | no (extra downloads of the same pack) | same |
| `SERENE_VILLAGE_REVAMPED/` | no (fallback only) | https://limezu.itch.io/serenevillagerevamped |
| `mempx-characters/` (from `characters-topdown.rar`) | no (style clash) | https://mem-px.itch.io/top-down-characters |
| `CharactersBase/` | no | https://moonforgestudios.itch.io/pixelart-characters-base |
| `Sprout Lands - Sprites - Basic pack/` | no | https://cupnooble.itch.io/sprout-lands-asset-pack |
| `BasicVillageTileset/`, `GodotTilemapImport/` | no | https://forchild.itch.io/village-tileset |
| `kenney_tiny-town/`, `kenney_pixel-ui-pack/` | no (UI frames are drawn in `tools/ui.mjs`) | https://kenney.nl/assets/tiny-town · https://kenney.nl/assets/pixel-ui-pack |

Only `Cute_Fantasy/` is needed to rebuild. Licences: `../LICENSES.md`.
