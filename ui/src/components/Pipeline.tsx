import { AnimatePresence, motion } from "motion/react";
import type { JobState } from "../engine/state";
import { blockPlace } from "../engine/state";
import type { Conflict } from "../types";
import { BaseBrick, Block } from "./Block";
import { brick } from "../lib/color";
import { sha7 } from "../lib/format";

/** The machine on the left: merge queue (conveyor) -> merge bay (three-way merge) -> main (the well where merged bricks stack). */
export function Pipeline({ job }: { job: JobState }) {
	const queue = job.queue.map((id) => job.lanes[id]).filter(Boolean);
	const bay = job.bay;
	const bayLane = bay ? job.lanes[bay.contractId] : undefined;
	const bayAgent = bayLane ? job.agents[bayLane.agentId] : undefined;
	const withLane = bay?.withContractId ? job.lanes[bay.withContractId] : undefined;
	const withAgent = withLane ? job.agents[withLane.agentId] : undefined;
	const hasBase = job.mainline.some((m) => !m.contractId);
	const merged = job.order.filter((id) => job.lanes[id].status === "merged" || job.lanes[id].status === "paid").length;
	const phase = bay?.phase;
	const conflict = phase === "conflict" || phase === "resolving" || phase === "snap";
	const head = job.mainline[job.mainline.length - 1];

	return (
		<aside className="pipe" aria-label="Merge queue and main">
			<section className="stage queue">
				<h3>
					Merge queue <small>one at a time</small>
				</h3>
				<div className="queue-slots">
					{queue.length === 0 && <span className="slot-empty">Empty</span>}
					{queue.map((l, i) => (
						<div key={l.id} className="qslot">
							<Block id={l.id} agent={job.agents[l.agentId]} place="queue" label={`${l.title} @ ${sha7(l.sha)}`} />
							<small className="num">{i + 1}</small>
						</div>
					))}
				</div>
				<div className="belt" data-run={queue.length > 0 || !!bay} aria-hidden="true" />
			</section>

			<motion.section layout className={`stage bay ${phase ?? ""}`} data-phase={phase ?? "idle"}>
				<h3>
					Merge bay <small>{phase === "conflict" ? "conflict" : phase === "resolving" ? "resolving" : phase === "snap" ? "resolved" : phase === "merging" ? "three-way merge" : "idle"}</small>
				</h3>
				<div className="bay-slot">
					<AnimatePresence>
						{conflict && (
							<motion.div
								key="main-piece"
								className={`main-piece ${phase}`}
								style={{ ["--pc" as string]: withAgent ? brick(withAgent.color).fill : "#8190a6", ["--pt" as string]: withAgent ? brick(withAgent.color).text : "#0F1826" }}
								initial={{ opacity: 0, x: -30 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -18 }}
								transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
								layout
							>
								<span className="blk-t">{withAgent ? withAgent.name : "main"}</span>
								<i className="peg" />
							</motion.div>
						)}
					</AnimatePresence>
					{bayLane && blockPlace(bayLane) === "bay" && <Block id={bayLane.id} agent={bayAgent} place="bay" label={bayLane.title} />}
					{!bayLane && <span className="slot-empty">Waiting for the next delivery</span>}
					{phase === "merging" && <span className="scanline" aria-hidden="true" />}
					{phase === "snap" && <span key="click" className="clickflash" aria-hidden="true" />}
				</div>
				<AnimatePresence initial={false}>
					{bay?.conflicts && bay.conflicts.length > 0 && (phase === "conflict" || phase === "resolving") && (
						<motion.div key="card" className="conflict-card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
							<ConflictCard c={bay.conflicts[0]} extra={bay.conflicts.length - 1} ours={withAgent?.name ?? "main"} theirs={bayAgent?.name ?? "delivery"} />
						</motion.div>
					)}
				</AnimatePresence>
			</motion.section>

			<section className="stage well-wrap">
				<h3>
					main <small className="mono">{head ? sha7(head.sha) : ""}</small>
					<span className="merged-count">
						<span className="num">{merged}</span> of {job.order.length} merged
					</span>
				</h3>
				<div className="well" data-clear={job.lineClear}>
					<div className="stack">
						{!hasBase && <BaseBrick label="Initial commit" />}
						{job.mainline.map((m, i) => {
							const lane = m.contractId ? job.lanes[m.contractId] : undefined;
							if (!lane) return <BaseBrick key={m.sha} label={m.message} />;
							if (blockPlace(lane) !== "trunk") return null;
							return (
								<div key={m.sha} className="course" data-odd={i % 2} title={`${lane.title} @ ${sha7(m.sha)}`}>
									<Block id={lane.id} agent={job.agents[lane.agentId]} place="trunk" label={`${lane.title} @ ${sha7(m.sha)}`} />
								</div>
							);
						})}
					</div>
					{job.lineClear > 0 && <span key={job.lineClear} className="line-clear" aria-hidden="true" />}
				</div>
			</section>
		</aside>
	);
}

function Lines({ lines, kind }: { lines: string[]; kind: string }) {
	if (lines.length === 0) return <div className="cl empty">(nothing, both sides inserted here)</div>;
	return (
		<>
			{lines.map((l, i) => (
				<div key={i} className={`cl ${kind}`}>
					{l}
				</div>
			))}
		</>
	);
}

function ConflictCard({ c, extra, ours, theirs }: { c: Conflict; extra: number; ours: string; theirs: string }) {
	return (
		<div className="cc">
			<p className="cc-head">
				<span className="mono">{c.path}</span> <span>line {c.baseLine}</span>
			</p>
			<div className="cc-col base">
				<b>Base</b>
				<Lines lines={c.base} kind="" />
			</div>
			<div className="cc-col ours">
				<b>Ours ({ours} on main)</b>
				<Lines lines={c.ours} kind="add" />
			</div>
			<div className="cc-col theirs">
				<b>Theirs ({theirs})</b>
				<Lines lines={c.theirs} kind="add" />
			</div>
			{extra > 0 && <p className="cc-more">and {extra} more</p>}
		</div>
	);
}
