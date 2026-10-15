import { useMemo } from "react";
import type { Agent, HallView } from "../../types";
import { RepoHeader } from "./RepoHeader";
import { Overview } from "./Overview";
import { Contracts } from "./Contracts";
import { History } from "./History";
import { Crew } from "./Crew";
import { Insights } from "./Insights";
import { Hero } from "../hero/Hero";
import { commitRows, contractRows, crewOf } from "./model";
import { useRepoData } from "../../data/repoHooks";
import { hrefFor, type RepoTab } from "../../lib/route";

export function Repo({ hall, source, tab, onPost, onWatch, watching, onFilm, onAgent }: { hall: HallView; source: string; tab: RepoTab; onPost: () => void; onWatch: (which: "crew" | "scale") => void; watching: boolean; onFilm: () => void; onAgent: (a: Agent) => void }) {
	const data = useRepoData(hall, source);
	const rows = useMemo(() => contractRows(data.jobs), [data.jobs]);
	const commits = useMemo(() => commitRows(data.jobs, data.latestJobId), [data.jobs, data.latestJobId]);
	const crew = useMemo(() => crewOf(data.jobs, hall.agents), [data.jobs, hall.agents]);
	const counts = { contracts: rows.length, history: commits.length, crew: crew.length + 1 };

	return (
		<main>
			{tab === "overview" && <Hero onWatch={onWatch} onFilm={onFilm} watching={watching} />}
			<div className="wrap repo">
				<RepoHeader crew={crew.map((c) => c.agent)} tab={tab} counts={counts} onPost={onPost} />
				<div className="repo-body">
					{(tab === "overview" || tab === "code") && <Overview part={tab} jobs={data.jobs} agents={hall.agents} latestJobId={data.latestJobId} onPost={onPost} onWatch={onWatch} onFilm={onFilm} watching={watching} showCrew={crew} />}
					{tab === "contracts" && <Contracts rows={rows} agents={hall.agents} onPost={onPost} />}
					{tab === "history" && <History commits={commits} agents={hall.agents} />}
					{tab === "crew" && <Crew crew={crew} onOpen={onAgent} />}
					{tab === "insights" && <Insights jobs={data.jobs} />}
				</div>
				{data.loading && tab !== "overview" && <p className="hint">Loading the repo's jobs…</p>}
				<p className="footnote">
					Reads from <span className="mono">/api/hall</span> and <span className="mono">/api/jobs/:id</span>. Stars, watchers, Insights charts and older demo jobs are mock. <a href={hrefFor("docs")}>How it works</a>
				</p>
			</div>
		</main>
	);
}
