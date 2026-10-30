import { expect, test } from '@playwright/test'

/** The jury tour (track-E P1 1.7): no wallet, mock mode. */
test('jury tour: town renders and animates, pools filter, explorer links, replay skips to the settlement', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('town')).toBeVisible()
  await expect(page.getByTestId('town').locator('canvas')).toBeVisible({ timeout: 20_000 })
  // the scenario settles pool A ~12.5 s after it opens
  await expect(page.getByTestId('corner-counters')).toContainText('Held in custody')
  await expect(page.getByTestId('live-feed')).toContainText('Settlement: 3 participants', { timeout: 30_000 })

  await page.getByRole('link', { name: 'Pools' }).click()
  await expect(page.getByTestId('pools-table')).toBeVisible()
  await page.getByRole('button', { name: 'settled' }).click()
  await page.getByTestId('pool-row').first().click()
  await expect(page.getByTestId('pool-detail')).toContainText('0 sat held by anyone')
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Explorer' }).click()
  await page.getByRole('button', { name: 'T5', exact: true }).click()
  await expect(page.getByTestId('tx-table').locator('tbody tr')).toHaveCount(1)

  await page.goto('/?replay=mock-demo')
  await expect(page.getByTestId('mode-badge')).toHaveText('REPLAY')
  await expect(page.getByTestId('replay-bar')).toBeVisible()
  await page.getByRole('button', { name: 'skip to settlement' }).click()
  await expect(page.getByTestId('corner-counters')).toContainText('1', { timeout: 5_000 })
  await expect(page.getByTestId('live-feed')).toContainText('Settled in one transaction')
})
