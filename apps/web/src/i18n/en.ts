/** Single dictionary (track-E §0: English only, i18n scaffold). Keys are dotted paths. */
export const en = {
  app: { name: 'AgentCoop', tagline: 'Group buying for agents. Nobody holds the money.' },
  nav: { town: 'Town', pools: 'Pools', market: 'Market', agents: 'My Agents', provider: 'Provider', owner: 'Owner', explorer: 'Explorer', metrics: 'Metrics', settings: 'Settings' },
  wallet: {
    connect: 'Connect BSV Desktop',
    connecting: 'Waiting for BSV Desktop…',
    connected: 'Connected',
    disconnect: 'Disconnect',
    networkMismatch: 'Your wallet is on {wallet}; this town runs on {expected}.',
    approveHint: 'Approve in BSV Desktop',
    nothingSent: 'Nothing was sent.'
  },
  mode: { live: 'LIVE', mock: 'MOCK', replay: 'REPLAY' },
  tags: { demoPricing: 'demo pricing', simulated: 'simulated GPU jobs', experimental: 'experimental', mock: 'MOCK' },
  health: { coop: 'Coordinator', overlay: 'Overlay', provider: 'Provider API', guard: 'Guard', agents: 'Agents', arcade: 'Arcade' },
  states: {
    loadingOverlay: 'Reading the overlay…',
    loadingService: 'Asking the {service}…',
    serviceDown: 'The {service} is not answering ({url}).',
    retry: 'Retry',
    noPools: 'No pools on the board yet. A provider opens the first one.',
    noEvents: 'The square is quiet. Events appear here as they reach the overlay.',
    noTxs: 'No transactions yet.'
  },
  metrics: { custody: 'Held in custody', savings: 'Village savings', settlements: 'Settlements', participants: 'Participants' },
  errors: {
    desktopUnreachable: 'BSV Desktop is not answering. Open it, unlock it and try again.',
    userRejected: 'You declined in BSV Desktop. Nothing was sent.',
    timeout: 'BSV Desktop did not answer in time.',
    unknown: 'Something went wrong: {detail}'
  }
} as const

type Leaves<T, P extends string = ''> = T extends string
  ? P
  : { [K in keyof T & string]: Leaves<T[K], P extends '' ? K : `${P}.${K}`> }[keyof T & string]

export type I18nKey = Leaves<typeof en>
