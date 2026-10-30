/** The mock Desktop's approval window: a tiny store the Scroll dialog subscribes to. */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface ApprovalRequest { id: string, title: string, lines: string[] }

interface ApprovalState {
  pending?: ApprovalRequest
  queue: Array<{ req: ApprovalRequest, resolve: (ok: boolean) => void }>
  request: (req: Omit<ApprovalRequest, 'id'>) => Promise<boolean>
  answer: (ok: boolean) => void
}

let seq = 0

export const approvalStore = createStore<ApprovalState>()((set, get) => ({
  queue: [],
  request: req => new Promise<boolean>(resolve => {
    const item = { req: { ...req, id: `approval:${++seq}` }, resolve }
    const { pending } = get()
    if (pending === undefined) set(s => ({ pending: item.req, queue: [...s.queue, item] }))
    else set(s => ({ queue: [...s.queue, item] }))
  }),
  answer: ok => {
    const [head, ...rest] = get().queue
    head?.resolve(ok)
    set({ queue: rest, pending: rest[0]?.req })
  }
}))

export const useApproval = <T>(sel: (s: ApprovalState) => T): T => useStore(approvalStore, sel)
