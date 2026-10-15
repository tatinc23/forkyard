import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, HallView, JobEvent, RecordedRun, ReviewView } from "../types";
import { ApiError, approveBudget, createJob, fetchEvents, fetchHall, fetchJob, fetchReplay, fetchReview, openJobSocket, signoff } from "../lib/api";
import { normalizeAgents } from "../lib/agents";
import { mockReview } from "../lib/reviewModule";
import type { PlanEdit } from "../lib/planEdit";
import { FLAGS, PINS } from "../lib/config";
import { buildMockRun, MOCK_MAIN0, mockHall } from "../mock/script";
import { buildScaleRun } from "../mock/scale";
import { mockPreviewHtml } from "../mock/preview";
import { Pacer } from "./pacer";
import { Player } from "./player";
import { emptyState, fromSnapshot, reduce, type JobState, type Source, type UIEvent } from "./state";

/** Which pinned recording to play: the AI crew run or the 100-agent scale run. */
export type ReplayKind = "crew" | "scale";

export type Session = {
	source: Source | "boot";
	fellBack: boolean;
	hall: HallView | null;
	job: JobState | null;
	connected: boolean;
	busy: "" | "start" | "budget" | "signoff" | "replay";
	error: string;
	needsKey: boolean;
	start: (goal: string, budget: number) => void;
	watchReplay: (which?: ReplayKind) => void;
	approveBudget: (plan?: PlanEdit) => void;
	signoff: (decisions?: Record<string, "approve" | "reject">) => void;
	reset: () => void;
	review: ReviewView | null;
	playback: Playback;
	togglePause: () => void;
	setSpeed: (s: number) => void;
	step: () => void;
};

/** What the Floor's transport controls show. `mode` says who drives pacing: a scripted player (mock/replay) or the live event buffer. */
export type Playback = { mode: "none" | "scripted" | "live"; paused: boolean; speed: number; gated: boolean; done: boolean; pending: number };
const NO_PLAYBACK: Playback = { mode: "none", paused: false, speed: 1, gated: false, done: false, pending: 0 };

export function useSession(): Session {
	const [source, setSource] = useState<Source | "boot">("boot");
	const [fellBack, setFellBack] = useState(false);
	const [hall, setHall] = useState<HallView | null>(null);
	const [job, setJob] = useState<JobState | null>(null);
	const [connected, setConnected] = useState(true);
	const [busy, setBusy] = useState<Session["busy"]>("");
	const [error, setError] = useState("");
	const [needsKey, setNeedsKey] = useState(false);
	const [review, setReview] = useState<ReviewView | null>(null);
	const [playback, setPlayback] = useState<Playback>(NO_PLAYBACK);
	const speedRef = useRef(1);
	const pausedRef = useRef(false);

	const pacer = useRef<Pacer | null>(null);
	const player = useRef<Player | null>(null);
	const closeSocket = useRef<(() => void) | null>(null);
	const poll = useRef<ReturnType<typeof setInterval> | null>(null);
	const replayRun = useRef<RecordedRun | null>(null);
	const agentsRef = useRef<Agent[]>([]);
	const jobIdRef = useRef("");
	const blobUrl = useRef("");

	const syncPlayback = useCallback(() => {
		const pl = player.current;
		const pc = pacer.current;
		if (!pc) return setPlayback(NO_PLAYBACK);
		const st = pl?.state;
		setPlayback({ mode: pl ? "scripted" : "live", paused: pl ? st!.paused : pausedRef.current, speed: pl ? st!.speed : speedRef.current, gated: !!st?.gated, done: !!st?.done && pc.pending === 0, pending: pc.pending });
	}, []);

	const teardown = useCallback(() => {
		pausedRef.current = false;
		speedRef.current = 1;
		setReview(null);
		setPlayback(NO_PLAYBACK);
		pacer.current?.clear();
		player.current?.stop();
		closeSocket.current?.();
		if (poll.current) clearInterval(poll.current);
		pacer.current = player.current = null;
		closeSocket.current = null;
		poll.current = null;
	}, []);

	const apply = useCallback((ev: UIEvent) => setJob((s) => (s ? reduce(s, ev) : s)), []);

	// Keep the queue counter in the transport controls fresh while events are buffered.
	useEffect(() => {
		if (!job) return;
		const t = setInterval(syncPlayback, 500);
		return () => clearInterval(t);
	}, [!!job, syncPlayback]); // eslint-disable-line react-hooks/exhaustive-deps

	// The visual review: fetched once the server says it is ready (live), or built locally for replay and mock runs.
	const reviewKey = job ? `${job.jobId}:${job.reviewReady}` : "";
	useEffect(() => {
		if (!job || !job.reviewReady) return;
		// Live jobs and recorded replays both have a real review on the server; only the scripted mock is local.
		if (job.source === "live" || job.source === "replay") {
			let dead = false;
			const load = (n: number) =>
				fetchReview(job.jobId)
					.then((r) => !dead && setReview(r))
					.catch(() => {
						if (!dead && n < 3) setTimeout(() => load(n + 1), 1500 * (n + 1));
						else if (!dead && job.source === "replay" && mockReview) setReview(mockReview());
					});
			load(0);
			return () => {
				dead = true;
			};
		}
		// TODO(review-integration): mockReview() comes from ui/src/review (other agent). Until it exists the Floor shows the v1 Signoff panel.
		if (mockReview) setReview(mockReview());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reviewKey]);

	// Boot: real Hall, or the mock/replay fallbacks.
	useEffect(() => {
		let dead = false;
		const useMock = (fell: boolean) => {
			const h = mockHall();
			h.agents = normalizeAgents(h.agents);
			agentsRef.current = h.agents;
			setHall(h);
			setSource("mock");
			setFellBack(fell);
		};
		if (FLAGS.scale) {
			// Dev entry: ?scale=1 plays the mock 100-agent run straight away.
			useMock(false);
			const run = buildScaleRun();
			runScripted("mock", run, run.job.goal, run.job.budget);
		} else if (FLAGS.mock) {
			useMock(false);
		} else if (FLAGS.replay) {
			fetchReplay()
				.then((run) => {
					if (dead) return;
					replayRun.current = run;
					agentsRef.current = normalizeAgents(run.agents);
					setHall({ agents: agentsRef.current, jobs: [], ledger: [], paymentsMode: "simulate" });
					setSource("replay");
				})
				.catch(() => !dead && useMock(true));
		} else {
			fetchHall()
				.then((h0) => {
					let h = h0;
					if (dead) return;
					h = { ...h, agents: normalizeAgents(h.agents) };
					agentsRef.current = h.agents;
					setHall(h);
					setSource("live");
					if (FLAGS.job) attachExisting(FLAGS.job, () => dead);
				})
				.catch(() => !dead && useMock(true));
		}
		return () => {
			dead = true;
			teardown();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function attach(jobId: string, goal: string, budget: number, initial?: JobState) {
		jobIdRef.current = jobId;
		setJob(initial ?? emptyState({ source: "live", jobId, goal, budget, agents: agentsRef.current }));
		const p = new Pacer(apply);
		pacer.current = p;
		syncPlayback();
		closeSocket.current = openJobSocket(
			jobId,
			(m) => {
				if (m.type === "snapshot") setJob((prev) => fromSnapshot(m.job, agentsRef.current, "live", prev ?? undefined));
				else p.push(m as JobEvent);
			},
			(open) => {
				setConnected(open);
				if (!open && !poll.current) {
					poll.current = setInterval(() => {
						fetchJob(jobId)
							.then((j) => setJob((prev) => fromSnapshot(j, agentsRef.current, "live", prev ?? undefined)))
							.catch(() => undefined);
					}, 2000);
				}
				if (open && poll.current) {
					clearInterval(poll.current);
					poll.current = null;
				}
			},
		);
	}

	// ?job=<id>: rebuild the Floor from the event history, then follow live updates over the WebSocket.
	async function attachExisting(jobId: string, isDead: () => boolean) {
		const [ev, snap] = await Promise.allSettled([fetchEvents(jobId), fetchJob(jobId)]);
		if (isDead()) return;
		const view = snap.status === "fulfilled" ? snap.value : null;
		let st = emptyState({ source: "live", jobId, goal: view?.goal ?? "", budget: view?.budget ?? 0, agents: agentsRef.current, mainline: view ? [] : undefined });
		if (ev.status === "fulfilled" && Array.isArray(ev.value)) st = ev.value.reduce<JobState>((acc, e) => reduce(acc, e), st);
		if (view) st = fromSnapshot(view, agentsRef.current, "live", st);
		attach(jobId, st.goal, st.budget, st);
	}

	const runScripted = useCallback(
		(kind: "mock" | "replay", run: RecordedRun, goal: string, budget: number) => {
			teardown();
			const first = run.job.mainline.filter((m) => !m.contractId).slice(0, 1);
			const main = first.length ? first : [MOCK_MAIN0()];
			// A recording stores post-run reputations; rewind each agent to where it started so the tickers move.
			const agents = normalizeAgents(run.agents).map((a) => {
				const r = run.events.find((e) => e.type === "reputation" && e.agentId === a.id);
				return r && r.type === "reputation" ? { ...a, reputation: r.before } : a;
			});
			const scale = run.job.mode === "scale" || run.events.some((e) => e.type === "crew");
			let st = emptyState({ source: kind, jobId: run.job.id, goal: kind === "replay" ? run.job.goal : goal, budget: kind === "replay" ? run.job.budget : budget, agents, mainline: main, mode: scale ? "scale" : run.job.mode });
			if (kind === "mock" && !scale) {
				if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
				blobUrl.current = URL.createObjectURL(new Blob([mockPreviewHtml()], { type: "text/html" }));
				st = { ...st, resultHref: blobUrl.current };
			}
			setJob(st);
			const p = new Pacer(apply);
			if (scale) p.holdScale = 0.25;
			pacer.current = p;
			const pl = new Player(run.events, (e) => p.push(e), { maxGap: 5000, onChange: syncPlayback });
			player.current = pl;
			pl.start();
			syncPlayback();
		},
		[teardown, apply, syncPlayback],
	);

	const watchReplay = useCallback(
		(kindArg?: ReplayKind) => {
			// Used directly as an onClick, the argument can be an event: only the literal "scale" selects the scale run.
			const kind = kindArg === "scale" ? "scale" : "crew";
			setError("");
			setBusy("replay");
			if (kind === "scale") {
				// STOPGAP(2026-10-14): until a real scale run is pinned (PINS.scale), play the deterministic mock and label it
				// "mock" (Header chip + command-center source chip). Real design: the pinned 100-fork Artifacts run.
				const mock = () => {
					const run = buildScaleRun();
					runScripted("mock", run, run.job.goal, run.job.budget);
				};
				if (!PINS.scale) {
					mock();
					setBusy("");
					return;
				}
				fetchReplay(PINS.scale)
					.then((run) => runScripted("replay", run, run.job.goal, run.job.budget))
					.catch(() => {
						setFellBack(true);
						mock();
					})
					.finally(() => setBusy(""));
				return;
			}
			const prefer = replayRun.current?.job.id === PINS.crew ? Promise.resolve(replayRun.current) : fetchReplay(PINS.crew);
			prefer
				.then((run) => runScripted("replay", run, run.job.goal, run.job.budget))
				.catch(() => {
					setFellBack(true);
					const run = buildMockRun();
					runScripted("mock", run, run.job.goal, run.job.budget);
				})
				.finally(() => setBusy(""));
		},
		[runScripted],
	);

	const start = useCallback(
		(goal: string, budget: number) => {
			setError("");
			setNeedsKey(false);
			teardown();
			if (source === "mock") {
				const run = buildMockRun(goal, budget);
				runScripted("mock", run, goal, budget);
				return;
			}
			if (source === "replay" && replayRun.current) {
				runScripted("replay", replayRun.current, goal, budget);
				return;
			}
			setBusy("start");
			createJob(goal, budget)
				.then(({ jobId }) => {
					attach(jobId, goal, budget);
					history.replaceState(null, "", `${location.pathname}?job=${jobId}`);
				})
				.catch((e: unknown) => {
					if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
						setNeedsKey(true);
						setError("The demo key was missing or rejected. Enter it below and post the job again.");
					} else setError(`Could not post the job: ${e instanceof Error ? e.message : String(e)}`);
				})
				.finally(() => setBusy(""));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[source, teardown, apply, runScripted],
	);

	const gate = useCallback(
		(kind: "budget" | "signoff", decisions?: Record<string, "approve" | "reject">, plan?: PlanEdit) => {
			setError("");
			if (player.current) {
				pacer.current?.resume();
				pausedRef.current = false;
				player.current.resume();
				return;
			}
			setBusy(kind);
			(kind === "budget" ? approveBudget(jobIdRef.current, plan) : signoff(jobIdRef.current, decisions))
				.catch((e: unknown) => {
					if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setNeedsKey(true);
					setError(`${kind === "budget" ? "Approving the budget" : "Signing off"} failed: ${e instanceof Error ? e.message : String(e)}`);
				})
				.finally(() => setBusy(""));
		},
		[],
	);

	const reset = useCallback(() => {
		teardown();
		setJob(null);
		setError("");
		setBusy("");
		if (source === "live") {
			history.replaceState(null, "", location.pathname);
			fetchHall()
				.then(setHall)
				.catch(() => undefined);
		}
	}, [source, teardown]);

	return {
		source,
		fellBack,
		hall,
		job,
		connected,
		busy,
		error,
		needsKey,
		start,
		watchReplay,
		approveBudget: (plan) => gate("budget", undefined, plan),
		signoff: (d) => gate("signoff", d),
		reset,
		review,
		playback,
		togglePause: () => {
			const pl = player.current;
			const pc = pacer.current;
			if (!pc) return;
			const pausing = pl ? !pl.state.paused : !pausedRef.current;
			if (pausing) {
				pausedRef.current = true;
				pc.pause();
				pl?.pause();
			} else {
				pausedRef.current = false;
				pc.resume();
				pl?.play();
			}
			syncPlayback();
		},
		setSpeed: (sp: number) => {
			speedRef.current = sp;
			pacer.current?.setSpeed(sp);
			player.current?.setSpeed(sp);
			syncPlayback();
		},
		step: () => {
			const pl = player.current;
			const pc = pacer.current;
			if (!pc) return;
			pausedRef.current = true;
			if (pl && pc.pending === 0) pl.stepNext();
			else pl?.pause();
			pc.step();
			syncPlayback();
		},
	};
}
