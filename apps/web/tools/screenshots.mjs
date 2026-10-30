#!/usr/bin/env node
/** Desktop-width screenshots of the mock app (README/STATUS material, P5): BASE=http://localhost:5174 OUT=dir node tools/screenshots.mjs */
import { chromium } from '@playwright/test'
const base = process.env.BASE ?? 'http://localhost:5174'
const out = process.env.OUT
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.goto(`${base}/`)
await page.waitForTimeout(Number(process.env.WAIT_MS ?? 9000))
await page.screenshot({ path: `${out}/town.png` })
await page.goto(`${base}/_kit`)
await page.waitForSelector('[data-testid=atlas-status]')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/kit.png`, fullPage: true })
await page.getByRole('button', { name: /switch to night/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/kit-night.png`, fullPage: true })
await page.goto(`${base}/_debug`)
await page.waitForSelector('[data-testid=debug]')
await page.getByRole('button', { name: 'run', exact: true }).click()
await page.waitForSelector('[data-testid=core-smoke]')
await page.getByRole('button', { name: 'Connect BSV Desktop' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/debug.png` })
const smoke = await page.getByTestId('core-smoke').innerText()
await page.goto(`${base}/pools`); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/pools.png` })
await page.goto(`${base}/agents`); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/agents.png` })
await page.goto(`${base}/explorer`); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/explorer.png` })
console.log('SMOKE:\n' + smoke)
console.log('ERRORS:', errors.length, errors.slice(0, 5))
await browser.close()
