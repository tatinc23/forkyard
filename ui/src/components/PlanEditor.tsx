import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Agent } from "../types";
import { CONTRACTOR } from "../types";
import type { JobState } from "../engine/state";
import { Avatar } from "./Avatar";
import { TierMark } from "./Tier";
import { brick } from "../lib/color";
import { usdc } from "../lib/format";
import {
	LIMITS,
	applyFix,
	candidates,
	critique,
	draftFromJob,
	greeting,
	hireable,
	isEdited,
	newContract,
	nextKey,
	safeLease,
	toPayload,
	totalWage,
	validate,
	wageOf,
	type DraftContract,
	type Issue,
	type PlanEdit,
} from "../lib/planEdit";
import "../styles/planedit.css";

const DROP = { type: "spring", stiffness: 260, damping: 22, mass: 0.9 } as const;
type Bubble = { key: string; text: string };

/** Reveals text word by word, once per id, like the Foreman talking. */
function Speak({ id, text, spoken }: { id: string; text: string; spoken: React.RefObject<Set<string>> }) {
	const reduce = !!useReducedMotion();
	const words = useMemo(() => text.split(" "), [text]);
	const done = reduce || spoken.current.has(id + text);
	const [n, setN] = useState(done ? words.length : 0);
	useEffect(() => {
		if (n >= words.length) {
			spoken.current.add(id + text);
			return;
		}
		const t = setTimeout(() => setN((v) => v + 1), 24);
		return () => clearTimeout(t);
	}, [n, words.length, id, text, spoken]);
	return (
		<>
			{words.slice(0, n).join(" ")}
			{n < words.length && <span className="pe-caret" aria-hidden="true" />}
			{n < words.length && <span className="pe-sr">{text}</span>}
		</>
	);
}

function repLine(a: Agent) {
	return `rep ${a.reputation}${a.stats.contracts ? `, ${a.stats.merged} of ${a.stats.contracts} merged` : ", new to the Hall"}`;
}

function AgentRow({ a, current, takenBy, onPick }: { a: Agent; current: boolean; takenBy?: string; onPick: () => void }) {
	return (
		<li>
			<button className={"pe-opt" + (current ? " on" : "")} disabled={!!takenBy && !current} onClick={onPick} aria-pressed={current}>
				<Avatar seed={a.glyph} color={a.color} size={34} />
				<span className="pe-opt-t">
					<strong>
						{a.name} <TierMark tier={a.tier} size={14} />
					</strong>
					<span>{a.edge ?? a.specialty}</span>
					<span className="pe-opt-m">{takenBy && !current ? `Already on ${takenBy}` : repLine(a)}</span>
				</span>
				<span className="pe-opt-w num">
					<strong>{usdc(a.rate)}</strong>
					<small>USDC</small>
				</span>
			</button>
		</li>
	);
}

export function PlanEditor({ job, busy, error, needsKey, onApprove, onBack }: { job: JobState; busy: boolean; error: string; needsKey: boolean; onApprove: (plan?: PlanEdit) => void; onBack: () => void }) {
	const reduce = !!useReducedMotion();
	const agents = job.agents;
	const ctx = useMemo(() => ({ agents, budget: job.budget }), [agents, job.budget]);
	const [original] = useState(() => draftFromJob(job));
	const [draft, setDraft] = useState<DraftContract[]>(original);
	const readOnly = job.source === "replay";
	const ready = job.status === "awaiting_budget";
	const hall = useMemo(() => hireable(agents), [agents]);
	const roles = useMemo(() => [...new Set(hall.map((a) => a.role).filter((r): r is string => !!r))], [hall]);

	const spoken = useRef(new Set<string>());
	const [log, setLog] = useState<Bubble[]>(() => [{ key: "hello", text: greeting(original, { agents, budget: job.budget }) }]);
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	const [picker, setPicker] = useState<string | null>(null);
	const [notes, setNotes] = useState<Set<string>>(new Set());
	const [leaseDraft, setLeaseDraft] = useState<Record<string, string>>({});
	const [leaseErr, setLeaseErr] = useState<Record<string, string>>({});
	const [add, setAdd] = useState<{ role: string; agentId: string }>({ role: "", agentId: "" });
	const logEnd = useRef<HTMLUListElement>(null);

	const total = totalWage(draft, agents);
	const over = total > job.budget + 1e-9;
	const edited = isEdited(draft, original);
	const issues = useMemo(() => critique(draft, ctx).filter((i) => !dismissed.has(i.id)), [draft, ctx, dismissed]);
	const blocking = useMemo(() => [...validate(draft), ...issues.filter((i) => i.id.startsWith("dup:")).map((i) => i.text)], [draft, issues]);
	const name = (id: string) => agents[id]?.name ?? id;
	const scale = Math.max(job.budget, total);

	const say = (text: string) => setLog((l) => [...l.slice(-5), { key: nextKey("b"), text }]);
	const commit = (next: DraftContract[], text?: string) => {
		setDraft(next);
		if (text) say(text);
	};

	// keep the newest Foreman line in view inside the panel
	useEffect(() => {
		const el = logEnd.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [log.length]);

	const swapText = (d: DraftContract, to: Agent, next: DraftContract[]) => {
		const from = agents[d.agentId];
		const delta = Math.round((to.rate - (from?.rate ?? 0)) * 100) / 100;
		const nt = totalWage(next, agents);
		let t = `${to.name} takes over "${d.title}" from ${from?.name ?? "the first pick"}. Wage ${delta >= 0 ? "+" : "-"}${usdc(Math.abs(delta))}, total ${usdc(nt)} of ${usdc(job.budget)} USDC.`;
		if (from && to.reputation < from.reputation - 60) t += ` ${to.name}'s reputation is ${to.reputation}, ${from.name}'s was ${from.reputation}.`;
		else if (from && to.reputation > from.reputation + 60) t += ` Stronger record: ${to.reputation} against ${from.reputation}.`;
		if (to.tier && to.tier !== "standard" && to.edge) t += ` Edge: ${to.edge}`;
		return t;
	};

	const swapAgent = (key: string, agentId: string) => {
		const d = draft.find((x) => x.key === key);
		const to = agents[agentId];
		if (!d || !to || d.agentId === agentId) return setPicker(null);
		const next = draft.map((x) => (x.key === key ? { ...x, agentId, role: to.role ?? x.role } : x));
		commit(next, swapText(d, to, next));
		setPicker(null);
	};
	const removeContract = (key: string) => {
		const d = draft.find((x) => x.key === key);
		if (!d) return;
		const next = draft.filter((x) => x.key !== key);
		commit(next, `Dropped "${d.title}". ${name(d.agentId)} is off the job and ${usdc(wageOf(d, agents))} USDC stays in your budget. ${next.length === 0 ? "A job needs at least one contract." : ""}`.trim());
	};
	const setRole = (key: string, role: string) => {
		const d = draft.find((x) => x.key === key);
		if (!d || d.role === role) return;
		const best = candidates(ctx, role, draft, key)[0];
		const next = draft.map((x) => (x.key === key ? { ...x, role, agentId: best?.id ?? x.agentId } : x));
		commit(next, best ? `Changed this contract to ${role} and put ${best.name} on it, the strongest free ${role} agent (${usdc(best.rate)} USDC).` : `Changed this contract to ${role}, but every ${role} agent already has a contract. Pick one by hand or drop one of the others.`);
	};
	const patchContract = (key: string, f: (d: DraftContract) => DraftContract) => setDraft((ds) => ds.map((d) => (d.key === key ? f(d) : d)));
	const addTask = (key: string) => {
		const d = draft.find((x) => x.key === key);
		if (!d || d.tasks.length >= LIMITS.tasks) return;
		patchContract(key, (c) => ({ ...c, tasks: [...c.tasks, { key: nextKey("t"), title: "", detail: "" }] }));
		say(`Added a task to ${name(d.agentId)}'s contract. Each task becomes one commit on their fork, so keep it small and testable.`);
	};
	const removeTask = (key: string, tk: string) => {
		const d = draft.find((x) => x.key === key);
		const t = d?.tasks.find((x) => x.key === tk);
		patchContract(key, (c) => ({ ...c, tasks: c.tasks.filter((x) => x.key !== tk) }));
		if (d && t) say(`Removed "${t.title || "an empty task"}" from ${name(d.agentId)}'s list.${d.tasks.length === 1 ? " That leaves no tasks, so add one or remove the contract." : ""}`);
	};
	const moveTask = (key: string, tk: string, dir: -1 | 1) =>
		patchContract(key, (c) => {
			const i = c.tasks.findIndex((x) => x.key === tk);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= c.tasks.length) return c;
			const t = [...c.tasks];
			[t[i], t[j]] = [t[j], t[i]];
			return { ...c, tasks: t };
		});
	const addLease = (key: string) => {
		const raw = leaseDraft[key] ?? "";
		const v = safeLease(raw);
		const d = draft.find((x) => x.key === key);
		if (!d) return;
		if (!v) return setLeaseErr((e) => ({ ...e, [key]: "Use a relative path like styles/hero.css: no spaces, no leading slash, no .." }));
		if (d.leases.includes(v)) return setLeaseErr((e) => ({ ...e, [key]: `${v} is already leased here.` }));
		if (d.leases.length >= LIMITS.leases) return setLeaseErr((e) => ({ ...e, [key]: `At most ${LIMITS.leases} files per contract.` }));
		setLeaseErr((e) => ({ ...e, [key]: "" }));
		setLeaseDraft((m) => ({ ...m, [key]: "" }));
		const others = draft.filter((x) => x.key !== key && x.leases.includes(v));
		commit(draft.map((x) => (x.key === key ? { ...x, leases: [...x.leases, v] } : x)), others.length ? undefined : `${name(d.agentId)} may now edit ${v}. Nobody else holds it, so no merge conflict there.`);
	};
	const removeLease = (key: string, p: string) => {
		const d = draft.find((x) => x.key === key);
		patchContract(key, (c) => ({ ...c, leases: c.leases.filter((x) => x !== p) }));
		if (d) say(`${name(d.agentId)} can no longer edit ${p}. If their tasks need it, the write will be refused.`);
	};
	const addContract = () => {
		const role = add.role || roles[0];
		const a = agents[add.agentId] ?? candidates(ctx, role, draft)[0];
		if (!role || !a || draft.length >= LIMITS.contracts) return;
		const c = newContract(role, a.id);
		commit([...draft, c], `Added ${a.name} as ${role} for ${usdc(a.rate)} USDC. Give the new contract real tasks and the files it needs, then I will check it against the others.`);
		setAdd({ role: "", agentId: "" });
	};
	const fix = (i: Issue) => {
		if (!i.fix) return;
		const next = applyFix(draft, i.fix.fix, ctx);
		const f = i.fix.fix;
		const tail = `Total is ${usdc(totalWage(next, agents))} of ${usdc(job.budget)} USDC.`;
		if (f.kind === "swap") {
			const d = draft.find((x) => x.key === f.contractKey);
			const to = agents[f.agentId];
			return commit(next, d && to ? swapText(d, to, next) : tail);
		}
		const text =
			f.kind === "assign-lease"
				? `${f.path} now belongs to ${name(draft.find((x) => x.key === f.ownerKey)?.agentId ?? "")} alone, so that merge cannot conflict. ${tail}`
				: f.kind === "add-qa"
					? `${name(f.agentId)} is on the job as QA, with a starter task and tests/ leased. Edit the task to say what to test. ${tail}`
					: `Removed that contract. ${tail}`;
		commit(next, text);
	};

	const addRole = add.role || roles[0] || "";
	const addPool = hall.filter((a) => a.role === addRole);
	const takenBy = (agentId: string, exceptKey?: string) => draft.find((d) => d.agentId === agentId && d.key !== exceptKey)?.title;

	const approve = () => onApprove(edited && !readOnly ? toPayload(draft) : undefined);

	return (
		<main className="wrap plan pe">
			<div className="plan-head">
				<div className="foreman-tag">
					<Avatar seed={7} color={CONTRACTOR.color} size={44} label="Foreman" />
					<div>
						<strong>{CONTRACTOR.name}</strong>
						<span className="mono">{CONTRACTOR.handle}</span>
					</div>
				</div>
				<h1>Here is the plan for your goal.</h1>
				<p className="goal">“{job.goal}”</p>
				<p className="summary">{job.plan!.summary}</p>
				{readOnly ? (
					<p className="pe-mode" role="note">This is a replay, so the plan is read-only. Editing works on live runs.</p>
				) : job.source === "mock" ? (
					<p className="pe-mode" role="note">Offline demo: you can edit and see the Foreman react, but the recorded run continues with the original crew.</p>
				) : (
					<p className="pe-mode ok" role="note">The plan is yours to change. Swap agents, rewrite tasks, move files between contracts. Nothing starts until you approve.</p>
				)}
			</div>

			<div className="pe-grid">
				<div className="pe-main">
					<ul className="cards pe-cards">
						<AnimatePresence initial={false} mode="popLayout">
							{draft.map((d, i) => {
								const a = agents[d.agentId];
								const pool = hall.filter((x) => x.role === d.role);
								const shared = (p: string) => draft.filter((x) => x.key !== d.key && x.leases.includes(p));
								return (
									<motion.li
										key={d.key}
										layout={!reduce}
										className="card pe-card"
										initial={{ opacity: 0, y: -42, scale: 0.97 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
										transition={{ ...DROP, delay: original.some((o) => o.key === d.key) && !edited && i < original.length ? 0.2 + i * 0.12 : 0 }}
										style={{ ["--c" as string]: brick(a?.color ?? "#94A3B8").fill }}
									>
										<div className="card-top">
											{a && <Avatar seed={a.glyph} color={a.color} size={44} />}
											<div className="card-who">
												<strong>
													{a?.name ?? d.agentId} {a && <TierMark tier={a.tier} size={15} />}
												</strong>
												<span>{a ? `${a.role ?? "Generalist"}, ${repLine(a)}` : ""}</span>
											</div>
											<div className="wage num">
												<strong>{usdc(wageOf(d, agents))}</strong>
												<small>USDC</small>
											</div>
										</div>
										<h3>{d.title}</h3>
										{d.brief && <p className="pe-brief">{d.brief}</p>}

										{!readOnly && (
											<div className="pe-bar">
												<label className="pe-role">
													<span>Role</span>
													<select value={d.role} onChange={(e) => setRole(d.key, e.target.value)}>
														{[...new Set([d.role, ...roles])].map((r) => (
															<option key={r}>{r}</option>
														))}
													</select>
												</label>
												<button className="btn ghost sm" aria-expanded={picker === d.key} onClick={() => setPicker((p) => (p === d.key ? null : d.key))}>
													{picker === d.key ? "Close the list" : "Change agent"}
												</button>
												<button className="btn ghost sm danger" onClick={() => removeContract(d.key)} aria-label={`Remove ${d.title}`}>
													Remove contract
												</button>
											</div>
										)}

										<AnimatePresence initial={false}>
											{picker === d.key && !readOnly && (
												<motion.div key="picker" className="pe-picker" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
													<p className="pe-picker-h">{d.role} agents in the Hall, strongest first. Each agent can hold one contract per job.</p>
													<ul>
														{pool.length === 0 && <li className="pe-empty">No {d.role} agents are available.</li>}
														{[...pool].sort((x, y) => y.reputation - x.reputation).map((x) => (
															<AgentRow key={x.id} a={x} current={x.id === d.agentId} takenBy={takenBy(x.id, d.key)} onPick={() => swapAgent(d.key, x.id)} />
														))}
													</ul>
												</motion.div>
											)}
										</AnimatePresence>

										<div className="pe-sec">
											<h4>Tasks <small>{d.tasks.length} of {LIMITS.tasks}, one commit each</small></h4>
											<ol className="pe-tasks">
												{d.tasks.map((t, ti) => (
													<li key={t.key}>
														{readOnly ? (
															<span className="pe-task-ro">{t.title}</span>
														) : (
															<>
																<input
																	value={t.title}
																	maxLength={LIMITS.title}
																	placeholder="Describe one small change"
																	aria-label={`Task ${ti + 1} for ${a?.name ?? d.agentId}`}
																	onChange={(e) => patchContract(d.key, (c) => ({ ...c, tasks: c.tasks.map((x) => (x.key === t.key ? { ...x, title: e.target.value } : x)) }))}
																/>
																<span className="pe-task-btns">
																	<button className="pe-ic" onClick={() => moveTask(d.key, t.key, -1)} disabled={ti === 0} aria-label="Move task up">&uarr;</button>
																	<button className="pe-ic" onClick={() => moveTask(d.key, t.key, 1)} disabled={ti === d.tasks.length - 1} aria-label="Move task down">&darr;</button>
																	<button className="pe-ic" onClick={() => setNotes((s) => { const n = new Set(s); if (n.has(t.key)) n.delete(t.key); else n.add(t.key); return n; })} aria-expanded={notes.has(t.key) || !!t.detail} aria-label="Add a note to this task">Note</button>
																	<button className="pe-ic danger" onClick={() => removeTask(d.key, t.key)} aria-label="Remove task">&times;</button>
																</span>
																{(notes.has(t.key) || t.detail) && (
																	<textarea
																		value={t.detail}
																		maxLength={LIMITS.detail}
																		placeholder="Optional detail for the agent: acceptance criteria, constraints"
																		aria-label="Task note"
																		rows={2}
																		onChange={(e) => patchContract(d.key, (c) => ({ ...c, tasks: c.tasks.map((x) => (x.key === t.key ? { ...x, detail: e.target.value } : x)) }))}
																	/>
																)}
															</>
														)}
													</li>
												))}
											</ol>
											{!readOnly && d.tasks.length < LIMITS.tasks && (
												<button className="pe-link" onClick={() => addTask(d.key)}>
													Add a task
												</button>
											)}
										</div>

										<div className="pe-sec">
											<h4>Files this agent may edit <small>lease</small></h4>
											<ul className="paths pe-leases" aria-label="Leased files">
												{d.leases.length === 0 && <li className="pe-empty">No files leased.</li>}
												{d.leases.map((p) => {
													const o = shared(p);
													return (
														<li key={p} className={o.length ? "shared" : ""}>
															<span className="pe-chip">
																<span className="mono">{p}</span>
																{!readOnly && (
																	<button className="pe-x" onClick={() => removeLease(d.key, p)} aria-label={`Remove ${p} from the lease`}>&times;</button>
																)}
															</span>
															{o.length > 0 && <em>also leased by {o.map((x) => name(x.agentId)).join(" and ")}</em>}
														</li>
													);
												})}
											</ul>
											{!readOnly && (
												<div className="pe-lease-add">
													<input
														className="mono"
														value={leaseDraft[d.key] ?? ""}
														placeholder="styles/hero.css"
														aria-label="Lease another file"
														onChange={(e) => setLeaseDraft((m) => ({ ...m, [d.key]: e.target.value }))}
														onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLease(d.key))}
													/>
													<button className="btn ghost sm" onClick={() => addLease(d.key)}>Lease file</button>
													{leaseErr[d.key] && <span className="pe-err" role="alert">{leaseErr[d.key]}</span>}
												</div>
											)}
										</div>
									</motion.li>
								);
							})}
						</AnimatePresence>
					</ul>

					{!readOnly && draft.length < LIMITS.contracts && (
						<section className="pe-add" aria-label="Add a contract">
							<h3>Add a contract</h3>
							<div className="pe-add-row">
								<label>
									<span>Role</span>
									<select value={addRole} onChange={(e) => setAdd({ role: e.target.value, agentId: "" })}>
										{roles.map((r) => (
											<option key={r}>{r}</option>
										))}
									</select>
								</label>
								<label>
									<span>Agent</span>
									<select value={add.agentId} onChange={(e) => setAdd((s) => ({ ...s, agentId: e.target.value }))}>
										<option value="">Best available</option>
										{addPool.map((a) => (
											<option key={a.id} value={a.id} disabled={!!takenBy(a.id)}>
												{a.name}, {usdc(a.rate)} USDC, rep {a.reputation}
												{takenBy(a.id) ? " (already hired)" : ""}
											</option>
										))}
									</select>
								</label>
								<button className="btn ghost" onClick={addContract} disabled={!addPool.some((a) => !takenBy(a.id))}>
									Add contract
								</button>
							</div>
						</section>
					)}
				</div>

				<aside className="pe-foreman" aria-label="Foreman copilot">
					<header>
						<Avatar seed={7} color={CONTRACTOR.color} size={36} label="Foreman" />
						<div>
							<strong>Foreman</strong>
							<span>Checks every edit as you make it</span>
						</div>
					</header>
					<ul className="pe-log" ref={logEnd} aria-live="polite">
						{log.map((b) => (
							<motion.li key={b.key} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
								<Speak id={b.key} text={b.text} spoken={spoken} />
							</motion.li>
						))}
					</ul>
					<div className="pe-issues" aria-label="Open issues">
						<AnimatePresence initial={false}>
							{issues.map((i) => (
								<motion.div key={i.id} layout={!reduce} className={`pe-issue ${i.level}`} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.25 }} role={i.level === "error" ? "alert" : undefined}>
									<p>
										<Speak id={i.id} text={i.text} spoken={spoken} />
									</p>
									<div className="pe-issue-btns">
										{i.fix && !readOnly && (
											<button className="btn orange sm" onClick={() => fix(i)}>
												{i.fix.label}
											</button>
										)}
										{i.level === "warn" && !readOnly && (
											<button className="pe-link" onClick={() => setDismissed((s) => new Set(s).add(i.id))}>
												Keep it as is
											</button>
										)}
									</div>
								</motion.div>
							))}
						</AnimatePresence>
						{issues.length === 0 && <p className="pe-clear">{edited ? "No problems I can see in this plan." : "Nothing to flag. Edit anything and I will check it."}</p>}
					</div>
				</aside>
			</div>

			<motion.section className="budget" aria-label="Budget" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
				<div className="budget-top">
					<div>
						<span className="big num">{usdc(total)}</span> <span className="of">of {usdc(job.budget)} USDC budget</span>
					</div>
					<span className={`chip ${over ? "bad" : "ok"}`}>{over ? `Over budget by ${usdc(total - job.budget)}` : `${usdc(job.budget - total)} left unspent`}</span>
				</div>
				<div className="meter" role="img" aria-label={`Wages total ${usdc(total)} of ${usdc(job.budget)} USDC`}>
					{draft.map((d) => (
						<i key={d.key} title={`${name(d.agentId)} ${usdc(wageOf(d, agents))}`} style={{ width: `${(wageOf(d, agents) / (scale || 1)) * 100}%`, background: brick(agents[d.agentId]?.color ?? "#94A3B8").fill, transition: "width 300ms var(--ease-out)" }} />
					))}
				</div>
				<ul className="legend">
					{draft.map((d) => (
						<li key={d.key}>
							<i style={{ background: brick(agents[d.agentId]?.color ?? "#94A3B8").fill }} />
							{name(d.agentId)} <span className="num mono">{usdc(wageOf(d, agents))}</span>
						</li>
					))}
				</ul>
				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}
				{needsKey && <p className="hint">Add the demo key in Post a job, then come back and try again.</p>}
				{blocking.length > 0 && !readOnly && <p className="hint" role="status">Before you can approve: {blocking[0]}{blocking.length > 1 ? ` (and ${blocking.length - 1} more)` : ""}</p>}
				<div className="budget-actions">
					<button className="btn ghost" onClick={onBack}>
						Back to the repo
					</button>
					<button className="btn orange big" onClick={approve} disabled={over || busy || !ready || (!readOnly && blocking.length > 0)}>
						{busy ? (
							<>
								<span className="bars" aria-hidden="true">
									<i />
									<i />
									<i />
								</span>
								Approving
							</>
						) : edited && !readOnly ? (
							"Approve edited plan"
						) : (
							"Approve budget"
						)}
					</button>
				</div>
				{over && <p className="hint">The wages exceed your budget. Take the Foreman's swap above, pick cheaper agents, drop a contract, or go back and post the job with a higher budget.</p>}
			</motion.section>
		</main>
	);
}
