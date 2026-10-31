/**
 * Every narrator line of the demo video, in one place: the scripts show them as subtitles, tools/voice.mjs
 * turns them into speech (Kokoro-82M) and tools/film-make.mjs lays the speech on the timeline. `say` is the
 * spoken form when the written one would be read badly (numbers, acronyms). `at` is the second, inside its
 * segment, where the line starts; `sec` how long its subtitle stays (at least as long as the speech).
 */
export type Segment = 'pool' | 'tour' | 'why' | 'manifesto'
/** the video in order, and how long each segment runs (seconds): 48 + 70 + 18 + 14 = 2:30 */
export const SEGMENTS: ReadonlyArray<{ id: Segment, sec: number }> = [{ id: 'pool', sec: 48 }, { id: 'tour', sec: 70 }, { id: 'why', sec: 18 }, { id: 'manifesto', sec: 14 }]
export const duration = (s: Segment): number => SEGMENTS.find(x => x.id === s)!.sec
export interface Line { id: string, segment: Segment, at: number, sec: number, text: string, say?: string }

export const LINES: readonly Line[] = [
  // "The Pool" (film mode, 48 s)
  { id: 'pool-1', segment: 'pool', at: 0.6, sec: 4.6, text: 'Compute is sold wholesale. Most of us only need a slice.' },
  { id: 'pool-2', segment: 'pool', at: 10.6, sec: 3.8, text: 'So Axel posts a pool on the notice board.' },
  { id: 'pool-3', segment: 'pool', at: 16, sec: 10, text: 'Everyone pledges only what they need, and nobody hands their money to anyone. Even AI agents can join, within the budget their owner set.' },
  { id: 'pool-4', segment: 'pool', at: 30.8, sec: 8.6, text: 'When the pool fills, one Bitcoin transaction pays the provider and delivers everyone\'s share. All at once, or not at all.' },
  { id: 'pool-5', segment: 'pool', at: 43.5, sec: 3, text: 'Now let\'s look behind the town.' },
  // the app tour (70 s): Town, Pools, Market, My agents
  { id: 'tour-town', segment: 'tour', at: 1.4, sec: 8.2, text: 'That village is a real market: AI agents buying GPU time together, on BSV. And the money we hold? Zero.' },
  { id: 'tour-offer', segment: 'tour', at: 10.4, sec: 7, text: 'A provider posts one bulk deal: a thousand GPU-hours at half price. It signs once, and can go offline.' },
  { id: 'tour-failed', segment: 'tour', at: 18, sec: 6.8, text: 'If a pool misses its deadline, nothing happens. No coin ever moved, so there\'s no refund to wait for.' },
  { id: 'tour-filled', segment: 'tour', at: 25.4, sec: 3.6, text: 'When it fills, this is the transaction, on mainnet.' },
  { id: 'tour-market', segment: 'tour', at: 34.2, sec: 3.8, text: 'Bought too much? Agents resell spare credits at the market.' },
  { id: 'tour-buy', segment: 'tour', at: 38.6, sec: 5.6, text: 'The seller signs once. Another agent buys them in one transaction, cheaper than retail.' },
  { id: 'tour-agents', segment: 'tour', at: 50.2, sec: 7.8, text: 'Each agent spends from a vault, with its owner\'s budget. Before signing, it checks five things, and signs only its own coin.' },
  { id: 'tour-guard', segment: 'tour', at: 58.6, sec: 4.2, text: 'A prompt injection says: spend it all? The guard refuses.' },
  { id: 'tour-rail', segment: 'tour', at: 64.2, sec: 4.6, text: 'And Coop Rail, our experimental swap, brings in USDC from Base.', say: 'And Coop Rail, our experimental swap, brings in U S D C from Base.' },
  // why BSV (18 s)
  { id: 'why-eth', segment: 'why', at: 0.8, sec: 5.9, text: 'On Ethereum, every buyer deposits into a contract, and a failed deal means refunds for all.' },
  { id: 'why-bsv', segment: 'why', at: 7.2, sec: 6.2, text: 'On BSV, there\'s nothing to deposit and nothing to refund: a hundred buyers in one transaction.' },
  { id: 'why-stack', segment: 'why', at: 14, sec: 2.8, text: 'And all of it runs on the BSV stack.', say: 'And all of it runs on the B S V stack.' },
  // manifesto (14 s)
  { id: 'manifesto-1', segment: 'manifesto', at: 0.8, sec: 4.3, text: 'Agents shouldn\'t need a middleman to buy together. On BSV, they don\'t.' },
  { id: 'manifesto-2', segment: 'manifesto', at: 5.6, sec: 4.8, text: 'Your coins stay yours until the deal is real, and then everything happens at once.' }
]

export function lines (segment: Segment): Line[] { return LINES.filter(l => l.segment === segment) }
export function line (id: string): Line {
  const l = LINES.find(x => x.id === id)
  if (l === undefined) throw new Error(`no narrator line ${id}`)
  return l
}
