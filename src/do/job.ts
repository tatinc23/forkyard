// Job: one per goal. Owns the mainline repo, the contracts, the merge queue, the event log and the review.
// Long phases run inside alarm() so they survive without an open request; the UI watches over WebSocket.
import { DurableObject } from "cloudflare:workers";
import { desk, hall, type Env } from "../env";
import type { Agent, Chapter, Contract, ContractId, JobEvent, JobEventBody, JobStatus, JobView, ReviewView, Task, TimelineItem } from "../shared/types";
import { HOUSE_IDS } from "../shared/roster";
import { commitFiles, seed, snapshot, type FileMap } from "../git/git";
import { treeAt } from "../git/read";
import { diffTrees, mergeTrees, type ChangeSet, type Conflict } from "../merge/merge";
import { foremanPlan, inspectorReview } from "../agents/prompts";
import { STARTER } from "../template";
import { reputationDelta } from "../reputation";
import { payAgent } from "../payments";
import { applyPlanEdit, describeEdits, INVALID_PLAN, validatePlanEdit, wageOf } from "../plan/edit";
import { cleanNote, MAX_PENDING_NOTES, NEW_CONTROL, nextControl, type ControlAction, type ControlState } from "../plan/control";
import { ScaleRun, type ScaleHost } from "../scale/run";

/** A contract's write token lives exactly as long as the contract. */
const CONTRACT_TTL_S = 45 * 60;
const MAX_MERGE_ATTEMPTS = 3;

type Phase = "plan" | "build" | "pay" | "scale" | "idle";
type Decisions = Record<ContractId, "approve" | "reject">;

type Secrets = {
	main: { remote: string; token: string };
	forks: Record<ContractId, { remote: string; token: string; tokenId?: string }>;
	causedConflict: Record<ContractId, boolean>;
	startedAt: Record<ContractId, number>;
};

/** Per-contract records kept in their own storage keys (file maps can be large). */
type ConflictRecord = { withContractId?: ContractId; paths: string[]; resolved: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const summarize = (cs: ChangeSet) => ({
	files: cs.files.map((f) => ({ path: f.path, kind: f.kind, added: f.kind === "modified" ? f.added : f.kind === "added" ? f.lines : 0, removed: f.kind === "modified" ? f.removed : f.kind === "deleted" ? f.lines : 0 })),
	added: cs.added,
	removed: cs.removed,
});
const hunks = (cs: ChangeSet): Chapter["diff"] =>
	cs.files.map((f) =>
		f.kind === "modified"
			? { path: f.path, kind: f.kind, hunks: f.hunks }
			: { path: f.path, kind: f.kind, hunks: [] },
	);

export class Job extends DurableObject<Env> {
	private state?: JobView;
	private secrets?: Secrets;
	private events?: JobEvent[];
	private batching = false; // scale runs: skip per-event persistence inside a tick (flushed by save())

	// ---------- persistence ----------

	private async load() {
		if (!this.state) {
			this.state = await this.ctx.storage.get<JobView>("job");
			this.secrets = await this.ctx.storage.get<Secrets>("secrets");
			this.events = (await this.ctx.storage.get<JobEvent[]>("events")) ?? [];
		}
		if (!this.state || !this.secrets) throw new Error("job not found");
		return { s: this.state, sec: this.secrets };
	}

	private async save() {
		await this.ctx.storage.put({ job: this.state, secrets: this.secrets, events: this.events });
	}

	private async getRec<T>(key: string): Promise<T | undefined> {
		return this.ctx.storage.get<T>(key);
	}
	private async putRec(key: string, value: unknown) {
		await this.ctx.storage.put(key, value);
	}

	private contract(id: ContractId): Contract {
		const c = this.state!.contracts.find((x) => x.id === id);
		if (!c) throw new Error(`no contract ${id}`);
		return c;
	}

	/** Record + broadcast one event. Also called by Desks over RPC. */
	async emit(e: JobEventBody) {
		if (!this.state) await this.load();
		const ev = { ...e, t: Date.now(), jobId: this.state!.id } as JobEvent;
		this.events!.push(ev);
		if (ev.type !== "typing" && !this.batching) await this.ctx.storage.put("events", this.events);
		const msg = JSON.stringify(ev);
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(msg);
			} catch {}
		}
	}

	private async setStatus(status: JobStatus) {
		this.state!.status = status;
		await this.save();
		await this.emit({ type: "status", status });
		await hall(this.env).setJobStatus(this.state!.id, status);
	}

	private async setContract(id: ContractId, patch: Partial<Contract>) {
		Object.assign(this.contract(id), patch);
		await this.save();
	}

	// ---------- public RPC ----------

	async start(id: string, goal: string, budget: number): Promise<JobView> {
		const repoName = `job-${id}`;
		const created = await this.env.ARTIFACTS.create(repoName, { description: `${STARTER.repo}: ${goal.slice(0, 120)}` });
		const sha = await seed({ remote: created.remote, token: created.token, files: STARTER.files, message: STARTER.message, author: { name: "Ballast Type Co.", email: "studio@ballast.example" } });
		this.state = {
			id,
			goal,
			budget,
			status: "planning",
			repo: { name: repoName, remote: created.remote, headSha: sha },
			contracts: [],
			mainline: [{ sha, message: STARTER.message, at: Date.now() }],
			createdAt: Date.now(),
			totalCost: 0,
		};
		this.secrets = { main: { remote: created.remote, token: created.token }, forks: {}, causedConflict: {}, startedAt: {} };
		this.events = [];
		await this.putRec("files:base", STARTER.files);
		await this.ctx.storage.put("phase", "plan" satisfies Phase);
		await this.save();
		await this.emit({ type: "status", status: "planning" });
		await this.ctx.storage.setAlarm(Date.now() + 50);
		return this.state;
	}

	/** Scale run (POST /api/scale): scripted agents merged as a tree. All logic lives in src/scale/. */
	async startScale(id: string, agents: number, crews: number): Promise<JobView> {
		return new ScaleRun(this.scaleHost()).start(id, agents, crews);
	}

	private scaleHost(): ScaleHost {
		return {
			env: this.env,
			init: async (state, main) => {
				this.state = state;
				this.secrets = { main, forks: {}, causedConflict: {}, startedAt: {} };
				this.events = [];
				await this.save();
			},
			state: () => this.state!,
			main: () => this.secrets!.main,
			events: () => this.events!,
			emit: (e) => this.emit(e),
			batching: (on) => void (this.batching = on),
			save: () => this.save(),
			setStatus: (s) => this.setStatus(s),
			getRec: (k) => this.getRec(k),
			putRec: (k, v) => this.putRec(k, v),
			next: async (ms) => {
				await this.ctx.storage.put("phase", "scale" satisfies Phase);
				await this.ctx.storage.setAlarm(Date.now() + ms);
			},
		};
	}

	async view(): Promise<JobView> {
		return (await this.load()).s;
	}

	async allEvents(): Promise<JobEvent[]> {
		await this.load();
		return this.events!;
	}

	/**
	 * Human gate 1. With `edit` (the body's `contracts`), the human's edited plan replaces the Foreman's before hiring;
	 * a bad edit throws `invalid plan: ...` (the route answers 400) and changes nothing.
	 */
	async approveBudget(edit?: unknown): Promise<JobView> {
		const { s } = await this.load();
		if (s.status !== "awaiting_budget") throw new Error(`cannot approve budget while ${s.status}`);
		if (edit !== undefined && edit !== null) {
			const agents = await this.hireable();
			const v = validatePlanEdit({ contracts: edit }, { agents, budget: s.budget });
			if (!v.ok) throw new Error(INVALID_PLAN + v.error);
			const contracts = applyPlanEdit(s.id, s.contracts, v.contracts, agents);
			const notes = describeEdits(s.contracts, v.contracts, agents, s.budget);
			const byPath = new Map<string, ContractId[]>();
			for (const c of contracts) for (const p of c.paths) byPath.set(p, [...(byPath.get(p) ?? []), c.id]);
			const overlaps = [...byPath].filter(([, ids]) => ids.length > 1).map(([path, ids]) => ({ path, contracts: ids }));
			s.contracts = contracts;
			s.plan = { summary: s.plan?.summary ?? "", overlaps };
			s.totalCost = Math.round(contracts.reduce((n, c) => n + c.wage, 0) * 100) / 100;
			await this.save();
			await this.emit({ type: "plan", plan: s.plan, contracts, budget: s.budget });
			for (const note of notes) await this.emit({ type: "foreman", note });
		}
		await this.ctx.storage.put("phase", "build" satisfies Phase);
		await this.setStatus("hiring");
		await this.ctx.storage.setAlarm(Date.now() + 50);
		return s;
	}

	/** Human gate 2. Rejected chapters are reverted on mainline and not paid. */
	async signoff(decisions: Decisions = {}): Promise<JobView> {
		const { s } = await this.load();
		if (s.status !== "awaiting_signoff") throw new Error(`cannot sign off while ${s.status}`);
		// Approve by default only what the Inspector actually inspected; uninspected chapters need an explicit approve.
		for (const c of s.contracts) {
			if (c.status !== "merged") continue;
			const d = decisions[c.id];
			c.decision = d === "reject" ? "reject" : d === "approve" || (c.review?.score ?? 0) >= 1 ? "approve" : "reject";
		}
		await this.ctx.storage.put("phase", "pay" satisfies Phase);
		await this.setStatus("paying");
		await this.ctx.storage.setAlarm(Date.now() + 50);
		return s;
	}

	// ---------- live agent controls ----------

	private async getControl(id: ContractId): Promise<ControlState> {
		return (await this.getRec<ControlState>(`control:${id}`)) ?? { ...NEW_CONTROL, notes: [] };
	}

	/** Controls only make sense while the crew is building and this contract is still in its work stage. */
	private async controllable(contractId: ContractId): Promise<Contract> {
		const { s } = await this.load();
		const c = this.contract(contractId);
		if (s.status !== "hiring" && s.status !== "working") throw new Error(`Controls only work while the crew is building; this job is ${s.status.replace("_", " ")}.`);
		if (c.status !== "offered" && c.status !== "forking" && c.status !== "working") throw new Error(`This agent has already delivered (${c.status}); review its work instead.`);
		return c;
	}

	/** Human: pause / resume / stop one agent. Takes effect after the agent's current commit (see Desk.gate). */
	async control(contractId: ContractId, action: ControlAction): Promise<{ contractId: ContractId; state: ControlState["state"] }> {
		const c = await this.controllable(contractId);
		const cur = await this.getControl(c.id);
		const next = nextControl(cur, action);
		if (!next.ok) throw new Error(next.error);
		if (next.changed) {
			await this.putRec(`control:${c.id}`, { ...cur, state: next.state });
			await this.emit({ type: "control", contractId: c.id, action });
		}
		return { contractId: c.id, state: next.state };
	}

	/** Human: leave an instruction for the agent's next batch. */
	async addNote(contractId: ContractId, text: unknown): Promise<{ contractId: ContractId; queued: number }> {
		const c = await this.controllable(contractId);
		const note = cleanNote(text);
		if (!note.ok) throw new Error(note.error);
		const cur = await this.getControl(c.id);
		if (cur.state === "stop") throw new Error("This agent was stopped; it won't read new notes.");
		const notes = [...cur.notes, note.text].slice(-MAX_PENDING_NOTES);
		await this.putRec(`control:${c.id}`, { ...cur, notes });
		await this.emit({ type: "note", contractId: c.id, from: "human", text: note.text });
		return { contractId: c.id, queued: notes.length };
	}

	/** Desk RPC, between batches: current control state, taking (clearing) any unread notes. */
	async pollControl(contractId: ContractId): Promise<{ state: ControlState["state"]; notes: string[] }> {
		const cur = await this.getControl(contractId);
		if (cur.notes.length) await this.putRec(`control:${contractId}`, { ...cur, notes: [] });
		return { state: cur.state, notes: cur.notes };
	}

	/** Desk RPC: a pause outlived its cap; flip back to running and tell the feed. */
	async expirePause(contractId: ContractId): Promise<void> {
		const cur = await this.getControl(contractId);
		if (cur.state !== "pause") return;
		await this.putRec(`control:${contractId}`, { ...cur, state: "run" });
		await this.emit({ type: "control", contractId, action: "resume" });
	}

	// ---------- WebSocket ----------

	async fetch(req: Request): Promise<Response> {
		if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
		const { s } = await this.load();
		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		pair[1].send(JSON.stringify({ type: "snapshot", job: s }));
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage() {}
	async webSocketClose(ws: WebSocket, code: number) {
		try {
			ws.close(code, "bye");
		} catch {}
	}

	// ---------- phases ----------

	async alarm() {
		await this.load();
		const phase = ((await this.ctx.storage.get<Phase>("phase")) ?? "idle") as Phase;
		await this.ctx.storage.put("phase", "idle" satisfies Phase); // alarms retry on throw; never re-run a phase
		try {
			if (phase === "plan") await this.runPlan();
			else if (phase === "build") await this.runBuild();
			else if (phase === "pay") await this.runPay();
			else if (phase === "scale") await new ScaleRun(this.scaleHost()).tick();
		} catch (e) {
			console.error("job phase failed", phase, e);
			await this.emit({ type: "error", message: `${phase} failed: ${String(e).slice(0, 300)}` });
			await this.setStatus("failed");
		}
	}

	private async hireable(): Promise<Agent[]> {
		return (await hall(this.env).agents()).filter((a) => !HOUSE_IDS.has(a.id) && a.provider !== "house");
	}

	private async runPlan() {
		const s = this.state!;
		const agents = await this.hireable();
		const files = (await this.getRec<FileMap>("files:base")) ?? STARTER.files;
		const lines = Object.values(files).reduce((n, f) => n + f.split("\n").length, 0);
		const backlog = Object.keys(files).find((p) => /BACKLOG\.md$/.test(p));
		const notes = [
			`Reading the repo: ${Object.keys(files).length} files, ${lines} lines`,
			backlog ? `Triaging ${backlog}` : "Splitting the goal into independent work",
			`Checking the Hall: ${agents.length} specialists available`,
			"Picking one specialist per role",
			"Breaking each role into commit-sized tasks",
			`Pricing the crew against a ${s.budget} USDC budget`,
			"Declaring file leases and checking for overlaps",
			"Writing briefs for each specialist",
		];
		let i = 0;
		await this.emit({ type: "foreman", note: notes[i++] });
		const ticker = setInterval(() => {
			if (i < notes.length) this.emit({ type: "foreman", note: notes[i++] }).catch(() => {});
		}, 4000);
		let plan;
		try {
			plan = await foremanPlan(this.env.AI, { goal: s.goal, budget: s.budget, files, agents });
		} finally {
			clearInterval(ticker);
		}
		let contracts: Contract[] = plan.contracts.map((pc, i) => {
			const a = agents.find((x) => x.id === pc.agentId)!;
			const id = `${s.id}-c${i + 1}`;
			const tasks: Task[] = pc.tasks.map((t, n) => ({ id: `${id}-t${n + 1}`, title: t.title, paths: t.paths, status: "todo" }));
			return { id, agentId: a.id, role: pc.role || a.role, title: pc.title, brief: pc.brief, paths: pc.paths, wage: wageOf(a), status: "offered", attempts: 0, tasks };
		});
		// Stay inside budget: drop the most expensive contracts until it fits.
		while (contracts.length > 1 && contracts.reduce((n, c) => n + c.wage, 0) > s.budget) {
			const priciest = contracts.reduce((m, c) => (c.wage > m.wage ? c : m));
			contracts = contracts.filter((c) => c !== priciest);
		}
		const byPath = new Map<string, ContractId[]>();
		for (const c of contracts) for (const p of c.paths) byPath.set(p, [...(byPath.get(p) ?? []), c.id]);
		const overlaps = [...byPath].filter(([, ids]) => ids.length > 1).map(([path, ids]) => ({ path, contracts: ids }));
		s.contracts = contracts;
		s.plan = { summary: plan.summary, overlaps };
		s.totalCost = Math.round(contracts.reduce((n, c) => n + c.wage, 0) * 100) / 100;
		await this.save();
		await this.emit({ type: "plan", plan: s.plan, contracts, budget: s.budget });
		await this.setStatus("awaiting_budget");
	}

	private async runBuild() {
		const s = this.state!;
		const sec = this.secrets!;
		const agents = await this.hireable();
		const agentOf = (c: Contract) => agents.find((a) => a.id === c.agentId)!;
		const base = await snapshot(sec.main.remote, sec.main.token);
		using mainRepo = await this.env.ARTIFACTS.get(s.repo!.name);

		// 1. Hire: one fork + one contract-scoped token per agent, in parallel.
		const hires = await Promise.allSettled(
			s.contracts.map(async (c, i) => {
				await sleep(i * 350); // stagger: a burst of parallel forks has produced transient Artifacts internal errors
				await this.emit({ type: "hired", contractId: c.id, agentId: c.agentId, wage: c.wage });
				await this.setContract(c.id, { status: "forking" });
				const t0 = Date.now();
				const forkName = `${s.repo!.name}--${c.agentId}`;
				const f = await this.forkWithRetry(mainRepo, forkName, `${c.title} (contract ${c.id})`);
				await this.waitReady(forkName);
				using forkRepo = await this.env.ARTIFACTS.get(forkName);
				const tok = await forkRepo.createToken("write", CONTRACT_TTL_S);
				// The contract token is the only key: revoke the fork's default token.
				try {
					const { tokens } = await forkRepo.listTokens();
					for (const t of tokens) if (t.id !== tok.id && t.state === "active") await forkRepo.revokeToken(t.id);
				} catch (e) {
					console.warn("token revoke skipped", e);
				}
				sec.forks[c.id] = { remote: f.remote, token: tok.plaintext, tokenId: tok.id };
				sec.startedAt[c.id] = Date.now();
				await this.putRec(`files:base:${c.id}`, base.files);
				await this.setContract(c.id, { status: "working", fork: { name: forkName, remote: f.remote }, tokenExpiresAt: tok.expiresAt });
				await this.emit({ type: "forked", contractId: c.id, fork: { name: forkName, remote: f.remote }, ms: Date.now() - t0, tokenExpiresAt: tok.expiresAt });
			}),
		);
		// A hire that still failed doesn't sink the job: that contract is rejected and the crew carries on.
		for (const [i, h] of hires.entries()) {
			if (h.status === "rejected") await this.reject(s.contracts[i], `hire failed: ${String(h.reason).slice(0, 160)}`);
		}
		if (s.contracts.every((c) => c.status === "rejected")) throw new Error("no hire succeeded");
		await this.setStatus("working");

		// 2. Work in parallel. Each delivery is inspected as soon as it lands, then joins the serial merge queue.
		let queue: Promise<void> = Promise.resolve();
		let position = 0;
		const deliver = async (c: Contract, feedback?: string): Promise<void> => {
			const agent = agentOf(c);
			const fork = { remote: sec.forks[c.id].remote, token: sec.forks[c.id].token };
			// A rework is one fix-up task on top of the delivered tasks, not a redo.
			const tasks = feedback
				? [{ id: `${c.id}-fix${c.attempts}`, title: "Address the Inspector's notes", paths: c.paths }]
				: (c.tasks ?? []).map((t) => ({ id: t.id, title: t.title, detail: t.detail, paths: t.paths }));
			let result;
			try {
				if ((await this.getControl(c.id)).state === "stop") return this.rejectStopped(c); // stopped before it even started
				await this.setContract(c.id, { attempts: c.attempts + 1, status: "working" });
				result = await desk(this.env, c.id).work({ jobId: s.id, contract: c, agent, fork, feedback, tasks });
			} catch (e) {
				await this.reject(c, `delivery failed: ${String(e).slice(0, 160)}`);
				return;
			}
			// Stopped by the human (during or after the last batch): not reviewed, not merged, not paid.
			if (result.stopped || (await this.getControl(c.id)).state === "stop") return this.rejectStopped(c);
			const done = new Map(result.tasks.map((t) => [t.id, t]));
			const merged: Task[] = (c.tasks ?? []).map((t) => {
				const r = done.get(t.id);
				return r ? { ...t, status: r.status, sha: r.sha, story: r.story, at: r.at } : t;
			});
			for (const r of result.tasks) if (!merged.find((t) => t.id === r.id)) merged.push({ id: r.id, title: r.title, paths: r.paths, status: r.status, sha: r.sha, story: r.story, at: r.at });
			await this.putRec(`summary:${c.id}`, result.summary);
			const baseFiles = (await this.getRec<FileMap>(`files:base:${c.id}`)) ?? base.files;
			const cs = diffTrees(baseFiles, result.files);
			const changes = summarize(cs);
			await this.setContract(c.id, { status: "reviewing", fork: { ...c.fork!, headSha: result.sha }, changes, tasks: merged });
			await this.emit({ type: "delivered", contractId: c.id, sha: result.sha, changes });
			const review = await this.inspect(c, cs);
			if (review.score >= 1 && review.score <= 2 && c.attempts < 2) {
				await this.emit({ type: "thinking", contractId: c.id, note: `Inspector sent it back: ${review.notes}` });
				return deliver(c, review.notes);
			}
			// Inspection gate: nothing below 3/5 reaches mainline.
			if (review.score >= 1 && review.score <= 2) {
				await this.reject(c, `inspection ${review.score}/5 after rework: ${review.notes}`);
				return;
			}
			await this.setContract(c.id, { status: "queued" });
			await this.emit({ type: "queued", contractId: c.id, position: ++position });
			queue = queue.then(() => this.mergeLoop(c, agent));
			await queue;
		};
		await Promise.all(s.contracts.filter((c) => c.status !== "rejected").map((c) => deliver(c)));
		await queue;
		await this.emit({ type: "review_ready" });
		await this.setStatus("awaiting_signoff");
	}

	private async inspect(c: Contract, cs: ChangeSet) {
		// Fail closed: if the Inspector can't run, the chapter still merges for human review, but it is marked
		// uninspected (score 0) and signoff will NOT approve it by default (see signoff()).
		let review = { score: 0, notes: "Inspector unavailable: needs your explicit approval in review." };
		try {
			review = await inspectorReview(this.env.AI, { title: c.title, brief: c.brief, tasks: (c.tasks ?? []).filter((t) => t.status === "done").map((t) => t.title), changes: cs.files });
		} catch (e) {
			console.warn("inspection failed", e);
		}
		await this.setContract(c.id, { review });
		await this.emit({ type: "review", contractId: c.id, score: review.score, notes: review.notes });
		return review;
	}

	/** Serial merge of one contract into mainline; conflicts go back to the same agent to resolve. */
	private async mergeLoop(c: Contract, agent: Agent) {
		const s = this.state!;
		const sec = this.secrets!;
		for (let attempt = 1; attempt <= MAX_MERGE_ATTEMPTS; attempt++) {
			await this.setContract(c.id, { status: "merging" });
			await this.emit({ type: "merge_start", contractId: c.id });
			const ours = await snapshot(sec.main.remote, sec.main.token);
			const theirs = await snapshot(sec.forks[c.id].remote, sec.forks[c.id].token);
			const baseFiles = (await this.getRec<FileMap>(`files:base:${c.id}`)) ?? ours.files;
			const report = mergeTrees(baseFiles, ours.files, theirs.files);
			if (report.clean) {
				let sha = ours.sha;
				const done = (c.tasks ?? []).filter((t) => t.status === "done").length;
				if (Object.keys(report.changes).length) {
					const conflictRec = await this.getRec<ConflictRecord>(`conflict:${c.id}`);
					const msg = `Merge ${c.title} by ${agent.handle}\n\nContract: ${c.id}\nRole: ${c.role ?? ""}\nAgent: ${agent.handle}\nTasks: ${done}/${c.tasks?.length ?? 0}\nFork-Sha: ${theirs.sha}\nInspection: ${c.review?.score ?? "n/a"}/5\nResolved-Conflicts: ${conflictRec ? "yes" : "no"}`;
					sha = await commitFiles({ remote: sec.main.remote, token: sec.main.token, changes: report.changes, message: msg, author: { name: "Forkyard Merge Queue", email: "queue@gadgethub.dev" } });
				}
				// Keep what the review needs: the exact mainline change this chapter made.
				await this.putRec(`diff:${c.id}`, hunks(diffTrees(ours.files, report.merged)));
				const conflictRec = await this.getRec<ConflictRecord>(`conflict:${c.id}`);
				if (conflictRec) await this.putRec(`conflict:${c.id}`, { ...conflictRec, resolved: true });
				s.repo!.headSha = sha;
				s.mainline.push({ sha, message: `Merge ${c.title} by ${agent.handle}`, contractId: c.id, at: Date.now() });
				await this.setContract(c.id, { status: "merged" });
				await this.emit({ type: "merged", contractId: c.id, sha, outcomes: report.outcomes.filter((o) => o.status !== "unchanged") });
				return;
			}
			// Conflict: find who last merged into the contested files, for the UI.
			sec.causedConflict[c.id] = true;
			const contested = new Set(report.conflicts.map((x) => x.path));
			const withContractId = [...s.mainline].reverse().find((m) => m.contractId && s.contracts.find((k) => k.id === m.contractId)?.paths.some((p) => contested.has(p)))?.contractId;
			await this.putRec(`conflict:${c.id}`, { withContractId, paths: [...contested], resolved: false } satisfies ConflictRecord);
			await this.setContract(c.id, { status: "conflict" });
			await this.emit({ type: "conflict", contractId: c.id, conflicts: report.conflicts, withContractId });
			if (attempt === MAX_MERGE_ATTEMPTS) break;
			await sleep(600);
			await this.setContract(c.id, { status: "resolving" });
			await this.emit({ type: "resolving", contractId: c.id });
			try {
				const input = { jobId: s.id, contract: c, agent, fork: { remote: sec.forks[c.id].remote, token: sec.forks[c.id].token }, conflicts: report.conflicts as Conflict[], mainline: ours.files };
				const result = await desk(this.env, c.id).resolve(input);
				await this.putRec(`files:base:${c.id}`, ours.files); // the resolved delivery is now based on mainline-at-resolve
				const changes = summarize(diffTrees(ours.files, result.files));
				await this.setContract(c.id, { fork: { ...c.fork!, headSha: result.sha }, changes });
				await this.emit({ type: "delivered", contractId: c.id, sha: result.sha, changes });
			} catch (e) {
				await this.reject(c, `resolve failed: ${String(e).slice(0, 160)}`);
				return;
			}
		}
		await this.reject(c, "could not resolve conflicts");
	}

	private async reject(c: Contract, reason: string) {
		await this.setContract(c.id, { status: "rejected" });
		await this.emit({ type: "rejected", contractId: c.id, reason });
	}

	/** The human stopped this agent: reject the contract (never merged or paid) and revoke its write token now. */
	private async rejectStopped(c: Contract) {
		await this.reject(c, "Stopped by you");
		try {
			const tokenId = this.secrets!.forks[c.id]?.tokenId;
			if (c.fork && tokenId) {
				using forkRepo = await this.env.ARTIFACTS.get(c.fork.name);
				await forkRepo.revokeToken(tokenId);
			}
		} catch (e) {
			console.warn("revoke after stop failed", e);
		}
	}

	/**
	 * Undo one chapter on mainline: 3-way merge of (after → before) onto current main. Files that revert cleanly
	 * are reverted; files later chapters also changed (conflicts) are left and reported for a manual revert.
	 */
	private async revert(c: Contract): Promise<{ sha: string | null; conflicted: string[] }> {
		const s = this.state!;
		const sec = this.secrets!;
		const idx = s.mainline.findIndex((m) => m.contractId === c.id);
		if (idx < 1) return { sha: null, conflicted: [] };
		const [before, after] = [s.mainline[idx - 1].sha, s.mainline[idx].sha];
		const [beforeFiles, afterFiles, current] = await Promise.all([treeAt(this.env.ARTIFACTS, s.repo!.name, before), treeAt(this.env.ARTIFACTS, s.repo!.name, after), snapshot(sec.main.remote, sec.main.token)]);
		const report = mergeTrees(afterFiles, current.files, beforeFiles);
		const conflicted = [...new Set(report.conflicts.map((x) => x.path))];
		if (!Object.keys(report.changes).length) return { sha: null, conflicted };
		const note = conflicted.length ? `\nNot reverted (later chapters changed them too): ${conflicted.join(", ")}` : "";
		const sha = await commitFiles({ remote: sec.main.remote, token: sec.main.token, changes: report.changes, message: `Revert ${c.title} (rejected in review)\n\nContract: ${c.id}\nReverts: ${after}${note}`, author: { name: "Forkyard Review", email: "review@gadgethub.dev" } });
		s.repo!.headSha = sha;
		s.mainline.push({ sha, message: `Revert ${c.title} (rejected in review)`, contractId: c.id, at: Date.now() });
		await this.save();
		return { sha, conflicted };
	}

	private async runPay() {
		const s = this.state!;
		const sec = this.secrets!;
		const agents = await hall(this.env).agents();
		for (const c of s.contracts) {
			const agent = agents.find((a) => a.id === c.agentId)!;
			let merged = c.status === "merged";
			if (merged && c.decision === "reject") {
				const { sha, conflicted } = await this.revert(c).catch((e) => {
					console.error("revert failed", e);
					return { sha: null as string | null, conflicted: ["(revert error)"] };
				});
				if (sha) await this.emit({ type: "reverted", contractId: c.id, sha });
				if (!sha || conflicted.length) {
					// Never pretend: whatever couldn't be reverted is still on main. Say exactly what.
					await this.putRec(`revert-failed:${c.id}`, conflicted);
					await this.emit({ type: "error", contractId: c.id, message: `"${c.title}": ${sha ? "partly reverted" : "not reverted"}; still on main and needs a manual revert: ${conflicted.join(", ") || "all files"}.` });
				}
				await this.setContract(c.id, { status: "rejected" });
				await this.emit({ type: "rejected", contractId: c.id, reason: !sha ? "rejected in human review (NOT reverted: manual revert needed)" : conflicted.length ? `rejected in human review (reverted except ${conflicted.join(", ")})` : "rejected in human review (reverted on main)" });
				merged = false;
			}
			let earned = 0;
			if (merged) {
				const payout = await payAgent(this.env, { agentId: agent.id, wallet: agent.wallet, amount: c.wage, contractId: c.id });
				earned = payout.amount;
				await hall(this.env).recordPayout(payout);
				await this.setContract(c.id, { status: "paid", payout });
				await this.emit({ type: "payout", payout });
			}
			// Contract over: revoke its key.
			try {
				if (c.fork) {
					using forkRepo = await this.env.ARTIFACTS.get(c.fork.name);
					if (sec.forks[c.id]?.tokenId) await forkRepo.revokeToken(sec.forks[c.id].tokenId!);
				}
			} catch (e) {
				console.warn("revoke at close failed", e);
			}
			const onTime = Date.now() - (sec.startedAt[c.id] ?? Date.now()) < CONTRACT_TTL_S * 1000;
			const { delta, reason } = reputationDelta({ status: merged ? "merged" : "rejected", attempts: c.attempts, causedConflict: !!sec.causedConflict[c.id], reviewScore: c.review?.score, onTime });
			const why = c.decision === "reject" ? `${reason}, rejected in review` : reason;
			const { before, after } = await hall(this.env).applyOutcome(agent.id, delta, { merged, conflict: !!sec.causedConflict[c.id], review: c.review?.score, earned });
			await this.emit({ type: "reputation", agentId: agent.id, before, after, reason: why });
		}
		await this.setStatus("closed");
		await hall(this.env).saveReplay({ job: s, events: this.events!, agents: await hall(this.env).agents() });
	}

	// ---------- review ----------

	/** Chapters (one per hire) + every commit in order. Works for jobs from before v2 too (rebuilt from history). */
	async review(): Promise<ReviewView> {
		const { s } = await this.load();
		const cached = await this.getRec<ReviewView>("review");
		if (cached && cached.head.sha === s.repo?.headSha && s.status !== "awaiting_signoff") return cached;
		const repo = s.repo!.name;
		const chapters: Chapter[] = [];
		for (const c of s.contracts) {
			const idx = s.mainline.findIndex((m) => m.contractId === c.id && !m.message.startsWith("Revert"));
			if (idx < 1) continue;
			const beforeSha = s.mainline[idx - 1].sha;
			const afterSha = s.mainline[idx].sha;
			let diff = await this.getRec<Chapter["diff"]>(`diff:${c.id}`);
			if (!diff) {
				const [a, b] = await Promise.all([treeAt(this.env.ARTIFACTS, repo, beforeSha), treeAt(this.env.ARTIFACTS, repo, afterSha)]);
				diff = hunks(diffTrees(a, b));
				await this.putRec(`diff:${c.id}`, diff);
			}
			const summary = (await this.getRec<string>(`summary:${c.id}`)) ?? "";
			const doneStories = (c.tasks ?? []).filter((t) => t.status === "done" && t.story).map((t) => t.story!);
			const story = summary || doneStories.slice(0, 3).join(" ") || this.legacyStory(c);
			const conflictRec = await this.getRec<ConflictRecord>(`conflict:${c.id}`);
			const conflictEv = this.events!.find((e) => e.type === "conflict" && e.contractId === c.id) as Extract<JobEvent, { type: "conflict" }> | undefined;
			chapters.push({
				contractId: c.id,
				agentId: c.agentId,
				role: c.role,
				title: c.title,
				story,
				beforeSha,
				afterSha,
				tasks: c.tasks ?? [],
				inspection: c.review,
				changes: c.changes,
				diff,
				conflict: conflictRec ?? (conflictEv ? { withContractId: conflictEv.withContractId, paths: [...new Set(conflictEv.conflicts.map((x) => x.path))], resolved: true } : undefined),
				status: c.status,
				decision: c.decision,
			});
		}
		const timeline: TimelineItem[] = [{ sha: s.mainline[0].sha, at: s.mainline[0].at, kind: "seed", title: s.mainline[0].message, on: "main" }];
		for (const e of this.events!) {
			if (e.type === "task") {
				const c = s.contracts.find((k) => k.id === e.contractId);
				timeline.push({ sha: e.sha, at: e.t, kind: "task", title: e.title, agentId: c?.agentId, contractId: e.contractId, on: c?.agentId ?? "main", story: e.story });
			} else if (e.type === "delivered" && this.events!.some((x) => x.type === "resolving" && x.contractId === e.contractId && x.t < e.t)) {
				const c = s.contracts.find((k) => k.id === e.contractId);
				if (!timeline.some((t) => t.sha === e.sha)) timeline.push({ sha: e.sha, at: e.t, kind: "resolve", title: `Resolve conflict: ${c?.title ?? ""}`, agentId: c?.agentId, contractId: e.contractId, on: c?.agentId ?? "main" });
			} else if (e.type === "merged") {
				const c = s.contracts.find((k) => k.id === e.contractId);
				timeline.push({ sha: e.sha, at: e.t, kind: "merge", title: `Merge ${c?.title ?? ""}`, agentId: c?.agentId, contractId: e.contractId, on: "main" });
			} else if (e.type === "reverted") {
				const c = s.contracts.find((k) => k.id === e.contractId);
				timeline.push({ sha: e.sha, at: e.t, kind: "revert", title: `Revert ${c?.title ?? ""}`, agentId: c?.agentId, contractId: e.contractId, on: "main" });
			}
		}
		const view: ReviewView = { jobId: s.id, goal: s.goal, base: { sha: s.mainline[0].sha }, head: { sha: s.repo!.headSha ?? s.mainline[s.mainline.length - 1].sha }, chapters, timeline };
		await this.putRec("review", view);
		return view;
	}

	private legacyStory(c: Contract): string {
		const files = c.changes?.files.map((f) => f.path).join(", ");
		return `${c.title}. ${c.brief}${files ? ` Touched ${files}.` : ""}`;
	}

	/** fork() with backoff; if an earlier attempt actually created the fork, reuse it. */
	private async forkWithRetry(src: ArtifactsRepo, name: string, description: string): Promise<{ remote: string }> {
		let last: unknown;
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				return await src.fork(name, { description });
			} catch (e) {
				last = e;
				try {
					using existing = await this.env.ARTIFACTS.get(name);
					const info = await existing.info();
					if (info) return { remote: info.remote };
				} catch {}
				console.warn("fork retry", name, attempt, String(e));
				await sleep(800 * (attempt + 1));
			}
		}
		throw last;
	}

	private async waitReady(name: string) {
		for (let i = 0; i < 60; i++) {
			try {
				using r = await this.env.ARTIFACTS.get(name);
				await r.info();
				return;
			} catch (e) {
				if (!/IN_PROGRESS|NOT_FOUND/.test(String((e as { code?: string }).code ?? e))) throw e;
			}
			await sleep(400);
		}
		throw new Error(`fork ${name} never became ready`);
	}
}
