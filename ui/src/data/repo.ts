import type { Contract, JobView } from "../types";

export const REPO = {
	owner: "ballast",
	name: "type-site",
	description: "Ballast Type Co., a fictional type foundry site: hand-built, then extended by hired agent crews. Every change lands as a contract.",
	topics: ["type-foundry", "static-site", "agents", "cloudflare"],
	site: "ballast.example",
	stars: 128,
	watchers: 14,
	hires: 11,
};

export const MOCK_JOB_ID = "demo0001";

type Human = { sha: string; message: string; at: number; trailers?: string[] };
const DAY = 86_400_000;
/** Commits made by people before any agent was hired. The seed of the repo is human work. */
export function humanCommits(now = Date.now()): Human[] {
	return [
		{ sha: "9d3e0b1", message: "Hand-built foundry site: wordmark hero, specimen cards, footer", at: now - 9 * DAY, trailers: ["Signed-off-by: Ballast Type Co."] },
		{ sha: "41ab7c2", message: "Add the foundry marks and favicon set", at: now - 8 * DAY - 3 * 3600_000 },
		{ sha: "b82e1f0", message: "Write the first README", at: now - 8 * DAY - 9 * 3600_000 },
	];
}

export const FILES: { name: string; kind: "file" | "dir"; paths: string[]; fallback: string; lang?: string }[] = [
	{ name: "assets", kind: "dir", paths: [], fallback: "Add the foundry marks and favicon set" },
	{ name: "src", kind: "dir", paths: ["src/mosaic.js"], fallback: "Add the 100-slot mosaic" },
	{ name: ".forkyard", kind: "dir", paths: [], fallback: "Repo settings: lease rules, review bar, merge tree" },
	{ name: "app.js", kind: "file", paths: ["app.js", "src/mosaic.js"], fallback: "Hand-built foundry site: wordmark hero, specimen cards, footer", lang: "JavaScript" },
	{ name: "index.html", kind: "file", paths: ["index.html"], fallback: "Hand-built foundry site: wordmark hero, specimen cards, footer", lang: "HTML" },
	{ name: "styles.css", kind: "file", paths: ["styles.css"], fallback: "Hand-built foundry site: wordmark hero, specimen cards, footer", lang: "CSS" },
	{ name: "README.md", kind: "file", paths: ["README.md"], fallback: "Write the first README" },
];

export const LANGS = [
	{ name: "HTML", pct: 46, color: "#E34F26" },
	{ name: "CSS", pct: 31, color: "#7C5CFF" },
	{ name: "JavaScript", pct: 23, color: "#EAB308" },
];

const base = (id: string, agentId: string, title: string, brief: string, paths: string[], wage: number, role: string, score: number, notes: string, added: number, removed: number, attempts = 1): Contract => ({
	id,
	agentId,
	title,
	brief,
	paths,
	wage,
	status: "paid",
	attempts,
	role,
	review: { score, notes },
	changes: { files: paths.map((p) => ({ path: p, kind: "modified" as const, added: Math.ceil(added / paths.length), removed: Math.floor(removed / paths.length) })), added, removed },
	tasks: [],
	fork: { name: `job-${id.split("-")[0]}--${agentId}`, remote: "" },
});

/** Older closed jobs shown in demo mode (and padded under a real one) so the repo has a history worth reading. */
export function mockJobs(now = Date.now()): JobView[] {
	const mk = (id: string, goal: string, daysAgo: number, cs: Contract[]): JobView => ({
		id,
		goal,
		budget: 3,
		status: "closed",
		contracts: cs,
		mainline: cs.map((c, i) => ({ sha: (Math.abs(hash(c.id)) % 0xfffffff).toString(16).padStart(7, "0") + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5", message: `Merge ${c.title} by @${c.agentId}`, contractId: c.id, at: now - daysAgo * DAY + i * 3_600_000 })),
		createdAt: now - daysAgo * DAY,
		totalCost: cs.reduce((s, c) => s + c.wage, 0),
	});
	return [
		mk(MOCK_JOB_ID, "Add dark mode, typeface search and a licence cart counter, and write the README.", 2, [
			base(`${MOCK_JOB_ID}-c1`, "vanta", "Dark mode with a theme toggle", "Add light and dark tokens and a header toggle.", ["styles.css", "index.html"], 0.46, "Front-end", 5, "Tokens are consistent and the toggle sets aria-pressed.", 34, 1),
			base(`${MOCK_JOB_ID}-c2`, "sift", "Typeface search with an empty state", "Filter specimen cards as the visitor types.", ["app.js", "index.html"], 0.44, "Data UX", 4, "Empty state and Esc handled.", 26, 0, 2),
			base(`${MOCK_JOB_ID}-c3`, "ledger", "Licence cart counter in the header", "Count licences added to the cart.", ["app.js", "index.html"], 0.39, "Logic", 4, "Counter survives reloads.", 22, 0),
			base(`${MOCK_JOB_ID}-c4`, "quill", "Write the README", "Document how to run the site.", ["README.md"], 0.22, "Docs", 4, "Clear run steps and an accurate file map.", 18, 0),
		]),
		mk("demo0002", "Make the site accessible: skip link, focus styles, landmarks.", 5, [
			base("demo0002-c1", "a11y", "Skip link and landmarks", "Add a skip link and ARIA landmarks.", ["index.html"], 0.29, "Accessibility", 5, "All landmarks present; skip link visible on focus.", 12, 2),
			base("demo0002-c2", "rivet", "Security headers and CSP", "Add a CSP meta and security headers file.", ["index.html", "_headers"], 0.33, "Platform", 4, "CSP is strict and the page still works.", 9, 0),
		]),
		mk("demo0003", "Add a motion pass to the hero and specimen cards.", 7, [
			base("demo0003-c1", "pixel", "Hero parallax and card easing", "Add reduced-motion-safe parallax.", ["styles.css", "app.js"], 0.41, "Motion", 5, "Smooth, and prefers-reduced-motion is honoured.", 48, 6),
		]),
	];
}

function hash(s: string) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
	return h;
}
