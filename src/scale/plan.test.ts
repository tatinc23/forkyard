import { describe, expect, it } from "vitest";
import { mergeTrees } from "../merge/merge";
import {
	MOSAIC_PATH,
	agentName,
	applyAgentEdit,
	buildMosaic,
	glyphFor,
	groupCrews,
	hueFor,
	isRollAgent,
	parseRoll,
	redeliverCrew,
	roundsOf,
	scaleParams,
	scriptedAgent,
} from "./plan";

describe("scaleParams", () => {
	it("defaults to 100 agents in 10 crews", () => {
		expect(scaleParams({})).toEqual({ agents: 100, crews: 10 });
	});
	it("clamps agents to 10-100 and defaults crews to agents/10", () => {
		expect(scaleParams({ agents: 500 })).toEqual({ agents: 100, crews: 10 });
		expect(scaleParams({ agents: 3 })).toEqual({ agents: 10, crews: 1 });
		expect(scaleParams({ agents: 45 }).crews).toBe(5);
	});
	it("clamps crews to 1..agents and ignores junk", () => {
		expect(scaleParams({ agents: 20, crews: 99 })).toEqual({ agents: 20, crews: 20 });
		expect(scaleParams({ agents: 20, crews: 0 }).crews).toBe(1);
		expect(scaleParams({ agents: "x" as unknown as number })).toEqual({ agents: 100, crews: 10 });
	});
});

describe("groupCrews", () => {
	it("splits 100 agents into 10 crews of 10, numbered from 1", () => {
		const g = groupCrews(100, 10);
		expect(g).toHaveLength(10);
		expect(g[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(g[9][9]).toBe(100);
	});
	it("spreads remainders so crews differ by at most one agent", () => {
		const g = groupCrews(23, 5);
		expect(g.map((c) => c.length)).toEqual([5, 5, 5, 4, 4]);
		expect(g.flat()).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
	});
});

describe("roundsOf", () => {
	it("takes one member per crew per round", () => {
		const rounds = roundsOf(groupCrews(23, 5));
		expect(rounds).toHaveLength(5);
		expect(rounds[0]).toEqual([1, 6, 11, 16, 20]);
		expect(rounds[4]).toEqual([5, 10, 15]);
		expect(rounds.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
	});
});

describe("agent identity", () => {
	it("names agents yard-001 ...", () => {
		expect(agentName(1)).toBe("yard-001");
		expect(agentName(100)).toBe("yard-100");
	});
	it("gives every one of 100 agents a distinct glyph and a hue in 0-359", () => {
		const glyphs = new Set(Array.from({ length: 100 }, (_, i) => glyphFor(i + 1)));
		expect(glyphs.size).toBe(100);
		for (let n = 1; n <= 100; n++) {
			expect(hueFor(n)).toBeGreaterThanOrEqual(0);
			expect(hueFor(n)).toBeLessThan(360);
			expect(glyphFor(n)).not.toMatch(/["\\\n]/);
		}
		expect(glyphFor(7)).toBe(glyphFor(7));
	});
	it("marks every 10th agent as a roll-call agent", () => {
		expect([9, 10, 11, 20, 100].map(isRollAgent)).toEqual([false, true, false, true, true]);
	});
	it("builds a roster entry for the replay", () => {
		const a = scriptedAgent(42);
		expect(a.id).toBe("yard-042");
		expect(a.handle).toBe("@yard-042");
		expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
		expect(a.provider).toBe("house");
	});
});

describe("buildMosaic", () => {
	it("writes the agreed format", () => {
		const m = buildMosaic(2);
		expect(m).toBe("var T = window.MOSAIC = [];\nvar ROLL = [];\n\n// slot 001\nT[1] = null;\n\n// slot 002\nT[2] = null;\n");
	});
	it("has 100 slots", () => {
		expect(buildMosaic(100).match(/^T\[\d+\] = null;$/gm)).toHaveLength(100);
	});
});

describe("applyAgentEdit", () => {
	const base = buildMosaic(100);
	it("replaces only the agent's own slot", () => {
		const out = applyAgentEdit(base, 42);
		const g = glyphFor(42);
		expect(out).toContain(`T[42] = { g: "${g}", h: ${hueFor(42)}, by: "yard-042" };`);
		expect(out).toContain("T[41] = null;");
		expect(out).toContain("T[43] = null;");
		expect(out.split("\n")).toHaveLength(base.split("\n").length);
	});
	it("does not confuse T[1] with T[10] or T[100]", () => {
		const out = applyAgentEdit(base, 1);
		expect(out).toContain("T[10] = null;");
		expect(out).toContain("T[100] = null;");
		expect(out).toContain('by: "yard-001"');
	});
	it("a roll-call agent also appends its name to ROLL, once", () => {
		const out = applyAgentEdit(base, 10);
		expect(parseRoll(out)).toEqual(["yard-010"]);
		expect(parseRoll(applyAgentEdit(out, 10))).toEqual(["yard-010"]);
		expect(parseRoll(applyAgentEdit(out, 20))).toEqual(["yard-010", "yard-020"]);
	});
	it("throws when the slot is missing", () => {
		expect(() => applyAgentEdit(buildMosaic(5), 6)).toThrow(/slot 6/);
	});
});

describe("merge tree on the mosaic file", () => {
	const base = { [MOSAIC_PATH]: buildMosaic(100), "index.html": "<p>hi</p>" };
	const agent = (n: number) => ({ ...base, [MOSAIC_PATH]: applyAgentEdit(base[MOSAIC_PATH], n) });

	it("merges different slots cleanly, including neighbours", () => {
		let line = base;
		for (const n of [3, 4, 5, 1, 2]) {
			const r = mergeTrees(base, line, agent(n));
			expect(r.clean).toBe(true);
			line = r.merged as typeof base;
		}
		expect(line[MOSAIC_PATH]).toContain('by: "yard-003"');
		expect(line[MOSAIC_PATH]).toContain('by: "yard-002"');
	});

	it("two roll-call agents conflict on the ROLL line only", () => {
		const first = mergeTrees(base, base, agent(10));
		expect(first.clean).toBe(true);
		const second = mergeTrees(base, first.merged, agent(20));
		expect(second.clean).toBe(false);
		expect(second.conflicts).toHaveLength(1);
		expect(second.conflicts[0].ours).toEqual(['var ROLL = ["yard-010"];']);
		expect(second.conflicts[0].theirs).toEqual(['var ROLL = ["yard-020"];']);
	});

	it("redelivering on top of the line merges cleanly and keeps everyone", () => {
		const first = mergeTrees(base, base, agent(10));
		const second = mergeTrees(base, first.merged, agent(20));
		const redone = { ...first.merged, [MOSAIC_PATH]: applyAgentEdit(first.merged[MOSAIC_PATH], 20) };
		const again = mergeTrees(first.merged, first.merged, redone);
		expect(again.clean).toBe(true);
		expect(parseRoll(again.merged[MOSAIC_PATH])).toEqual(["yard-010", "yard-020"]);
		expect(second.conflicts.length).toBe(1);
	});

	it("redeliverCrew re-appends a crew's roll names onto main's line, keeping the merged slots", () => {
		const main = mergeTrees(base, base, agent(10)).merged;
		// crew line holds slots 11-19 and roll agent 20
		let crew: Record<string, string> = base;
		for (const n of [11, 12, 20]) crew = mergeTrees(base, crew, agent(n)).merged;
		const report = mergeTrees(base, main, crew);
		expect(report.clean).toBe(false);
		const next = redeliverCrew(report.merged[MOSAIC_PATH], main[MOSAIC_PATH], crew[MOSAIC_PATH]);
		expect(parseRoll(next)).toEqual(["yard-010", "yard-020"]);
		expect(next).toContain('by: "yard-011"');
		expect(next).toContain('by: "yard-020"');
		expect(next).toContain('by: "yard-010"');
		const final = mergeTrees(main, main, { ...main, [MOSAIC_PATH]: next });
		expect(final.clean).toBe(true);
	});
});
