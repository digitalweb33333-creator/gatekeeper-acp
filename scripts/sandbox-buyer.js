// Sandbox buyer — runs the 10 graduation jobs against the deployed Gatekeeper seller.
// Requires a SEPARATE buyer agent (different wallet) + env. Budget ~0.50 USDC total.
// Run: node scripts/sandbox-buyer.js   (after the seller is live + registered + funded)
//
// Env required:
//   BUYER_AGENT_WALLET_ADDRESS, BUYER_ENTITY_ID (walletId), BUYER_AGENT_WALLET_PRIVATE_KEY (signer)
//   SELLER_AGENT_WALLET_ADDRESS   (Gatekeeper seller smart-account address)
import { AcpAgent, PrivyAlchemyEvmProviderAdapter, AssetToken } from "@virtuals-protocol/acp-node-v2";
import { base } from "@account-kit/infra";

const SELLER = process.env.SELLER_AGENT_WALLET_ADDRESS;
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AERO_BASE = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

// 10 jobs across offerings. Include safe tokens (expect GO) + a wallet screen + policy + monitor.
// Tip: add a known-honeypot address to one token_gate to demonstrate a real BLOCK to reviewers.
const JOBS = [
  ["policy_set", { policy: { max_sell_tax_pct: 10, min_liquidity_usd: 10000, risk_tolerance: "medium" } }],
  ["token_gate", { address: WETH_BASE }],
  ["token_gate", { address: USDC_BASE }],
  ["token_gate", { address: AERO_BASE }],
  ["wallet_screen", { address: "0x28C6c06298d514Db089934071355E5743bf21d60", chain: "ethereum" }],
  ["deep_forensics", { address: WETH_BASE }],
  ["approval_monitor", { tokens: [{ address: USDC_BASE, chain: "base" }, { address: AERO_BASE, chain: "base" }] }],
  ["token_gate", { address: WETH_BASE, chain: "base" }],
  ["wallet_screen", { address: SELLER || WETH_BASE }],
  ["token_gate", { address: AERO_BASE, chain: "base" }],
];

async function main() {
  if (!SELLER) throw new Error("Set SELLER_AGENT_WALLET_ADDRESS to the Gatekeeper seller wallet.");
  const buyer = await AcpAgent.create({
    provider: await PrivyAlchemyEvmProviderAdapter.create({
      walletAddress: process.env.BUYER_AGENT_WALLET_ADDRESS,
      walletId: process.env.BUYER_ENTITY_ID,
      signerPrivateKey: process.env.BUYER_AGENT_WALLET_PRIVATE_KEY,
      chains: [base],
    }),
  });
  const buyerAddress = await buyer.getAddress();
  let completed = 0;

  buyer.on("entry", async (session, entry) => {
    if (entry.kind !== "system") return;
    try {
      if (entry.event.type === "budget.set") await session.fund(AssetToken.usdc(0.01, session.chainId));
      else if (entry.event.type === "job.submitted") await session.complete("Sandbox deliverable verified.");
      else if (entry.event.type === "job.completed") {
        completed++;
        console.log(`✅ completed ${completed}/${JOBS.length} (job ${session.jobId})`);
        if (completed >= JOBS.length) { console.log("All sandbox jobs done."); await buyer.stop(); }
      }
    } catch (e) { console.error("entry error:", e.message); }
  });

  await buyer.start(() => console.log("buyer connected, submitting jobs…"));
  for (const [name, req] of JOBS) {
    try {
      const jobId = await buyer.createJobByOfferingName(base.id, name, SELLER, req, { evaluatorAddress: buyerAddress });
      console.log(`→ job ${jobId} "${name}"`);
      await new Promise((r) => setTimeout(r, 8000));
    } catch (e) { console.error(`createJob "${name}" failed:`, e.message); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
