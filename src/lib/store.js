// Per-buyer key-value persistence (watchlists, policies) — file-backed JSON.
// ACP "Accounts" primitive is the on-protocol equivalent; this local store is the
// source of truth the ACP account layer syncs from, and lets the service work in
// plain-HTTP/dev mode without the SDK.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data", "store");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function pathFor(ns) { return join(DATA_DIR, `${ns}.json`); }

function loadNs(ns) {
  const p = pathFor(ns);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
}
function saveNs(ns, obj) { writeFileSync(pathFor(ns), JSON.stringify(obj, null, 2)); }

// Normalize a buyer identity (wallet address) to a stable key.
export function buyerKey(addr) {
  return String(addr || "anon").toLowerCase();
}

export function getRecord(ns, buyer) {
  const db = loadNs(ns);
  return db[buyerKey(buyer)] || null;
}

export function setRecord(ns, buyer, record) {
  const db = loadNs(ns);
  db[buyerKey(buyer)] = { ...record, updatedAt: new Date().toISOString() };
  saveNs(ns, db);
  return db[buyerKey(buyer)];
}

export function allRecords(ns) {
  const db = loadNs(ns);
  return Object.entries(db).map(([buyer, record]) => ({ buyer, ...record }));
}
