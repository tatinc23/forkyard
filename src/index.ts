// Forkyard Worker: API + WebSocket fan-out + sandboxed previews + x402 pay endpoints + static UI.
import { Hono } from "hono";
import { cleanNote } from "./plan/control";
import { INVALID_PLAN } from "./plan/edit";
import { hall, job, type Env } from "./env";
import { x402Routes } from "./payments";
import { mcpHandler } from "./mcp";
import { scaleParams } from "./scale/plan";
import { primitiveRoutes } from "./primitive/inbound";

export { Hall } from "./do/hall";
export { Job } from "./do/job";
export { Desk } from "./do/desk";

const app = new Hono<{ Bindings: Env }>();

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const paymentsMode =(env: Env) => (env.PAYMENTS_MODE === "x402" && env.BUYER_PRIVATE_KEY && !env.BUYER_PRIVATE_KEY.startsWith("REPLACE_ME") ? "x402" : "simulate");

/** Anything that spends money or compute needs the demo key. */
const requireKey = async (c: { env: Env; req: { header: (k: string) => string | undefined } }) =>
	!!c.env.DEMO_KEY && c.req.header("x-demo-key") === c.env.DEMO_KEY;

// Job ids are server-minted (8 lowercase alnum). Reject anything else before it reaches a Durable Object.
app.use("/api/jobs/:id/*", async (c, next) => (/^[a-z0-9]{8}$/.test(c.req.param("id")) ? next() : c.json({ error: "bad job id" }, 400)));
app.use("/api/jobs/:id", async (c, next) => (/^[a-z0-9]{8}$/.test(c.req.param("id")) ? next() : c.json({ error: "bad job id" }, 400)));

app.get("/api/hall", async (c) => c.json(await hall(c.env).view(paymentsMode(c.env))));

app.post("/api/jobs", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	const body = await c.req.json<{ goal?: string; budget?: number }>().catch(() => ({}) as { goal?: string; budget?: number });
	const goal = String(body.goal ?? "").trim().slice(0, 500);
	const budget = Math.max(0.1, Math.min(5, Number(body.budget ?? 2)));
	if (goal.length < 8) return c.json({ error: "goal is too short" }, 400);
	const cap = Number(c.env.DAILY_JOB_CAP ?? 25);
	if (!(await hall(c.env).allowJob(cap))) return c.json({ error: "daily job cap reached" }, 429);
	const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
	await hall(c.env).registerJob(id, goal);
	await job(c.env, id).start(id, goal, budget);
	return c.json({ jobId: id });
});

// The scale run: scripted agents (no model), a real fork + commit each, merged as a tree. Spends repo creation, so keyed + capped.
app.post("/api/scale", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	const body = await c.req.json<{ agents?: number; crews?: number }>().catch(() => ({}) as { agents?: number; crews?: number });
	const { agents, crews } = scaleParams(body);
	const cap = Number(c.env.DAILY_JOB_CAP ?? 25);
	if (!(await hall(c.env).allowJob(cap))) return c.json({ error: "daily job cap reached" }, 429);
	const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
	await hall(c.env).registerJob(id, `Forkyard scale run: ${agents} agents in ${crews} crews`);
	try {
		return c.json(await job(c.env, id).startScale(id, agents, crews));
	} catch (e) {
		return c.json({ error: `could not start: ${String(e).slice(0, 200)}` }, 500);
	}
});

app.get("/api/jobs/:id", async (c) => {
	try {
		return c.json(await job(c.env, c.req.param("id")).view());
	} catch {
		return c.json({ error: "not found" }, 404);
	}
});

app.get("/api/jobs/:id/events", async (c) => c.json(await job(c.env, c.req.param("id")).allEvents()));

for (const action of ["approve-budget", "signoff"] as const) {
	app.post(`/api/jobs/:id/${action}`, async (c) => {
		if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
		const stub = job(c.env, c.req.param("id"));
		try {
			if (action === "signoff") {
				const body = await c.req.json<{ decisions?: Record<string, string> }>().catch(() => ({}) as { decisions?: Record<string, string> });
				const decisions: Record<string, "approve" | "reject"> = {};
				for (const [k, v] of Object.entries(body.decisions ?? {})) if (/^[a-z0-9]{8}-c\d{1,2}$/.test(k) && (v === "approve" || v === "reject")) decisions[k] = v;
				return c.json(await stub.signoff(decisions));
			}
			// Optional edited plan. No body (or an empty one) = approve the Foreman's plan exactly as proposed.
			const text = (await c.req.text().catch(() => "")).trim();
			let edit: unknown;
			if (text) {
				let body: unknown;
				try {
					body = JSON.parse(text);
				} catch {
					return c.json({ error: "body must be valid JSON" }, 400);
				}
				if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "body must be a JSON object like {\"contracts\": [...]}" }, 400);
				edit = (body as { contracts?: unknown }).contracts;
			}
			return c.json(await stub.approveBudget(edit));
		} catch (e) {
			const msg = errText(e);
			if (msg.startsWith(INVALID_PLAN)) return c.json({ error: msg.slice(INVALID_PLAN.length) }, 400);
			return c.json({ error: String(e) }, 409);
		}
	});
}

// ---- live agent controls (demo key; only while the crew is building) ----
app.use("/api/jobs/:id/contracts/:cid/*", async (c, next) => (/^[a-z0-9]{8}-c\d{1,2}$/.test(c.req.param("cid")) ? next() : c.json({ error: "bad contract id" }, 400)));

const controlError = (c: { json: (o: unknown, s: 404 | 409) => Response }, e: unknown) => {
	const msg = errText(e);
	return c.json({ error: msg }, /^no contract/.test(msg) ? 404 : 409);
};

app.post("/api/jobs/:id/contracts/:cid/control", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	const body = await c.req.json<{ action?: unknown }>().catch(() => ({}) as { action?: unknown });
	const action = body.action;
	if (action !== "pause" && action !== "resume" && action !== "stop") return c.json({ error: 'action must be "pause", "resume" or "stop"' }, 400);
	try {
		return c.json(await job(c.env, c.req.param("id")).control(c.req.param("cid"), action));
	} catch (e) {
		return controlError(c, e);
	}
});

app.post("/api/jobs/:id/contracts/:cid/note", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	const body = await c.req.json<{ text?: unknown }>().catch(() => ({}) as { text?: unknown });
	// Length/shape validation lives in cleanNote (Job.addNote); answer 400 for a bad note, 409 for a wrong job state.
	const note = cleanNote(body.text);
	if (!note.ok) return c.json({ error: note.error }, 400);
	try {
		return c.json(await job(c.env, c.req.param("id")).addNote(c.req.param("cid"), note.text));
	} catch (e) {
		return controlError(c, e);
	}
});

app.get("/api/jobs/:id/review", async (c) => {
	try {
		return c.json(await job(c.env, c.req.param("id")).review());
	} catch (e) {
		return c.json({ error: String(e).slice(0, 200) }, 404);
	}
});

app.get("/api/jobs/:id/ws", (c) => job(c.env, c.req.param("id")).fetch(c.req.raw));

app.get("/api/demo/replay", async (c) => {
	const run = await hall(c.env).getReplay(c.req.query("job") || undefined);
	return run ? c.json(run) : c.json({ error: "no recorded run yet" }, 404);
});

// Pin which recorded run the demo replays. Re-saves a closed job's run if it predates per-job replays.
app.post("/api/demo/pin/:id", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	const id = c.req.param("id");
	const h = hall(c.env);
	if (!(await h.pinReplay(id))) {
		const j = job(c.env, id);
		const view = await j.view().catch(() => null);
		if (!view || view.status !== "closed") return c.json({ error: "job not found or not closed" }, 404);
		await h.saveReplay({ job: view, events: await j.allEvents(), agents: await h.agents() });
		await h.pinReplay(id);
	}
	return c.json({ pinned: id });
});

app.post("/api/demo/reset-roster", async (c) => {
	if (!(await requireKey(c))) return c.json({ error: "missing or wrong x-demo-key" }, 401);
	return c.json(await hall(c.env).resetRoster());
});

// The job's mainline app, read straight out of Artifacts. Agent-written code is untrusted, so it runs
// in a CSP sandbox (opaque origin: no access to this app's storage, cookies or API key).
// Sandboxed (opaque-origin) pages can't touch localStorage; give agent code an in-memory stand-in.
const STORAGE_SHIM = `<script>(function(){try{window.localStorage.length;return}catch(e){}var mk=function(){var m=new Map();return{getItem:function(k){return m.has(k)?m.get(k):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(k)},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size}}};Object.defineProperty(window,"localStorage",{value:mk(),configurable:true});Object.defineProperty(window,"sessionStorage",{value:mk(),configurable:true})})()</script>`;
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", md: "text/plain; charset=utf-8", json: "application/json", svg: "image/svg+xml" };
// Path forms (relative asset links keep working because ref/fork live in the path):
//   /preview/<job>/<file>                      mainline tip
//   /preview/<job>/at/<sha>/<file>             mainline at any commit (time travel for the visual review)
//   /preview/<job>/fork/<agent>/<file>         an agent's fork tip
//   /preview/<job>/fork/<agent>/at/<sha>/<file>
app.get("/preview/:id/*", async (c) => {
	const id = c.req.param("id");
	if (!/^[a-z0-9]{8}$/.test(id)) return c.text("bad id", 400);
	let rest = c.req.path.split(`/preview/${id}/`)[1] ?? "";
	let fork: string | undefined;
	let ref = "main";
	let m = rest.match(/^fork\/([a-z0-9][a-z0-9-]{1,19})\/(.*)$/); // hyphens: scale-run forks are yard-001, crew-01
	if (m) [, fork, rest] = m;
	m = rest.match(/^at\/([0-9a-f]{40})\/(.*)$/);
	if (m) [, ref, rest] = m;
	const path = rest || "index.html";
	if (path.includes("..")) return c.text("bad path", 400);
	try {
		using repo = await c.env.ARTIFACTS.get(fork ? `job-${id}--${fork}` : `job-${id}`);
		const blob = await repo.readFile({ ref, path });
		if (!blob) return c.text("not found", 404);
		const ext = path.split(".").pop() ?? "";
		const body = ext === "html" ? (await blob.text()).replace(/<head[^>]*>/i, (h) => h + STORAGE_SHIM) : blob.stream();
		return new Response(body, {
			headers: {
				"content-type": TYPES[ext] ?? "application/octet-stream",
				"content-security-policy": "sandbox allow-scripts; default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:",
				// Commits are immutable, so pinned refs can cache; the moving tip cannot.
				"cache-control": ref === "main" ? "no-store" : "public, max-age=86400, immutable",
			},
		});
	} catch {
		return c.text("not found", 404);
	}
});
app.get("/preview/:id", (c) => c.redirect(`/preview/${c.req.param("id")}/`));

// primitiveOS: inbound email -> job (signature verified, sender allowlisted). See docs/PRIMITIVEOS.md.
app.route("/", primitiveRoutes() as never);

app.route("/", x402Routes() as never);

// MCP server so other agents (e.g. a cloudflare-os workspace) can hire from the Hall. See docs/cfos.md.
app.all("/mcp", (c) => mcpHandler(c.env, c.req.raw, c.executionCtx as never));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
