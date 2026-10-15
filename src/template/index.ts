// The starting repo every Job is seeded with: the hand-built Ballast Type Co. site when present, else the Acme starter.
import type { FileMap } from "../git/git";
import { ACME_FILES } from "./acme";
import { SEED_FILES } from "./seed.generated";

export const STARTER: { files: FileMap; message: string; repo: string } = SEED_FILES
	? { files: SEED_FILES, message: "Ballast Type Co.: hand-built starting point (human commit)", repo: "ballast/type-site" }
	: { files: ACME_FILES, message: "Acme Supply Co. starting point", repo: "acme/store" };
