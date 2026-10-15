import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Agent, Chapter, ReviewView } from "@shared/types";
import { Avatar } from "../components/Avatar";
import { ChapterView, type Decision } from "./ChapterView";
import { Entrance } from "./Entrance";
import { Rail } from "./Rail";
import { TriagePanel } from "./TriagePanel";
import { triageOf, type Triage } from "./triage";
import { Timeline } from "./Timeline";
import { infoFor, verdictOf, type AgentInfo } from "./helpers";
import "./review.css";

export type ReviewStageProps = {
	jobId: string;
	review: ReviewView | null;
	agents: Agent[];
	source: "live" | "replay" | "mock";
	busy?: boolean;
	onSignoff: (decisions: Record<string, "approve" | "reject">) => Promise<void> | void;
};

export { mockReview } from "./mock";

/** Chapters in the order they landed on main (the API sends contract order); tolerant of missing fields. */
function normalize(review: ReviewView, jobId: string): ReviewView {
	const mergedAt = new Map<string, number>();
	review.timeline?.forEach((t) => {
		if (t.kind === "merge" && t.contractId && !mergedAt.has(t.contractId)) mergedAt.set(t.contractId, t.at);
	});
	const chapters: Chapter[] = (review.chapters ?? [])
		.map((c, i) => ({ c: { ...c, tasks: c.tasks ?? [], diff: c.diff ?? [], story: c.story ?? "" }, i }))
		.sort((a, b) => (mergedAt.get(a.c.contractId) ?? 1e15 + a.i) - (mergedAt.get(b.c.contractId) ?? 1e15 + b.i))
		.map((x) => x.c);
	return { ...review, jobId: review.jobId || jobId, chapters, timeline: review.timeline ?? [] };
}

function isTyping(t: EventTarget | null): boolean {
	const el = t as HTMLElement | null;
	return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function ReviewStage({ jobId, review: raw, agents, source, busy, onSignoff }: ReviewStageProps) {
	const reduce = !!useReducedMotion();
	const review = useMemo(() => (raw ? normalize(raw, jobId) : null), [raw, jobId]);
	const [mode, setMode] = useState<"chapters" | "timeline">("chapters");
	const [idx, setIdx] = useState(0);
	const [decisions, setDecisions] = useState<Record<string, Decision>>({});
	const [visited, setVisited] = useState<Set<string>>(new Set());
	const [signed, setSigned] = useState(false);
	const [error, setError] = useState("");
	const skipIntro = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("intro") === "0";
	const [intro, setIntro] = useState(!reduce && !skipIntro);
	const seenReview = useRef<string | null>(null);

	// decisions already on the chapters (e.g. when reopening a signed-off job)
	useEffect(() => {
		if (!review || seenReview.current === review.jobId) return;
		seenReview.current = review.jobId;
		const d: Record<string, Decision> = {};
		review.chapters.forEach((c) => {
			const v = c.decision ?? (c.status === "rejected" ? "reject" : undefined);
			if (v) d[c.contractId] = v;
		});
		setDecisions(d);
		const first = review.chapters.findIndex((c) => triageOf(c).group === "needs" && !d[c.contractId]);
		setIdx(first >= 0 ? first : 0); // open on the first chapter that needs you
	}, [review]);

	const whoOf = useCallback((id?: string): AgentInfo => infoFor(agents, id), [agents]);
	const chapters = review?.chapters ?? [];
	const cur = chapters[Math.min(idx, Math.max(0, chapters.length - 1))];

	useEffect(() => {
		if (mode === "chapters" && cur) setVisited((v) => (v.has(cur.contractId) ? v : new Set(v).add(cur.contractId)));
	}, [mode, cur]);

	const triage = useMemo(() => {
		const t: Record<string, Triage> = {};
		(review?.chapters ?? []).forEach((c) => (t[c.contractId] = triageOf(c)));
		return t;
	}, [review]);
	// what will be sent: explicit choices, else the Inspector's call for auto-approvable / rejected chapters; flagged chapters stay open until you decide
	const effective = useMemo(() => {
		const e: Record<string, Decision | undefined> = {};
		(review?.chapters ?? []).forEach((c) => {
			const g = triage[c.contractId]?.group;
			e[c.contractId] = decisions[c.contractId] ?? (g === "auto" ? "approve" : g === "rejected" ? "reject" : undefined);
		});
		return e;
	}, [review, triage, decisions]);
	const approveAuto = useCallback(() => {
		setDecisions((m) => {
			const n = { ...m };
			(review?.chapters ?? []).forEach((c) => {
				if (triage[c.contractId]?.group === "auto") n[c.contractId] = "approve";
			});
			return n;
		});
	}, [review, triage]);

	const decide = useCallback((contractId: string, d: Decision) => setDecisions((m) => ({ ...m, [contractId]: m[contractId] === d && d === "reject" ? "approve" : d })), []);

	useEffect(() => {
		if (mode !== "chapters" || !chapters.length) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || intro) return;
			// arrows belong to the compare view (move the lens, scroll the site) while it has focus
			if ((e.target as HTMLElement | null)?.closest?.(".cmp-box, .cmp-rail")) return;
			const k = e.key.toLowerCase();
			if (k === "arrowright") setIdx((i) => Math.min(chapters.length - 1, i + 1));
			else if (k === "arrowleft") setIdx((i) => Math.max(0, i - 1));
			else if (k === "a" && cur) decide(cur.contractId, "approve");
			else if (k === "r" && cur) decide(cur.contractId, "reject");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mode, chapters.length, cur, decide, intro]);

	const jumpTo = (contractId: string) => {
		const i = chapters.findIndex((c) => c.contractId === contractId);
		if (i >= 0) setIdx(i);
		setMode("chapters");
	};

	const signoff = async () => {
		if (!review) return;
		const out: Record<string, Decision> = {};
		for (const c of review.chapters) {
			const d = effective[c.contractId];
			if (!d) {
				setError("Some chapters still need your decision. Open each flagged chapter and approve or reject it.");
				return;
			}
			out[c.contractId] = d;
		}
		setError("");
		try {
			await onSignoff(out);
			setSigned(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Sign-off failed. Nothing was paid; try again.");
		}
	};

	if (!review) {
		return (
			<section className="rv" data-rv-root aria-busy="true">
				<div className="wrap rv-top">
					<div className="rv-lead">
						<h1 className="rv-h">Opening the finished site</h1>
						<p className="rv-sub">Collecting every commit, score and diff for your review.</p>
					</div>
				</div>
				<div className="wrap">
					<div className="rv-skel" aria-hidden="true" />
				</div>
			</section>
		);
	}

	const conflicts = chapters.filter((c) => c.conflict).length;
	const bricks = chapters.map((c) => {
		const w = whoOf(c.agentId);
		return { id: c.contractId, label: w.name, fill: w.fill, text: w.text };
	});
	const caption = `${chapters.length} ${chapters.length === 1 ? "hire" : "hires"} merged${conflicts ? `, ${conflicts} ${conflicts === 1 ? "conflict" : "conflicts"} resolved` : ""}.`;

	return (
		<section className="rv" data-rv-root aria-label="Review the build">
			{intro && <Entrance bricks={bricks} caption={caption} onDone={() => setIntro(false)} />}
			<div className="wrap rv-top">
				<div className="rv-titlebar">
					<h1 className="rv-h">Everything is merged. Here's what changed.</h1>
					<div className="rv-modes">
						{source !== "live" && <span className="chip warn">{source === "mock" ? "Recorded run, offline data" : "Replay of a recorded run"}</span>}
						<div className="seg big" role="tablist" aria-label="How to review">
							<button role="tab" aria-selected={mode === "chapters"} className={mode === "chapters" ? "on" : ""} onClick={() => setMode("chapters")}>
								Chapters
							</button>
							<button role="tab" aria-selected={mode === "timeline"} className={mode === "timeline" ? "on" : ""} onClick={() => setMode("timeline")}>
								Timeline
							</button>
						</div>
					</div>
				</div>
				<p className="rv-sub">
					{caption} Nothing is paid until you sign off.
				</p>
				<p className="rv-goal">
					<span>The goal you set</span> {review.goal}
				</p>
			</div>

			<div className="wrap rv-grid">
				<div className="rv-main">
					{mode === "chapters" && cur ? (
						<>
							<TriagePanel chapters={chapters} triage={triage} whoOf={whoOf} decisions={effective} current={cur.contractId} onOpen={jumpTo} onApproveAuto={approveAuto} autoDone={chapters.filter((c) => triage[c.contractId].group === "auto").every((c) => decisions[c.contractId] === "approve")} />
							<nav className="reel" aria-label="Chapters" role="tablist">
								{chapters.map((c, i) => {
									const w = whoOf(c.agentId);
									const d = effective[c.contractId];
									const v = verdictOf(c.inspection?.score);
									return (
										<button key={c.contractId} role="tab" aria-selected={i === idx} className={"reel-i" + (i === idx ? " on" : "") + (d === "reject" ? " rej" : "")} onClick={() => setIdx(i)} style={{ ["--ag" as string]: w.fill }}>
											<Avatar seed={w.glyph} color={w.color} size={30} />
											<span className="reel-t">
												<b>{c.title}</b>
												<span>
													{w.name}
													{c.conflict ? " · collision" : ""}
													{d === "reject" ? " · rejected" : triage[c.contractId].group === "needs" && !d ? " · needs you" : ""}
												</span>
											</span>
											<span className={`reel-s ${d === "reject" ? "bad" : v.tone}`} aria-hidden="true">
												{d === "reject" ? "✕" : c.inspection ? `${c.inspection.score}/5` : "–"}
											</span>
										</button>
									);
								})}
							</nav>
							<ChapterView
								key={cur.contractId}
								review={review}
								chapter={cur}
								index={idx}
								total={chapters.length}
								who={whoOf(cur.agentId)}
								whoOther={cur.conflict?.withContractId ? whoOf(chapters.find((c) => c.contractId === cur.conflict!.withContractId)?.agentId) : undefined}
								decision={effective[cur.contractId]}
								onDecide={(d) => decide(cur.contractId, d)}
								onPrev={idx > 0 ? () => setIdx(idx - 1) : undefined}
								onNext={idx < chapters.length - 1 ? () => setIdx(idx + 1) : undefined}
								onFinish={() => document.getElementById("rv-signoff")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })}
							/>
						</>
					) : mode === "timeline" ? (
						<Timeline review={review} whoOf={whoOf} onOpenChapter={jumpTo} />
					) : (
						<p className="rv-code-empty">This job has no chapters to review.</p>
					)}
				</div>
				<div className="rv-side">
					<Rail chapters={chapters} whoOf={whoOf} decisions={effective} triage={triage} visited={visited} current={mode === "chapters" ? cur?.contractId ?? null : null} onJump={jumpTo} onDecide={decide} busy={busy} onSignoff={signoff} signed={signed} />
					{error && <p className="rail-err" role="alert">{error}</p>}
					<p className="rv-keys">
						<kbd>&larr;</kbd> <kbd>&rarr;</kbd> change chapter <kbd>A</kbd> approve <kbd>R</kbd> reject
					</p>
				</div>
			</div>
		</section>
	);
}
