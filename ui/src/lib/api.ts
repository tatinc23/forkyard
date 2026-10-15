import type { HallView, JobEvent, JobId, JobView, RecordedRun, ReviewView } from "../types";
import { getDemoKey } from "./config";
import type { PlanEdit } from "./planEdit";

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 6000): Promise<T> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), timeoutMs);
	try {
		const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
		if (init.method === "POST") {
			// The demo key goes in this header on POSTs only. Reads and the WebSocket are public.
			const key = getDemoKey();
			if (key) headers["x-demo-key"] = key;
			headers["content-type"] = "application/json";
		}
		const res = await fetch(path, { ...init, headers, signal: ctl.signal });
		if (!res.ok) {
			let detail = "";
			try {
				detail = (await res.text()).slice(0, 500);
			} catch {
				/* ignore */
			}
			// the API answers 400 with {"error": "..."}: show the readable sentence, not the JSON
			try {
				const j = JSON.parse(detail) as { error?: unknown };
				if (typeof j.error === "string") detail = j.error;
			} catch {
				/* plain text */
			}
			throw new ApiError(res.status, detail || res.statusText);
		}
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export const fetchHall = () => request<HallView>("/api/hall", {}, 4000);
/** A recorded run. No id = the server's default pinned crew run; an id (a PINS entry) = that run. */
export const fetchReplay = (job?: JobId) => request<RecordedRun>(job ? `/api/demo/replay?job=${encodeURIComponent(jid(job))}` : "/api/demo/replay", {}, job ? 12000 : 6000);
/** Job ids are server-minted 8-char lowercase alnum; refuse anything else so ids can't steer request paths. */
const jid = (id: JobId) => {
	if (!/^[a-z0-9]{8}$/.test(id)) throw new Error(`invalid job id: ${id}`);
	return id;
};
export const fetchEvents = (id: JobId) => request<JobEvent[]>(`/api/jobs/${jid(id)}/events`);
export const fetchJob = (id: JobId) => request<JobView>(`/api/jobs/${jid(id)}`);
export const createJob = (goal: string, budget: number) => request<{ jobId: JobId }>("/api/jobs", { method: "POST", body: JSON.stringify({ goal, budget }) });
/** `plan` = the human's edited plan; no plan keeps today's behaviour (empty body). */
export const approveBudget = (id: JobId, plan?: PlanEdit) => request<JobView>(`/api/jobs/${jid(id)}/approve-budget`, { method: "POST", body: JSON.stringify(plan ?? {}) }, plan ? 15000 : 6000);
export const signoff = (id: JobId, decisions?: Record<string, "approve" | "reject">) => request<JobView>(`/api/jobs/${jid(id)}/signoff`, { method: "POST", body: JSON.stringify(decisions ? { decisions } : {}) });
const cid = (c: string) => {
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(c)) throw new Error(`invalid contract id: ${c}`);
	return encodeURIComponent(c);
};
/** A1: pause / resume / stop one agent on a live job. Takes effect after the agent's current commit. Needs the demo key. */
export const controlContract = (jobId: JobId, contractId: string, action: "pause" | "resume" | "stop") => request<unknown>(`/api/jobs/${jid(jobId)}/contracts/${cid(contractId)}/control`, { method: "POST", body: JSON.stringify({ action }) });
/** A1: send one agent a note (<= 500 chars). It is added to the agent's next batch prompt as a fenced human instruction. Needs the demo key. */
export const noteContract = (jobId: JobId, contractId: string, text: string) => request<unknown>(`/api/jobs/${jid(jobId)}/contracts/${cid(contractId)}/note`, { method: "POST", body: JSON.stringify({ text: text.slice(0, 500) }) });
export const fetchReview = (id: JobId) => request<ReviewView>(`/api/jobs/${jid(id)}/review`, {}, 15000);

export type SocketMessage = { type: "snapshot"; job: JobView } | JobEvent;

/** Opens the job WebSocket with simple reconnect. Returns a close function. */
export function openJobSocket(id: JobId, onMessage: (m: SocketMessage) => void, onState: (open: boolean) => void): () => void {
	let ws: WebSocket | null = null;
	let closed = false;
	let tries = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const connect = () => {
		const proto = location.protocol === "https:" ? "wss:" : "ws:";
		const url = `${proto}//${location.host}/api/jobs/${jid(id)}/ws`;
		ws = new WebSocket(url);
		ws.onopen = () => {
			tries = 0;
			onState(true);
		};
		ws.onmessage = (e) => {
			try {
				onMessage(JSON.parse(String(e.data)) as SocketMessage);
			} catch {
				/* ignore malformed frame */
			}
		};
		ws.onclose = () => {
			onState(false);
			if (closed || tries >= 6) return;
			tries++;
			timer = setTimeout(connect, Math.min(4000, 400 * 2 ** tries));
		};
		ws.onerror = () => ws?.close();
	};
	connect();
	return () => {
		closed = true;
		if (timer) clearTimeout(timer);
		ws?.close();
	};
}
