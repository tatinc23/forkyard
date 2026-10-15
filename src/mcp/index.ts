// Forkyard MCP server (stateless Streamable HTTP) so any MCP client (e.g. a Cloudflare OS workspace) can hire Forkyard agents.
// Mounted by the coordinator at /mcp (see docs/cfos.md). No Durable Object of its own: a fresh McpServer +
// transport per request, JSON responses only.
//
// Auth: cfOS's gatekeeper-mcp can only send a pasted URL (no custom headers; Bearer only via OAuth, which this
// server does not implement). So tools/list, initialize and the read-only tools are open, and the spending tools
// (post_job, approve_budget, sign_off) need the demo key, accepted as `?key=` on the endpoint URL (what cfOS can
// send), or `Authorization: Bearer <key>` / `x-demo-key` (what curl and other clients can send).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { hall, job, type Env } from "../env";
import type { JobView } from "../shared/types";

const DEFAULT_BASE = "https://gadgethub.chris-d6a.workers.dev";
const JOB_ID = /^[a-z0-9]{8}$/;

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

/** Constant-time-ish string compare (lengths leak, which is fine for a demo key). */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

/** The demo key presented by the caller: `x-demo-key`, `Authorization: Bearer`, or `?key=` on the endpoint URL. */
function presentedKey(req: Request): string {
	const h = req.headers.get("x-demo-key");
	if (h) return h;
	const auth = req.headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
	return new URL(req.url).searchParams.get("key") ?? "";
}

const authorized = (env: Env, req: Request) => !!env.DEMO_KEY && safeEqual(presentedKey(req), env.DEMO_KEY);
const NEED_KEY = "Unauthorized: this tool spends money/compute. Add the Forkyard demo key to the MCP endpoint URL as ?key=<DEMO_KEY> (or send x-demo-key / Authorization: Bearer).";

const base = (env: Env) => (env.PUBLIC_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

function summarize(env: Env, v: JobView) {
	const b = base(env);
	return {
		jobId: v.id,
		goal: v.goal,
		budget: v.budget,
		status: v.status,
		planSummary: v.plan?.summary ?? null,
		contracts: v.contracts.map((c) => ({
			id: c.id,
			agentId: c.agentId,
			title: c.title,
			wage: c.wage,
			status: c.status,
			reviewScore: c.review?.score ?? null,
		})),
		mainline: v.mainline.map((m) => ({ sha: m.sha.slice(0, 7), message: m.message, contractId: m.contractId ?? null })),
		totalCost: v.totalCost,
		previewUrl: `${b}/preview/${v.id}/`,
		watchUrl: `${b}/?job=${v.id}`,
		nextStep:
			v.status === "awaiting_budget"
				? "Call approve_budget to release the crew."
				: v.status === "awaiting_signoff"
					? "Review the preview, then call sign_off to merge and pay the agents."
					: v.status === "closed" || v.status === "failed"
						? "Job finished."
						: "Agents are working; poll job_status again in 15-30 seconds.",
	};
}

async function getJob(env: Env, id: string): Promise<JobView | null> {
	if (!JOB_ID.test(id)) return null;
	try {
		return await job(env, id).view();
	} catch {
		return null;
	}
}

function buildServer(env: Env, req: Request): McpServer {
	const server = new McpServer(
		{ name: "forkyard", version: "0.1.0" },
		{
			instructions:
				"Forkyard is source control for agent crews: AI agents are hired onto a coding job, each works in its own fork under a contract. post_job creates a job; the Foreman plans it and proposes a budget; approve_budget releases the crew; sign_off merges the work and pays the agents. Poll job_status in between.",
		},
	);

	server.registerTool(
		"hall_leaderboard",
		{
			title: "Forkyard leaderboard",
			description: "List the agents on Forkyard ranked by reputation: name, handle, specialty, rate in USDC per contract, reputation (0-1000).",
			inputSchema: { limit: z.number().int().min(1).max(20).optional().describe("How many agents to return (default 8)") },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ limit }) => {
			const agents = await hall(env).agents();
			return ok(
				agents.slice(0, limit ?? 8).map((a) => ({ name: a.name, handle: a.handle, specialty: a.specialty, rateUsdc: a.rate, reputation: a.reputation })),
			);
		},
	);

	server.registerTool(
		"post_job",
		{
			title: "Post a job",
			description:
				"Create a Forkyard job. The Foreman agent plans it, then the job waits at awaiting_budget for approve_budget. Requires the demo key. Budget is in testnet USDC (0.1 to 5).",
			inputSchema: {
				goal: z.string().min(8).max(500).describe("What to build or change, in plain English"),
				budget: z.number().min(0.1).max(5).optional().describe("Total budget in USDC (default 2)"),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async ({ goal, budget }) => {
			if (!authorized(env, req)) return fail(NEED_KEY);
			const g = goal.trim().slice(0, 500);
			const b = Math.max(0.1, Math.min(5, Number(budget ?? 2)));
			if (g.length < 8) return fail("goal is too short");
			const cap = Number(env.DAILY_JOB_CAP ?? 25);
			if (!(await hall(env).allowJob(cap))) return fail("daily job cap reached; try again tomorrow");
			const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
			await hall(env).registerJob(id, g);
			await job(env, id).start(id, g, b);
			return ok({ jobId: id, status: "planning", watchUrl: `${base(env)}/?job=${id}`, nextStep: "Poll job_status until status is awaiting_budget, then call approve_budget." });
		},
	);

	server.registerTool(
		"job_status",
		{
			title: "Job status",
			description: "Status of a job: plan summary, contracts (agent, title, status, review score), mainline commits, preview URL and watch URL.",
			inputSchema: { jobId: z.string().describe("The jobId returned by post_job") },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ jobId }) => {
			const v = await getJob(env, jobId);
			return v ? ok(summarize(env, v)) : fail(`job ${jobId} not found`);
		},
	);

	for (const [name, title, description, run] of [
		["approve_budget", "Approve budget", "Human gate 1: approve the Foreman's plan and budget so the crew is hired and starts work. Requires the demo key.", (id: string) => job(env, id).approveBudget()],
		["sign_off", "Sign off and pay", "Human gate 2: sign off the finished work. Merges the final result and pays the agents (testnet USDC). Requires the demo key.", (id: string) => job(env, id).signoff()],
	] as const) {
		server.registerTool(
			name,
			{ title, description, inputSchema: { jobId: z.string().describe("The jobId returned by post_job") }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
			async ({ jobId }) => {
				if (!authorized(env, req)) return fail(NEED_KEY);
				if (!JOB_ID.test(jobId)) return fail(`job ${jobId} not found`);
				try {
					return ok(summarize(env, await run(jobId)));
				} catch (e) {
					return fail(String(e instanceof Error ? e.message : e));
				}
			},
		);
	}
	return server;
}

/** Serve one MCP request (stateless: new server + transport each time). Mount at `/mcp`. */
export async function mcpHandler(env: Env, req: Request, _ctx?: ExecutionContext): Promise<Response> {
	if (req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, DELETE, OPTIONS", "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization, x-demo-key" },
		});
	}
	const server = buildServer(env, req);
	const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
	await server.connect(transport);
	return transport.handleRequest(req);
}
