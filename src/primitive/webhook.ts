const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

/**
 * Verify an HMAC-SHA256 signature over the raw body. The header name and signing scheme
 * are ASSUMPTIONS; confirm against Primitive's webhook docs before going live.
 * Fails closed: no secret or no signature means reject.
 */
export async function verifyWebhook(rawBody: string, signature: string | null, secret?: string): Promise<boolean> {
	if (!secret || !signature) return false;
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
	return safeEqual(mac, signature.replace(/^sha256=/, "").toLowerCase());
}
