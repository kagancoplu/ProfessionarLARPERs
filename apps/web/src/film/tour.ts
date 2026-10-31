/**
 * Tour mode (VIDEO.md): a director for the real app. A pixel cursor glides to elements and clicks them,
 * gold frames point things out, a "browser window" shows a real WhatsOnChain page, subtitles follow the
 * narrator. Everything is drawn in one fixed layer on top of the app and moves on the page's clock
 * (performance.now, requestAnimationFrame, setTimeout), which render mode makes virtual (vclock.ts).
 */
import { lines, type Segment } from './narration'

export type Target = string | Element | { x: number, y: number }
/** the part of a WhatsOnChain API transaction the tour reads */
export interface WocTx { txid: string, blockheight: number, size: number, vin: Array<{ scriptSig?: { asm?: string } }>, vout: Array<{ value: number, scriptPubKey: { asm?: string, type?: string } }> }
const hexText = (h: string): string => { try { return new TextDecoder().decode(new Uint8Array((h.match(/../g) ?? []).map(b => parseInt(b, 16)))) } catch { return '' } }
export interface Cue { t: number, name: string }

const CURSOR_SVG = (() => {
  // 12×19 pixel arrow: K outline, W fill
  const rows = [
    'K...........', 'KK..........', 'KWK.........', 'KWWK........', 'KWWWK.......', 'KWWWWK......', 'KWWWWWK.....', 'KWWWWWWK....',
    'KWWWWWWWK...', 'KWWWWWWWWK..', 'KWWWWWWWWWK.', 'KWWWWWWKKKKK', 'KWWWKWWK....', 'KWWKKWWK....', 'KWK..KWWK...', 'KK...KWWK...',
    'K.....KWWK..', '......KWWK..', '.......KK...'
  ]
  const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === 'K' ? '#1d1f2b' : '#fbf3df'}"/>`)))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 19" width="30" height="47.5" shape-rendering="crispEdges">${rects.join('')}</svg>`
})()

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class TourDirector {
  readonly cues: Cue[] = []
  readonly late: Array<{ beat: string, by: number }> = []
  private t0 = 0
  private readonly root: HTMLDivElement
  private readonly cursor: HTMLDivElement
  private readonly subtitle: HTMLParagraphElement
  private pos = { x: 0, y: 0 }
  private beat = ''

  constructor (opts: { subs?: boolean, tc?: boolean } = {}) {
    const root = document.createElement('div')
    root.dataset.testid = 'tour-layer'
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000'
    document.body.appendChild(root)
    this.root = root
    const cursor = document.createElement('div')
    cursor.innerHTML = CURSOR_SVG
    cursor.style.cssText = 'position:absolute;left:0;top:0;opacity:0;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.35));will-change:transform'
    root.appendChild(cursor)
    this.cursor = cursor
    const sub = document.createElement('p')
    sub.style.cssText = 'position:absolute;left:50%;bottom:4%;transform:translateX(-50%);max-width:80%;margin:0;padding:6px 14px;background:rgba(0,0,0,.72);color:#f9e6cf;font:20px/1.3 var(--font-body);text-align:center;display:none'
    if (opts.subs === true) root.appendChild(sub)
    this.subtitle = sub
    if (opts.tc === true) {
      const tc = document.createElement('div')
      tc.style.cssText = 'position:absolute;left:8px;top:64px;padding:2px 8px;background:rgba(0,0,0,.72);color:#fee761;font:16px var(--font-counter)'
      root.appendChild(tc)
      const tick = (): void => { tc.textContent = `${this.now().toFixed(1)} s · ${this.beat}${this.late.length > 0 ? ` · late: ${this.late.map(l => `${l.beat} +${l.by.toFixed(1)}`).join(', ')}` : ''}`; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    }
  }

  start (segment: Segment = 'tour'): void {
    this.t0 = performance.now()
    for (const l of lines(segment)) {
      setTimeout(() => this.showSubtitle(l.text), l.at * 1000)
      setTimeout(() => this.showSubtitle(undefined, l.text), (l.at + l.sec) * 1000)
    }
  }

  now (): number { return (performance.now() - this.t0) / 1000 }
  cue (name: string): void { this.cues.push({ t: this.now(), name }) }
  wait (sec: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, sec * 1000)) }

  async at (sec: number, beat?: string): Promise<void> {
    const left = sec - this.now()
    if (left > 0) await this.wait(left)
    else if (left < -0.05 && beat !== undefined) { this.late.push({ beat, by: -left }); console.warn(`[film] "${beat}" is ${(-left).toFixed(2)} s late`) }
    if (beat !== undefined) this.beat = beat
  }

  /** a tween on the page's clock: `fn(eased progress)` every frame for `sec` seconds */
  tween (sec: number, fn: (t: number) => void, easing: (t: number) => number = ease): Promise<void> {
    const start = performance.now()
    return new Promise(resolve => {
      const frame = (): void => {
        const raw = Math.min(1, (performance.now() - start) / (sec * 1000))
        fn(easing(raw))
        if (raw >= 1) resolve()
        else requestAnimationFrame(frame)
      }
      frame()
    })
  }

  // ---- finding things

  el (target: string | Element): Element {
    if (typeof target !== 'string') return target
    const found = document.querySelector(target)
    if (found === null) throw new Error(`tour: nothing matches ${target}`)
    return found
  }

  /** the first element matching `selector` whose text contains `text` */
  byText (selector: string, text: string | RegExp): Element {
    const all = [...document.querySelectorAll(selector)]
    const found = all.find(e => (typeof text === 'string' ? (e.textContent ?? '').includes(text) : text.test(e.textContent ?? '')))
    if (found === undefined) throw new Error(`tour: no ${selector} with "${String(text)}"`)
    return found
  }

  point (target: Target, dx = 0.5, dy = 0.5): { x: number, y: number } {
    if (typeof target === 'object' && 'x' in target && !(target instanceof Element)) return target
    const r = this.el(target as string | Element).getBoundingClientRect()
    return { x: r.left + r.width * dx, y: r.top + r.height * dy }
  }

  // ---- the cursor

  show (at: { x: number, y: number }, sec = 0.4): Promise<void> {
    this.place(at)
    return this.tween(sec, t => { this.cursor.style.opacity = String(t) })
  }

  hide (sec = 0.4): Promise<void> { return this.tween(sec, t => { this.cursor.style.opacity = String(1 - t) }) }

  private place (p: { x: number, y: number }): void {
    this.pos = { ...p }
    this.cursor.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`
  }

  /** glide to a target along a gentle curve */
  async moveTo (target: Target, sec = 0.8, dx = 0.5, dy = 0.5): Promise<void> {
    const from = { ...this.pos }
    const to = this.point(target, dx, dy)
    const bend = { x: (from.x + to.x) / 2 + (to.y - from.y) * 0.12, y: (from.y + to.y) / 2 - (to.x - from.x) * 0.12 }
    await this.tween(sec, t => {
      const u = 1 - t
      this.place({ x: u * u * from.x + 2 * u * t * bend.x + t * t * to.x, y: u * u * from.y + 2 * u * t * bend.y + t * t * to.y })
    })
  }

  /** move to an element and click it (a real DOM click, so the app reacts as it would to a person);
   *  `dispatch: false` only shows the click (a link the tour opens itself, e.g. in a browser window) */
  async click (target: string | Element, sec = 0.7, dx = 0.5, dy = 0.5, opts: { dispatch?: boolean } = {}): Promise<void> {
    const el = this.el(target)
    await this.moveTo(el, sec, dx, dy)
    this.ripple()
    this.cue('click')
    await this.tween(0.08, t => { this.cursor.style.transform = `translate(${Math.round(this.pos.x)}px, ${Math.round(this.pos.y + 2 * t)}px)` })
    if (opts.dispatch !== false) (el as HTMLElement).click()
    await this.tween(0.08, t => { this.cursor.style.transform = `translate(${Math.round(this.pos.x)}px, ${Math.round(this.pos.y + 2 - 2 * t)}px)` })
  }

  private ripple (): void {
    const r = document.createElement('div')
    r.style.cssText = `position:absolute;left:${this.pos.x - 4}px;top:${this.pos.y - 4}px;width:8px;height:8px;border:3px solid #fee761;image-rendering:pixelated`
    this.root.insertBefore(r, this.cursor)
    void this.tween(0.45, t => { const s = 8 + 40 * t; r.style.width = `${s}px`; r.style.height = `${s}px`; r.style.left = `${this.pos.x - s / 2}px`; r.style.top = `${this.pos.y - s / 2}px`; r.style.opacity = String(1 - t) }).then(() => r.remove())
  }

  /** scroll the page to `y` */
  scrollTo (y: number, sec = 0.8): Promise<void> {
    const from = window.scrollY
    return this.tween(sec, t => { window.scrollTo(0, from + (y - from) * t) })
  }

  // ---- pointing things out

  /** a gold pixel frame around an element, with an optional caption; stays `sec` seconds */
  highlight (target: string | Element, caption?: string, sec = 2.5, pad = 6): void {
    const el = this.el(target)
    const box = document.createElement('div')
    const cap = caption !== undefined ? document.createElement('div') : undefined
    box.style.cssText = 'position:absolute;border:4px solid #feae34;box-shadow:0 0 0 2px #3f2832, inset 0 0 0 2px #3f2832;opacity:0'
    this.root.insertBefore(box, this.cursor)
    if (cap !== undefined) {
      cap.className = 'town-label town-label-gold'
      cap.style.cssText = 'position:absolute;font-size:18px;padding:2px 6px;opacity:0;white-space:nowrap'
      cap.textContent = caption!
      this.root.insertBefore(cap, this.cursor)
    }
    const follow = (): void => {
      if (!el.isConnected) return // the row left the table (sold): the frame stays where it was
      const r = el.getBoundingClientRect()
      box.style.left = `${r.left - pad}px`; box.style.top = `${r.top - pad}px`; box.style.width = `${r.width + pad * 2}px`; box.style.height = `${r.height + pad * 2}px`
      if (cap !== undefined) { cap.style.left = `${r.left - pad}px`; cap.style.top = `${r.top - pad - cap.offsetHeight - 6}px` }
    }
    this.cue('highlight')
    void this.tween(sec, t => {
      follow()
      const a = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1
      box.style.opacity = String(a); if (cap !== undefined) cap.style.opacity = String(a)
    }, t => t).then(() => { box.remove(); cap?.remove() })
  }

  /** a browser window sliding in over the app with a screenshot of a real page (WhatsOnChain) */
  async window (src: string, url: string, caption: string, sec: number): Promise<void> {
    const w = document.createElement('div')
    w.style.cssText = 'position:absolute;left:7%;top:9%;width:86%;height:82%;background:#f4f4f4;border:3px solid #1d1f2b;box-shadow:8px 8px 0 rgba(0,0,0,.35);overflow:hidden;opacity:0;transform:translateY(24px) scale(.97)'
    w.innerHTML = `<div style="height:44px;background:#e3e3e3;border-bottom:2px solid #bdbdbd;display:flex;align-items:center;gap:8px;padding:0 14px;font:16px var(--font-body);color:#333">
      <span style="width:12px;height:12px;border-radius:6px;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:6px;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:6px;background:#28c840"></span>
      <span style="margin-left:14px;flex:1;background:#fff;border:1px solid #c8c8c8;border-radius:6px;padding:4px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🔒 ${url}</span></div>
      <div style="position:absolute;top:44px;left:0;right:0;bottom:0;overflow:hidden"><img alt="" style="width:100%;display:block;transform-origin:30% 20%"/></div>
      <div class="town-label town-label-gold" style="position:absolute;right:16px;bottom:16px;font-size:20px;padding:4px 10px">${caption}</div>`
    const img = w.querySelector('img')!
    img.src = src
    this.root.insertBefore(w, this.cursor)
    this.cue('window')
    await this.tween(0.45, t => { w.style.opacity = String(t); w.style.transform = `translateY(${24 * (1 - t)}px) scale(${0.97 + 0.03 * t})` })
    await this.tween(Math.max(0.1, sec - 0.9), t => { img.style.transform = `scale(${1 + 0.06 * t})` }, x => x)
    await this.tween(0.45, t => { w.style.opacity = String(1 - t); w.style.transform = `translateY(${12 * t}px) scale(${1 - 0.02 * t})` })
    w.remove()
  }

  /** A real mainnet transaction (WhatsOnChain API JSON) as a pixel card: inputs with their signature flags,
   *  outputs with what they carry (sats, BSV-21 credits, the agentcoop record); rows appear one by one. */
  async txCard (tx: WocTx, roles: { title: string, inputs: string[], outputs: string[] }, sec: number): Promise<void> {
    const w = document.createElement('div')
    w.className = 'frame-parchment'
    w.style.cssText = 'position:absolute;left:8%;top:10%;width:84%;height:80%;background:#fbf3df;box-shadow:8px 8px 0 rgba(0,0,0,.35);opacity:0;transform:translateY(24px);padding:22px 28px;box-sizing:border-box;color:#3f2832;font-family:var(--font-body)'
    const fmt = (n: number): string => n.toLocaleString('en-GB').replace(/,/g, ' ')
    const pill = (html: string, tone = '#f3e6c8'): string => `<div data-row style="opacity:0;transform:translateX(-8px);background:${tone};border:3px solid #3f2832;padding:6px 12px;margin:0 0 10px;font-size:19px;line-height:1.3">${html}</div>`
    const ins = tx.vin.map((v, i) => {
      const flags = /\[(SINGLE\|FORKID\|ANYONECANPAY|ALL\|FORKID)\]/.exec(v.scriptSig?.asm ?? '')?.[1] ?? ''
      const flag = flags.startsWith('SINGLE') ? 'SINGLE | ANYONECANPAY' : flags.startsWith('ALL') ? 'ALL' : ''
      return pill(`<b>input ${i}</b> · ${roles.inputs[i] ?? ''}<br><span style="font-family:var(--font-counter);font-size:18px;color:#743f39">signed ${flag}</span>`)
    })
    const outs = tx.vout.map((o, i) => {
      const asm = o.scriptPubKey.asm ?? ''
      const parts = asm.split(' ')
      let what = `${fmt(Math.round(o.value * 1e8))} sat`
      let tone = '#f3e6c8'
      if (parts[1] === 'OP_IF' && parts[2] === '6582895') {
        try { const j = JSON.parse(hexText(parts[6] ?? '')) as { amt?: string }; what = `<b style="color:#33984b">${fmt(Number(j.amt ?? 0))} credits</b> · BSV-21 token`; tone = '#e4f2d8' } catch { what = 'BSV-21 token' }
      } else if (o.scriptPubKey.type === 'nulldata') { what = `OP_RETURN “${hexText(parts[2] ?? '')} ${hexText(parts[3] ?? '')}” record`; tone = '#fdf0c4' }
      return pill(`<b>output ${i}</b> · ${roles.outputs[i] ?? ''}<br><span style="font-size:18px">${what}</span>`, tone)
    })
    w.innerHTML = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
        <span class="town-label town-label-gold" style="font-size:20px;padding:3px 10px">BSV mainnet</span>
        <span style="font:24px var(--font-display)">${roles.title}</span>
        <span style="margin-left:auto;font:18px var(--font-counter)">block ${fmt(tx.blockheight)} · ${fmt(tx.size)} bytes</span></div>
      <div style="font:17px var(--font-counter);color:#743f39;margin-bottom:16px;word-break:break-all">txid ${tx.txid}</div>
      <div style="display:grid;grid-template-columns:1fr 64px 1.25fr;align-items:start">
        <div><div style="font:18px var(--font-display);margin-bottom:8px">${tx.vin.length} inputs</div>${ins.join('')}</div>
        <div style="font:40px var(--font-display);text-align:center;padding-top:60px">→</div>
        <div><div style="font:18px var(--font-display);margin-bottom:8px">${tx.vout.length} outputs</div>${outs.join('')}</div></div>
      <div style="position:absolute;left:28px;right:28px;bottom:16px;font-size:16px;color:#743f39">Read from the WhatsOnChain API · verify at whatsonchain.com/tx/${tx.txid.slice(0, 16)}…</div>`
    this.root.insertBefore(w, this.cursor)
    this.cue('window')
    const rows = [...w.querySelectorAll<HTMLElement>('[data-row]')]
    await this.tween(0.45, t => { w.style.opacity = String(t); w.style.transform = `translateY(${24 * (1 - t)}px)` })
    const reveal = Math.min(2.4, sec * 0.45)
    await this.tween(reveal, t => {
      rows.forEach((r, i) => { const k = Math.max(0, Math.min(1, t * rows.length - i)); r.style.opacity = String(k); r.style.transform = `translateX(${-8 * (1 - k)}px)` })
    }, x => x)
    await this.wait(Math.max(0.1, sec - 0.9 - reveal))
    await this.tween(0.45, t => { w.style.opacity = String(1 - t); w.style.transform = `translateY(${12 * t}px)` })
    w.remove()
  }

  /** the film's last frame shrinks into a box (the Town canvas), then fades into the live app */
  async shrinkInto (src: string, target: string | Element, sec = 1.4): Promise<void> {
    const img = document.createElement('img')
    img.alt = ''
    img.src = src
    img.style.cssText = 'position:absolute;left:0;top:0;width:100vw;height:100vh;object-fit:cover;image-rendering:pixelated'
    this.root.insertBefore(img, this.root.firstChild)
    await new Promise<void>(resolve => { if (img.complete) resolve(); else { img.onload = () => resolve(); img.onerror = () => resolve() } })
    const r = this.el(target).getBoundingClientRect()
    const W = window.innerWidth, H = window.innerHeight
    await this.wait(0.3)
    this.cue('whoosh')
    await this.tween(sec, t => {
      img.style.left = `${r.left * t}px`; img.style.top = `${r.top * t}px`
      img.style.width = `${W + (r.width - W) * t}px`; img.style.height = `${H + (r.height - H) * t}px`
    })
    await this.tween(0.5, t => { img.style.opacity = String(1 - t) }, x => x)
    img.remove()
  }

  private showSubtitle (text: string | undefined, ifText?: string): void {
    if (!this.subtitle.isConnected) return
    if (text === undefined) { if (this.subtitle.textContent === ifText) this.subtitle.style.display = 'none'; return }
    this.subtitle.textContent = text
    this.subtitle.style.display = 'block'
  }

  destroy (): void { this.root.remove() }
}
