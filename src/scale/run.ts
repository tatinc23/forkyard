// The Forkyard scale run: N scripted agents (no model), one real Artifacts fork + one real commit each, merged as a
// tree (agents -> crew lines -> main) instead of a queue. Phases are chunked across alarm() ticks so no single
// invocation does much CPU: tick 1 forks the crew lines, then one "round" per tick (one agent per crew is hired,
// commits, and merges into its crew line; crews run in parallel), then the crew lines land on main one by one.
//
// Scripted agents only ever touch src/mosaic.js, so merges run on that single file; every other file is identical
// on every line. Merge tree conflicts are real: every 10th agent also rewrites the shared `var ROLL = [];` line.
import { hall, type Env } from "../env";
import type { Agent, Contract, JobEvent, JobEventBody, JobStatus, JobView } from "../shared/types";
import { commitFiles, commitSequence, seed, snapshot, type FileMap } from "../git/git";
import { diffTrees, mergeTrees, type ChangeSet, type Conflict } from "../merge/merge";
import { STARTER } from "../template";
import {
	MOSAIC_PATH,
	agentName,
	applyAgentEdit,
	buildMosaic,
	crewName,
	glyphFor,
	groupCrews,
	hueFor,
	isRollAgent,
	parseRoll,
	redeliverCrew,
	roundsOf,
	scriptedAgent,
} from "./plan";

/** A contract's write token lives exactly as long as the contract (same rule as crew jobs). */
const CONTRACT_TTL_S = 45 * 60;
const STAGGER_MS = 350; // a burst of parallel forks has produced transient Artifacts internal errors
const TICK_MS = 8000; // start another round in this tick only while under this much wall time
const PACE_MS = 250; // a beat between "conflict" and "resolving" so the UI can show it

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MERGE_AUTHOR = { name: "Forkyard Merge Tree", email: "tree@forkyard.dev" };
const authorOf = (n: number) => ({ name: agentName(n), email: `${agentName(n)}@agents.forkyard.dev` });
const pad3 = (n: number) => String(n).padStart(3, "0");

type Cred = { remote: string; token: string; tokenId?: string };
type CrewState = Cred & {
	id: string; // "crew-01"
	name: string;
	members: number[];
	/** Current src/mosaic.js on the crew line (we are its only writer, so this is the line's truth between ticks). */
	mosaic: string;
	headSha?: string;
	landed: number; // members merged into the line
	conflicts: number;
	onMain: boolean;
};
type ScaleState = {
	agents: number;
	rounds: number[][];
	round: number;
	stage: "crews" | "rounds" | "main" | "done";
	baseMosaic: string;
	crews: CrewState[];
	forks: Record<number, Cred>;
	mainCursor: number;
	counts: { forks: number; commits: number; conflicts: number; resolved: number };
	startedAt: number;
};

/** What the Job Durable Object lends the runner (kept narrow so job.ts stays almost untouched). */
export interface ScaleHost {
	env: Env;
	/** Install fresh job state + main credentials (start only). */
	init(state: JobView, main: { remote: string; token: string }): Promise<void>;
	state(): JobView;
	main(): { remote: string; token: string };
	events(): JobEvent[];
	emit(e: JobEventBody): Promise<void>;
	/** While on, emit() broadcasts but does not rewrite the stored event log (flushed by save()). */
	batching(on: boolean): void;
	save(): Promise<void>;
	setStatus(s: JobStatus): Promise<void>;
	getRec<T>(key: string): Promise<T | undefined>;
	putRec(key: string, value: unknown): Promise<void>;
	/** Run another scale tick soon. */
	next(ms: number): Promise<void>;
}

const baseFiles = (): FileMap => ({ ...STARTER.files, [MOSAIC_PATH]: STARTER.files[MOSAIC_PATH] ?? buildMosaic(100) });

function summarize(before: string, after: string) {
	const cs: ChangeSet = diffTrees({ [MOSAIC_PATH]: before }, { [MOSAIC_PATH]: after });
	return {
		files: cs.files.map((f) => ({ path: f.path, kind: f.kind, added: f.kind === "modified" ? f.added : f.kind === "added" ? f.lines : 0, removed: f.kind === "modified" ? f.removed : f.kind === "deleted" ? f.lines : 0 })),
		added: cs.added,
		removed: cs.removed,
	};
}

export class ScaleRun {
	private st!: ScaleState;
	constructor(private host: ScaleHost) {}

	private get job() {
		return this.host.state();
	}
	private contractOf = (n: number): Contract => this.job.contracts.find((c) => c.id === `${this.job.id}-c${n}`)!;

	// ---------- start ----------

	/** Create + seed the mainline, declare every contract and crew, then hand over to the alarm ticks. */
	async start(id: string, agents: number, crewCount: number): Promise<JobView> {
		const env = this.host.env;
		const repoName = `job-${id}`;
		const files = baseFiles();
		// The deterministic edits must fit this seed's mosaic (format is fixed by the spec).
		applyAgentEdit(files[MOSAIC_PATH], agents);
		const created = await env.ARTIFACTS.create(repoName, { description: `Forkyard scale run: ${agents} scripted agents` });
		const sha = await seed({ remote: created.remote, token: created.token, files, message: STARTER.message, author: { name: "Forkyard", email: "seed@forkyard.dev" } });
		const groups = groupCrews(agents, crewCount);
		const crewOf = new Map<number, string>();
		groups.forEach((g, i) => g.forEach((n) => crewOf.set(n, crewName(i + 1))));
		const contracts: Contract[] = Array.from({ length: agents }, (_, i) => {
			const n = i + 1;
			const cid = `${id}-c${n}`;
			const title = `Fill slot ${pad3(n)}`;
			return {
				id: cid,
				agentId: agentName(n),
				title,
				brief: `Replace line T[${n}] of ${MOSAIC_PATH} with one glyph.${isRollAgent(n) ? " Also add your name to the shared ROLL line." : ""}`,
				paths: [MOSAIC_PATH],
				wage: 0,
				status: "offered",
				attempts: 0,
				role: "scripted",
				crewId: crewOf.get(n),
				tasks: [{ id: `${cid}-t1`, title, paths: [MOSAIC_PATH], status: "todo" }],
			};
		});
		const state: JobView = {
			id,
			goal: `Forkyard scale run: ${agents} scripted agents in ${groups.length} crews, merged as a tree`,
			budget: 0,
			status: "hiring",
			repo: { name: repoName, remote: created.remote, headSha: sha },
			plan: { summary: `Scripted agents, git layer only. Each agent forks main, fills its own slot in ${MOSAIC_PATH}, and lands in a crew line; crew lines then land on main. Every 10th agent also writes the shared ROLL line, which makes real conflicts.`, overlaps: [] },
			contracts,
			mainline: [{ sha, message: STARTER.message, at: Date.now() }],
			createdAt: Date.now(),
			totalCost: 0,
			mode: "scale",
		};
		await this.host.init(state, { remote: created.remote, token: created.token });
		this.st = {
			agents,
			rounds: roundsOf(groups),
			round: 0,
			stage: "crews",
			baseMosaic: files[MOSAIC_PATH],
			crews: groups.map((members, i) => ({ id: crewName(i + 1), name: crewName(i + 1), members, remote: "", token: "", mosaic: files[MOSAIC_PATH], landed: 0, conflicts: 0, onMain: false })),
			forks: {},
			mainCursor: 0,
			counts: { forks: 0, commits: 0, conflicts: 0, resolved: 0 },
			startedAt: Date.now(),
		};
		await this.host.putRec("scale", this.st);
		await this.host.emit({ type: "status", status: "hiring" });
		await this.host.emit({ type: "plan", plan: state.plan!, contracts, budget: 0 });
		await this.host.next(50);
		return state;
	}

	// ---------- one alarm tick ----------

	async tick() {
		const st = (await this.host.getRec<ScaleState>("scale"))!;
		this.st = st;
		const t0 = Date.now();
		this.host.batching(true);
		try {
			if (st.stage === "crews") {
				await this.forkCrews();
				st.stage = "rounds";
				await this.host.setStatus("working");
				await this.host.putRec("scale", st);
			}
			while (st.stage === "rounds" && (st.round === 0 || Date.now() - t0 < TICK_MS)) {
				await this.round(st.rounds[st.round]);
				st.round++;
				if (st.round >= st.rounds.length) {
					st.stage = "main";
					await this.host.setStatus("merging");
				}
				await this.host.putRec("scale", st);
			}
			while (st.stage === "main" && Date.now() - t0 < TICK_MS) {
				await this.landCrew(st.crews[st.mainCursor]);
				st.mainCursor++;
				if (st.mainCursor >= st.crews.length) st.stage = "done";
				await this.host.putRec("scale", st);
			}
			if (st.stage === "done") await this.finish();
		} finally {
			this.host.batching(false);
			await this.host.save();
		}
		if (st.stage !== "done") await this.host.next(50);
	}

	// ---------- Artifacts helpers ----------

	/** fork() with backoff; if an earlier attempt actually created the fork, reuse it. */
	private async forkWithRetry(src: ArtifactsRepo, name: string, description: string): Promise<{ remote: string }> {
		let last: unknown;
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				return await src.fork(name, { description });
			} catch (e) {
				last = e;
				try {
					using existing = await this.host.env.ARTIFACTS.get(name);
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
				using r = await this.host.env.ARTIFACTS.get(name);
				await r.info();
				return;
			} catch (e) {
				if (!/IN_PROGRESS|NOT_FOUND/.test(String((e as { code?: string }).code ?? e))) throw e;
			}
			await sleep(400);
		}
		throw new Error(`fork ${name} never became ready`);
	}

	/** The contract token is the only key: mint it and revoke the fork's default tokens. */
	private async mintToken(name: string): Promise<{ id: string; plaintext: string; expiresAt: string }> {
		using repo = await this.host.env.ARTIFACTS.get(name);
		const tok = await repo.createToken("write", CONTRACT_TTL_S);
		try {
			const { tokens } = await repo.listTokens();
			for (const t of tokens) if (t.id !== tok.id && t.state === "active") await repo.revokeToken(t.id);
		} catch (e) {
			console.warn("token revoke skipped", e);
		}
		return tok;
	}

	private async withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
		let last: unknown;
		for (let i = 0; i < tries; i++) {
			try {
				return await fn();
			} catch (e) {
				last = e;
				console.warn("retry", label, i, String(e));
				await sleep(600 * (i + 1));
			}
		}
		throw last;
	}

	// ---------- stage 1: crew lines ----------

	private async forkCrews() {
		const st = this.st;
		const repoName = this.job.repo!.name;
		using mainRepo = await this.host.env.ARTIFACTS.get(repoName);
		const res = await Promise.allSettled(
			st.crews.map(async (crew, i) => {
				await sleep(i * STAGGER_MS);
				const forkName = `${repoName}--${crew.name}`;
				const f = await this.forkWithRetry(mainRepo, forkName, `Forkyard crew line ${crew.name}`);
				await this.waitReady(forkName);
				const tok = await this.mintToken(forkName);
				crew.remote = f.remote;
				crew.token = tok.plaintext;
				crew.tokenId = tok.id;
				st.counts.forks++;
				await this.host.emit({ type: "crew", crewId: crew.id, name: crew.name, contractIds: crew.members.map((n) => `${this.job.id}-c${n}`) });
			}),
		);
		const bad = res.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
		if (bad) throw new Error(`crew line fork failed: ${String(bad.reason).slice(0, 200)}`);
	}

	// ---------- stage 2: a round = one agent per crew, hired, committed, merged into its crew line ----------

	private async round(members: number[]) {
		const st = this.st;
		const delivered = new Set<number>();
		const res = await Promise.allSettled(members.map((n, i) => this.hireAndDeliver(n, i)));
		for (const [i, r] of res.entries()) {
			if (r.status === "fulfilled") delivered.add(members[i]);
			else await this.rejectContract(members[i], String(r.reason).slice(0, 160));
		}
		await Promise.all(
			st.crews.map(async (crew) => {
				const ns = members.filter((n) => crew.members.includes(n) && delivered.has(n));
				if (ns.length) await this.landInCrew(crew, ns);
			}),
		);
	}

	private async rejectContract(n: number, reason: string) {
		const c = this.contractOf(n);
		c.status = "rejected";
		await this.host.emit({ type: "rejected", contractId: c.id, reason: `hire failed: ${reason}` });
	}

	private async hireAndDeliver(n: number, idx: number) {
		const st = this.st;
		const job = this.job;
		const c = this.contractOf(n);
		await sleep(idx * STAGGER_MS);
		await this.host.emit({ type: "hired", contractId: c.id, agentId: c.agentId, wage: 0 });
		c.status = "forking";
		const t0 = Date.now();
		const forkName = `${job.repo!.name}--${agentName(n)}`;
		using mainRepo = await this.host.env.ARTIFACTS.get(job.repo!.name);
		const f = await this.forkWithRetry(mainRepo, forkName, `${c.title} (contract ${c.id})`);
		await this.waitReady(forkName);
		const tok = await this.mintToken(forkName);
		st.forks[n] = { remote: f.remote, token: tok.plaintext, tokenId: tok.id };
		st.counts.forks++;
		c.fork = { name: forkName, remote: f.remote };
		c.tokenExpiresAt = tok.expiresAt;
		c.status = "working";
		c.attempts = 1;
		await this.host.emit({ type: "forked", contractId: c.id, fork: { name: forkName, remote: f.remote }, ms: Date.now() - t0, tokenExpiresAt: tok.expiresAt });

		// The agent's one commit: its own slot (and, for every 10th agent, the shared ROLL line).
		const next = applyAgentEdit(st.baseMosaic, n);
		const story = `Slot ${pad3(n)} is now "${glyphFor(n)}" at hue ${hueFor(n)}${isRollAgent(n) ? "; added to the roll call" : ""}.`;
		const sha = await this.withRetry(`commit ${forkName}`, () =>
			commitFiles({ remote: f.remote, token: tok.plaintext, changes: { [MOSAIC_PATH]: next }, message: `${c.title}\n\n${story}\n\nContract: ${c.id}\nAgent: @${agentName(n)}`, author: authorOf(n) }),
		);
		st.counts.commits++;
		const at = Date.now();
		c.tasks = [{ ...c.tasks![0], status: "done", sha, story, at }];
		const changes = summarize(st.baseMosaic, next);
		c.changes = changes;
		c.fork = { ...c.fork, headSha: sha };
		c.status = "queued";
		await this.host.emit({ type: "task", contractId: c.id, taskId: c.tasks[0].id, title: c.title, sha, story });
		await this.host.emit({ type: "delivered", contractId: c.id, sha, changes });
	}

	/** Merge these members, in order, into the crew line; one clone + one push for the whole batch. */
	private async landInCrew(crew: CrewState, ns: number[]) {
		const st = this.st;
		const base: FileMap = { [MOSAIC_PATH]: st.baseMosaic };
		let line: FileMap = { [MOSAIC_PATH]: crew.mosaic };
		const steps: { changes: Record<string, string | null>; message: string }[] = [];
		const landed: { n: number; outcomes: { path: string; status: string }[] }[] = [];
		for (const n of ns) {
			const c = this.contractOf(n);
			c.status = "merging";
			let theirs: FileMap = { [MOSAIC_PATH]: applyAgentEdit(st.baseMosaic, n) }; // exactly what the agent committed
			let report = mergeTrees(base, line, theirs);
			if (!report.clean) {
				st.counts.conflicts++;
				crew.conflicts++;
				const last = parseRoll(line[MOSAIC_PATH]).at(-1);
				await this.host.emit({ type: "conflict", contractId: c.id, conflicts: report.conflicts as Conflict[], withContractId: last ? `${this.job.id}-c${Number(last.slice(5))}` : undefined, into: crew.id });
				c.status = "conflict";
				await sleep(PACE_MS);
				c.status = "resolving";
				await this.host.emit({ type: "resolving", contractId: c.id });
				// Deterministic re-delivery: re-apply the same edit on top of the crew line, committed on the agent's own fork.
				const redo = applyAgentEdit(line[MOSAIC_PATH], n);
				const f = st.forks[n];
				const sha = await this.withRetry(`resolve ${agentName(n)}`, () =>
					commitFiles({ remote: f.remote, token: f.token, changes: { [MOSAIC_PATH]: redo }, message: `Resolve: ${c.title} on top of ${crew.name}\n\nContract: ${c.id}\nAgent: @${agentName(n)}`, author: authorOf(n) }),
				);
				st.counts.commits++;
				c.fork = { ...c.fork!, headSha: sha };
				const changes = summarize(line[MOSAIC_PATH], redo);
				c.changes = changes;
				await this.host.emit({ type: "delivered", contractId: c.id, sha, changes });
				theirs = { [MOSAIC_PATH]: redo };
				report = mergeTrees(line, line, theirs); // now based on the crew line: clean
				if (!report.clean) throw new Error(`re-delivery of ${agentName(n)} still conflicts`);
				st.counts.resolved++;
			}
			steps.push({ changes: report.changes, message: `Merge ${agentName(n)} into ${crew.name}\n\nContract: ${c.id}\nAgent: @${agentName(n)}\nFork-Sha: ${c.fork!.headSha}` });
			line = report.merged;
			landed.push({ n, outcomes: report.outcomes.filter((o) => o.status !== "unchanged") });
		}
		const shas = await this.withRetry(`crew push ${crew.name}`, () => commitSequence({ remote: crew.remote, token: crew.token, steps, author: MERGE_AUTHOR }), 2);
		crew.mosaic = line[MOSAIC_PATH];
		crew.landed += ns.length;
		for (const [k, m] of landed.entries()) {
			const sha = shas[k] ?? crew.headSha ?? "";
			if (shas[k]) {
				crew.headSha = shas[k]!;
				st.counts.commits++;
			}
			this.contractOf(m.n).status = "merged";
			await this.host.emit({ type: "merged", contractId: this.contractOf(m.n).id, sha, outcomes: m.outcomes, into: crew.id });
		}
	}

	// ---------- stage 3: crew lines land on main ----------

	private async landCrew(crew: CrewState) {
		const st = this.st;
		const job = this.job;
		const main = this.host.main();
		if (!crew.landed) {
			crew.onMain = true; // every hire in this crew failed: nothing to land
			return;
		}
		const ours = await snapshot(main.remote, main.token);
		const theirs = await snapshot(crew.remote, crew.token);
		// Only src/mosaic.js ever differs, so every other file's base is simply what main has.
		const base: FileMap = { ...ours.files, [MOSAIC_PATH]: st.baseMosaic };
		let report = mergeTrees(base, ours.files, theirs.files);
		if (!report.clean) {
			// The crew's roll-call agent caused it: re-deliver on top of main, committed on the crew line.
			const have = parseRoll(ours.files[MOSAIC_PATH]);
			const mine = parseRoll(theirs.files[MOSAIC_PATH]).filter((name) => !have.includes(name));
			const n = Number((mine.at(-1) ?? agentName(crew.members[crew.members.length - 1])).slice(5));
			const c = this.contractOf(n);
			st.counts.conflicts++;
			crew.conflicts++;
			const prev = have.at(-1);
			await this.host.emit({ type: "conflict", contractId: c.id, conflicts: report.conflicts as Conflict[], withContractId: prev ? `${job.id}-c${Number(prev.slice(5))}` : undefined });
			c.status = "conflict";
			await sleep(PACE_MS);
			c.status = "resolving";
			await this.host.emit({ type: "resolving", contractId: c.id });
			const desired = redeliverCrew(report.merged[MOSAIC_PATH], ours.files[MOSAIC_PATH], theirs.files[MOSAIC_PATH]);
			const sha = await this.withRetry(`resolve ${crew.name}`, () =>
				commitFiles({ remote: crew.remote, token: crew.token, changes: { [MOSAIC_PATH]: desired }, message: `Resolve: @${agentName(n)} re-delivers ${crew.name} on top of main\n\nContract: ${c.id}\nAgent: @${agentName(n)}`, author: authorOf(n) }),
			);
			st.counts.commits++;
			crew.headSha = sha;
			const changes = summarize(ours.files[MOSAIC_PATH], desired);
			await this.host.emit({ type: "delivered", contractId: c.id, sha, changes });
			report = mergeTrees(ours.files, ours.files, { ...theirs.files, [MOSAIC_PATH]: desired });
			if (!report.clean) throw new Error(`re-delivery for ${crew.name} still conflicts`);
			st.counts.resolved++;
			c.status = "merged";
		}
		let sha = ours.sha;
		if (Object.keys(report.changes).length) {
			const message = `Merge ${crew.name} (${crew.landed} agents)\n\nCrew-Sha: ${crew.headSha ?? theirs.sha}\nAgents: ${crew.members.map(agentName).join(", ")}`;
			const changes = report.changes;
			sha = await this.withRetry(`merge ${crew.name}`, () => commitFiles({ remote: main.remote, token: main.token, changes, message, author: MERGE_AUTHOR }), 2);
			st.counts.commits++;
		}
		job.repo!.headSha = sha;
		job.mainline.push({ sha, message: `Merge ${crew.name} (${crew.landed} agents)`, at: Date.now() });
		crew.onMain = true;
		await this.host.emit({ type: "crew_merged", crewId: crew.id, sha, conflicts: crew.conflicts });
	}

	// ---------- end ----------

	private async finish() {
		const st = this.st;
		const job = this.job;
		const env = this.host.env;
		const merged = job.contracts.filter((c) => c.status === "merged").length;
		await this.host.emit({ type: "scale_done", agents: merged, forks: st.counts.forks, commits: st.counts.commits, conflicts: st.counts.conflicts, resolved: st.counts.resolved, ms: Date.now() - st.startedAt });
		// Revoke every key: each agent's contract token, each crew line's, and the mainline's.
		const revoke = async (name: string, tokenOrId?: string) => {
			if (!tokenOrId) return;
			try {
				using repo = await env.ARTIFACTS.get(name);
				await repo.revokeToken(tokenOrId);
			} catch (e) {
				console.warn("revoke at close failed", name, e);
			}
		};
		const repoName = job.repo!.name;
		await Promise.allSettled([
			revoke(repoName, this.host.main().token),
			...st.crews.map((c) => revoke(`${repoName}--${c.name}`, c.tokenId)),
			...Object.entries(st.forks).map(([n, f]) => revoke(`${repoName}--${agentName(Number(n))}`, f.tokenId)),
		]);
		await this.host.setStatus("closed");
		const roster = await hall(env).agents();
		const yard: Agent[] = Array.from({ length: st.agents }, (_, i) => scriptedAgent(i + 1));
		await hall(env).saveReplay({ job, events: this.host.events(), agents: [...roster, ...yard] });
	}
}
