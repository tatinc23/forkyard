import { useMemo } from "react";
import type { JobState, Lane } from "../engine/state";
import { agentOf, groupsOf, stateOf, STATE_LABEL, type AState } from "./derive";
import { sha7 } from "../lib/format";
import type { HoverInfo } from "./Swarm";

type Props = { job: JobState; selected?: string; onFocus: (id: string) => void; onHover: (h: HoverInfo) => void };

const W = 900;

function Node({ lane, st, x, y, r, name, selected, onFocus, onHover, label }: { lane: Lane; st: AState; x: number; y: number; r: number; name: string; selected: boolean; onFocus: (id: string) => void; onHover: (h: HoverInfo) => void; label?: boolean }) {
	return (
		<g
			className="mt-node"
			data-state={st}
			data-sel={selected || undefined}
			transform={`translate(${x} ${y})`}
			tabIndex={0}
			role="button"
			aria-label={`${name}: ${STATE_LABEL[st]}`}
			onClick={() => onFocus(lane.id)}
			onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onFocus(lane.id))}
			onMouseEnter={(e) => onHover({ id: lane.id, rect: (e.currentTarget as SVGGElement).getBoundingClientRect() })}
			onMouseLeave={() => onHover(null)}
			onFocus={(e) => onHover({ id: lane.id, rect: (e.currentTarget as SVGGElement).getBoundingClientRect() })}
			onBlur={() => onHover(null)}
		>
			<circle className="mt-hit" r={r + 5} />
			{st === "conflict" && <circle className="mt-halo" r={r + 3} />}
			<circle className="mt-dot" r={r} />
			{st === "merged" && <path className="mt-tick" d={`M${-r * 0.5} 0.2 ${-r * 0.1} ${r * 0.45} ${r * 0.55} ${-r * 0.4}`} />}
			{st === "rejected" && <path className="mt-x" d={`M${-r * 0.45} ${-r * 0.45}l${r * 0.9} ${r * 0.9}M${r * 0.45} ${-r * 0.45}l${-r * 0.9} ${r * 0.9}`} />}
			{label && (
				<text className="mt-lbl" x="0" y={r + 13} textAnchor="middle">
					{name}
				</text>
			)}
		</g>
	);
}

export function MergeTree({ job, selected, onFocus, onHover }: Props) {
	const groups = useMemo(() => groupsOf(job), [job]);
	const total = job.order.length;
	const crews = job.crewOrder.length > 0;
	const head = job.mainline[job.mainline.length - 1];

	if (total === 0) return <p className="mt-empty">The merge tree grows as agents are hired and deliver.</p>;

	// Small AI crew, no crew lines: every agent merges straight into main through the queue.
	if (!crews && total <= 12) {
		const rowH = Math.min(86, 520 / total);
		const H = Math.max(240, total * rowH + 70);
		const trunkX = 120;
		const order = job.order.map((id) => job.lanes[id]).filter(Boolean);
		const mergedCount = order.filter((l) => stateOf(l) === "merged").length;
		return (
			<div className="mt">
				<svg className="mt-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Merge tree: agents merge into main">
					<line className="mt-trunk" x1={trunkX} y1="36" x2={trunkX} y2={H - 24} />
					<g transform={`translate(${trunkX} 30)`}>
						<rect className="mt-main" x="-44" y="-18" width="88" height="34" rx="9" />
						<text className="mt-main-t" textAnchor="middle" y="4">
							main
						</text>
						<text className="mt-main-s" textAnchor="middle" y="31">
							{head ? sha7(head.sha) : ""} · {mergedCount}/{total}
						</text>
					</g>
					{order.map((l, i) => {
						const st = stateOf(l);
						const y = 84 + i * rowH;
						const ax = 520;
						const a = agentOf(job, l);
						const lit = st === "merged";
						return (
							<g key={l.id}>
								<path className="mt-edge" data-state={st} d={`M${ax - 14} ${y} C ${ax - 160} ${y}, ${trunkX + 140} ${y}, ${trunkX + 8} ${y}`} />
								{lit && <path key={l.mergeSha} className="mt-spark" d={`M${ax - 14} ${y} C ${ax - 160} ${y}, ${trunkX + 140} ${y}, ${trunkX + 8} ${y}`} pathLength={1} />}
								<circle className="mt-junction" data-lit={lit || undefined} cx={trunkX} cy={y} r="5" />
								<Node lane={l} st={st} x={ax} y={y} r={15} name={a.name} selected={selected === l.id} onFocus={onFocus} onHover={onHover} />
								<text className="mt-name" x={ax + 28} y={y - 2}>
									{a.name}
								</text>
								<text className="mt-sub" x={ax + 28} y={y + 15}>
									{STATE_LABEL[st]}
									{l.conflicts ? ` · ${l.conflicts} conflict${l.conflicts > 1 ? "s" : ""}` : ""}
									{l.mergeSha ? ` · ${sha7(l.mergeSha)}` : ""}
								</text>
							</g>
						);
					})}
				</svg>
				<p className="mt-cap">No crew lines on this run: each agent merges straight into main, one at a time through the queue.</p>
			</div>
		);
	}

	// Crew lines: main <- crew lines <- agents.
	const rowH = groups.length > 8 ? 58 : Math.min(110, 520 / Math.max(1, groups.length));
	const H = 52 + groups.length * rowH + 14;
	const trunkX = 78;
	const crewX = 214;
	const startX = 300;
	const mainMerged = groups.filter((g) => g.merged).length;
	const sub = rowH > 50 ? 2 : 1;
	return (
		<div className="mt">
			<svg className="mt-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Merge tree: agents merge into crew lines, crew lines merge into main">
				<line className="mt-trunk" x1={trunkX} y1="40" x2={trunkX} y2={H - 14} />
				<g transform={`translate(${trunkX} 24)`}>
					<rect className="mt-main" x="-40" y="-15" width="80" height="30" rx="8" />
					<text className="mt-main-t" textAnchor="middle" y="4">
						main
					</text>
				</g>
				<text className="mt-main-s" x={trunkX} y={H - 2} textAnchor="middle">
					{head ? sha7(head.sha) : ""} · {mainMerged}/{groups.length} crews
				</text>
				{groups.map((g, gi) => {
					const ty = 52 + gi * rowH + rowH / 2;
					const per = Math.ceil(g.lanes.length / sub);
					const step = Math.min(66, (W - startX - 26) / Math.max(1, per));
					const lastX = startX + (per - 1) * step;
					const crewLit = g.merged;
					return (
						<g key={g.id} className="mt-crew" data-merged={crewLit || undefined}>
							<path className="mt-edge crew" data-lit={crewLit || undefined} d={`M${crewX - 18} ${ty} C ${crewX - 70} ${ty}, ${trunkX + 60} ${ty}, ${trunkX + 6} ${ty}`} />
							{crewLit && <path key={job.crews[g.id]?.sha} className="mt-spark crew" d={`M${crewX - 18} ${ty} C ${crewX - 70} ${ty}, ${trunkX + 60} ${ty}, ${trunkX + 6} ${ty}`} pathLength={1} />}
							<circle className="mt-junction" data-lit={crewLit || undefined} cx={trunkX} cy={ty} r="5" />
							<line className="mt-track" x1={crewX + 16} y1={ty} x2={lastX} y2={ty} />
							<g transform={`translate(${crewX} ${ty})`} className="mt-crewnode" data-merged={crewLit || undefined}>
								<rect x="-18" y="-13" width="36" height="26" rx="7" />
								<text textAnchor="middle" y="4">
									{gi + 1}
								</text>
							</g>
							<text className="mt-crewname" x={crewX} y={ty + 27} textAnchor="middle">
								{g.name}
							</text>
							{g.lanes.map((l, li) => {
								const col = li % per;
								const row = Math.floor(li / per);
								const ax = startX + col * step;
								const ay = ty + (sub === 1 ? 0 : row === 0 ? -14 : 14);
								const st = stateOf(l);
								const a = agentOf(job, l);
								const path = `M${ax} ${ay} L${ax} ${ty} L${crewX + 16} ${ty}`;
								return (
									<g key={l.id}>
										<path className="mt-edge agent" data-state={st} d={path} />
										{st === "merged" && l.mergedInto && <path key={l.mergeSha} className="mt-spark" d={path} pathLength={1} />}
										<Node lane={l} st={st} x={ax} y={ay} r={sub === 1 ? 8 : 6.5} name={a.name} selected={selected === l.id} onFocus={onFocus} onHover={onHover} />
									</g>
								);
							})}
						</g>
					);
				})}
			</svg>
			<p className="mt-cap">
				Agents merge into their crew line in parallel; crew lines fold into main one at a time. A collision pulses on the agent that caused it, and clears when it re-delivers.
			</p>
		</div>
	);
}
