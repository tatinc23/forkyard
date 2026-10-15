import { AnimatePresence, motion } from "motion/react";
import type { JobState } from "../engine/state";
import type { PlanEdit } from "../lib/planEdit";
import { CONTRACTOR } from "../types";
import { Avatar } from "./Avatar";
import { PlanEditor } from "./PlanEditor";

/** Foreman's plan. Once it exists the human can edit it (PlanEditor); approving sends the edited plan only if something changed. */
export function Plan({ job, busy, error, needsKey, onApprove, onBack }: { job: JobState; busy: boolean; error: string; needsKey: boolean; onApprove: (plan?: PlanEdit) => void; onBack: () => void }) {
	const planned = !!job.plan && job.order.length > 0;
	if (!planned) return <Planning job={job} />;
	return <PlanEditor key={job.jobId} job={job} busy={busy} error={error} needsKey={needsKey} onApprove={onApprove} onBack={onBack} />;
}

function Planning({ job }: { job: JobState }) {
	const notes = job.foremanNotes;
	const latest = notes[notes.length - 1];
	return (
		<main className="wrap plan planning" aria-live="polite">
			<div className="plan-head">
				<div className="foreman-tag">
					<Avatar seed={7} color={CONTRACTOR.color} size={44} label="Foreman" />
					<div>
						<strong>{CONTRACTOR.name}</strong>
						<span className="mono">{CONTRACTOR.handle}</span>
					</div>
				</div>
				<h1>Foreman is planning your job.</h1>
				<p className="goal">“{job.goal}”</p>
				<p className="summary">Splitting the goal into contracts, leasing files so agents do not trample each other, and pricing each wage from the Hall. This takes about half a minute.</p>
			</div>
			<div className="foreman-log">
				<div className="foreman-now">
					<span className="bars-live" aria-hidden="true">
						<i />
						<i />
						<i />
						<i />
					</span>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span key={latest?.key ?? "start"} className="foreman-line" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
							{latest?.text ?? "Reading your goal"}
						</motion.span>
					</AnimatePresence>
				</div>
				<ol className="foreman-done">
					{notes.slice(0, -1).map((n) => (
						<motion.li key={n.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
							<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							{n.text}
						</motion.li>
					))}
				</ol>
			</div>
			<div className="drafting" aria-hidden="true">
				{Array.from({ length: 4 }, (_, i) => (
					<div key={i} className="ghost-card" style={{ ["--d" as string]: `${i * 160}ms` }}>
						<i />
						<i />
						<i />
					</div>
				))}
			</div>
		</main>
	);
}
