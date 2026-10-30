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
await page.goto(`${base}/pools`); await wait(1000); await shot('04-pools')
await page.goto(`${base}/me`); await wait(1200); await shot('05-participant')
await page.goto(`${base}/provider`); await wait(1000); await shot('06-provider')
await page.goto(`${base}/owner`); await wait(1000); await shot('07-owner')
await page.goto(`${base}/agents`); await wait(1000)
await page.getByTestId('inject-now').click(); await wait(3500); await shot('08-agents-injection')
await page.goto(`${base}/market`); await wait(1000); await shot('09-market')
await page.goto(`${base}/explorer`); await wait(1000); await shot('10-explorer')
await page.goto(`${base}/metrics`); await wait(1000); await page.getByTestId('rail-quote').click(); await wait(1500); await shot('11-metrics-harbor', { fullPage: true })
console.log('ERRORS:', errors.length, errors.slice(0, 5))
await browser.close()
