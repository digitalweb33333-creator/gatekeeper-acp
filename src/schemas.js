// Discovery-optimized catalog. Descriptions written as dense answers to what a buyer agent
// types before trading: "is this token safe", "honeypot check", "rug pull detection",
// "token security scan", "pre-trade check". Source of authority named (GoPlus, honeypot.is).

export const AGENT = {
  name: "Gatekeeper — Token Safety Check",
  slug: "gatekeeper",
  description:
    "Pre-trade token safety gate for AI agents. One call returns a composite GO / CAUTION / BLOCK verdict with a 0–100 safety score and the exact reasons: honeypot detection, buy/sell tax, mint authority, owner powers, LP lock, holder concentration, and liquidity — across Base, Solana, Arbitrum, BNB and more (GoPlus covers 43 chains). Run it before every swap. Conservative by design: missing data never returns GO. Free known-scam lookup included; per-buyer risk policy via ACP Accounts and daily approval monitoring with Notification Memos. Informational, not financial advice.",
  tags: ["token-safety", "honeypot", "rug-check", "security", "pre-trade", "multichain", "audit"],
};

export const OFFERINGS_META = [
  {
    name: "token_gate",
    price: 0.04,
    description:
      "Is this token safe to trade? One composite verdict — GO / CAUTION / BLOCK — with a 0–100 safety score and listed reasons. Checks honeypot, buy/sell tax, mintable supply, owner-can-change-balance, hidden owner, pausable transfers, modifiable tax, LP lock, top-holder concentration, and liquidity. Multichain (Base/Solana/Arbitrum/BNB/Ethereum, chain auto-detected). Conservative: if data is missing it returns CAUTION, never GO. Use before every swap. Answers: is this a honeypot, is this a rug, is this token safe, token security scan.",
    input: {
      type: "object", required: ["address"],
      properties: {
        address: { type: "string", description: "Token contract address. EVM (0x…) or Solana base58, e.g. '0x4200000000000000000000000000000000000006'." },
        chain: { type: "string", enum: ["base", "solana", "arbitrum", "bnb", "ethereum"], description: "Optional chain hint; auto-detected otherwise." },
      },
    },
    output_example: {
      address: "0x…", chain: "base", verdict: "CAUTION", score: 62, confidence: "high",
      reasons: ["Supply is mintable (inflation risk).", "Low liquidity ($12000)."],
      signals: { is_honeypot: false, buy_tax_pct: 0, sell_tax_pct: 0, is_mintable: true, liquidity_usd: 12000, top10_concentration_pct: 47.2 },
      data_coverage: { goplus: true, market: true, holders: true },
      timestamp: "2026-07-02T18:00:00Z", freshness_seconds: 2,
      disclaimer: "Informational security signal … Not financial advice.",
    },
  },
  {
    name: "deep_forensics",
    price: 0.35,
    description:
      "Deep forensic report on a token: everything in token_gate plus a live honeypot buy/sell simulation (honeypot.is), deployer-wallet screening (is the creator linked to scams, how much supply they hold), and contract verification status. For high-stakes decisions before large positions. Answers: full rug/honeypot forensic audit, who deployed this token, is the deployer a scammer.",
    input: {
      type: "object", required: ["address"],
      properties: {
        address: { type: "string", description: "Token contract address (EVM recommended for the honeypot simulation)." },
        chain: { type: "string", enum: ["base", "arbitrum", "bnb", "ethereum"], description: "Optional chain hint." },
      },
    },
    output_example: {
      address: "0x…", chain: "base", verdict: "BLOCK", score: 18,
      honeypot_simulation: { isHoneypot: true, sellTaxPct: 100, honeypotReason: "Cannot sell" },
      deployer: { address: "0x…", reputation: { flags: ["phishing activities"], level: "high" }, creator_percent: 0.35 },
      timestamp: "2026-07-02T18:00:00Z",
    },
  },
  {
    name: "wallet_screen",
    price: 0.05,
    description:
      "Screen a wallet address for malicious history: phishing, scam, theft, sanctions, mixer, money-laundering and more (GoPlus address security + our local scam base). Returns GO or BLOCK with the flags found. Answers: is this address safe, is this wallet a scammer, sanctioned address check.",
    input: {
      type: "object", required: ["address"],
      properties: {
        address: { type: "string", description: "Wallet address to screen, e.g. '0x…'." },
        chain: { type: "string", enum: ["base", "arbitrum", "bnb", "ethereum"], description: "Optional chain context." },
      },
    },
    output_example: { address: "0x…", verdict: "BLOCK", risk_level: "high", reasons: ["phishing activities", "stealing attack"], timestamp: "2026-07-02T18:00:00Z" },
  },
  {
    name: "approval_monitor",
    price: 0.02,
    description:
      "Register tokens you hold or have approved. Gatekeeper re-checks them daily and sends you a Notification Memo the moment one transitions into CAUTION or BLOCK (e.g. tax raised, ownership reclaimed, LP pulled). The alert that catches a token going bad after you bought it. Answers: monitor my tokens for rug risk, alert me if a token I hold becomes dangerous.",
    input: {
      type: "object", required: ["tokens"],
      properties: {
        tokens: { type: "array", description: "Tokens to monitor.", items: { type: "object", required: ["address", "chain"], properties: {
          address: { type: "string", description: "Token address." },
          chain: { type: "string", enum: ["base", "solana", "arbitrum", "bnb", "ethereum"], description: "Chain." },
        } } },
      },
    },
    output_example: { ok: true, monitoring_count: 3, tokens: [{ address: "0x…", chain: "base", last_verdict: "GO" }], timestamp: "2026-07-02T18:00:00Z" },
  },
  {
    name: "policy_set",
    price: 0.02,
    description:
      "Set your personal risk policy (ACP Accounts): max acceptable buy/sell tax, minimum liquidity, max top-holder concentration, and overall risk tolerance. Future token_gate verdicts adapt to YOUR thresholds (can only tighten safety, never loosen). Answers: customize my safety thresholds, set my risk tolerance.",
    input: {
      type: "object", required: ["policy"],
      properties: {
        policy: { type: "object", description: "Thresholds.", properties: {
          max_buy_tax_pct: { type: "number", description: "e.g. 5" },
          max_sell_tax_pct: { type: "number", description: "e.g. 5" },
          min_liquidity_usd: { type: "number", description: "e.g. 20000" },
          max_top10_concentration_pct: { type: "number", description: "e.g. 50" },
          risk_tolerance: { type: "string", enum: ["low", "medium", "high"], description: "low = strictest." },
        } },
      },
    },
    output_example: { ok: true, policy: { max_sell_tax_pct: 5, min_liquidity_usd: 20000, risk_tolerance: "low" }, timestamp: "2026-07-02T18:00:00Z" },
  },
];

export const RESOURCE_META = {
  name: "known_scam_lookup",
  free: true,
  description:
    "Free read-only check: is this address a known scam / phishing / malicious address? Backed by our local scam base plus GoPlus. No payment required — the reflex pre-trade check. Upgrade to token_gate for a full token verdict.",
  path: "/resource/known-scam",
};
