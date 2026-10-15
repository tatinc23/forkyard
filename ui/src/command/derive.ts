import type { Agent } from "../types";
import type { JobState, Lane } from "../engine/state";
import { displayName } from "../lib/agents";

/** What an agent is doing, collapsed to the seven states the swarm can draw. */
export type AState = "idle" | "working" | "committed" | "conflict" | "merged" | "rejected" | "paused";

export const STATE_LABEL: Record<AState, string> = { idle: "Waiting", working: "Working", committed: "Delivered", conflict: "Conflict", merged: "Merged", rejected: "Rejected", paused: "Paused" };
export const STATE_ORDER: AState[] = ["conflict", "rejected", "paused", "working", "committed", "idle", "merged"];

export function stateOf(l: Lane): AState {
	if (l.stopped || l.status === "rejected") return "rejected";
	if (l.status === "merged" || l.status === "paid") return "merged";
	if (l.paused) return "paused";
	switch (l.status) {
		case "offered":
		case "forking":
			return "idle";
		case "working":
			return "working";
		case "conflict":
		case "resolving":
			return "conflict";
		default:
			return "committed";
	}
}

const synth = new Map<string, Agent>();
/** The agent behind a lane. A live scale run has hundreds of agents the Hall roster never heard of: make a stand-in from the id. */
export function agentOf(job: JobState, l: Lane): Agent {
	const known = job.agents[l.agentId];
	if (known) return known;
	let a = synth.get(l.agentId);
	if (!a) {
		let h = 0;
		for (const ch of l.agentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
		const hue = h % 360;
		a = {
			id: l.agentId,
			name: l.agentId.replace(/^yard-/, "Yard "),
			handle: `@${l.agentId}`,
			specialty: "",
			tags: [],
			model: "",
			rate: 0,
			wallet: "0x0000000000000000000000000000000000000000",
			reputation: 0,
			stats: { contracts: 0, merged: 0, conflicts: 0, avgReview: 0, earned: 0 },
			glyph: h % 97,
			color: hsl(hue),
			role: l.role,
		};
		synth.set(l.agentId, a);
	}
	return a;
}

function hsl(h: number): string {
	const s = 0.78;
	const lgt = 0.58;
	const a = s * Math.min(lgt, 1 - lgt);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		return Math.round(255 * (lgt - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

export const firstName = (job: JobState, l: Lane) => displayName(agentOf(job, l).name);

export function currentTask(l: Lane): string {
	if (l.stopped) return "Stopped by you";
	if (l.paused) return "Paused, waiting for you";
	if (l.status === "conflict") return `Collided on ${l.conflictPaths[l.conflictPaths.length - 1] ?? "a shared file"}`;
	if (l.status === "resolving") return "Re-delivering with the conflict resolved";
	if (["merged", "paid"].includes(l.status)) return "Merged";
	if (l.status === "reviewing" || l.status === "delivered") return "Delivered, waiting for review and merge";
	if (l.status === "queued" || l.status === "merging") return "Waiting to merge";
	if (l.thought && l.status === "working") return l.thought.text;
	const next = l.tasks.find((t) => !t.done);
	return next ? next.title : l.title;
}

export function lastCommit(l: Lane): { title: string; sha?: string } | null {
	const done = l.tasks.filter((t) => t.done);
	const t = done[done.length - 1];
	if (t) return { title: t.title, sha: t.sha };
	if (l.sha && l.delivered) return { title: "Delivery", sha: l.sha };
	return null;
}

export const commitsOf = (l: Lane) => l.tasks.filter((t) => t.done).length || (l.delivered ? 1 : 0);

export type Group = { id: string; name: string; lanes: Lane[]; merged: boolean };

/** Lanes grouped by crew line (scale runs), or one group for an ordinary AI crew. */
export function groupsOf(job: JobState): Group[] {
	const lanes = job.order.map((id) => job.lanes[id]).filter(Boolean);
	if (job.crewOrder.length === 0) return [{ id: "all", name: "Crew", lanes, merged: false }];
	const member = new Map<string, string>();
	for (const c of Object.values(job.crews)) for (const id of c.contractIds) member.set(id, c.id);
	const by = new Map<string, Lane[]>(job.crewOrder.map((id) => [id, []]));
	const loose: Lane[] = [];
	for (const l of lanes) {
		const cid = l.crewId ?? member.get(l.id);
		const arr = cid ? by.get(cid) : undefined;
		if (arr) arr.push(l);
		else loose.push(l);
	}
	const groups: Group[] = job.crewOrder.map((id) => ({ id, name: job.crews[id].name, lanes: by.get(id)!, merged: job.crews[id].merged }));
	if (loose.length) groups.push({ id: "loose", name: "Unassigned", lanes: loose, merged: false });
	return groups;
}

export type Counters = { total: number; working: number; commits: number; conflicts: number; openConflicts: number; resolved: number; merged: number; spent: number; budget: number; byState: Record<AState, number> };

export function countersOf(job: JobState): Counters {
	const byState: Record<AState, number> = { idle: 0, working: 0, committed: 0, conflict: 0, merged: 0, rejected: 0, paused: 0 };
	let commits = 0;
	let conflicts = 0;
	let resolved = 0;
	let wages = 0;
	for (const id of job.order) {
		const l = job.lanes[id];
		if (!l) continue;
		byState[stateOf(l)]++;
		commits += commitsOf(l);
		conflicts += l.conflicts;
		resolved += l.resolved;
		if (l.hired) wages += l.wage;
	}
	const paid = job.payouts.reduce((s, p) => s + p.amount, 0);
	return { total: job.order.length, working: byState.working, commits, conflicts, openConflicts: byState.conflict, resolved, merged: byState.merged, spent: paid || wages, budget: job.budget, byState };
}

// ---------- needs you: exceptions only ----------

export type Exception = { id: string; kind: "conflict" | "inspector" | "uninspected" | "rejected" | "stopped" | "paused" | "budget" | "failed"; tone: "warn" | "bad"; contractId?: string; title: string; detail: string; action: { label: string; to: "agent" | "tree" | "review" | "ledger" } };

export function exceptionsOf(job: JobState): Exception[] {
	const out: Exception[] = [];
	const scale = job.mode === "scale";
	for (const id of job.order) {
		const l = job.lanes[id];
		if (!l) continue;
		const who = firstName(job, l);
		if (l.stopped) out.push({ id: `${id}:stopped`, kind: "stopped", tone: "bad", contractId: id, title: `${who} was stopped`, detail: "Rejected, not merged, not paid. Its write token is revoked.", action: { label: "Open", to: "agent" } });
		else if (l.status === "rejected") out.push({ id: `${id}:rejected`, kind: "rejected", tone: "bad", contractId: id, title: `${who} was rejected`, detail: l.rejectReason ?? (l.reverted ? "Reverted in review." : "Back to work."), action: { label: "Open", to: "agent" } });
		else if (l.status === "conflict" || l.status === "resolving") out.push({ id: `${id}:conflict`, kind: "conflict", tone: "warn", contractId: id, title: `${who} ${l.status === "resolving" ? "is resolving a conflict" : "hit a conflict"}`, detail: `${l.conflictPaths[l.conflictPaths.length - 1] ?? "a shared file"}. The agent that caused it fixes it.`, action: { label: "Show in tree", to: "tree" } });
		else if (l.paused) out.push({ id: `${id}:paused`, kind: "paused", tone: "warn", contractId: id, title: `${who} is paused`, detail: "Waiting for you to resume or stop it.", action: { label: "Open", to: "agent" } });
		const v = l.review ?? l.lastReview;
		if (!scale && v && v.score < 3 && !l.stopped) out.push({ id: `${id}:inspector`, kind: "inspector", tone: "bad", contractId: id, title: `Inspector failed ${who}: ${v.score}/5`, detail: displayName(v.notes), action: { label: "Open", to: "agent" } });
		else if (!scale && !v && ["queued", "merging", "merged", "paid"].includes(l.status)) out.push({ id: `${id}:uninspected`, kind: "uninspected", tone: "warn", contractId: id, title: `${who} merged without an Inspector verdict`, detail: "Nobody scored this delivery.", action: { label: "Open review", to: "review" } });
	}
	const c = countersOf(job);
	if (c.budget > 0 && c.spent > c.budget) out.push({ id: "budget", kind: "budget", tone: "bad", title: "Over budget", detail: `Wages ${c.spent.toFixed(2)} USDC against a ${c.budget.toFixed(2)} budget.`, action: { label: "Ledger", to: "ledger" } });
	if (job.status === "failed") out.push({ id: "failed", kind: "failed", tone: "bad", title: "The job failed", detail: job.error ?? "See the ticker for the last event.", action: { label: "Ledger", to: "ledger" } });
	const rank = { bad: 0, warn: 1 } as const;
	return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ---------- Foreman copilot: deterministic suggestions from events ----------

export type Suggestion = { id: string; text: string; tone: "info" | "warn" | "good"; action?: { label: string; to: "agent" | "tree" | "review" | "ledger" | "crew"; contractId?: string } };

export function foremanOf(job: JobState): Suggestion[] {
	const out: Suggestion[] = [];
	const lanes = job.order.map((id) => job.lanes[id]).filter(Boolean);
	const scale = job.mode === "scale";

	// Agents that keep colliding on the same file.
	for (const l of lanes) {
		const counts = new Map<string, number>();
		for (const p of l.conflictPaths) counts.set(p, (counts.get(p) ?? 0) + 1);
		for (const [path, n] of counts) {
			if (n >= 2) out.push({ id: `repeat:${l.id}:${path}`, tone: "warn", text: `${firstName(job, l)} caused ${n} conflicts in ${path}. Consider shrinking its lease.`, action: { label: "Open", to: "agent", contractId: l.id } });
		}
	}

	// A file that many different agents collide on.
	const byPath = new Map<string, Set<string>>();
	let conflictLanes = 0;
	for (const l of lanes) {
		if (l.conflicts > 0) conflictLanes++;
		for (const p of l.conflictPaths) {
			if (!byPath.has(p)) byPath.set(p, new Set());
			byPath.get(p)!.add(l.id);
		}
	}
	for (const [path, who] of byPath) {
		if (who.size >= 3) out.push({ id: `hot:${path}`, tone: "warn", text: `${path} is a hot file: ${who.size} agents collided on it. Split it, or lease it to one agent.`, action: { label: "Merge tree", to: "tree" } });
	}
	if (scale && conflictLanes > 0) {
		const delivered = lanes.filter((l) => l.delivered).length || 1;
		out.push({ id: "scale-rate", tone: "info", text: `${conflictLanes} of ${delivered} deliveries collided so far, all on the shared roll-call line. Each was fixed by the agent that caused it, inside its own crew.` });
	}

	// Idle specialist while others are still working (small crews only).
	if (!scale) {
		const working = lanes.filter((l) => stateOf(l) === "working");
		for (const l of lanes) {
			const idle = stateOf(l) === "merged" || (stateOf(l) === "committed" && l.status !== "reviewing" && l.status !== "delivered");
			if (idle && working.length >= 2 && /qa|test/i.test(l.role ?? agentOf(job, l).role ?? "")) out.push({ id: `idle:${l.id}`, tone: "info", text: `${firstName(job, l)} (QA) is idle while ${working.length} agents still work. Reassign it to check their deliveries?`, action: { label: "Open", to: "agent", contractId: l.id } });
		}
	}

	// Stalled: nothing from this agent for a long run of events while the rest of the crew moves.
	if (!scale && lanes.length > 1 && lanes.length <= 12) {
		for (const l of lanes) {
			if (stateOf(l) === "working" && l.tasks.some((t) => !t.done) && job.seq - l.touched > 160) out.push({ id: `stall:${l.id}`, tone: "warn", text: `${firstName(job, l)} has been quiet for a while. Chat to nudge it, or stop and re-hire.`, action: { label: "Open", to: "agent", contractId: l.id } });
		}
	}

	for (const l of lanes) {
		const v = l.review ?? l.lastReview;
		if (!scale && v && v.score < 3) out.push({ id: `fail:${l.id}`, tone: "warn", text: `Inspector scored ${firstName(job, l)} ${v.score}/5. Send a note on what to fix before it re-delivers.`, action: { label: "Chat", to: "agent", contractId: l.id } });
		if (l.paused) out.push({ id: `paused:${l.id}`, tone: "warn", text: `${firstName(job, l)} is paused. Resume it or stop it so the crew can finish.`, action: { label: "Open", to: "agent", contractId: l.id } });
	}

	const c = countersOf(job);
	if (c.budget > 0 && c.spent > c.budget * 0.8 && c.spent <= c.budget) out.push({ id: "budget80", tone: "warn", text: `Wages are at ${Math.round((c.spent / c.budget) * 100)}% of the budget.`, action: { label: "Ledger", to: "ledger" } });

	// Crews that finished.
	for (const id of job.crewOrder) {
		const cr = job.crews[id];
		if (cr.merged) out.push({ id: `crew:${id}`, tone: "good", text: `${cr.name} crew line is in main${cr.conflicts ? `, ${cr.conflicts} conflict${cr.conflicts > 1 ? "s" : ""} resolved on the way` : " with no conflicts"}.`, action: { label: "Merge tree", to: "tree" } });
	}
	if (job.scaleDone) out.push({ id: "scale-done", tone: "good", text: `All ${job.scaleDone.agents} agents merged. A human would have read ${job.scaleDone.commits} commits; you read ${job.scaleDone.conflicts} exceptions.`, action: { label: "Merge tree", to: "tree" } });
	if (job.status === "awaiting_signoff") out.push({ id: "signoff", tone: "good", text: `Everything is merged and inspected. Review shows what changed for a visitor; nothing is paid until you sign off.`, action: { label: "Open review", to: "review" } });
	if (job.status === "planning" || job.status === "hiring") out.push({ id: "hiring", tone: "info", text: job.status === "planning" ? "Reading the repo and splitting the goal into contracts." : "Hiring from the Hall. Each hire gets its own fork and a write key that expires with the contract." });
	return out;
}

// ---------- the focus grid: most interesting first ----------

const tier = (job: JobState, l: Lane, pinned: Set<string>): number => {
	if (pinned.has(l.id)) return 0;
	const s = stateOf(l);
	if (s === "conflict" || s === "rejected" || s === "paused") return 1;
	const v = l.review ?? l.lastReview;
	if (job.mode !== "scale" && v && v.score < 3) return 1;
	if (s === "merged") return 3;
	return 2;
};

export function interestOrder(job: JobState, pinned: Set<string>): Lane[] {
	return job.order
		.map((id) => job.lanes[id])
		.filter(Boolean)
		.map((l) => ({ l, t: tier(job, l, pinned) }))
		.sort((a, b) => a.t - b.t || b.l.touched - a.l.touched)
		.map((x) => x.l);
}

export function inspectorOf(l: Lane) {
	return l.review ?? l.lastReview;
}
