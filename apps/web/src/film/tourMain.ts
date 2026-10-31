/**
 * The app tour (70 s, VIDEO.md): after "The Pool" the camera leaves the film for the real app in mock mode.
 * Town (0 sat in custody) → Pools (the provider's offer, a pool that did not fill, a settlement on mainnet) →
 * Market (spare credits resold, a sweep on mainnet) → My Agents (vault and budget, 5 checks, the guard refusing a
 * prompt injection, Coop Rail). Times are tour seconds; the narrator's lines are in narration.ts.
 */
import type { MockRuntime } from '../mock/browser'
import { duration } from './narration'
import type { TourDirector, WocTx } from './tour'

export const TOUR_DURATION = duration('tour')
/** tour second 0 is this far into the mock scenario: the second cycle's pool opens at tour 7 s and settles at 19.5 s,
 *  the agent buys a listing at 37 s, Coop Rail funds the vault at 39.7 s */
export const TOUR_ALIGN_MS = 29_000
/** the scenario pauses here, before it would take the vault's listing back and start a new cycle */
const PAUSE_AT = 39.75

/** what tools/film-assets.mjs puts in public/_film (not committed): the film's last frame, the two mainnet
 *  transactions from the WhatsOnChain API, and, when someone saved them by hand, screenshots of their pages */
export const TOUR_FILES = { filmLastFrame: '/_film/pool-last.png', tx: (k: Mainnet) => `/_film/tx-${k}.json`, shot: (k: Mainnet) => `/_film/woc-${k}.png` }
export type Mainnet = 'settlement' | 'sweep'
export interface TourAssets { tx: Partial<Record<Mainnet, WocTx>>, shots: Partial<Record<Mainnet, string>> }

const ROLES: Record<Mainnet, { title: string, caption: string, inputs: string[], outputs: string[] }> = {
  settlement: {
    title: 'Settlement · one transaction for the whole pool',
    caption: 'BSV mainnet · a settlement from our live run',
    inputs: ['the provider\'s offer, signed once', 'an agent\'s pledge coin', 'an agent\'s pledge coin'],
    outputs: ['the provider is paid', 'credits for the first agent', 'credits for the second agent', 'the first agent\'s change', 'the second agent\'s change', 'the pool\'s record']
  },
  sweep: {
    title: 'Market sweep · spare credits change hands',
    caption: 'BSV mainnet · a market sweep from our live run',
    inputs: ['the seller\'s listing, signed once', 'the buyer\'s coin'],
    outputs: ['the seller is paid', 'credits for the buyer', 'the buyer\'s change']
  }
}

/** a screenshot of the WhatsOnChain page when there is one, else the tour's own card from the API data */
async function showTx (d: TourDirector, a: TourAssets, k: Mainnet, sec: number): Promise<void> {
  const shot = a.shots[k], tx = a.tx[k]
  if (shot !== undefined) await d.window(shot, `whatsonchain.com/tx/${MAINNET[k]}`, ROLES[k].caption, sec)
  else if (tx !== undefined) await d.txCard(tx, ROLES[k], sec)
  else await d.wait(sec)
}
export const MAINNET = {
  settlement: '6d320c9af886bd2514da2c4af0ed0c64477840e08564fb8b8e381270aa5b2763',
  sweep: '675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c'
}

const row = (d: TourDirector, status: string): Element => {
  const rows = [...document.querySelectorAll('[data-testid=pool-row]')]
  const found = rows.find(r => (r.querySelector('td:nth-child(2)')?.textContent ?? '').trim().toLowerCase() === status)
  if (found === undefined) throw new Error(`tour: no ${status} pool on the Pools page`)
  return d.el(found)
}
const nav = (to: string): string => `nav[aria-label=Main] a[href="${to}"]`

export async function tourMain (d: TourDirector, mock: MockRuntime | undefined, assets: TourAssets, roll: Promise<void>): Promise<void> {
  window.scrollTo(0, 0)
  await roll
  d.start('tour')
  setTimeout(() => { mock?.scenario.pause() }, PAUSE_AT * 1000)

  // ---- Town (0–10 s): the film shrinks into the live canvas; nobody holds the money
  const canvas = '[data-testid=town] canvas'
  await d.shrinkInto(TOUR_FILES.filmLastFrame, canvas, 1.3)
  await d.at(2.2, 'town')
  void d.show(d.point(canvas, 0.62, 0.7))
  await d.moveTo(d.point(canvas, 0.45, 0.45), 1.6)
  await d.at(5.0)
  const custody = '[data-testid=corner-counters] > :first-child'
  await d.moveTo(custody, 1.1, 0.35, 0.62)
  await d.at(6.5)
  d.highlight(custody, '0 sat held · by design', 3.0)

  // ---- Pools (10–33 s)
  await d.at(9.0, 'pools')
  await d.click(nav('/pools'), 0.8)
  await d.at(10.6)
  const open = row(d, 'open')
  await d.moveTo(open.querySelector('td:nth-child(4)')!, 0.9, 0.3, 0.5)
  d.highlight(open.querySelector('td:nth-child(4)')!, 'half the retail price', 2.4)
  await d.at(13.4)
  await d.click(open.querySelector('td:nth-child(1)')!, 0.6, 0.3, 0.5)
  await d.at(14.3)
  const offer = d.byText('[data-testid=pool-detail] .grid > div', 'Offer')
  await d.moveTo(offer, 0.7, 0.3, 0.7)
  d.highlight(offer, 'the provider signed once', 2.6)
  await d.at(17.2)
  await d.click('aside button[aria-label=Close]', 0.6)
  await d.at(18.2, 'failed')
  const failed = row(d, 'failed')
  await d.moveTo(failed.querySelector('td:nth-child(2)')!, 0.8)
  d.highlight(failed, 'deadline passed · no coin moved', 4.4, 2)
  await d.at(24.0, 'settled')
  const settled = row(d, 'settled')
  const link = settled.querySelector('td:nth-child(6) a, td:nth-child(6) button') ?? settled.querySelector('td:nth-child(6)')!
  await d.moveTo(link, 0.9, 0.4, 0.5)
  await d.at(25.9)
  await d.click(link, 0.2, 0.4, 0.5, { dispatch: false })
  await d.at(26.3)
  await showTx(d, assets, 'settlement', 6.2)

  // ---- Market (33–49 s)
  await d.at(32.8, 'market')
  await d.click(nav('/market'), 0.8)
  await d.at(34.4)
  const listings = '[data-testid=listings]'
  await d.moveTo(listings, 0.8, 0.62, 0.55)
  d.highlight(listings, 'spare credits · below retail', 3.0)
  await d.at(37.4)
  const chart = '[data-testid=price-history]'
  await d.scrollTo(Math.max(0, window.scrollY + d.el(chart).getBoundingClientRect().top - 330), 0.7)
  await d.moveTo(chart, 0.8, 0.55, 0.6)
  await d.at(39.0)
  d.highlight(chart, 'an agent bought them · one transaction', 3.0)
  await d.at(42.4)
  await showTx(d, assets, 'sweep', 5.8)

  // ---- My Agents (48–70 s)
  await d.at(48.4, 'agents')
  await d.click(nav('/agents'), 0.8)
  const card = d.byText('[data-testid=agent-card]', 'vault + guard')
  await d.at(49.4)
  await d.scrollTo(Math.max(0, window.scrollY + card.getBoundingClientRect().top - 78), 0.8)
  const vault = card.querySelector('[data-testid=agent-vault]')!
  await d.moveTo(vault, 0.8, 0.3, 0.4)
  await d.at(51.0)
  d.highlight(vault, 'the owner\'s budget · the guard co-signs', 3.0)
  await d.at(54.2)
  const checks = d.byText('[data-testid=agent-card] li, [data-testid=agent-card] div', /pledge-list hash/)
  const sign = [...card.querySelectorAll('*')].reverse().find(e => /my credits ✓/.test(e.textContent ?? '') && e.children.length <= 2) ?? checks
  await d.moveTo(sign, 0.8, 0.5, 0.5)
  d.highlight(sign, '5 checks, then it signs its own coin', 3.4, 4)
  await d.at(58.2, 'guard')
  await d.click('[data-testid=inject-now]', 0.9)
  await d.at(59.7)
  const injected = card.querySelector('[data-testid=injected]')
  if (injected !== null) d.highlight(injected, 'a prompt injection: "spend it all"', 2.0, 4)
  await d.at(61.8)
  await d.moveTo(vault, 0.9, 0.5, 0.8)
  d.highlight(vault, 'guard: refused · nothing was sent', 2.6)
  await d.at(64.6, 'rail')
  await d.moveTo(vault, 0.6, 0.2, 0.3)
  d.highlight(vault, 'Coop Rail: USDC on Base → this vault (experimental)', 3.6)
  await d.at(68.4)
  await d.hide(0.6)
  await d.at(TOUR_DURATION, 'end')
}
