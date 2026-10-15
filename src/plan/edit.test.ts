import { describe, expect, it } from "vitest";
import { ROSTER } from "../shared/roster";
import type { Contract } from "../shared/types";
import { applyPlanEdit, describeEdits, validatePlanEdit, wageOf } from "./edit";

const agents = ROSTER;
const ctx = { agents, budget: 2 };
const good = { agentId: "forge", role: "Back-end", tasks: [{ title: "Add the /api/products route" }], leases: ["src/api.js"] };
const ok = (body: unknown, c = ctx) => {
	const r = validatePlanEdit(body, c);
	if (!r.ok) throw new Error("expected ok, got: " + r.error);
	return r;
};
const bad = (body: unknown, c = ctx) => {
	const r = validatePlanEdit(body, c);
	if (r.ok) throw new Error("expected an error");
	return r.error;
};

describe("validatePlanEdit", () => {
	it("accepts a minimal valid plan and totals the wage with the roster rate", () => {
		const r = ok({ contracts: [good, { agentId: "probe", role: "QA", tasks: [{ title: "Smoke test", detail: "cover the cart" }], leases: [] }] });
		expect(r.contracts).toHaveLength(2);
		expect(r.totalWage).toBeCloseTo(0.52 + 0.39, 5);
		expect(r.contracts[1].tasks[0].detail).toBe("cover the cart");
	});
	it("uses the same wage rule as the planner (agent rate)", () => {
		expect(wageOf(agents.find((a) => a.id === "forge")!)).toBe(0.52);
	});
	it("rejects bodies without 1-8 contracts", () => {
		expect(bad({ contracts: [] })).toMatch(/1 to 8/);
		expect(bad({ contracts: "x" })).toMatch(/contracts/);
		const nine = ROSTER.filter((a) => a.provider !== "house").slice(0, 9).map((a) => ({ ...good, agentId: a.id }));
		expect(bad({ contracts: nine }, { agents, budget: 99 })).toMatch(/1 to 8/);
	});
	it("rejects unknown and house agents", () => {
		expect(bad({ contracts: [{ ...good, agentId: "nobody" }] })).toMatch(/nobody/);
		expect(bad({ contracts: [{ ...good, agentId: "inspector" }] })).toMatch(/house/i);
	});
	it("rejects the same agent twice (forks are named per agent)", () => {
		expect(bad({ contracts: [good, good] })).toMatch(/twice/i);
	});
	it("rejects roles outside the known set and canonicalises case", () => {
		expect(bad({ contracts: [{ ...good, role: "Wizard" }] })).toMatch(/role/i);
		expect(ok({ contracts: [{ ...good, role: "back-end" }] }).contracts[0].role).toBe("Back-end");
	});
	it("enforces task counts and text limits", () => {
		expect(bad({ contracts: [{ ...good, tasks: [] }] })).toMatch(/1 to 12/);
		expect(bad({ contracts: [{ ...good, tasks: Array.from({ length: 13 }, (_, i) => ({ title: "t" + i })) }] })).toMatch(/1 to 12/);
		expect(bad({ contracts: [{ ...good, tasks: [{ title: "  " }] }] })).toMatch(/title/i);
		expect(bad({ contracts: [{ ...good, tasks: [{ title: "x".repeat(141) }] }] })).toMatch(/140/);
		expect(bad({ contracts: [{ ...good, tasks: [{ title: "ok", detail: "d".repeat(401) }] }] })).toMatch(/400/);
	});
	it("strips control characters", () => {
		const r = ok({ contracts: [{ ...good, tasks: [{ title: "Add\u0000 the\nroute\u0007", detail: "a\u001bb" }] }] });
		expect(r.contracts[0].tasks[0].title).toBe("Add the route");
		expect(r.contracts[0].tasks[0].detail).toBe("a b");
	});
	it("only accepts safe relative lease paths, at most 20", () => {
		for (const p of ["../etc/passwd", "/abs/path", "a/../b", "sp ace.js", "a;b.js", "x".repeat(121), "c:\\win"]) {
			expect(bad({ contracts: [{ ...good, leases: [p] }] })).toMatch(/lease/i);
		}
		expect(ok({ contracts: [{ ...good, leases: ["src/a-b_c.v2/index.js", ".github/ci.yml"] }] }).contracts[0].leases).toHaveLength(2);
		expect(bad({ contracts: [{ ...good, leases: Array.from({ length: 21 }, (_, i) => `f${i}.js`) }] })).toMatch(/20/);
	});
	it("fails with a readable message when the crew costs more than the budget", () => {
		const e = bad({ contracts: [good, { agentId: "vanta", role: "Front-end", tasks: [{ title: "x" }], leases: [] }] }, { agents, budget: 0.9 });
		expect(e).toMatch(/0\.98 USDC/);
		expect(e).toMatch(/budget is 0\.9 USDC/);
	});
});

const old = (over: Partial<Contract> & Pick<Contract, "id" | "agentId">): Contract => ({
	title: "T", brief: "B", paths: ["a.js"], wage: 0.5, status: "offered", attempts: 0, role: "Back-end", tasks: [{ id: over.id + "-t1", title: "Existing task", paths: ["a.js"], status: "todo" }], ...over,
});

describe("applyPlanEdit", () => {
	const before = [old({ id: "abcd1234-c1", agentId: "forge", wage: 0.52, title: "API work", brief: "Build the API" }), old({ id: "abcd1234-c2", agentId: "probe", role: "QA", wage: 0.39 })];
	it("keeps ids/briefs for retained agents, mints fresh ids for new ones, and recomputes wages", () => {
		const edited = ok({
			contracts: [
				{ agentId: "forge", role: "Back-end", tasks: [{ title: "Existing task" }, { title: "New task", detail: "d" }], leases: ["a.js", "b.js"] },
				{ agentId: "rivet", role: "Platform", tasks: [{ title: "Add headers" }], leases: ["_headers"] },
			],
		}).contracts;
		const out = applyPlanEdit("abcd1234", before, edited, agents);
		expect(out.map((c) => c.id)).toEqual(["abcd1234-c1", "abcd1234-c3"]);
		expect(out.every((c) => /^[a-z0-9]{8}-c\d{1,2}$/.test(c.id))).toBe(true);
		expect(out[0].title).toBe("API work");
		expect(out[0].brief).toBe("Build the API");
		expect(out[0].wage).toBe(0.52);
		expect(out[1].wage).toBe(0.33);
		expect(out[0].tasks!.map((t) => t.id)).toEqual(["abcd1234-c1-t1", "abcd1234-c1-t2"]);
		expect(out[0].tasks![0].paths).toEqual(["a.js"]); // existing task keeps its own paths
		expect(out[0].tasks![1].paths).toEqual(["a.js", "b.js"]); // new task takes the lease
		expect(out[0].tasks![1].detail).toBe("d");
		expect(out[0].paths).toEqual(["a.js", "b.js"]);
		expect(out.every((c) => c.status === "offered" && c.attempts === 0)).toBe(true);
	});
	it("a swap on the same role inherits the old title and brief but not the id", () => {
		const edited = ok({ contracts: [{ agentId: "rivet", role: "Back-end", tasks: [{ title: "Do it" }], leases: ["a.js"] }] }).contracts;
		const out = applyPlanEdit("abcd1234", before, edited, agents);
		expect(out[0].id).toBe("abcd1234-c3");
		expect(out[0].title).toBe("API work");
		expect(out[0].brief).toBe("Build the API");
	});
});

describe("describeEdits", () => {
	const before = [old({ id: "abcd1234-c1", agentId: "forge", wage: 0.52 }), old({ id: "abcd1234-c2", agentId: "probe", role: "QA", wage: 0.39, tasks: [{ id: "x", title: "One", paths: [], status: "todo" }] })];
	it("describes swaps, additions, removals and task changes", () => {
		const edited = ok({
			contracts: [
				{ agentId: "rivet", role: "Back-end", tasks: [{ title: "Existing task" }], leases: ["a.js"] },
				{ agentId: "probe", role: "QA", tasks: [{ title: "One" }, { title: "Two" }, { title: "Three" }], leases: [] },
				{ agentId: "quill", role: "Docs", tasks: [{ title: "Readme" }], leases: ["README.md"] },
			],
		}).contracts;
		const notes = describeEdits(before, edited, agents, 2);
		expect(notes).toContain("Swapped Forge for Rivet on Back-end (-0.19 USDC)");
		expect(notes).toContain("Added 2 tasks to QA");
		expect(notes).toContain("Added Quill as Docs (+0.22 USDC)");
		expect(notes[notes.length - 1]).toMatch(/Crew now costs 0\.94 of 2 USDC/);
	});
	it("describes removals", () => {
		const edited = ok({ contracts: [{ agentId: "probe", role: "QA", tasks: [{ title: "One" }], leases: [] }] }).contracts;
		expect(describeEdits(before, edited, agents, 2)).toContain("Removed Forge (Back-end, -0.52 USDC)");
	});
});
