// Verifies Primitive webhook signatures: header `Primitive-Signature: t=<unix-seconds>,v1=<hex hmac-sha256>`.
// HMAC is computed over `${t}.${rawBody}`. VERIFY this format against https://docs.primitive.dev/docs/signature-verification before shipping.
const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const safeEqual = (a: string, b: string) => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
};

export async function verifyPrimitiveSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
	if (!header || !secret) return false;
	const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
	const t = Number(parts.t);
	const sig = parts.v1;
	if (!Number.isFinite(t) || !sig) return false;
	if (Math.abs(nowSec - t) > toleranceSec) return false;
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`)));
	return safeEqual(mac, sig.toLowerCase());
}
