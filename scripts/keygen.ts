/**
 * Generate server wallet keys (MASTER-PLAN §6.2 step 3).
 *
 *   npx tsx scripts/keygen.ts --only-missing >> .env
 *
 * Prints `WALLET_<NAME>_KEY=<64 hex>` lines to stdout only. It never writes a
 * file; the redirect puts the keys in .env (gitignored). It refuses to print to
 * an interactive terminal unless --show is given, so keys stay out of
 * scrollback and screenshots. Back the keys up from .env into the team vault.
 */
import { WALLET_NAMES, hasKey } from './lib/env'
import { flag, run } from './lib/cli'
import { generateKeyLines } from './lib/keys'

run(async () => {
  const args = process.argv.slice(2)
  if (process.stdout.isTTY === true && !flag(args, '--show')) {
    throw new Error('refusing to print private keys to the terminal. Redirect into .env: npx tsx scripts/keygen.ts --only-missing >> .env (or pass --show)')
  }
  const { lines, skipped } = generateKeyLines(WALLET_NAMES, flag(args, '--only-missing') ? hasKey : () => false)
  if (lines.length > 0) process.stdout.write(lines.join('\n') + '\n')
  console.error(`keygen: ${lines.length} key(s) written to stdout${skipped.length > 0 ? `, skipped (already in .env): ${skipped.join(', ')}` : ''}`)
})
