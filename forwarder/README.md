# bud-forward — zero-retention forwarder for BUD

`POST /v1/send {webhook_url, key, body}` → one POST to `webhook_url`, which must match
`^https://api2\.cursor\.sh/automations/webhook/[A-Za-z0-9_-]+$`. The body is rebuilt from
`source, kind, request_id, text, ts`, sent with `Authorization: Bearer <key>` and `X-Automation-Key: <key>`,
with an 8 s timeout, `redirect: manual` and one try. The reply is only
`{ok, upstream_status?, error?}`; the upstream body is never read or returned.
`GET /v1/health` → `ok`. CORS `*` on `/v1/send` only.

Zero retention: no storage bindings, no console output, every error caught, and Workers Logs, traces, issues
and Logpush off (`wrangler.jsonc`, with doc links). Rate limiting (Workers Rate Limiting binding) counts
SHA-256 hashes of the webhook URL (10/min) and of the client IP (30/min). Limits: 6 KB request, 1,000-char text.

```
npm test                                   # 13 tests, incl. console spies + config guards
npx wrangler deploy --dry-run --outdir .dry-run
npm run dev:test                           # local, with ../scripts/fake-webhook.mjs on :8899
npx wrangler deploy                        # GATE: approve deploy
```
`retire/` holds the one-time stub that deletes bud-relay's GlassStore Durable Object class (see ../docs/setup.md).
