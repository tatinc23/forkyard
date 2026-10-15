import { describe, expect, it } from "vitest";
import { diffTrees, mergeTrees } from "./merge";

const base = {
	"a.txt": "one\ntwo\nthree\nfour\nfive",
	"b.txt": "keep",
};

describe("mergeTrees", () => {
	it("takes theirs when only the agent changed a file", () => {
		const r = mergeTrees(base, base, { ...base, "b.txt": "changed" });
		expect(r.clean).toBe(true);
		expect(r.changes).toEqual({ "b.txt": "changed" });
	});

	it("merges non-overlapping edits to the same file", () => {
		const ours = { ...base, "a.txt": "ONE\ntwo\nthree\nfour\nfive" };
		const theirs = { ...base, "a.txt": "one\ntwo\nthree\nfour\nFIVE" };
		const r = mergeTrees(base, ours, theirs);
		expect(r.clean).toBe(true);
		expect(r.changes["a.txt"]).toBe("ONE\ntwo\nthree\nfour\nFIVE");
	});

	it("returns a structured conflict for overlapping edits", () => {
		const ours = { ...base, "a.txt": "one\nTWO-main\nthree\nfour\nfive" };
		const theirs = { ...base, "a.txt": "one\nTWO-agent\nthree\nfour\nfive" };
		const r = mergeTrees(base, ours, theirs);
		expect(r.clean).toBe(false);
		expect(r.conflicts).toEqual([{ path: "a.txt", baseLine: 2, base: ["two"], ours: ["TWO-main"], theirs: ["TWO-agent"] }]);
		expect(r.changes["a.txt"]).toBeUndefined();
	});

	it("treats identical edits on both sides as clean", () => {
		const same = { ...base, "a.txt": "x" };
		expect(mergeTrees(base, same, same).clean).toBe(true);
	});

	it("handles additions and deletions", () => {
		const theirs = { "a.txt": base["a.txt"], "new.txt": "hi" };
		const r = mergeTrees(base, base, theirs);
		expect(r.clean).toBe(true);
		expect(r.changes).toEqual({ "b.txt": null, "new.txt": "hi" });
	});

	it("flags add/add on the same path as a conflict", () => {
		const r = mergeTrees(base, { ...base, "n.txt": "main" }, { ...base, "n.txt": "agent" });
		expect(r.clean).toBe(false);
		expect(r.conflicts[0].path).toBe("n.txt");
	});
});

describe("revert via mergeTrees(after, current, before)", () => {
	it("reverts files nobody touched since and reports the ones later chapters changed", () => {
		const before = { "a.txt": "one", "b.txt": "x\ny\nz" };
		const after = { "a.txt": "ONE (rejected chapter)", "b.txt": "x\nY (rejected chapter)\nz", "c.txt": "added by rejected chapter" };
		const current = { ...after, "b.txt": "x\nY (rejected chapter) + later chapter\nz" };
		const r = mergeTrees(after, current, before);
		expect(r.changes["a.txt"]).toBe("one");
		expect(r.changes["c.txt"]).toBeNull();
		expect(r.conflicts.map((c) => c.path)).toEqual(["b.txt"]);
	});
});

describe("diffTrees", () => {
	it("produces line-anchored hunks", () => {
		const d = diffTrees(base, { ...base, "a.txt": "one\ntwo\nTHREE\nfour\nfive" });
		expect(d.files).toEqual([{ path: "a.txt", kind: "modified", added: 1, removed: 1, hunks: [{ oldStart: 3, remove: ["three"], insert: ["THREE"] }] }]);
	});
});
