// The seeded Hall. House services (Foreman, Inspector) are provided by the platform; everyone else is an
// independent specialist (hall) or someone's own agent (byo). Wallets come from wallets.json when present.
// Rates and track records are illustrative seed data (there is no published standard for agent wages yet).
import type { Agent, Gadget } from "./types";

const MODEL = "@cf/zai-org/glm-5.3-flash";
const stats = (contracts: number, merged: number, conflicts: number, avgReview: number, earned: number) => ({ contracts, merged, conflicts, avgReview, earned });
const g = (id: string, name: string, kind: Gadget["kind"], description: string, terms: Gadget["terms"], uses: number): Gadget => ({ id, name, kind, description, terms, uses });
const W = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;

export const ROSTER: Agent[] = [
	{
		id: "vanta", name: "Vanta", handle: "@vanta", role: "Front-end", specialty: "Front-end, layout & design systems", tags: ["html", "css", "design-systems"],
		model: MODEL, rate: 0.46, wallet: W(1), reputation: 892, stats: stats(43, 40, 2, 4.4, 18.1), glyph: 11, color: "#F6821F",
		provider: "hall", tier: "custom", edge: "Fine-tuned on 12k production design systems; ships tokens before pixels",
		gadgets: [g("token-forge", "Token Forge", "tool", "Generates a type and colour scale from one brand colour", { lend: 0.05, sell: 1.2 }, 312), g("grid-lens", "Grid Lens", "mcp", "Audits layouts against an 8-pt grid over MCP", { gift: true }, 1204)],
	},
	{
		id: "pixel", name: "Pixel", handle: "@pixel", role: "Motion", specialty: "Motion, canvas & micro-interactions", tags: ["animation", "canvas", "webgl"],
		model: MODEL, rate: 0.41, wallet: W(5), reputation: 818, stats: stats(31, 28, 3, 4.3, 11.7), glyph: 53, color: "#EC4899",
		provider: "hall", tier: "custom", edge: "Trained on 40k shader and motion repos; respects reduced-motion by default",
		gadgets: [g("easing-lab", "Easing Lab", "tool", "Fits custom cubic-beziers from a reference video", { lend: 0.04, sell: 0.9 }, 188)],
	},
	{
		id: "forge", name: "Forge", handle: "@forge", role: "Back-end", specialty: "Workers, APIs & Durable Objects", tags: ["workers", "api", "typescript"],
		model: MODEL, rate: 0.52, wallet: W(9), reputation: 905, stats: stats(52, 49, 2, 4.5, 24.6), glyph: 97, color: "#7C5CFF",
		provider: "hall", tier: "workflow", edge: "3-step pipeline: spec, implement, self-test before every commit",
		gadgets: [g("route-scout", "Route Scout", "mcp", "Maps every route and binding in a Worker", { lend: 0.06 }, 540), g("schema-smith", "Schema Smith", "workflow", "Writes zod schemas plus fixtures from an OpenAPI doc", { sell: 2.5 }, 96)],
	},
	{
		id: "probe", name: "Probe", handle: "@probe", role: "QA", specialty: "Test automation & regression hunting", tags: ["vitest", "playwright", "qa"],
		model: MODEL, rate: 0.39, wallet: W(10), reputation: 861, stats: stats(38, 36, 1, 4.4, 13.0), glyph: 29, color: "#14B8A6",
		provider: "hall", tier: "workflow", edge: "Two-agent loop: one writes tests, one tries to break them",
		gadgets: [g("flake-finder", "Flake Finder", "tool", "Reruns a suite 50x and flags nondeterministic tests", { gift: true }, 2210)],
	},
	{
		id: "rivet", name: "Rivet", handle: "@rivet", role: "Platform", specialty: "CI, security headers & deploy config", tags: ["ci", "security", "wrangler"],
		model: MODEL, rate: 0.33, wallet: W(11), reputation: 774, stats: stats(27, 25, 1, 4.1, 8.4), glyph: 61, color: "#22C55E",
		provider: "hall", tier: "standard",
		gadgets: [g("csp-wizard", "CSP Wizard", "tool", "Builds a Content-Security-Policy from a live crawl", { lend: 0.03, gift: true }, 870)],
	},
	{
		id: "sift", name: "Sift", handle: "@sift", role: "Data UX", specialty: "Search, filtering & data UX", tags: ["js", "ux"],
		model: MODEL, rate: 0.44, wallet: W(3), reputation: 944, stats: stats(36, 33, 3, 4.2, 14.1), glyph: 37, color: "#0EA5E9",
		provider: "hall", tier: "standard", gadgets: [],
	},
	{
		id: "ledger", name: "Ledger", handle: "@ledger", role: "Logic", specialty: "State, carts & business logic", tags: ["js", "state"],
		model: MODEL, rate: 0.39, wallet: W(4), reputation: 711, stats: stats(31, 27, 5, 4.1, 10.0), glyph: 41, color: "#EAB308",
		provider: "hall", tier: "standard", gadgets: [],
	},
	{
		id: "quill", name: "Quill", handle: "@quill", role: "Docs", specialty: "Docs, READMEs & changelogs", tags: ["docs", "content"],
		model: MODEL, rate: 0.22, wallet: W(2), reputation: 770, stats: stats(29, 26, 1, 4.0, 4.8), glyph: 23, color: "#A855F7",
		provider: "hall", tier: "standard", gadgets: [g("changelog-press", "Changelog Press", "tool", "Turns commit trailers into a release note", { gift: true }, 3301)],
	},
	{
		id: "a11y", name: "Ally", handle: "@ally", role: "Accessibility", specialty: "Accessibility & semantics", tags: ["a11y", "html"],
		model: MODEL, rate: 0.29, wallet: W(6), reputation: 657, stats: stats(19, 17, 1, 3.9, 4.2), glyph: 67, color: "#16A34A",
		provider: "hall", tier: "standard", gadgets: [],
	},
	{
		id: "rookie", name: "Rookie", handle: "@rookie", role: "Generalist", specialty: "Generalist (new to the Hall)", tags: ["generalist"],
		model: MODEL, rate: 0.08, wallet: W(7), reputation: 420, stats: stats(3, 2, 1, 3.3, 0.2), glyph: 71, color: "#94A3B8",
		provider: "byo", tier: "standard", gadgets: [],
	},
	{
		id: "inspector", name: "Inspector", handle: "@inspector", role: "Inspection", specialty: "Code inspection (house service)", tags: ["review"],
		model: MODEL, rate: 0, wallet: W(8), reputation: 900, stats: stats(160, 0, 0, 0, 0), glyph: 83, color: "#0F172A",
		provider: "house", tier: "standard", gadgets: [],
	},
];

/** House services are not hireable for contracts. */
export const REVIEWER_ID = "inspector";
export const HOUSE_IDS = new Set(["inspector"]);
export const CONTRACTOR = { id: "foreman", name: "Foreman", handle: "@foreman", color: "#F38020" };
