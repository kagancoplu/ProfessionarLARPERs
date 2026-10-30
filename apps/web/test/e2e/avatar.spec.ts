import { expect, test } from '@playwright/test'

/** Avatar mode (track-E P6): walk with the keys, the camera follows, E opens the drawer of what is in front of you. */
test('avatar: walk the town and open the workshop with E', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('town').locator('canvas')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('avatar-toggle').click()
  await expect(page.getByTestId('avatar-toggle')).toContainText('Walking')
  await page.waitForFunction(() => (window as unknown as { __town?: { avatar?: { enabled: boolean } } }).__town?.avatar?.enabled === true)
  const before = await page.evaluate(() => (window as unknown as { __town: { avatar: { villager: { x: number } } } }).__town.avatar.villager.x)
  await page.getByTestId('town').locator('canvas').click({ position: { x: 20, y: 20 } })   // focus the game
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(800); await page.keyboard.up('ArrowRight')
  const after = await page.evaluate(() => (window as unknown as { __town: { avatar: { villager: { x: number } } } }).__town.avatar.villager.x)
  expect(after).toBeGreaterThan(before + 10)
  // stand at the workshop door and press E
  await page.evaluate(() => { const t = (window as unknown as { __town: { avatar: { villager: { setPosition: (x: number, y: number) => void } }, workshop: { door: { x: number, y: number } } } }).__town; t.avatar.villager.setPosition(t.workshop.door.x, t.workshop.door.y) })
  await page.waitForTimeout(300)
  await page.keyboard.press('e')
  await expect(page.getByRole('complementary', { name: 'Workshop' })).toBeVisible({ timeout: 5_000 })
  // back to the map mode with V
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await expect(page.getByTestId('avatar-toggle')).toContainText('Walk the town')
})
