// Human override of the Foreman's plan: validation, application and a plain-English change summary.
// Pure functions (no Worker/DO imports) so they are unit-tested in edit.test.ts. Used by Job.approveBudget(edit).
import { ROSTER } from "../shared/roster";
import type { Agent, Contract, Task } from "../shared/types";

export type EditedTask = { title: string; detail?: string };
export type EditedContract = { agentId: string; role: string; tasks: EditedTask[]; leases: string[] };

export type PlanEditResult = { ok: true; contracts: EditedContract[]; totalWage: number } | { ok: false; error: string };

/** The wage rule: a contract pays the agent's listed rate (same rule the Foreman's plan uses in Job.runPlan). */
export const wageOf = (a: Agent): number => a.rate;

/** Prefix on errors thrown by Job.approveBudget for a bad edited plan, so the route can answer 400 instead of 409. */
export const INVALID_PLAN = "invalid plan: ";

/** Crew roles a contract may carry: the roles of the hireable agents in the roster. */
export const ROLES: string[] = [...new Set(ROSTER.filter((a) => a.provider !== "house" && a.role).map((a) => a.role!))];

const MAX_CONTRACTS = 8;
const MAX_TASKS = 12;
const MAX_TITLE = 140;
const MAX_DETAIL = 400;
const MAX_LEASES = 20;
const MAX_LEASE_LEN = 120;

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
/** Replace control characters (newlines, tabs, escapes...) with spaces, collapse runs, trim. */
const clean = (v: unknown): string => String(v ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
const cents = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(cents(n)).toFixed(2)} USDC`;

const safeLease = (p: string) => p.length >= 1 && p.length <= MAX_LEASE_LEN && /^[A-Za-z0-9._/-]+$/.test(p) && !p.startsWith("/") && !p.includes("..") && !p.includes("//");

export function validatePlanEdit(body: unknown, ctx: { agents: Agent[]; budget: number }): PlanEditResult {
	const fail = (error: string): PlanEditResult => ({ ok: false, error });
	const raw = (body as { contracts?: unknown } | null | undefined)?.contracts;
	if (!Array.isArray(raw)) return fail("contracts must be a list of 1 to 8 contracts");
	if (raw.length < 1 || raw.length > MAX_CONTRACTS) return fail(`A plan needs 1 to ${MAX_CONTRACTS} contracts (got ${raw.length}).`);

	const seen = new Set<string>();
	const contracts: EditedContract[] = [];
	let total = 0;
	for (const [i, rc] of raw.entries()) {
		const n = `Contract ${i + 1}`;
		if (!rc || typeof rc !== "object") return fail(`${n} must be an object.`);
		const c = rc as Record<string, unknown>;
		const agentId = clean(c.agentId);
		const agent = ctx.agents.find((a) => a.id === agentId) ?? ROSTER.find((a) => a.id === agentId);
		if (!agent) return fail(`${n}: no agent "${agentId.slice(0, 40)}" in the Hall.`);
		if (agent.provider === "house") return fail(`${n}: ${agent.name} is a house service and can't be hired onto a crew.`);
		if (!ctx.agents.some((a) => a.id === agentId)) return fail(`${n}: ${agent.name} isn't available to hire right now.`);
		if (seen.has(agentId)) return fail(`${agent.name} is on the crew twice; each agent can hold one contract per job.`);
		seen.add(agentId);

		const role = ROLES.find((r) => r.toLowerCase() === clean(c.role).toLowerCase());
		if (!role) return fail(`${n}: unknown role "${clean(c.role).slice(0, 40)}". Roles: ${ROLES.join(", ")}.`);

		if (!Array.isArray(c.tasks) || c.tasks.length < 1 || c.tasks.length > MAX_TASKS) return fail(`${agent.name}: a contract needs 1 to ${MAX_TASKS} tasks.`);
		const tasks: EditedTask[] = [];
		for (const [k, rt] of c.tasks.entries()) {
			const t = (rt && typeof rt === "object" ? rt : { title: rt }) as Record<string, unknown>;
			const title = clean(t.title);
			if (!title) return fail(`${agent.name}, task ${k + 1}: the title can't be empty.`);
			if (title.length > MAX_TITLE) return fail(`${agent.name}, task ${k + 1}: the title is over ${MAX_TITLE} characters.`);
			const task: EditedTask = { title };
			if (t.detail !== undefined && t.detail !== null) {
				const detail = clean(t.detail);
				if (detail.length > MAX_DETAIL) return fail(`${agent.name}, task ${k + 1}: the detail is over ${MAX_DETAIL} characters.`);
				if (detail) task.detail = detail;
			}
			tasks.push(task);
		}

		const rawLeases = c.leases === undefined ? [] : c.leases;
		if (!Array.isArray(rawLeases)) return fail(`${agent.name}: leases must be a list of file paths.`);
		if (rawLeases.length > MAX_LEASES) return fail(`${agent.name}: at most ${MAX_LEASES} file leases.`);
		const leases: string[] = [];
		for (const l of rawLeases) {
			const p = clean(l);
			if (typeof l !== "string" || p !== l || !safeLease(p)) return fail(`${agent.name}: bad lease "${String(l).replace(CONTROL_CHARS, " ").slice(0, 40)}"; use a relative path of letters, digits, . _ - / (max ${MAX_LEASE_LEN}) with no "..".`);
			if (!leases.includes(p)) leases.push(p);
		}

		total += wageOf(agent);
		contracts.push({ agentId, role, tasks, leases });
	}
	const totalWage = cents(total);
	if (totalWage > ctx.budget + 1e-9) return fail(`That crew costs ${totalWage} USDC but the budget is ${ctx.budget} USDC. Remove an agent or swap in a cheaper one.`);
	return { ok: true, contracts, totalWage };
}

/**
 * Turn a validated edit into contracts. A retained agent keeps its contract id, title and brief; a new agent gets a
 * fresh id (never one already used in this plan) and, if it takes over a removed agent's role, that contract's title/brief.
 */
export function applyPlanEdit(jobId: string, before: Contract[], edited: EditedContract[], agents: Agent[]): Contract[] {
	const num = (id: string) => Number(/-c(\d+)$/.exec(id)?.[1] ?? 0);
	let nextN = Math.max(0, ...before.map((c) => num(c.id)));
	const kept = new Set(edited.map((e) => e.agentId));
	const orphans = before.filter((c) => !kept.has(c.agentId)); // old contracts whose agent was removed or swapped out
	return edited.map((e) => {
		const agent = agents.find((a) => a.id === e.agentId)!;
		const same = before.find((c) => c.agentId === e.agentId);
		let source = same;
		if (!source) {
			const i = orphans.findIndex((o) => (o.role ?? "").toLowerCase() === e.role.toLowerCase());
			if (i >= 0) source = orphans.splice(i, 1)[0];
		}
		const id = same ? same.id : `${jobId}-c${++nextN}`;
		const oldTasks = new Map((same?.tasks ?? []).map((t) => [t.title, t]));
		const tasks: Task[] = e.tasks.map((t, n) => ({
			id: `${id}-t${n + 1}`,
			title: t.title,
			...(t.detail ? { detail: t.detail } : {}),
			paths: oldTasks.get(t.title)?.paths ?? e.leases,
			status: "todo",
		}));
		const title = source?.title ?? `${e.role}: ${e.tasks[0].title}`.slice(0, 60);
		const brief = source?.brief ?? `Deliver these ${e.tasks.length} task(s) as the crew's ${e.role}: ${e.tasks.map((t) => t.title).join("; ")}.`.slice(0, 600);
		return { id, agentId: agent.id, title, brief, paths: e.leases, wage: wageOf(agent), status: "offered", attempts: 0, role: e.role, tasks } satisfies Contract;
	});
}

/** Plain-English Foreman notes for what the human changed (one line per change, then the new total). */
export function describeEdits(before: Contract[], edited: EditedContract[], agents: Agent[], budget: number): string[] {
	const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
	const rate = (id: string) => {
		const a = agents.find((x) => x.id === id);
		return a ? wageOf(a) : 0;
	};
	const notes: string[] = [];
	const keptIds = new Set(edited.map((e) => e.agentId));
	const removed = before.filter((c) => !keptIds.has(c.agentId));
	for (const e of edited) {
		const prev = before.find((c) => c.agentId === e.agentId);
		if (prev) {
			if ((prev.role ?? "").toLowerCase() !== e.role.toLowerCase()) notes.push(`Changed ${name(e.agentId)}'s role from ${prev.role} to ${e.role}`);
			const had = new Set((prev.tasks ?? []).map((t) => t.title));
			const has = new Set(e.tasks.map((t) => t.title));
			const added = e.tasks.filter((t) => !had.has(t.title)).length;
			const dropped = [...had].filter((t) => !has.has(t)).length;
			const plural = (n: number) => `${n} task${n === 1 ? "" : "s"}`;
			if (added) notes.push(`Added ${plural(added)} to ${e.role}`);
			if (dropped) notes.push(`Removed ${plural(dropped)} from ${e.role}`);
			if (prev.paths.slice().sort().join("\n") !== e.leases.slice().sort().join("\n")) notes.push(`Changed the file leases for ${name(e.agentId)}`);
		} else {
			const i = removed.findIndex((r) => (r.role ?? "").toLowerCase() === e.role.toLowerCase());
			if (i >= 0) {
				const [out] = removed.splice(i, 1);
				notes.push(`Swapped ${name(out.agentId)} for ${name(e.agentId)} on ${e.role} (${usd(rate(e.agentId) - out.wage)})`);
			} else notes.push(`Added ${name(e.agentId)} as ${e.role} (${usd(rate(e.agentId))})`);
		}
	}
	for (const r of removed) notes.push(`Removed ${name(r.agentId)} (${r.role}, ${usd(-r.wage)})`);
	if (!notes.length) notes.push("You approved the plan as proposed");
	const total = cents(edited.reduce((n, e) => n + rate(e.agentId), 0));
	notes.push(`Crew now costs ${total} of ${budget} USDC budget`);
	return notes;
}
