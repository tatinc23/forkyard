import { commitFiles, seed, snapshot } from "./git/git";
import { mergeTrees } from "./merge/merge";

export interface Env {
	ARTIFACTS: Artifacts;
	AI: Ai;
}

const bot = { name: "gadgethub-spike", email: "spike@gadgethub.dev" };

async function waitReady(env: Env, name: string) {
	for (let i = 0; i < 30; i++) {
		try {
			using r = await env.ARTIFACTS.get(name);
			const info = await r.info();
			if (info) return info;
		} catch (e) {
			if (!String(e).includes("IN_PROGRESS")) throw e;
		}
		await new Promise((res) => setTimeout(res, 500));
	}
	throw new Error(`repo ${name} never became ready`);
}

export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);
		if (url.pathname === "/llm") {
			const model = url.searchParams.get("m") ?? "@cf/zai-org/glm-5.3-flash";
			const t0 = Date.now();
			const out = await env.AI.run(model as any, {
				messages: [
					{ role: "system", content: "You are a coding agent. Reply ONLY with JSON: {\"summary\": string, \"files\": {\"<path>\": \"<full new file content>\"}}. No prose, no code fences." },
					{ role: "user", content: "Task: add a dark mode toggle button to this page.\n\nFile index.html:\n<!doctype html><html><head><title>Todo</title><style>body{font-family:sans-serif}</style></head><body><h1>Todo</h1><ul id=list></ul></body></html>" },
				],
				max_tokens: 2000,
				reasoning: { effort: "low" },
			} as any);
			return Response.json({ ms: Date.now() - t0, out });
		}
		if (url.pathname !== "/spike") return new Response("gadgethub spike", { status: 200 });
		const t0 = Date.now();
		const log: Record<string, unknown> = {};
		const id = crypto.randomUUID().slice(0, 6);
		const main = await env.ARTIFACTS.create(`spike-${id}`);
		log.created = Date.now() - t0;
		await seed({ remote: main.remote, token: main.token, files: { "app.txt": "line1\nline2\nline3\nline4\nline5", "README.md": "# spike" }, message: "seed", author: bot });
		log.seeded = Date.now() - t0;
		using mainRepo = await env.ARTIFACTS.get(`spike-${id}`);
		const [fa, fb] = await Promise.all([mainRepo.fork(`spike-${id}-a`), mainRepo.fork(`spike-${id}-b`)]);
		await Promise.all([waitReady(env, fa.name), waitReady(env, fb.name)]);
		log.forked = Date.now() - t0;
		const base = await snapshot(main.remote, main.token);
		// Two agents edit concurrently: A touches line 1 + 3, B touches line 3 + 5 => one conflict on line 3.
		await Promise.all([
			commitFiles({ remote: fa.remote, token: fa.token, changes: { "app.txt": "LINE1-a\nline2\nline3-a\nline4\nline5" }, message: "agent a", author: bot }),
			commitFiles({ remote: fb.remote, token: fb.token, changes: { "app.txt": "line1\nline2\nline3-b\nline4\nLINE5-b", "new.txt": "from b" }, message: "agent b", author: bot }),
		]);
		log.agentsPushed = Date.now() - t0;
		const theirsA = await snapshot(fa.remote, fa.token);
		const r1 = mergeTrees(base.files, base.files, theirsA.files);
		const mainSha = await commitFiles({ remote: main.remote, token: main.token, changes: r1.changes, message: "merge a", author: bot });
		const ours = await snapshot(main.remote, main.token);
		const theirsB = await snapshot(fb.remote, fb.token);
		const r2 = mergeTrees(base.files, ours.files, theirsB.files);
		log.merged = Date.now() - t0;
		// Stale push test: push to main from an old tip should be rejected.
		let stale = "not tested";
		try {
			await commitFiles({ remote: main.remote, token: main.token, changes: { "x.txt": "x" }, message: "ok push", author: bot });
			stale = "fresh push ok";
		} catch (e) {
			stale = String(e);
		}
		const info = await mainRepo.info();
		return Response.json({ ok: true, ms: log, mainSha, r1: { clean: r1.clean, outcomes: r1.outcomes }, r2: { clean: r2.clean, conflicts: r2.conflicts, outcomes: r2.outcomes }, stale, info });
	},
} satisfies ExportedHandler<Env>;
