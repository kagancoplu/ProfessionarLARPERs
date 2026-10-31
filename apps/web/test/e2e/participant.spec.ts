import { expect, test } from '@playwright/test'

/** The human participant tour with the mock Desktop (track-E P2 2.5). */
test('participant: connect, join a pool, sign the round, get credits, redeem, run a job', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect BSV Desktop' }).click()
  await expect(page.getByTestId('wallet-chip')).toContainText('mainnet', { timeout: 10_000 })
  await page.getByTestId('wallet-chip').getByText('you').click()
  await expect(page.getByTestId('participant')).toBeVisible()
  // the scenario opens pool A at t=0 and locks in at 9 s: join quickly
  await page.getByTestId('join-pool').first().click()
  await page.getByTestId('join-credits').fill('120')
  await page.getByTestId('join-confirm').click()
  await expect(page.locator('#mock-approval')).toBeVisible()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('my-pledges')).toContainText('pending', { timeout: 10_000 })
  await expect(page.getByTestId('under-the-hood')).toContainText('overlay')
  // sign request arrives at lock-in
  await expect(page.getByTestId('sign-request-card')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Review & sign' }).click()
  await expect(page.locator('#sign-review')).toBeVisible()
  await expect(page.getByTestId('sign-checks')).toContainText('Σ credits = N')
  await page.getByRole('button', { name: /Sign in BSV Desktop/ }).click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('my-pledges')).toContainText('signed', { timeout: 10_000 })
  await expect(page.getByTestId('my-pledges')).toContainText('settled', { timeout: 20_000 })
  await expect(page.getByTestId('credit-balance')).toContainText('120', { timeout: 10_000 })
  // redeem 1 credit, run a job paid with prepaid minutes
  await page.getByTestId('redeem-amount').fill('1')
  await page.getByTestId('redeem').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('prepaid-minutes')).toContainText('60', { timeout: 10_000 })
  await expect(page.getByTestId('credit-balance')).toContainText('119')
  await page.getByTestId('job-minutes').fill('30')
  await page.getByTestId('run-job').click()
  await expect(page.getByTestId('job-card')).toContainText('done', { timeout: 15_000 })
  // my orders (BL-30): the job is listed with how it was paid
  await expect(page.getByTestId('order-row')).toHaveCount(1)
  await expect(page.getByTestId('order-row').first()).toContainText('prepaid min')
})
