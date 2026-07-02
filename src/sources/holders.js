import { fetchJson } from "../lib/http.js";
import { CHAINS } from "../lib/chains.js";

// Holder concentration via Blockscout (keyless) where available. Degrades cleanly with a
// `coverage` field when an explorer is missing or the token isn't indexed.
export async function tokenHolders(chainKey, address) {
  const chain = CHAINS[chainKey];
  if (!chain || !chain.explorer) {
    return { ok: false, source: "blockscout", coverage: "unsupported_chain", chain: chainKey };
  }
  const base = chain.explorer;
  const [meta, holders] = await Promise.all([
    fetchJson(`${base}/tokens/${address}`, { timeoutMs: 4500, retries: 1 }),
    fetchJson(`${base}/tokens/${address}/holders`, { timeoutMs: 4500, retries: 1 }),
  ]);

  const holdersCount = meta.ok && meta.json ? Number(meta.json.holders || meta.json.holders_count || 0) || null : null;
  const decimals = meta.ok && meta.json ? Number(meta.json.decimals || 18) : 18;

  if (!holders.ok || !holders.json || !Array.isArray(holders.json.items)) {
    return { ok: holdersCount != null, source: "blockscout", chain: chainKey, holdersCount, coverage: "count_only" };
  }

  const items = holders.json.items.slice(0, 10).map((h) => ({
    address: h.address?.hash || h.address,
    value: h.value,
  }));
  // top-holder concentration (share of top10 of circulating shown). Best-effort: needs total supply.
  const totalSupply = meta.ok && meta.json && meta.json.total_supply ? Number(meta.json.total_supply) : null;
  let top10Pct = null;
  if (totalSupply && items.length) {
    const sumTop = items.reduce((s, h) => s + Number(h.value || 0), 0);
    top10Pct = +((sumTop / totalSupply) * 100).toFixed(2);
  }
  return {
    ok: true, source: "blockscout", chain: chainKey,
    holdersCount, decimals, top10ConcentrationPct: top10Pct,
    topHolders: items.map((h, i) => ({ rank: i + 1, address: h.address })),
    coverage: top10Pct != null ? "full" : "holders_no_supply",
  };
}
