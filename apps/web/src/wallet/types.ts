import type { WalletInterface } from '@bsv/sdk'

export type { WalletInterface }

/** Anything that can connect: the real WalletClient or the mock Desktop. */
export type WalletFactory = () => WalletInterface
