/** The project's mainnet transactions (root README "Example transactions"), shown by MainnetProof in every mode. */
export interface MainnetTx { kind: string, what: string, via: string, txid: string }

export const MAINNET_TXS: readonly MainnetTx[] = [
  { kind: 'T1', what: 'BSV-21 deploy+mint (also on BananaBlocks)', via: 'server wallet', txid: '762e6b083728f9cd653b938e2947a92e50d0a92218351b1c64b0fe1e696e089f' },
  { kind: 'T1', what: 'BSV-21 deploy+mint (also on BananaBlocks)', via: 'BSV Desktop', txid: '0ae50b8b69efd9d1b0dacc7cefaf8e4abaea9cd33f5e4e7c93af4d73d715437d' },
  { kind: 'T2', what: 'N-credit UTXO + OP_RETURN agentcoop pool', via: 'server wallet', txid: '9118788a77efb3854878d47c1edb199d03ecbf00ab8e3da32b0a907c8f18c77c' },
  { kind: 'T2', what: 'N-credit UTXO + OP_RETURN agentcoop pool', via: 'BSV Desktop', txid: '53a240f5c44123211c3befa737f7ce1cae356c15bd72256279e47f5e43d93ca6' },
  { kind: 'T2', what: 'N-credit UTXO + OP_RETURN agentcoop pool', via: 'BSV Desktop', txid: 'e48140bf079c25af91eda8060d25dc046dd7c6e50f66de37f95ec2a98e5134b2' },
  { kind: 'T3', what: 'Pledge coin, registration fee to the provider, OP_RETURN agentcoop pledge', via: 'server wallet', txid: '00f50d70bd5aa27c5e5333c92462ba9997cb57037ef9101df2c9ec4a0f423aef' },
  { kind: 'T3', what: 'Pledge coin, registration fee to the provider, OP_RETURN agentcoop pledge', via: 'server wallet', txid: '00d78d5789320dfc120b2e5361bb7d709a0d2eacee1b37c0497f08d5c82cde7a' },
  { kind: 'T3', what: 'Pledge coin, registration fee to the provider, OP_RETURN agentcoop pledge', via: 'server wallet', txid: '95bd801816fc20821be4af863e63b21a4c532acc1113d756fa1d5f6786f41410' },
  { kind: 'T3', what: 'Pledge coin, registration fee to the provider, OP_RETURN agentcoop pledge', via: 'server wallet', txid: '0a4c5fa4efe7fcac15205dc0c46a6239e4b48af6a0f2fcac8a9e6e846ddd88f6' },
  { kind: 'T3', what: 'Pledge coin, registration fee to the provider, OP_RETURN agentcoop pledge', via: 'BSV Desktop', txid: '67e3b14b4beb90a94d2fc63677241e211a45eab7cfb45a28094340b7f7173926' },
  { kind: 'T4', what: 'The coin spent back to its owner', via: 'server wallet', txid: '8849f78d78d874b61501c0b00ad85154d6e306ad77135808bcf75f42e03777a2' },
  { kind: 'T5', what: 'N inputs; provider paid and every participant’s credits in one tx; pledge-list hash', via: 'server wallet', txid: '6d320c9af886bd2514da2c4af0ed0c64477840e08564fb8b8e381270aa5b2763' },
  { kind: 'T5', what: 'N inputs; provider paid and every participant’s credits in one tx; pledge-list hash', via: 'server wallet', txid: '5314ab8b9fc731c824fd49a0bbb6a69bb0f57ad2fff11dda656d40eb6584a185' },
  { kind: 'T5', what: 'N inputs; provider paid and every participant’s credits in one tx; pledge-list hash', via: 'server wallet', txid: '9c6989197958fe637737c5b0708b5a7cc6bb711dabd1d00ddaeca51eb96119d1' },
  { kind: 'T6', what: 'BSV-21 transfer to the provider, and back', via: 'server wallet', txid: '958e646fde935c5548f4fe537e4c68871524fe1506e54b8aa8156de700321051' },
  { kind: 'T6', what: 'BSV-21 transfer to the provider, and back', via: 'server wallet', txid: '5354a7a58c28ba85fe735e93588a94e1673c2f9e3aa45856116bf929e497f4eb' },
  { kind: 'T6', what: 'BSV-21 transfer to the provider, and back', via: 'server wallet', txid: '937ff13b553deb23e68e41ee8d18d19ba40ceeebc826d6432d39a95846517409' },
  { kind: 'T7', what: 'BRC-29 payment to the provider', via: 'server wallet', txid: '5176e9eeb8604d83ba6154f10ddaf8e8dee66ad185338b0127f2fbf2efcf853f' },
  { kind: 'T7', what: 'BRC-29 payment to the provider', via: 'server wallet', txid: 'bee39537a16f75bb1ced8ea8dd8ad71e95610ef7f8c91d187267b3c271d94bb8' },
  { kind: 'T5v', what: 'A vault agent’s credits land on its vault script, not a P2PKH', via: 'server wallet', txid: '08a6455612925df713c4738b450d3018ee689ad9fcb064dbfb3555603ba47db5' },
  { kind: 'T5-L', what: 'Exact lighthouse coins, no change; humans offline during the round', via: 'BSV Desktop', txid: '83d339b8963c0f12cc038fc65e751be077386bee3ea045f5cc526e2cb9cd585c' },
  { kind: 'T8', what: 'Several sellers paid, buyer gets credits (lineage verified)', via: 'server wallet', txid: '675c33341427325ac458c40e1a0e35ba25995b4ca3653297ca1fe1348ee7231c' },
  { kind: 'T9', what: 'Vault funding: the vault script output', via: 'BSV Desktop', txid: '5b5e452c3b0c5c0e1fe0f093dcc36a5f357f71a9f96ff2d12c3a21db5e4eefd8' },
  { kind: 'T10', what: 'Spend through the multisig branch', via: 'server wallet', txid: '2e7912d41d9bef542539469f0c0742af4e6bacc9c2d0c566f66ef6a36ee82475' },
  { kind: 'T10', what: 'Spend through the multisig branch', via: 'server wallet', txid: '4390605025d780616cd11389b5b4941d948bace923aa3821d8b7ab5a6b9af51b' }
]
