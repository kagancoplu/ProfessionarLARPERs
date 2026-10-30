/**
 * AgentCoop shared types and constants.
 *
 * Source of truth: plan/00-MASTER-PLAN.md §3.2 (constants) and §3.3 (types).
 * These are frozen interfaces: change MASTER §3 first, then this file, then
 * announce it in plan/STATUS.md → "Arayüz değişiklikleri".
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
  poolId: string              // kredi UTXO outpoint'i "txid_vout" (= teklif girdisi)
  provider: string            // sağlayıcı identity key (teklifi imzalayan cüzdan)
  providerApi: string         // https://... provider-api kökü
  tokenId: string             // BSV-21 kredi token id
  credits: string             // N, base units
  priceSats: string           // P, tüm blok için
  payScriptHex: string        // çıktı 0'ın locking script'i (sağlayıcı gelir anahtarı P2PKH)
  feeSats: string             // pledge başına iadesiz kayıt bedeli (aynı payScript'e)
  minCredits: string          // bir pledge'in en az alabileceği kredi
  deadlineHeight: string      // blok yüksekliği
  backstopMax?: string        // Y (K3; şimdilik bilgi)
  label: string               // "8×H100 · 1 week"
  retailSatsPerCredit: string // bilgi: perakende fiyat
}

export interface PledgeRecord {       // OP_RETURN op=pledge
  v: '1'
  poolId: string
  credits: string
  participant: string                 // identity key
  tokenIndex: string                  // kredi çıktısının gideceği receive address index'i (kit addresses.ts)
  signer: 'p2pkh' | 'vault'           // pledge coin'in tipi → koordinatör unlockingScriptLength'i buradan bilir
  creditLock?: 'vault'                // A-P5 5.3, yalnızca signer:'vault' ile: kredi çıktısı P2PKH yerine pledge coin'in vault script'ine kilitli (scripts/creditLock.ts)
}
// Pledge tx düzeni (randomizeOutputs:false): out0 = pledge coin, out1 = feeSats → payScript, out2 = OP_RETURN pledge
// Para üstü kuralı: settlement'ta katılımcının para üstü, pledge coin'in KENDİ locking script'ine döner.

export interface Offer {              // sağlayıcının önceden imzalı girdisi (zincir dışı veri)
  poolId: string                      // = outpoint
  unlockingScriptHex: string          // <sig SINGLE|ACP|FORKID> <pubkey>
  lockingScriptHex: string
  satoshis: number
  terms: PoolTerms
}

export interface Listing {            // market (op=list OP_RETURN + zincir dışı imza)
  outpoint: string
  tokenId: string
  credits: string
  askSats: string
  seller: string
  unlockingScriptHex: string
  lockingScriptHex: string
  payScriptHex: string                // satıcının ödeme script'i (aynı index'teki çıktı)
}

export interface SettlementParticipant {
  outpoint: string
  participant: string
  credits: string
  signer: 'p2pkh' | 'vault'
  changeSats: string
  creditLock?: 'vault'                // pledge kaydından; doğrulayıcılar zincirdeki kayıtla karşılaştırır
}

export interface SettlementPlan {     // koordinatör üretir, katılımcılar doğrular
  poolId: string
  round: number
  participants: SettlementParticipant[]
  pledgeListHash: string
  templateBEEF: number[]              // imzasız tx + tüm girdilerin kaynak tx'leri (AtomicBEEF)
}

export interface InputSigner {        // A tanımlar; A: P2pkhWalletSigner, D: VaultSigner
  unlockingScriptLength: number
  sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
}
