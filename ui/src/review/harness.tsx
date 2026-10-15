import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Agent, ReviewView } from "@shared/types";
import { Logo } from "../components/Header";
import { ReviewStage, mockReview } from "./index";
import { MOCK_JOB_ID, mockAgents } from "./mock";

/** Standalone review: ?review=mock (recorded job, offline data) or ?review=<jobId> (real GET /api/jobs/:id/review). */
function Harness({ which }: { which: string }) {
	const mock = which === "mock";
	const jobId = mock ? MOCK_JOB_ID : which;
	const [review, setReview] = useState<ReviewView | null>(null);
	const [agents, setAgents] = useState<Agent[]>(mock ? mockAgents() : []);
	const [log, setLog] = useState("");
	useEffect(() => {
		if (mock) {
			// a short beat so the loading state is real, like the live fetch
			const t = setTimeout(() => setReview(mockReview()), 250);
			return () => clearTimeout(t);
		}
		fetch(`/api/jobs/${jobId}/review`).then((r) => r.json()).then(setReview).catch((e) => setLog(String(e)));
		fetch("/api/hall").then((r) => r.json()).then((h) => setAgents(h.agents)).catch(() => undefined);
	}, [mock, jobId]);
	return (
		<>
			<header className="topbar">
				<div className="wrap topbar-in">
					<span className="brand"><Logo /><span>GadgetHub</span></span>
					<span className="chip mono">review harness &middot; {which}</span>
				</div>
			</header>
			<main className="screen">
				<ReviewStage
					jobId={jobId}
					review={review}
					agents={agents}
					source={mock ? "mock" : "live"}
					onSignoff={async (d) => {
						await new Promise((r) => setTimeout(r, 900));
						setLog(JSON.stringify(d));
						(window as unknown as { __signoff?: unknown }).__signoff = d;
					}}
				/>
				{log && <pre className="wrap mono" style={{ fontSize: 12 }} data-testid="signoff-log">onSignoff({log})</pre>}
			</main>
		</>
	);
}

export function mount(el: HTMLElement) {
	const which = new URLSearchParams(window.location.search).get("review") || "mock";
	createRoot(el).render(<Harness which={which} />);
}
