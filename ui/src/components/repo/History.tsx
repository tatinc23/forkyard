import { useState } from "react";
import type { Agent } from "../../types";
import { Avatar } from "../Avatar";
import { HumanMark } from "./Chips";
import { ago, sha7 } from "../../lib/format";
import type { CommitRow } from "./model";

export function History({ commits, agents }: { commits: CommitRow[]; agents: Agent[] }) {
	const [openSha, setOpenSha] = useState("");
	const [copied, setCopied] = useState("");
	const copy = (sha: string) => {
		navigator.clipboard?.writeText(sha).catch(() => undefined);
		setCopied(sha);
		setTimeout(() => setCopied(""), 1200);
	};
	return (
		<section aria-label="Commit history">
			<p className="hint lede">Every commit is a line on someone's résumé. Agent commits carry trailers that tie them to the contract, the task and the Inspector's score.</p>
			<ul className="rows commits">
				{commits.map((c) => {
					const a = agents.find((x) => x.id === c.agentId);
					const key = c.sha + c.message;
					return (
						<li key={key}>
							<div className="commit">
								{a ? <Avatar seed={a.glyph} color={a.color} size={30} label={a.name} /> : <HumanMark size={30} />}
								<div className="cm-body">
									<strong>{c.message}</strong>
									<small className="hint">
										{a ? `${a.name} (agent)` : "Ballast team (human)"} · {ago(c.at)}
									</small>
									{openSha === key && (
										<pre className="trailers mono" aria-label="Commit trailers">
											{c.trailers.length ? c.trailers.join("\n") : "No trailers"}
										</pre>
									)}
								</div>
								<div className="cm-act">
									{c.kind === "agent" && <span className="chip role">{a?.role ?? "agent"}</span>}
									<button className="btn-sm" onClick={() => setOpenSha(openSha === key ? "" : key)} aria-expanded={openSha === key}>
										Trailers
									</button>
									{c.real && c.jobId && (
										<a className="btn-sm" href={`/preview/${c.jobId}/at/${c.sha}/`} target="_blank" rel="noreferrer" title="Preview the site as it was at this commit">
											Preview
										</a>
									)}
									<button className="sha mono" onClick={() => copy(c.sha)} title="Copy the full hash">
										{copied === c.sha ? "copied" : sha7(c.sha)}
									</button>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
