/** Current block height, used to derive `failed` (height ≥ deadlineHeight with no settlement). */
export interface HeightSource {
  /** undefined when unknown (never fetched successfully). */
  height: () => Promise<number | undefined>
}

/** Arcade go-chaintracks height (guide §20.1), cached for 30 s; keeps the last known value on errors. */
export class ArcadeHeight implements HeightSource {
  private last?: { value: number, at: number }

  constructor (private readonly arcadeUrl: string, private readonly ttlMs = 30_000) {}

  async height (): Promise<number | undefined> {
    if (this.last !== undefined && Date.now() - this.last.at < this.ttlMs) return this.last.value
    try {
      const res = await fetch(`${this.arcadeUrl}/chaintracks/v2/height`)
      if (!res.ok) throw new Error(String(res.status))
      const { height } = await res.json() as { height: number }
      this.last = { value: height, at: Date.now() }
    } catch {
      // keep the last known height
    }
    return this.last?.value
  }
}

/** Fixed or test-controlled height. */
export class ManualHeight implements HeightSource {
  constructor (public value?: number) {}
  async height (): Promise<number | undefined> { return this.value }
}
