import type { Playback } from "../engine/session";

const SPEEDS = [0.5, 1, 2];

/** Transport for the Floor: pause, speed, step to the next visible event. In replay/mock it drives the script; live it paces the buffered events. */
export function PlayControls({ pb, onToggle, onSpeed, onStep }: { pb: Playback; onToggle: () => void; onSpeed: (s: number) => void; onStep: () => void }) {
	if (pb.mode === "none") return null;
	const live = pb.mode === "live";
	return (
		<div className="transport" role="group" aria-label="Playback controls">
			<button className="tp-btn main" onClick={onToggle} aria-pressed={pb.paused} aria-label={pb.paused ? "Play" : "Pause"} title={pb.paused ? "Play (Space)" : "Pause (Space)"}>
				{pb.paused ? (
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M3 1.5v11l9-5.5z" fill="currentColor" />
					</svg>
				) : (
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor" />
					</svg>
				)}
				<span>{pb.paused ? "Play" : "Pause"}</span>
			</button>
			<button className="tp-btn" onClick={onStep} disabled={pb.done && pb.pending === 0} aria-label="Step to the next event" title="Step to the next event">
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M2 1.5v11l7-5.5zM10.5 1.5h2v11h-2z" fill="currentColor" />
				</svg>
				<span>Next event</span>
			</button>
			<div className="seg" role="radiogroup" aria-label={live ? "Slow motion" : "Speed"}>
				{SPEEDS.map((s) => (
					<button key={s} role="radio" aria-checked={pb.speed === s} className={pb.speed === s ? "on" : ""} onClick={() => onSpeed(s)}>
						{s}x
					</button>
				))}
			</div>
			{live && <span className="tp-note">{pb.pending > 0 ? `${pb.pending} events buffered` : "Live: 0.5x slows the show, events wait their turn"}</span>}
			{!live && pb.gated && <span className="tp-note gate">Waiting for you</span>}
		</div>
	);
}
