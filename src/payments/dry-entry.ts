// Bundling smoke test only: npx wrangler deploy --dry-run --outdir /tmp/gh-dry --name gadgethub-dry src/payments/dry-entry.ts
import { Hono } from "hono";
import { x402Routes, payAgent, type PaymentsEnv } from "./index";

const app = new Hono<{ Bindings: PaymentsEnv }>();
app.route("/", x402Routes());
app.get("/_dry/pay", async (c) => c.json(await payAgent(c.env, { agentId: "vanta", wallet: "0x0000000000000000000000000000000000000001", amount: 0.01, contractId: "dry" })));
export default app;
