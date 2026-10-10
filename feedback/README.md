# bud-feedback

Feedback for BUD: `POST /api/feedback` files a private GitHub issue in cmdlabtech/bud (labels `feedback`,
`needs-triage`, `source:app|web`). A port of Wondereye's /api/feedback, in its own Worker so bud-forward stays
zero-retention and binding-free. **Feedback is the one thing BUD keeps.**

Routes:
- `POST /api/feedback` (+ `OPTIONS`): CORS only for loopback origins (the Even WebView, `http://127.0.0.1:<port>`);
  the `/feedback` page posts same-origin. Checks, in order: enabled, secrets present, origin, JSON ≤6 KB, strict
  schema (no extra keys such as email/webhook_url/key/text), honeypot, form time 3 s–2 h, ≤1 link, secret patterns
  (webhook URL, `xai-…`, GitHub tokens, Bearer), KV rate limits (3/h + 10/day per salted-hash IP, 50/day total),
  Turnstile siteverify + hostname, 24 h dedupe, then one GitHub issue. Errors are generic.
- `GET /verify-frame`, `/verify-frame.js`: Turnstile host frame for the app (Turnstile can't run on 127.0.0.1);
  `frame-ancestors` loopback only; posts `{source:'bud-verify'}` messages to the exact parent origin.
- `GET /feedback`, `/feedback.js`: standalone fallback form (opened in the phone browser), `X-Frame-Options: DENY`.
- `GET /health`.

Config (`wrangler.jsonc`): KV `FEEDBACK_KV`; vars `FEEDBACK_ENABLED`, `FEEDBACK_REPO`, `TURNSTILE_HOSTNAMES`,
`TURNSTILE_SITEKEY` (public), optional `FEEDBACK_DRY_RUN`. Secrets: `TURNSTILE_SECRET`, `GITHUB_FEEDBACK_TOKEN`
(fine-grained PAT, cmdlabtech/bud only, Issues read/write, with expiry). Logs, traces and Logpush off.
Deploy steps: docs/setup.md step 2b. Tests: `npm test` (28, GitHub and Turnstile faked).
