import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Agent } from "../types";
import { blockPlace, STEP_LABEL, STEP_ORDER, type Lane } from "../engine/state";
import { Avatar } from "./Avatar";
import { Block } from "./Block";
import { CodeWindow } from "./CodeWindow";
import { Delta, Ticker } from "./Ticker";
import { brick } from "../lib/color";
import { clock, usdc } from "../lib/format";

function useNow(active: boolean) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [active]);
	return now;
}

function stepIndex(l: Lane): number {
	const map: Partial<Record<Lane["status"], Lane["status"]>> = { conflict: "merging", resolving: "merging", rejected: "reviewing", offered: "forking" };
	const s = map[l.status] ?? l.status;
	return STEP_ORDER.indexOf(s);
}

function chipTone(l: Lane): string {
	switch (l.status) {
		case "merged":
		case "paid":
			return "ok";
		case "rejected":
			return "bad";
		case "conflict":
		case "resolving":
			return "warn";
		case "reviewing":
			return (l.review?.score ?? 0) >= 3 ? "ok" : "bad";
		case "working":
			return "dark";
		default:
			return "";
	}
}

/** The contract's checklist: each tick is one commit on the agent's fork (short sha beside it). */
function TaskList({ lane }: { lane: Lane }) {
	const done = lane.tasks.filter((t) => t.done).length;
	const hold = lane.status === "forking" || lane.status === "offered";
	return (
		<div className="tasks" aria-label={`Tasks: ${done} of ${lane.tasks.length} committed`}>
			<div className="tasks-head">
				<strong>Tasks</strong>
				<span className="num">
					{done}/{lane.tasks.length}
				</span>
				<span className="tbar" aria-hidden="true">
					<i style={{ width: `${(done / lane.tasks.length) * 100}%` }} />
				</span>
			</div>
			<ul>
				{lane.tasks.map((t) => (
					<li key={t.id} className={t.done ? "done" : hold ? "wait" : ""}>
						<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
							<rect x="1" y="1" width="12" height="12" rx="3" fill={t.done ? "var(--c)" : "none"} stroke={t.done ? "var(--ink)" : "var(--line-2)"} strokeWidth="1.4" />
							{t.done && <path d="M4 7.2l2 2L10 5" stroke="var(--ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
						</svg>
						<span className="tt clip">{t.title}</span>
						{t.sha && <code className="mono sha-s">{t.sha.slice(0, 7)}</code>}
					</li>
				))}
			</ul>
		</div>
	);
}

export function LaneCard({ lane, agent, focus, dim }: { lane: Lane; agent: Agent; focus: boolean; dim: boolean }) {
	const b = brick(agent.color);
	const place = blockPlace(lane);
	const live = !!lane.tokenExpiresAt && !["merged", "paid"].includes(lane.status);
	const now = useNow(live);
	const idx = stepIndex(lane);
	const left = (lane.tokenEndsAt ?? (lane.tokenExpiresAt ? new Date(lane.tokenExpiresAt).getTime() : 0)) - now;
	const hazard = lane.status === "conflict" || lane.status === "resolving";
	const rejected = lane.status === "rejected";
	const reverted = !!lane.reverted;

	return (
		<article className={`lane ${lane.fork ? "forked" : ""} ${reverted ? "reverted" : ""}`} data-focus={focus} data-dim={dim} data-status={lane.status} style={{ ["--c" as string]: b.fill }} aria-label={`${agent.name}: ${lane.title}`}>
			<span className="elbow" aria-hidden="true" />
			<span className="node" aria-hidden="true" />
			{lane.status === "merged" && <span key={lane.mergeSha} className="pulse" aria-hidden="true" />}

			<div className="lane-info">
				<header className="lane-head">
					<Avatar seed={agent.glyph} color={agent.color} size={44} agentId={agent.id} label={agent.name} />
					<div className="lane-who">
						<strong>{agent.name}</strong>
						<span className="mono">{agent.handle}</span>
					</div>
					<div className="lane-rep" title="Reputation">
						<Ticker value={agent.reputation} />
						<AnimatePresence>
							{lane.rep && (
								<motion.span key={lane.rep.after} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
									<Delta from={lane.rep.before} to={lane.rep.after} />
								</motion.span>
							)}
						</AnimatePresence>
					</div>
				</header>

				<h3>{lane.title}</h3>
				{lane.role && <span className="chip role lane-role">{lane.role}</span>}
				<p className="brief">{lane.brief}</p>

				<div className="steps" role="img" aria-label={`Progress: ${STEP_LABEL[lane.status]}`}>
					{STEP_ORDER.map((s, i) => (
						<i key={s} className={`${i < idx || (i === idx && ["merged", "paid"].includes(lane.status)) ? "done" : ""} ${i === idx ? "cur" : ""} ${i === idx && hazard ? "hazard" : ""} ${i === idx && rejected ? "bad" : ""}`} />
					))}
				</div>
				<div className="lane-row">
					<span className={`chip ${chipTone(lane)}`}>
						<span className="dot" />
						{STEP_LABEL[lane.status]}
						{lane.status === "reviewing" && lane.review ? ` ${lane.review.score}/5` : ""}
					</span>
					{lane.rejections > 0 && <span className="chip">Attempt {lane.rejections + 1}</span>}
					{reverted && <span className="chip bad">Reverted in review</span>}
					<span className="chip mono num">{usdc(lane.wage)} USDC</span>
					{lane.fork && (
						<span className={`chip token ${live ? "" : "dead"}`} title="The write token is the contract: it expires when the contract ends.">
							<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
								<rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" />
								<path d={live ? "M4 5.5V4a2 2 0 0 1 4 0v1.5" : "M4 5.5V4a2 2 0 0 1 3.8-.9"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
							</svg>
							<span className="mono num">{live ? `${clock(left)} left` : "token revoked"}</span>
						</span>
					)}
				</div>

				{lane.tasks.length > 0 && <TaskList lane={lane} />}

				<AnimatePresence initial={false}>
					{lane.review && lane.status !== "working" && (
						<motion.div key={`${lane.rejections}-${lane.review.score}`} className={`review ${lane.review.score >= 3 ? "pass" : "fail"}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
							<div className="review-in">
								<span className="pips" aria-label={`Review ${lane.review.score} out of 5`}>
									{[1, 2, 3, 4, 5].map((n) => (
										<i key={n} className={n <= lane.review!.score ? "on" : ""} style={{ ["--d" as string]: `${n * 70}ms` }} />
									))}
								</span>
								<p>
									<strong>Inspector {lane.review.score}/5.</strong> {lane.review.notes}
								</p>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<div className="tray" aria-label="Commits">
					{place === "lane" && <Block id={lane.id} agent={agent} place="lane" pop label={`${lane.title} @ ${lane.sha?.slice(0, 7)}`} />}
					{rejected && <div className="blk ghost" style={{ ["--fill" as string]: b.fill, ["--txt" as string]: b.text }}><span className="blk-t">{agent.name}</span></div>}
					{place !== "lane" && !rejected && place !== "none" && <span className="tray-note">{place === "queue" ? "Waiting in the merge queue" : place === "bay" ? "In the merge bay" : "Merged into main"}</span>}
					{lane.thought && lane.status === "working" && (
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span key={lane.thought.key} className="thought" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
								{lane.thought.text}
							</motion.span>
						</AnimatePresence>
					)}
				</div>
			</div>

			<CodeWindow lane={lane} color={b.fill} />
		</article>
	);
}
