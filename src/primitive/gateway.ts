import type { Env } from "../env";
import type { OutboundMail, PrimitiveGateway, SendResult } from "./types";

const PLACEHOLDER = "PRIMITIVE_API_KEY_PLACEHOLDER";

/**
 * Mock gateway: records nothing, calls nothing. Safe default for the demo build.
 */
class MockGateway implements PrimitiveGateway {
	async send(mail: OutboundMail): Promise<SendResult> {
		return { ok: true, id: `mock_${mail.idempotencyKey}`, mode: "mock" };
	}
}

/**
 * Live gateway. The endpoint path and payload shape below are ASSUMPTIONS and must be
 * checked against https://docs.primitive.dev/docs before enabling PRIMITIVE_MODE=live.
 */
class LiveGateway implements PrimitiveGateway {
	constructor(private base: string, private key: string) {}
	async send(mail: OutboundMail): Promise<SendResult> {
		try {
			const res = await fetch(`${this.base}/v1/send`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${this.key}`,
					"idempotency-key": mail.idempotencyKey,
				},
				body: JSON.stringify(mail),
			});
			if (!res.ok) return { ok: false, id: "", mode: "live", error: `primitive ${res.status}` };
			const data = (await res.json().catch(() => ({}))) as { id?: string };
			return { ok: true, id: data.id ?? mail.idempotencyKey, mode: "live" };
		} catch (e) {
			return { ok: false, id: "", mode: "live", error: String(e) };
		}
	}
}

export function primitiveGateway(env: Env): PrimitiveGateway {
	const key = env.PRIMITIVE_API_KEY;
	const live = env.PRIMITIVE_MODE === "live" && !!key && key !== PLACEHOLDER;
	if (!live) return new MockGateway();
	return new LiveGateway(env.PRIMITIVE_API_BASE ?? "https://api.primitive.dev", key!);
}
