import type { Chapter } from "@shared/types";
import { Avatar } from "../components/Avatar";
import type { Decision } from "./ChapterView";
import type { AgentInfo } from "./helpers";
import { GROUP_LABEL, type Group, type Triage as T } from "./triage";

const ORDER: Group[] = ["needs", "auto", "rejected"];
const BLURB: Record<Group, string> = {
	needs: "Low score, a collision, or risky files. Your call.",
	auto: "Inspector scored 4+ and only low-risk files changed.",
	rejected: "The Inspector sent these back. They never merged and are not paid.",
};

/** The three groups first, with counts. One click approves the whole auto group; every chapter stays openable. */
export function TriagePanel({ chapters, triage, whoOf, decisions, current, onOpen, onApproveAuto, autoDone }: {
	chapters: Chapter[];
	triage: Record<string, T>;
	whoOf: (id?: string) => AgentInfo;
	decisions: Record<string, Decision | undefined>;
	current: string | null;
	onOpen: (contractId: string) => void;
	onApproveAuto: () => void;
	/** every auto-approvable chapter was approved explicitly (the button was used) */
	autoDone: boolean;
}) {
	const by: Record<Group, Chapter[]> = { needs: [], auto: [], rejected: [] };
	chapters.forEach((c) => by[triage[c.contractId].group].push(c));
	const pending = by.needs.filter((c) => !decisions[c.contractId]).length;
	const autoOpen = by.auto.length;
	return (
		<section className="tri" aria-label="Review by exception">
			<p className="tri-lead">
				<b>{by.needs.length === 0 ? "Nothing needs you." : `${pending > 0 ? pending : by.needs.length} of ${chapters.length} ${chapters.length === 1 ? "hire needs" : "hires need"} you.`}</b>{" "}
				The Inspector checked every delivery; the rest is sorted so you only read what is consequential.
			</p>
			<div className="tri-cols">
				{ORDER.map((g) => (
					<div key={g} className={`tri-col g-${g}`} role="group" aria-label={`${GROUP_LABEL[g]}, ${by[g].length}`}>
						<h3>
							<span className="tri-n num">{by[g].length}</span> {GROUP_LABEL[g]}
						</h3>
						<p className="tri-blurb">{BLURB[g]}</p>
						{by[g].length > 0 && (
							<ul>
								{by[g].map((c) => {
									const w = whoOf(c.agentId);
									const d = decisions[c.contractId];
									return (
										<li key={c.contractId}>
											<button className={"tri-i" + (current === c.contractId ? " on" : "")} onClick={() => onOpen(c.contractId)} aria-label={`Open ${w.name}'s chapter: ${c.title}`}>
												<Avatar seed={w.glyph} color={w.color} size={26} />
												<span className="tri-t">
													<b>{c.title}</b>
													<span>
														{w.name} &middot; {triage[c.contractId].reasons[0]}
													</span>
												</span>
												{g === "needs" && <em className={"tri-d" + (d ? ` ${d}` : "")}>{d === "approve" ? "Approved" : d === "reject" ? "Rejected" : "Decide"}</em>}
											</button>
										</li>
									);
								})}
							</ul>
						)}
						{g === "auto" && by.auto.length > 0 && (
							<button className="btn go sm" onClick={onApproveAuto} disabled={autoDone} data-testid="approve-auto">
								{autoDone ? `Approved all ${autoOpen}` : `Approve all auto-approvable (${autoOpen})`}
							</button>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
