import type { Agent, ReviewView } from "@shared/types";
import { MOCK_REVIEW } from "./mockdata";
import { MOCK_AGENTS } from "./mockagents";

/**
 * A ReviewView from a REAL recorded run: job 84acda01 on https://gadgethub.chris-d6a.workers.dev
 * (5 hires, per-task stories, real diffs, 3 resolved conflicts, 46-commit timeline).
 * All shas are live, so the time-travel previews in the review work offline from the API but online for /preview.
 */
export const MOCK_JOB_ID = "84acda01";

export function mockReview(): ReviewView {
	return structuredClone(MOCK_REVIEW);
}

export function mockAgents(): Agent[] {
	return structuredClone(MOCK_AGENTS);
}
