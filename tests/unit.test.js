import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreToken } from "../src/score.js";
import { token_gate, wallet_screen, policy_set, InputError } from "../src/offerings.js";

const gp = (raw) => ({ ok: true, raw, source: "goplus" });
const dex = (liq, age = 5000) => ({ ok: true, data: { liquidityUsd: liq, pairAgeHours: age, chain: "base" } });

test("honeypot => BLOCK", () => {
  const r = scoreToken({ goplus: gp({ is_honeypot: "1", is_open_source: "1" }), dex: dex(50000) });
  assert.equal(r.verdict, "BLOCK");
});

test("clean token => GO", () => {
  const r = scoreToken({ goplus: gp({ is_honeypot: "0", buy_tax: "0", sell_tax: "0", is_open_source: "1", is_mintable: "0", lp_holders: [{ address: "0xdead", is_locked: "1", percent: "1" }] }), dex: dex(5000000) });
  assert.equal(r.verdict, "GO");
  assert.ok(r.score >= 80);
});

test("missing data => never GO (conservative)", () => {
  const r = scoreToken({ goplus: { ok: false }, dex: dex(100000) });
  assert.notEqual(r.verdict, "GO");
  assert.equal(r.score, null);
});

test("policy tightens verdict (buyer max sell tax)", () => {
  const raw = { is_honeypot: "0", buy_tax: "0", sell_tax: "0.08", is_open_source: "1", lp_holders: [{ address: "0xdead", is_locked: "1", percent: "1" }] };
  const noPolicy = scoreToken({ goplus: gp(raw), dex: dex(5000000) });
  const withPolicy = scoreToken({ goplus: gp(raw), dex: dex(5000000), policy: { max_sell_tax_pct: 5 } });
  assert.equal(withPolicy.verdict, "BLOCK"); // policy violation forces block
  assert.notEqual(noPolicy.verdict, "BLOCK");
});

test("owner_change_balance heavily penalized (not GO)", () => {
  const r = scoreToken({ goplus: gp({ is_honeypot: "0", owner_change_balance: "1", is_open_source: "1", sell_tax: "0", buy_tax: "0" }), dex: dex(120000) });
  assert.notEqual(r.verdict, "GO");
});

test("token_gate rejects bad address", async () => {
  await assert.rejects(() => token_gate({ address: "nope" }), InputError);
});

test("wallet_screen rejects bad address", async () => {
  await assert.rejects(() => wallet_screen({ address: "nope" }), InputError);
});

test("policy_set requires buyer", async () => {
  await assert.rejects(() => policy_set({ policy: {} }, {}), InputError);
});

test("every verdict carries a disclaimer via offerings", () => {
  const r = scoreToken({ goplus: gp({ is_honeypot: "0", is_open_source: "1" }), dex: dex(100000) });
  assert.ok(r.disclaimer && /not financial advice/i.test(r.disclaimer));
});
