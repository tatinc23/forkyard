import type { Agent, Contract, JobView } from "../../types";
import { humanCommits } from "../../data/repo";

export type ContractRow = { job: JobView; c: Contract };
export type CommitRow = { sha: string; message: string; at: number; kind: "human" | "agent" | "seed"; agentId?: string; contractId?: string; jobId?: string; real: boolean; trailers: string[] };

export const shortId = (id: string) => id.replace(/^.*-c/, "c").replace(/^job_?/, "");
export const isOpen = (c: Contract) => !["merged", "paid", "rejected"].includes(c.status);

export function contractRows(jobs: JobView[]): ContractRow[] {
	return jobs.flatMap((job) => job.contracts.map((c) => ({ job, c }))).sort((a, b) => b.job.createdAt - a.job.createdAt);
}

/** Mainline commits of every job, newest first, plus the human commits the repo started from. */
export function commitRows(jobs: JobView[], liveJobId: string): CommitRow[] {
	const out: CommitRow[] = [];
	for (const job of jobs) {
		for (const m of job.mainline) {
			const c = job.contracts.find((x) => x.id === m.contractId);
			if (!m.contractId) {
				if (job.id === liveJobId) out.push({ sha: m.sha, message: m.message, at: m.at, kind: "seed", jobId: job.id, real: true, trailers: ["Signed-off-by: Ballast Type Co."] });
				continue;
			}
			const trailers = [`Contract: ${m.contractId}`, ...(c?.tasks?.length ? [`Task: ${c.tasks.length} commits on the fork`] : []), ...(c?.review ? [`Reviewed-by: Inspector ${c.review.score}/5`] : []), ...(c ? [`Co-authored-by: @${c.agentId}`] : [])];
			out.push({ sha: m.sha, message: m.message, at: m.at, kind: "agent", agentId: c?.agentId, contractId: m.contractId, jobId: job.id, real: job.id === liveJobId, trailers });
		}
	}
	for (const h of humanCommits()) out.push({ sha: h.sha, message: h.message, at: h.at, kind: "human", real: false, trailers: h.trailers ?? [] });
	return out.sort((a, b) => b.at - a.at);
}

export type CrewMember = { agent: Agent; contracts: number; merged: number; added: number; removed: number; lastAt: number; wage: number };

export function crewOf(jobs: JobView[], agents: Agent[]): CrewMember[] {
	const by = new Map<string, CrewMember>();
	for (const job of jobs)
		for (const c of job.contracts) {
			const agent = agents.find((a) => a.id === c.agentId);
			if (!agent) continue;
			const m = by.get(agent.id) ?? { agent, contracts: 0, merged: 0, added: 0, removed: 0, lastAt: 0, wage: 0 };
			m.contracts++;
			if (c.status === "merged" || c.status === "paid") {
				m.merged++;
				m.wage += c.wage;
			}
			m.added += c.changes?.added ?? 0;
			m.removed += c.changes?.removed ?? 0;
			m.lastAt = Math.max(m.lastAt, job.createdAt);
			by.set(agent.id, m);
		}
	return [...by.values()].sort((a, b) => b.agent.reputation - a.agent.reputation);
}
