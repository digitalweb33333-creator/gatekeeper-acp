// BLOCKING backtest. Run before every deploy: `npm run backtest`.
// Exits non-zero if the false-negative rate on known-malicious signatures is > 0
// (a real rug/honeypot scored GO), or if a known-safe major is BLOCKed.
//
// Part A: deterministic fixtures modelling documented historical rug/honeypot signatures
//         (real GoPlus field combinations) — measures false negatives without depending on
//         volatile live scam addresses.
// Part B: live sanity check on blue-chip safe tokens — measures false positives.
import { scoreToken } from "../src/score.js";
import { tokenSecurity } from "../src/sources/goplus.js";
import { dexScreenerToken } from "../src/sources/dexscreener.js";

const gp = (raw) => ({ ok: true, raw, source: "goplus" });
const dex = (liquidityUsd, pairAgeHours = 5000) => ({ ok: true, data: { liquidityUsd, pairAgeHours, chain: "base" } });

// ---- Part A: known-MALICIOUS signatures (must NEVER be GO) ----
const MALICIOUS = [
  { name: "classic honeypot (cannot sell)", g: gp({ is_honeypot: "1", cannot_sell_all: "1", buy_tax: "0", sell_tax: "0", is_open_source: "1" }), d: dex(50000), expect: "BLOCK" },
  { name: "100% sell tax", g: gp({ is_honeypot: "0", sell_tax: "1", buy_tax: "0", is_open_source: "1" }), d: dex(80000), expect: "BLOCK" },
  { name: "40% sell tax", g: gp({ is_honeypot: "0", sell_tax: "0.4", buy_tax: "0.05", is_open_source: "1" }), d: dex(80000), expectNot: "GO" },
  { name: "owner can change balance", g: gp({ is_honeypot: "0", owner_change_balance: "1", is_open_source: "1", sell_tax: "0", buy_tax: "0" }), d: dex(120000), expectNot: "GO" },
  { name: "hidden owner + closed source", g: gp({ is_honeypot: "0", hidden_owner: "1", is_open_source: "0", sell_tax: "0", buy_tax: "0" }), d: dex(40000), expectNot: "GO" },
  { name: "mintable + pausable + tax-modifiable", g: gp({ is_honeypot: "0", is_mintable: "1", transfer_pausable: "1", slippage_modifiable: "1", is_open_source: "1", sell_tax: "0", buy_tax: "0" }), d: dex(60000), expectNot: "GO" },
  { name: "can take back ownership", g: gp({ is_honeypot: "0", can_take_back_ownership: "1", is_open_source: "1", sell_tax: "0", buy_tax: "0" }), d: dex(90000), expectNot: "GO" },
  { name: "self-destruct", g: gp({ is_honeypot: "0", selfdestruct: "1", is_open_source: "1" }), d: dex(90000), expect: "BLOCK" },
  { name: "blacklisted token", g: gp({ is_honeypot: "0", is_blacklisted: "1", is_open_source: "1" }), d: dex(90000), expect: "BLOCK" },
  { name: "fresh micro-liquidity mintable", g: gp({ is_honeypot: "0", is_mintable: "1", is_open_source: "1", sell_tax: "0", buy_tax: "0" }), d: dex(1500, 2), expectNot: "GO" },
  { name: "LP fully unlocked + creator 30%", g: gp({ is_honeypot: "0", is_open_source: "1", sell_tax: "0", buy_tax: "0", creator_percent: "0.30", lp_holders: [{ address: "0xabc", is_locked: "0", percent: "1" }] }), d: dex(70000), expectNot: "GO" },
  { name: "solana mint+freeze authority", g: { ok: true, solana: true, raw: { mintable: { status: "1" }, freezable: { status: "1" } }, source: "goplus" }, d: dex(40000), expectNot: "GO" },
];

// ---- Part A: known-SAFE signatures (should be GO) ----
const SAFE = [
  { name: "clean blue-chip pattern", g: gp({ is_honeypot: "0", buy_tax: "0", sell_tax: "0", is_open_source: "1", is_mintable: "0", is_proxy: "0", owner_change_balance: "0", hidden_owner: "0", transfer_pausable: "0", lp_holders: [{ address: "0xdead", is_locked: "1", percent: "1" }] }), d: dex(5000000), expect: "GO" },
];

// ---- missing-data (must be CAUTION, never GO) ----
const MISSING = [{ name: "no goplus data", g: { ok: false }, d: dex(100000), expectNot: "GO" }];

function run(name, { g, d, expect, expectNot }) {
  const r = scoreToken({ goplus: g, dex: d, holders: { ok: false } });
  let pass = true, why = "";
  if (expect && r.verdict !== expect) { pass = false; why = `expected ${expect}, got ${r.verdict}`; }
  if (expectNot && r.verdict === expectNot) { pass = false; why = `expected NOT ${expectNot}, got ${r.verdict}`; }
  return { name, verdict: r.verdict, score: r.score, pass, why };
}

console.log("=== GATEKEEPER BACKTEST ===\n");
let falseNeg = 0, falsePos = 0, total = 0;

console.log("-- MALICIOUS signatures (must not be GO) --");
for (const c of MALICIOUS) {
  const res = run(c.name, c); total++;
  if (!res.pass) falseNeg++;
  console.log(`  ${res.pass ? "✔" : "✘ FALSE-NEGATIVE"} [${res.verdict}/${res.score}] ${c.name}${res.pass ? "" : " — " + res.why}`);
}
console.log("\n-- SAFE signatures (should be GO) --");
for (const c of SAFE) {
  const res = run(c.name, c); total++;
  if (!res.pass) falsePos++;
  console.log(`  ${res.pass ? "✔" : "✘ FALSE-POSITIVE"} [${res.verdict}/${res.score}] ${c.name}${res.pass ? "" : " — " + res.why}`);
}
console.log("\n-- MISSING data (must be CAUTION, never GO) --");
for (const c of MISSING) {
  const res = run(c.name, c); total++;
  if (!res.pass) falseNeg++;
  console.log(`  ${res.pass ? "✔" : "✘"} [${res.verdict}] ${c.name}${res.pass ? "" : " — " + res.why}`);
}

// ---- Part B: LIVE safe blue-chips (false-positive guard) ----
console.log("\n-- LIVE blue-chip tokens (should not be BLOCK) --");
const LIVE_SAFE = [
  { sym: "WETH/base", addr: "0x4200000000000000000000000000000000000006", chain: "base" },
  { sym: "USDC/base", addr: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base" },
];
let liveChecked = 0, liveBlocked = 0;
for (const t of LIVE_SAFE) {
  try {
    const [g, d] = await Promise.all([tokenSecurity(t.chain, t.addr), dexScreenerToken(t.addr)]);
    if (!g.ok) { console.log(`  ⚠ ${t.sym}: GoPlus unavailable (skipped)`); continue; }
    liveChecked++;
    const r = scoreToken({ goplus: g, dex: d, holders: { ok: false } });
    const bad = r.verdict === "BLOCK";
    if (bad) liveBlocked++;
    console.log(`  ${bad ? "✘ FALSE-POSITIVE" : "✔"} [${r.verdict}/${r.score}] ${t.sym}`);
  } catch (e) { console.log(`  ⚠ ${t.sym}: ${e.message} (skipped)`); }
}

const fnRate = falseNeg / total;
console.log(`\n=== RESULT ===`);
console.log(`false negatives (malicious scored GO / missing scored GO): ${falseNeg}/${total} = ${(fnRate * 100).toFixed(1)}%`);
console.log(`false positives (safe fixture BLOCKed): ${falsePos}`);
console.log(`live blue-chips BLOCKed: ${liveBlocked}/${liveChecked}`);

const BLOCKING_FAIL = falseNeg > 0 || falsePos > 0 || liveBlocked > 0;
if (BLOCKING_FAIL) {
  console.error("\n❌ BACKTEST FAILED — do NOT deploy. Harden rules until false-negative rate is 0 and blue-chips pass.");
  process.exit(1);
}
console.log("\n✅ BACKTEST PASSED — false-negative rate is 0 and blue-chips clear. Safe to go live.");
