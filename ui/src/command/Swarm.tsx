import { memo, useMemo } from "react";
import type { JobState, Lane } from "../engine/state";
import { agentOf, groupsOf, stateOf, STATE_LABEL, STATE_ORDER, currentTask, type AState, type Group } from "./derive";
import { Glyph, STATE_HEX } from "./Glyph";

export type HoverInfo = { id: string; rect: DOMRect } | null;

type Props = {
	job: JobState;
	selected?: string;
	pinned: Set<string>;
	variant: "column" | "board";
	crewFilter?: string;
	onFocus: (id: string) => void;
	onHover: (h: HoverInfo) => void;
	onCrew?: (id: string) => void;
};

/** The glyph rendering rule. List for a small crew, one glyph per agent up to GLYPH_MAX, crew heat-cells beyond that. */
export const GLYPH_MAX = 150;
function glyphSize(n: number, variant: Props["variant"]): number {
	if (variant === "board") return n <= 40 ? 34 : n <= 120 ? 28 : 22;
	return n <= 30 ? 26 : n <= 60 ? 22 : n <= 120 ? 18 : 14;
}
const short = (name: string) => (/^Yard \d+$/.test(name) ? name.slice(5) : name.length > 6 ? name.slice(0, 5) : name);

const Cell = memo(function Cell({ lane, state, name, task, size, selected, pinned, label, onFocus, onHover }: { lane: Lane; state: AState; name: string; task: string; size: number; selected: boolean; pinned: boolean; label: boolean; onFocus: (id: string) => void; onHover: (h: HoverInfo) => void }) {
	const id = lane.id;
	return (
		<button
			type="button"
			className="sw-cell"
			data-state={state}
			data-sel={selected || undefined}
			data-pin={pinned || undefined}
			aria-label={`${name}: ${STATE_LABEL[state]}. ${task}`}
			aria-pressed={selected}
			onClick={() => onFocus(id)}
			onMouseEnter={(e) => onHover({ id, rect: e.currentTarget.getBoundingClientRect() })}
			onMouseLeave={() => onHover(null)}
			onFocus={(e) => onHover({ id, rect: e.currentTarget.getBoundingClientRect() })}
			onBlur={() => onHover(null)}
		>
			<Glyph state={state} size={size} />
			{label && <span className="sw-name mono">{short(name)}</span>}
		</button>
	);
});

function HeatBar({ g }: { g: Group }) {
	const c: Record<AState, number> = { idle: 0, working: 0, committed: 0, conflict: 0, merged: 0, rejected: 0, paused: 0 };
	for (const l of g.lanes) c[stateOf(l)]++;
	return (
		<span className="heat" role="img" aria-label={STATE_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${STATE_LABEL[s].toLowerCase()}`).join(", ")}>
			{STATE_ORDER.map((s) => (c[s] ? <i key={s} data-state={s} style={{ flexGrow: c[s], background: STATE_HEX[s] }} /> : null))}
		</span>
	);
}

export const Swarm = memo(function Swarm({ job, selected, pinned, variant, crewFilter, onFocus, onHover, onCrew }: Props) {
	const groups = useMemo(() => groupsOf(job), [job]);
	const total = job.order.length;
	const shown = crewFilter ? groups.filter((g) => g.id === crewFilter) : groups;

	if (total === 0) return <p className="sw-empty">No agents yet. They appear here as the Foreman hires them.</p>;

	// Heat-cell mode: too many agents for one glyph each.
	if (total > GLYPH_MAX && !crewFilter) {
		return (
			<div className={`sw sw-heat sw-${variant}`}>
				{groups.map((g) => {
					const done = g.lanes.filter((l) => stateOf(l) === "merged").length;
					return (
						<button key={g.id} type="button" className="sw-tile" onClick={() => onCrew?.(g.id)} aria-label={`${g.name}: ${done} of ${g.lanes.length} merged. Open this crew.`}>
							<span className="sw-tile-h">
								<b>{g.name}</b>
								<span className="num">{done}/{g.lanes.length}</span>
							</span>
							<HeatBar g={g} />
						</button>
					);
				})}
			</div>
		);
	}

	// A small crew reads better as a list.
	if (total <= 12 && variant === "column") {
		return (
			<ul className="sw sw-list">
				{job.order.map((id) => {
					const l = job.lanes[id];
					if (!l) return null;
					const a = agentOf(job, l);
					const st = stateOf(l);
					return (
						<li key={id}>
							<button type="button" className="sw-row" data-state={st} data-sel={selected === id || undefined} aria-pressed={selected === id} onClick={() => onFocus(id)} onMouseEnter={(e) => onHover({ id, rect: e.currentTarget.getBoundingClientRect() })} onMouseLeave={() => onHover(null)} onFocus={(e) => onHover({ id, rect: e.currentTarget.getBoundingClientRect() })} onBlur={() => onHover(null)}>
								<Glyph state={st} size={26} />
								<span className="sw-row-t">
									<b>{a.name}</b>
									<span className="clip">{currentTask(l)}</span>
								</span>
								<span className="sw-row-s">{STATE_LABEL[st]}</span>
							</button>
						</li>
					);
				})}
			</ul>
		);
	}

	const size = glyphSize(crewFilter ? shown[0]?.lanes.length ?? total : total, variant);
	const labels = variant === "board" && total <= 120;
	return (
		<div className={`sw sw-blocks sw-${variant}`} style={{ ["--gs" as string]: `${size}px` }}>
			{shown.map((g) => {
				const done = g.lanes.filter((l) => stateOf(l) === "merged").length;
				return (
					<section key={g.id} className="sw-crew" data-merged={g.merged || undefined} aria-label={`${g.name} crew`}>
						{(groups.length > 1 || variant === "board") && (
							<h3 className="sw-crew-h">
								<span>{g.name}</span>
								<span className="num">{done}/{g.lanes.length}</span>
								{g.merged && <span className="sw-in" title="Crew line merged into main">in main</span>}
							</h3>
						)}
						<div className="sw-grid">
							{g.lanes.map((l) => (
								<Cell key={l.id} lane={l} state={stateOf(l)} name={agentOf(job, l).name} task={currentTask(l)} size={size} selected={selected === l.id} pinned={pinned.has(l.id)} label={labels} onFocus={onFocus} onHover={onHover} />
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
});
