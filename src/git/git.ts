// Thin git layer over Artifacts remotes using isomorphic-git + an in-memory FS.
// Artifacts has no write API, so every write is a real git push over smart HTTP.
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { MemoryFS } from "./memfs";

export type FileMap = Record<string, string>;
export type Snapshot = { sha: string; files: FileMap };
export type Author = { name: string; email: string };

const DIR = "/repo";
const dec = new TextDecoder();

/** Artifacts tokens look like `art_v1_<secret>?expires=<unix>`; git Basic auth wants only the secret. */
export function tokenSecret(token: string): string {
	return token.split("?expires=")[0];
}

function auth(token: string) {
	const password = tokenSecret(token);
	return () => ({ username: "x", password });
}

async function cloneInto(fs: MemoryFS, remote: string, token: string, branch: string) {
	await git.clone({ fs, http, dir: DIR, url: remote, ref: branch, singleBranch: true, depth: 1, onAuth: auth(token) });
}

/** Read every file at the tip of `branch`. Small repos only (demo-sized). */
export async function snapshot(remote: string, token: string, branch = "main"): Promise<Snapshot> {
	const fs = new MemoryFS();
	await cloneInto(fs, remote, token, branch);
	const sha = await git.resolveRef({ fs, dir: DIR, ref: "HEAD" });
	const paths = await git.listFiles({ fs, dir: DIR, ref: "HEAD" });
	const files: FileMap = {};
	for (const filepath of paths) {
		const { blob } = await git.readBlob({ fs, dir: DIR, oid: sha, filepath });
		files[filepath] = dec.decode(blob);
	}
	return { sha, files };
}

/**
 * Commit a set of file changes on top of `branch` and push. `null` deletes a file.
 * Returns the new commit sha. Pushes are fast-forward only; a stale tip is rejected by the server.
 */
export async function commitFiles(opts: {
	remote: string;
	token: string;
	branch?: string;
	changes: Record<string, string | null>;
	message: string;
	author: Author;
}): Promise<string> {
	const branch = opts.branch ?? "main";
	const fs = new MemoryFS();
	await cloneInto(fs, opts.remote, opts.token, branch);
	for (const [filepath, content] of Object.entries(opts.changes)) {
		if (content === null) {
			await fs.promises.unlink(`${DIR}/${filepath}`).catch(() => {});
			await git.remove({ fs, dir: DIR, filepath });
		} else {
			await fs.promises.writeFile(`${DIR}/${filepath}`, content);
			await git.add({ fs, dir: DIR, filepath });
		}
	}
	const sha = await git.commit({ fs, dir: DIR, message: opts.message, author: opts.author });
	const res = await git.push({ fs, http, dir: DIR, url: opts.remote, ref: branch, onAuth: auth(opts.token) });
	if (!res.ok) throw new Error(`push rejected: ${JSON.stringify(res.refs)}`);
	return sha;
}

/** Initialise a brand-new (empty) repo with files and push `main`. */
export async function seed(opts: { remote: string; token: string; files: FileMap; message: string; author: Author }): Promise<string> {
	const fs = new MemoryFS();
	await git.init({ fs, dir: DIR, defaultBranch: "main" });
	for (const [filepath, content] of Object.entries(opts.files)) {
		await fs.promises.writeFile(`${DIR}/${filepath}`, content);
		await git.add({ fs, dir: DIR, filepath });
	}
	const sha = await git.commit({ fs, dir: DIR, message: opts.message, author: opts.author });
	const res = await git.push({ fs, http, dir: DIR, url: opts.remote, ref: "main", onAuth: auth(opts.token) });
	if (!res.ok) throw new Error(`seed push rejected: ${JSON.stringify(res.refs)}`);
	return sha;
}

/**
 * Several commits in one clone + one push: each step is its own commit (one per task), so the fork's
 * history reads task by task. Steps with no effective change are skipped. Returns one sha per step (null if skipped).
 */
export async function commitSequence(opts: {
	remote: string;
	token: string;
	branch?: string;
	steps: { changes: Record<string, string | null>; message: string }[];
	author: Author;
}): Promise<(string | null)[]> {
	const branch = opts.branch ?? "main";
	const fs = new MemoryFS();
	await cloneInto(fs, opts.remote, opts.token, branch);
	const shas: (string | null)[] = [];
	for (const step of opts.steps) {
		let touched = 0;
		for (const [filepath, content] of Object.entries(step.changes)) {
			const path = `${DIR}/${filepath}`;
			if (content === null) {
				await fs.promises.unlink(path).catch(() => {});
				await git.remove({ fs, dir: DIR, filepath });
				touched++;
			} else {
				const cur = await fs.promises.readFile(path, "utf8").catch(() => undefined);
				if (cur === content) continue;
				await fs.promises.writeFile(path, content);
				await git.add({ fs, dir: DIR, filepath });
				touched++;
			}
		}
		shas.push(touched ? await git.commit({ fs, dir: DIR, message: step.message, author: opts.author }) : null);
	}
	if (shas.some(Boolean)) {
		const res = await git.push({ fs, http, dir: DIR, url: opts.remote, ref: branch, onAuth: auth(opts.token) });
		if (!res.ok) throw new Error(`push rejected: ${JSON.stringify(res.refs)}`);
	}
	return shas;
}
