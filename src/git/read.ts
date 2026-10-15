// Read a whole tree at any commit through the Artifacts binding (no clone): used to rebuild history views.
import type { FileMap } from "./git";

export async function treeAt(artifacts: Artifacts, repoName: string, commitSha: string): Promise<FileMap> {
	using repo = await artifacts.get(repoName);
	const commit = await repo.readCommit(commitSha);
	if (!commit) throw new Error(`commit ${commitSha} not found in ${repoName}`);
	const files: FileMap = {};
	const walk = async (treeHash: string, prefix: string): Promise<void> => {
		const entries = (await repo.readTree(treeHash)) ?? [];
		await Promise.all(
			entries.map(async (e) => {
				const path = prefix + e.name;
				if (e.type === "tree") return walk(e.hash, path + "/");
				if (e.type !== "blob" && e.type !== "exec") return;
				const blob = await repo.readBlob(e.hash);
				if (blob) files[path] = await blob.text();
			}),
		);
	};
	await walk(commit.treeHash, "");
	return files;
}
