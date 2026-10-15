import { Modal } from "./Overlay";

/** The explainer film, served from /media/ (copied from video/out/master_16x9.mp4). Captions are a WebVTT track made from captions.srt. */
export function FilmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
	return (
		<Modal open={open} onClose={onClose} label="Forkyard explainer film" size="xl">
			<div className="film">
				<video controls autoPlay playsInline preload="metadata" aria-label="Forkyard explainer film">
					<source src="/media/explainer.mp4" type="video/mp4" />
					<track kind="captions" src="/media/explainer.vtt" srcLang="en" label="English" default />
				</video>
				<p className="hint">Forkyard in a film. Captions are on; use the player menu to turn them off.</p>
			</div>
		</Modal>
	);
}
