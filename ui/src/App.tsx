import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Agent } from "./types";
import { useSession } from "./engine/session";
import { Header, type Stage } from "./components/Header";
import type { ReplayKind } from "./engine/session";
import { Hall } from "./components/Hall";
import { Plan } from "./components/Plan";
import { CommandCenter } from "./command/CommandCenter";
import { Repo } from "./components/repo/Repo";
import { Gadgets, GadgetModal, type Offer } from "./components/Gadgets";
import { AgentDrawer } from "./components/AgentDrawer";
import { TermsDrawer } from "./components/TermsKey";
import { FilmModal } from "./components/FilmModal";
import { PostJob } from "./components/PostJob";
import { Docs } from "./components/Docs";
import { Lend, loadListed } from "./components/Lend";
import { genAgents } from "./lib/agents";
import { listings, type GadgetListing } from "./data/gadgets";
import { useRoute } from "./lib/route";

function stageOf(status?: string, mode?: string): Stage {
	if (!status) return "hall";
	if (mode === "scale") return "floor"; // scripted scale runs have no plan gate, review or sign-off: straight to the command center
	if (status === "planning" || status === "awaiting_budget") return "plan";
	if (["awaiting_signoff", "paying", "closed"].includes(status)) return "signoff";
	return "floor";
}

export function App() {
	const s = useSession();
	const [route, go] = useRoute();
	const [away, setAway] = useState(false); // the person navigated off a running job; it keeps playing in the background
	const [postOpen, setPostOpen] = useState(false);
	const [termsOpen, setTermsOpen] = useState(false);
	const [filmOpen, setFilmOpen] = useState(false);
	const [listed, setListed] = useState(loadListed);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [pick, setPick] = useState<{ l: GadgetListing; o: Offer } | null>(null);

	const stage = stageOf(s.job?.status, s.job?.mode);
	const inJob = !!s.job && !away;
	const screen: "plan" | "floor" | "page" = !inJob ? "page" : stage === "plan" ? "plan" : "floor";
	const jobId = s.job?.jobId;

	useEffect(() => {
		if (jobId) {
			setAway(false);
			setPostOpen(false);
		}
	}, [jobId]);

	const pool = useMemo(() => (s.hall ? [...s.hall.agents, ...listed, ...genAgents(1200)] : []), [s.hall, listed]);
	const gadgetItems = useMemo(() => (s.hall ? listings(s.hall.agents, pool.slice(s.hall.agents.length)) : []), [s.hall, pool]);

	const nav = (p: "repo" | "hall" | "lend" | "gadgets" | "docs") => {
		if (s.job) setAway(true);
		go(p === "repo" ? "overview" : p);
	};
	const watch = (which: ReplayKind = "crew") => {
		setPostOpen(false);
		s.watchReplay(which);
	};
	// The Command center and Review rail items return to the open run. `forkyard:view` tells the command center which of its views to show.
	const openRun = (view?: "review") => {
		setAway(false);
		if (view) setTimeout(() => window.dispatchEvent(new CustomEvent("forkyard:view", { detail: view })), 60);
	};

	return (
		<>
			<a className="sr-only" href="#main">Skip to content</a>
			<Header
				page={route.page}
				onJobScreen={inJob}
				job={s.job ? { status: s.job.status, source: s.job.source, reviewReady: !!s.job.reviewReady } : null}
				source={s.job?.source ?? s.source}
				fellBack={s.fellBack}
				connected={s.connected}
				paymentsMode={s.hall?.paymentsMode}
				onNav={nav}
				onCommand={() => openRun()}
				onReview={() => openRun("review")}
				onTerms={() => setTermsOpen(true)}
				onFilm={() => setFilmOpen(true)}
			/>
			<div id="main" className="screen">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div key={screen === "page" ? `page-${route.page}` : screen} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
						{screen === "page" &&
							(s.hall ? (
								<>
									{route.page === "repo" && <Repo hall={s.hall} source={s.source} tab={route.tab} onPost={() => setPostOpen(true)} onWatch={watch} watching={s.busy === "replay"} onFilm={() => setFilmOpen(true)} onAgent={setAgent} />}
									{route.page === "hall" && <Hall hall={s.hall} pool={pool} source={s.source} onOpenAgent={setAgent} onPost={() => setPostOpen(true)} />}
									{route.page === "lend" && <Lend listed={listed} onPublish={setListed} onHall={() => go("hall")} />}
									{route.page === "gadgets" && <Gadgets items={gadgetItems} onAction={(l, o) => setPick({ l, o })} onAgent={setAgent} />}
									{route.page === "docs" && <Docs onFilm={() => setFilmOpen(true)} onPost={() => setPostOpen(true)} />}
								</>
							) : (
								<main className="wrap boot" aria-live="polite">
									<p>Opening the repo…</p>
								</main>
							))}
						{screen === "plan" && s.job && <Plan job={s.job} busy={s.busy === "budget"} error={s.error} needsKey={s.needsKey} onApprove={s.approveBudget} onBack={s.reset} />}
						{screen === "floor" && s.job && <CommandCenter job={s.job} busy={s.busy === "signoff"} error={s.error} needsKey={s.needsKey} review={s.review} playback={s.playback} onSignoff={s.signoff} onReset={s.reset} onToggle={s.togglePause} onSpeed={s.setSpeed} onStep={s.step} />}
					</motion.div>
				</AnimatePresence>
			</div>

			<PostJob open={postOpen} onClose={() => setPostOpen(false)} source={s.source} busy={s.busy === "start"} error={s.error} needsKey={s.needsKey} onStart={s.start} onWatch={() => watch("crew")} watching={s.busy === "replay"} />
			<TermsDrawer open={termsOpen} onClose={() => setTermsOpen(false)} />
			<FilmModal open={filmOpen} onClose={() => setFilmOpen(false)} />
			<AgentDrawer
				agent={agent}
				onClose={() => setAgent(null)}
				onGadget={(l, o) => {
					setAgent(null);
					setPick({ l, o });
				}}
				onHire={() => {
					setAgent(null);
					setPostOpen(true);
				}}
			/>
			<GadgetModal pick={pick} onClose={() => setPick(null)} />
		</>
	);
}
