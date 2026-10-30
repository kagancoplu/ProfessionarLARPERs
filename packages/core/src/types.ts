/**
 * Shared AgentCoop types: MASTER-PLAN §3.3, verbatim.
 * TEMPORARY copy created by Track C until A.P0 lands; Track A owns this file.
 */
import type { Transaction, UnlockingScript } from '@bsv/sdk'

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
  v: '1', poolId: string, credits: string
  participant: string                 // identity key
  tokenIndex: string                  // kredi çıktısının gideceği receive address index'i (kit addresses.ts)
  signer: 'p2pkh' | 'vault'           // pledge coin'in tipi → koordinatör unlockingScriptLength'i buradan bilir
}
// Pledge tx düzeni (randomizeOutputs:false): out0 = pledge coin, out1 = feeSats → payScript, out2 = OP_RETURN pledge
// Para üstü kuralı: settlement'ta katılımcının para üstü, pledge coin'in KENDİ locking script'ine döner.

export interface Offer {              // sağlayıcının önceden imzalı girdisi (zincir dışı veri)
  poolId: string                      // = outpoint
  unlockingScriptHex: string          // <sig SINGLE|ACP|FORKID> <pubkey>
  lockingScriptHex: string, satoshis: number
  terms: PoolTerms
}

export interface Listing {            // market (op=list OP_RETURN + zincir dışı imza)
  outpoint: string, tokenId: string, credits: string, askSats: string
  seller: string, unlockingScriptHex: string, lockingScriptHex: string
  payScriptHex: string                // satıcının ödeme script'i (aynı index'teki çıktı)
}

export interface SettlementPlan {     // koordinatör üretir, katılımcılar doğrular
  poolId: string, round: number
  participants: Array<{ outpoint: string, participant: string, credits: string, signer: 'p2pkh' | 'vault', changeSats: string }>
  pledgeListHash: string
  templateBEEF: number[]              // imzasız tx + tüm girdilerin kaynak tx'leri (AtomicBEEF)
}

export interface InputSigner {        // A tanımlar; A: P2pkhWalletSigner, D: VaultSigner
  unlockingScriptLength: number
  sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
}
