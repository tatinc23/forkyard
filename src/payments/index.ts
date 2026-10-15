// Forkyard payments: x402 (v2 protocol) on Base Sepolia testnet. TEST USDC ONLY.
//
//  - payAgent():   called by the job DO at final sign-off. simulate mode (default) just records a Payout;
//                  x402 mode makes the buyer wallet pay the agent's paid endpoint through the public facilitator.
//  - x402Routes(): Hono sub-app serving GET /x402/pay/:agentId, protected by @x402/hono. Mount it on the
//                  main app with `app.route("/", x402Routes())` (or app.route("/x402", ...) is NOT needed: paths are absolute).
//
// Pair choice (see DECISIONS.md): @x402/hono 2.28 (server) + @x402/fetch 2.28 + @x402/evm 2.28 (client), all x402 v2.
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import { ExactEvmScheme as ExactEvmClientScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ROSTER } from "../shared/roster";
import WALLETS from "../shared/wallets.json";
import type { Payout } from "../shared/types";

export type PaymentsEnv = {
	PAYMENTS_MODE?: "simulate" | "x402";
	BUYER_PRIVATE_KEY?: string;
	X402_FACILITATOR_URL?: string;
	PUBLIC_BASE_URL?: string;
	/** Optional: a service binding / Fetcher to the Worker itself. If present, the self-call goes through it
	 *  (avoids a Worker fetching its own public URL). Not required. */
	PAYMENTS_SELF?: { fetch: typeof fetch };
};

/** A Payout, plus a human-readable reason when we fell back to simulate after an x402 failure. */
export type PayoutResult = Payout & { error?: string };

export const BASE_SEPOLIA = "eip155:84532" as const; // CAIP-2 for Base Sepolia (x402 v2)
export const DEFAULT_FACILITATOR = "https://x402.org/facilitator";
export const MAX_AMOUNT_USDC = 5;

const WALLET_OVERRIDES = WALLETS as Record<string, string>;

/** Wallet for an agent: scripts/gen-wallets.mjs output wins over the roster placeholder. */
export function walletFor(agentId: string): `0x${string}` | undefined {
	const w = WALLET_OVERRIDES[agentId] ?? ROSTER.find((a) => a.id === agentId)?.wallet;
	return w as `0x${string}` | undefined;
}

/** 0 < amount <= 5, finite. */
export function validAmount(n: number): boolean {
	return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT_USDC;
}

function usdcPrice(amount: number): string {
	// Money strings: "$0.42". USDC has 6 decimals.
	return "$" + amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function isRealKey(k: string | undefined): k is `0x${string}` {
	return !!k && /^0x[0-9a-fA-F]{64}$/.test(k) && !k.includes("REPLACE_ME");
}

function simulated(args: { agentId: string; amount: number; contractId: string }, error?: string): PayoutResult {
	const p: PayoutResult = { contractId: args.contractId, agentId: args.agentId, amount: args.amount, mode: "simulate", network: "base-sepolia", at: Date.now() };
	if (error) p.error = error;
	return p;
}

/** Pay one agent its wage. Never throws: any x402 failure degrades to a simulate-mode Payout (with `error`). */
export async function payAgent(
	env: PaymentsEnv,
	args: { agentId: string; wallet: `0x${string}`; amount: number; contractId: string },
): Promise<PayoutResult> {
	if (env.PAYMENTS_MODE !== "x402" || !isRealKey(env.BUYER_PRIVATE_KEY)) return simulated(args);
	try {
		if (!validAmount(args.amount)) throw new Error(`amount ${args.amount} outside (0, ${MAX_AMOUNT_USDC}]`);
		const base = (env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
		if (!base) throw new Error("PUBLIC_BASE_URL not set");
		const account = privateKeyToAccount(env.BUYER_PRIVATE_KEY);
		const pay = wrapFetchWithPaymentFromConfig(env.PAYMENTS_SELF ? env.PAYMENTS_SELF.fetch.bind(env.PAYMENTS_SELF) : fetch, {
			schemes: [{ network: BASE_SEPOLIA, client: new ExactEvmClientScheme(account) }],
			spendControls: { maxAmountPerPayment: "$" + MAX_AMOUNT_USDC }, // library default cap is $1
		});
		const url = `${base}/x402/pay/${encodeURIComponent(args.agentId)}?amount=${encodeURIComponent(String(args.amount))}&contract=${encodeURIComponent(args.contractId)}`;
		const res = await pay(url, { method: "GET" });
		if (!res.ok) throw new Error(`paid endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
		const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
		if (!header) throw new Error("no PAYMENT-RESPONSE header on paid response");
		const settled = decodePaymentResponseHeader(header) as { success?: boolean; transaction?: string; errorReason?: string };
		if (!settled.success || !settled.transaction) throw new Error(`settlement not successful: ${settled.errorReason ?? "no transaction hash"}`);
		return { contractId: args.contractId, agentId: args.agentId, amount: args.amount, mode: "x402", txHash: settled.transaction, network: "base-sepolia", at: Date.now() };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[payments] x402 payout failed for ${args.agentId}/${args.contractId}, falling back to simulate:`, msg);
		return simulated(args, msg);
	}
}

/**
 * Hono sub-app: GET /x402/pay/:agentId?amount=<usdc>&contract=<id>
 * The x402 route config is static per path, but price and payTo accept functions of the request, so a single
 * protected route pattern ("GET /x402/pay/:agentId") prices itself from ?amount and pays the roster wallet.
 * `opts.facilitator` is for tests (inject a fake FacilitatorClient); otherwise env X402_FACILITATOR_URL is used.
 */
export function x402Routes(opts: { facilitator?: FacilitatorClient } = {}): Hono<{ Bindings: PaymentsEnv }> {
	const app = new Hono<{ Bindings: PaymentsEnv }>();
	const cache = new Map<string, ReturnType<typeof paymentMiddleware>>();

	const middlewareFor = (facilitatorUrl: string) => {
		let mw = cache.get(facilitatorUrl);
		if (!mw) {
			const facilitator = opts.facilitator ?? new HTTPFacilitatorClient({ url: facilitatorUrl });
			const server = new x402ResourceServer(facilitator).register(BASE_SEPOLIA, new ExactEvmServerScheme());
			mw = paymentMiddleware(
				{
					"GET /x402/pay/:agentId": {
						accepts: [
							{
								scheme: "exact",
								network: BASE_SEPOLIA,
								price: (ctx) => usdcPrice(Number(ctx.adapter.getQueryParam?.("amount"))),
								payTo: (ctx) => walletFor(decodeURIComponent(ctx.path.split("/").pop() ?? "")) as string,
								maxTimeoutSeconds: 60,
							},
						],
						description: "Forkyard agent wage payout (Base Sepolia test USDC)",
						mimeType: "application/json",
					},
				},
				server,
			);
			cache.set(facilitatorUrl, mw);
		}
		return mw;
	};

	// 1. Validate before the paywall so a bad request never produces a bogus 402.
	app.use("/x402/pay/:agentId", async (c, next) => {
		const agentId = c.req.param("agentId");
		const amount = Number(c.req.query("amount"));
		if (!walletFor(agentId)) return c.json({ ok: false, error: `unknown agent ${agentId}` }, 404);
		if (!validAmount(amount)) return c.json({ ok: false, error: `amount must satisfy 0 < amount <= ${MAX_AMOUNT_USDC}` }, 400);
		if (!c.req.query("contract")) return c.json({ ok: false, error: "contract query param required" }, 400);
		await next();
	});
	// 2. x402 paywall (built per facilitator URL, cached).
	app.use("/x402/pay/:agentId", (c, next) => middlewareFor(c.env?.X402_FACILITATOR_URL || DEFAULT_FACILITATOR)(c, next));
	// 3. Only reached once payment verified; settlement happens after this handler returns.
	app.get("/x402/pay/:agentId", (c) => c.json({ ok: true, agentId: c.req.param("agentId"), contract: c.req.query("contract") }));
	return app;
}
