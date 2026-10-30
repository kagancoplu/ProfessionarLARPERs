import { expect, test } from '@playwright/test'

/** P0 acceptance in mock mode: the town opens, the scenario fills the store, kit and debug render, the mock Desktop connects. */
test('mock mode: feed flows, kit and debug render, mock Desktop connects', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('mode-badge')).toHaveText('MOCK')
  await expect(page.getByTestId('live-feed')).toBeVisible()
  // the scenario publishes within seconds
  await expect(page.getByTestId('live-feed').locator('li').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('corner-counters')).toContainText('Held in custody')

  await page.goto('/_kit')
  await expect(page.getByTestId('kit')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Nobody held anyone/ })).toBeVisible()
  await expect(page.getByTestId('atlas-status')).toContainText('frames from the atlas', { timeout: 20_000 })

  await page.goto('/_debug')
  await expect(page.getByTestId('debug')).toBeVisible()
  await expect(page.getByTestId('debug-events').locator('li')).not.toHaveCount(0, { timeout: 10_000 })
  await page.getByRole('button', { name: 'run', exact: true }).click()
  await expect(page.getByTestId('core-smoke')).toHaveAttribute('data-ok', 'true', { timeout: 20_000 })

  await page.getByRole('button', { name: 'Connect BSV Desktop' }).click()
  await expect(page.getByTestId('wallet-chip')).toContainText('mainnet', { timeout: 10_000 })
})
