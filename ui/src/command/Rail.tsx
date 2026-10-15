import type { JobState } from "../engine/state";
import type { Playback } from "../engine/session";
import { PlayControls } from "../components/PlayControls";
import { Ticker } from "../components/Ticker";
import { usdc } from "../lib/format";
import type { Counters } from "./derive";

export type View = "crew" | "swarm" | "tree" | "review" | "ledger";

export const VIEWS: { id: View; label: string }[] = [
	{ id: "crew", label: "Crew" },
	{ id: "swarm", label: "Swarm" },
	{ id: "tree", label: "Merge tree" },
	{ id: "review", label: "Review" },
	{ id: "ledger", label: "Ledger" },
];

export const STAGES: { id: string; label: string; view: View }[] = [
	{ id: "plan", label: "Plan", view: "crew" },
	{ id: "hire", label: "Hire", view: "swarm" },
	{ id: "build", label: "Build", view: "crew" },
	{ id: "merge", label: "Merge", view: "tree" },
	{ id: "review", label: "Review", view: "review" },
	{ id: "pay", label: "Pay", view: "ledger" },
];

export function stageIndex(job: JobState): number {
	switch (job.status) {
		case "planning":
		case "awaiting_budget":
			return 0;
		case "hiring":
			return 1;
		case "working":
			return 2;
		case "merging":
			return 3;
		case "awaiting_signoff":
			return 4;
		case "paying":
			return 5;
		case "closed":
			return 6;
		default:
			return job.order.some((id) => job.lanes[id]?.delivered) ? 3 : 2;
	}
}

type Props = { job: JobState; counters: Counters; view: View; onView: (v: View) => void; playback: Playback; onToggle: () => void; onSpeed: (s: number) => void; onStep: () => void; needsReview: boolean };

const SRC: Record<string, string> = { live: "Live", replay: "Replay of a recorded run", mock: "Mock data" };

export function Rail({ job, counters: c, view, onView, playback, onToggle, onSpeed, onStep, needsReview }: Props) {
	const idx = stageIndex(job);
	const n = job.narration;
	return (
		<header className="cmdrail">
			<div className="cmdrail-a">
				<div className="cmdrail-goal">
					<span className={`src src-${job.source}`} title={job.source === "mock" ? "Scripted demo data: no API calls, nothing recorded." : job.source === "replay" ? "A recorded real run, replayed with its original timing." : "A live job on the deployed Worker."}>
						<i aria-hidden="true" />
						{SRC[job.source]}
					</span>
					<span className="clip" title={job.goal}>
						{job.goal}
					</span>
				</div>
				<ol className="stg" aria-label="Job stages">
					{STAGES.map((s, i) => (
						<li key={s.id} data-state={i < idx ? "done" : i === idx ? "now" : "next"}>
							<button type="button" onClick={() => onView(s.view)} aria-current={i === idx ? "step" : undefined} title={`Go to ${s.view === "tree" ? "the merge tree" : s.view}`}>
								<span className="stg-dot" aria-hidden="true">
									{i < idx ? (
										<svg width="9" height="9" viewBox="0 0 10 10">
											<path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									) : (
										i + 1
									)}
								</span>
								{s.label}
							</button>
						</li>
					))}
				</ol>
				<dl className="cnt" aria-label="Live counters">
					<div title="Agents writing code right now">
						<dt>Working</dt>
						<dd>
							<Ticker value={c.working} ms={300} />
						</dd>
					</div>
					<div title="Commits across every fork">
						<dt>Commits</dt>
						<dd>
							<Ticker value={c.commits} ms={400} />
						</dd>
					</div>
					<div data-hot={c.openConflicts > 0 || undefined} title={`${c.conflicts} conflicts so far, ${c.openConflicts} open`}>
						<dt>Conflicts</dt>
						<dd>
							<Ticker value={c.conflicts} ms={300} />
							{c.openConflicts > 0 && <small className="num">{c.openConflicts} open</small>}
						</dd>
					</div>
					<div title="Agents whose work is merged">
						<dt>Merged</dt>
						<dd>
							<Ticker value={c.merged} ms={300} />
							<small className="num">/{c.total}</small>
						</dd>
					</div>
					{(c.budget > 0 || c.spent > 0) && (
						<div title="Wages paid, or committed if nothing is paid yet">
							<dt>Spent</dt>
							<dd>
								<span className="num">{usdc(c.spent)}</span>
								{c.budget > 0 && <small className="num">/{usdc(c.budget)}</small>}
							</dd>
						</div>
					)}
				</dl>
				<PlayControls pb={playback} onToggle={onToggle} onSpeed={onSpeed} onStep={onStep} />
			</div>
			<div className="cmdrail-b">
				<div className="tabs" role="tablist" aria-label="Command center views">
					{VIEWS.map((v) => (
						<button key={v.id} type="button" role="tab" id={`cc-tab-${v.id}`} aria-selected={view === v.id} aria-controls="cc-panel" tabIndex={view === v.id ? 0 : -1} className={view === v.id ? "on" : ""} onClick={() => onView(v.id)} onKeyDown={(e) => {
							const i = VIEWS.findIndex((x) => x.id === view);
							const to = e.key === "ArrowRight" ? VIEWS[(i + 1) % VIEWS.length] : e.key === "ArrowLeft" ? VIEWS[(i + VIEWS.length - 1) % VIEWS.length] : null;
							if (to) {
								e.preventDefault();
								onView(to.id);
								requestAnimationFrame(() => document.getElementById(`cc-tab-${to.id}`)?.focus());
							}
						}}>
							{v.label}
							{v.id === "review" && needsReview && <span className="tab-dot" aria-label="needs you" />}
						</button>
					))}
				</div>
				<p className="cmdrail-nar" role="status" aria-live="polite" data-tone={n?.tone ?? "info"}>
					{n?.text ?? "The crew is getting set up."}
				</p>
			</div>
		</header>
	);
}
