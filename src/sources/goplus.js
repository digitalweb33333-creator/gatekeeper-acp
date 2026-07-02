import { fetchJson } from "../lib/http.js";
import { getChain } from "../lib/chains.js";

// GoPlus Security — keyless, 43 chains, ~0.8s. The primary intelligence source: honeypot,
// buy/sell tax, mint authority, owner powers, blacklist, proxy, LP lock, holder concentration.
export async function tokenSecurity(chainKey, address) {
  const chain = getChain(chainKey);
  if (!chain || !chain.goplus) return { ok: false, source: "goplus", reason: "unsupported_chain" };

  // Solana uses a distinct endpoint/shape.
  if (chain.key === "solana") {
    const r = await fetchJson(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${address}`, { timeoutMs: 6000, retries: 1 });
    const res = r.ok && r.json && r.json.result ? (r.json.result[address] || Object.values(r.json.result)[0]) : null;
    if (!res) return { ok: false, source: "goplus", chain: "solana", latencyMs: r.latencyMs };
    return { ok: true, source: "goplus", chain: "solana", latencyMs: r.latencyMs, raw: res, solana: true };
  }

  const r = await fetchJson(`https://api.gopluslabs.io/api/v1/token_security/${chain.goplus}?contract_addresses=${address}`, { timeoutMs: 6000, retries: 2 });
  if (!r.ok || !r.json || !r.json.result) return { ok: false, source: "goplus", chain: chain.key, latencyMs: r.latencyMs };
  const key = Object.keys(r.json.result).find((k) => k.toLowerCase() === String(address).toLowerCase()) || Object.keys(r.json.result)[0];
  const raw = r.json.result[key];
  if (!raw || Object.keys(raw).length === 0) return { ok: false, source: "goplus", chain: chain.key, reason: "not_indexed", latencyMs: r.latencyMs };
  return { ok: true, source: "goplus", chain: chain.key, latencyMs: r.latencyMs, raw };
}

// Address (wallet) reputation: phishing, scam, sanctioned, mixer, etc.
export async function addressSecurity(chainKey, address) {
  const chain = getChain(chainKey);
  const chainId = chain && chain.evm ? chain.chainId : 1;
  const r = await fetchJson(`https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${chainId}`, { timeoutMs: 6000, retries: 1 });
  if (!r.ok || !r.json || !r.json.result) return { ok: false, source: "goplus", latencyMs: r.latencyMs };
  return { ok: true, source: "goplus", latencyMs: r.latencyMs, raw: r.json.result };
}

// Normalize GoPlus "0"/"1"/absent to a tri-state boolean|null.
export function flag(v) {
  if (v === "1" || v === 1 || v === true) return true;
  if (v === "0" || v === 0 || v === false) return false;
  return null; // unknown / not provided
}
export function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
