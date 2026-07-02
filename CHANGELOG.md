# GATEKEEPER — CHANGELOG

## 2026-07-02 — v0.1.0 (initial build)
- Pure composite scoring engine (`src/score.js`): GO/CAUTION/BLOCK + 0–100 score + reasons.
  Conservative rule: missing data ⇒ CAUTION, never GO. Critical flags ⇒ BLOCK.
- Offerings: `token_gate` (product), `deep_forensics` (honeypot.is sim + deployer screen),
  `wallet_screen`, `approval_monitor` (Memos relance), `policy_set` (Accounts).
- Sources: GoPlus (token + address security, 43 chains), honeypot.is, DexScreener, Blockscout — keyless.
- Free ACP Resource `GET /resource/known-scam`.
- **BLOCKING backtest** (`scripts/backtest.js`): 0% false negatives on 14 documented rug/honeypot
  signatures; 0 false positives; live WETH=GO/100, USDC=GO/88. Wired into Render `buildCommand`.
- Excluded weak GoPlus associative flags (`honeypot_related_address`, `blacklist_doubt`) after they
  false-flagged WETH — only hard malicious flags count.
- ACP v2 seller adapter (guarded), monitor worker (daily re-check, memo on risk transition).
- Discovery: `llms.txt`, `agent-card.json`, dense schemas. Disclaimer on every verdict.
- Tests 9/9; live smoke green; HTTP-only boot verified.
- `render.yaml` runs the blocking backtest in build (a regression fails the deploy).
