import { AnimatePresence, motion } from "motion/react";
import type { JobState } from "../engine/state";

const LABEL: Record<string, string> = { planning: "Planning", awaiting_budget: "Budget review", hiring: "Hiring", working: "Working", merging: "Merging", awaiting_signoff: "Awaiting sign-off", paying: "Paying", closed: "Closed", failed: "Failed" };

/** The single line that says what is happening right now. Everything else on the Floor supports it. */
export function Narrator({ job }: { job: JobState }) {
	const n = job.narration;
	return (
		<div className="narrator" role="status" aria-live="polite">
			<div className="wrap narrator-in">
				<span className="chip dark">{LABEL[job.status] ?? job.status}</span>
				<div className="nar-text">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.p key={n?.key ?? "x"} data-tone={n?.tone ?? "info"} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}>
							{n?.text ?? "The crew is getting set up."}
						</motion.p>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
