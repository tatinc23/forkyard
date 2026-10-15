// Desk: one per Contract. The hired agent's isolated workspace: read its fork, think, push.
import { DurableObject } from "cloudflare:workers";
import { job, type Env } from "../env";
import type { Agent, Contract, JobEventBody } from "../shared/types";
import { commitFiles, commitSequence, snapshot, type FileMap } from "../git/git";
import { applyDelivery, specialistBatch, specialistResolve, type Delivery } from "../agents/prompts";
import type { Conflict } from "../merge/merge";

export type DeskInput = {
	jobId: string;
	contract: Pick<Contract, "id" | "title" | "brief" | "paths">;
	agent: Agent;
	fork: { remote: string; token: string };
	/** Extra instruction, e.g. reviewer notes on a rework. */
	feedback?: string;
};

export type DeskResult = { sha: string; files: FileMap; summary: string };

export type DeskTask = { id: string; title: string; detail?: string; paths: string[] };
export type DeskTaskResult = { id: string; title: string; paths: string[]; status: "done" | "failed"; sha?: string; story?: string; at?: number; error?: string };
export type DeskWorkResult = DeskResult & { tasks: DeskTaskResult[]; /** The human stopped this agent; Job rejects the contract. */ stopped?: boolean };

/**
 * Pause design (A1): the Desk checks the Job's control state before every batch. A paused agent finishes the batch
 * it is on ("after the current commit"), then polls every PAUSE_POLL_MS. Waiting happens inside this RPC, which the
 * Job's alarm awaits, so total pause time per work() call is capped at MAX_PAUSE_MS (alarm wall-time limit); past the
 * cap the Desk auto-resumes and says so on the feed rather than letting the alarm die.
 */
const PAUSE_POLL_MS = 2000;
const MAX_PAUSE_MS = 5 * 60_000;

/** Tasks per model call: small enough for precise edits, few enough calls to keep a job quick. */
const BATCH = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Desk extends DurableObject<Env> {
	private async emit(jobId: string, e: JobEventBody) {
		await job(this.env, jobId).emit(e);
	}

	/** Stream the real code the agent wrote, in small chunks, so the floor can animate it. */
	private async streamTyping(input: DeskInput, d: Delivery) {
		const pieces: { path: string; text: string }[] = [
			...d.edits.map((e) => ({ path: e.path, text: e.replace })),
			...Object.entries(d.newFiles).map(([path, text]) => ({ path, text })),
		];
		for (const p of pieces.slice(0, 4)) {
			const text = p.text.slice(0, 600);
			for (let i = 0; i < text.length; i += 120) {
				await this.emit(input.jobId, { type: "typing", contractId: input.contract.id, path: p.path, chunk: text.slice(i, i + 120) });
				await sleep(140);
			}
		}
	}

	private author(agent: Agent) {
		return { name: agent.name, email: `${agent.id}@agents.gadgethub.dev` };
	}

	/** Push `next` onto the fork as one commit, relative to what the fork has now. */
	private async push(input: DeskInput, current: FileMap, next: FileMap, message: string): Promise<string> {
		const changes: Record<string, string | null> = {};
		for (const p of new Set([...Object.keys(current), ...Object.keys(next)])) {
			if (current[p] !== next[p]) changes[p] = next[p] ?? null;
		}
		if (!Object.keys(changes).length) throw new Error("delivery made no changes");
		return commitFiles({ remote: input.fork.remote, token: input.fork.token, changes, message, author: this.author(input.agent) });
	}

	/**
	 * Between batches: collect the owner's notes (acknowledging each), wait while paused, report whether to stop.
	 * Control-channel hiccups never kill the work: on an RPC error the agent just carries on.
	 */
	private async gate(input: DeskInput, pending: string[], paused: { ms: number }): Promise<"go" | "stop"> {
		const id = input.contract.id;
		let announced = false;
		for (;;) {
			let ctl;
			try {
				ctl = await job(this.env, input.jobId).pollControl(id);
			} catch (e) {
				console.warn("pollControl failed", id, e);
				return "go";
			}
			for (const text of ctl.notes) {
				pending.push(text);
				await this.emit(input.jobId, { type: "note", contractId: id, from: "agent", text: `Got it: "${text.slice(0, 90)}${text.length > 90 ? "..." : ""}". I'll apply it from my next batch.` });
			}
			if (ctl.state === "stop") return "stop";
			if (ctl.state === "run") return "go";
			if (!announced) {
				announced = true;
				await this.emit(input.jobId, { type: "thinking", contractId: id, note: "Paused by you. Holding at this commit until you resume." });
			}
			if (paused.ms >= MAX_PAUSE_MS) {
				await job(this.env, input.jobId).expirePause(id).catch(() => {});
				await this.emit(input.jobId, { type: "thinking", contractId: id, note: `Pause limit (${MAX_PAUSE_MS / 60_000} min) reached; resuming so the job isn't left hanging.` });
				return "go";
			}
			await sleep(PAUSE_POLL_MS);
			paused.ms += PAUSE_POLL_MS;
		}
	}

	/** Work through the contract's tasks in batches; every task that applies cleanly becomes its own commit. */
	async work(input: DeskInput & { tasks: DeskTask[] }): Promise<DeskWorkResult> {
		const c = input.contract;
		await this.emit(input.jobId, { type: "thinking", contractId: c.id, note: `Cloning my fork; ${input.tasks.length} tasks on the contract` });
		const fork = await snapshot(input.fork.remote, input.fork.token);
		let files = fork.files;
		let head = fork.sha;
		const results: DeskTaskResult[] = [];
		const summaries: string[] = [];
		const pendingNotes: string[] = [];
		const paused = { ms: 0 };
		let stopped = false;
		for (let i = 0; i < input.tasks.length; i += BATCH) {
			if ((await this.gate(input, pendingNotes, paused)) === "stop") {
				stopped = true;
				await this.emit(input.jobId, { type: "thinking", contractId: c.id, note: `Stopped by you. Handing back what I have (${results.filter((r) => r.status === "done").length} tasks committed).` });
				break;
			}
			const batch = input.tasks.slice(i, i + BATCH);
			await this.emit(input.jobId, { type: "thinking", contractId: c.id, note: `Working tasks ${i + 1}-${i + batch.length}: ${batch.map((t) => t.title).join("; ").slice(0, 140)}` });
			let delivery;
			try {
				delivery = await specialistBatch(this.env.AI, { agent: input.agent, title: c.title, brief: c.brief, tasks: batch, files, feedback: input.feedback, ownerNotes: pendingNotes });
			} catch (e) {
				// Notes stay queued: they weren't used, so the next batch still gets them.
				for (const t of batch) results.push({ ...t, status: "failed", error: String(e).slice(0, 160) });
				continue;
			}
			pendingNotes.length = 0;
			summaries.push(delivery.summary);
			// Apply task by task; a task whose anchors miss is marked failed and skipped, the rest still land.
			const steps: { changes: Record<string, string | null>; message: string }[] = [];
			const applied: { task: DeskTask; story: string }[] = [];
			for (const t of batch) {
				const d = delivery.tasks.find((x) => x.id === t.id) ?? delivery.tasks[batch.indexOf(t)];
				if (!d) {
					results.push({ ...t, status: "failed", error: "no delivery for task" });
					continue;
				}
				try {
					const next = applyDelivery(files, { summary: d.story, edits: d.edits, newFiles: d.newFiles });
					const changes: Record<string, string | null> = {};
					for (const p of new Set([...Object.keys(files), ...Object.keys(next)])) if (files[p] !== next[p]) changes[p] = next[p] ?? null;
					if (!Object.keys(changes).length) throw new Error("no change");
					steps.push({ changes, message: `${t.title}\n\n${d.story}\n\nContract: ${c.id}\nTask: ${t.id}\nAgent: ${input.agent.handle}` });
					applied.push({ task: t, story: d.story });
					files = next;
					await this.streamTyping(input, { summary: d.story, edits: d.edits.slice(0, 1), newFiles: {} });
				} catch (e) {
					results.push({ ...t, status: "failed", error: String(e).slice(0, 160) });
				}
			}
			if (!steps.length) continue;
			const shas = await commitSequence({ remote: input.fork.remote, token: input.fork.token, steps, author: this.author(input.agent) });
			for (let k = 0; k < applied.length; k++) {
				const sha = shas[k];
				const { task, story } = applied[k];
				if (!sha) {
					results.push({ ...task, status: "failed", error: "no effective change" });
					continue;
				}
				head = sha;
				const at = Date.now();
				results.push({ ...task, status: "done", sha, story, at });
				await this.emit(input.jobId, { type: "task", contractId: c.id, taskId: task.id, title: task.title, sha, story });
			}
		}
		const done = results.filter((r) => r.status === "done").length;
		if (!done && !stopped) throw new Error(`no task landed: ${results.map((r) => r.error).filter(Boolean)[0] ?? "unknown"}`);
		if (!stopped) await this.emit(input.jobId, { type: "thinking", contractId: c.id, note: `${done}/${input.tasks.length} tasks committed and pushed to my fork` });
		const order = new Map(input.tasks.map((t, i) => [t.id, i]));
		results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
		return { sha: head, files, summary: summaries.join(" "), tasks: results, ...(stopped ? { stopped: true } : {}) };
	}

	/** Re-deliver on top of current mainline after a conflict. */
	async resolve(input: DeskInput & { conflicts: Conflict[]; mainline: FileMap }): Promise<DeskResult> {
		const c = input.contract;
		await this.emit(input.jobId, { type: "thinking", contractId: c.id, note: `Rebasing onto mainline, ${input.conflicts.length} conflict(s) to resolve` });
		const fork = await snapshot(input.fork.remote, input.fork.token);
		let lastErr: unknown;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const d = await specialistResolve(this.env.AI, { agent: input.agent, title: c.title, brief: c.brief, conflicts: input.conflicts, files: input.mainline });
				const next = applyDelivery(input.mainline, d);
				await this.streamTyping(input, d);
				const sha = await this.push(input, fork.files, next, `Resolve: ${c.title} on top of mainline\n\n${d.summary}\n\nContract: ${c.id}\nAgent: ${input.agent.handle}`);
				return { sha, files: next, summary: d.summary };
			} catch (e) {
				lastErr = e;
			}
		}
		throw lastErr;
	}
}
