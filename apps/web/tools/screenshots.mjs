#!/usr/bin/env node
/**
 * Desktop-width screenshots of the mock app for the README (track-E 5.3):
 *   BASE=http://localhost:5178 OUT=../../docs/screenshots/web node tools/screenshots.mjs
 * Uses the mock Desktop (one click connects), the scenario's timing (settlement ~11 s, injection ~20 s, listing ~28 s).
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const base = process.env.BASE ?? 'http://localhost:5178'
const out = process.env.OUT ?? '../../docs/screenshots/web'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await ctx.addInitScript(() => { try { localStorage.setItem('agentcoop.tour', 'done') } catch {} })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const shot = async (name, opts = {}) => { await page.screenshot({ path: `${out}/${name}.png`, ...opts }); console.log('·', name) }
const wait = ms => page.waitForTimeout(ms)
const theme = async night => { const btn = page.locator('button[title^="Theme:"]'); const title = await btn.getAttribute('title'); if ((title ?? '').includes(night ? 'switch to night' : 'switch to day')) await btn.click() }

await page.goto(`${base}/`)
await page.waitForSelector('[data-testid=town] canvas', { timeout: 30_000 })
await theme(false)
await wait(12_000)                                    // past the first settlement: chests, villagers home
await shot('01-town-day')
await page.evaluate(() => { const t = window.__town; t?.setZoom(2); t?.cameras.main.centerOn(24 * 16, 19 * 16) })
await wait(600)
await shot('02-town-overview', { clip: { x: 80, y: 290, width: 1280, height: 600 } })
await theme(true); await wait(800)
await shot('03-town-night')
await theme(false)
await page.getByRole('button', { name: 'Connect BSV Desktop' }).click(); await wait(1200)
// in-app navigation keeps the mock world and the wallet connection (a reload would reset both)
const go = async name => { await page.getByRole('link', { name, exact: true }).click(); await wait(1200) }
await go('Pools'); await shot('04-pools')
await page.getByTestId('wallet-chip').getByText('you').click(); await wait(1200); await shot('05-participant')
await go('Provider'); await shot('06-provider')
await go('Owner')
await page.getByTestId('create-vault').click(); await wait(1500)
await page.getByTestId('fund-vault').click(); await page.getByRole('button', { name: 'Approve (mock)' }).click(); await wait(1500)
await shot('07-owner')
await go('My Agents')
await page.getByTestId('inject-now').click(); await wait(3500); await shot('08-agents-injection')
await go('Market'); await shot('09-market')
await go('Explorer'); await shot('10-explorer')
await go('Metrics'); await page.getByTestId('rail-quote').click(); await wait(1500); await shot('11-metrics-harbor', { fullPage: true })
console.log('ERRORS:', errors.length, errors.slice(0, 5))
await browser.close()
