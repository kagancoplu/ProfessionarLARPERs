import { expect, test } from '@playwright/test'

/** The market tour with the mock Desktop (track-E P3 3.5): the scenario's listing appears at the stall, we sweep it. */
test('market: a listing appears, buy it in one sweep, credits arrive', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/market')
  await page.getByTestId('wallet-chip').getByRole('button', { name: 'Connect BSV Desktop' }).click()
  await expect(page.getByTestId('market')).toBeVisible({ timeout: 10_000 })
  // inference lists 100 credits ~28 s into the cycle (the cycle starts 3 s after load)
  await expect(page.getByTestId('listing-row')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('listings')).toContainText('3 000 sat')
  await page.getByTestId('listing-select').check()
  await page.getByTestId('buy-selected').click()
  await expect(page.locator('#sweep-review')).toBeVisible()
  await expect(page.getByTestId('sweep-summary')).toContainText('3 000 sat')
  await page.getByTestId('sweep-confirm').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('market-credits')).toContainText('100', { timeout: 10_000 })
  await expect(page.getByTestId('under-the-hood')).toContainText('lineage')
})
