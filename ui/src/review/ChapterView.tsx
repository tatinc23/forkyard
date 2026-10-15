import { useEffect, useMemo, useState } from "react";
import type { Chapter, ReviewView } from "@shared/types";
import { Avatar } from "../components/Avatar";
import { Compare, type Stop } from "./Compare";
import { CodeCards } from "./CodeCards";
import { short, verdictOf, type AgentInfo } from "./helpers";

export type Decision = "approve" | "reject";

/** Every commit worth stepping through for this hire: its task commits, its conflict rebuilds, then the merged result. */
export function stopsFor(review: ReviewView, ch: Chapter, who: AgentInfo): Stop[] {
	const seen = new Set<string>();
	const out: (Stop & { at: number })[] = [];
	const colors = { color: who.fill, textColor: who.text };
	for (const t of ch.tasks ?? []) {
		if (t.sha && t.status === "done" && !seen.has(t.sha)) {
			seen.add(t.sha);
			out.push({ key: t.id, label: t.title, story: t.story, paths: t.paths, sha: t.sha, on: ch.agentId, at: t.at ?? 0, ...colors });
		}
	}
	for (const it of review.timeline) {
		if (it.contractId === ch.contractId && it.on !== "main" && !seen.has(it.sha)) {
			seen.add(it.sha);
			out.push({ key: it.sha, label: it.title, story: it.story, sha: it.sha, on: it.on, at: it.at, ...colors });
		}
	}
	out.sort((a, b) => a.at - b.at);
	const fin: Stop = { key: "merged", label: "Merged onto main", story: "The finished result after this chapter landed on the shared site.", sha: ch.afterSha, on: "main", final: true, color: "#0f1826", textColor: "#ffffff" };
	return [...out.map(({ at: _at, ...s }) => s), fin];
}

function Bricks({ score }: { score: number }) {
	const tone = score >= 4 ? "ok" : score === 3 ? "warn" : "bad";
	return (
		<span className={`bricks ${tone}`} role="img" aria-label={`${score} out of 5`}>
			{[1, 2, 3, 4, 5].map((n) => (
				<i key={n} className={n <= score ? "on" : ""} style={{ ["--d" as string]: `${n * 70}ms` }} />
			))}
		</span>
	);
}

export function DecisionButtons({ who, decision, onDecide, size }: { who: AgentInfo; decision?: Decision; onDecide: (d: Decision) => void; size?: "lg" }) {
	return (
		<div className={"decide" + (size ? " lg" : "")}>
			<div className="decide-btns" role="group" aria-label={`Your verdict on ${who.name}'s chapter`}>
				<button className={"btn ok" + (decision === "approve" ? " on" : "")} aria-pressed={decision === "approve"} onClick={() => onDecide("approve")}>
					<kbd>A</kbd> Approve
				</button>
				<button className={"btn no" + (decision === "reject" ? " on" : "")} aria-pressed={decision === "reject"} onClick={() => onDecide("reject")}>
					<kbd>R</kbd> Reject
				</button>
			</div>
			{decision === "reject" && (
				<p className="decide-note" role="status">
					This chapter will be reverted on main and not paid; {who.name}'s reputation drops.
				</p>
			)}
		</div>
	);
}

export function ChapterView({ review, chapter, index, total, who, whoOther, decision, onDecide, onPrev, onNext, onFinish }: {
	review: ReviewView;
	chapter: Chapter;
	index: number;
	total: number;
	who: AgentInfo;
	whoOther?: AgentInfo;
	decision?: Decision;
	onDecide: (d: Decision) => void;
	onPrev?: () => void;
	onNext?: () => void;
	onFinish: () => void;
}) {
	const stops = useMemo(() => stopsFor(review, chapter, who), [review, chapter, who]);
	const [active, setActive] = useState(stops.length - 1);
	const [more, setMore] = useState(false);
	useEffect(() => {
		setActive(stops.length - 1);
		setMore(false);
	}, [chapter.contractId, stops.length]);

	const verdict = verdictOf(chapter.inspection?.score);
	const failed = (chapter.tasks ?? []).filter((t) => t.status === "failed");
	const neverMerged = chapter.status === "rejected" || chapter.beforeSha === chapter.afterSha;
	const long = chapter.story.length > 170;
	const c = chapter.conflict;
	const added = chapter.changes?.added ?? chapter.diff.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.insert.length, 0), 0);
	const removed = chapter.changes?.removed ?? chapter.diff.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.remove.length, 0), 0);

	return (
		<article className="chap" aria-label={`Chapter ${index + 1}: ${chapter.title}`} style={{ ["--ag" as string]: who.fill }}>
			<header className="chap-head">
				<Avatar seed={who.glyph} color={who.color} size={64} label={who.name} agentId={who.id} />
				<div className="chap-id">
					<p className="chap-by">
						Chapter {index + 1} of {total} by <b>{who.name}</b>
						{(chapter.role || who.role) && <> &middot; {chapter.role ?? who.role}</>}
						<span className="chap-delta mono"><b className="add">+{added}</b> <b className="del">&minus;{removed}</b></span>
					</p>
					<h2 className="chap-title">{chapter.title}</h2>
				</div>
				<DecisionButtons who={who} decision={decision} onDecide={onDecide} />
			</header>

			<div className={"chap-story" + (long && !more ? " clamp" : "")}>
				<p>{chapter.story}</p>
				{long && (
					<button className="link" onClick={() => setMore((m) => !m)} aria-expanded={more}>
						{more ? "Show less" : "Read the full brief"}
					</button>
				)}
			</div>

			{neverMerged && (
				<p className="never" role="note">
					{chapter.status === "rejected" ? "The Inspector rejected this delivery, so it never merged into main. The comparison below shows no change from the code that did land." : "Nothing from this chapter changed the site."}
				</p>
			)}

			<Compare jobId={review.jobId} beforeSha={chapter.beforeSha} stops={stops} active={active} onActive={setActive} resetKey={chapter.contractId} />

			<div className="chap-cols">
				<section className="rv-steps" aria-label="What this hire did">
					<h3>What {who.name} did</h3>
					<ol>
						{stops.map((s, i) => (
							<li key={s.key} className={i === active ? "now" : ""}>
								<button onClick={() => setActive(i)} aria-current={i === active ? "step" : undefined}>
									<span className="tick" aria-hidden="true" style={{ background: s.color }} />
									<span className="st-body">
										<span className="st-t">{s.label}</span>
										{s.story && <span className="st-s">{s.story}</span>}
									</span>
									<span className="st-sha mono">{short(s.sha)}</span>
								</button>
							</li>
						))}
					</ol>
					{failed.length > 0 && (
						<div className="skipped">
							<p>{failed.length === 1 ? "1 task did not work out and was skipped" : `${failed.length} tasks did not work out and were skipped`}</p>
							<ul>
								{failed.map((t) => (
									<li key={t.id}>{t.title}</li>
								))}
							</ul>
						</div>
					)}
				</section>

				<div className="chap-side">
					<section className={`verdict ${verdict.tone}`} aria-label="Inspector verdict">
						<h3>The Inspector's verdict</h3>
						{chapter.inspection ? (
							<>
								<div className="verdict-row">
									<Bricks score={chapter.inspection.score} />
									<b className="verdict-n">{chapter.inspection.score}/5</b>
									<span className="verdict-l">{verdict.label}</span>
								</div>
								<p className="verdict-notes">{chapter.inspection.notes}</p>
							</>
						) : (
							<p className="verdict-notes">The Inspector did not score this delivery.</p>
						)}
					</section>

					{c && (
						<section className="clash" aria-label="Merge conflict">
							<h3>{c.resolved ? "A collision, resolved" : "A collision, still open"}</h3>
							<div className="clash-art" aria-hidden="true">
								<span className="clash-brick" style={{ background: whoOther?.fill ?? "#94a3b8", color: whoOther?.text ?? "#0f1826" }}>{whoOther?.name ?? "Another hire"}</span>
								<span className="clash-file mono">{c.paths[0] ?? "a file"}</span>
								<span className="clash-brick" style={{ background: who.fill, color: who.text }}>{who.name}</span>
							</div>
							<p>
								{whoOther ? `${whoOther.name} and ${who.name}` : `${who.name} and another hire`} both changed <span className="mono">{c.paths.join(", ")}</span>.{" "}
								{c.resolved ? `${who.name} re-built on top of the merged result, and the conflict was resolved before this landed.` : "It was not resolved."}
							</p>
						</section>
					)}
				</div>
			</div>

			<CodeCards jobId={review.jobId} chapter={chapter} tasks={chapter.tasks ?? []} />

			<footer className="chap-end">
				<DecisionButtons who={who} decision={decision} onDecide={onDecide} size="lg" />
				<div className="chap-nav">
					{onPrev && <button className="btn ghost" onClick={onPrev}>Previous chapter</button>}
					{onNext ? (
						<button className="btn dark" onClick={onNext}>Next chapter</button>
					) : (
						<button className="btn dark" onClick={onFinish}>Go to sign-off</button>
					)}
				</div>
			</footer>
		</article>
	);
}
