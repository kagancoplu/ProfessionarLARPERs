import { expect, test } from '@playwright/test'

/** The provider tour with the mock Desktop: mint, open a pool, see it on the board, cancel. */
test('provider: mint credits, open a pool, cancel it', async ({ page }) => {
  await page.goto('/provider')
  await page.getByTestId('wallet-chip').getByRole('button', { name: 'Connect BSV Desktop' }).click()
  await expect(page.getByTestId('provider')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('mint').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('provider')).toContainText('minted', { timeout: 10_000 })
  await page.getByTestId('pool-label').fill('16×H100 · my pool')
  await page.getByTestId('open-pool').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()   // reserve + announce
  await page.getByRole('button', { name: 'Approve (mock)' }).click()   // offer signature
  await expect(page.getByTestId('my-pools')).toContainText('16×H100 · my pool', { timeout: 10_000 })
  await expect(page.getByTestId('under-the-hood')).toContainText('SINGLE|ACP')
  await page.getByRole('button', { name: 'cancel' }).click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('my-pools')).toContainText('cancelled', { timeout: 10_000 })
})
