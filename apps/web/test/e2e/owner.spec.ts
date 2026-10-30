import { expect, test } from '@playwright/test'
import { MOCK_IDS } from '../../src/mock/data'

/** The owner tour with the mock Desktop (track-E P3 3.5): vault → fund → policy → the guard refuses an injection → withdraw. */
test('owner: create a vault, fund it, write the policy, see the refusal, withdraw', async ({ page }) => {
  await page.goto('/owner')
  await page.getByTestId('wallet-chip').getByRole('button', { name: 'Connect BSV Desktop' }).click()
  await expect(page.getByTestId('owner')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('vault-agent').selectOption(MOCK_IDS.agents.eval)
  await page.getByTestId('create-vault').click()
  await expect(page.getByTestId('vault-card')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('fund-amount').fill('20000')
  await page.getByTestId('fund-vault').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('vault-balance')).toContainText('20', { timeout: 10_000 })
  await expect(page.getByTestId('under-the-hood')).toContainText('T9')
  await page.getByTestId('policy-maxPerPoolSats').fill('1000')
  await page.getByTestId('save-policy').click()
  await expect(page.getByTestId('policy-form')).toContainText('saved', { timeout: 10_000 })
  // the injection demo refuses on the finetune agent's vault
  // in-app navigation keeps the mock world and the wallet connection
  await page.getByRole('link', { name: /agents/i }).click()
  await page.getByTestId('inject-now').click()
  await expect(page.getByTestId('injected')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId('decision-stream')).toContainText('cosign denied', { timeout: 10_000 })
  await page.getByRole('link', { name: /^owner$/i }).click()
  await expect(page.getByTestId('denials')).toContainText('maxPerPoolSats exceeded', { timeout: 10_000 })
  await page.getByTestId('withdraw-vault').click()
  await page.getByRole('button', { name: 'Approve (mock)' }).click()
  await expect(page.getByTestId('vault-balance')).toContainText('0', { timeout: 10_000 })
  await expect(page.getByTestId('vault-balance')).not.toContainText('20')
})
