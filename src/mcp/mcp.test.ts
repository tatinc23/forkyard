import { describe, expect, it } from "vitest";
import { mcpHandler } from "./index";
import type { Env } from "../env";

const calls: string[] = [];
const view = {
	id: "abcd1234", goal: "dark mode", budget: 2, status: "awaiting_budget", createdAt: 0, totalCost: 0,
	plan: { summary: "two contracts", overlaps: [] },
	contracts: [{ id: "c1", agentId: "vanta", title: "Theme", brief: "", paths: [], wage: 0.5, status: "offered", attempts: 0, review: { score: 8, notes: "" } }],
	mainline: [{ sha: "0123456789", message: "init", at: 0 }],
};
const stub = (o: object) => ({ get: () => o, idFromName: (n: string) => n });
const env = {
	DEMO_KEY: "secret",
	HALL: stub({
		agents: async () => [{ name: "Vanta", handle: "@vanta", specialty: "CSS", rate: 0.4, reputation: 700 }],
		allowJob: async () => true,
		registerJob: async () => void calls.push("register"),
	}),
	JOB: stub({
		start: async () => void calls.push("start"),
		view: async () => view,
		approveBudget: async () => ({ ...view, status: "hiring" }),
		signoff: async () => ({ ...view, status: "paying" }),
	}),
} as unknown as Env;

const rpc = async (method: string, params: object, url = "https://x.test/mcp", headers: Record<string, string> = {}, id = 1) => {
	const res = await mcpHandler(
		env,
		new Request(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }),
	);
	return (await res.json()) as any;
};
const init = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } };
const call = (name: string, args: object, url?: string, headers?: Record<string, string>) => rpc("tools/call", { name, arguments: args }, url, headers);

describe("forkyard MCP", () => {
	it("initializes and lists the five tools with read-only hints", async () => {
		const i = await rpc("initialize", init);
		expect(i.result.serverInfo.name).toBe("forkyard");
		const l = await rpc("tools/list", {});
		const names = l.result.tools.map((t: any) => t.name).sort();
		expect(names).toEqual(["approve_budget", "hall_leaderboard", "job_status", "post_job", "sign_off"]);
		const ro = Object.fromEntries(l.result.tools.map((t: any) => [t.name, t.annotations?.readOnlyHint]));
		expect(ro).toMatchObject({ hall_leaderboard: true, job_status: true, post_job: false, approve_budget: false, sign_off: false });
	});
	it("read-only tools are open", async () => {
		const r = await call("hall_leaderboard", {});
		expect(JSON.parse(r.result.content[0].text)[0].handle).toBe("@vanta");
		const s = await call("job_status", { jobId: "abcd1234" });
		const j = JSON.parse(s.result.content[0].text);
		expect(j.previewUrl).toBe("https://gadgethub.chris-d6a.workers.dev/preview/abcd1234/");
		expect(j.contracts[0].reviewScore).toBe(8);
	});
	it("spending tools need the key, via ?key=, bearer or x-demo-key", async () => {
		const no = await call("post_job", { goal: "add dark mode to the store" });
		expect(no.result.isError).toBe(true);
		expect((await call("post_job", { goal: "add dark mode to the store" }, "https://x.test/mcp?key=wrong")).result.isError).toBe(true);
		const q = await call("post_job", { goal: "add dark mode to the store", budget: 2 }, "https://x.test/mcp?key=secret");
		expect(q.result.isError).toBeUndefined();
		expect(JSON.parse(q.result.content[0].text).jobId).toMatch(/^[0-9a-f]{8}$/);
		expect((await call("approve_budget", { jobId: "abcd1234" }, undefined, { authorization: "Bearer secret" })).result.isError).toBeUndefined();
		const so = await call("sign_off", { jobId: "abcd1234" }, undefined, { "x-demo-key": "secret" });
		expect(JSON.parse(so.result.content[0].text).status).toBe("paying");
	});
	it("rejects malformed job ids", async () => {
		expect((await call("job_status", { jobId: "../etc" })).result.isError).toBe(true);
	});
});
