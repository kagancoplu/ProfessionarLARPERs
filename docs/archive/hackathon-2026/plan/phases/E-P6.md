# E-P6 — Avatar mode (optional)

> Track E phase 6 (`plan/track-E-frontend.md` §8 phase 6). Author: E, 2026-10-31 03:00 CET. Time box 2 hours. Branch `main`. Previous: `E-P5.md` (✅ `e439969`).

## 0. Goal
The user walks the town with their own villager (WASD / arrow keys), opens the same drawers with `E` near a building; the camera follows. Click mode stays; switch between the two with the button under the Town and the `V` key.

## 1. Design
- **Setting:** `settings.avatar` (off by default; `?avatar=1` turns it on). The bridge calls `town.setAvatarMode(on)` on every sync.
- **Avatar:** the "you" villager (`villager_00`) when a wallet is connected, otherwise a `guest` villager ("you (guest)"), so the jury can walk without Desktop. `Villager.player = true`: wandering and story walks (the pledge scene) do not drag the avatar; the coin flies from where the avatar stands.
- **Movement:** no physics engine. `TownScene.update(dt)` reads the keys, speed 56 px/s, 8 directions; `map/blocked.ts` is pure: water, building footprints (bottom 45 %), stalls, well/fountain, tree trunks are blocked tiles; the avatar's foot point cannot enter a blocked tile (sliding axis by axis). Map bounds.
- **Camera:** `startFollow(avatar, true, 0.12)`; dragging off in avatar mode, wheel zoom on.
- **Interaction:** the nearest target within 28 px: board → pool drawer, stall → listing, house → agent, vault chest → vault, workshop → workshop, harbour office → rail, Coop building → first vault. An "E · Notice board" hint above the avatar. Pressing `E` opens it.
- **Keyboard:** WASD/arrows walk, `E` interact, `V` switch mode; off in input fields; in avatar mode the `A`/`E` navigation shortcuts are disabled (conflict).

## 2. Tests
Unit: `blocked.test.ts` (water and building tiles blocked, road and square open; bounds). e2e `avatar.spec.ts`: turn the mode on, walk right (x grows), teleport to the workshop door (`__town`, dev), `E` → "Workshop" drawer.

## 3. Checkpoint (end of phase 6, 31.10 03:30)

- `settings.avatar` (+ `?avatar=1`, `V`, the "Walk the town" button under the Town); `town/avatar.ts` (WASD/arrows, 56 px/s, sliding along walls, camera follow, an "E · target" hint within 28 px, `E` → drawer), `map/blocked.ts` (water + building/stall/well/fountain/tree footprints), `Villager.player` (wandering and story walks off; `stepAnim`), a guest avatar (no wallet), the `A/E` navigation shortcuts off in the Town in avatar mode.
- Tests: `blocked.test.ts` (2), `avatar.spec.ts` (walk → x grows; `E` at the workshop door → Workshop drawer; `V` → map mode). Web vitest total **20 files / 61 tests**, Playwright **7/7**, typecheck clean.
- Checkpoint: P7 (multiplayer) is not done: it needs a WS server side (B) and the time left before submission is unclear. Track E ends here; the rest is human work (publishing, mainnet acceptance, a real replay).
