import { memo, useEffect, useRef, useState } from "react";
import type { JobState, Lane } from "../engine/state";
import { Avatar } from "../components/Avatar";
import { agentOf, currentTask, inspectorOf, interestOrder, lastCommit, stateOf, STATE_LABEL, type AState } from "./derive";
import { Glyph } from "./Glyph";

const CARD_W = 232;
const CARD_H = 136;
const GAP = 10;

const MiniCard = memo(function MiniCard({ job, lane, pinned, onFocus, onPin, onHover }: { job: JobState; lane: Lane; pinned: boolean; onFocus: (id: string) => void; onPin: (id: string) => void; onHover: (id: string | null) => void }) {
	const a = agentOf(job, lane);
	const st: AState = stateOf(lane);
	const done = lane.tasks.filter((t) => t.done).length;
	const total = lane.tasks.length;
	const v = inspectorOf(lane);
	const lc = lastCommit(lane);
	return (
		<article className="mc" data-state={st} data-pin={pinned || undefined} onMouseEnter={() => onHover(lane.id)} onMouseLeave={() => onHover(null)}>
			<header className="mc-h">
				<Avatar seed={a.glyph} color={a.color} size={30} />
				<div className="mc-who">
					<button type="button" className="mc-open" onClick={() => onFocus(lane.id)}>
						{a.name}
					</button>
					<span className="mc-role clip">{lane.role ?? a.role ?? a.specialty}</span>
				</div>
				<span className="mc-st" data-state={st}>
					<Glyph state={st} size={16} />
					{STATE_LABEL[st]}
				</span>
				<button type="button" className="mc-pin" aria-pressed={pinned} aria-label={pinned ? `Unpin ${a.name}` : `Pin ${a.name} to the grid`} title={pinned ? "Unpin" : "Pin to the grid"} onClick={() => onPin(lane.id)}>
					<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M8.6 1.6 12.4 5.4 10.6 6l-1.7 2.9.3 2.1-1 .9-2.4-2.4L2.4 12.4 1.6 11.6l2.9-2.4L2.1 6.8l.9-1 2.1.3L8 4.4z" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
					</svg>
				</button>
			</header>
			<p className="mc-task clip" title={currentTask(lane)}>
				{currentTask(lane)}
			</p>
			<div className="mc-prog">
				{total > 0 && (
					<>
						<span className="mc-bar" aria-hidden="true">
							<i style={{ width: `${(done / total) * 100}%` }} />
						</span>
						<span className="num mc-n" aria-label={`${done} of ${total} tasks committed`}>
							{done}/{total}
						</span>
					</>
				)}
				{v && (
					<span className={`mc-score ${v.score >= 3 ? "ok" : "bad"}`} title={`Inspector ${v.score}/5`}>
						<span className="pips" aria-hidden="true">
							{[1, 2, 3, 4, 5].map((n) => (
								<i key={n} className={n <= v.score ? "on" : ""} />
							))}
						</span>
						<span className="sr-only">Inspector {v.score} out of 5</span>
					</span>
				)}
			</div>
			<footer className="mc-f">
				{lc ? (
					<>
						<code className="mono">{lc.sha?.slice(0, 7) ?? "commit"}</code>
						<span className="clip">{lc.title}</span>
					</>
				) : (
					<span className="mc-dim">No commits yet</span>
				)}
				{lane.conflicts > 0 && <span className="mc-cf">{lane.conflicts} conflict{lane.conflicts > 1 ? "s" : ""}</span>}
			</footer>
		</article>
	);
});

/** The most interesting agents as compact cards: pinned, then exceptions, then most recently active. The count follows the space available. */
export function FocusGrid({ job, pinned, crewFilter, onFocus, onPin, onHover }: { job: JobState; pinned: Set<string>; crewFilter?: string; onFocus: (id: string) => void; onPin: (id: string) => void; onHover: (id: string | null) => void }) {
	const box = useRef<HTMLDivElement>(null);
	const [cap, setCap] = useState(9);
	const keep = useRef<string[]>([]);
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const measure = () => {
			const cols = Math.max(1, Math.floor((el.clientWidth + GAP) / (CARD_W + GAP)));
			const rows = Math.max(1, Math.floor((el.clientHeight + GAP) / (CARD_H + GAP)));
			setCap(cols * rows);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	let ranked = interestOrder(job, pinned);
	if (crewFilter) ranked = ranked.filter((l) => (l.crewId ?? Object.values(job.crews).find((c) => c.contractIds.includes(l.id))?.id) === crewFilter);
	// Hysteresis: pinned agents and exceptions always show; everyone else already on the grid stays until they merge, so a 100-agent run does not reshuffle the cards on every event.
	const rank = (l: Lane) => (pinned.has(l.id) ? 0 : ["conflict", "rejected", "paused"].includes(stateOf(l)) ? 1 : 2);
	const byId = new Map(ranked.map((l) => [l.id, l]));
	const must = ranked.filter((l) => rank(l) < 2);
	const kept = keep.current.map((id) => byId.get(id)).filter((l): l is Lane => !!l && stateOf(l) !== "merged");
	const seen = new Set<string>();
	const pick: Lane[] = [];
	for (const l of [...must, ...kept, ...ranked]) if (!seen.has(l.id) && pick.length < cap) (seen.add(l.id), pick.push(l));
	keep.current = pick.map((l) => l.id);
	const cards = [...pick].sort((a, b) => rank(a) - rank(b) || keep.current.indexOf(a.id) - keep.current.indexOf(b.id));
	const hidden = ranked.length - cards.length;

	return (
		<div className="fg">
			<div className="fg-head">
				<h2>{crewFilter ? (job.crews[crewFilter]?.name ?? "Crew") + " crew" : "In focus"}</h2>
				<p>
					{hidden > 0 ? `${cards.length} of ${ranked.length} agents: pinned and exceptions first, then the most recently active. The rest are in the swarm.` : `All ${cards.length} agent${cards.length === 1 ? "" : "s"}. Click a card to take control.`}
				</p>
			</div>
			<div className="fg-grid" ref={box} style={{ ["--cw" as string]: `${CARD_W}px`, ["--ch" as string]: `${CARD_H}px` }}>
				<>
					{cards.map((l) => (
						<MiniCard key={l.id} job={job} lane={l} pinned={pinned.has(l.id)} onFocus={onFocus} onPin={onPin} onHover={onHover} />
					))}
				</>
				{cards.length === 0 && <p className="fg-empty">Waiting for the plan. Agents show up here as they are hired.</p>}
			</div>
		</div>
	);
}
