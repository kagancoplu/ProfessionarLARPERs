import { expect, test, type Page } from '@playwright/test'

interface Pt { x: number, y: number }
interface TownWindow {
  __town?: {
    avatar?: { enabled: boolean, villager: Pt & { setPosition: (x: number, y: number) => void } }
    workshop: { door: Pt }
    houses: Array<{ owner?: string, door: Pt }>
    bell: Pt
    cameras: { main: { midPoint: Pt, zoom: number } }
    viewCentre: Pt
    game: { loop: { frame: number } }
    addVillager: (identity: string, profile: string, name: string) => Pt & { walkTo: (x: number, y: number) => Promise<void> }
    removeVillager: (identity: string) => void
  }
}
const frame = async (page: Page): Promise<number> => await page.evaluate(() => (window as unknown as TownWindow).__town!.game.loop.frame)
const frameErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /\[town\]|getSnapshot|Maximum update depth/.test(m.text())) errors.push(m.text()) })
  return errors
}
const open = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect(page.getByTestId('town').locator('canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => (window as unknown as TownWindow).__town?.viewCentre !== undefined)
}
const offCentre = async (page: Page): Promise<number> => await page.evaluate(() => { const t = (window as unknown as TownWindow).__town!; const m = t.cameras.main.midPoint, c = t.viewCentre; return Math.hypot(m.x - c.x, m.y - c.y) })

/** Avatar mode (track-E P6): walk with the keys, the camera follows, E opens the drawer of what is in front of you. */
test('avatar: the walk starts at the fountain, E opens the workshop and a house, the map view comes back to the square', async ({ page }) => {
  const errors = frameErrors(page)
  await open(page)
  // the map view rests on the square, also after the canvas changes size
  expect(await offCentre(page)).toBeLessThan(2)
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.waitForTimeout(400)
  expect(await offCentre(page)).toBeLessThan(2)

  await page.getByTestId('avatar-toggle').click()
  await expect(page.getByTestId('avatar-toggle')).toContainText('Walking')
  await page.waitForFunction(() => (window as unknown as TownWindow).__town?.avatar?.enabled === true)
  // in front of the fountain, not at the west edge
  const start = await page.evaluate(() => { const t = (window as unknown as TownWindow).__town!; return { you: { x: t.avatar!.villager.x, y: t.avatar!.villager.y }, fountain: { x: t.bell.x, y: t.bell.y } } })
  expect(Math.abs(start.you.x - start.fountain.x)).toBeLessThanOrEqual(16)
  expect(start.you.y - start.fountain.y).toBeGreaterThan(0)
  expect(start.you.y - start.fountain.y).toBeLessThanOrEqual(16)

  await page.getByTestId('town').locator('canvas').click({ position: { x: 20, y: 20 } })   // focus the game
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(800); await page.keyboard.up('ArrowDown')
  const after = await page.evaluate(() => (window as unknown as TownWindow).__town!.avatar!.villager.y)
  expect(after).toBeGreaterThan(start.you.y + 10)

  // stand at the workshop door and press E
  await page.evaluate(() => { const t = (window as unknown as TownWindow).__town!; t.avatar!.villager.setPosition(t.workshop.door.x, t.workshop.door.y) })
  await page.waitForTimeout(300)
  await page.keyboard.press('e')
  await expect(page.getByRole('complementary', { name: 'Workshop' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Open the provider console' })).toBeVisible()
  await page.keyboard.press('Escape')

  // a house opens its agent's card (this used to crash into the error page)
  await page.waitForFunction(() => (window as unknown as TownWindow).__town!.houses.some(h => h.owner !== undefined), undefined, { timeout: 15_000 })
  await page.evaluate(() => { const t = (window as unknown as TownWindow).__town!; const h = t.houses.find(x => x.owner !== undefined)!; t.avatar!.villager.setPosition(h.door.x, h.door.y) })
  await page.waitForTimeout(300)
  await page.keyboard.press('e')
  await expect(page.getByRole('complementary', { name: 'Villager' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('Decisions')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.keyboard.press('Escape')

  // back to the map mode with V: the camera returns to the square
  await page.keyboard.press('v')
  await expect(page.getByTestId('avatar-toggle')).toContainText('Walk the town')
  await expect.poll(() => offCentre(page), { timeout: 3_000 }).toBeLessThan(2)
  expect(errors).toEqual([])
})

/** A villager destroyed mid-walk (a visitor leaving, the stranger running off) must not stop the Town's frames. */
test('town: removing a walking villager does not freeze the town', async ({ page }) => {
  const errors = frameErrors(page)
  await open(page)
  await page.evaluate(() => {
    const t = (window as unknown as TownWindow).__town!
    // a short walk (one leg, under a second): it is removed half way, the leg's tween would end on a destroyed sprite
    const v = t.addVillager('peer:e2e', 'visitor', 'Leaver')
    void v.walkTo(v.x + 40, v.y)
    setTimeout(() => { t.removeVillager('peer:e2e') }, 250)
  })
  await page.waitForTimeout(1_500)
  const before = await frame(page)
  await page.waitForTimeout(1_000)
  expect(await frame(page)).toBeGreaterThan(before + 10)
  expect(errors).toEqual([])
})
