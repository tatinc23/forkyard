// Generates a TESTNET buyer key + one address per roster agent. Run: node scripts/gen-wallets.mjs
// - .dev.vars (gitignored): BUYER_PRIVATE_KEY (the ONLY place the key is written), PAYMENTS_MODE=simulate, facilitator URL
// - src/shared/wallets.json: agent PUBLIC addresses only (agent private keys are discarded; testnet payees need no key)
// Refuses to overwrite an existing .dev.vars unless --force (so you don't orphan a funded buyer wallet).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devVars = join(root, ".dev.vars");
const walletsJson = join(root, "src/shared/wallets.json");
const AGENTS = ["vanta", "quill", "sift", "ledger", "pixel", "a11y", "rookie", "warden"];

if (existsSync(devVars) && !process.argv.includes("--force")) {
	console.error(".dev.vars already exists; refusing to overwrite (it may hold a funded buyer key). Use --force to regenerate.");
	let addr = "?";
	try { addr = privateKeyToAccount(readFileSync(devVars, "utf8").match(/^BUYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/m)[1]).address; } catch {}
	console.error("Existing buyer address:", addr);
	process.exit(1);
}

const buyerKey = generatePrivateKey();
const buyer = privateKeyToAccount(buyerKey);
const wallets = {};
for (const id of AGENTS) wallets[id] = privateKeyToAccount(generatePrivateKey()).address;

writeFileSync(
	devVars,
	[
		`BUYER_PRIVATE_KEY=${buyerKey}`,
		"PAYMENTS_MODE=simulate",
		"X402_FACILITATOR_URL=https://x402.org/facilitator",
		"PUBLIC_BASE_URL=http://localhost:8787",
		"",
	].join("\n"),
	{ mode: 0o600 },
);
writeFileSync(walletsJson, JSON.stringify(wallets, null, "\t") + "\n");
console.log("Buyer address (fund this with Base Sepolia test USDC):", buyer.address);
console.log("Agent addresses written to src/shared/wallets.json");
