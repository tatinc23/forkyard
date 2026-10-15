import type { ComponentType } from "react";
import type { Agent, ReviewView } from "../types";

export type ReviewStageProps = { jobId: string; review: ReviewView | null; agents: Agent[]; source: "live" | "replay" | "mock"; busy?: boolean; onSignoff: (decisions: Record<string, "approve" | "reject">) => void };

// ui/src/review/ is built by another agent. import.meta.glob resolves to {} while the folder is missing, so this
// compiles either way; once index.tsx exists (exporting ReviewStage and mockReview) it is picked up with no edit.
// TODO(review-integration): if the review module still does not exist at ship time, the Floor falls back to the
// v1 Signoff panel (payout rows, one "Approve merge & pay" button).
const mods = import.meta.glob("../review/index.tsx", { eager: true }) as Record<string, { ReviewStage?: ComponentType<ReviewStageProps>; mockReview?: () => ReviewView }>;
const mod = Object.values(mods)[0];

export const ReviewStage: ComponentType<ReviewStageProps> | null = mod?.ReviewStage ?? null;
export const mockReview: (() => ReviewView) | null = mod?.mockReview ?? null;
