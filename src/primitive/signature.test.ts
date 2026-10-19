import { describe, expect, it } from "vitest";
import { verifyPrimitiveSignature } from "./signature";

const SECRET = "whsec_test";
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ id: "evt_1", type: "email.received" });

// Independent signer so the test does not just call the code under test.
async function sign(body: string, t: number, secret = SECRET) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyPrimitiveSignature", () => {
	it("accepts a valid signature", async () => {
		const header = `t=${NOW},v1=${await sign(BODY, NOW)}`;
		expect(await verifyPrimitiveSignature(BODY, header, SECRET, 300, NOW)).toBe(true);
	});

	it("rejects a tampered body", async () => {
		const header = `t=${NOW},v1=${await sign(BODY, NOW)}`;
		expect(await verifyPrimitiveSignature(BODY + " ", header, SECRET, 300, NOW)).toBe(false);
	});

	it("rejects the wrong secret", async () => {
		const header = `t=${NOW},v1=${await sign(BODY, NOW, "other")}`;
		expect(await verifyPrimitiveSignature(BODY, header, SECRET, 300, NOW)).toBe(false);
	});

	it("rejects a stale timestamp (replay)", async () => {
		const old = NOW - 301;
		const header = `t=${old},v1=${await sign(BODY, old)}`;
		expect(await verifyPrimitiveSignature(BODY, header, SECRET, 300, NOW)).toBe(false);
	});

	it("rejects a timestamp too far in the future", async () => {
		const future = NOW + 301;
		const header = `t=${future},v1=${await sign(BODY, future)}`;
		expect(await verifyPrimitiveSignature(BODY, header, SECRET, 300, NOW)).toBe(false);
	});

	it("rejects missing or malformed headers and empty secret", async () => {
		expect(await verifyPrimitiveSignature(BODY, null, SECRET, 300, NOW)).toBe(false);
		expect(await verifyPrimitiveSignature(BODY, "garbage", SECRET, 300, NOW)).toBe(false);
		expect(await verifyPrimitiveSignature(BODY, `t=${NOW}`, SECRET, 300, NOW)).toBe(false);
		expect(await verifyPrimitiveSignature(BODY, `t=abc,v1=00`, SECRET, 300, NOW)).toBe(false);
		const header = `t=${NOW},v1=${await sign(BODY, NOW)}`;
		expect(await verifyPrimitiveSignature(BODY, header, "", 300, NOW)).toBe(false);
	});
});
