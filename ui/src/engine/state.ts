import type { Agent, AgentId, ChangeSummary, Conflict, Contract, ContractId, ContractStatus, JobEvent, JobId, JobStatus, JobView, Payout } from "../types";
import { CONTRACTOR } from "../types";
import { plural, sha7, usdc } from "../lib/format";
import { displayName } from "../lib/agents";

export type Source = "live" | "mock" | "replay";

export type LaneTask = { id: string; title: string; story?: string; done: boolean; sha?: string };

export type Lane = {
	id: ContractId;
	agentId: AgentId;
	title: string;
	brief: string;
	paths: string[];
	wage: number;
	status: ContractStatus;
	hired: boolean;
	delivered: boolean; // a commit block exists for the current attempt
	fork?: { name: string; remote: string; ms?: number };
	tokenExpiresAt?: string;
	tokenEndsAt?: number; // local clock ms, so recorded runs still count down
	review?: { score: number; notes: string };
	/** The last Inspector verdict ever given, kept across re-deliveries so receipts never say "Not reviewed" for reviewed work. */
	lastReview?: { score: number; notes: string };
	role?: string;
	tasks: LaneTask[];
	reverted?: boolean;
	rejections: number;
	rejectReason?: string;
	thought?: { key: number; text: string };
	files: Record<string, string>;
	currentPath?: string;
	sha?: string;
	mergeSha?: string;
	changes?: ChangeSummary;
	payout?: Payout;
	rep?: { before: number; after: number; reason: string };
	/** Command center: crew line this agent merges into (scale runs), and where it actually merged (crew id; absent = main). */
	crewId?: string;
	mergedInto?: string;
	/** A1 controls: the human paused / stopped this agent. */
	paused?: boolean;
	stopped?: boolean;
	/** Human <-> agent chat and control log for the focus view. */
	notes: LaneNote[];
	conflicts: number;
	resolved: number;
	conflictPaths: string[];
	/** `seq` of the last event that touched this lane (recency for the focus grid). */
	touched: number;
};

export type LaneNote = { key: number; kind: "note" | "control"; from?: "human" | "agent"; text: string; t: number };
export type Crew = { id: string; name: string; contractIds: ContractId[]; merged: boolean; sha?: string; conflicts: number };
export type FeedItem = { key: number; text: string; tone: Tone; contractId?: ContractId };

export type Bay = { contractId: ContractId; phase: "merging" | "conflict" | "resolving" | "snap"; conflicts?: Conflict[]; withContractId?: ContractId };
export type Tone = "info" | "good" | "warn" | "bad" | "money";
export type Narration = { key: number; text: string; tone: Tone; contractId?: ContractId };

export type JobState = {
	source: Source;
	jobId: JobId;
	goal: string;
	budget: number;
	status: JobStatus;
	plan?: NonNullable<JobView["plan"]>;
	lanes: Record<ContractId, Lane>;
	order: ContractId[];
	agents: Record<AgentId, Agent>;
	repHistory: Record<AgentId, number[]>;
	mainline: { sha: string; message: string; contractId?: ContractId }[];
	queue: ContractId[];
	bay: Bay | null;
	payouts: Payout[];
	narration?: Narration;
	focus?: ContractId;
	error?: string;
	foremanNotes: { key: number; text: string }[];
	seq: number;
	lineClear: number;
	createdAt: number;
	resultHref?: string;
	/** "scale" = scripted 100-agent run (git layer only): crews, merge tree, no Inspector or payouts. */
	mode?: "crew" | "scale";
	crews: Record<string, Crew>;
	crewOrder: string[];
	scaleDone?: Extract<UIEvent, { type: "scale_done" }>;
	/** Every narration line, newest last (the command center's compact ticker). */
	feed: FeedItem[];
	/** `review_ready` arrived (or the job reached sign-off): the visual review can be fetched. */
	reviewReady: boolean;
};

export type UIEvent = JobEvent | { type: "_snap"; contractId: ContractId; t: number; jobId: JobId };

export function emptyState(opts: { source: Source; jobId: JobId; goal: string; budget: number; agents: Agent[]; mainline?: JobState["mainline"]; mode?: JobState["mode"] }): JobState {
	return {
		mode: opts.mode,
		source: opts.source,
		jobId: opts.jobId,
		goal: opts.goal,
		budget: opts.budget,
		status: "planning",
		lanes: {},
		order: [],
		agents: Object.fromEntries(opts.agents.map((a) => [a.id, a])),
		repHistory: Object.fromEntries(opts.agents.map((a) => [a.id, [a.reputation]])),
		mainline: opts.mainline ?? [],
		queue: [],
		bay: null,
		payouts: [],
		foremanNotes: [],
		seq: 0,
		lineClear: 0,
		createdAt: Date.now(),
		reviewReady: false,
		crews: {},
		crewOrder: [],
		feed: [],
	};
}

function laneFrom(c: Contract & { crewId?: string }): Lane {
	const s = c.status;
	return {
		id: c.id,
		agentId: c.agentId,
		title: c.title,
		brief: c.brief,
		paths: c.paths,
		wage: c.wage,
		status: s,
		hired: s !== "offered",
		delivered: ["delivered", "reviewing", "queued", "merging", "conflict", "resolving", "merged", "paid"].includes(s),
		fork: c.fork ? { name: c.fork.name, remote: c.fork.remote } : undefined,
		tokenExpiresAt: c.tokenExpiresAt,
		review: c.review,
		lastReview: c.review,
		role: c.role,
		tasks: (c.tasks ?? []).map((t) => ({ id: t.id, title: t.title, story: t.story, done: t.status === "done", sha: t.sha })),
		reverted: c.decision === "reject" && c.status === "rejected" ? true : undefined,
		rejections: Math.max(0, (c.attempts ?? 1) - 1),
		files: {},
		sha: c.fork?.headSha,
		changes: c.changes,
		payout: c.payout,
		crewId: c.crewId,
		notes: [],
		conflicts: 0,
		resolved: 0,
		conflictPaths: [],
		touched: 0,
	};
}

/** Server task list wins on status; keep any live-only task rows the snapshot has not caught up with. */
function mergeTasks(server: LaneTask[], local: LaneTask[]): LaneTask[] {
	if (server.length === 0) return local;
	const done = new Map(local.map((t) => [t.id, t]));
	return server.map((t) => (t.done ? t : done.get(t.id)?.done ? done.get(t.id)! : t));
}

/** Rebuild everything from a server snapshot (first WebSocket frame, or a poll). */
export function fromSnapshot(job: JobView, agents: Agent[], source: Source, prev?: JobState): JobState {
	const base = prev && prev.jobId === job.id ? prev : emptyState({ source, jobId: job.id, goal: job.goal, budget: job.budget, agents });
	const lanes: Record<ContractId, Lane> = {};
	for (const c of job.contracts) {
		const old = base.lanes[c.id];
		const next = laneFrom(c);
		lanes[c.id] = old ? { ...next, files: old.files, currentPath: old.currentPath, thought: old.thought, rep: old.rep, rejectReason: old.rejectReason, crewId: next.crewId ?? old.crewId, mergedInto: old.mergedInto, paused: old.paused, stopped: old.stopped, notes: old.notes, conflicts: old.conflicts, resolved: old.resolved, conflictPaths: old.conflictPaths, touched: old.touched, lastReview: next.lastReview ?? old.lastReview, tasks: mergeTasks(next.tasks, old.tasks), reverted: next.reverted ?? old.reverted } : next;
	}
	const order = job.contracts.map((c) => c.id);
	const queue = order.filter((id) => lanes[id].status === "queued");
	const inBay = order.find((id) => ["merging", "conflict", "resolving"].includes(lanes[id].status));
	const payouts = job.contracts.flatMap((c) => (c.payout ? [c.payout] : []));
	return {
		...base,
		source,
		mode: (job as { mode?: "crew" | "scale" }).mode ?? base.mode,
		goal: job.goal,
		budget: job.budget,
		status: job.status,
		plan: job.plan ?? base.plan,
		lanes,
		order,
		mainline: job.mainline.map((m) => ({ sha: m.sha, message: m.message, contractId: m.contractId })),
		queue,
		bay: inBay ? { contractId: inBay, phase: lanes[inBay].status === "conflict" ? "conflict" : lanes[inBay].status === "resolving" ? "resolving" : "merging", conflicts: base.bay?.conflicts, withContractId: base.bay?.withContractId } : null,
		payouts,
		createdAt: job.createdAt,
		reviewReady: base.reviewReady || job.status === "awaiting_signoff" || job.status === "paying" || job.status === "closed",
	};
}

function name(s: JobState, agentId?: AgentId): string {
	if (!agentId) return CONTRACTOR.name;
	const n = s.agents[agentId]?.name ?? agentId;
	return displayName(n);
}
function laneName(s: JobState, id: ContractId): string {
	const l = s.lanes[id];
	return l ? name(s, l.agentId) : id;
}

function say(s: JobState, text: string, tone: Tone, contractId?: ContractId): JobState {
	return { ...s, narration: { key: s.seq, text, tone, contractId }, focus: contractId ?? s.focus, feed: [...s.feed, { key: s.seq, text, tone, contractId }].slice(-60) };
}

function patchLane(s: JobState, id: ContractId, patch: Partial<Lane>): JobState {
	const l = s.lanes[id];
	if (!l) return s;
	return { ...s, lanes: { ...s.lanes, [id]: { ...l, touched: s.seq, ...patch } } };
}

export function reduce(prev: JobState, ev: UIEvent): JobState {
	const s: JobState = { ...prev, seq: prev.seq + 1 };
	switch (ev.type) {
		case "status": {
			let n: JobState = { ...s, status: ev.status };
			if (ev.status === "awaiting_signoff") {
				n = { ...n, lineClear: n.lineClear + 1, focus: undefined };
				return say({ ...n, reviewReady: true }, "Every delivery is merged. Review each chapter, then sign off.", "good");
			}
			if (ev.status === "closed") return say(n, "Job closed. Every wage is paid.", "good");
			if (ev.status === "failed") return say(n, "The job failed.", "bad");
			if (ev.status === "hiring") return say(n, `${CONTRACTOR.name} is hiring from the Hall.`, "info");
			return n;
		}
		case "plan": {
			const lanes: Record<ContractId, Lane> = {};
			for (const c of ev.contracts) lanes[c.id] = laneFrom(c);
			return say({ ...s, plan: ev.plan, budget: ev.budget, lanes, order: ev.contracts.map((c) => c.id) }, `${CONTRACTOR.name} drafted ${plural(ev.contracts.length, "contract")}.`, "info");
		}
		case "hired": {
			// A live scale run may hire before (or without) a plan event: make the lane so the agent still shows up.
			const base = s.lanes[ev.contractId]
				? s
				: { ...s, lanes: { ...s.lanes, [ev.contractId]: laneFrom({ id: ev.contractId, agentId: ev.agentId, title: ev.contractId, brief: "", paths: [], wage: ev.wage, status: "offered", attempts: 0 }) }, order: [...s.order, ev.contractId] };
			const n = patchLane(base, ev.contractId, { hired: true, status: "forking", wage: ev.wage, agentId: ev.agentId });
			return say(n, `${CONTRACTOR.name} hired ${name(s, ev.agentId)} for ${usdc(ev.wage)} USDC.`, "info", ev.contractId);
		}
		case "forked": {
			const n = patchLane(s, ev.contractId, { status: "working", fork: { ...ev.fork, ms: ev.ms }, tokenExpiresAt: ev.tokenExpiresAt, tokenEndsAt: Date.now() + Math.max(0, new Date(ev.tokenExpiresAt).getTime() - ev.t) });
			const mins = Math.max(1, Math.round((new Date(ev.tokenExpiresAt).getTime() - ev.t) / 60000));
			return say(n, `${laneName(s, ev.contractId)} got its own fork in ${ev.ms} ms. The write token lasts ${mins} min.`, "info", ev.contractId);
		}
		case "foreman":
			return { ...s, foremanNotes: [...s.foremanNotes, { key: s.seq, text: displayName(ev.note) }].slice(-8) };
		case "thinking": {
			const l = s.lanes[ev.contractId];
			if (!l) return s;
			const status: ContractStatus = ["offered", "forking", "rejected"].includes(l.status) ? "working" : l.status;
			return patchLane({ ...s, focus: s.focus ?? ev.contractId }, ev.contractId, { thought: { key: s.seq, text: displayName(ev.note) }, status });
		}
		case "typing": {
			const l = s.lanes[ev.contractId];
			if (!l) return s;
			const status: ContractStatus = ["offered", "forking", "rejected"].includes(l.status) ? "working" : l.status;
			return patchLane(s, ev.contractId, { files: { ...l.files, [ev.path]: (l.files[ev.path] ?? "") + ev.chunk }, currentPath: ev.path, status });
		}
		case "delivered": {
			const n = patchLane(s, ev.contractId, { status: "delivered", delivered: true, sha: ev.sha, changes: ev.changes, rejectReason: undefined, review: undefined }); // lastReview stays: a conflict re-delivery must not wipe the verdict
			return say(n, `${laneName(s, ev.contractId)} delivered ${plural(ev.changes.files.length, "file")} (+${ev.changes.added} −${ev.changes.removed}).`, "info", ev.contractId);
		}
		case "review": {
			const verdict = { score: ev.score, notes: displayName(ev.notes) };
			const n = patchLane(s, ev.contractId, { status: "reviewing", review: verdict, lastReview: verdict });
			return say(n, `Inspector scored ${laneName(s, ev.contractId)} ${ev.score} out of 5.`, ev.score >= 3 ? "good" : "warn", ev.contractId);
		}
		case "task": {
			const l = s.lanes[ev.contractId];
			if (!l) return s;
			const done: LaneTask = { id: ev.taskId, title: ev.title, story: ev.story, done: true, sha: ev.sha };
			const has = l.tasks.some((t) => t.id === ev.taskId);
			const tasks = has ? l.tasks.map((t) => (t.id === ev.taskId ? { ...t, ...done } : t)) : [...l.tasks, done];
			const status: ContractStatus = ["offered", "forking", "rejected"].includes(l.status) ? "working" : l.status;
			return patchLane({ ...s, focus: s.focus ?? ev.contractId }, ev.contractId, { tasks, status, thought: { key: s.seq, text: ev.title } });
		}
		case "review_ready":
			return say({ ...s, reviewReady: true }, "The review is ready: before and after for every hire.", "good");
		case "reverted": {
			const n = patchLane({ ...s, mainline: [...s.mainline, { sha: ev.sha, message: `Revert ${s.lanes[ev.contractId]?.title ?? "chapter"}`, contractId: ev.contractId }] }, ev.contractId, { reverted: true, status: "rejected" });
			return say(n, `${laneName(s, ev.contractId)}'s chapter was rejected in review and reverted on main. It will not be paid.`, "bad", ev.contractId);
		}
		case "queued": {
			const queue = s.queue.includes(ev.contractId) ? s.queue : [...s.queue, ev.contractId];
			const n = patchLane({ ...s, queue }, ev.contractId, { status: "queued" });
			return say(n, `${laneName(s, ev.contractId)} joined the merge queue${ev.position > 1 ? ` at position ${ev.position}` : ""}.`, "info", ev.contractId);
		}
		case "merge_start": {
			const n = patchLane({ ...s, queue: s.queue.filter((x) => x !== ev.contractId), bay: { contractId: ev.contractId, phase: "merging" } }, ev.contractId, { status: "merging" });
			return say(n, `Merging ${laneName(s, ev.contractId)} into main, three-way per file.`, "info", ev.contractId);
		}
		case "conflict": {
			const prior = s.lanes[ev.contractId];
			const n = patchLane({ ...s, bay: { contractId: ev.contractId, phase: "conflict", conflicts: ev.conflicts, withContractId: ev.withContractId } }, ev.contractId, { status: "conflict", conflicts: (prior?.conflicts ?? 0) + 1, conflictPaths: [...(prior?.conflictPaths ?? []), ...ev.conflicts.map((c) => c.path)] });
			const c = ev.conflicts[0];
			const other = ev.withContractId ? laneName(s, ev.withContractId) : "main";
			return say(n, `${laneName(s, ev.contractId)} and ${other} both edited ${c?.path ?? "the same lines"}${c ? ` at line ${c.baseLine}` : ""}. ${laneName(s, ev.contractId)} has to resolve it.`, "warn", ev.contractId);
		}
		case "resolving": {
			const l = s.lanes[ev.contractId];
			const path = s.bay?.conflicts?.[0]?.path;
			const files = path && l ? { ...l.files, [path]: "" } : l?.files ?? {};
			const n = patchLane({ ...s, bay: s.bay ? { ...s.bay, phase: "resolving" } : { contractId: ev.contractId, phase: "resolving" } }, ev.contractId, { status: "resolving", files, currentPath: path ?? l?.currentPath });
			return say(n, `${laneName(s, ev.contractId)} is re-delivering with the conflict resolved.`, "warn", ev.contractId);
		}
		case "_snap": {
			return { ...s, bay: s.bay ? { ...s.bay, phase: "snap" } : s.bay };
		}
		case "merged": {
			// `into` = a crew line (scale runs); absent = main.
			const into = ev.into;
			const prior = s.lanes[ev.contractId];
			const mainline = into ? s.mainline : [...s.mainline, { sha: ev.sha, message: `${prior?.title ?? "Delivery"}`, contractId: ev.contractId }];
			const n = patchLane({ ...s, bay: null, queue: s.queue.filter((x) => x !== ev.contractId), mainline }, ev.contractId, { status: "merged", mergeSha: ev.sha, delivered: true, mergedInto: into, resolved: (prior?.resolved ?? 0) + (prior?.status === "resolving" ? 1 : 0) });
			return say(n, `${laneName(s, ev.contractId)} merged into ${into ? (s.crews[into]?.name ?? into) : "main"} (${sha7(ev.sha)}).`, "good", ev.contractId);
		}
		case "crew": {
			const crew: Crew = { id: ev.crewId, name: ev.name, contractIds: ev.contractIds, merged: false, conflicts: 0 };
			const lanes = { ...s.lanes };
			for (const id of ev.contractIds) if (lanes[id]) lanes[id] = { ...lanes[id], crewId: ev.crewId };
			return { ...s, mode: "scale", lanes, crews: { ...s.crews, [ev.crewId]: crew }, crewOrder: s.crewOrder.includes(ev.crewId) ? s.crewOrder : [...s.crewOrder, ev.crewId] };
		}
		case "crew_merged": {
			const c = s.crews[ev.crewId];
			const crews = { ...s.crews, [ev.crewId]: { ...(c ?? { id: ev.crewId, name: ev.crewId, contractIds: [] }), merged: true, sha: ev.sha, conflicts: ev.conflicts } };
			const n = { ...s, crews, mainline: [...s.mainline, { sha: ev.sha, message: `Merge ${c?.name ?? ev.crewId}` }] };
			return say(n, `${c?.name ?? ev.crewId} crew line merged into main (${sha7(ev.sha)})${ev.conflicts ? `, ${plural(ev.conflicts, "conflict")} resolved on the way` : ""}.`, "good");
		}
		case "scale_done":
			return say({ ...s, scaleDone: ev }, `Scale run done: ${ev.agents} agents, ${ev.forks} forks, ${ev.commits} commits, ${ev.resolved} of ${ev.conflicts} conflicts resolved.`, "good");
		case "control": {
			const l = s.lanes[ev.contractId];
			if (!l) return s;
			const patch: Partial<Lane> = ev.action === "pause" ? { paused: true } : ev.action === "resume" ? { paused: false } : { stopped: true, paused: false };
			const word = ev.action === "pause" ? "paused" : ev.action === "resume" ? "resumed" : "stopped";
			const n = patchLane(s, ev.contractId, { ...patch, notes: [...l.notes, { key: s.seq, kind: "control", text: `You ${word} ${laneName(s, ev.contractId)}.`, t: ev.t }] });
			return say(n, `${laneName(s, ev.contractId)} was ${word} by you.`, ev.action === "stop" ? "bad" : "warn", ev.contractId);
		}
		case "note": {
			const l = s.lanes[ev.contractId];
			if (!l) return s;
			return patchLane(s, ev.contractId, { notes: [...l.notes, { key: s.seq, kind: "note", from: ev.from, text: displayName(ev.text), t: ev.t }] });
		}
		case "rejected": {
			const l = s.lanes[ev.contractId];
			const n = patchLane(s, ev.contractId, { status: "rejected", delivered: false, rejectReason: displayName(ev.reason), rejections: (l?.rejections ?? 0) + 1, files: {}, currentPath: undefined });
			return say(n, `${laneName(s, ev.contractId)}'s delivery was rejected. It goes back to work.`, "bad", ev.contractId);
		}
		case "payout": {
			const p = ev.payout;
			const n = patchLane({ ...s, payouts: [...s.payouts.filter((x) => x.contractId !== p.contractId), p] }, p.contractId, { status: "paid", payout: p });
			return say(n, `Paid ${name(s, p.agentId)} ${usdc(p.amount)} USDC.`, "money", p.contractId);
		}
		case "reputation": {
			const a = s.agents[ev.agentId];
			const agents = a ? { ...s.agents, [ev.agentId]: { ...a, reputation: ev.after } } : s.agents;
			const hist = { ...s.repHistory, [ev.agentId]: [...(s.repHistory[ev.agentId] ?? [ev.before]), ev.after] };
			const laneId = s.order.find((id) => s.lanes[id]?.agentId === ev.agentId);
			const n = laneId ? patchLane({ ...s, agents, repHistory: hist }, laneId, { rep: { before: ev.before, after: ev.after, reason: ev.reason } }) : { ...s, agents, repHistory: hist };
			const d = ev.after - ev.before;
			return say(n, `${name(s, ev.agentId)}'s reputation ${d >= 0 ? "rose" : "fell"} ${Math.abs(d)} to ${ev.after}.`, d >= 0 ? "good" : "bad", laneId);
		}
		case "error":
			return say({ ...s, error: ev.message }, displayName(ev.message), "bad", ev.contractId);
	}
	return s;
}

export const STEP_ORDER: ContractStatus[] = ["forking", "working", "delivered", "reviewing", "queued", "merging", "merged", "paid"];
export const STEP_LABEL: Record<ContractStatus, string> = {
	offered: "Offered",
	forking: "Forking repo",
	working: "Working",
	delivered: "Delivered",
	reviewing: "Reviewed",
	queued: "In merge queue",
	merging: "Merging",
	conflict: "Conflict",
	resolving: "Resolving",
	merged: "Merged",
	rejected: "Rejected",
	paid: "Paid",
};

export type Place = "none" | "lane" | "queue" | "bay" | "trunk";
export function blockPlace(l: Lane): Place {
	if (!l.delivered) return "none";
	switch (l.status) {
		case "delivered":
		case "reviewing":
			return "lane";
		case "queued":
			return "queue";
		case "merging":
		case "conflict":
		case "resolving":
			return "bay";
		case "merged":
		case "paid":
			return "trunk";
		default:
			return "none";
	}
}

