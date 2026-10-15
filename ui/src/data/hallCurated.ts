import type { Agent, Gadget } from "../types";

/**
 * Hand-written Hall entries that sit right after the real roster, so the first screen of the Hall and of Gadgets
 * has no repeated names, specialties, edges or tools. Like the roster, rates and track records are ILLUSTRATIVE
 * (there is no published standard for agent wages yet); the UI labels the Hall as mock data.
 */
const MODEL = "@cf/zai-org/glm-5.3-flash";
const g = (id: string, name: string, kind: Gadget["kind"], description: string, terms: Gadget["terms"], uses: number): Gadget => ({ id, name, kind, description, terms, uses });

type Row = {
	name: string;
	role: string;
	specialty: string;
	tags: string[];
	tier: NonNullable<Agent["tier"]>;
	provider?: "hall" | "byo";
	rate: number;
	rep: number;
	contracts: number;
	mergedPct: number;
	conflicts: number;
	review: number;
	color: string;
	edge?: string;
	gadgets?: Gadget[];
};

const ROWS: Row[] = [
	{ name: "Kern", role: "Typography", specialty: "Specimens, kerning pairs & optical sizes", tags: ["type", "css", "fonts"], tier: "custom", rate: 0.49, rep: 913, contracts: 37, mergedPct: 95, conflicts: 1, review: 4.5, color: "#F6821F", edge: "Fine-tuned on 6k open-source font specimens; checks every pair at 12, 24 and 96 px", gadgets: [g("pair-lens", "Pair Lens", "tool", "Flags kerning pairs that collide at display sizes", { lend: 0.04, sell: 1.1 }, 442)] },
	{ name: "Marlin", role: "Back-end", specialty: "Durable Objects & WebSocket fan-out", tags: ["workers", "durable-objects"], tier: "custom", rate: 0.54, rep: 921, contracts: 44, mergedPct: 93, conflicts: 2, review: 4.5, color: "#7C5CFF", edge: "Trained on Durable Object migration diffs and alarm patterns", gadgets: [g("alarm-clock", "Alarm Clock", "workflow", "Splits long jobs across alarms so none hits the CPU limit", { sell: 2.8 }, 167)] },
	{ name: "Halyard", role: "Platform", specialty: "Wrangler config, preview deploys & caching", tags: ["wrangler", "ci", "cache"], tier: "workflow", rate: 0.44, rep: 872, contracts: 33, mergedPct: 94, conflicts: 1, review: 4.4, color: "#14B8A6", edge: "4-step loop: deploy a preview, curl it, diff the headers, roll back on any 5xx", gadgets: [g("header-diff", "Header Diff", "tool", "Compares response headers between two deploys", { gift: true }, 903)] },
	{ name: "Bellwether", role: "QA", specialty: "Visual regression against live previews", tags: ["playwright", "visual"], tier: "workflow", rate: 0.41, rep: 858, contracts: 41, mergedPct: 92, conflicts: 2, review: 4.3, color: "#0EA5E9", edge: "Screenshots every breakpoint, diffs against main, files only real regressions", gadgets: [g("breakpoint-sweep", "Breakpoint Sweep", "workflow", "Captures a page at 9 widths and stitches a contact sheet", { lend: 0.03, sell: 0.8 }, 612)] },
	{ name: "Lumen", role: "Accessibility", specialty: "Contrast audits & focus order", tags: ["a11y", "wcag"], tier: "custom", rate: 0.38, rep: 884, contracts: 52, mergedPct: 96, conflicts: 1, review: 4.5, color: "#16A34A", edge: "Tuned on 20k WCAG failure reports and the diffs that fixed them", gadgets: [g("contrast-ledger", "Contrast Ledger", "dataset", "Every colour pair on a page with its measured ratio", { lend: 0.02, gift: true }, 1380)] },
	{ name: "Sable", role: "Security", specialty: "CSP, SRI & sandboxed iframes", tags: ["csp", "security"], tier: "workflow", rate: 0.47, rep: 846, contracts: 29, mergedPct: 93, conflicts: 1, review: 4.4, color: "#E11D48", edge: "A red agent attacks the preview in a sandbox, a blue agent patches what it finds", gadgets: [g("sandbox-poke", "Sandbox Poke", "tool", "Probes an iframe sandbox for escapes and reports the flags", { lend: 0.06 }, 214)] },
	{ name: "Fathom", role: "ML Ops", specialty: "Prompt regression suites & eval dashboards", tags: ["evals", "ml"], tier: "custom", rate: 0.51, rep: 897, contracts: 26, mergedPct: 92, conflicts: 1, review: 4.4, color: "#A855F7", edge: "Distilled from a 70B teacher on 14k graded agent transcripts", gadgets: [g("golden-set", "Golden Set", "dataset", "300 graded prompts with expected outputs for regression runs", { sell: 3.4 }, 133)] },
	{ name: "Anvil", role: "Back-end", specialty: "Zod schemas, OpenAPI & contract tests", tags: ["zod", "openapi"], tier: "workflow", rate: 0.43, rep: 835, contracts: 35, mergedPct: 91, conflicts: 2, review: 4.2, color: "#EC4899", edge: "Writes the schema, the handler and a failing test first, then makes it pass" },
	{ name: "Cinder", role: "Performance", specialty: "Bundle diets & font loading", tags: ["lighthouse", "fonts"], tier: "custom", rate: 0.46, rep: 868, contracts: 31, mergedPct: 94, conflicts: 1, review: 4.4, color: "#F59E0B", edge: "Distilled from 9k Lighthouse before-and-after pairs", gadgets: [g("weight-watcher", "Weight Watcher", "tool", "Budgets every request and names the three heaviest assets", { lend: 0.03, sell: 0.7 }, 756)] },
	{ name: "Lantern", role: "Accessibility", specialty: "Screen-reader walkthroughs", tags: ["a11y", "aria"], tier: "workflow", rate: 0.4, rep: 829, contracts: 24, mergedPct: 92, conflicts: 1, review: 4.3, color: "#22C55E", edge: "Drives the page with a screen-reader emulator and writes down what it hears" },
	{ name: "Glaze", role: "Motion", specialty: "View transitions & page-load sequences", tags: ["view-transitions", "css"], tier: "custom", rate: 0.42, rep: 851, contracts: 28, mergedPct: 93, conflicts: 2, review: 4.3, color: "#EC4899", edge: "Trained on 11k load sequences scored for jank and reduced-motion safety", gadgets: [g("frame-budget", "Frame Budget", "tool", "Records a transition and flags frames over 16 ms", { gift: true }, 508)] },
	{ name: "Plinth", role: "Design systems", specialty: "Tokens, spacing scales & dark themes", tags: ["tokens", "css"], tier: "standard", rate: 0.37, rep: 812, contracts: 34, mergedPct: 91, conflicts: 2, review: 4.2, color: "#0EA5E9", gadgets: [g("scale-smith", "Scale Smith", "tool", "Builds a modular type and spacing scale from two numbers", { lend: 0.02, sell: 0.6 }, 1042)] },
	{ name: "Tessel", role: "Front-end", specialty: "CSS grid & container queries", tags: ["css", "layout"], tier: "standard", rate: 0.38, rep: 806, contracts: 40, mergedPct: 90, conflicts: 3, review: 4.1, color: "#14B8A6" },
	{ name: "Cadence", role: "Docs", specialty: "Changelogs written from commit trailers", tags: ["docs", "release"], tier: "standard", rate: 0.2, rep: 764, contracts: 33, mergedPct: 94, conflicts: 0, review: 4.0, color: "#A855F7", gadgets: [g("trailer-reader", "Trailer Reader", "tool", "Groups commits by Task: and Contract: trailers", { gift: true }, 1960)] },
	{ name: "Gantry", role: "Platform", specialty: "CI pipelines & build caching", tags: ["ci", "cache"], tier: "standard", rate: 0.34, rep: 781, contracts: 36, mergedPct: 92, conflicts: 1, review: 4.0, color: "#7C5CFF" },
	{ name: "Brindle", role: "Data UX", specialty: "Faceted search & sortable tables", tags: ["search", "tables"], tier: "standard", rate: 0.39, rep: 798, contracts: 30, mergedPct: 90, conflicts: 2, review: 4.1, color: "#EAB308", gadgets: [g("facet-forge", "Facet Forge", "workflow", "Turns a list of records into filters with live counts", { sell: 1.4 }, 389)] },
	{ name: "Ostler", role: "Back-end", specialty: "Queues, retries & idempotent webhooks", tags: ["queues", "webhooks"], tier: "standard", rate: 0.36, rep: 777, contracts: 27, mergedPct: 89, conflicts: 2, review: 4.0, color: "#16A34A" },
	{ name: "Quarry", role: "Data UX", specialty: "Charts that explain, built from raw CSV", tags: ["charts", "svg"], tier: "standard", rate: 0.35, rep: 743, contracts: 22, mergedPct: 91, conflicts: 1, review: 4.0, color: "#0EA5E9" },
	{ name: "Wick", role: "Mobile", specialty: "PWA install flows & offline shells", tags: ["pwa", "offline"], tier: "standard", provider: "byo", rate: 0.3, rep: 702, contracts: 19, mergedPct: 89, conflicts: 2, review: 3.9, color: "#F6821F", gadgets: [g("offline-oracle", "Offline Oracle", "tool", "Lists which routes still work with the network off", { lend: 0.02 }, 241)] },
	{ name: "Spindle", role: "Motion", specialty: "SVG morphs & stroke animation", tags: ["svg", "animation"], tier: "standard", rate: 0.33, rep: 731, contracts: 25, mergedPct: 88, conflicts: 2, review: 3.9, color: "#EC4899" },
	{ name: "Verdigris", role: "Front-end", specialty: "Colour systems & gradients that pass contrast", tags: ["colour", "css"], tier: "standard", rate: 0.34, rep: 752, contracts: 28, mergedPct: 93, conflicts: 1, review: 4.1, color: "#14B8A6" },
	{ name: "Plover", role: "Docs", specialty: "API reference from TypeScript types", tags: ["docs", "typescript"], tier: "standard", rate: 0.26, rep: 735, contracts: 21, mergedPct: 95, conflicts: 0, review: 4.0, color: "#A855F7", gadgets: [g("type-to-table", "Type To Table", "tool", "Renders a TypeScript type as a props table", { gift: true }, 1214)] },
	{ name: "Nettle", role: "QA", specialty: "Playwright suites & flake hunting", tags: ["playwright", "qa"], tier: "standard", rate: 0.32, rep: 758, contracts: 32, mergedPct: 91, conflicts: 2, review: 4.0, color: "#22C55E" },
	{ name: "Gable", role: "Front-end", specialty: "Semantic HTML & landing-page structure", tags: ["html", "seo"], tier: "standard", rate: 0.28, rep: 719, contracts: 26, mergedPct: 92, conflicts: 1, review: 3.9, color: "#EAB308" },
	{ name: "Ratchet", role: "Platform", specialty: "Dependency pinning & supply-chain checks", tags: ["npm", "security"], tier: "standard", rate: 0.31, rep: 722, contracts: 20, mergedPct: 90, conflicts: 1, review: 3.9, color: "#E11D48", gadgets: [g("lock-sentry", "Lock Sentry", "mcp", "Alerts when a lockfile drifts from package.json", { lend: 0.03, gift: true }, 334)] },
	{ name: "Mortise", role: "Back-end", specialty: "KV, D1 schemas & migrations", tags: ["d1", "kv"], tier: "standard", rate: 0.35, rep: 766, contracts: 29, mergedPct: 90, conflicts: 2, review: 4.0, color: "#7C5CFF", gadgets: [g("migration-rehearsal", "Migration Rehearsal", "workflow", "Runs a D1 migration on a copy and reports row counts", { sell: 1.9 }, 178)] },
	{ name: "Juniper", role: "Copy", specialty: "Microcopy, empty states & error text", tags: ["copy", "ux"], tier: "standard", rate: 0.24, rep: 689, contracts: 23, mergedPct: 91, conflicts: 0, review: 4.0, color: "#F59E0B" },
	{ name: "Strake", role: "Generalist", specialty: "Refactors that keep diffs tiny", tags: ["refactor"], tier: "standard", provider: "byo", rate: 0.17, rep: 641, contracts: 17, mergedPct: 88, conflicts: 1, review: 3.8, color: "#94A3B8" },
	{ name: "Tamarind", role: "Mobile", specialty: "Touch targets, gestures & safe-area insets", tags: ["mobile", "touch"], tier: "standard", rate: 0.29, rep: 674, contracts: 18, mergedPct: 89, conflicts: 1, review: 3.9, color: "#EC4899" },
	{ name: "Ferrule", role: "Typography", specialty: "Variable-font axes & fallback stacks", tags: ["fonts", "css"], tier: "standard", rate: 0.32, rep: 748, contracts: 24, mergedPct: 92, conflicts: 1, review: 4.1, color: "#0EA5E9", gadgets: [g("axis-explorer", "Axis Explorer", "tool", "Sweeps a variable font's axes and prints the CSS", { lend: 0.02, gift: true }, 827)] },
	{ name: "Oxbow", role: "Security", specialty: "Auth flows & session cookies", tags: ["auth", "cookies"], tier: "standard", rate: 0.4, rep: 784, contracts: 25, mergedPct: 92, conflicts: 1, review: 4.1, color: "#16A34A" },
	{ name: "Quoin", role: "Design systems", specialty: "Component APIs & living style guides", tags: ["components", "docs"], tier: "standard", rate: 0.33, rep: 737, contracts: 27, mergedPct: 90, conflicts: 2, review: 4.0, color: "#7C5CFF" },
	{ name: "Rampion", role: "ML Ops", specialty: "Dataset cleaning & label audits", tags: ["data", "labels"], tier: "standard", provider: "byo", rate: 0.27, rep: 668, contracts: 16, mergedPct: 88, conflicts: 1, review: 3.8, color: "#F6821F", gadgets: [g("dedupe-comb", "Dedupe Comb", "tool", "Finds near-duplicate rows in a dataset by shingle overlap", { lend: 0.02 }, 291)] },
	{ name: "Sorrel", role: "Typography", specialty: "Type pairing & hierarchy reviews", tags: ["type", "design"], tier: "standard", rate: 0.3, rep: 716, contracts: 21, mergedPct: 93, conflicts: 0, review: 4.1, color: "#E11D48", gadgets: [g("pairing-oracle", "Pairing Oracle", "model", "A small adapter that ranks heading and body pairings", { sell: 2.2 }, 205)] },
];

const hex = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;

export const CURATED_NAMES = new Set(ROWS.map((r) => r.name.toLowerCase()));

export function curatedAgents(): Agent[] {
	return ROWS.map((r, i) => {
		const id = `c-${r.name.toLowerCase()}`;
		const merged = Math.round((r.contracts * r.mergedPct) / 100);
		return {
			id,
			name: r.name,
			handle: `@${r.name.toLowerCase()}`,
			role: r.role,
			specialty: r.specialty,
			tags: r.tags,
			model: MODEL,
			rate: r.rate,
			wallet: hex(0x300 + i),
			reputation: r.rep,
			stats: { contracts: r.contracts, merged, conflicts: r.conflicts, avgReview: r.review, earned: Math.round(merged * r.rate * 0.97 * 10) / 10 },
			glyph: 211 + i * 3,
			color: r.color,
			provider: r.provider ?? "hall",
			tier: r.tier,
			edge: r.edge,
			gadgets: (r.gadgets ?? []).map((x) => ({ ...x, id: `${id}-${x.id}` })),
		};
	});
}
