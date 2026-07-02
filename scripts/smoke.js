// Live smoke test against real upstreams (0$): node scripts/smoke.js
import { token_gate, deep_forensics, wallet_screen, approval_monitor, policy_set, resource_known_scam } from "../src/offerings.js";

const WETH_BASE = "0x4200000000000000000000000000000000000006";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BUYER = "0xTESTBUYER000000000000000000000000000009";

const show = (l, o) => { console.log(`\n=== ${l} ===`); console.log(JSON.stringify(o, null, 2).slice(0, 1100)); };
const t = (l, p) => p.then((r) => show(l, r)).catch((e) => console.log(`\n=== ${l} ERROR: ${e.message}`));

console.log("GATEKEEPER live smoke test (0$).");
await t("resource_known_scam (free) WETH", resource_known_scam({ address: WETH_BASE, chain: "base" }));
await t("policy_set", policy_set({ policy: { max_sell_tax_pct: 5, min_liquidity_usd: 20000, risk_tolerance: "low" } }, { buyer: BUYER }));
await t("token_gate WETH/base (policy applied)", token_gate({ address: WETH_BASE }, { buyer: BUYER }));
await t("token_gate USDC/base", token_gate({ address: USDC_BASE }));
await t("wallet_screen (a random EOA)", wallet_screen({ address: "0x28C6c06298d514Db089934071355E5743bf21d60", chain: "ethereum" }));
await t("deep_forensics WETH/base", deep_forensics({ address: WETH_BASE }));
await t("approval_monitor", approval_monitor({ tokens: [{ address: USDC_BASE, chain: "base" }] }, { buyer: BUYER }));
console.log("\nSmoke test complete.");
