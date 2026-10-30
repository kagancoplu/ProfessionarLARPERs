#!/usr/bin/env node
/** Live-mode probe: opens the app, waits for health polling and the adapters, prints badges + feed. BASE=http://localhost:5178 node tools/live-check.mjs */
import { chromium } from '@playwright/test'
const base = process.env.BASE ?? 'http://localhost:5178'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
await page.goto(`${base}/_debug`)
await page.waitForTimeout(6000)
const badges = await page.$$eval('[data-ok]', els => els.map(e => `${e.textContent?.trim()}=${e.getAttribute('data-ok')}`))
console.log('HEALTH:', badges.join(' · '))
const events = await page.$$eval('[data-testid=debug-events] li', els => els.slice(0, 12).map(e => e.textContent?.trim().slice(0, 140)))
console.log('EVENTS:'); for (const e of events) console.log(' ', e)
if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/live-debug.png` })
console.log('ERRORS:', errors.length, errors.slice(0, 6))
await browser.close()
