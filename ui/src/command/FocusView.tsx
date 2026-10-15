import { useEffect, useMemo, useRef, useState } from "react";
import type { JobState, Lane } from "../engine/state";
import { Avatar } from "../components/Avatar";
import { CodeWindow } from "../components/CodeWindow";
import { ApiError, controlContract, noteContract } from "../lib/api";
import { brick } from "../lib/color";
import { clock, sha7, usdc } from "../lib/format";
import { agentOf, currentTask, inspectorOf, stateOf, STATE_LABEL } from "./derive";
import { Glyph } from "./Glyph";

const LIVE_ONLY = "Live runs only";

function useNow(active: boolean) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [active]);
	return now;
}

type Pending = { id: number; text: string };

export function FocusView({ job, lane, pinned, onBack, onPin }: { job: JobState; lane: Lane; pinned: boolean; onBack: () => void; onPin: () => void }) {
	const a = agentOf(job, lane);
	const st = stateOf(lane);
	const b = brick(a.color);
	const live = job.source === "live";
	const terminal = st === "merged" || st === "rejected";
	const [busy, setBusy] = useState<"" | "pause" | "resume" | "stop" | "note">("");
	const [err, setErr] = useState("");
	const [confirm, setConfirm] = useState(false);
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState<Pending[]>([]);
	const chatRef = useRef<HTMLTextAreaElement>(null);
	const threadRef = useRef<HTMLDivElement>(null);
	const tokenLive = !!lane.tokenExpiresAt && !terminal;
	const now = useNow(tokenLive);
	const left = (lane.tokenEndsAt ?? (lane.tokenExpiresAt ? new Date(lane.tokenExpiresAt).getTime() : 0)) - now;
	const v = inspectorOf(lane);

	useEffect(() => {
		setErr("");
		setConfirm(false);
		setDraft("");
		setPending([]);
	}, [lane.id]);

	const humanSeen = lane.notes.filter((n) => n.kind === "note" && n.from === "human").map((n) => n.text);
	const thread = useMemo(() => {
		const seen = [...humanSeen];
		const extra = pending.filter((p) => {
			const i = seen.indexOf(p.text);
			if (i >= 0) {
				seen.splice(i, 1);
				return false;
			}
			return true;
		});
		return { notes: lane.notes, extra };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lane.notes, pending]);
	useEffect(() => {
		threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
	}, [thread.notes.length, thread.extra.length]);

	const fail = (e: unknown, what: string) => {
		if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setErr("The demo key was rejected. Add it in Post a job, then try again.");
		else setErr(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
	};
	const control = (action: "pause" | "resume" | "stop") => {
		setErr("");
		setBusy(action);
		setConfirm(false);
		controlContract(job.jobId, lane.id, action)
			.catch((e) => fail(e, action[0].toUpperCase() + action.slice(1)))
			.finally(() => setBusy(""));
	};
	const send = () => {
		const text = draft.trim();
		if (!text || !live || terminal) return;
		setErr("");
		setBusy("note");
		const p = { id: Date.now(), text };
		setPending((x) => [...x, p]);
		setDraft("");
		noteContract(job.jobId, lane.id, text)
			.catch((e) => {
				setPending((x) => x.filter((y) => y.id !== p.id));
				setDraft(text);
				fail(e, "Sending the note");
			})
			.finally(() => setBusy(""));
	};

	const can = (c: "pause" | "resume" | "stop") => live && !terminal && !busy && (c === "pause" ? !lane.paused : c === "resume" ? !!lane.paused : true);
	const done = lane.tasks.filter((t) => t.done).length;
	const hold = lane.status === "forking" || lane.status === "offered";
	const crewName = lane.crewId ? job.crews[lane.crewId]?.name : undefined;
	const commits: { sha: string; title: string; kind: string }[] = [
		...lane.tasks.filter((t) => t.done).map((t) => ({ sha: t.sha ?? "", title: t.title, kind: "task" })),
		...(lane.delivered && lane.sha ? [{ sha: lane.sha, title: "Delivered to the merge", kind: "deliver" }] : []),
		...(lane.mergeSha ? [{ sha: lane.mergeSha, title: `Merged into ${lane.mergedInto ? (job.crews[lane.mergedInto]?.name ?? lane.mergedInto) + " crew line" : "main"}`, kind: "merge" }] : []),
	];

	return (
		<section className="fv" data-state={st} aria-label={`${a.name}, focus view`} style={{ ["--c" as string]: b.fill }}>
			<header className="fv-h">
				<button type="button" className="fv-back" onClick={onBack}>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					Back to the grid
				</button>
				<Avatar seed={a.glyph} color={a.color} size={40} label={a.name} />
				<div className="fv-who">
					<h2>{a.name}</h2>
					<p className="clip">
						<span className="mono">{a.handle}</span> · {lane.role ?? a.role ?? "agent"}
						{crewName ? ` · ${crewName} crew` : ""} · {lane.title}
					</p>
				</div>
				<span className="fv-st" data-state={st}>
					<Glyph state={st} size={18} />
					{lane.stopped ? "Stopped" : STATE_LABEL[st]}
				</span>
				{lane.wage > 0 && <span className="chip mono num fv-chip">{usdc(lane.wage)} USDC</span>}
				{lane.fork && (
					<span className={`chip fv-chip token ${tokenLive ? "" : "dead"}`} title="The write token is the contract: it expires when the contract ends.">
						<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
							<rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" />
							<path d={tokenLive ? "M4 5.5V4a2 2 0 0 1 4 0v1.5" : "M4 5.5V4a2 2 0 0 1 3.8-.9"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
						</svg>
						<span className="mono num">{tokenLive ? `${clock(left)} left` : "key revoked"}</span>
					</span>
				)}
				<button type="button" className="fv-pin" aria-pressed={pinned} onClick={onPin}>
					{pinned ? "Pinned" : "Pin"}
				</button>
			</header>

			<div className="fv-ctl" role="group" aria-label={`Controls for ${a.name}`}>
				{(
					[
						["pause", "Pause", "M4 2.5h2.4v9H4zM7.6 2.5H10v9H7.6z"],
						["resume", "Resume", "M4 2.2v9.6l7.5-4.8z"],
					] as const
				).map(([c, label, d]) => (
					<span key={c} title={live ? (c === "pause" ? "Pauses after the agent's current commit" : "Lets the agent carry on") : LIVE_ONLY}>
						<button type="button" className="fv-btn" disabled={!can(c)} aria-disabled={!can(c)} onClick={() => control(c)} data-busy={busy === c || undefined}>
							<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
								<path d={d} fill="currentColor" />
							</svg>
							{label}
						</button>
					</span>
				))}
				<span title={live ? "Stops the contract after the current commit: not merged, not paid, key revoked" : LIVE_ONLY}>
					<button type="button" className={`fv-btn stop ${confirm ? "arm" : ""}`} disabled={!can("stop")} aria-disabled={!can("stop")} onClick={() => (confirm ? control("stop") : setConfirm(true))} onBlur={() => setConfirm(false)}>
						<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
							<rect x="3" y="3" width="8" height="8" rx="1.4" fill="currentColor" />
						</svg>
						{confirm ? "Confirm stop" : "Stop"}
					</button>
				</span>
				<span title={live ? "Send this agent a note" : LIVE_ONLY}>
					<button type="button" className="fv-btn" disabled={!live || terminal} aria-disabled={!live || terminal} onClick={() => chatRef.current?.focus()}>
						<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
							<path d="M2 3.2A1.2 1.2 0 0 1 3.2 2h7.6A1.2 1.2 0 0 1 12 3.2v5.1a1.2 1.2 0 0 1-1.2 1.2H6.6L4 12V9.5h-.8A1.2 1.2 0 0 1 2 8.3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
						</svg>
						Chat
					</button>
				</span>
				{!live && <span className="fv-hint">{LIVE_ONLY}: this is a {job.source === "replay" ? "recorded replay" : "scripted demo"}.</span>}
				{lane.paused && !terminal && <span className="fv-hint warn">Paused. It stops after its current commit.</span>}
				{err && (
					<span className="fv-hint bad" role="alert">
						{err}
					</span>
				)}
			</div>

			<div className="fv-body">
				<div className="fv-col">
					<div className="fv-card">
						<h3>
							Tasks <span className="num">{done}/{lane.tasks.length || 0}</span>
						</h3>
						{lane.tasks.length === 0 ? (
							<p className="fv-dim">{lane.brief || "No task list yet."}</p>
						) : (
							<ul className="fv-tasks">
								{lane.tasks.map((t) => (
									<li key={t.id} className={t.done ? "done" : hold ? "wait" : ""}>
										<svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true">
											<rect x="1" y="1" width="12" height="12" rx="3" fill={t.done ? "var(--c)" : "none"} stroke={t.done ? "var(--c)" : "var(--cc-line-2)"} strokeWidth="1.4" />
											{t.done && <path d="M4 7.2l2 2L10 5" stroke="#0b1220" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
										</svg>
										<span>{t.title}</span>
										<span className="sr-only">{t.done ? "committed" : "not yet"}</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="fv-card">
						<h3>
							Commits <span className="num">{commits.length}</span>
						</h3>
						{commits.length === 0 ? (
							<p className="fv-dim">Nothing committed on this fork yet.</p>
						) : (
							<ul className="fv-commits">
								{commits.map((c, i) => (
									<li key={i} data-kind={c.kind}>
										<code className="mono">{sha7(c.sha) || "-------"}</code>
										<span className="clip">{c.title}</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="fv-card">
						<h3>Inspector</h3>
						{v ? (
							<div className={`fv-insp ${v.score >= 3 ? "ok" : "bad"}`}>
								<span className="pips" aria-label={`Inspector ${v.score} out of 5`}>
									{[1, 2, 3, 4, 5].map((n) => (
										<i key={n} className={n <= v.score ? "on" : ""} />
									))}
								</span>
								<p>
									<strong className="num">{v.score}/5.</strong> {v.notes}
								</p>
							</div>
						) : (
							<p className="fv-dim">{job.mode === "scale" ? "Scale runs skip the Inspector: scripted agents, git layer only." : "Not reviewed yet. The Inspector scores each delivery before it merges."}</p>
						)}
					</div>
				</div>

				<div className="fv-col wide">
					<div className="fv-codewrap">
						<CodeWindow lane={lane} color={b.fill} />
					</div>
					<div className="fv-card chat">
						<h3>
							Chat <span className="fv-dim">{currentTask(lane)}</span>
						</h3>
						<div className="fv-thread" ref={threadRef} role="log" aria-live="polite" aria-label={`Conversation with ${a.name}`}>
							{thread.notes.length === 0 && thread.extra.length === 0 && <p className="fv-dim">{live ? "Say what you want changed. The agent reads it with its next batch of work and acknowledges here." : "Notes and controls you send on a live run appear here."}</p>}
							{thread.notes.map((n) => (
								<p key={n.key} className={`msg ${n.kind === "control" ? "sys" : n.from === "human" ? "me" : "ag"}`}>
									{n.kind === "note" && <b>{n.from === "human" ? "You" : a.name}</b>}
									{n.text}
								</p>
							))}
							{thread.extra.map((p) => (
								<p key={p.id} className="msg me sending">
									<b>You</b>
									{p.text}
								</p>
							))}
						</div>
						<form
							className="fv-send"
							onSubmit={(e) => {
								e.preventDefault();
								send();
							}}
						>
							<textarea
								ref={chatRef}
								rows={1}
								maxLength={500}
								value={draft}
								disabled={!live || terminal}
								placeholder={live ? (terminal ? "This contract is closed." : `Tell ${a.name} what to change`) : LIVE_ONLY}
								aria-label={`Note to ${a.name}`}
								title={live ? undefined : LIVE_ONLY}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										send();
									}
								}}
							/>
							<button type="submit" className="fv-btn go" disabled={!live || terminal || !draft.trim() || busy === "note"} title={live ? undefined : LIVE_ONLY}>
								Send
							</button>
						</form>
					</div>
				</div>
			</div>
		</section>
	);
}
