// Shared contract between the Worker (API + Durable Objects) and the UI.
// The UI must only depend on this file + the HTTP/WebSocket routes documented below.
//
// HTTP routes (all JSON):
//   GET  /api/hall                     -> HallView
//   POST /api/jobs   {goal, budget}    -> { jobId }            (creates Job, contractor starts planning)
//   GET  /api/jobs/:id                 -> JobView
//   POST /api/scale {agents?, crews?}  -> JobView (mode "scale"): scripted agents, one fork + one commit each, merge tree
//   POST /api/jobs/:id/approve-budget  -> JobView              (human gate 1)
//        optional body {contracts?: [{agentId, role, tasks: [{title, detail?}], leases: string[]}]} = the human's edited plan
//        (400 {error} if invalid or over budget; a fresh `plan` event follows)
//   POST /api/jobs/:id/contracts/:cid/control {action: "pause"|"resume"|"stop"} -> {contractId, state}   (live jobs; 409 otherwise)
//   POST /api/jobs/:id/contracts/:cid/note    {text: 1-500 chars}                -> {contractId, queued}  (appended to the agent's next batch)
//   POST /api/jobs/:id/signoff         -> JobView              (human gate 2: final merge + payout)
//   GET  /api/jobs/:id/ws              -> WebSocket; server sends {type:"snapshot", job: JobView} then JobEvent per message
//   GET  /preview/:id/                 -> the job's mainline app, served straight from Artifacts (index.html etc.)
//   GET  /api/demo/replay              -> RecordedRun (a captured real run, for a no-network demo fallback)
//   GET  /api/jobs/:id/review          -> ReviewView (chapters per hire + full commit timeline; after the last merge)
//   POST /api/jobs/:id/signoff  {decisions?: Record<ContractId,"approve"|"reject">}  rejected chapters are reverted
//                                      on mainline and not paid; omitted contracts default to approve
//   GET  /preview/:id/[fork/<agent>/][at/<sha>/]<file>  the job's app at any commit / on any fork (sandboxed)

export type AgentId = string;
export type JobId = string;
export type ContractId = string;

export type Agent = {
	id: AgentId;
	name: string; // e.g. "Vanta"
	handle: string; // e.g. "@vanta"
	specialty: string; // e.g. "CSS & theming"
	tags: string[];
	model: string; // Workers AI model id
	rate: number; // USDC per contract (testnet)
	wallet: `0x${string}`;
	reputation: number; // 0-1000
	stats: { contracts: number; merged: number; conflicts: number; avgReview: number; earned: number };
	glyph: number; // seed for the generative avatar
	color: string; // accent hex for lanes/avatars
	/** house = platform service (Foreman, Inspector); hall = independent specialist; byo = someone's own agent/key. */
	provider?: "house" | "hall" | "byo";
	/** standard = stock model + prompt; custom = custom-trained/fine-tuned; workflow = multi-agent / multi-step pipeline. */
	tier?: "standard" | "custom" | "workflow";
	/** One line on what makes a custom/workflow agent more capable (shown prominently in the Hall). */
	edge?: string;
	/** The crew role this agent fills on a job (front-end, back-end, QA...). */
	role?: string;
	/** Tools the agent brings to a job; can be lent, sold or gifted to other agents. */
	gadgets?: Gadget[];
};

export type Gadget = {
	id: string;
	name: string;
	kind: "tool" | "mcp" | "dataset" | "workflow" | "model";
	description: string;
	/** Offer terms. Missing = not offered. Prices in USDC. */
	terms: { lend?: number; sell?: number; gift?: boolean };
	uses: number;
};

export type HallView = {
	agents: Agent[]; // sorted by reputation desc
	jobs: { id: JobId; goal: string; status: JobStatus; createdAt: number }[];
	ledger: Payout[];
	paymentsMode: "simulate" | "x402";
};

export type JobStatus =
	| "planning"
	| "awaiting_budget"
	| "hiring"
	| "working"
	| "merging"
	| "awaiting_signoff"
	| "paying"
	| "closed"
	| "failed";

export type Lease = { contractId: ContractId; paths: string[] };

export type ContractStatus =
	| "offered"
	| "forking"
	| "working"
	| "delivered"
	| "reviewing"
	| "queued"
	| "merging"
	| "conflict"
	| "resolving"
	| "merged"
	| "rejected"
	| "paid";

export type Contract = {
	id: ContractId;
	agentId: AgentId;
	title: string; // short task title
	brief: string; // what the agent must do
	paths: string[]; // lease
	wage: number;
	status: ContractStatus;
	fork?: { name: string; remote: string; headSha?: string };
	tokenExpiresAt?: string; // the contract IS the token: write token TTL = contract deadline
	review?: { score: number; notes: string };
	attempts: number;
	changes?: ChangeSummary;
	payout?: Payout;
	/** Crew role for this contract (front-end, motion, back-end, QA, platform...). */
	role?: string;
	/** The contract's task list; each done task is one commit on the agent's fork. */
	tasks?: Task[];
	/** The human's verdict in the visual review. */
	decision?: "approve" | "reject";
	/** Scale runs: the crew line this contract's agent merges into first. */
	crewId?: string;
};

export type Task = {
	id: string; // `${contractId}-t${n}`
	title: string; // short imperative, e.g. "Add the products rail"
	/** Plain-English one-liner for non-technical reviewers: what changed for a visitor. */
	story?: string;
	/** Extra instruction from the human when they edited the plan (<= 400 chars). */
	detail?: string;
	paths: string[];
	status: "todo" | "done" | "failed";
	sha?: string; // commit on the agent's fork
	at?: number;
};

/** Visual review: one chapter per hire, plus every commit in order. */
export type ReviewView = {
	jobId: JobId;
	goal: string;
	base: { sha: string };
	head: { sha: string };
	chapters: Chapter[];
	timeline: TimelineItem[];
};

export type Chapter = {
	contractId: ContractId;
	agentId: AgentId;
	role?: string;
	title: string;
	/** 2-3 sentence plain-English story of what this hire changed for a visitor. */
	story: string;
	/** Mainline before and after this chapter merged: preview both via /preview/<job>/at/<sha>/. */
	beforeSha: string;
	afterSha: string;
	tasks: Task[];
	inspection?: { score: number; notes: string };
	changes?: ChangeSummary;
	/** Per-file JSON hunks for the code view. */
	diff: { path: string; kind: "added" | "deleted" | "modified"; hunks: { oldStart: number; remove: string[]; insert: string[] }[] }[];
	conflict?: { withContractId?: ContractId; paths: string[]; resolved: boolean };
	status: ContractStatus;
	decision?: "approve" | "reject";
};

export type TimelineItem = {
	sha: string;
	at: number;
	kind: "seed" | "task" | "resolve" | "merge" | "revert";
	title: string;
	agentId?: AgentId;
	contractId?: ContractId;
	/** "main" or the fork's agent id; previews: /preview/<job>/fork/<agent>/at/<sha>/ for forks. */
	on: "main" | AgentId;
	story?: string;
};

export type ChangeSummary = { files: { path: string; kind: "added" | "deleted" | "modified"; added: number; removed: number }[]; added: number; removed: number };

export type Conflict = { path: string; baseLine: number; base: string[]; ours: string[]; theirs: string[] };

export type Payout = {
	contractId: ContractId;
	agentId: AgentId;
	amount: number;
	mode: "simulate" | "x402";
	txHash?: string; // Base Sepolia tx when mode = x402
	network: "base-sepolia";
	at: number;
};

export type JobView = {
	id: JobId;
	goal: string;
	budget: number;
	status: JobStatus;
	repo?: { name: string; remote: string; headSha?: string };
	plan?: { summary: string; overlaps: { path: string; contracts: ContractId[] }[] };
	contracts: Contract[];
	mainline: { sha: string; message: string; contractId?: ContractId; at: number }[]; // newest last
	createdAt: number;
	totalCost: number;
	/** "scale" = the scripted merge-tree run (POST /api/scale). Absent or "crew" = an AI crew job. */
	mode?: "crew" | "scale";
};

/** Everything the UI animates arrives as one of these, in order. `t` = server ms timestamp. */
export type JobEvent = { t: number; jobId: JobId } & (
	| { type: "status"; status: JobStatus }
	| { type: "plan"; plan: NonNullable<JobView["plan"]>; contracts: Contract[]; budget: number }
	| { type: "hired"; contractId: ContractId; agentId: AgentId; wage: number }
	| { type: "forked"; contractId: ContractId; fork: { name: string; remote: string }; ms: number; tokenExpiresAt: string }
	| { type: "foreman"; note: string } // Foreman (contractor) progress line while planning
	| { type: "thinking"; contractId: ContractId; note: string } // agent progress line (short)
	| { type: "task"; contractId: ContractId; taskId: string; title: string; sha: string; story?: string } // one task committed on the fork
	| { type: "review_ready" } // all merges done; GET /api/jobs/:id/review is available
	| { type: "reverted"; contractId: ContractId; sha: string } // a chapter rejected in review was reverted on mainline
	| { type: "typing"; contractId: ContractId; path: string; chunk: string } // code snippet stream for the lane animation
	| { type: "delivered"; contractId: ContractId; sha: string; changes: ChangeSummary }
	| { type: "review"; contractId: ContractId; score: number; notes: string }
	| { type: "queued"; contractId: ContractId; position: number }
	| { type: "merge_start"; contractId: ContractId }
	| { type: "conflict"; contractId: ContractId; conflicts: Conflict[]; withContractId?: ContractId; into?: string } // scale runs: `into` = crew id the conflict hit; absent = main
	| { type: "resolving"; contractId: ContractId }
	| { type: "merged"; contractId: ContractId; sha: string; outcomes: { path: string; status: string }[]; into?: string } // scale runs: `into` = crew id merged into; absent = main
	| { type: "crew"; crewId: string; name: string; contractIds: ContractId[] } // scale runs: a crew line (a real fork of main)
	| { type: "crew_merged"; crewId: string; sha: string; conflicts: number } // scale runs: the crew line landed on main
	| { type: "scale_done"; agents: number; forks: number; commits: number; conflicts: number; resolved: number; ms: number }
	| { type: "rejected"; contractId: ContractId; reason: string }
	| { type: "payout"; payout: Payout }
	| { type: "reputation"; agentId: AgentId; before: number; after: number; reason: string }
	| { type: "control"; contractId: ContractId; action: "pause" | "resume" | "stop" } // the human paused / resumed / stopped an agent
	| { type: "note"; contractId: ContractId; from: "human" | "agent"; text: string } // human instruction, and the agent's acknowledgement
	| { type: "error"; message: string; contractId?: ContractId }
);

/** A captured real run, replayable by the UI with original timing. */
export type RecordedRun = { job: JobView; events: JobEvent[]; agents: Agent[] };

/** A JobEvent before the server stamps `t` and `jobId` (distributes over the union). */
export type JobEventBody = JobEvent extends infer E ? (E extends unknown ? Omit<E, "t" | "jobId"> : never) : never;
