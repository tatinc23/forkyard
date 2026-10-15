import { motion } from "motion/react";
import type { Agent } from "../types";
import { brick } from "../lib/color";
import type { Place } from "../engine/state";

export const SPRING = { type: "spring", stiffness: 210, damping: 24, mass: 0.95 } as const;

/** One commit as a brick. The same layoutId follows it lane -> queue -> bay -> main, so Motion flies it between parents. */
export function Block({ id, agent, place, label, pop = false }: { id: string; agent?: Agent; place: Place; label?: string; pop?: boolean }) {
	const b = brick(agent?.color ?? "#94A3B8");
	return (
		<motion.div
			layoutId={`blk-${id}`}
			layout="position"
			className="blk"
			data-place={place}
			title={label}
			transition={{ layout: SPRING, default: { duration: 0.35 } }}
			initial={pop ? { opacity: 0, scale: 0.7, y: -10 } : false}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			style={{ ["--fill" as string]: b.fill, ["--txt" as string]: b.text }}
		>
			<span className="blk-t">{agent?.name ?? "commit"}</span>
		</motion.div>
	);
}

export function BaseBrick({ label }: { label: string }) {
	return (
		<div className="blk base" title={label}>
			<span className="blk-t">init</span>
		</div>
	);
}
