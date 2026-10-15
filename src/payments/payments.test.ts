import { describe, expect, it, vi } from "vitest";
import type { FacilitatorClient } from "@x402/core/server";
import { payAgent, x402Routes, validAmount, walletFor, BASE_SEPOLIA } from "./index";

// Fake facilitator: advertises exact/base-sepolia without any network call.
const fakeFacilitator: FacilitatorClient = {
	getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: BASE_SEPOLIA }], extensions: [], signers: {} }) as never,
	verify: async () => ({ isValid: false, invalidReason: "test" }) as never,
	settle: async () => ({ success: false, errorReason: "test", transaction: "", network: BASE_SEPOLIA }) as never,
};
const args = { agentId: "vanta", wallet: "0x0000000000000000000000000000000000000001" as const, amount: 0.42, contractId: "c1" };

describe("payAgent", () => {
	it("simulates by default", async () => {
		const p = await payAgent({}, args);
		expect(p).toMatchObject({ contractId: "c1", agentId: "vanta", amount: 0.42, mode: "simulate", network: "base-sepolia" });
		expect(p.txHash).toBeUndefined();
		expect(typeof p.at).toBe("number");
	});
	it("simulates when mode=x402 but key is a placeholder or missing", async () => {
		expect((await payAgent({ PAYMENTS_MODE: "x402", BUYER_PRIVATE_KEY: "REPLACE_ME_x" }, args)).mode).toBe("simulate");
		expect((await payAgent({ PAYMENTS_MODE: "x402" }, args)).mode).toBe("simulate");
	});
	it("never throws: x402 failure degrades to simulate with an error", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const key = ("0x" + "11".repeat(32)) as `0x${string}`;
		const p = await payAgent({ PAYMENTS_MODE: "x402", BUYER_PRIVATE_KEY: key }, args); // no PUBLIC_BASE_URL
		expect(p.mode).toBe("simulate");
		expect(p.error).toMatch(/PUBLIC_BASE_URL/);
		const q = await payAgent({ PAYMENTS_MODE: "x402", BUYER_PRIVATE_KEY: key, PUBLIC_BASE_URL: "https://x.test" }, { ...args, amount: 99 });
		expect(q.mode).toBe("simulate");
		expect(q.error).toMatch(/outside/);
		spy.mockRestore();
	});
});

describe("validation", () => {
	it("amount bounds", () => {
		for (const n of [0, -1, 5.01, NaN, Infinity]) expect(validAmount(n)).toBe(false);
		for (const n of [0.000001, 0.42, 5]) expect(validAmount(n)).toBe(true);
	});
	it("every roster agent has a wallet", () => {
		for (const id of ["vanta", "quill", "sift", "ledger", "pixel", "a11y", "rookie", "warden"]) expect(walletFor(id)).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});
});

describe("GET /x402/pay/:agentId", () => {
	const app = x402Routes({ facilitator: fakeFacilitator });
	it("400 on bad amount, 404 on unknown agent, 400 on missing contract", async () => {
		expect((await app.request("/x402/pay/vanta?amount=0&contract=c1")).status).toBe(400);
		expect((await app.request("/x402/pay/vanta?amount=6&contract=c1")).status).toBe(400);
		expect((await app.request("/x402/pay/vanta?amount=abc&contract=c1")).status).toBe(400);
		expect((await app.request("/x402/pay/nobody?amount=1&contract=c1")).status).toBe(404);
		expect((await app.request("/x402/pay/vanta?amount=1")).status).toBe(400);
	});
	it("402 with payment requirements when unpaid", async () => {
		const res = await app.request("/x402/pay/vanta?amount=0.42&contract=c1", { headers: { Accept: "application/json" } });
		expect(res.status).toBe(402);
		const header = res.headers.get("PAYMENT-REQUIRED");
		const body = header ? JSON.parse(atob(header)) : await res.json();
		const req = body.accepts[0];
		expect(req).toMatchObject({ scheme: "exact", network: BASE_SEPOLIA, amount: "420000", payTo: walletFor("vanta") });
	});
});
