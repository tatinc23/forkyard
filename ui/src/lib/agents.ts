import type { Agent, Gadget } from "../types";
import { ROSTER } from "../types";
import { curatedAgents } from "../data/hallCurated";
import { GADGET_CATALOG, procGadget } from "../data/gadgetCatalog";

/** Old recordings and the pre-v2 backend call the reviewer "Warden". Everything on screen says Inspector. */
export const displayName = (text: string) => text.replace(/\bWarden\b/g, "Inspector").replace(/\bwarden\b/g, "inspector");

const BY_ID = new Map(ROSTER.map((a) => [a.id, a]));

/**
 * The backend may still serve the pre-v2 roster (no tier / provider / gadgets, reviewer called "warden").
 * Fill the v2 fields from the local roster, keep the live reputation and stats, and add anyone the backend lacks.
 */
export function normalizeAgents(list: Agent[]): Agent[] {
	const out = new Map<string, Agent>();
	for (const a of list) {
		const id = a.id === "warden" ? "inspector" : a.id;
		const base = BY_ID.get(id);
		const merged: Agent = base ? { ...base, ...a, id, name: base.id === "inspector" ? "Inspector" : a.name, handle: base.id === "inspector" ? "@inspector" : a.handle } : { ...a, id };
		out.set(id, { ...merged, tier: a.tier ?? base?.tier ?? "standard", provider: a.provider ?? base?.provider ?? "hall", gadgets: a.gadgets ?? base?.gadgets ?? [], role: a.role ?? base?.role, edge: a.edge ?? base?.edge });
	}
	for (const r of ROSTER) if (!out.has(r.id)) out.set(r.id, r);
	return [...out.values()].sort((a, b) => b.reputation - a.reputation);
}

/** Agents that show up as pickable specialists (not house services). */
export const isHouse = (a: Agent) => a.provider === "house";

// ---------- a believable Hall at scale (mock; clearly labelled in the UI) ----------

export const HALL_TOTAL = 142_316;

function rng(seed: number) {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

const PRE = ["Ka", "Zi", "Mo", "Ra", "Te", "Lu", "Ox", "Vi", "No", "Ba", "Qu", "Sy", "Ha", "Ju", "Em", "Fa", "Gri", "Dro", "Ny", "Pe", "Ul", "Wo", "Xa", "Yo"];
const MID = ["ri", "ta", "lo", "ven", "mi", "ka", "zu", "ne", "po", "sa", "do", "ly", "bre", "cha", "fi"];
const SUF = ["x", "n", "on", "ra", "ly", "to", "dex", "ium", "ka", "ben", "ro", "sk", "th", "el"];
const ROLES: { role: string; specialty: string[]; tags: string[] }[] = [
	{ role: "Front-end", specialty: ["Design systems & layout", "React & component libraries", "Responsive CSS", "Landing pages that convert"], tags: ["html", "css", "react"] },
	{ role: "Motion", specialty: ["Canvas & WebGL scenes", "Micro-interactions", "Scroll-driven animation"], tags: ["animation", "webgl"] },
	{ role: "Back-end", specialty: ["Workers & Durable Objects", "REST and RPC APIs", "Queues & cron pipelines"], tags: ["workers", "api", "typescript"] },
	{ role: "QA", specialty: ["Regression hunting", "Playwright suites", "Property-based tests"], tags: ["playwright", "vitest"] },
	{ role: "Platform", specialty: ["CI/CD & deploy config", "Security headers", "Observability setup"], tags: ["ci", "security"] },
	{ role: "Data UX", specialty: ["Search & filtering", "Tables at scale", "Charts that explain"], tags: ["data", "ux"] },
	{ role: "Docs", specialty: ["READMEs & changelogs", "API reference", "Migration guides"], tags: ["docs"] },
	{ role: "Accessibility", specialty: ["WCAG audits & fixes", "Keyboard & screen-reader flows"], tags: ["a11y"] },
	{ role: "Security", specialty: ["Dependency & secrets audit", "Auth flows", "CSP & sandboxing"], tags: ["security", "auth"] },
	{ role: "Mobile", specialty: ["PWA & offline", "Touch interactions", "Capacitor wrappers"], tags: ["pwa", "mobile"] },
	{ role: "ML Ops", specialty: ["Eval harnesses", "Prompt regression tests", "Dataset cleaning"], tags: ["evals", "ml"] },
	{ role: "Generalist", specialty: ["Small fixes across the stack", "Chores and cleanups"], tags: ["generalist"] },
];
const TUNE_VERBS = ["Fine-tuned on", "Custom-trained on", "Adapter-tuned on", "Distilled from a 70B teacher on"];
const CORPORA = [
	"merged PRs in this stack", "Workers runtime errors and their fixes", "accessibility fixes with before/after audits", "production design systems",
	"maintainers' own style guides", "Lighthouse before/after pairs", "shader and motion repos", "Playwright failure traces", "incident post-mortems",
	"database migration diffs", "security advisories and their patches", "React component libraries", "CSS refactors with visual diffs",
	"OpenAPI specs and generated clients", "commit messages reviewers praised",
];
const STEPS = ["plan", "build", "test", "self-review", "visual check", "lint", "security pass", "fix-up", "benchmark"];
const DUOS = ["builder and an adversary that tries to break it", "writer and a reviewer that rejects weak diffs", "planner and a doer that must justify each file touched", "drafter and a fact-checker that reads the preview"];
const FOCI = [
	"for static sites", "on Cloudflare Workers", "for docs sites", "in vanilla JS", "for marketing pages", "in monorepos", "for dashboards", "for small teams",
	"for design-heavy sites", "with zero dependencies", "for legacy codebases", "at the edge", "for storefronts", "for portfolio sites", "for open-source repos",
];

/**
 * A believable Hall: the hand-written entries first (their names, specialties, edges and Gadgets are all distinct),
 * then generated ones. Generation never repeats a name, a specialty, an edge or a Gadget name, so the first screens
 * of the Hall and of Gadgets read as different agents and tools.
 */
export function genAgents(n = 1200): Agent[] {
	const out: Agent[] = curatedAgents().slice(0, n);
	const seen = new Set<string>([...ROSTER, ...out].map((a) => a.name.toLowerCase()));
	const seenSpec = new Set<string>([...ROSTER, ...out].map((a) => a.specialty.toLowerCase()));
	const seenEdge = new Set<string>([...ROSTER, ...out].map((a) => a.edge?.toLowerCase() ?? "").filter(Boolean));
	// a seeded shuffle of the hand-written Gadget list, so generated owners get them in a stable but varied order
	const order = GADGET_CATALOG.map((_, k) => k);
	const gr = rng(777);
	for (let k = order.length - 1; k > 0; k--) {
		const j = Math.floor(gr() * (k + 1));
		[order[k], order[j]] = [order[j], order[k]];
	}
	const owned = new Set<string>([...ROSTER, ...out].flatMap((a) => (a.gadgets ?? []).map((x) => x.name.toLowerCase())));
	let gi = 0;
	const nextGadget = (): [string, string, Gadget["kind"]] => {
		for (;;) {
			const e = gi < order.length ? GADGET_CATALOG[order[gi]] : procGadget(gi - order.length);
			gi++;
			if (!owned.has(e[0].toLowerCase())) {
				owned.add(e[0].toLowerCase());
				return e;
			}
		}
	};
	const unique = (taken: Set<string>, make: () => string) => {
		let s = make();
		for (let t = 0; t < 24 && taken.has(s.toLowerCase()); t++) s = make();
		const base = s;
		let k = 2;
		while (taken.has(s.toLowerCase())) s = `${base} (${k++})`;
		taken.add(s.toLowerCase());
		return s;
	};

	for (let i = 0; out.length < n; i++) {
		const r = rng(i * 7919 + 13);
		const name = pick(r, PRE) + pick(r, MID) + pick(r, SUF);
		const nm = name[0].toUpperCase() + name.slice(1);
		if (seen.has(nm.toLowerCase())) continue;
		seen.add(nm.toLowerCase());
		const role = pick(r, ROLES);
		const roll = r();
		const tier: Agent["tier"] = roll < 0.07 ? "custom" : roll < 0.14 ? "workflow" : "standard";
		const provider: Agent["provider"] = r() < 0.28 ? "byo" : "hall";
		const contracts = Math.floor(r() ** 1.6 * 160);
		const merged = Math.round(contracts * (0.7 + r() * 0.28));
		const avgReview = 3.2 + r() * 1.7;
		const bonus = tier === "custom" ? 70 : tier === "workflow" ? 60 : 0;
		const reputation = Math.min(990, Math.round(300 + Math.min(contracts, 90) * 4.2 + (avgReview - 3.2) * 70 + bonus + r() * 60));
		const rate = Math.round((0.1 + (reputation / 1000) * 0.5 + (tier === "standard" ? 0 : 0.18) + r() * 0.12) * 100) / 100;
		const nG = tier === "standard" ? (r() < 0.2 ? 1 : 0) : 1 + Math.floor(r() * 3);
		const gadgets: Gadget[] = Array.from({ length: nG }, (_, k) => {
			const [gn, gd, gkind] = nextGadget();
			const mode = r();
			return { id: `${nm.toLowerCase()}-g${k}`, name: gn, kind: gkind, description: gd, terms: mode < 0.4 ? { lend: 0.02 + Math.round(r() * 8) / 100 } : mode < 0.7 ? { sell: 0.5 + Math.round(r() * 20) / 10 } : { gift: true }, uses: Math.floor(r() * 2400) };
		});
		const specialty = unique(seenSpec, () => `${pick(r, role.specialty)} ${pick(r, FOCI)}`);
		const edge =
			tier === "custom"
				? unique(seenEdge, () => `${pick(r, TUNE_VERBS)} ${3 + Math.floor(r() * 46)}k ${pick(r, CORPORA)}`)
				: tier === "workflow"
					? unique(seenEdge, () => {
							if (r() < 0.35) return `Two agents: a ${pick(r, DUOS)}`;
							const a = Math.floor(r() * STEPS.length);
							const steps = [STEPS[a], STEPS[(a + 2 + Math.floor(r() * 3)) % STEPS.length], STEPS[(a + 5 + Math.floor(r() * 3)) % STEPS.length]];
							return `3-step pipeline: ${steps.join(", ")} before every commit`;
						})
					: undefined;
		out.push({
			id: `x-${nm.toLowerCase()}-${i}`,
			name: nm,
			handle: `@${nm.toLowerCase()}`,
			specialty,
			tags: role.tags,
			model: "@cf/zai-org/glm-5.3-flash",
			rate,
			wallet: `0x${(i + 100).toString(16).padStart(40, "0")}`,
			reputation,
			stats: { contracts, merged, conflicts: Math.floor(contracts * r() * 0.08), avgReview: Math.round(avgReview * 10) / 10, earned: Math.round(contracts * rate * 100) / 100 },
			glyph: 400 + i,
			color: pick(r, ["#F6821F", "#EC4899", "#7C5CFF", "#14B8A6", "#22C55E", "#0EA5E9", "#EAB308", "#A855F7", "#16A34A", "#E11D48"]),
			provider,
			tier,
			role: role.role,
			edge,
			gadgets,
		});
	}
	return out;
}
