import { fetchJson } from "../lib/http.js";
import { getChain } from "../lib/chains.js";

// honeypot.is — live simulated buy/sell to detect honeypots and true tax (EVM only). Keyless.
// Used by deep_forensics as an independent second opinion vs GoPlus static analysis.
export async function honeypotSim(chainKey, address) {
  const chain = getChain(chainKey);
  if (!chain || !chain.evm) return { ok: false, source: "honeypot.is", reason: "evm_only" };
  const r = await fetchJson(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chain.chainId}`, { timeoutMs: 7000, retries: 1 });
  if (!r.ok || !r.json) return { ok: false, source: "honeypot.is", latencyMs: r.latencyMs };
  const j = r.json;
  const hp = j.honeypotResult || {};
  const sim = j.simulationResult || {};
  return {
    ok: true, source: "honeypot.is", latencyMs: r.latencyMs,
    data: {
      isHoneypot: hp.isHoneypot ?? null,
      honeypotReason: hp.honeypotReason ?? null,
      buyTaxPct: sim.buyTax ?? null,
      sellTaxPct: sim.sellTax ?? null,
      transferTaxPct: sim.transferTax ?? null,
      simulationSuccess: j.simulationSuccess ?? null,
      flags: j.flags ?? [],
    },
  };
}
