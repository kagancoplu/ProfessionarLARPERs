import { expect, test } from '@playwright/test'

/** The session history behind the consoles: savings chart, price history, leaderboard, pool timeline. */
test('consoles: charts, leaderboard and pool timeline fill in from one mock cycle', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/metrics')
  // one settlement (≈13 s into the cycle) puts a mark on the savings chart
  await expect(page.getByTestId('savings-chart').locator('circle')).not.toHaveCount(0, { timeout: 25_000 })
  await page.getByTestId('savings-chart').locator('summary').click()
  await expect(page.getByTestId('savings-chart').locator('tbody tr').first()).toContainText('settled with')

  await page.locator('header a[href="/market"]').first().click()
  await expect(page.getByTestId('price-chart').locator('circle')).not.toHaveCount(0, { timeout: 20_000 })

  await page.locator('header a[href="/agents"]').first().click()
  await expect(page.getByTestId('leader-row')).toHaveCount(3)
  await expect(page.getByTestId('leader-row').first()).toContainText('sat')

  await page.locator('header a[href="/pools"]').first().click()
  await page.getByTestId('pool-row').first().click()
  await expect(page.getByTestId('pool-timeline')).toContainText('opened', { ignoreCase: true })
  await expect(page.getByTestId('pool-timeline').locator('li')).not.toHaveCount(0)
})
