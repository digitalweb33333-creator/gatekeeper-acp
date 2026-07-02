// Pure composite scoring engine. Deterministic, unit-tested, and backtested against known
// rugs/honeypots BEFORE go-live. CONSERVATIVE RULE: missing critical data => never GO.
import { flag, num } from "./sources/goplus.js";

export const DISCLAIMER = "Informational security signal aggregated from public sources (GoPlus, DexScreener, honeypot.is, on-chain). Not financial advice. Absence of a flag is not a guarantee of safety.";

// Penalty catalog: [condition-derived], each pushes a reason with weight. Higher weight = riskier.
export function scoreToken({ goplus, dex, holders, policy } = {}) {
  const reasons = [];
  const signals = {};
  let score = 100;
  let block = false;
  const add = (weight, code, msg) => { score -= weight; reasons.push({ code, weight, msg }); };
  const critical = (code, msg) => { block = true; reasons.push({ code, weight: 100, msg, critical: true }); };

  const raw = goplus && goplus.ok ? goplus.raw : null;
  const dataMissing = !raw;

  if (raw && !goplus.solana) {
    const honeypot = flag(raw.is_honeypot);
    const cannotSell = flag(raw.cannot_sell_all);
    const cannotBuy = flag(raw.cannot_buy);
    const buyTax = num(raw.buy_tax);   // fraction e.g. 0.1 = 10%
    const sellTax = num(raw.sell_tax);
    signals.buy_tax_pct = buyTax != null ? +(buyTax * 100).toFixed(2) : null;
    signals.sell_tax_pct = sellTax != null ? +(sellTax * 100).toFixed(2) : null;
    signals.is_honeypot = honeypot;
    signals.is_open_source = flag(raw.is_open_source);
    signals.is_mintable = flag(raw.is_mintable);
    signals.is_proxy = flag(raw.is_proxy);
    signals.owner_change_balance = flag(raw.owner_change_balance);
    signals.hidden_owner = flag(raw.hidden_owner);
    signals.transfer_pausable = flag(raw.transfer_pausable);
    signals.slippage_modifiable = flag(raw.slippage_modifiable);
    signals.trading_cooldown = flag(raw.trading_cooldown);
    signals.external_call = flag(raw.external_call);
    signals.can_take_back_ownership = flag(raw.can_take_back_ownership);
    signals.selfdestruct = flag(raw.selfdestruct);
    signals.is_blacklisted = flag(raw.is_blacklisted);
    signals.creator_percent = num(raw.creator_percent);
    signals.holder_count = num(raw.holder_count);

    // ---- critical → BLOCK ----
    if (honeypot === true) critical("honeypot", "GoPlus flags this token as a honeypot (you may be unable to sell).");
    if (cannotSell === true) critical("cannot_sell", "Token cannot be sold (cannot_sell_all).");
    if (cannotBuy === true) critical("cannot_buy", "Token cannot be bought (cannot_buy).");
    if (buyTax != null && buyTax >= 0.5) critical("buy_tax_extreme", `Buy tax ${(buyTax * 100).toFixed(1)}% (≥50%).`);
    if (sellTax != null && sellTax >= 0.5) critical("sell_tax_extreme", `Sell tax ${(sellTax * 100).toFixed(1)}% (≥50%).`);
    if (flag(raw.selfdestruct) === true) critical("selfdestruct", "Contract can self-destruct.");
    if (flag(raw.is_blacklisted) === true) critical("blacklisted", "Token appears on a security blacklist.");

    // ---- high-risk penalties ----
    if (signals.owner_change_balance === true) add(40, "owner_change_balance", "Owner can arbitrarily change balances.");
    if (signals.hidden_owner === true) add(30, "hidden_owner", "Contract has a hidden owner.");
    if (signals.can_take_back_ownership === true) add(25, "take_back_ownership", "Ownership can be reclaimed after renounce.");
    if (signals.is_mintable === true) add(22, "mintable", "Supply is mintable (inflation risk).");
    if (signals.transfer_pausable === true) add(22, "pausable", "Transfers can be paused by owner.");
    if (signals.slippage_modifiable === true) add(18, "tax_modifiable", "Tax/slippage can be modified upward.");
    if (signals.is_proxy === true) add(12, "proxy", "Upgradeable proxy contract (logic can change).");
    if (signals.external_call === true) add(10, "external_call", "Contract makes external calls.");
    if (signals.trading_cooldown === true) add(8, "cooldown", "Trading cooldown enabled.");
    if (signals.is_open_source === false) add(20, "closed_source", "Contract is not open source / unverified.");

    // graduated tax penalties (below the extreme block threshold)
    for (const [k, t] of [["buy", buyTax], ["sell", sellTax]]) {
      if (t != null && t > 0.05 && t < 0.5) add(Math.min(30, Math.round((t * 100 - 5) * 1.2)), `${k}_tax`, `${k} tax ${(t * 100).toFixed(1)}%.`);
    }
    // creator concentration
    if (signals.creator_percent != null) {
      if (signals.creator_percent >= 0.2) add(20, "creator_hold_high", `Creator holds ${(signals.creator_percent * 100).toFixed(1)}% of supply.`);
      else if (signals.creator_percent >= 0.05) add(10, "creator_hold", `Creator holds ${(signals.creator_percent * 100).toFixed(1)}% of supply.`);
    }
    // LP lock
    const lp = Array.isArray(raw.lp_holders) ? raw.lp_holders : null;
    if (lp && lp.length) {
      const lockedShare = lp.filter((h) => flag(h.is_locked) === true || /burn|dead|0x000000000000000000000000000000000000dead/i.test(h.address || ""))
        .reduce((s, h) => s + (num(h.percent) || 0), 0);
      signals.lp_locked_pct = +(lockedShare * 100).toFixed(2);
      if (lockedShare < 0.5) add(20, "lp_unlocked", `Only ${(lockedShare * 100).toFixed(0)}% of LP is locked/burned (rug risk).`);
    } else {
      signals.lp_locked_pct = null;
    }
  } else if (raw && goplus.solana) {
    // Solana shape: mintable/freezable authorities
    signals.solana = true;
    signals.mintable = flag(raw.mintable?.status ?? raw.mintable);
    signals.freezable = flag(raw.freezable?.status ?? raw.freezable);
    if (signals.mintable === true) add(25, "sol_mintable", "Mint authority still enabled (supply inflatable).");
    if (signals.freezable === true) add(30, "sol_freezable", "Freeze authority enabled (accounts can be frozen).");
  }

  // ---- market context (DexScreener) ----
  if (dex && dex.ok) {
    const liq = dex.data.liquidityUsd;
    const ageH = dex.data.pairAgeHours;
    signals.liquidity_usd = liq;
    signals.pair_age_hours = ageH;
    if (liq != null) {
      if (liq < 5000) add(30, "liquidity_micro", `Very low liquidity ($${liq}) — easy to rug/drain.`);
      else if (liq < 20000) add(15, "liquidity_low", `Low liquidity ($${liq}).`);
    }
    if (ageH != null && ageH < 24) add(10, "pair_fresh", `Pair is ${ageH}h old (fresh listings are higher risk).`);
  } else {
    signals.liquidity_usd = null;
  }

  // ---- holder concentration ----
  if (holders && holders.ok && holders.top10ConcentrationPct != null) {
    signals.top10_concentration_pct = holders.top10ConcentrationPct;
    if (holders.top10ConcentrationPct > 80) add(30, "concentration_extreme", `Top 10 holders own ${holders.top10ConcentrationPct}% of supply.`);
    else if (holders.top10ConcentrationPct > 50) add(15, "concentration_high", `Top 10 holders own ${holders.top10ConcentrationPct}% of supply.`);
  }

  // ---- buyer policy (Accounts) — can only tighten, never loosen ----
  const policyViolations = [];
  if (policy) {
    if (policy.max_buy_tax_pct != null && signals.buy_tax_pct != null && signals.buy_tax_pct > policy.max_buy_tax_pct)
      policyViolations.push(`buy tax ${signals.buy_tax_pct}% > your max ${policy.max_buy_tax_pct}%`);
    if (policy.max_sell_tax_pct != null && signals.sell_tax_pct != null && signals.sell_tax_pct > policy.max_sell_tax_pct)
      policyViolations.push(`sell tax ${signals.sell_tax_pct}% > your max ${policy.max_sell_tax_pct}%`);
    if (policy.min_liquidity_usd != null && signals.liquidity_usd != null && signals.liquidity_usd < policy.min_liquidity_usd)
      policyViolations.push(`liquidity $${signals.liquidity_usd} < your min $${policy.min_liquidity_usd}`);
    if (policy.max_top10_concentration_pct != null && signals.top10_concentration_pct != null && signals.top10_concentration_pct > policy.max_top10_concentration_pct)
      policyViolations.push(`top10 concentration ${signals.top10_concentration_pct}% > your max ${policy.max_top10_concentration_pct}%`);
    for (const v of policyViolations) reasons.push({ code: "policy_violation", weight: 0, msg: `Policy: ${v}`, policy: true });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---- verdict ----
  let verdict;
  const tol = policy?.risk_tolerance || "medium";
  const goFloor = tol === "low" ? 85 : tol === "high" ? 70 : 80;
  const cautionFloor = tol === "high" ? 30 : 40;
  if (block) verdict = "BLOCK";
  else if (policyViolations.length) verdict = "BLOCK";
  else if (dataMissing) verdict = "CAUTION"; // conservative: never GO without data
  else if (score >= goFloor) verdict = "GO";
  else if (score >= cautionFloor) verdict = "CAUTION";
  else verdict = "BLOCK";

  // If we lacked GoPlus we cap confidence and never allow GO.
  if (dataMissing && verdict === "GO") verdict = "CAUTION";

  return {
    verdict,
    score: dataMissing ? null : score,
    confidence: dataMissing ? "low" : (dex && dex.ok ? "high" : "medium"),
    data_coverage: {
      goplus: !!(goplus && goplus.ok),
      market: !!(dex && dex.ok),
      holders: !!(holders && holders.ok && holders.top10ConcentrationPct != null),
    },
    reasons: reasons.sort((a, b) => (b.weight || 0) - (a.weight || 0)),
    signals,
    policy_applied: !!policy,
    disclaimer: DISCLAIMER,
  };
}
