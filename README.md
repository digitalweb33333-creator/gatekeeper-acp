# Gatekeeper — Token Safety & Rug/Honeypot Gate (Virtuals ACP)

One composite **GO / CAUTION / BLOCK** verdict (+ 0–100 score + reasons) before any swap.
Honeypot, buy/sell tax, mint authority, owner powers, LP lock, holder concentration, liquidity —
multichain (**GoPlus covers 43 chains**). **Conservative: missing data never returns GO.**
Informational only, not financial advice.

## Offerings
| Offering | Price | What |
|---|---|---|
| `token_gate` | $0.04 | composite GO/CAUTION/BLOCK verdict + score + reasons (the product) |
| `deep_forensics` | $0.35 | token_gate + honeypot.is live sim + deployer screening + contract verification |
| `wallet_screen` | $0.05 | wallet phishing/scam/theft/sanctions/mixer screening |
| `approval_monitor` | $0.02 | daily re-check of held tokens; Notification Memo on risk transition |
| `policy_set` | $0.02 | per-buyer risk thresholds (ACP Accounts); verdicts adapt |
| **Free resource** | $0 | `GET /resource/known-scam?address=0x…` |

## Run locally
```bash
npm install
npm run backtest          # BLOCKING gate — must pass (0% false negatives) before deploy
npm test                  # unit tests
npm start                 # HTTP-only mode if no ACP keys
node scripts/smoke.js     # live smoke test (0$)
```

## Safety design (non-negotiable)
- **Conservative rule:** any missing critical data ⇒ `CAUTION`, never `GO` (`src/score.js`).
- **Critical flags ⇒ BLOCK:** honeypot, cannot-sell, ≥50% tax, self-destruct, blacklist.
- **Backtest is blocking:** `scripts/backtest.js` asserts 0% false negatives on documented
  rug/honeypot signatures + no false positives on blue-chips. Wired into the Render `buildCommand`,
  so a regression fails the deploy.
- **Policy can only tighten**, never loosen safety.
- **Disclaimer** ("informational, not financial advice") on every verdict.
- No false-positive associative flags: weak GoPlus signals like `honeypot_related_address` are
  excluded (they fire on WETH etc.) — only hard malicious flags count.

## Architecture
Same shape as Sonar: pure offerings (`src/offerings.js`), a pure scoring engine (`src/score.js`,
unit-tested + backtested), isolated sources (`goplus`, `honeypot`, `dexscreener`, `holders`),
per-buyer store (Accounts), guarded ACP adapter (`src/acp.js`), monitor worker (`src/worker.js`).

## Env / Deploy
Copy `.env.example` → `.env` (never commit). Runs HTTP-only without keys. `render.yaml` runs the
blocking backtest in the build step; `plan: starter` avoids cold starts. Sources: GoPlus,
honeypot.is, DexScreener, Blockscout — all keyless.
