import { useMemo, useState } from "react";
import type { Agent } from "../../types";
import { Avatar } from "../Avatar";
import { Drawer } from "../Overlay";
import { TermsInline } from "../TermsKey";
import { Pips, StatusChip } from "./Chips";
import { ago, usdc } from "../../lib/format";
import { isOpen, shortId, type ContractRow } from "./model";

const SEEN = "forkyardTermsSeen";
const seen = () => {
	try {
		return localStorage.getItem(SEEN) === "1";
	} catch {
		return false;
	}
};

export function Contracts({ rows, agents, onPost }: { rows: ContractRow[]; agents: Agent[]; onPost: () => void }) {
	const [filter, setFilter] = useState<"open" | "closed" | "all">("all");
	const [q, setQ] = useState("");
	const [sel, setSel] = useState<ContractRow | null>(null);
	const [termsSeen, setTermsSeen] = useState(seen);
	const open = rows.filter((r) => isOpen(r.c)).length;
	const closed = rows.length - open;
	const list = useMemo(() => rows.filter((r) => (filter === "all" || (filter === "open") === isOpen(r.c)) && (!q || `${r.c.title} ${r.c.agentId} ${r.job.goal}`.toLowerCase().includes(q.toLowerCase()))), [rows, filter, q]);
	const dismiss = () => {
		setTermsSeen(true);
		try {
			localStorage.setItem(SEEN, "1");
		} catch {
			/* storage blocked: the key just shows again next time */
		}
	};

	return (
		<section aria-label="Contracts">
			<div className="list-bar">
				<div className="seg" role="radiogroup" aria-label="Filter contracts">
					{(
						[
							["all", `All ${rows.length}`],
							["open", `Open ${open}`],
							["closed", `Closed ${closed}`],
						] as const
					).map(([id, label]) => (
						<button key={id} role="radio" aria-checked={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
							{label}
						</button>
					))}
				</div>
				<input className="search" type="search" placeholder="Search contracts" aria-label="Search contracts" value={q} onChange={(e) => setQ(e.target.value)} />
				<button className="btn orange" onClick={onPost}>
					New contract
				</button>
			</div>
			<ul className="rows contracts">
				{list.map((r) => {
					const a = agents.find((x) => x.id === r.c.agentId);
					return (
						<li key={r.c.id}>
							<button className="row-btn" onClick={() => setSel(r)}>
								<StatusChip status={r.c.status} />
								<span className="rtitle">
									<strong>{r.c.title}</strong>
									<small className="hint">
										<span className="mono">#{shortId(r.c.id)}</span> opened by Foreman {ago(r.job.createdAt)} · {r.job.goal}
									</small>
								</span>
								{r.c.role && <span className="chip role">{r.c.role}</span>}
								{r.c.review && <Pips score={r.c.review.score} />}
								<span className="num cwage">{usdc(r.c.wage)} USDC</span>
								{a && <Avatar seed={a.glyph} color={a.color} size={28} label={a.name} />}
							</button>
						</li>
					);
				})}
				{list.length === 0 && <li className="empty pad">No contracts match. Post a job and Foreman will open some.</li>}
			</ul>
			<Drawer open={!!sel} onClose={() => setSel(null)} label="Contract" wide title={sel ? <h2 className="clip">{sel.c.title}</h2> : null}>
				{sel && <ContractDetail row={sel} agent={agents.find((a) => a.id === sel.c.agentId)} showTerms={!termsSeen} onDismissTerms={dismiss} />}
			</Drawer>
		</section>
	);
}

function ContractDetail({ row, agent, showTerms, onDismissTerms }: { row: ContractRow; agent?: Agent; showTerms: boolean; onDismissTerms: () => void }) {
	const { c, job } = row;
	return (
		<div className="cdetail">
			{showTerms && <TermsInline onDismiss={onDismissTerms} />}
			<div className="cd-top">
				<StatusChip status={c.status} />
				<span className="mono hint">#{shortId(c.id)}</span>
				<span className="hint">in job “{job.goal}”</span>
			</div>
			<p className="cd-brief">{c.brief}</p>
			<dl className="kv">
				<div>
					<dt>Hired</dt>
					<dd>
						{agent && <Avatar seed={agent.glyph} color={agent.color} size={22} />} {agent?.name ?? c.agentId} <span className="hint">{agent?.role}</span>
					</dd>
				</div>
				<div>
					<dt>Wage</dt>
					<dd className="num">{usdc(c.wage)} USDC</dd>
				</div>
				<div>
					<dt>File lease</dt>
					<dd className="mono">{c.paths.join(", ")}</dd>
				</div>
				{c.fork && (
					<div>
						<dt>Fork</dt>
						<dd className="mono">{c.fork.name}</dd>
					</div>
				)}
				{c.attempts > 1 && (
					<div>
						<dt>Attempts</dt>
						<dd className="num">{c.attempts}</dd>
					</div>
				)}
			</dl>
			{c.review && (
				<div className={`review-note ${c.review.score >= 3 ? "pass" : "fail"}`}>
					<Pips score={c.review.score} /> <strong>Inspector {c.review.score}/5.</strong> {c.review.notes}
				</div>
			)}
			{c.changes && (
				<div className="cd-files">
					<h3>Changes</h3>
					{c.changes.files.map((f) => (
						<div key={f.path} className="df">
							<span className="mono path">{f.path}</span>
							<span className={`chip kind ${f.kind}`}>{f.kind}</span>
							<span className="add num">+{f.added}</span>
							<span className="del num">−{f.removed}</span>
						</div>
					))}
				</div>
			)}
			{c.payout && (
				<p className="cd-pay">
					Paid {usdc(c.payout.amount)} USDC on {c.payout.network}{" "}
					{c.payout.txHash ? (
						<a className="mono" href={`https://sepolia.basescan.org/tx/${c.payout.txHash}`} target="_blank" rel="noreferrer">
							view transaction
						</a>
					) : (
						<span className="chip warn">simulated</span>
					)}
				</p>
			)}
		</div>
	);
}
