// Hall: the market. Agent roster + reputation, job index, payout ledger, latest recorded run.
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import type { Agent, HallView, JobId, JobStatus, Payout, RecordedRun } from "../shared/types";
import { ROSTER } from "../shared/roster";
import wallets from "../shared/wallets.json";
import { clampRep } from "../reputation";

type JobIndexEntry = HallView["jobs"][number];
/** Only jobs from the Forkyard release onwards are listed publicly (earlier runs used a retired demo repo). */
const LISTED_SINCE = Date.UTC(2026, 9, 15, 0, 0); // 2026-10-14 17:00 PDT

export class Hall extends DurableObject<Env> {
	private async load<T>(key: string, fallback: T): Promise<T> {
		return ((await this.ctx.storage.get<T>(key)) ?? fallback) as T;
	}

	async agents(): Promise<Agent[]> {
		let agents = await this.ctx.storage.get<Agent[]>("agents");
		if (!agents) {
			const w = wallets as Record<string, `0x${string}`>;
			agents = ROSTER.map((a) => ({ ...a, wallet: w[a.id] ?? a.wallet }));
			await this.ctx.storage.put("agents", agents);
		}
		return [...agents].sort((a, b) => b.reputation - a.reputation);
	}

	async view(paymentsMode: "simulate" | "x402"): Promise<HallView> {
		const jobs = await this.load<JobIndexEntry[]>("jobs", []);
		return {
			agents: await this.agents(),
			jobs: jobs.filter((j) => j.createdAt >= LISTED_SINCE).slice(-20).reverse(),
			ledger: (await this.load<Payout[]>("ledger", [])).slice(-50).reverse(),
			paymentsMode,
		};
	}

	/** Cost guard: returns false once the daily cap is reached. */
	async allowJob(cap: number): Promise<boolean> {
		const day = new Date().toISOString().slice(0, 10);
		const key = `jobs-on-${day}`;
		const n = (await this.ctx.storage.get<number>(key)) ?? 0;
		if (n >= cap) return false;
		await this.ctx.storage.put(key, n + 1);
		return true;
	}

	async registerJob(id: JobId, goal: string) {
		const jobs = await this.load<JobIndexEntry[]>("jobs", []);
		jobs.push({ id, goal, status: "planning", createdAt: Date.now() });
		await this.ctx.storage.put("jobs", jobs.slice(-200));
	}

	async setJobStatus(id: JobId, status: JobStatus) {
		const jobs = await this.load<JobIndexEntry[]>("jobs", []);
		const j = jobs.find((x) => x.id === id);
		if (j) {
			j.status = status;
			await this.ctx.storage.put("jobs", jobs);
		}
	}

	/** Apply a reputation delta + stats update; returns before/after for the UI ticker. */
	async applyOutcome(
		agentId: string,
		delta: number,
		s: { merged: boolean; conflict: boolean; review?: number; earned: number },
	): Promise<{ before: number; after: number }> {
		const agents = await this.agents();
		const a = agents.find((x) => x.id === agentId);
		if (!a) return { before: 0, after: 0 };
		const before = a.reputation;
		a.reputation = clampRep(before + delta);
		const st = a.stats;
		if (s.review !== undefined) st.avgReview = Math.round(((st.avgReview * st.contracts + s.review) / (st.contracts + 1)) * 10) / 10;
		st.contracts += 1;
		if (s.merged) st.merged += 1;
		if (s.conflict) st.conflicts += 1;
		st.earned = Math.round((st.earned + s.earned) * 100) / 100;
		// Market pricing: rate follows reputation (500 = 1x).
		const base = ROSTER.find((r) => r.id === agentId);
		if (base && base.rate > 0) a.rate = Math.round(base.rate * (a.reputation / base.reputation) * 100) / 100;
		await this.ctx.storage.put("agents", agents);
		return { before, after: a.reputation };
	}

	async recordPayout(p: Payout) {
		const ledger = await this.load<Payout[]>("ledger", []);
		ledger.push(p);
		await this.ctx.storage.put("ledger", ledger.slice(-500));
	}

	/** Every closed job is kept as a replay; the first one becomes the pinned demo run unless re-pinned. */
	async saveReplay(run: RecordedRun) {
		await this.ctx.storage.put(`replay:${run.job.id}`, run);
		if (!(await this.ctx.storage.get<string>("replay-pin"))) await this.ctx.storage.put("replay-pin", run.job.id);
	}

	async pinReplay(jobId: string): Promise<boolean> {
		if (!(await this.ctx.storage.get(`replay:${jobId}`))) return false;
		await this.ctx.storage.put("replay-pin", jobId);
		return true;
	}

	async getReplay(jobId?: string): Promise<RecordedRun | null> {
		const id = jobId ?? (await this.ctx.storage.get<string>("replay-pin"));
		if (id) return (await this.ctx.storage.get<RecordedRun>(`replay:${id}`)) ?? null;
		return (await this.ctx.storage.get<RecordedRun>("replay")) ?? null; // legacy single slot
	}

	/** Demo reset: restore the seeded roster (keeps ledger + replay). */
	async resetRoster() {
		await this.ctx.storage.delete("agents");
		return this.agents();
	}
}
