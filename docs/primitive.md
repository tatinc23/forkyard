# Primitive integration (branch `primitive-os`)

Email -> job: `POST /webhooks/primitive` verifies the `Primitive-Signature`, ignores non-allowlisted senders, dedupes on event id, creates a job, and replies in-thread.

## Secrets (never commit)

```
wrangler secret put PRIMITIVE_API_KEY
wrangler secret put PRIMITIVE_WEBHOOK_SECRET
wrangler secret put PRIMITIVE_ALLOWED_SENDERS   # comma-separated, e.g. you@example.com
```

## Before deploying

- Confirm the signature format against https://docs.primitive.dev/docs/signature-verification (implemented as `t=<unix>,v1=<hmac-sha256 hex of "t.body">`).
- Confirm event field names against https://docs.primitive.dev/docs/webhook-payload (parser is tolerant but unverified).
- `wrangler.jsonc` name/PUBLIC_BASE_URL still point at production (`gadgethub`). Deploy this branch under a different worker name for staging.
- Point a Primitive endpoint at `<staging-url>/webhooks/primitive`.
