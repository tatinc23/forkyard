# primitiveOS (private demo for Ethan)

Unofficial concept built on ForkYard. Not affiliated with Primitive. Do not publish.

## Goal
A small taste: email a job to a Primitive address, ForkYard runs the crew in isolated forks, the reply comes back by email with a preview link.

## Build order
1. [x] Branch `primitiveos`, gateway adapter (mock default), webhook verify, env bindings.
2. [ ] `POST /api/primitive/inbound`: verify, dedupe by messageId, create job from email body, reply with watch link.
3. [ ] Send mail on plan ready, conflict, review ready, sign-off.
4. [ ] Re-skin UI (Primitive logo, colors, copy) + "Unofficial concept" footer.
5. [ ] Mobile pass, then deploy to forkyard.tatinc.us only at the reveal.

## Secrets
`PRIMITIVE_API_KEY` is a placeholder; inject via 1Password (`op`) into `wrangler secret put`. `PRIMITIVE_MODE` stays `mock` until the API shape is verified.

## Unverified assumptions
Send endpoint path, payload, auth header, and webhook signature scheme are guesses until checked against docs.primitive.dev.
