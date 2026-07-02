import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { withExtraRpcs } from "./lib/chains.js";
import { OFFERINGS, resource_known_scam, InputError } from "./offerings.js";
import { AGENT, OFFERINGS_META, RESOURCE_META } from "./schemas.js";
import { addressSecurity } from "./sources/goplus.js";

withExtraRpcs(process.env.EXTRA_RPCS);
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 10000;
const startedAt = Date.now();

app.get("/", (_req, res) => {
  res.json({
    agent: AGENT.name, description: AGENT.description,
    offerings: OFFERINGS_META.map((o) => ({ name: o.name, price_usd: o.price })),
    free_resource: RESOURCE_META.path,
    docs: ["/llms.txt", "/.well-known/agent-card.json"],
    disclaimer: "Informational security signals; not financial advice.",
  });
});

app.get("/health", async (_req, res) => {
  const gp = await addressSecurity("ethereum", "0x0000000000000000000000000000000000000000").catch(() => ({ ok: false }));
  res.json({
    status: "ok",
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    upstream: { goplus: gp.ok ? "ok" : "degraded" },
    acp: process.env.WHITELISTED_WALLET_PRIVATE_KEY ? "configured" : "not_configured",
    time: new Date().toISOString(),
  });
});

// Free ACP Resource — known-scam lookup (GET ?address=0x…&chain=base).
app.get(RESOURCE_META.path, async (req, res) => {
  try { res.json(await resource_known_scam({ address: req.query.address, chain: req.query.chain })); }
  catch (e) { res.status(502).json({ error: "resource_unavailable", detail: String(e.message || e) }); }
});

// Offering compute endpoint (ACP job handler + local/dev testing).
app.post("/offering/:name", async (req, res) => {
  const fn = OFFERINGS[req.params.name];
  if (!fn) return res.status(404).json({ error: "unknown_offering", available: Object.keys(OFFERINGS) });
  const buyer = req.get("x-buyer-address") || req.body?.buyer || null;
  try { res.json(await fn(req.body || {}, { buyer })); }
  catch (e) {
    const code = e instanceof InputError ? 400 : 502;
    res.status(code).json({ error: code === 400 ? "invalid_input" : "upstream_error", detail: String(e.message || e) });
  }
});

app.get("/.well-known/agent-card.json", (_req, res) => {
  const p = join(__dirname, "..", "public", "agent-card.json");
  if (existsSync(p)) return res.type("application/json").send(readFileSync(p, "utf8"));
  res.status(404).json({ error: "not_found" });
});
app.get(["/llms.txt", "/.well-known/llms.txt"], (_req, res) => {
  const p = join(__dirname, "..", "public", "llms.txt");
  if (existsSync(p)) return res.type("text/plain").send(readFileSync(p, "utf8"));
  res.status(404).send("not found");
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[gatekeeper] http on :${PORT}`);
    if (process.env.WHITELISTED_WALLET_PRIVATE_KEY && process.env.SELLER_ENTITY_ID) {
      Promise.all([import("./acp.js"), import("./worker.js")])
        .then(([acp, worker]) => acp.startAcp().then(() => worker.startWorker({ sendMemo: acp.sendMemo })))
        .catch((e) => console.error("[gatekeeper] ACP/worker boot failed:", e.message));
    } else {
      console.log("[gatekeeper] ACP keys absent → HTTP-only mode (offerings testable at POST /offering/:name).");
    }
  });
}

export { app };
