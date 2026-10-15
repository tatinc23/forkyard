import { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JobState } from "../engine/state";
import { exceptionsOf, foremanOf, type Suggestion } from "./derive";

export type Jump = "agent" | "tree" | "review" | "ledger" | "crew";

type FeedItem = { s: Suggestion; n: number; live: boolean };

/** The Foreman's suggestions are derived from state each render; this keeps the ones that already fired so it reads as a feed, greyed once resolved. */
function useForemanFeed(job: JobState): FeedItem[] {
	const seen = useRef(new Map<string, { s: Suggestion; n: number }>());
	const jobId = useRef(job.jobId);
	if (jobId.current !== job.jobId) {
		seen.current.clear();
		jobId.current = job.jobId;
	}
	return useMemo(() => {
		const now = foremanOf(job);
		const ids = new Set(now.map((x) => x.id));
		for (const s of now) if (!seen.current.has(s.id)) seen.current.set(s.id, { s, n: seen.current.size });
		return [...seen.current.values()]
			.map((x) => ({ ...x, s: ids.has(x.s.id) ? now.find((y) => y.id === x.s.id)! : x.s, live: ids.has(x.s.id) }))
			.sort((a, b) => b.n - a.n)
			.slice(0, 40);
	}, [job]);
}

export function NeedsYou({ job, onJump }: { job: JobState; onJump: (to: Jump, contractId?: string) => void }) {
	const exc = useMemo(() => exceptionsOf(job), [job]);
	const feed = useForemanFeed(job);
	const ticker = job.feed.slice(-7).reverse();
	const resolvedTotal = Object.values(job.lanes).reduce((s, l) => s + l.resolved, 0);

	return (
		<aside className="ny" aria-label="Needs you">
			<section className="ny-sec ny-exc" aria-labelledby="ny-t">
				<h2 id="ny-t">
					Needs you
					<span className={`ny-n num ${exc.length ? "has" : ""}`} aria-label={`${exc.length} items`}>
						{exc.length}
					</span>
				</h2>
				<div className="ny-list">
					{exc.length === 0 && (
						<p className="ny-calm">
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
								<path d="M5 8.2 7 10l4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							<span>Nothing needs a human right now.{resolvedTotal > 0 ? ` ${resolvedTotal} conflict${resolvedTotal > 1 ? "s were" : " was"} fixed by the agents that caused ${resolvedTotal > 1 ? "them" : "it"}.` : ""}</span>
						</p>
					)}
					<AnimatePresence initial={false}>
						{exc.slice(0, 40).map((x) => (
							<motion.div key={x.id} layout="position" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.28 }} className="ny-item" data-tone={x.tone}>
								<div className="ny-it">
									<b>{x.title}</b>
									<span>{x.detail}</span>
								</div>
								<button type="button" className="ny-go" onClick={() => onJump(x.action.to === "agent" ? "agent" : x.action.to, x.contractId)}>
									{x.action.label}
								</button>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</section>

			<section className="ny-sec ny-fm" aria-labelledby="fm-t">
				<h2 id="fm-t">
					Foreman <span className="ny-sub">suggests</span>
				</h2>
				<div className="ny-list">
					{feed.length === 0 && <p className="ny-dim">The Foreman is watching the crew. Suggestions show up as the run develops.</p>}
					<AnimatePresence initial={false}>
						{feed.map(({ s, live }) => (
							<motion.div key={s.id} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: live ? 1 : 0.55, y: 0 }} transition={{ duration: 0.28 }} className="fm-item" data-tone={s.tone} data-live={live}>
								<p>{s.text}</p>
								{s.action && live && (
									<button type="button" className="ny-go" onClick={() => onJump(s.action!.to, s.action!.contractId)}>
										{s.action.label}
									</button>
								)}
								{!live && <span className="fm-done">resolved</span>}
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</section>

			<section className="ny-sec ny-tick" aria-label="Recent events">
				<ol>
					{ticker.map((f, i) => (
						<li key={f.key} data-tone={f.tone} style={{ opacity: 1 - i * 0.11 }}>
							{f.text}
						</li>
					))}
					{ticker.length === 0 && <li className="ny-dim">No events yet.</li>}
				</ol>
			</section>
		</aside>
	);
}
