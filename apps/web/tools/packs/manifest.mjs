/**
 * What the Town takes from Cute Fantasy (Kenmi, Premium). Paths relative to assets/packs/Cute_Fantasy.
 * Each entry: name, file, optional rect [x, y, w, h] (default: whole image), optional frames {count, dx, dy}
 * (dx/dy = step between frames in px) → frames become name_0..name_{count-1}.
 */
const B = 'Buildings/Buildings', O = 'Outdoor decoration', OA = 'Outdoor decoration/Outdoor_Decor_Animations'
const houses = []
for (const mat of ['Wood', 'Stone']) for (let i = 1; i <= 5; i++) for (const c of ['Red', 'Blue', 'Black']) {
  houses.push({ name: `house_${mat.toLowerCase()}${i}_${c.toLowerCase()}`, file: `${B}/Houses/${mat}/House_${i}_${mat}_Base_${c}${i === 2 && mat === 'Stone' && c === 'Black' ? 'png' : ''}.png` })
}
export const SPRITES = [
  ...houses,
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `blacksmith_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Blacksmith_House/Blacksmith_House_${c}.png` })),
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `coop_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Coop/Coop_Base_${c}.png`, rect: [0, 0, 80, 128], frames: { count: 3, dx: 80 } })),
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `barn_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Barn/Barn_Base_${c}.png` })),
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `inn_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Inn/Inn_${c}.png` })),
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `shed_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Shed/Shed_Base_${c}.png` })),
  ...['Red', 'Blue', 'Black'].map(c => ({ name: `fisherman_${c.toLowerCase()}`, file: `${B}/Unique_Buildings/Fisherman_House/Fisherman_House_Base_${c}.png` })),
  { name: 'windmill', file: `${B}/Unique_Buildings/Windmill/Windmill.png` },
  { name: 'windmill_sail', file: `${B}/Unique_Buildings/Windmill/Windmill_Sail_Anim.png`, rect: [0, 0, 64, 80], frames: { count: 4, dx: 64 } },
  { name: 'silo', file: `${B}/Unique_Buildings/Silo/Silo.png` },
  { name: 'tent_big', file: `${B}/Tent/Tent_Big.png` },
  { name: 'tent_small', file: `${B}/Tent/Tent_Small.png` },
  { name: 'stall', file: `${B}/Unique_Buildings/Stalls/Market_Stalls.png`, rect: [0, 0, 48, 48], frames: { count: 4, dx: 48 } },
  { name: 'well', file: `${O}/Well.png` },
  { name: 'fountain', file: `${OA}/Other_Animations/Fountain_Anim.png`, rect: [0, 0, 32, 48], frames: { count: 8, dx: 32 } },
  { name: 'bench_stone', file: `${O}/Benches.png`, rect: [0, 0, 32, 32] },
  { name: 'bench_wood', file: `${O}/Benches.png`, rect: [32, 0, 32, 32] },
  { name: 'barrel', file: `${O}/barrels.png`, rect: [0, 0, 32, 32], frames: { count: 3, dx: 32 } },
  { name: 'barrel_flowers', file: `${O}/barrels.png`, rect: [0, 32, 32, 32], frames: { count: 3, dx: 32 } },
  { name: 'sign', file: `${O}/Signs.png`, rect: [0, 0, 32, 32], frames: { count: 3, dx: 32 } },
  { name: 'sign_post', file: `${O}/Signs.png`, rect: [0, 144, 32, 48], frames: { count: 3, dx: 32 } },
  { name: 'lantern', file: `${O}/Lanter_Posts.png`, rect: [0, 0, 16, 48], frames: { count: 6, dx: 16 } },
  { name: 'lantern_wood', file: `${O}/Lanter_Posts.png`, rect: [0, 144, 16, 48], frames: { count: 6, dx: 16 } },
  { name: 'smoke', file: 'Buildings/House_Decor/Chimney_smoke_Anim.png', rect: [0, 0, 32, 32], frames: { count: 5, dx: 32 } },
  { name: 'chest', file: 'Buildings/House_Decor/Chest_Anim.png', rect: [0, 0, 16, 16], frames: { count: 6, dx: 16 } },
  { name: 'chest_gold', file: 'Buildings/House_Decor/Golden_Chest_Anim.png', rect: [0, 0, 16, 16], frames: { count: 6, dx: 16 } },
  { name: 'bunting', file: `${OA}/Other_Animations/Pole_and_Bunting_1_Anim.png`, rect: [0, 0, 32, 32], frames: { count: 8, dx: 32 } },
  { name: 'torch', file: `${OA}/Other_Animations/Torch_Anim.png`, rect: [0, 0, 16, 32], frames: { count: 8, dx: 16 } },
  { name: 'campfire', file: `${OA}/Other_Animations/Campfire_Anim.png`, rect: [0, 0, 16, 32], frames: { count: 8, dx: 16 } },
  { name: 'oak_big', file: 'Trees/Big_Oak_Tree.png', rect: [64, 0, 64, 80] },
  { name: 'oak_med', file: 'Trees/Medium_Oak_Tree.png', rect: [32, 0, 32, 48] },
  { name: 'oak_small', file: 'Trees/Small_Oak_Tree.png' },
  { name: 'spruce_big', file: 'Trees/Big_Spruce_tree.png', rect: [64, 0, 64, 80] },
  { name: 'spruce_med', file: 'Trees/Medium_Spruce_Tree.png', rect: [32, 0, 32, 48] },
  { name: 'birch_big', file: 'Trees/Big_Birch_Tree.png', rect: [32, 0, 64, 80] },
  { name: 'fruit_big', file: 'Trees/Big_Fruit_Tree.png', rect: [32, 0, 64, 64] },
  { name: 'stump', file: 'Trees/Big_Oak_Tree.png', rect: [16, 48, 32, 32] },
  { name: 'hay', file: `${O}/Hay_Bales.png`, rect: [0, 0, 16, 16], frames: { count: 3, dx: 16 } },
  { name: 'scarecrow', file: `${O}/Scarecrows.png`, rect: [0, 0, 32, 32], frames: { count: 5, dx: 32 } },
  { name: 'trough', file: `${O}/Water_Troughs.png`, rect: [0, 0, 32, 32], frames: { count: 3, dx: 32 } },
  { name: 'picnic', file: `${O}/Picnic_Basket.png` },
  { name: 'boat', file: `${O}/Boat.png` },
  { name: 'icon_res', file: 'Icons/Outline/Resources_Icons_Outline.png', rect: [0, 0, 16, 16], frames: { count: 36, cols: 6, dx: 16, dy: 16 } },
  { name: 'icon_other', file: 'Icons/Outline/Other_Icons_Outline.png', rect: [0, 0, 16, 16], frames: { count: 15, cols: 5, dx: 16, dy: 16 } },
  { name: 'icon_other2', file: 'Icons/Outline/Other_Icons_2_Outline.png', rect: [0, 0, 16, 16], frames: { count: 20, cols: 4, dx: 16, dy: 16 } },
  { name: 'icon_tool', file: 'Icons/Outline/Tool_Icons_Outline.png', rect: [0, 0, 16, 16], frames: { count: 10, dx: 16 } }
]

/** Whole sheets copied as Tiled tilesets (16 px grid). */
export const TILESETS = [
  { name: 'decor', file: `${O}/Outdoor_Decor.png` },
  { name: 'flowers', file: `${O}/Flowers.png` },
  { name: 'fence', file: `${O}/Fences.png` },
  { name: 'fence_white', file: `${O}/White_Fence.png` },
  { name: 'fence_stone', file: `${O}/Stone_Fence_Small.png` },
  { name: 'hedge', file: 'Tiles/Hedge_Tiles.png' },
  { name: 'pavement', file: 'Tiles/Pavement_Tiles.png' },
  { name: 'farmland', file: 'Tiles/FarmLand/FarmLand_Tile.png' },
  { name: 'bridge_wood', file: 'Tiles/Bridge/Bridge_Wood.png' },
  { name: 'cliff', file: 'Tiles/Grass/Grass_Tiles_1.png' },
  { name: 'path_decor', file: 'Tiles/Grass/Path_Decoration.png' },
  { name: 'water_decor', file: 'Tiles/Water/Water_Decoration.png' }
]

/** Premade NPCs: 64×64 cells, 6 columns; rows 0-2 idle (down, side, up), rows 3-5 walk. */
export const NPCS = [
  ['bruno', 'Bartender_Bruno'], ['katy', 'Bartender_Katy'], ['chloe', 'Chef_Chloe'], ['bob', 'Farmer_Bob'],
  ['buba', 'Farmer_Buba'], ['fin', 'Fisherman_Fin'], ['jack', 'Lumberjack_Jack'], ['mike', 'Miner_Mike']
].map(([name, file]) => ({ name, file: `NPCs (Premade)/${file}.png` })).concat([{ name: 'horse', file: 'Player/Player_Mounts/Horse/Player_Horse_Brown.png' }])

/** Modular villagers (same 64×64 layout): deterministic outfits. Layers draw in this order. */
const HAIR_COLORS = ['Black', 'Blonde', 'Brown', 'Ginger', 'Grey']
const SHIRT = { og: (c) => `Player/Chest/OG_Shirt/Shirt_1_${c}.png`, farmer: (c) => `Player/Chest/Farmer_Shirt/Farmer_Shirt_1_${c}.png`, lumber: (c) => `Player/Chest/Lumberjack_Shirt/Lumberjack_Shirt_1_${c}.png`, royal: (c) => `Player/Chest/Royal_Shirt/Royal_Shirt_1_${c}.png` }
const PANTS = { farmer: (c) => `Player/Legs/Farmer_Pants/Farmer_Pants_1_${c}.png`, og: (c) => `Player/Legs/OG_Pants/Pants_1_${c}.png`, royal: (c) => `Player/Legs/Royal_Pants/Royal_Pants_1_${c}.png` }
const OUTFITS = [
  ['og', 'Blue', 'farmer', 'Blue', 1, 'Brown', 'Brown'], ['farmer', 'Green', 'farmer', 'Black', 2, 'Black', 'Black'], ['lumber', 'Red', 'og', 'Blue', 3, 'Ginger', 'Brown'],
  ['royal', 'Purple', 'royal', 'Black', 4, 'Blonde', 'Black'], ['og', 'Orange', 'farmer', 'Blue', 5, 'Brown', 'Brown'], ['farmer', 'Pink', 'og', 'Black', 6, 'Grey', 'White'],
  ['lumber', 'Green', 'farmer', 'Black', 2, 'Black', 'Brown'], ['og', 'Red', 'og', 'Blue', 4, 'Brown', 'Red'], ['royal', 'Blue', 'royal', 'Black', 1, 'Ginger', 'Black'],
  ['farmer', 'White_and_Brown', 'farmer', 'White_and_Brown', 3, 'Blonde', 'Brown'], ['lumber', 'Blue', 'og', 'Black', 5, 'Grey', 'Black'], ['og', 'Purple', 'farmer', 'Blue', 6, 'Black', 'Blue']
]
export const VILLAGERS = OUTFITS.map(([shirtKind, shirtColor, pantsKind, pantsColor, hair, hairColor, shoes], i) => ({
  name: `villager_${String(i).padStart(2, '0')}`,
  layers: ['Player/Player_Base/Player_Base_animations.png', `Player/Feet/Shoes_1_${shoes}.png`, PANTS[pantsKind](pantsColor), SHIRT[shirtKind](shirtColor), 'Player/Hands/Hands_1_Bare.png', `Player/Head/Hair_${hair}/Hair_${hair}_${hairColor}.png`]
}))
export const HAIR_COLORS_ALL = HAIR_COLORS
