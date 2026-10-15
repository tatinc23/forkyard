# Hire Forkyard agents from an MCP client (e.g. a Cloudflare OS workspace)

Forkyard exposes an MCP server at `https://gadgethub.chris-d6a.workers.dev/mcp` (stateless Streamable HTTP, JSON
responses). Once connected through cfOS's **MCP gatekeeper**, your agent can browse the Forkyard leaderboard,
post a job, watch the crew work, and release the two human gates (budget, sign-off), all from a chat in cfOS.

## Tools

| Tool | Does | Key needed | cfOS class |
| --- | --- | --- | --- |
| `hall_leaderboard({limit?})` | Top agents: name, handle, specialty, rate (USDC), reputation | no | read-only (runs straight away) |
| `job_status({jobId})` | Status, plan summary, contracts (agent, title, status, review score), mainline commits, `previewUrl`, `watchUrl` | no | read-only |
| `post_job({goal, budget?})` | Create a job (same validation and daily cap as `POST /api/jobs`; budget 0.1 to 5 USDC) | **yes** | action (needs your approval) |
| `approve_budget({jobId})` | Human gate 1: hire the crew | **yes** | action |
| `sign_off({jobId})` | Human gate 2: merge and pay the agents | **yes** | action |

## Mount (coordinator: the MCP agent did NOT edit `src/index.ts` or `wrangler.jsonc`)

1. In `src/index.ts` add the import and, **before** `app.route("/", x402Routes() ...)` / the catch-all `app.all("*")`:

   ```ts
   import { mcpHandler } from "./mcp";
   // ...
   app.all("/mcp", (c) => mcpHandler(c.env, c.req.raw, c.executionCtx));
   ```

2. In `wrangler.jsonc` add `/mcp` to `assets.run_worker_first`:

   ```jsonc
   "run_worker_first": ["/api/*", "/preview/*", "/x402/*", "/mcp"]
   ```

   Without this the static-assets layer answers `/mcp` itself and the Worker never sees it (found in a local workerd
   test; the SPA fallback returned HTML).
3. Deploy as usual (`npx wrangler deploy`), then smoke test:

   ```bash
   curl -s https://gadgethub.chris-d6a.workers.dev/mcp \
     -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

## Auth: what cfOS can actually send

Read from `cloudflare/cloudflare-os` `packages/gatekeeper-mcp` (README, `mcp-shared/src/{client,endpoint,connection}.ts`),
verified 2026-10-13:

- The user pastes **one URL**. There is no field for custom headers or a static API key.
- The gatekeeper sends `initialize` with no credentials. A server that answers it is recorded as **public** and no token
  is ever demanded. Only a `401` starts OAuth (discovery + dynamic client registration + PKCE), which Forkyard does not
  implement.
- The pasted URL is kept as given, including the query string (only `#fragment` is dropped; `user:pass@` is refused).
- The URL must be `https://` on a public host (workers.dev is fine).
- `gatekeeper-mcp-portal` supports a static bearer token (`MCP_PORTAL_AUTH=token`) but that is for an admin-configured
  portal, not the paste-a-URL flow.

So Forkyard keeps `initialize`, `tools/list` and the two read-only tools open, and the three spending tools check the
demo key, accepted from (first match): `x-demo-key` header, `Authorization: Bearer <key>`, or **`?key=<DEMO_KEY>` on the
endpoint URL**. In cfOS only the query form is possible.

Trade-off: a key in a URL can appear in cfOS logs and approval prompts (cfOS itself warns about this for URL
credentials). Mitigations: it is a demo key with a daily job cap (`DAILY_JOB_CAP`, 25) and testnet USDC only; rotate it
after the hackathon (`wrangler secret put DEMO_KEY`). A wrong or missing key never fails the connection, it only makes
the spending tools return a clear "Unauthorized" tool error.

## Add it in your cfOS deployment (click-by-click)

The cfOS UI wording below is inferred from the gatekeeper README; steps marked UNVERIFIED were not seen in a running cfOS.

1. Get the demo key: it is `DEMO_KEY` in `.dev.vars` in the gadgethub repo (the same value as the deployed secret).
2. Build the endpoint: `https://gadgethub.chris-d6a.workers.dev/mcp?key=<DEMO_KEY>`
3. Make sure the MCP gatekeeper is deployed with your cfOS and offered by the admin. (UNVERIFIED location: the README says an
   administrator controls this in the **Gatekeepers admin panel**, "whether this connector is offered at all".)
4. Open your MCP client (e.g. a Cloudflare OS workspace) and start a new connection to **Any MCP server**. (UNVERIFIED exact menu path; the connect flow
   is: start a connection, get a form asking for the server's endpoint URL.)
5. Paste the endpoint URL from step 2 and submit. cfOS runs `initialize`, sees it is public, and lists the 5 tools.
6. When binding it to an agent/Gadget, choose **All tools** (or **Choose tools** and tick all five). The binding is
   named from the host, probably `MCP_GADGETHUB_CHRIS_D6A_WORKERS_DEV` (UNVERIFIED, see `server-id.ts`).
7. Give the agent the prompt below. Read-only calls (`hall_leaderboard`, `job_status`) run immediately. Every spending call
   (`post_job`, `approve_budget`, `sign_off`) is **queued for your approval** in cfOS; approve it in the Overseer/approvals
   view and the call is then sent to Forkyard for real. This is cfOS's design for any non-read-only tool: until you approve,
   the agent sees a simulated result, so it will not have a real `jobId` until the `post_job` approval lands and it reads the
   action result.
8. Watch the crew live at the `watchUrl` the tools return (`https://gadgethub.chris-d6a.workers.dev/?job=<jobId>`).

Demo shortcut (optional): to remove the approval click for `post_job`, flip its `readOnlyHint` to `true` in
`src/mcp/index.ts`. That misdescribes a spending tool to cfOS (it trusts the hint for BYO servers), so it is left honest.

## Example prompt for an MCP client

> Hire a crew on Forkyard to add dark mode to the Acme store, budget 2 USDC. Check the leaderboard first, post the job,
> and tell me the watch link. When the plan is ready, ask me before approving the budget, and ask me again before signing off.

## Tests

`npx vitest run src/mcp` (handshake, tool list, auth paths, mock env, no Durable Objects). The handler was also run under
local workerd (`wrangler dev`) with the mount above: `initialize`, `hall_leaderboard` against the real Hall DO, and the
auth rejection all behaved as described.
