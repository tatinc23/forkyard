# Payments (x402, Base Sepolia testnet only)

Test USDC only. Never configure mainnet or real funds.

## How payouts work
When the human approves the final merge, the job calls `payAgent(env, { agentId, wallet, amount, contractId })` (`src/payments/index.ts`) once per hired agent. It returns a `Payout` (see `src/shared/types.ts`) and never throws.

- **simulate** (default; used when `PAYMENTS_MODE` is not `x402` OR `BUYER_PRIVATE_KEY` is missing/placeholder): returns `{ mode: "simulate", network: "base-sepolia" }` with no `txHash`.
- **x402**: the buyer wallet calls the Worker's own paid endpoint `GET ${PUBLIC_BASE_URL}/x402/pay/:agentId?amount=<usdc>&contract=<id>` using `@x402/fetch`. The endpoint (`x402Routes()`, `@x402/hono`) answers 402 with requirements (`exact`, `eip155:84532`, USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, `payTo` = the agent's wallet from `src/shared/wallets.json`, price = `amount`). The client signs an EIP-3009 `transferWithAuthorization`, retries, the public facilitator (`https://x402.org/facilitator`) verifies and settles on-chain, and the tx hash comes back in the `PAYMENT-RESPONSE` header, which becomes `Payout.txHash`.
- On any x402 failure (unfunded buyer, facilitator down, bad config, amount outside (0, 5]) the result is a simulate Payout with an extra `error` string; the error is also `console.error`ed. The job still completes.

Wiring (done by whoever owns `src/index.ts`): `app.route("/", x402Routes())`, and pass `env` (which provides `PAYMENTS_MODE`, `BUYER_PRIVATE_KEY`, `X402_FACILITATOR_URL`, `PUBLIC_BASE_URL`) to `payAgent`.

## Gas
The `exact` EVM scheme uses USDC's EIP-3009 `transferWithAuthorization` (gasless for the payer): the **facilitator submits the tx and pays gas**. The buyer needs **only test USDC, no Base Sepolia ETH** (per the `@x402/evm` README: "truly gasless").

## Switch to real testnet payments
1. Generate keys (already run once; refuses to overwrite): `node scripts/gen-wallets.mjs` -> `.dev.vars` (buyer key, gitignored) and `src/shared/wallets.json` (agent addresses).
2. Fund the buyer address with Base Sepolia USDC (human step, CAPTCHA): https://faucet.circle.com -> Base Sepolia -> USDC -> buyer address (printed by the script; also in BLOCKERS.md).
3. Local: edit `.dev.vars`: `PAYMENTS_MODE=x402`, `PUBLIC_BASE_URL=http://localhost:8787`, then `npx wrangler dev`.
4. Deployed:
   ```
   cd "/Users/cawc/Hackathons/CF Newgit/gadgethub"
   grep ^BUYER_PRIVATE_KEY .dev.vars | cut -d= -f2 | npx wrangler secret put BUYER_PRIVATE_KEY
   echo x402 | npx wrangler secret put PAYMENTS_MODE
   echo https://<your-worker>.workers.dev | npx wrangler secret put PUBLIC_BASE_URL
   echo https://x402.org/facilitator | npx wrangler secret put X402_FACILITATOR_URL
   ```
   (Or put the non-secret ones under `vars` in `wrangler.jsonc`.) Deploying is the orchestrator's job.
5. If the Worker cannot fetch its own public URL, add a service binding to itself called `PAYMENTS_SELF`; `payAgent` uses it automatically.

## Verify a payment
Open `https://sepolia.basescan.org/tx/<txHash>` (the `txHash` in the Payout / ledger). Expect a USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) `Transfer` from the buyer address to the agent's address with the wage amount (6 decimals), sent by the facilitator. Or view the agent's address: `https://sepolia.basescan.org/address/<agent wallet>#tokentxns`.

## Notes
- Versions: `@x402/hono`, `@x402/fetch`, `@x402/evm`, `@x402/core` 2.28.0, `viem` 2.57.5. Do not mix with `x402-hono`/`x402-fetch` 1.x (different protocol version).
- Library client cap is $1 per payment by default; `payAgent` raises it to $5 (the route also rejects amount > 5).
- Agent wallets in `src/shared/wallets.json` are throwaway addresses (no keys kept), so test USDC sent to them is unrecoverable by design. `walletFor()` prefers wallets.json over the placeholder wallets in `roster.ts`.
- Bundling check: `npx wrangler deploy --dry-run --outdir /tmp/gh-dry --name gadgethub-dry src/payments/dry-entry.ts` (`dry-entry.ts` is a bundling smoke entry, not used in production).
- Tests: `npx vitest run src/payments`.
