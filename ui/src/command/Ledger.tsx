import type { JobState } from "../engine/state";
import { Avatar } from "../components/Avatar";
import { Delta, Ticker } from "../components/Ticker";
import { shortHash, usdc } from "../lib/format";
import { agentOf, countersOf, stateOf } from "./derive";

/** Payouts and reputation: what each agent earned from git outcomes. */
export function Ledger({ job, onFocus }: { job: JobState; onFocus: (id: string) => void }) {
	const c = countersOf(job);
	const lanes = job.order.map((id) => job.lanes[id]).filter(Boolean);
	const wages = lanes.reduce((s, l) => s + l.wage, 0);
	const paid = job.payouts.reduce((s, p) => s + p.amount, 0);
	const scale = job.mode === "scale";
	const standings = Object.values(job.agents)
		.filter((a) => a.provider !== "house" && lanes.some((l) => l.agentId === a.id) && a.reputation > 0)
		.sort((a, b) => b.reputation - a.reputation);
	const moved = (id: string) => {
		const h = job.repHistory[id];
		return h && h.length > 1 ? { from: h[0], to: h[h.length - 1] } : null;
	};

	return (
		<div className="lg">
			<div className="lg-main">
				<dl className="lg-stats">
					<div>
						<dt>Budget</dt>
						<dd className="num">{usdc(job.budget)}</dd>
					</div>
					<div>
						<dt>Wages</dt>
						<dd className="num">{usdc(wages)}</dd>
					</div>
					<div>
						<dt>Paid</dt>
						<dd className="num">
							<Ticker value={paid} decimals={2} ms={700} />
						</dd>
					</div>
					<div>
						<dt>Unspent</dt>
						<dd className="num">{usdc(Math.max(0, job.budget - wages))}</dd>
					</div>
					<div>
						<dt>Merged</dt>
						<dd className="num">
							{c.merged}/{c.total}
						</dd>
					</div>
				</dl>

				{scale ? (
					<div className="lg-note">
						<h3>Scripted agents, git layer only</h3>
						<p>This run skips the Inspector, the review and payouts: 100 scripted agents prove the fork, merge-tree and conflict mechanics. Wages and reputation need AI crews, where an agent is paid only if its work merges.</p>
						{job.scaleDone && (
							<dl className="lg-done">
								<div><dt>Agents</dt><dd className="num">{job.scaleDone.agents}</dd></div>
								<div><dt>Forks</dt><dd className="num">{job.scaleDone.forks}</dd></div>
								<div><dt>Commits</dt><dd className="num">{job.scaleDone.commits}</dd></div>
								<div><dt>Conflicts</dt><dd className="num">{job.scaleDone.conflicts}</dd></div>
								<div><dt>Resolved</dt><dd className="num">{job.scaleDone.resolved}</dd></div>
								<div><dt>Elapsed</dt><dd className="num">{(job.scaleDone.ms / 1000).toFixed(1)} s</dd></div>
							</dl>
						)}
					</div>
				) : (
					<ul className="lg-rows">
						{lanes.map((l) => {
							const a = agentOf(job, l);
							const p = l.payout;
							const st = stateOf(l);
							const status = p ? "paid" : l.stopped || l.status === "rejected" ? "unpaid" : st === "merged" ? "owed" : "pending";
							return (
								<li key={l.id} className="lg-row" data-status={status}>
									<Avatar seed={a.glyph} color={a.color} size={30} />
									<button type="button" className="lg-who" onClick={() => onFocus(l.id)}>
										<b>{a.name}</b>
										<span className="clip">{l.title}</span>
									</button>
									<span className="num lg-wage">{usdc(l.wage)}</span>
									<span className="lg-s">
										{status === "paid" && (
											<>
												<b>Paid {usdc(p!.amount)}</b>
												{p!.txHash ? (
													<a className="mono" href={`https://sepolia.basescan.org/tx/${p!.txHash}`} target="_blank" rel="noreferrer">
														{shortHash(p!.txHash)}
													</a>
												) : (
													<span className="chip warn">simulated</span>
												)}
											</>
										)}
										{status === "owed" && <span className="chip">Merged, paid at sign-off</span>}
										{status === "pending" && <span className="chip">Not merged yet</span>}
										{status === "unpaid" && <span className="chip bad">Not merged, not paid</span>}
									</span>
								</li>
							);
						})}
						{lanes.length === 0 && <li className="lg-dim">Contracts appear here once the Foreman has drafted the plan.</li>}
					</ul>
				)}
			</div>

			<aside className="lg-side">
				<h3>Reputation</h3>
				<p className="lg-dim">Built from git outcomes: clean merges, Inspector scores, conflicts caused.</p>
				{standings.length === 0 ? (
					<p className="lg-dim">{scale ? "Scripted agents carry no reputation." : "Standings move when the crew is paid."}</p>
				) : (
					<ol className="lg-rep">
						{standings.map((a, i) => {
							const m = moved(a.id);
							return (
								<li key={a.id}>
									<span className="num lg-rank">{i + 1}</span>
									<Avatar seed={a.glyph} color={a.color} size={26} />
									<strong>{a.name}</strong>
									<span className="num lg-rv">
										<Ticker value={a.reputation} ms={900} />
									</span>
									{m && <Delta from={m.from} to={m.to} />}
								</li>
							);
						})}
					</ol>
				)}
			</aside>
		</div>
	);
}
