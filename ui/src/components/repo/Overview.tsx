import { useMemo } from "react";
import type { Agent, JobView } from "../../types";
import { Avatar } from "../Avatar";
import { FILES, LANGS, REPO } from "../../data/repo";
import { mockPreviewHtml } from "../../mock/preview";
import { ago, sha7 } from "../../lib/format";
import { hrefFor } from "../../lib/route";
import type { CrewMember } from "./model";
import { humanCommits } from "../../data/repo";
import { HumanMark } from "./Chips";

export function Overview({ part, jobs, agents, latestJobId, onPost, onWatch, onFilm, watching, showCrew }: { part: "overview" | "code"; jobs: JobView[]; agents: Agent[]; latestJobId: string; onPost: () => void; onWatch: (which: "crew" | "scale") => void; onFilm: () => void; watching: boolean; showCrew: CrewMember[] }) {
	const latest = jobs.find((j) => j.id === latestJobId) ?? jobs[0];
	const head = latest?.mainline[latest.mainline.length - 1];
	const srcDoc = useMemo(() => (latestJobId ? undefined : mockPreviewHtml()), [latestJobId]);
	const human = humanCommits();

	// last commit that touched each file: newest merged contract whose lease includes it, else the seed.
	const lastFor = (paths: string[], fallback: string) => {
		const hit = latest?.mainline
			.filter((m) => m.contractId)
			.reverse()
			.find((m) => paths.some((p) => latest.contracts.find((c) => c.id === m.contractId)?.paths.includes(p)));
		if (hit) {
			const c = latest!.contracts.find((x) => x.id === hit.contractId)!;
			return { msg: hit.message, agent: agents.find((a) => a.id === c.agentId), at: hit.at };
		}
		return { msg: fallback, agent: undefined, at: human[0].at };
	};

	return (
		<div className="repo-grid">
			<div className="rg-main">
				{part === "overview" && (
				<section className="rcard preview" aria-label="Live preview of main">
					<header className="rcard-head">
						<span className="dots" aria-hidden="true">
							<i />
							<i />
							<i />
						</span>
						<span className="urlbar mono">
							{REPO.site}
							<em>/ main{head ? ` @ ${sha7(head.sha)}` : ""}</em>
						</span>
						{latestJobId && (
							<a className="btn-sm" href={`/preview/${latestJobId}/`} target="_blank" rel="noreferrer">
								Open
							</a>
						)}
					</header>
					<div className="frame">
						{latestJobId ? <iframe title="Live preview of the main branch" src={`/preview/${latestJobId}/`} sandbox="allow-scripts" loading="lazy" /> : <iframe title="Demo preview of the main branch" srcDoc={srcDoc} sandbox="allow-scripts" />}
					</div>
					<footer className="rcard-foot">
						<span className="hint">{latestJobId ? "Served straight from the mainline repo in Cloudflare Artifacts, sandboxed." : "Demo data: this is the page the scripted job builds."}</span>
					</footer>
				</section>
				)}

				{part === "code" && (
				<>
				<section className="rcard files" aria-label="Files">
					<header className="rcard-head files-head">
						<span className="lastc">
							{head ? (
								<>
									{(() => {
										const c = latest!.contracts.find((x) => x.id === head.contractId);
										const a = agents.find((x) => x.id === c?.agentId);
										return a ? <Avatar seed={a.glyph} color={a.color} size={22} label={a.name} /> : <HumanMark size={22} />;
									})()}
									<strong className="clip">{head.message}</strong>
								</>
							) : (
								<strong>Latest commit</strong>
							)}
						</span>
						<span className="hint mono">{head ? `${sha7(head.sha)} · ${ago(head.at)}` : ""}</span>
					</header>
					<ul className="tree">
						{FILES.map((f) => {
							const l = lastFor(f.paths, f.fallback);
							return (
								<li key={f.name}>
									<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`ft ${f.kind}`}>
										{f.kind === "dir" ? <path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.3 1.6h6.5a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="currentColor" /> : <path d="M3.5 1.5h5.6l3.4 3.4v9.6h-9zM9 1.8v3.4h3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />}
									</svg>
									<span className="mono fname">{f.name}</span>
									<span className="fmsg clip">
										{l.agent && <Avatar seed={l.agent.glyph} color={l.agent.color} size={16} />} {l.msg}
									</span>
									<span className="fago hint">{ago(l.at)}</span>
								</li>
							);
						})}
					</ul>
				</section>

				<section className="rcard readme" aria-label="README">
					<header className="rcard-head">
						<strong>README.md</strong>
					</header>
					<div className="md">
						<h2>Ballast Type Co.</h2>
						<p>A fictional type foundry site, a demo repo for Forkyard. The first version was built by hand. Everything since arrives as a contract: an agent gets hired, works on its own fork, and its commits merge only if the Inspector and a human both pass them.</p>
						<h3>How work lands here</h3>
						<ol>
							<li>
								<strong>Post a job.</strong> Foreman splits it into contracts and leases each agent the files it may touch.
							</li>
							<li>
								<strong>Agents work in parallel.</strong> Each gets its own fork and a key that expires when the contract does. Every task is its own commit.
							</li>
							<li>
								<strong>Inspect, merge, review.</strong> The Inspector scores each delivery. Crews merge in parallel into crew lines, and crew lines merge into main. You review only what needs a human, as a before and after.
							</li>
							<li>
								<strong>Pay for what shipped.</strong> Approved chapters are paid on Base Sepolia. Rejected ones are reverted and unpaid.
							</li>
						</ol>
						<h3>Run it</h3>
						<pre className="mono">{`npx serve .   # static site, no build step`}</pre>
						<p>
							New to the names? Open the <a href={hrefFor("docs")}>terms key</a> or{" "}
							<button className="linklike" onClick={onFilm}>
								watch the film
							</button>
							.
						</p>
					</div>
				</section>
				</>
				)}
			</div>

			<aside className="rg-side" aria-label="About">
				<section className="rcard pad">
					<h2>About</h2>
					<p>{REPO.description}</p>
					<p className="topics">
						{REPO.topics.map((t) => (
							<span key={t} className="chip topic">
								{t}
							</span>
						))}
					</p>
					<dl className="facts">
						<div>
							<dt>Stars</dt>
							<dd className="num">{REPO.stars}</dd>
						</div>
						<div>
							<dt>Hires</dt>
							<dd className="num">{REPO.hires}</dd>
						</div>
						<div>
							<dt>Contracts</dt>
							<dd className="num">{jobs.reduce((n, j) => n + j.contracts.length, 0)}</dd>
						</div>
					</dl>
					<div className="side-cta">
						<button className="btn orange" onClick={onPost}>
							Post a job
						</button>
						<button className="btn ghost" onClick={() => onWatch("crew")} disabled={watching}>
							{watching ? "Loading" : "Watch a real run"}
						</button>
					</div>
				</section>

				<section className="rcard pad">
					<h2>
						Crew <span className="count num">{showCrew.length}</span>
					</h2>
					<ul className="mini-crew">
						{showCrew.slice(0, 6).map((m) => (
							<li key={m.agent.id}>
								<Avatar seed={m.agent.glyph} color={m.agent.color} size={28} label={m.agent.name} />
								<span>
									<strong>{m.agent.name}</strong>
									<em className="mono">{m.agent.role ?? m.agent.specialty}</em>
								</span>
								<span className="num rep">{m.agent.reputation}</span>
							</li>
						))}
					</ul>
					<a className="more" href={hrefFor("crew")}>
						See the whole crew
					</a>
				</section>

				<section className="rcard pad">
					<h2>Languages</h2>
					<div className="langbar" role="img" aria-label={LANGS.map((l) => `${l.name} ${l.pct}%`).join(", ")}>
						{LANGS.map((l) => (
							<i key={l.name} style={{ width: `${l.pct}%`, background: l.color }} />
						))}
					</div>
					<ul className="langs">
						{LANGS.map((l) => (
							<li key={l.name}>
								<i style={{ background: l.color }} />
								<strong>{l.name}</strong> <span className="num">{l.pct}%</span>
							</li>
						))}
					</ul>
				</section>
			</aside>
		</div>
	);
}

