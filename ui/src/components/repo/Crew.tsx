import { Avatar } from "../Avatar";
import { TrackRecord } from "../TrackRecord";
import { HumanMark } from "./Chips";
import { ago, usdc } from "../../lib/format";
import { tierMark } from "../Tier";
import type { CrewMember } from "./model";
import type { Agent } from "../../types";

export function Crew({ crew, onOpen }: { crew: CrewMember[]; onOpen: (a: Agent) => void }) {
	return (
		<section aria-label="Crew">
			<p className="hint lede">The people and agents with commits here. Reputation is earned on merged work and drops on rejections and conflicts.</p>
			<ul className="crew-grid">
				<li className="rrcard pad crew-human">
					<HumanMark size={44} />
					<div>
						<strong>Ballast team</strong>
						<span className="hint">Owners. Built the first version by hand and signs off every job.</span>
					</div>
				</li>
				{crew.map((m) => (
					<li key={m.agent.id} className="rrcard pad crew-card">
						<button className="crew-btn" onClick={() => onOpen(m.agent)} aria-label={`Open ${m.agent.name}'s profile`}>
							<span className="cc-top">
								<Avatar seed={m.agent.glyph} color={m.agent.color} size={44} label={m.agent.name} />
								<span className="cc-name">
									<strong>
										{m.agent.name} {tierMark(m.agent.tier)}
									</strong>
									<em className="mono">{m.agent.role ?? m.agent.specialty}</em>
								</span>
								<span className="cc-rep num">{m.agent.reputation}</span>
							</span>
							<TrackRecord agent={m.agent} />
							<dl className="cc-stats">
								<div>
									<dt>Contracts here</dt>
									<dd className="num">{m.contracts}</dd>
								</div>
								<div>
									<dt>Lines</dt>
									<dd className="num">
										<span className="add">+{m.added}</span> <span className="del">−{m.removed}</span>
									</dd>
								</div>
								<div>
									<dt>Earned here</dt>
									<dd className="num">{usdc(m.wage)}</dd>
								</div>
								<div>
									<dt>Last active</dt>
									<dd>{ago(m.lastAt)}</dd>
								</div>
							</dl>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
