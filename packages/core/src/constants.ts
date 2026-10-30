/**
 * Constants of MASTER §3.2 that Track C uses.
 * TEMPORARY copy created by Track C until A.P0 lands; Track A owns this file.
 */
import type { WalletProtocol } from '@bsv/sdk'

export const ARCADE_URL = 'https://arcade-v2-us-1.bsvblockchain.tech'

/** Provider revenue key: keyID = pool nonce, counterparty 'anyone'. */
export const PROVIDER_PROTOCOL: WalletProtocol = [1, 'agentcoop provider']
export const REVENUE_BASKET = 'agentcoop revenue'

/** Pledge coin key: keyID = random nonce, counterparty 'anyone'. */
export const PLEDGE_PROTOCOL: WalletProtocol = [1, 'agentcoop pledge']
export const PLEDGE_BASKET = 'agentcoop'

/** Redeem cap (§4.7): at most 20 credits per redeem, and at most 20 pending per agent. */
export const MAX_REDEEM_CREDITS = 20
export const MAX_PENDING_CREDITS = 20
