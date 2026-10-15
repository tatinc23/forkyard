import type { Hall } from "./do/hall";
import type { Job } from "./do/job";
import type { Desk } from "./do/desk";

export interface Env {
	ARTIFACTS: Artifacts;
	AI: Ai;
	HALL: DurableObjectNamespace<Hall>;
	JOB: DurableObjectNamespace<Job>;
	DESK: DurableObjectNamespace<Desk>;
	ASSETS: Fetcher;
	/** Required in the `x-demo-key` header for anything that spends (creating jobs, approvals). */
	DEMO_KEY?: string;
	/** Max jobs per UTC day (cost guard). */
	DAILY_JOB_CAP?: string;
	PAYMENTS_MODE?: "simulate" | "x402";
	BUYER_PRIVATE_KEY?: string;
	X402_FACILITATOR_URL?: string;
	PUBLIC_BASE_URL?: string;
	PAYMENTS_SELF?: Fetcher;
}

export const hall = (env: Env) => env.HALL.get(env.HALL.idFromName("hall"));
export const job = (env: Env, id: string) => env.JOB.get(env.JOB.idFromName(id));
export const desk = (env: Env, contractId: string) => env.DESK.get(env.DESK.idFromName(contractId));
