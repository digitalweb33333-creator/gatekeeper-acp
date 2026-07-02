// Canonical chain registry shared by all offerings. One place maps our chain keys to
// every upstream's identifier scheme, plus a redundant RPC pool for gas (the product edge:
// public Base/Arbitrum RPCs 403 individually, so we fall back across many).
export const CHAINS = {
  base: {
    key: "base", label: "Base", evm: true, chainId: 8453,
    dexscreener: "base", goplus: "8453", coingeckoNative: "ethereum", nativeSymbol: "ETH",
    rpcs: [
      "https://base-rpc.publicnode.com",
      "https://base.llamarpc.com",
      "https://1rpc.io/base",
      "https://base.drpc.org",
      "https://mainnet.base.org",
    ],
    explorer: "https://base.blockscout.com/api/v2",
  },
  ethereum: {
    key: "ethereum", label: "Ethereum", evm: true, chainId: 1,
    dexscreener: "ethereum", goplus: "1", coingeckoNative: "ethereum", nativeSymbol: "ETH",
    rpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
      "https://1rpc.io/eth",
      "https://eth.drpc.org",
      "https://cloudflare-eth.com",
    ],
    explorer: "https://eth.blockscout.com/api/v2",
  },
  arbitrum: {
    key: "arbitrum", label: "Arbitrum", evm: true, chainId: 42161,
    dexscreener: "arbitrum", goplus: "42161", coingeckoNative: "ethereum", nativeSymbol: "ETH",
    rpcs: [
      "https://arbitrum-one-rpc.publicnode.com",
      "https://arbitrum.llamarpc.com",
      "https://1rpc.io/arb",
      "https://arbitrum.drpc.org",
      "https://arb1.arbitrum.io/rpc",
    ],
    explorer: "https://arbitrum.blockscout.com/api/v2",
  },
  bnb: {
    key: "bnb", label: "BNB Chain", evm: true, chainId: 56,
    dexscreener: "bsc", goplus: "56", coingeckoNative: "binancecoin", nativeSymbol: "BNB",
    rpcs: [
      "https://bsc-rpc.publicnode.com",
      "https://binance.llamarpc.com",
      "https://1rpc.io/bnb",
      "https://bsc.drpc.org",
      "https://bsc-dataseed.binance.org",
    ],
    explorer: "https://bnb.blockscout.com/api/v2",
  },
  solana: {
    key: "solana", label: "Solana", evm: false,
    dexscreener: "solana", goplus: "solana", coingeckoNative: "solana", nativeSymbol: "SOL",
    rpcs: [
      "https://solana-rpc.publicnode.com",
      "https://api.mainnet-beta.solana.com",
      "https://1rpc.io/sol",
    ],
    explorer: null,
  },
  // XRPL is non-EVM, non-DEX-router; supported for native price only (best-effort).
  xrpl: {
    key: "xrpl", label: "XRPL", evm: false,
    dexscreener: null, goplus: null, coingeckoNative: "ripple", nativeSymbol: "XRP",
    rpcs: [], explorer: null,
  },
};

export const EVM_CHAINS = Object.values(CHAINS).filter((c) => c.evm);
export const CHAIN_KEYS = Object.keys(CHAINS);

export function getChain(key) {
  if (!key) return null;
  const k = String(key).toLowerCase();
  if (CHAINS[k]) return CHAINS[k];
  // accept aliases
  const alias = { bsc: "bnb", "binance-smart-chain": "bnb", eth: "ethereum", arb: "arbitrum", sol: "solana", xrp: "xrpl" };
  return alias[k] ? CHAINS[alias[k]] : null;
}

// Extra RPCs from env: "8453|https://...,42161|https://..."
export function withExtraRpcs(env) {
  if (!env) return;
  for (const pair of env.split(",")) {
    const [cid, url] = pair.split("|");
    const chain = Object.values(CHAINS).find((c) => String(c.chainId) === cid.trim());
    if (chain && url) chain.rpcs.unshift(url.trim());
  }
}
