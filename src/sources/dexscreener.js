import { fetchJson } from "../lib/http.js";

// DexScreener: price, liquidity, 24h volume, FDV, pair age, chain. Keyless, fast (~0.3s).
export async function dexScreenerToken(address) {
  const r = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { timeoutMs: 4000, retries: 2 });
  if (!r.ok || !r.json || !Array.isArray(r.json.pairs) || r.json.pairs.length === 0) {
    return { ok: false, source: "dexscreener", latencyMs: r.latencyMs };
  }
  // DexScreener `priceUsd` is always the BASE token's price. Keep only pairs where the
  // queried address is the base token, else we'd report the counter-asset's price
  // (e.g. querying USDC would surface AERO/USDC and return AERO's price). If the token is
  // only ever a quote asset (stablecoins), return not-ok so the caller falls back to CoinGecko.
  const addrLc = String(address).toLowerCase();
  const pairs = r.json.pairs
    .filter((p) => p && p.priceUsd && p.baseToken?.address?.toLowerCase() === addrLc)
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  if (pairs.length === 0) return { ok: false, source: "dexscreener", latencyMs: r.latencyMs, reason: "no_base_pair" };
  const p = pairs[0];
  const totalLiq = pairs.reduce((s, x) => s + (x.liquidity?.usd || 0), 0);
  const vol24 = pairs.reduce((s, x) => s + (x.volume?.h24 || 0), 0);
  return {
    ok: true,
    source: "dexscreener",
    latencyMs: r.latencyMs,
    data: {
      chain: p.chainId,
      priceUsd: Number(p.priceUsd),
      priceChange24hPct: p.priceChange?.h24 ?? null,
      liquidityUsd: Math.round(totalLiq),
      liquidityUsdTopPair: Math.round(p.liquidity?.usd || 0),
      volume24hUsd: Math.round(vol24),
      fdvUsd: p.fdv ?? null,
      marketCapUsd: p.marketCap ?? null,
      pairCreatedAt: p.pairCreatedAt ?? null,
      pairAgeHours: p.pairCreatedAt ? Math.round((Date.now() - p.pairCreatedAt) / 3.6e6) : null,
      dexId: p.dexId,
      baseToken: p.baseToken,
      quoteToken: p.quoteToken?.symbol,
      pairsCount: pairs.length,
    },
  };
}
