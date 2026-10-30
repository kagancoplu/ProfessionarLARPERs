/**
 * Step labels shared by the live and the mock flows, so the "Under the hood" panel says the same thing in both modes.
 * Parametric labels (amounts, counts) stay next to their call.
 */
export const STEP = {
  buildPledge: 'Build the pledge in BSV Desktop (coin stays in your wallet)',
  cancelPledge: 'Spend the pledge coin back to your wallet',
  submitOverlay: 'Submit to the overlay (tm_agentcoop)',
  fetchOffer: 'Fetch the provider\'s signed offer',
  verifySettlement: 'Verify the whole settlement (DvP, pledge-list hash, provider lineage from the token deploy)',
  signInput: 'Sign my input with SIGHASH_ALL in BSV Desktop',
  signatureSent: 'Signature sent to the coordinator',
  takeChange: 'Take my change back into the agentcoop basket',
  syncCredits: 'Sync my credits (bsv21 basket)',
  readCatalog: 'Read the provider catalog (who to pay the credits to)',
  redeemAtProvider: 'Redeem at the provider (it verifies the lineage itself)',
  reserveAnnounce: 'Reserve the credits and announce the pool in BSV Desktop (T2)',
  signOffer: 'Sign the offer once: SIGHASH_SINGLE|ANYONECANPAY, then you can go offline',
  registerOffer: 'Register the offer with the coordinator',
  cancelPool: 'Spend the reserved credits back to your balance (the offer becomes void)',
  deriveVault: 'Derive the vault keys in BSV Desktop (owner key from your identity, keyID = vaultId)',
  putPolicy: 'PUT /policies/:agent at the guard (BRC-103, signed with your identity; no transaction)',
  signListing: 'Sign the listing once: SIGHASH_SINGLE|ANYONECANPAY ("the output at my index pays me askSats")',
  postListing: 'POST /listings at the coordinator (it verifies the outpoint and the signature)',
  cancelListing: 'Spend the listed credits back to your token address (the signature now spends nothing)',
  registerVault: 'Register the vault at the guard (BRC-103); it must derive the very same script'
} as const
