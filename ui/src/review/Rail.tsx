import { Avatar } from "../components/Avatar";
import type { Chapter } from "@shared/types";
import type { Decision } from "./ChapterView";
import { money, type AgentInfo } from "./helpers";
import { GROUP_LABEL, type Group, type Triage } from "./triage";

const ORDER: Group[] = ["needs", "auto", "rejected"];

export function Rail({ chapters, whoOf, decisions, triage, visited, current, onJump, onDecide, busy, onSignoff, signed }: {
	chapters: Chapter[];
	whoOf: (id?: string) => AgentInfo;
	/** Effective decisions: what will be sent. `undefined` = a flagged chapter nobody has decided yet. */
	decisions: Record<string, Decision | undefined>;
	triage: Record<string, Triage>;
	visited: Set<string>;
	current: string | null;
	onJump: (contractId: string) => void;
	onDecide: (contractId: string, d: Decision) => void;
	busy?: boolean;
	onSignoff: () => void;
	signed: boolean;
}) {
	const approved = chapters.filter((c) => decisions[c.contractId] === "approve");
	const rejected = chapters.filter((c) => decisions[c.contractId] === "reject").length;
	const pending = chapters.filter((c) => !decisions[c.contractId]);
	const total = approved.reduce((n, c) => n + whoOf(c.agentId).rate, 0);
	const unseen = pending.filter((c) => !visited.has(c.contractId));
	return (
		<aside className="rail" id="rv-signoff" aria-label="Sign-off summary">
			<h2 className="rail-h">Your sign-off</h2>
			{ORDER.map((g) => {
				const rows = chapters.filter((c) => triage[c.contractId].group === g);
				if (!rows.length) return null;
				return (
					<div key={g} className={`rail-grp g-${g}`}>
						<h3 className="rail-gh">{GROUP_LABEL[g]} <span className="num">{rows.length}</span></h3>
						<ul className="rail-list">
							{rows.map((c) => {
								const w = whoOf(c.agentId);
								const d = decisions[c.contractId];
								const seen = visited.has(c.contractId);
								const t = triage[c.contractId];
								return (
									<li key={c.contractId} className={(current === c.contractId ? "now " : "") + (d ?? "pending")}>
										<button className="rail-open" onClick={() => onJump(c.contractId)} aria-current={current === c.contractId ? "true" : undefined}>
											<Avatar seed={w.glyph} color={w.color} size={30} />
											<span className="rail-t">
												<b>{w.name}</b>
												<span>{c.title}</span>
											</span>
										</button>
										<div className="rail-state">
											<button className={"chip-d ok" + (d === "approve" ? " on" : "")} aria-pressed={d === "approve"} onClick={() => onDecide(c.contractId, "approve")} aria-label={`Approve ${w.name}'s chapter`}>
												Approve
											</button>
											<button className={"chip-d no" + (d === "reject" ? " on" : "")} aria-pressed={d === "reject"} onClick={() => onDecide(c.contractId, "reject")} aria-label={`Reject ${w.name}'s chapter`}>
												Reject
											</button>
										</div>
										<span className="rail-seen">{g === "needs" ? (d ? (seen ? "Audited" : "Decided") : seen ? "Opened, waiting for your call" : "Not opened yet") : t.reasons[0]}</span>
									</li>
								);
							})}
						</ul>
					</div>
				);
			})}
			<dl className="rail-sum">
				<div><dt>Approved</dt><dd className="num">{approved.length}</dd></div>
				<div><dt>Rejected</dt><dd className="num">{rejected}</dd></div>
				{pending.length > 0 && <div><dt>Waiting on you</dt><dd className="num">{pending.length}</dd></div>}
				<div className="big"><dt>To pay</dt><dd className="num">{money(total)} <small>USDC</small></dd></div>
			</dl>
			{unseen.length > 0 && !signed && <p className="rail-warn" role="note">{unseen.length === 1 ? `${whoOf(unseen[0].agentId).name}'s chapter needs you` : `${unseen.length} chapters need you`} and {unseen.length === 1 ? "has" : "have"} not been opened yet.</p>}
			{rejected > 0 && !signed && <p className="rail-note">Rejected chapters are reverted on main and not paid.</p>}
			<button className="btn go" disabled={busy || signed || chapters.length === 0 || pending.length > 0} onClick={onSignoff}>
				{signed ? "Signed off" : busy ? "Paying the crew…" : pending.length > 0 ? `Decide ${pending.length} flagged ${pending.length === 1 ? "chapter" : "chapters"} first` : rejected > 0 ? `Approve ${approved.length} & pay` : "Approve & pay"}
			</button>
		</aside>
	);
}
