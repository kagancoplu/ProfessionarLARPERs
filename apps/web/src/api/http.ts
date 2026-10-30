/** Small fetch helpers: JSON in/out, timeouts, typed errors. Every service module uses these. */
export class HttpError extends Error {
  constructor (readonly status: number, readonly url: string, readonly body?: unknown) {
    super(`HTTP ${status} from ${url}`)
    this.name = 'HttpError'
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  timeoutMs?: number
  /** replace the global fetch (AuthFetch in the wallet flows, a stub in tests) */
  fetchImpl?: typeof fetch
}

async function request<T> (url: string, init: RequestInit, opts: RequestOptions): Promise<T> {
  const { timeoutMs = 8_000, fetchImpl = fetch, ...rest } = opts
  const res = await fetchImpl(url, { ...rest, ...init, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let body: unknown = text
  try { body = text === '' ? undefined : JSON.parse(text) } catch { /* keep text */ }
  if (!res.ok) throw new HttpError(res.status, url, body)
  return body as T
}

export const getJson = <T>(url: string, opts: RequestOptions = {}): Promise<T> => request<T>(url, { method: 'GET' }, opts)

export const postJson = <T>(url: string, body: unknown, opts: RequestOptions = {}): Promise<T> =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) }, body: JSON.stringify(body) }, opts)

export const putJson = <T>(url: string, body: unknown, opts: RequestOptions = {}): Promise<T> =>
  request<T>(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) }, body: JSON.stringify(body) }, opts)
