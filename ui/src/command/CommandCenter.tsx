import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Agent, ReviewView } from "../types";
import type { JobState } from "../engine/state";
import type { Playback } from "../engine/session";
import { ReviewStage } from "../lib/reviewModule";
import { Avatar } from "../components/Avatar";
import { sha7 } from "../lib/format";
import { agentOf, countersOf, currentTask, exceptionsOf, inspectorOf, lastCommit, stateOf, STATE_LABEL } from "./derive";
import { Glyph } from "./Glyph";
import { Swarm, type HoverInfo } from "./Swarm";
import { FocusGrid } from "./FocusGrid";
import { FocusView } from "./FocusView";
import { NeedsYou, type Jump } from "./NeedsYou";
import { MergeTree } from "./MergeTree";
import { Ledger } from "./Ledger";
import { Rail, VIEWS, type View } from "./Rail";
import "./command.css";

type Props = {
	job: JobState;
	busy: boolean;
	error: string;
	needsKey: boolean;
	review: ReviewView | null;
	playback: Playback;
	onSignoff: (decisions?: Record<string, "approve" | "reject">) => void;
	onReset: () => void;
	onToggle: () => void;
	onSpeed: (s: number) => void;
	onStep: () => void;
};

type Pane = "swarm" | "main" | "needs";

function HoverCard({ job, h }: { job: JobState; h: NonNullable<HoverInfo> }) {
	const l = job.lanes[h.id];
	if (!l) return null;
	const a: Agent = agentOf(job, l);
	const st = stateOf(l);
	const lc = lastCommit(l);
	const v = inspectorOf(l);
	const W = 280;
	const left = h.rect.right + 10 + W > window.innerWidth ? Math.max(8, h.rect.left - W - 10) : h.rect.right + 10;
	const top = Math.max(8, Math.min(h.rect.top - 8, window.innerHeight - 190));
	return (
		<div className="hc" role="tooltip" style={{ left, top, width: W }}>
			<div className="hc-h">
				<Avatar seed={a.glyph} color={a.color} size={30} />
				<div>
					<b>{a.name}</b>
					<span>{l.role ?? a.role ?? "agent"}</span>
				</div>
				<span className="hc-st" data-state={st}>
					<Glyph state={st} size={15} />
					{STATE_LABEL[st]}
				</span>
			</div>
			<dl>
				<dt>Doing</dt>
				<dd>{currentTask(l)}</dd>
				<dt>Last commit</dt>
				<dd>{lc ? <><code className="mono">{lc.sha ? sha7(lc.sha) : "commit"}</code> {lc.title}</> : "None yet"}</dd>
				{v && (
					<>
						<dt>Inspector</dt>
						<dd className="num">{v.score}/5</dd>
					</>
				)}
				{l.conflicts > 0 && (
					<>
						<dt>Conflicts</dt>
						<dd className="num">{l.conflicts} ({l.resolved} resolved)</dd>
					</>
				)}
			</dl>
			<p className="hc-tip">Click to focus</p>
		</div>
	);
}

export function CommandCenter({ job, busy, error, needsKey, review, playback, onSignoff, onReset, onToggle, onSpeed, onStep }: Props) {
	const [view, setView] = useState<View>("crew");
	const [focusId, setFocusId] = useState<string | null>(null);
	const [pinned, setPinned] = useState<Set<string>>(() => new Set());
	const [hover, setHover] = useState<HoverInfo>(null);
	const [crewFilter, setCrewFilter] = useState<string | undefined>();
	const [pane, setPane] = useState<Pane>("main");
	// The nav rail's "Review" item asks for a specific view (App dispatches `forkyard:view`).
	useEffect(() => {
		const on = (e: Event) => {
			const v = (e as CustomEvent).detail;
			if ((VIEWS as readonly { id: string }[]).some((x) => x.id === v)) setView(v as View);
		};
		window.addEventListener("forkyard:view", on);
		return () => window.removeEventListener("forkyard:view", on);
	}, []);
	const picked = useRef(false); // the person chose a tab themselves: stop auto-switching for scale runs
	const root = useRef<HTMLDivElement>(null);

	// Fill exactly the space under whatever sits above (the app header, plus any gap): no page scroll on desktop.
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		const fit = () => {
			let top = 0;
			for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop; // offsetTop ignores the entrance transform
			el.style.setProperty("--cc-top", window.innerWidth >= 900 ? `${top}px` : "0px");
		};
		fit();
		const t = setTimeout(fit, 450);
		window.addEventListener("resize", fit);
		return () => {
			clearTimeout(t);
			window.removeEventListener("resize", fit);
		};
	}, []);

	const counters = useMemo(() => countersOf(job), [job]);
	const excCount = useMemo(() => exceptionsOf(job).length, [job]);
	const awaiting = job.status === "awaiting_signoff";
	const afterReview = job.status === "paying" || job.status === "closed";
	const scale = job.mode === "scale" || job.crewOrder.length > 0;

	// New job: start over.
	useEffect(() => {
		setView("crew");
		setFocusId(null);
		setPinned(new Set());
		setCrewFilter(undefined);
		picked.current = false;
	}, [job.jobId]);

	// The run moves the view along at its own milestones: merging (scale), review (human gate), then the ledger.
	useEffect(() => {
		if (job.status === "merging" && scale && !picked.current) setView("tree");
	}, [job.status, scale]);
	useEffect(() => {
		if (job.status === "awaiting_signoff" && !scale) {
			setView("review");
			setFocusId(null);
		}
		if (job.status === "paying") {
			const t = setTimeout(() => setView("ledger"), 1600);
			return () => clearTimeout(t);
		}
	}, [job.status, scale]);

	// Space pauses and plays, unless the person is typing or on a control that uses Space itself.
	useEffect(() => {
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape" && focusId) return setFocusId(null);
			if (e.code !== "Space" || e.repeat) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.closest("input, textarea, select, button, a, video, [role='radio'], [role='tab'], [role='button']") || t.isContentEditable)) return;
			if (playback.mode === "none") return;
			e.preventDefault();
			onToggle();
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [playback.mode, onToggle, focusId]);

	const pick = useCallback((v: View) => {
		picked.current = true;
		setView(v);
		if (v !== "crew") setFocusId(null);
		setPane("main");
	}, []);
	const focus = useCallback((id: string) => {
		setView("crew");
		setFocusId(id);
		setHover(null);
		setPane("main");
	}, []);
	const togglePin = useCallback((id: string) => {
		setPinned((p) => {
			const n = new Set(p);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	}, []);
	const noop = useCallback(() => undefined, []);
	const openCrew = useCallback((id: string) => {
		setCrewFilter(id);
		setView("swarm");
		setPane("main");
	}, []);
	const jump = useCallback(
		(to: Jump, contractId?: string) => {
			if (to === "agent" && contractId) return focus(contractId);
			if (to === "tree") return pick("tree");
			if (to === "review") return pick("review");
			if (to === "ledger") return pick("ledger");
			pick("crew");
		},
		[focus, pick],
	);

	const focusLane = focusId ? job.lanes[focusId] : undefined;

	return (
		<div className="cmd" ref={root} data-pane={pane} data-scale={scale || undefined}>
			<Rail job={job} counters={counters} view={view} onView={pick} playback={playback} onToggle={onToggle} onSpeed={onSpeed} onStep={onStep} needsReview={awaiting && !scale} />
			<nav className="cc-panes" aria-label="Panels">
				{(
					[
						["swarm", "Swarm"],
						["main", VIEWS.find((v) => v.id === view)?.label ?? "Crew"],
						["needs", excCount ? `Needs you (${excCount})` : "Needs you"],
					] as [Pane, string][]
				).map(([id, label]) => (
					<button key={id} type="button" aria-pressed={pane === id} className={pane === id ? "on" : ""} onClick={() => setPane(id)}>
						{label}
					</button>
				))}
			</nav>
			{job.status === "failed" && (
				<p className="cc-fail form-error" role="alert">
					{job.error ?? "The job failed."} <button className="btn ghost" onClick={onReset}>Back to the repo</button>
				</p>
			)}
			<div className="cc-body" data-view={view}>
				<section className="cc-swarm" aria-label="Swarm: every agent">
					<h2 className="cc-h">
						Swarm <span className="num">{job.order.length}</span>
						<span className="cc-legend" aria-hidden="true">
							{(["working", "committed", "conflict", "merged"] as const).map((s) => (
								<span key={s} data-state={s} title={STATE_LABEL[s]}>
									<Glyph state={s} size={12} />
								</span>
							))}
						</span>
					</h2>
					<div className="cc-scroll">
						<Swarm job={job} selected={focusId ?? undefined} pinned={pinned} variant="column" onFocus={focus} onHover={setHover} onCrew={openCrew} />
					</div>
					<ul className="cc-key" aria-label="Glyph key">
						{(["idle", "working", "committed", "conflict", "merged", "rejected", "paused"] as const).map((s) => (
							<li key={s} data-state={s}>
								<Glyph state={s} size={12} />
								{STATE_LABEL[s]}
							</li>
						))}
					</ul>
				</section>

				<main className="cc-main" id="cc-panel" role="tabpanel" aria-labelledby={`cc-tab-${view}`} data-view={view}>
					{view === "crew" &&
						(focusLane ? (
							<FocusView job={job} lane={focusLane} pinned={pinned.has(focusLane.id)} onBack={() => setFocusId(null)} onPin={() => togglePin(focusLane.id)} />
						) : (
							<FocusGrid job={job} pinned={pinned} crewFilter={crewFilter} onFocus={focus} onPin={togglePin} onHover={noop} />
						))}
					{view === "swarm" && (
						<div className="cc-swarmview">
							<div className="fg-head">
								<h2>Swarm</h2>
								<p>
									Every agent, grouped by crew. Shape and motion carry the state; colour only repeats it.
									{crewFilter && (
										<>
											{" "}
											<button type="button" className="linklike" onClick={() => setCrewFilter(undefined)}>
												Show all crews
											</button>
										</>
									)}
								</p>
							</div>
							<div className="cc-scroll">
								<Swarm job={job} selected={focusId ?? undefined} pinned={pinned} variant="board" crewFilter={crewFilter} onFocus={focus} onHover={setHover} onCrew={openCrew} />
							</div>
						</div>
					)}
					{view === "tree" && <MergeTree job={job} selected={focusId ?? undefined} onFocus={focus} onHover={setHover} />}
					{view === "review" && (
						<div className="cc-review">
							{scale ? (
								<div className="cc-note">
									<h2>No review on a scale run</h2>
									<p>Scripted agents write one slot each. There is no visual change to approve, so the Inspector, the review and payouts are skipped: this run proves the fork and merge-tree layer. Review by exception applies to AI crews.</p>
								</div>
							) : !awaiting && !afterReview ? (
								<div className="cc-note">
									<h2>Review opens when the last agent merges</h2>
									<p>
										{counters.merged} of {counters.total} merged so far. The Inspector scores each delivery first; you only open what it flags, as a live before and after of the real site.
									</p>
								</div>
							) : ReviewStage ? (
								<>
									{afterReview && <p className="cc-hint">Signed off. This is the record of the review: what each hire changed, and what was approved.</p>}
									<ReviewStage jobId={job.jobId} review={review} agents={Object.values(job.agents)} source={job.source} busy={busy} onSignoff={(d) => (afterReview ? undefined : onSignoff(d))} />
									{error && <p className="form-error cc-hint" role="alert">{error}</p>}
									{needsKey && <p className="cc-hint">The demo key was rejected. Add it in Post a job, then sign off again.</p>}
								</>
							) : (
								<div className="cc-note">
									<h2>Everything is merged</h2>
									<p>Approve to pay each agent for what actually merged.</p>
									<button className="btn orange" disabled={busy || afterReview} onClick={() => onSignoff()}>
										{afterReview ? "Signed off" : busy ? "Signing off" : "Approve merge & pay"}
									</button>
									{error && <p className="form-error" role="alert">{error}</p>}
								</div>
							)}
						</div>
					)}
					{view === "ledger" && (
						<div className="cc-ledger">
							<Ledger job={job} onFocus={focus} />
							{job.status === "closed" && (
								<div className="cc-after">
									{!scale && (
										<a className="btn orange" href={job.resultHref ?? `/preview/${job.jobId}/`} target="_blank" rel="noreferrer">
											Open the result
										</a>
									)}
									<button className="btn ghost" onClick={onReset}>
										Post another job
									</button>
									{job.source === "mock" && !scale && <span className="cc-hint">This page is the demo job's output, rebuilt locally from the scripted deliveries.</span>}
								</div>
							)}
						</div>
					)}
				</main>

				<NeedsYou job={job} onJump={jump} />
			</div>
			{hover && <HoverCard job={job} h={hover} />}
		</div>
	);
}
