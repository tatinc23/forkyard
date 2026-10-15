import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { JobState, Lane } from "../engine/state";
import { Avatar } from "./Avatar";
import { Delta, Ticker } from "./Ticker";
import { flyCoins } from "../lib/coins";
import { brick } from "../lib/color";
import { shortHash, usdc } from "../lib/format";

export function Signoff({ job, busy, error, needsKey, onSignoff, onReset }: { job: JobState; busy: boolean; error: string; needsKey: boolean; onSignoff: () => void; onReset: () => void }) {
	const reduce = !!useReducedMotion();
	const root = useRef<HTMLElement>(null);
	const treasury = useRef<HTMLDivElement>(null);
	const flown = useRef(new Set<string>());
	const lanes = job.order.map((id) => job.lanes[id]).filter(Boolean);
	const total = lanes.reduce((s, l) => s + l.wage, 0);
	const paid = job.payouts.reduce((s, p) => s + p.amount, 0);
	const awaiting = job.status === "awaiting_signoff";
	const paying = job.status === "paying";
	const closed = job.status === "closed";
	const added = lanes.reduce((s, l) => s + (l.changes?.added ?? 0), 0);
	const removed = lanes.reduce((s, l) => s + (l.changes?.removed ?? 0), 0);
	const resultHref = job.resultHref ?? `/preview/${job.jobId}/`;

	// Bring the panel into view once the "line clear" has played.
	useEffect(() => {
		if (!awaiting) return;
		const t = setTimeout(() => root.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), reduce ? 0 : 1700);
		return () => clearTimeout(t);
	}, [awaiting, reduce]);

	// Coins from the escrow to the agent's row, once per payout.
	useEffect(() => {
		for (const p of job.payouts) {
			if (flown.current.has(p.contractId)) continue;
			flown.current.add(p.contractId);
			const dst = root.current?.querySelector(`[data-pay-row="${p.contractId}"] .avatar`);
			const agent = job.agents[p.agentId];
			if (!dst || !treasury.current || !agent) continue;
			const rowEl = dst.closest("[data-pay-row]");
			flyCoins(treasury.current, dst, brick(agent.color).fill, reduce, () => {
				rowEl?.classList.add("got-paid");
				setTimeout(() => rowEl?.classList.remove("got-paid"), 1100);
			});
		}
	}, [job.payouts, job.agents, reduce]);

	const standings = Object.values(job.agents)
		.filter((a) => a.provider !== "house" && (job.repHistory[a.id]?.length ?? 1) >= 1)
		.sort((a, b) => b.reputation - a.reputation);
	const moved = (id: string) => {
		const h = job.repHistory[id];
		return h && h.length > 1 ? { from: h[0], to: h[h.length - 1] } : null;
	};

	return (
		<section ref={root} className="signoff" aria-labelledby="signoff-title">
			<div className="wrap so-head">
				<h2 id="signoff-title">{awaiting ? "Review the work, then sign off." : paying ? "Paying the crew." : closed ? "Job closed. Everyone is paid." : "Sign-off"}</h2>
				<p className="so-sub">{awaiting ? "Every delivery is merged into main. Approve to pay each agent for what actually merged." : paying ? "Each wage moves from escrow to the agent that earned it." : "Receipts below. The mainline app is live."}</p>
			</div>
			<div className="wrap so-grid">
				<div className="so-main">
					<ul className="so-rows">
						{lanes.map((l) => (
							<Row key={l.id} lane={l} job={job} />
						))}
					</ul>
				</div>

				<aside className="so-side">
					<div className="escrow" ref={treasury} data-coin-src>
						<span className="escrow-l">Escrow</span>
						<div className="escrow-n">
							<Ticker value={Math.max(0, job.budget - paid)} decimals={2} ms={700} /> <small>USDC</small>
						</div>
						<dl>
							<div>
								<dt>Wages</dt>
								<dd className="num">{usdc(total)}</dd>
							</div>
							<div>
								<dt>Paid</dt>
								<dd className="num">{usdc(paid)}</dd>
							</div>
							<div>
								<dt>Unspent</dt>
								<dd className="num">{usdc(Math.max(0, job.budget - total))}</dd>
							</div>
							<div>
								<dt>Changes</dt>
								<dd className="num">
									<span className="add">+{added}</span> <span className="del">−{removed}</span>
								</dd>
							</div>
						</dl>
					</div>

					{awaiting && (
						<div className="so-cta">
							<button className="btn orange big" onClick={onSignoff} disabled={busy}>
								{busy ? (
									<>
										<span className="bars" aria-hidden="true">
											<i />
											<i />
											<i />
										</span>
										Signing off
									</>
								) : (
									"Approve merge & pay"
								)}
							</button>
							<p className="hint">Pays {usdc(total)} USDC on Base Sepolia (test network) to {lanes.length} agents.</p>
						</div>
					)}
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					{needsKey && <p className="hint">The demo key was rejected. Set it on the Hall form and try again.</p>}
					{closed && (
						<div className="so-cta">
							<a className="btn orange big" href={resultHref} target="_blank" rel="noreferrer">
								Open the result
							</a>
							{job.source === "mock" && <p className="hint">This page is the demo job's output, rebuilt locally from the scripted deliveries.</p>}
							<button className="btn ghost" onClick={onReset}>
								Post another job
							</button>
						</div>
					)}

					{job.payouts.length > 0 && (
						<div className="standings">
							<h3>Hall standings</h3>
							<ol>
								{standings.map((a, i) => {
									const m = moved(a.id);
									return (
										<motion.li key={a.id} layout transition={{ type: "spring", stiffness: 260, damping: 28 }}>
											<span className="rank num">{i + 1}</span>
											<Avatar seed={a.glyph} color={a.color} size={26} />
											<strong>{a.name}</strong>
											<span className="rep num">
												<Ticker value={a.reputation} ms={1000} />
											</span>
											{m && <Delta from={m.from} to={m.to} />}
										</motion.li>
									);
								})}
							</ol>
						</div>
					)}
				</aside>
			</div>
		</section>
	);
}

function Row({ lane, job }: { lane: Lane; job: JobState }) {
	const agent = job.agents[lane.agentId];
	const p = lane.payout;
	const ch = lane.changes;
	// A conflict re-delivery clears the live verdict; the last Inspector score still stands for the receipt.
	const verdict = lane.review ?? lane.lastReview;
	return (
		<li className="so-row" data-pay-row={lane.id}>
			<div className="so-who">
				{agent && <Avatar seed={agent.glyph} color={agent.color} size={44} label={agent.name} />}
				<div>
					<strong>{lane.title}</strong>
					<span>
						{agent?.name} · {usdc(lane.wage)} USDC
					</span>
				</div>
			</div>
			<div className="so-diff">
				{ch ? (
					ch.files.map((f) => (
						<div key={f.path} className="df">
							<span className="mono path">{f.path}</span>
							<span className={`chip kind ${f.kind}`}>{f.kind}</span>
							<span className="add num">+{f.added}</span>
							<span className="del num">−{f.removed}</span>
							<span className="dbar" aria-hidden="true">
								<i style={{ flexGrow: f.added || 0.1 }} className="a" />
								<i style={{ flexGrow: f.removed || 0.1 }} className="r" />
							</span>
						</div>
					))
				) : (
					<span className="so-none">No change summary</span>
				)}
			</div>
			<div className="so-review">
				{verdict ? (
					<>
						<span className="pips" aria-label={`Review ${verdict.score} out of 5`}>
							{[1, 2, 3, 4, 5].map((n) => (
								<i key={n} className={n <= verdict.score ? "on" : ""} />
							))}
						</span>
						<span className="score num">
							{verdict.score}/5{lane.rejections > 0 ? `, redone ${lane.rejections}×` : ""}
						</span>
					</>
				) : (
					<span className="so-none">Not reviewed</span>
				)}
			</div>
			<AnimatePresence>
				{p && (
					<motion.div className="receipt" initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: reduceDelay(), type: "spring", stiffness: 260, damping: 22 }}>
						<strong className="num">{usdc(p.amount)} USDC</strong>
						<span className="chip mono">{p.network}</span>
						{p.txHash ? (
							<a className="tx mono" href={`https://sepolia.basescan.org/tx/${p.txHash}`} target="_blank" rel="noreferrer">
								{shortHash(p.txHash)}
							</a>
						) : (
							<span className="chip warn">simulated</span>
						)}
						{p.mode === "x402" && !p.txHash && <span className="chip">tx pending</span>}
					</motion.div>
				)}
			</AnimatePresence>
		</li>
	);
}

const reduceDelay = () => 1.1;
