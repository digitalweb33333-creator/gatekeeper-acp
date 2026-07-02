// ACP v2 seller adapter. Activates ONLY when env keys are present; the HTTP service runs
// fine without it. Maps incoming ACP jobs to our offering functions and delivers results.
//
// Lifecycle (acp-node-v2, seller side):
//   buyer createJobByOfferingName(offeringName, ...) → we receive a "requirement" message
//   → setBudget(price) → buyer funds → on "job.funded" we compute + submit(deliverable).
// The offering name arrives as session.job.description (set by createJobByOfferingName).
//
// Offerings/prices/resources themselves are declared on the Service Registry web app
// (app.virtuals.io) — see HUMAIN-ACTIONS.md. This adapter is the runtime that fulfils them.
import { OFFERINGS } from "./offerings.js";
import { OFFERINGS_META, AGENT } from "./schemas.js";

const PRICE = Object.fromEntries(OFFERINGS_META.map((o) => [o.name, o.price]));
let AGENT_HANDLE = null;               // AcpAgent instance
const lastJobByBuyer = new Map();      // buyer -> { chainId, jobId } for memo delivery

function env(k) { return (process.env[k] || "").trim(); }

export async function startAcp() {
  let SDK, accountKit;
  try {
    SDK = await import("@virtuals-protocol/acp-node-v2");
    accountKit = await import("@account-kit/infra");
  } catch (e) {
    console.error("[gatekeeper-acp] SDK/peer deps not installed — staying HTTP-only. (", e.message, ")");
    return null;
  }
  const { AcpAgent, PrivyAlchemyEvmProviderAdapter, AssetToken } = SDK;
  const { base } = accountKit;

  const walletAddress = env("SELLER_AGENT_WALLET_ADDRESS");
  const walletId = env("SELLER_ENTITY_ID");
  const signerPrivateKey = env("WHITELISTED_WALLET_PRIVATE_KEY");
  const builderCode = env("SELLER_BUILDER_CODE") || undefined;
  if (!walletAddress || !walletId || !signerPrivateKey) {
    console.error("[acp] missing SELLER_AGENT_WALLET_ADDRESS / SELLER_ENTITY_ID / WHITELISTED_WALLET_PRIVATE_KEY — HTTP-only.");
    return null;
  }

  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress, walletId, signerPrivateKey, chains: [base], builderCode,
  });
  const agent = await AcpAgent.create({ provider });
  AGENT_HANDLE = { agent, AssetToken, chainId: base.id };

  agent.on("entry", async (session, entry) => {
    try {
      // Track buyer↔job for later memo delivery
      const buyer = session.roles?.includes("provider") ? clientOf(session, entry) : null;
      if (buyer) lastJobByBuyer.set(buyer.toLowerCase(), { chainId: session.chainId, jobId: session.jobId });

      // 1) Buyer's requirement arrives → set our price as the budget.
      if (entry.kind === "message" && entry.contentType === "requirement" && session.status === "open") {
        const offeringName = session.job?.description || safeParseName(entry.content);
        const price = PRICE[offeringName] ?? 0.04;
        await session.setBudget(AssetToken.usdc(price, session.chainId));
        console.log(`[acp] job ${session.jobId} "${offeringName}" → budget $${price}`);
        return;
      }

      // 2) Job funded → compute the deliverable and submit.
      if (entry.kind === "system" && entry.event?.type === "job.funded") {
        const offeringName = session.job?.description;
        const fn = OFFERINGS[offeringName];
        if (!fn) { await session.submit(JSON.stringify({ error: "unknown_offering", offeringName })); return; }
        const input = extractRequirement(session);
        const buyerAddr = clientOf(session, entry);
        let result;
        try { result = await fn(input, { buyer: buyerAddr }); }
        catch (e) { result = { error: "compute_error", detail: String(e.message || e) }; }
        await session.submit(JSON.stringify(result));
        console.log(`[acp] job ${session.jobId} "${offeringName}" delivered`);
        return;
      }

      if (entry.kind === "system" && entry.event?.type === "job.completed") {
        console.log(`[acp] job ${session.jobId} completed`);
      }
    } catch (e) {
      console.error("[acp] entry handler error:", e.message);
    }
  });

  await agent.start(() => console.log(`[acp] ${AGENT.name} listening for jobs on Base (${base.id})`));
  return AGENT_HANDLE;
}

// Best-effort extraction of the requirement JSON the buyer sent as the first message.
function extractRequirement(session) {
  const req = [...(session.entries || [])].reverse().find((e) => e.kind === "message" && e.contentType === "requirement");
  if (!req) return {};
  try { return JSON.parse(req.content); } catch { return {}; }
}
function clientOf(session, entry) {
  if (entry?.from) return entry.from;
  const m = (session.entries || []).find((e) => e.kind === "message" && e.from);
  return m?.from || null;
}
function safeParseName(content) { try { return JSON.parse(content)?._offering; } catch { return null; } }

// Used by the memo worker: deliver a Notification Memo to a buyer via their last job room.
export async function sendMemo(buyer, message) {
  if (!AGENT_HANDLE) { console.log(`[acp] (no agent) memo→${buyer}: ${message}`); return false; }
  const ref = lastJobByBuyer.get(String(buyer).toLowerCase());
  if (!ref) { console.log(`[acp] no job room for ${buyer}; memo not sent (needs an Account relationship).`); return false; }
  try {
    await AGENT_HANDLE.agent.sendMessage(ref.chainId, ref.jobId, message, "text");
    return true;
  } catch (e) { console.error("[acp] sendMemo failed:", e.message); return false; }
}
