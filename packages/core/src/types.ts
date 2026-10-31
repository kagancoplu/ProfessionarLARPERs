/**
 * AgentCoop shared types and constants.
 *
 * The on-chain formats these describe are documented in docs/reference/protocol.md.
 * Every package depends on them: change a format there and here together.
 */
import type { Transaction, UnlockingScript, WalletProtocol } from './sdk'

// ── Constants (MASTER §3.2) ──────────────────────────────────────────────────

/** OP_RETURN envelope: OP_FALSE OP_RETURN "agentcoop" <op> <json>. */
export const OP_RETURN_TAG = 'agentcoop'
export const COOP_OPS = ['pool', 'pledge', 'settle', 'list', 'vault', 'offer'] as const
export type CoopOp = typeof COOP_OPS[number]

/** Pledge coin keys: keyID = random nonce, counterparty 'anyone'. One active pledge per basket. */
export const PLEDGE_PROTOCOL: WalletProtocol = [1, 'agentcoop pledge']
export const PLEDGE_BASKET = 'agentcoop'

/** Vault keys: keyID = vaultId, counterparty 'anyone'. */
export const VAULT_PROTOCOL: WalletProtocol = [1, 'agentcoop vault']
export const VAULT_BASKET = 'agentcoop vault'
/** Vault-locked credits (A-P5 5.3/5.4): BSV-21 outputs on the vault script, spent agent + guard or by the owner. */
export const VAULT_CREDITS_BASKET = 'agentcoop vault credits'
/** Lighthouse pledge coins (A-P5 5.5): keys are VAULT_PROTOCOL with keyID = lhId. Separate basket: not "one active pledge". */
export const LIGHTHOUSE_BASKET = 'agentcoop lighthouse'

/** Provider revenue keys: keyID = poolNonce, counterparty 'anyone'. Settlement output 0 and fees land here. */
export const PROVIDER_PROTOCOL: WalletProtocol = [1, 'agentcoop provider']
export const REVENUE_BASKET = 'agentcoop revenue'
/**
 * Reserved offer credit UTXOs. The credit UTXO is locked to the provider key
 * keyID `offer <poolNonce>` (not to a token receive address), so TokenKit.sync
 * never pulls it into the `bsv21` basket and TokenKit.send never spends it.
 */
export const OFFERS_BASKET = 'agentcoop offers'

/** Market listings (track A 2.3): listed credits live on keyID `list <nonce>`, sale proceeds on keyID `pay <nonce>`. */
export const MARKET_PROTOCOL: WalletProtocol = [1, 'agentcoop market']
export const LISTINGS_BASKET = 'agentcoop listings'

/** Overlay names (BRC-87: no digits). Credit-token rules run inside the same topic. */
export const COOP_TOPIC = 'tm_agentcoop'
export const COOP_SERVICE = 'ls_agentcoop'

/** Sighash scopes. SIGHASH_FORKID = 0x40, SINGLE = 0x03, ANYONECANPAY = 0x80, ALL = 0x01. */
export const SIGHASH_ALL_FORKID = 0x01 | 0x40
export const SIGHASH_SINGLE_ACP_FORKID = 0x03 | 0x80 | 0x40

export const ARCADE_URL = 'https://arcade-v2-us-1.bsvblockchain.tech'

/** Redeem limits (credits): per call and pending per agent. */
export const MAX_REDEEM_CREDITS = 20
export const MAX_PENDING_REDEEM_CREDITS = 20

/** Coordinator: accept pledges up to 120% of target; at most 3 signing rounds; 60 s per round. */
export const OVERFILL_PERCENT = 120
export const MAX_SIGN_ROUNDS = 3
export const ROUND_TIMEOUT_MS = 60_000

/** P2PKH unlock: <73-byte checksig sig push> + <33-byte pubkey push>. */
export const P2PKH_UNLOCKING_SCRIPT_LENGTH = 108

// ── Types (MASTER §3.3) ──────────────────────────────────────────────────────

export interface PoolTerms {
  v: '1'
  poolId: string              // the credit UTXO's outpoint "txid_vout" (= the offer input)
  provider: string            // provider identity key (the wallet that signs the offer)
  providerApi: string         // https://... provider-api base URL
  tokenId: string             // BSV-21 kredi token id
  credits: string             // N, base units
  priceSats: string           // P, for the whole block
  payScriptHex: string        // output 0's locking script (P2PKH of the provider's revenue key)
  feeSats: string             // non-refundable registration fee per pledge (to the same payScript)
  minCredits: string          // the fewest credits one pledge may take
  deadlineHeight: string      // block height
  backstopMax?: string        // Y (backstop share; informational, not implemented)
  label: string               // "8×H100 · 1 week"
  retailSatsPerCredit: string // informational: retail price
}

export interface PledgeRecord {       // OP_RETURN op=pledge
  v: '1'
  poolId: string
  credits: string
  participant: string                 // identity key
  tokenIndex: string                  // receive address index for the credit output (kit addresses.ts)
  signer: 'p2pkh' | 'vault'           // the pledge coin's type; the coordinator derives unlockingScriptLength from it
  creditLock?: 'vault'                // only with signer:'vault': the credit output is locked to the pledge coin's vault script instead of a P2PKH (scripts/creditLock.ts)
  mode?: 'lighthouse'                 // with signer:'vault': the person signs SINGLE|ACP once and goes offline; the guard co-signs ALL in the settlement
  guard?: string                      // lighthouse: identity key of the guard the person chose
  lhId?: string                       // lighthouse: key keyID (32 hex); coin script = lighthouseLockingScript(participant, guard, lhId)
}
// Pledge tx layout (randomizeOutputs:false): out0 = pledge coin, out1 = feeSats → payScript, out2 = OP_RETURN pledge
// Change rule: in the settlement, a participant's change returns to its pledge coin's OWN locking script.

export interface Offer {              // the provider's pre-signed input (off-chain data)
  poolId: string                      // = outpoint
  unlockingScriptHex: string          // <sig SINGLE|ACP|FORKID> <pubkey>
  lockingScriptHex: string
  satoshis: number
  terms: PoolTerms
}

export interface Listing {            // market (op=list OP_RETURN + off-chain signature)
  outpoint: string
  tokenId: string
  credits: string
  askSats: string
  seller: string
  unlockingScriptHex: string
  lockingScriptHex: string
  payScriptHex: string                // the seller's payment script (the output at the same index)
}

export interface SettlementParticipant {
  outpoint: string
  participant: string
  credits: string
  signer: 'p2pkh' | 'vault'
  changeSats: string
  creditLock?: 'vault'                // from the pledge record; verifiers compare it with the on-chain record
  mode?: 'lighthouse'                 // no change (changeSats '0'); lighthouse participants come AFTER the interactive ones
}

export interface SettlementPlan {     // built by the coordinator, verified by the participants
  poolId: string
  round: number
  participants: SettlementParticipant[]
  pledgeListHash: string
  templateBEEF: number[]              // unsigned tx + every input's source tx (AtomicBEEF)
}

export interface InputSigner {        // implementations: P2pkhWalletSigner, VaultSigner
  unlockingScriptLength: number
  sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
}
