import type { Contract as BaseContract, JobEvent as BaseEvent, JobView as BaseView, Agent, JobId, ContractId } from "@shared/types";
export type * from "@shared/types";
export { ROSTER, CONTRACTOR, REVIEWER_ID } from "@shared/roster";

// Forkyard v3 additions (spec A1 + A2). They sit here, next to the shared contract, so the UI compiles whether or not the
// Worker's src/shared/types.ts has them yet. Local declarations shadow the re-exports above; once the shared file carries
// the same shapes the unions below simply overlap.
type Stamp = { t: number; jobId: JobId };

/** A crew line in a scale run: ten agents merge into it, then it merges into main. */
export type CrewEvent = Stamp & { type: "crew"; crewId: string; name: string; contractIds: ContractId[] };
export type CrewMergedEvent = Stamp & { type: "crew_merged"; crewId: string; sha: string; conflicts: number };
export type ScaleDoneEvent = Stamp & { type: "scale_done"; agents: number; forks: number; commits: number; conflicts: number; resolved: number; ms: number };
/** A1: a human paused / resumed / stopped one contract. */
export type ControlEvent = Stamp & { type: "control"; contractId: ContractId; action: "pause" | "resume" | "stop" };
/** A1: chat between the human and one agent (an agent line is its acknowledgement). */
export type NoteEvent = Stamp & { type: "note"; contractId: ContractId; from: "human" | "agent"; text: string };
/** `into` = the crew id the agent merged into; absent = main. */
export type MergedEvent = Extract<BaseEvent, { type: "merged" }> & { into?: string };

export type JobEvent = Exclude<BaseEvent, { type: "merged" }> | MergedEvent | CrewEvent | CrewMergedEvent | ScaleDoneEvent | ControlEvent | NoteEvent;
export type JobView = BaseView & { mode?: "crew" | "scale" };
export type Contract = BaseContract & { crewId?: string };
export type RecordedRun = { job: JobView; events: JobEvent[]; agents: Agent[] };
