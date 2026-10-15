import type { Agent } from "../types";
import type { JobState } from "../engine/state";
import { usdc } from "./format";

/** The edited plan, exactly the request body of POST /api/jobs/:id/approve-budget (agent A1's backend). */
export type PlanEdit = { contracts: { agentId: string; role: string; tasks: { title: string; detail?: string }[]; leases: string[] }[] };

export type DraftTask = { key: string; title: string; detail: string };
export type DraftContract = { key: string; agentId: string; role: string; title: string; brief: string; tasks: DraftTask[]; leases: string[] };

export const LIMITS = { contracts: 8, tasks: 12, title: 140, detail: 400, leases: 20 } as const;

let seq = 0;
export const nextKey = (p: string) => `${p}${++seq}`;

export const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
export const sameRole = (a?: string, b?: string) => !!a && !!b && norm(a) === norm(b);
export const isQA = (role?: string) => /qa|test|quality/.test(norm(role));

/** Pickable specialists: everyone except house services (Foreman, Inspector). */
export function hireable(agents: Record<string, Agent> | Agent[]): Agent[] {
	const list = Array.isArray(agents) ? agents : Object.values(agents);
	return list.filter((a) => a.provider !== "house" && a.id !== "inspector" && a.id !== "foreman" && a.id !== "warden");
}

export function draftFromJob(job: JobState): DraftContract[] {
	return job.order.map((id) => {
		const l = job.lanes[id];
		const a = job.agents[l.agentId];
		const tasks: DraftTask[] = l.tasks.length ? l.tasks.map((t) => ({ key: nextKey("t"), title: t.title, detail: "" })) : [{ key: nextKey("t"), title: l.title, detail: l.brief }];
		return { key: l.id, agentId: l.agentId, role: l.role ?? a?.role ?? "Generalist", title: l.title, brief: l.brief, tasks, leases: [...l.paths] };
	});
}

export const wageOf = (d: DraftContract, agents: Record<string, Agent>) => agents[d.agentId]?.rate ?? 0;
export const totalWage = (draft: DraftContract[], agents: Record<string, Agent>) => Math.round(draft.reduce((n, d) => n + wageOf(d, agents), 0) * 100) / 100;

export function toPayload(draft: DraftContract[]): PlanEdit {
	return {
		contracts: draft.map((d) => ({
			agentId: d.agentId,
			role: d.role,
			tasks: d.tasks.map((t) => ({ title: t.title.trim(), ...(t.detail.trim() ? { detail: t.detail.trim() } : {}) })),
			leases: d.leases,
		})),
	};
}

/** Compare against the plan the Foreman presented: only an actual edit sends a body. */
export const isEdited = (draft: DraftContract[], original: DraftContract[]) =>
	JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(original));

export function safeLease(p: string): string | null {
	const v = p.trim().replace(/^\.\//, "");
	if (!v || v.length > 120 || v.startsWith("/") || v.includes("..") || v.includes("\\") || /\s/.test(v) || /[<>:"|?*]/.test(v)) return null;
	return v;
}

/** Problems that make the server refuse the plan (A1's validation), phrased for a human. */
export function validate(draft: DraftContract[]): string[] {
	const out: string[] = [];
	if (draft.length < 1) out.push("Keep at least one contract.");
	if (draft.length > LIMITS.contracts) out.push(`A job can have at most ${LIMITS.contracts} contracts.`);
	for (const d of draft) {
		if (!d.tasks.length) out.push(`${d.title} has no tasks. Add one or remove the contract.`);
		if (d.tasks.length > LIMITS.tasks) out.push(`${d.title} has more than ${LIMITS.tasks} tasks.`);
		if (d.tasks.some((t) => !t.title.trim())) out.push(`${d.title} has a task with no title.`);
		if (d.tasks.some((t) => t.title.length > LIMITS.title)) out.push(`A task title in ${d.title} is over ${LIMITS.title} characters.`);
		if (d.tasks.some((t) => t.detail.length > LIMITS.detail)) out.push(`A task note in ${d.title} is over ${LIMITS.detail} characters.`);
		if (d.leases.length > LIMITS.leases) out.push(`${d.title} leases more than ${LIMITS.leases} files.`);
	}
	return out;
}

// ---------------------------------------------------------------- the Foreman's deterministic review of an edited plan

export type Fix =
	| { kind: "assign-lease"; path: string; ownerKey: string }
	| { kind: "add-qa"; agentId: string }
	| { kind: "swap"; contractKey: string; agentId: string }
	| { kind: "remove"; contractKey: string };

export type Issue = { id: string; level: "warn" | "error"; text: string; fix?: { label: string; fix: Fix } };

type Ctx = { agents: Record<string, Agent>; budget: number };

const name = (agents: Record<string, Agent>, id: string) => agents[id]?.name ?? id;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Candidates for a role, best reputation first, never someone already holding another contract. */
export function candidates(ctx: Ctx, role: string, draft: DraftContract[], exceptKey?: string): Agent[] {
	const taken = new Set(draft.filter((d) => d.key !== exceptKey).map((d) => d.agentId));
	return hireable(ctx.agents)
		.filter((a) => sameRole(a.role, role) && !taken.has(a.id))
		.sort((a, b) => b.reputation - a.reputation);
}

function ownerOf(path: string, holders: DraftContract[]): DraftContract {
	const base = path.split("/").pop()!.toLowerCase();
	const stem = base.replace(/\.[^.]+$/, "");
	const score = (d: DraftContract) => {
		const text = `${d.title} ${d.brief} ${d.tasks.map((t) => `${t.title} ${t.detail}`).join(" ")}`.toLowerCase();
		return (text.includes(base) ? 3 : 0) + (stem.length > 2 && text.includes(stem) ? 2 : 0);
	};
	return holders.map((d, i) => ({ d, s: score(d), i })).sort((a, b) => b.s - a.s || a.i - b.i)[0].d;
}

export function critique(draft: DraftContract[], ctx: Ctx): Issue[] {
	const { agents, budget } = ctx;
	const out: Issue[] = [];
	const who = (d: DraftContract) => name(agents, d.agentId);

	// one agent, one fork: the same agent twice would collide
	const seen = new Map<string, DraftContract>();
	for (const d of draft) {
		const first = seen.get(d.agentId);
		if (first) {
			const alt = candidates(ctx, d.role, draft, d.key)[0];
			out.push({ id: `dup:${d.key}`, level: "error", text: `${who(d)} is on two contracts, but every agent works in its own fork, one per job.${alt ? ` ${alt.name} can take this one.` : ""}`, fix: alt ? { label: `Give it to ${alt.name}`, fix: { kind: "swap", contractKey: d.key, agentId: alt.id } } : undefined });
		} else seen.set(d.agentId, d);
	}

	// lease overlap
	const byPath = new Map<string, DraftContract[]>();
	for (const d of draft) for (const p of d.leases) byPath.set(p, [...(byPath.get(p) ?? []), d]);
	for (const [path, holders] of byPath) {
		if (holders.length < 2) continue;
		const owner = ownerOf(path, holders);
		out.push({
			id: `overlap:${path}`,
			level: "warn",
			text: `${list(holders.map(who))} ${holders.length === 2 ? "both" : "all"} lease ${path}. Merges run one at a time, so the later one has to resolve a conflict. Give it to ${who(owner)}?`,
			fix: { label: `Give it to ${who(owner)}`, fix: { kind: "assign-lease", path, ownerKey: owner.key } },
		});
	}

	// nobody tests
	if (draft.length && !draft.some((d) => isQA(d.role) || isQA(agents[d.agentId]?.role))) {
		const qa = hireable(agents).filter((a) => isQA(a.role) && !draft.some((d) => d.agentId === a.id)).sort((a, b) => b.reputation - a.reputation)[0];
		if (qa) out.push({ id: "qa", level: "warn", text: `No one is testing. Add ${qa.name} for QA (${usdc(qa.rate)} USDC)?`, fix: { label: `Add ${qa.name}`, fix: { kind: "add-qa", agentId: qa.id } } });
		else out.push({ id: "qa", level: "warn", text: "No one is testing, and the Hall has no free QA agent right now." });
	}

	// over budget: the swap that fits the budget and costs the least reputation, else the biggest saving
	const total = totalWage(draft, agents);
	if (total > budget + 1e-9) {
		const over = Math.round((total - budget) * 100) / 100;
		const swaps: { d: DraftContract; a: Agent; save: number }[] = [];
		for (const d of draft) {
			const cur = agents[d.agentId];
			if (!cur) continue;
			for (const a of candidates(ctx, d.role, draft, d.key)) if (a.rate < cur.rate) swaps.push({ d, a, save: Math.round((cur.rate - a.rate) * 100) / 100 });
		}
		const fits = swaps.filter((s) => s.save + 1e-9 >= over).sort((x, y) => y.a.reputation - x.a.reputation || y.save - x.save)[0];
		const biggest = [...swaps].sort((x, y) => y.save - x.save)[0];
		const pick = fits ?? biggest;
		if (pick) {
			out.push({
				id: "budget",
				level: "error",
				text: `You are ${usdc(over)} USDC over budget. ${fits ? "" : "Even the best single swap does not cover it, but it helps: "}${pick.a.name} does ${pick.d.role} for ${usdc(pick.a.rate)} instead of ${who(pick.d)}'s ${usdc(agents[pick.d.agentId]?.rate ?? 0)}, saving ${usdc(pick.save)}.`,
				fix: { label: `Swap to ${pick.a.name}`, fix: { kind: "swap", contractKey: pick.d.key, agentId: pick.a.id } },
			});
		} else {
			const dear = [...draft].sort((a, b) => wageOf(b, agents) - wageOf(a, agents))[0];
			out.push({ id: "budget", level: "error", text: `You are ${usdc(over)} USDC over budget and no cheaper agent has the same role. Drop a contract or raise the budget.`, fix: dear ? { label: `Remove ${who(dear)}'s contract`, fix: { kind: "remove", contractKey: dear.key } } : undefined });
		}
	}

	for (const d of draft) {
		const a = agents[d.agentId];
		if (!a) continue;
		// role mismatch
		if (!sameRole(a.role, d.role)) {
			const best = candidates(ctx, d.role, draft, d.key)[0];
			out.push({
				id: `mismatch:${d.key}`,
				level: "warn",
				text: `${a.name} is a ${a.role ?? "generalist"}, but this contract is ${d.role}.${best ? ` ${best.name} is the ${d.role} specialist (${usdc(best.rate)} USDC).` : ""}`,
				fix: best ? { label: `Swap to ${best.name}`, fix: { kind: "swap", contractKey: d.key, agentId: best.id } } : undefined,
			});
			continue;
		}
		// weaker track record than the best same-role alternative
		const best = candidates(ctx, d.role, draft, d.key)[0];
		if (best && best.reputation - a.reputation >= 120) {
			const dRate = Math.round((best.rate - a.rate) * 100) / 100;
			const fitsBudget = total + dRate <= budget + 1e-9;
			out.push({
				id: `weak:${d.key}`,
				level: "warn",
				text: `${a.name}'s record is thinner than ${best.name}'s for ${d.role}: reputation ${a.reputation} against ${best.reputation}, ${a.stats.contracts ? `${a.stats.merged} of ${a.stats.contracts} merged` : "no merged work yet"}. ${best.name} costs ${dRate >= 0 ? `${usdc(dRate)} more` : `${usdc(-dRate)} less`}${fitsBudget ? "." : " and would break the budget."}`,
				fix: fitsBudget ? { label: `Swap to ${best.name}`, fix: { kind: "swap", contractKey: d.key, agentId: best.id } } : undefined,
			});
		}
	}
	return out;
}

export function applyFix(draft: DraftContract[], fix: Fix, ctx: Ctx): DraftContract[] {
	switch (fix.kind) {
		case "assign-lease":
			return draft.map((d) => (d.key === fix.ownerKey ? d : { ...d, leases: d.leases.filter((p) => p !== fix.path) }));
		case "swap":
			return draft.map((d) => (d.key === fix.contractKey ? { ...d, agentId: fix.agentId, role: ctx.agents[fix.agentId]?.role ?? d.role } : d));
		case "remove":
			return draft.filter((d) => d.key !== fix.contractKey);
		case "add-qa": {
			const a = ctx.agents[fix.agentId];
			return [...draft, newContract(a?.role ?? "QA", fix.agentId, ["tests/"], "Write regression tests for the new behaviour")];
		}
	}
}

export function newContract(role: string, agentId: string, leases: string[] = [], firstTask?: string): DraftContract {
	const title = firstTask ?? (isQA(role) ? "Write regression tests for the new behaviour" : `Do the ${role.toLowerCase()} work for the goal`);
	return { key: nextKey("n"), agentId, role, title: `${role}: ${title}`.slice(0, 60), brief: "", tasks: [{ key: nextKey("t"), title, detail: "" }], leases };
}

/** The Foreman's opening line: what it planned, in one sentence. */
export function greeting(draft: DraftContract[], ctx: Ctx): string {
	const total = totalWage(draft, ctx.agents);
	const left = Math.round((ctx.budget - total) * 100) / 100;
	const lead = draft[0] ? ` ${name(ctx.agents, draft[0].agentId)} leads on ${draft[0].role}.` : "";
	return `I planned ${draft.length} ${draft.length === 1 ? "contract" : "contracts"} for ${usdc(total)} of your ${usdc(ctx.budget)} USDC${left >= 0 ? `, ${usdc(left)} left unspent` : ""}.${lead} Change anything: swap an agent, edit tasks and files, add or drop a contract. I will say what each edit does.`;
}
