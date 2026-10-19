import { Hono } from "hono";
import { hall, job, type Env } from "../env";
import { primitiveGateway } from "./gateway";
import { verifyWebhook } from "./webhook";
import type { InboundMail } from "./types";

type E = Env & { PRIMITIVE_ALLOWED_SENDERS?: string };

// Signature header name is an ASSUMPTION; confirm against Primitive's webhook docs.
const SIG_HEADER = "x-primitive-signature";

const emailOf = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

/** Fail closed: an empty allowlist means nobody can spend by email. */
const allowed = (env: E, from: string) =>
	(env.PRIMITIVE_ALLOWED_SENDERS ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.includes(emailOf(from));

/** Best-effort replay guard (Cache API). A durable store should replace this before production. */
async function firstSeen(messageId: string): Promise<boolean> {
	const cache = (caches as unknown as { default: Cache }).default;
	const req = new Request(`https://primitive.invalid/seen/${encodeURIComponent(messageId)}`);
	if (await cache.match(req)) return false;
	await cache.put(req, new Response("1", { headers: { "cache-control": "max-age=86400" } }));
	return true;
}

export const primitiveRoutes = () => {
	const r = new Hono<{ Bindings: E }>();

	r.post("/api/primitive/inbound", async (c) => {
		const raw = await c.req.text();
		if (!(await verifyWebhook(raw, c.req.header(SIG_HEADER) ?? null, c.env.PRIMITIVE_WEBHOOK_SECRET))) {
			return c.json({ error: "bad signature" }, 401);
		}
		let mail: InboundMail;
		try {
			mail = JSON.parse(raw) as InboundMail;
		} catch {
			return c.json({ error: "bad json" }, 400);
		}
		if (!mail.messageId || !mail.from || typeof mail.text !== "string") return c.json({ error: "bad message" }, 400);
		if (!allowed(c.env, mail.from)) return c.json({ error: "sender not allowed" }, 403);
		if (!(await firstSeen(mail.messageId))) return c.json({ ok: true, duplicate: true });

		const goal = `${mail.subject ?? ""}\n${mail.text}`.trim().slice(0, 500);
		if (goal.length < 8) return c.json({ error: "goal is too short" }, 400);
		const cap = Number(c.env.DAILY_JOB_CAP ?? 25);
		if (!(await hall(c.env).allowJob(cap))) return c.json({ error: "daily job cap reached" }, 429);

		const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
		await hall(c.env).registerJob(id, goal);
		await job(c.env, id).start(id, goal, 2);

		const base = c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin;
		const sent = await primitiveGateway(c.env).send({
			to: mail.from,
			subject: `Re: ${mail.subject ?? "your job"}`,
			text: `Crew is forming. Watch it live: ${base}/?job=${id}\nI will ask before spending the budget and again before merging.`,
			threadId: mail.threadId ?? mail.messageId,
			idempotencyKey: `ack-${mail.messageId}`,
		});
		return c.json({ jobId: id, reply: sent.mode, replied: sent.ok });
	});

	return r;
};
