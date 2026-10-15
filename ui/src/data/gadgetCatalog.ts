import type { Gadget } from "../types";

/** Hand-written Gadgets handed out to generated Hall agents, one each, in a seeded order. Names never repeat. */
export const GADGET_CATALOG: [string, string, Gadget["kind"]][] = [
	["Lint Lantern", "Explains every lint error in plain English with a one-line fix", "tool"],
	["Diff Whisperer", "Summarises a diff for non-engineers before review", "model"],
	["Snapshot Sniffer", "Visual-regression checks against the last merged preview", "workflow"],
	["Palette Press", "Extracts a brand palette from a screenshot and writes tokens", "tool"],
	["Route Radar", "Lists every route and binding a Worker exposes", "mcp"],
	["Type Tamer", "Adds strict types to loose JavaScript, file by file", "workflow"],
	["Bundle Scale", "Weighs a build and names the three heaviest imports", "tool"],
	["Mock Mill", "Generates realistic fixture data from a schema", "dataset"],
	["Seed Sower", "Seeds a local database from the production shape", "dataset"],
	["Trace Tap", "Streams request traces from a running Worker into the chat", "mcp"],
	["Cookie Counter", "Lists every cookie a page sets and when it expires", "tool"],
	["Focus Ring Fixer", "Adds visible focus styles that pass contrast to every control", "tool"],
	["Alt Text Atelier", "Drafts alt text from an image and the sentence around it", "model"],
	["Redirect Cartographer", "Maps every redirect chain and flags loops", "mcp"],
	["Image Diet", "Re-encodes images to the smallest size that looks identical", "workflow"],
	["Z-Index Referee", "Untangles stacking contexts and proposes a clean scale", "tool"],
	["Commit Concierge", "Rewrites messy commits into one clear message per task", "workflow"],
	["Env Auditor", "Finds secrets in config files before they reach a commit", "tool"],
	["Table Tailor", "Makes data tables responsive without hiding columns", "workflow"],
	["Schema Sketch", "Draws an entity diagram from a D1 migration folder", "tool"],
	["Prompt Prosecutor", "Cross-examines a prompt with ten hostile inputs", "workflow"],
	["Retry Ranger", "Wraps flaky fetch calls in backoff with jitter", "tool"],
	["Sitemap Sprite", "Builds a sitemap and checks every link returns 200", "mcp"],
	["Print Stylist", "Adds a clean print stylesheet to any page", "tool"],
	["Keyboard Cartographer", "Records the tab order of a page and flags traps", "mcp"],
	["Locale Loom", "Extracts hard-coded strings into a translation file", "workflow"],
	["Font Subsetter", "Subsets a font to the glyphs a page uses", "tool"],
	["Test Trellis", "Grows a thin test file into a table-driven suite", "model"],
	["Meta Mender", "Fixes title, description and social cards across a site", "workflow"],
	["Dead Code Dowser", "Finds exports nothing imports and offers the deletion", "tool"],
	["Hover Hunter", "Finds hover-only controls that fail on touch screens", "tool"],
	["Cache Concierge", "Sets cache headers per route from how often files change", "workflow"],
	["Spacing Sergeant", "Snaps stray margins and paddings to the spacing scale", "tool"],
	["Error Archivist", "Groups production errors by cause and links the fix", "dataset"],
	["Story Seeder", "Writes realistic sample content for empty states", "dataset"],
	["Anchor Auditor", "Checks every in-page link lands on a real heading", "mcp"],
	["Latency Ledger", "Times every route and keeps a running table of the slowest", "dataset"],
	["Gradient Grader", "Rebuilds banding gradients so they stay smooth on cheap screens", "tool"],
	["Form Foreman", "Adds labels, errors and autocomplete hints to bare forms", "workflow"],
	["Reduced Motion Referee", "Swaps motion for a still when the visitor asks for less", "tool"],
];

const ADJ = ["Amber", "Brisk", "Cobalt", "Dapper", "Ember", "Fennel", "Gilded", "Harbor", "Indigo", "Jaunty", "Kestrel", "Linden", "Mossy", "Nimble", "Opal", "Quartz", "Russet", "Saffron", "Tidal", "Umber", "Velvet", "Willow"];
const NOUN = ["Compass", "Ledger", "Loom", "Mantle", "Needle", "Orchard", "Plumb", "Quiver", "Rudder", "Sieve", "Tether", "Vane", "Wrench", "Yoke", "Anchor", "Beacon", "Chisel", "Dowel"];
const VERB = ["Checks", "Rewrites", "Maps", "Counts", "Trims", "Flags", "Sorts", "Rebuilds", "Audits", "Drafts"];
const OBJ = ["unused CSS rules", "slow database queries", "duplicate dependencies", "oversized third-party scripts", "broken internal links", "inconsistent button states", "missing loading states", "unescaped user input", "mixed-content requests", "copy that runs too long"];
const KIND: Gadget["kind"][] = ["tool", "workflow", "mcp", "dataset", "model"];

/** Beyond the hand-written list: combinatorial but unique by index, so repeats are impossible for thousands of entries. */
export function procGadget(i: number): [string, string, Gadget["kind"]] {
	const a = ADJ[i % ADJ.length];
	const n = NOUN[Math.floor(i / ADJ.length) % NOUN.length];
	const round = Math.floor(i / (ADJ.length * NOUN.length));
	return [`${a} ${n}${round ? ` ${round + 1}` : ""}`, `${VERB[i % VERB.length]} ${OBJ[(i + Math.floor(i / VERB.length)) % OBJ.length]} and writes up what it found`, KIND[i % KIND.length]];
}
