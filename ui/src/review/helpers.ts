import type { Chapter } from "@shared/types";
import { brick, textOnPaper } from "../lib/color";

export type Seg = { t: string; hit: boolean };

/** /preview/<job>/[fork/<agent>/]at/<sha>/index.html: the site exactly as it was at one commit. */
export function previewUrl(jobId: string, sha: string, on: string = "main", file = "index.html"): string {
	const fork = on && on !== "main" ? `fork/${encodeURIComponent(on)}/` : "";
	return `/preview/${encodeURIComponent(jobId)}/${fork}at/${sha}/${file}`;
}

export const short = (sha: string) => sha.slice(0, 7);

/** Character-level diff of two short lines: returns the two lines cut into plain/changed segments. */
export function intraline(a: string, b: string): [Seg[], Seg[]] {
	const n = a.length;
	const m = b.length;
	if (n * m > 60000) return [[{ t: a, hit: true }], [{ t: b, hit: true }]];
	const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	const sa: Seg[] = [];
	const sb: Seg[] = [];
	const push = (arr: Seg[], ch: string, hit: boolean) => {
		const last = arr[arr.length - 1];
		if (last && last.hit === hit) last.t += ch;
		else arr.push({ t: ch, hit });
	};
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			push(sa, a[i], false);
			push(sb, b[j], false);
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) push(sa, a[i++], true);
		else push(sb, b[j++], true);
	}
	while (i < n) push(sa, a[i++], true);
	while (j < m) push(sb, b[j++], true);
	return [sa, sb];
}

export type Row = { kind: "del" | "add"; text: string; lineNo?: number; segs?: Seg[] };

/** Turn one hunk into display rows. Removed lines are paired with their most similar inserted line to light up the exact characters that changed. */
export function hunkRows(h: Chapter["diff"][number]["hunks"][number]): Row[] {
	const del: Row[] = h.remove.map((text, i) => ({ kind: "del", text, lineNo: h.oldStart + i }));
	const add: Row[] = h.insert.map((text) => ({ kind: "add", text }));
	const used = new Set<number>();
	for (const d of del) {
		if (!d.text.trim()) continue;
		let best = -1;
		let bestScore = 0;
		add.forEach((a, k) => {
			if (used.has(k) || !a.text.trim()) return;
			const common = commonChars(d.text, a.text);
			const score = common / Math.max(d.text.length, a.text.length);
			if (score > bestScore) {
				bestScore = score;
				best = k;
			}
		});
		if (best >= 0 && bestScore >= 0.55) {
			used.add(best);
			const [sa, sb] = intraline(d.text, add[best].text);
			d.segs = sa;
			add[best].segs = sb;
		}
	}
	return [...del, ...add];
}

function commonChars(a: string, b: string): number {
	const count = new Map<string, number>();
	for (const c of a) count.set(c, (count.get(c) ?? 0) + 1);
	let hit = 0;
	for (const c of b) {
		const k = count.get(c) ?? 0;
		if (k > 0) {
			hit++;
			count.set(c, k - 1);
		}
	}
	return hit;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Adds 6 lines after line 17" in plain English. */
export function describeHunk(h: { oldStart: number; remove: string[]; insert: string[] }): string {
	const r = h.remove.length;
	const i = h.insert.length;
	if (r === 0) return `Adds ${plural(i, "line")} before line ${h.oldStart}`;
	if (i === 0) return `Removes ${plural(r, "line")} at line ${h.oldStart}`;
	return `Replaces ${plural(r, "line")} at line ${h.oldStart} with ${i}`;
}

export function money(n: number): string {
	return n.toFixed(2);
}

/** Agent colour helpers that stay readable on the light page. */
export function tint(color: string) {
	const b = brick(color);
	return { fill: b.fill, text: b.text, ink: textOnPaper(color) };
}

export function verdictOf(score?: number): { label: string; tone: "ok" | "warn" | "bad" | "none" } {
	if (score == null) return { label: "Not inspected", tone: "none" };
	if (score >= 4) return { label: "Clean", tone: "ok" };
	if (score === 3) return { label: "Passed with a flag", tone: "warn" };
	return { label: "Sent back", tone: "bad" };
}

export function fileKindWord(k: "added" | "deleted" | "modified"): string {
	return k === "added" ? "New file" : k === "deleted" ? "Deleted" : "Edited";
}

export type AgentInfo = { id: string; name: string; handle: string; color: string; fill: string; text: string; ink: string; glyph: number; rate: number; role?: string; specialty?: string };

export function infoFor(agents: { id: string; name: string; handle?: string; color: string; glyph: number; rate: number; role?: string; specialty?: string }[], id?: string): AgentInfo {
	const a = agents.find((x) => x.id === id);
	const name = a?.name ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Agent");
	const color = a?.color ?? "#94A3B8";
	const t = tint(color);
	return { id: id ?? "", name, handle: a?.handle ?? `@${id ?? "agent"}`, color, fill: t.fill, text: t.text, ink: t.ink, glyph: a?.glyph ?? 7, rate: a?.rate ?? 0, role: a?.role, specialty: a?.specialty };
}

/** Symbols that vanished from a changed line (a lost "$", "%", "!"...): easy to miss in a normal diff, shown as an audit hint. */
export function droppedBits(rows: Row[]): string[] {
	const out: string[] = [];
	for (const r of rows) {
		if (r.kind !== "del" || !r.segs) continue;
		for (const s of r.segs) {
			const t = s.t.trim();
			if (s.hit && /^[^\w\s()[\]{}.,;:'"`<>/\\=-]{1,2}$/.test(t)) out.push(t);
		}
	}
	return [...new Set(out)].slice(0, 4);
}
