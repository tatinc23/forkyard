import { useEffect, useState } from "react";
import type { HallView, JobView } from "../types";
import { fetchJob } from "../lib/api";
import { mockJobs, MOCK_JOB_ID } from "./repo";

const cache = new Map<string, JobView>();

export type RepoData = { jobs: JobView[]; latestJobId: string; live: boolean; loading: boolean };

/** Real jobs from the Hall (latest first), padded with older demo jobs so the repo reads like a real project. */
export function useRepoData(hall: HallView | null, source: string): RepoData {
	const [jobs, setJobs] = useState<JobView[]>([]);
	const [loading, setLoading] = useState(true);
	const ids = hall ? pickIds(hall) : [];
	const key = ids.join(",");

	useEffect(() => {
		let dead = false;
		if (source !== "live" || ids.length === 0) {
			setJobs(mockJobs());
			setLoading(false);
			return;
		}
		setLoading(true);
		Promise.allSettled(ids.map((id) => (cache.has(id) ? Promise.resolve(cache.get(id)!) : fetchJob(id).then((j) => (cache.set(id, j), j)))))
			.then((rs) => {
				if (dead) return;
				const real = rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
				setJobs(real.length ? [...real, ...mockJobs().slice(1)] : mockJobs());
			})
			.finally(() => !dead && setLoading(false));
		return () => {
			dead = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, source]);

	const first = jobs[0];
	const live = !!first && first.id !== MOCK_JOB_ID && source === "live";
	return { jobs, latestJobId: live ? first.id : "", live, loading };
}

function pickIds(h: HallView): string[] {
	const closed = h.jobs.filter((j) => j.status === "closed").map((j) => j.id);
	const rest = h.jobs.filter((j) => j.status !== "closed").map((j) => j.id);
	return [...closed, ...rest].slice(0, 3);
}
