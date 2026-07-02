# GATEKEEPER — PLAN (long-term memory across sessions)

## Goal
Maximum ACP job VOLUME. Gatekeeper owns the **second mandatory pre-trade step**: *is it safe?*
It inserts before every swap in the largest, most solvent loop on ACP (trade execution:
152k jobs / 13k buyer-relationships — see `ANALYSE-VIRTUALS-VOLUME-2026-07-02.md` §3–§5).
Demand proven by WachAI (`verify_token` 6,137 jobs @ $1); the security category is otherwise empty.
We undercut ×20 ($0.04) to capture the whole loop and monetize on volume + Memos.

## Architecture (decided)
- **Pure scoring engine** (`src/score.js`): deterministic, unit-tested, and **backtested** — the
  single source of verdict truth. Conservative: missing data ⇒ CAUTION, never GO.
- Offerings (`src/offerings.js`) compose sources → engine → verdict. `token_gate` is the product;
  `deep_forensics` the margin tier; `wallet_screen`, `approval_monitor`, `policy_set` round it out.
- Sources isolated: `goplus` (primary intelligence, 43 chains), `honeypot` (live sim, EVM),
  `dexscreener` (liquidity/age), `holders` (concentration).
- Per-buyer **policy** (Accounts) can only tighten safety. **Approval monitor** (Memos) is the relance.

## Current state (2026-07-02)
- ✅ Scoring engine + all offerings built.
- ✅ **BLOCKING backtest PASSES: 0% false negatives** on 14 documented rug/honeypot signatures;
  0 false positives; live WETH=GO/100, USDC=GO/88.
- ✅ Unit tests 9/9; live smoke test green (0$).
- ✅ HTTP server verified: `/health` (goplus ok), free `known-scam` resource, `token_gate`, 400 validation.
- ✅ Fixed a real false positive: excluded weak GoPlus `honeypot_related_address` (flagged WETH).
- ✅ Discovery assets + guarded ACP adapter (setBudget→submit, default price $0.04).
- ⏳ ACP registration + sandbox + graduation → needs keys + web app actions (HUMAIN-ACTIONS.md).

## Remaining tasks
1. Human: register seller, create the 5 offerings with our schemas + free Resource, add signer, fund.
2. Provide `.env` keys → ACP mode + daily monitor worker auto-boot.
3. 10 sandbox jobs across offerings (include a known honeypot to show a real BLOCK); verify deliverables; graduate.
4. Grow the local known-scam base from confirmed BLOCKs; register on registries; wire ERC-8004.

## Failed approaches / gotchas (don't repeat)
- **GoPlus `address_security` false positives:** `honeypot_related_address` and `blacklist_doubt`
  fire on legit high-traffic contracts (WETH shows as honeypot-related because honeypots pair
  against it). Excluded from hard flags — only genuinely malicious flags (phishing, stealing,
  sanctioned, money-laundering, mixer…) count. False positives destroy trust.
- **address_security coverage is partial:** some sanctioned addresses (e.g. a Tornado router) return
  no flags. `wallet_screen` honestly reports "no flags found" rather than fabricating a verdict.
- **Keep the backtest deterministic:** the blocking pass/fail is on synthetic documented signatures
  (network-independent); the live blue-chip check is a soft false-positive guard that skips on
  network failure, so deploy builds don't break on upstream flakiness.
- Same Node/PATH note as Sonar (nvm node v24; ignore login-shell PATH warnings).
