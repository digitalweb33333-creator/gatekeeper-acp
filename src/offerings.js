import { cached } from "./lib/cache.js";
import { getChain, CHAINS } from "./lib/chains.js";
import { tokenSecurity, addressSecurity, flag } from "./sources/goplus.js";
import { dexScreenerToken } from "./sources/dexscreener.js";
import { tokenHolders } from "./sources/holders.js";
import { honeypotSim } from "./sources/honeypot.js";
import { scoreToken, DISCLAIMER } from "./score.js";
import { getRecord, setRecord } from "./lib/store.js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const now = () => new Date().toISOString();
class InputError extends Error { constructor(m) { super(m); this.code = 400; } }
export { InputError };
const isAddr = (a) => typeof a === "string" && /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(a);
function stamp(extra, sources, freshnessSeconds, disclaimer) {
  const base = { timestamp: now(), freshness_seconds: Math.max(0, Math.round(freshnessSeconds)), sources, ...extra };
  if (disclaimer) base.disclaimer = disclaimer;
  return base;
}

// Local known-scam base (seeded + grown by our own checks). Also feeds the free Resource.
let SCAMS = null;
function knownScams() {
  if (SCAMS) return SCAMS;
  const p = join(__dirname, "..", "data", "known_scams.json");
  SCAMS = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { addresses: {} };
  return SCAMS;
}

// ---- 1) token_gate ($0.04) — THE product ----
export async function token_gate(input = {}, ctx = {}) {
  const { address } = input;
  if (!isAddr(address)) throw new InputError("`address` must be a valid EVM (0x…) or Solana token address");
  const chainHint = getChain(input.chain);
  const buyer = ctx.buyer || input.buyer;
  const policy = buyer ? (getRecord("policy", buyer)?.policy || null) : null;

  const { value, ageMs } = await cached(`gate:${chainHint?.key || "auto"}:${address}`, 45_000, async () => {
    // Resolve chain: use hint, else detect via DexScreener.
    let chainKey = chainHint?.key;
    let dex = await dexScreenerToken(address);
    if (!chainKey) chainKey = dex.ok ? (getChain(dex.data.chain)?.key || "base") : "base";
    const [gp, holders] = await Promise.all([
      tokenSecurity(chainKey, address),
      tokenHolders(chainKey, address).catch(() => ({ ok: false })),
    ]);
    return { chainKey, dex, gp, holders };
  });

  const result = scoreToken({ goplus: value.gp, dex: value.dex, holders: value.holders, policy });
  // opportunistically record confirmed-bad tokens for the free resource
  if (result.verdict === "BLOCK") recordScam(address, value.chainKey, result.reasons.slice(0, 3).map((r) => r.code));

  return stamp({
    address, chain: value.chainKey,
    verdict: result.verdict, score: result.score, confidence: result.confidence,
    reasons: result.reasons.map((r) => r.msg),
    signals: result.signals,
    data_coverage: result.data_coverage,
    policy_applied: result.policy_applied,
  }, ["goplus", "dexscreener", "blockscout"], ageMs / 1000, DISCLAIMER);
}

// ---- 2) deep_forensics ($0.35) ----
export async function deep_forensics(input = {}, ctx = {}) {
  const gate = await token_gate(input, ctx);
  const chainKey = gate.chain;
  const address = input.address;
  const [hp, gp] = await Promise.all([
    honeypotSim(chainKey, address).catch(() => ({ ok: false })),
    tokenSecurity(chainKey, address).catch(() => ({ ok: false })),
  ]);
  const creator = gp.ok ? (gp.raw.creator_address || gp.raw.owner_address) : null;
  let deployer = null;
  if (creator && isAddr(creator)) {
    const as = await addressSecurity(chainKey, creator).catch(() => ({ ok: false }));
    deployer = {
      address: creator,
      reputation: as.ok ? summarizeAddressRisk(as.raw) : { coverage: "unavailable" },
      creator_percent: gp.ok ? gp.raw.creator_percent : null,
    };
  }
  return stamp({
    address, chain: chainKey,
    verdict: gate.verdict, score: gate.score,
    gate_reasons: gate.reasons,
    honeypot_simulation: hp.ok ? hp.data : { coverage: "unavailable" },
    deployer,
    contract: gp.ok ? { open_source: flag(gp.raw.is_open_source), proxy: flag(gp.raw.is_proxy), mintable: flag(gp.raw.is_mintable) } : { coverage: "unavailable" },
    forensic_note: "Cross-checks static analysis (GoPlus) against a live buy/sell simulation (honeypot.is) and screens the deployer wallet.",
  }, ["goplus", "honeypot.is", "dexscreener"], gate.freshness_seconds, DISCLAIMER);
}

// ---- 3) wallet_screen ($0.05) ----
export async function wallet_screen(input = {}) {
  const { address } = input;
  if (!isAddr(address)) throw new InputError("`address` must be a valid wallet address");
  const chainKey = getChain(input.chain)?.key || "ethereum";
  const { value, ageMs } = await cached(`wallet:${chainKey}:${address}`, 120_000, async () => addressSecurity(chainKey, address));
  const local = knownScams().addresses[address.toLowerCase()] || null;
  if (!value.ok && !local) {
    return stamp({ address, verdict: "CAUTION", risk: "unknown", reasons: ["No security data available for this address."], data_coverage: { goplus: false } }, ["goplus", "local"], ageMs / 1000, DISCLAIMER);
  }
  const risk = value.ok ? summarizeAddressRisk(value.raw) : { flags: [], level: "unknown" };
  const flags = [...(risk.flags || [])];
  if (local) flags.push(`locally flagged: ${local.reasons?.join(",") || "scam"}`);
  const verdict = flags.length ? "BLOCK" : "GO";
  return stamp({
    address, verdict, risk_level: flags.length ? "high" : "low",
    reasons: flags.length ? flags : ["No malicious-address flags found."],
    data_coverage: { goplus: value.ok, local: !!local },
  }, ["goplus", "local"], ageMs / 1000, DISCLAIMER);
}

// ---- 4) approval_monitor ($0.02 setup) — the retention relance ----
export async function approval_monitor(input = {}, ctx = {}) {
  const buyer = ctx.buyer || input.buyer;
  if (!buyer) throw new InputError("buyer identity required (ACP provides it automatically)");
  const tokens = Array.isArray(input.tokens) ? input.tokens : [];
  if (!tokens.length) throw new InputError("`tokens` must be a non-empty array of { address, chain }");
  for (const t of tokens) {
    if (!isAddr(t.address)) throw new InputError(`invalid address: ${t.address}`);
    if (!getChain(t.chain)) throw new InputError(`invalid chain: ${t.chain}`);
  }
  // baseline verdict per token so we only memo on a transition into risk
  const monitored = [];
  for (const t of tokens) {
    let verdict = "CAUTION";
    try { const g = await token_gate({ address: t.address, chain: t.chain }, { buyer }); verdict = g.verdict; } catch {}
    monitored.push({ address: t.address, chain: getChain(t.chain).key, last_verdict: verdict, since: now() });
  }
  const existing = getRecord("monitor", buyer) || { tokens: [] };
  const map = new Map(existing.tokens.map((t) => [`${t.chain}:${t.address.toLowerCase()}`, t]));
  for (const m of monitored) map.set(`${m.chain}:${m.address.toLowerCase()}`, m);
  const rec = setRecord("monitor", buyer, { tokens: [...map.values()].slice(0, 100) });
  return stamp({ ok: true, buyer, monitoring_count: rec.tokens.length, tokens: rec.tokens, note: "You'll receive a Notification Memo if any monitored token transitions into CAUTION/BLOCK." }, ["store"], 0, DISCLAIMER);
}

// ---- 5) policy_set (Accounts) ----
export async function policy_set(input = {}, ctx = {}) {
  const buyer = ctx.buyer || input.buyer;
  if (!buyer) throw new InputError("buyer identity required");
  const p = input.policy || {};
  const clean = {
    max_buy_tax_pct: numOrNull(p.max_buy_tax_pct),
    max_sell_tax_pct: numOrNull(p.max_sell_tax_pct),
    min_liquidity_usd: numOrNull(p.min_liquidity_usd),
    max_top10_concentration_pct: numOrNull(p.max_top10_concentration_pct),
    risk_tolerance: ["low", "medium", "high"].includes(p.risk_tolerance) ? p.risk_tolerance : "medium",
  };
  setRecord("policy", buyer, { policy: clean });
  return stamp({ ok: true, buyer, policy: clean, note: "Future token_gate verdicts adapt to this policy (can only tighten, never loosen safety)." }, ["store"], 0);
}

// ---- Free Resource: known_scam_lookup ----
export async function resource_known_scam(query = {}) {
  const address = query.address;
  if (!isAddr(address)) return stamp({ error: "provide ?address=0x…" }, ["local"], 0);
  const local = knownScams().addresses[address.toLowerCase()] || null;
  let goplusHit = null;
  try {
    const as = await addressSecurity(query.chain || "ethereum", address);
    if (as.ok) { const s = summarizeAddressRisk(as.raw); goplusHit = s.flags.length ? s.flags : null; }
  } catch {}
  const flagged = !!local || !!goplusHit;
  return stamp({
    free: true, address, flagged,
    sources_hit: [local ? "local_base" : null, goplusHit ? "goplus" : null].filter(Boolean),
    reasons: [...(local?.reasons || []), ...(goplusHit || [])],
    upgrade_hint: "For a full token verdict use token_gate ($0.04); to screen a wallet use wallet_screen ($0.05).",
  }, ["local", "goplus"], 0);
}

// helpers
function summarizeAddressRisk(raw) {
  // Only HARD malicious flags. Deliberately EXCLUDES weak associative signals like
  // `honeypot_related_address` and `blacklist_doubt`, which fire on legitimate high-traffic
  // contracts (e.g. WETH appears in honeypot pairs) and would cause trust-killing false positives.
  const RISKY = ["phishing_activities", "blackmail_activities", "stealing_attack",
    "fake_kyc", "malicious_mining_activities", "darkweb_transactions", "cybercrime", "money_laundering",
    "financial_crime", "sanctioned", "mixer", "fake_standard_interface"];
  const flags = RISKY.filter((k) => flag(raw[k]) === true).map((k) => k.replace(/_/g, " "));
  return { flags, level: flags.length ? "high" : "low" };
}
function recordScam(address, chain, reasons) {
  const db = knownScams();
  db.addresses[address.toLowerCase()] = { chain, reasons, seen: now() };
}
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export const OFFERINGS = { token_gate, deep_forensics, wallet_screen, approval_monitor, policy_set };
