// Minimal in-memory filesystem for isomorphic-git inside a Worker (no disk in Workers).
// Implements the `fs.promises` surface isomorphic-git needs.

type Node = { kind: "file"; data: Uint8Array; mtime: number } | { kind: "dir"; mtime: number } | { kind: "link"; target: string; mtime: number };

const enc = new TextEncoder();
const dec = new TextDecoder();

function fsError(code: string, path: string): Error {
	const e = new Error(`${code}: ${path}`) as Error & { code: string };
	e.code = code;
	return e;
}

function norm(p: string): string {
	const parts: string[] = [];
	for (const seg of p.split("/")) {
		if (!seg || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return "/" + parts.join("/");
}

function parent(p: string): string {
	const n = norm(p);
	const i = n.lastIndexOf("/");
	return i <= 0 ? "/" : n.slice(0, i);
}

let inoCounter = 1;

class Stat {
	constructor(
		private node: Node,
		readonly ino: number,
	) {}
	get type() {
		return this.node.kind === "dir" ? "dir" : this.node.kind === "link" ? "symlink" : "file";
	}
	get mode() {
		return this.node.kind === "dir" ? 0o40755 : this.node.kind === "link" ? 0o120000 : 0o100644;
	}
	get size() {
		return this.node.kind === "file" ? this.node.data.byteLength : 0;
	}
	get mtimeMs() {
		return this.node.mtime;
	}
	get ctimeMs() {
		return this.node.mtime;
	}
	uid = 1;
	gid = 1;
	dev = 1;
	isFile() {
		return this.node.kind === "file";
	}
	isDirectory() {
		return this.node.kind === "dir";
	}
	isSymbolicLink() {
		return this.node.kind === "link";
	}
}

export class MemoryFS {
	private nodes = new Map<string, Node>([["/", { kind: "dir", mtime: Date.now() }]]);
	private inos = new Map<string, number>();

	private ensureDir(path: string) {
		const n = norm(path);
		if (n === "/") return;
		const existing = this.nodes.get(n);
		if (existing) {
			if (existing.kind !== "dir") throw fsError("ENOTDIR", n);
			return;
		}
		this.ensureDir(parent(n));
		this.nodes.set(n, { kind: "dir", mtime: Date.now() });
	}

	promises = {
		readFile: async (path: string, opts?: { encoding?: string } | string) => {
			const n = norm(path);
			const node = this.nodes.get(n);
			if (!node) throw fsError("ENOENT", n);
			if (node.kind !== "file") throw fsError("EISDIR", n);
			const encoding = typeof opts === "string" ? opts : opts?.encoding;
			return encoding === "utf8" || encoding === "utf-8" ? dec.decode(node.data) : node.data;
		},
		writeFile: async (path: string, data: string | Uint8Array) => {
			const n = norm(path);
			this.ensureDir(parent(n));
			const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
			this.nodes.set(n, { kind: "file", data: bytes, mtime: Date.now() });
		},
		unlink: async (path: string) => {
			const n = norm(path);
			if (!this.nodes.has(n)) throw fsError("ENOENT", n);
			this.nodes.delete(n);
		},
		readdir: async (path: string) => {
			const n = norm(path);
			const node = this.nodes.get(n);
			if (!node) throw fsError("ENOENT", n);
			if (node.kind !== "dir") throw fsError("ENOTDIR", n);
			const prefix = n === "/" ? "/" : n + "/";
			const out = new Set<string>();
			for (const key of this.nodes.keys()) {
				if (key !== n && key.startsWith(prefix)) out.add(key.slice(prefix.length).split("/")[0]);
			}
			return [...out];
		},
		mkdir: async (path: string) => {
			const n = norm(path);
			if (this.nodes.has(n)) throw fsError("EEXIST", n);
			if (!this.nodes.has(parent(n))) throw fsError("ENOENT", parent(n));
			this.nodes.set(n, { kind: "dir", mtime: Date.now() });
		},
		rmdir: async (path: string) => {
			const n = norm(path);
			const children = await this.promises.readdir(n);
			if (children.length) throw fsError("ENOTEMPTY", n);
			this.nodes.delete(n);
		},
		stat: async (path: string) => this.statOf(norm(path)),
		lstat: async (path: string) => this.statOf(norm(path)),
		readlink: async (path: string) => {
			const node = this.nodes.get(norm(path));
			if (!node || node.kind !== "link") throw fsError("EINVAL", path);
			return node.target;
		},
		symlink: async (target: string, path: string) => {
			const n = norm(path);
			this.ensureDir(parent(n));
			this.nodes.set(n, { kind: "link", target, mtime: Date.now() });
		},
		chmod: async () => {},
	};

	private statOf(n: string): Stat {
		const node = this.nodes.get(n);
		if (!node) throw fsError("ENOENT", n);
		let ino = this.inos.get(n);
		if (!ino) {
			ino = inoCounter++;
			this.inos.set(n, ino);
		}
		return new Stat(node, ino);
	}
}
