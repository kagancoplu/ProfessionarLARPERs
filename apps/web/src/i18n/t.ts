import { en, type I18nKey } from './en'

const lookup = (key: string): string | undefined => {
  let cur: unknown = en
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

/** `t('wallet.networkMismatch', { wallet: 'testnet', expected: 'mainnet' })`. Missing keys return the key itself. */
export function t (key: I18nKey, vars: Record<string, string | number> = {}): string {
  const raw = lookup(key)
  if (raw === undefined) return key
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}

export function hasKey (key: string): boolean { return lookup(key) !== undefined }
