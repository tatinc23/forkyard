// Primitive inbound email -> ForkYard job. Mail is untrusted input that spends compute, so: signature, sender allowlist, daily cap, dedupe.
import { hall, job, type Env } from "../env";
import { verifyPrimitiveSignature } from "./signature";

const API = "https://api.primitive.dev/v1";

interface InboundEmail {
	id?: string;
	subject?: string;
	text?: string;
	sender?: { address?: string };
	parsed?: { body_text?: string };
	analysis?: { sender?: { authenticated?: boolean } };
}
interface PrimitiveEvent {
	id?: string;
	type?: string;
	event?: string;
	email?: InboundEmail;
	data?: { email?: InboundEmail };
}

/** Deterministic 8-char [a-z0-9] job id from the event id, so a retried delivery maps to the same job. */
async function jobIdFor(eventId: string): Promise<string> {
	const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`primitive:${eventId}`)));
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	return Array.from(d.slice(0, 8), (b) => alphabet[b % 36]).join("");
}

const allowed = (env: Env, sender: string) =>
	(env.PRIMITIVE_ALLOWED_SENDERS ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.includes(sender.toLowerCase());

/** Threaded reply via Primitive. Unique idempotency key per job so retries never double-send. */
async function reply(env: Env, emailId: string, jobId: string, text: string) {
	if (!env.PRIMITIVE_API_KEY) return;
	await fetch(`${API}/emails/${emailId}/reply`, {
		method: "POST",
		headers: { authorization: `Bearer ${env.PRIMITIVE_API_KEY}`, "content-type": "application/json", "idempotency-key": `forkyard-ack-${jobId}` },
		body: JSON.stringify({ body_text: text }),
	});
}

export async function handlePrimitiveWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
	const raw = await req.text();
	if (!env.PRIMITIVE_WEBHOOK_SECRET || !(await verifyPrimitiveSignature(raw, req.headers.get("primitive-signature"), env.PRIMITIVE_WEBHOOK_SECRET))) {
		return Response.json({ error: "bad signature" }, { status: 401 });
	}
	let evt: PrimitiveEvent;
	try {
		evt = JSON.parse(raw);
	} catch {
		return Response.json({ error: "bad json" }, { status: 400 });
	}
	// Always 2xx for events we intentionally ignore, so Primitive does not retry them.
	const type = evt.type ?? evt.event;
	if (type && type !== "email.received") return Response.json({ ignored: type });
	const email = evt.email ?? evt.data?.email;
	if (!evt.id || !email) return Response.json({ ignored: "no email" });

	const sender = email.sender?.address ?? "";
	if (email.analysis?.sender?.authenticated === false || !sender || !allowed(env, sender)) return Response.json({ ignored: "sender not allowed" });

	const goal = `${email.subject ?? ""}\n${email.text ?? email.parsed?.body_text ?? ""}`.trim().slice(0, 500);
	if (goal.length < 8) return Response.json({ ignored: "goal too short" });

	const id = await jobIdFor(evt.id);
	const exists = await job(env, id).view().then(() => true, () => false);
	if (exists) return Response.json({ duplicate: true, jobId: id });

	const cap = Number(env.DAILY_JOB_CAP ?? 25);
	if (!(await hall(env).allowJob(cap))) return Response.json({ ignored: "daily job cap reached" });
	await hall(env).registerJob(id, goal);
	ctx.waitUntil(
		(async () => {
			await job(env, id).start(id, goal, 2);
			if (email.id) await reply(env, email.id, id, `ForkYard job ${id} started. Review: ${env.PUBLIC_BASE_URL ?? ""}/#${id}`);
		})().catch((e) => console.error("primitive job failed", String(e))),
	);
	return Response.json({ jobId: id });
}
