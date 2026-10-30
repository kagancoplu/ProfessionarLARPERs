/**
 * GEÇİCİ KOPYA (Track B, Faz 1): plan/00-MASTER-PLAN.md §3.3 tipleri.
 * @agentcoop/core (A.P0) `types.ts` hazır olunca bu dosya silinir ve import oradan yapılır.
 */

export interface PoolTerms {
  v: '1'
  poolId: string              // kredi UTXO outpoint'i "txid_vout"; zincirdeki OP_RETURN json'unda YOK, overlay türetir
  provider: string            // sağlayıcı identity key
  providerApi: string
  tokenId: string             // BSV-21 kredi token id
  credits: string             // N, base units
  priceSats: string           // P, tüm blok için
  payScriptHex: string        // çıktı 0'ın locking script'i
  feeSats: string             // pledge başına iadesiz kayıt bedeli (aynı payScript'e)
  minCredits: string
  deadlineHeight: string
  backstopMax?: string
  label: string
  retailSatsPerCredit: string
}

export interface PledgeRecord {       // OP_RETURN op=pledge
  v: '1'
  poolId: string
  credits: string
  participant: string
  tokenIndex: string
  signer: 'p2pkh' | 'vault'
}

export interface SettleRecord {       // OP_RETURN op=settle
  v: '1'
  poolId: string
  pledgeListHash: string
}

export interface Offer {
  poolId: string
  unlockingScriptHex: string
  lockingScriptHex: string
  satoshis: number
  terms: PoolTerms
}

export interface SettlementPlan {     // koordinatör üretir, katılımcılar doğrular
  poolId: string
  round: number
  participants: Array<{ outpoint: string, participant: string, credits: string, signer: 'p2pkh' | 'vault', changeSats: string }>
  pledgeListHash: string
  templateBEEF: number[]              // imzasız tx + tüm girdilerin kaynak tx'leri (AtomicBEEF)
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
