import { useEffect, useMemo, useState } from "react";
import type { Chapter, Task } from "@shared/types";
import { highlight, langOf } from "../lib/highlight";
import { describeHunk, droppedBits, fileKindWord, hunkRows, previewUrl, type Row, type Seg } from "./helpers";

type File = Chapter["diff"][number];

function Code({ text, lang, segs, tone }: { text: string; lang: ReturnType<typeof langOf>; segs?: Seg[]; tone: "del" | "add" }) {
	if (segs && segs.some((s) => s.hit)) {
		return (
			<>
				{segs.map((s, i) => (
					<span key={i} className={s.hit ? `hit hit-${tone}` : undefined}>{s.t}</span>
				))}
			</>
		);
	}
	if (!text) return <span className="blank">{" "}</span>;
	return (
		<>
			{highlight(text, lang).map((t, i) => (
				<span key={i} className={t.c ? `tk-${t.c}` : undefined}>{t.t}</span>
			))}
		</>
	);
}

function Hunk({ file, h, plain, whole }: { file: File; h: File["hunks"][number]; plain: boolean; whole?: boolean }) {
	const lang = langOf(file.path);
	const rows: Row[] = useMemo(() => hunkRows(h), [h]);
	const dropped = useMemo(() => droppedBits(rows), [rows]);
	return (
		<div className="hunk">
			<div className="hunk-head">
				<span className="hunk-anchor mono">{whole ? file.kind === "deleted" ? "whole file" : "new file" : `line ${h.oldStart}`}</span>
				<span className="hunk-what">{whole ? `${file.kind === "deleted" ? "Removes" : "Adds"} ${h.insert.length + h.remove.length} lines` : describeHunk(h)}</span>
				{dropped.length > 0 && (
					<span className="hunk-flag" title="A tiny removal that is easy to miss in a normal diff">
						Easy to miss: lost {dropped.map((d, i) => <code key={i}>{d}</code>)}
					</span>
				)}
			</div>
			{!plain && (
				<div className="hunk-body mono" role="group" aria-label={`Code change at line ${h.oldStart} of ${file.path}`}>
					{rows.map((r, i) => (
						<div key={i} className={`rv-ln r-${r.kind}`} style={{ ["--i" as string]: Math.min(i, 24) }}>
							<span className="rv-ln-no" aria-hidden="true">{r.lineNo ?? ""}</span>
							<span className="rv-ln-sign" aria-label={r.kind === "del" ? "removed" : "added"}>{r.kind === "del" ? "−" : "+"}</span>
							<span className="rv-ln-t"><Code text={r.text} lang={lang} segs={r.segs} tone={r.kind} /></span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/** New and deleted files arrive without hunks: read them from the time-travel preview and show them whole. */
function WholeFile({ jobId, chapter, file, plain }: { jobId: string; chapter: Chapter; file: File; plain: boolean }) {
	const [state, setState] = useState<{ lines: string[] } | "loading" | "failed">("loading");
	useEffect(() => {
		let live = true;
		const sha = file.kind === "deleted" ? chapter.beforeSha : chapter.afterSha;
		setState("loading");
		fetch(previewUrl(jobId, sha, "main", file.path))
			.then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
			.then((t) => live && setState({ lines: t.replace(/\n$/, "").split("\n") }))
			.catch(() => live && setState("failed"));
		return () => {
			live = false;
		};
	}, [jobId, chapter.afterSha, chapter.beforeSha, file.kind, file.path]);
	if (state === "loading") return <p className="file-why">Reading the file…</p>;
	if (state === "failed") return <p className="file-why">This file is {file.kind === "deleted" ? "removed" : "new"}, but its contents could not be loaded.</p>;
	const h = file.kind === "deleted" ? { oldStart: 1, remove: state.lines, insert: [] } : { oldStart: 1, remove: [], insert: state.lines };
	return <Hunk file={file} h={h} plain={plain} whole />;
}

export function CodeCards({ jobId, chapter, tasks }: { jobId: string; chapter: Chapter; tasks: Task[] }) {
	const [plain, setPlain] = useState(false);
	const [closed, setClosed] = useState<Set<string>>(new Set());
	const files = chapter.diff ?? [];
	const added = files.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.insert.length, 0), 0);
	const removed = files.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.remove.length, 0), 0);

	if (!files.length) {
		return (
			<section className="rv-code" aria-labelledby={`code-${chapter.contractId}`}>
				<h3 id={`code-${chapter.contractId}`}>The code</h3>
				<p className="rv-code-empty">No file changes were recorded for this chapter.</p>
			</section>
		);
	}
	return (
		<section className="rv-code" aria-labelledby={`code-${chapter.contractId}`}>
			<div className="rv-code-head">
				<div>
					<h3 id={`code-${chapter.contractId}`}>The code</h3>
					<p className="rv-code-sum">
						{files.length} {files.length === 1 ? "file" : "files"} changed, <b className="add">+{added}</b> <b className="del">&minus;{removed}</b>
					</p>
				</div>
				<div className="seg" role="radiogroup" aria-label="Level of detail">
					<button role="radio" aria-checked={plain} className={plain ? "on" : ""} onClick={() => setPlain(true)}>Plain English</button>
					<button role="radio" aria-checked={!plain} className={!plain ? "on" : ""} onClick={() => setPlain(false)}>With code</button>
				</div>
			</div>
			<div className="rv-code-files">
				{files.map((f) => {
					const stat = chapter.changes?.files.find((x) => x.path === f.path);
					const a = f.hunks.length ? f.hunks.reduce((m, h) => m + h.insert.length, 0) : stat?.added ?? 0;
					const r = f.hunks.length ? f.hunks.reduce((m, h) => m + h.remove.length, 0) : stat?.removed ?? 0;
					const why = tasks.filter((t) => t.paths?.includes(f.path) && t.story).map((t) => t.story as string);
					const isClosed = closed.has(f.path);
					return (
						<article key={f.path} className={"file" + (isClosed ? " shut" : "")}>
							<button
								className="file-head"
								aria-expanded={!isClosed}
								onClick={() =>
									setClosed((s) => {
										const n = new Set(s);
										if (n.has(f.path)) n.delete(f.path);
										else n.add(f.path);
										return n;
									})
								}
							>
								<span className="file-path mono">{f.path}</span>
								<span className="file-kind">{fileKindWord(f.kind)}</span>
								<span className="file-n mono"><b className="add">+{a}</b> <b className="del">&minus;{r}</b></span>
								<span className="chev" aria-hidden="true" />
							</button>
							{!isClosed && (
								<div className="file-body">
									{why[0] && <p className="file-why">{why[0]}</p>}
									{f.hunks.length === 0 && f.kind !== "modified" ? (
										<WholeFile jobId={jobId} chapter={chapter} file={f} plain={plain} />
									) : (
										f.hunks.map((h, i) => <Hunk key={i} file={f} h={h} plain={plain} />)
									)}
								</div>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}
