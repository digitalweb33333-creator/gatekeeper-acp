// Approval-monitor worker — the retention relance. Re-checks every buyer's monitored tokens
// and emits a Notification Memo when one transitions INTO risk (GO → CAUTION/BLOCK, or
// CAUTION → BLOCK). Pure evaluation (computeDueAlerts) is unit-tested; delivery is injected.
import { allRecords, setRecord } from "./lib/store.js";
import { token_gate } from "./offerings.js";

const RANK = { GO: 0, CAUTION: 1, BLOCK: 2 };

export async function computeDueAlerts() {
  const due = [];
  for (const rec of allRecords("monitor")) {
    const updated = [];
    for (const t of rec.tokens || []) {
      let verdict = t.last_verdict || "CAUTION";
      let reasons = [];
      try {
        const g = await token_gate({ address: t.address, chain: t.chain }, { buyer: rec.buyer });
        verdict = g.verdict; reasons = g.reasons || [];
      } catch { updated.push(t); continue; }
      const prev = t.last_verdict || "GO";
      if ((RANK[verdict] ?? 1) > (RANK[prev] ?? 0)) {
        due.push({ buyer: rec.buyer, address: t.address, chain: t.chain, from: prev, to: verdict, reasons: reasons.slice(0, 3) });
      }
      updated.push({ ...t, last_verdict: verdict, checked_at: new Date().toISOString() });
    }
    setRecord("monitor", rec.buyer, { tokens: updated });
  }
  return due;
}

function messageFor(a) {
  return `Gatekeeper alert: ${a.address.slice(0, 8)}… on ${a.chain} moved ${a.from} → ${a.to}. ${a.reasons?.[0] || ""} (Not financial advice.)`;
}

export function startWorker({ sendMemo } = {}) {
  const intervalMs = Number(process.env.MONITOR_INTERVAL_MS || 86_400_000); // daily
  const tick = async () => {
    try {
      const due = await computeDueAlerts();
      for (const a of due) {
        const msg = messageFor(a);
        if (sendMemo) await sendMemo(a.buyer, msg, a);
        else console.log(`[worker] (HTTP-only) would memo ${a.buyer}: ${msg}`);
      }
      if (due.length) console.log(`[worker] ${due.length} risk-transition alert(s)`);
    } catch (e) { console.error("[worker] tick error:", e.message); }
  };
  console.log(`[worker] approval-monitor started, interval ${intervalMs}ms`);
  tick();
  return setInterval(tick, intervalMs);
}
