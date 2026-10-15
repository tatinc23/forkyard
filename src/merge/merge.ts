// Agent-native diff & merge.
//
// Artifacts gives us repos and forks but no diff or merge API, so Forkyard ships its own,
// designed for agents rather than humans:
//  - Diffs are JSON "change sets" (file -> hunks with line numbers), not unified-diff text.
//  - Merges are 3-way per file. Conflicts come back as structured objects (base / ours / theirs
//    line arrays + line anchors) that a resolver agent can consume directly — never as
//    `<<<<<<<` markers written into the tree.
import { diff3Merge, diffPatch } from "node-diff3";
import type { FileMap } from "../git/git";

export type Hunk = {
	/** 1-based line in the old file where the change starts. */
	oldStart: number;
	remove: string[];
	insert: string[];
};

export type FileChange =
	| { path: string; kind: "added"; lines: number }
	| { path: string; kind: "deleted"; lines: number }
	| { path: string; kind: "modified"; hunks: Hunk[]; added: number; removed: number };

export type ChangeSet = { files: FileChange[]; added: number; removed: number };

export type Conflict = {
	path: string;
	/** 1-based line in the base file where the contested region starts. */
	baseLine: number;
	base: string[];
	/** What mainline (already-merged work) has there now. */
	ours: string[];
	/** What the incoming agent wants there. */
	theirs: string[];
};

export type FileOutcome = {
	path: string;
	status: "unchanged" | "ours" | "theirs" | "merged" | "conflict" | "deleted";
};

export type MergeReport = {
	clean: boolean;
	/** Full merged tree (only meaningful when clean). */
	merged: FileMap;
	/** Files whose merged content differs from ours: exactly what must be committed to mainline. */
	changes: Record<string, string | null>;
	outcomes: FileOutcome[];
	conflicts: Conflict[];
};

const lines = (s: string) => s.split("\n");

/** JSON diff between two trees, for agents (compact, line-anchored). */
export function diffTrees(before: FileMap, after: FileMap): ChangeSet {
	const files: FileChange[] = [];
	let added = 0;
	let removed = 0;
	const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const path of [...paths].sort()) {
		const a = before[path];
		const b = after[path];
		if (a === b) continue;
		if (a === undefined) {
			const n = lines(b).length;
			files.push({ path, kind: "added", lines: n });
			added += n;
		} else if (b === undefined) {
			const n = lines(a).length;
			files.push({ path, kind: "deleted", lines: n });
			removed += n;
		} else {
			const hunks: Hunk[] = diffPatch(lines(a), lines(b)).map((p) => ({
				oldStart: p.buffer1.offset + 1,
				remove: p.buffer1.chunk,
				insert: p.buffer2.chunk,
			}));
			const fa = hunks.reduce((n, h) => n + h.insert.length, 0);
			const fr = hunks.reduce((n, h) => n + h.remove.length, 0);
			added += fa;
			removed += fr;
			files.push({ path, kind: "modified", hunks, added: fa, removed: fr });
		}
	}
	return { files, added, removed };
}

/** Paths touched between two trees. */
export function touchedPaths(before: FileMap, after: FileMap): string[] {
	return diffTrees(before, after).files.map((f) => f.path);
}

/**
 * 3-way merge of whole trees. `base` = mainline when the agent was hired,
 * `ours` = mainline now, `theirs` = the agent's fork.
 */
export function mergeTrees(base: FileMap, ours: FileMap, theirs: FileMap): MergeReport {
	const merged: FileMap = {};
	const changes: Record<string, string | null> = {};
	const outcomes: FileOutcome[] = [];
	const conflicts: Conflict[] = [];
	const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);

	for (const path of [...paths].sort()) {
		const o = base[path];
		const a = ours[path];
		const b = theirs[path];

		// Agent did not touch it, or both sides agree: keep ours.
		if (b === o || a === b) {
			if (a !== undefined) merged[path] = a;
			outcomes.push({ path, status: "unchanged" });
			continue;
		}
		// Only the agent changed it: take theirs.
		if (a === o) {
			if (b === undefined) {
				changes[path] = null;
				outcomes.push({ path, status: "deleted" });
			} else {
				merged[path] = b;
				changes[path] = b;
				outcomes.push({ path, status: "theirs" });
			}
			continue;
		}
		// Both changed it. Delete vs edit, or add vs add, is a whole-file conflict.
		if (a === undefined || b === undefined || o === undefined) {
			conflicts.push({ path, baseLine: 1, base: o ? lines(o) : [], ours: a ? lines(a) : [], theirs: b ? lines(b) : [] });
			if (a !== undefined) merged[path] = a;
			outcomes.push({ path, status: "conflict" });
			continue;
		}
		// Line-level 3-way merge.
		const regions = diff3Merge(lines(a), lines(o), lines(b), { excludeFalseConflicts: true });
		const out: string[] = [];
		let fileConflict = false;
		for (const r of regions) {
			if (r.ok) out.push(...r.ok);
			else if (r.conflict) {
				fileConflict = true;
				conflicts.push({ path, baseLine: r.conflict.oIndex + 1, base: r.conflict.o, ours: r.conflict.a, theirs: r.conflict.b });
				out.push(...r.conflict.a); // keep mainline until resolved
			}
		}
		const text = out.join("\n");
		merged[path] = text;
		if (fileConflict) outcomes.push({ path, status: "conflict" });
		else {
			changes[path] = text;
			outcomes.push({ path, status: "merged" });
		}
	}
	return { clean: conflicts.length === 0, merged, changes, outcomes, conflicts };
}
