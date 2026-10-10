# BUD — Bots Up Display

**BUD (Bots Up Display)** lets you talk to your Grok Bots from Even G2 glasses (touchpads or R1 ring):
pick a bot, speak a task, and BUD sends it. **Hub mode (1.0.2):** connect one hub bot and every teammate shows up
on the glasses by name; the hub hands each task to the named bot (docs/hub-inbox.md). Replies and alerts come from Grok Bot's own phone
notifications, which the Even app mirrors to the glasses. Approvals always stay in the Grok Bot app.

**Zero retention:** BUD's forwarder passes your request straight to your bot and stores or logs nothing.
Your keys stay on your phone.

**Feedback is the one thing BUD keeps.** The phone page has a **Send feedback** form (same logic as Wondereye)
that files a private GitHub issue in cmdlabtech/bud through a separate Worker, `feedback/` (bud-feedback). It
never carries webhook URLs, keys or task text. The page also has a **Donate** pill (PayPal, same as Wondereye).

The app runs in the Even app's WebView on the phone and calls:
- **xAI speech to text** (`https://api.x.ai/v1/stt`) directly, with the user's own xAI API key. Audio never
  touches the forwarder.
- **the BUD forwarder** (`forwarder/`, a Cloudflare Worker run by CMDLAB, planned at
  `https://bud-forward.admin2655.workers.dev`): `POST /v1/send {webhook_url, key, body}`. It checks that the URL is
  `https://api2.cursor.sh/automations/webhook/<id>` (no other host, so it isn't an open proxy) and makes one
  request with the make-bot-ui headers. It returns only the status code. It is needed because Grok Bot webhooks
  don't answer the WebView's CORS preflight.

What passes through the forwarder, in transit only: the confirmed text (≤1,000 chars), kind (voice/test/sync),
request id, timestamp, in hub mode the target bot's display name (`target`, ≤24 chars), and the webhook URL and
sender key. Nothing is stored: there are no storage bindings, no `console` calls, and Workers
Logs, traces and Logpush are off (`forwarder/wrangler.jsonc`, enforced by tests). Rate limiting counts SHA-256
hashes in 60 s windows. Cloudflare carries the traffic as the host. Details: docs/privacy.md, docs/setup.md.

```
app/       Even Hub plugin (SDK 0.0.14, Vite, TypeScript). Glasses UI + phone setup page.
forwarder/ zero-retention Cloudflare Worker (POST /v1/send, GET /v1/health); retire/ retires bud-relay.
feedback/  bud-feedback Worker: POST /api/feedback -> GitHub issue (Turnstile, rate limits), verify frame, /feedback.
scripts/   pack + bundle URL/secret check, simulator drivers, fake webhook for local tests.
store/    simulator screenshots for the listing (icon is drawn in the Even portal's editor).
docs/     setup, store listing, privacy draft, submission checklist, simulator findings.
```

## Flow on the glasses
Bot list (swipe to move) → press or long press a bot to listen → release or press to stop →
transcript (press send, double cancel, long press redo) → "Sent to <bot>" for 1.5 s → back to the list.
A failed send shows a short reason; press retries.

## Phone page (BUD in the Even app)
First run shows **Setup 1/2: Speech key → Setup 2/2: Connect your hub bot → Setup done**; the glasses say
"Open BUD on your phone to finish setup" with the missing steps until then.
- **Speech to text:** **Paste key** reads the clipboard and saves the xAI key (pasting into the field saves too).
- **Connect your hub bot:** **Get the BUD hub bot** opens the public Grok Bot template (https://x.ai/bot/915uZ58K2YkQhevdmxt74) like Donate
  (`https://x.ai` is whitelisted for the link literal). Then **Copy** the message "Set up BUD for my glasses" for the hub bot, then one
  **Paste setup** box takes the hub's webhook URL, sender key and BUD1 bot list code in any order, in one paste or
  several (`app/src/setup.ts` tells them apart by pattern). A **Paste** button reads the clipboard when the WebView
  allows it, else long-press → Paste. A checklist shows Webhook URL / Sender key / Connection test / Bot list. When
  URL + key are in, BUD saves the hub and sends a test right away (kind `sync` if no names yet, which makes the hub
  reply with the code). The box is emptied after every paste. Resync, Send test, Clear names, Remove hub and
  **Enter by hand** stay available.
- **BUD1 bot list code** (`app/src/botcode.ts`): `BUD1.<base64url {"v":1,"bots":[...]}>.<first 6 hex of SHA-256 of
  the payload>`, names only (1–18, each ≤24 printable chars, no duplicates); anything URL- or key-like is refused.
  Example: `BUD1.eyJ2IjoxLCJib3RzIjpbIlJlc2VhcmNoIGJvdCIsIkluYm94IGJvdCIsIkNhbGVuZGFyIGJvdCJdfQ.05f001`
  (Research bot, Inbox bot, Calendar bot).
- **Direct bots (advanced, optional):** add, edit, delete and reorder bots (name, webhook URL, sender key), "Send
  test" per bot. They come after the hub's names on the glasses and send without `target`.
Everything is stored in the Even app's local storage on that phone. Keys are never logged and are shown only
as "saved, ends abcd" after saving. Webhook URLs and sender keys leave the phone only inside each send, to the
forwarder. The page shows the zero-retention note next to the key fields.

- **Get an xAI API key** (Speech to text card): link to xAI's console API Keys page
  (https://console.x.ai/team/default/api-keys, as linked from xAI's quickstart), opened like Donate, with the hint
  that the key stays on the phone.
- **Donate** (header): yellow pill to https://www.paypal.com/donate/?hosted_button_id=Z5SDZULELYGNS, opened like
  Wondereye's links (`a[data-external]` → `window.open(url, '_blank', 'noopener,noreferrer')`, falling back to the
  native `target="_blank"`). Link only; BUD fetches nothing from PayPal.
- **Send feedback** (More card): Bug / Idea / Other, optional title (80), message (10–2,000), honeypot, Cloudflare
  Turnstile in a frame served by bud-feedback (`/verify-frame`, because Turnstile can't run on the WebView's
  127.0.0.1 origin), and a "Send feedback in your browser instead" fallback to bud-feedback's `/feedback` page.
  The note says feedback is the one thing BUD keeps. The form refuses text that looks like a key or webhook URL
  or that contains a key saved on the phone; bud-feedback refuses the same patterns. No glasses menu item
  (Wondereye has none).

## Defaults
| Setting | Default | Where |
|---|---|---|
| App name | BUD (tagline "Bots Up Display") | app/app.json |
| Package id | tech.cmdlab.bud | app/app.json (permanent once uploaded) |
| Network whitelist | `https://api.x.ai`, forwarder, feedback, `https://challenges.cloudflare.com`, `https://www.paypal.com`, `https://console.x.ai` | app/app.json (pack checks it equals these six) |
| Feedback | `FEEDBACK_URL`, default `https://bud-feedback.admin2655.workers.dev` | scripts/pack.mjs → VITE_FEEDBACK_URL |
| Feedback limits | 3/hour and 10/day per hashed IP, 50/day total, 24 h duplicate drop, title 80, message 2,000 | feedback/src/feedback.ts |
| Forwarder | `FORWARDER_URL`, default `https://bud-forward.admin2655.workers.dev` | scripts/pack.mjs → VITE_FORWARDER_URL |
| Forwarder limits | 6 KB request, 1,000-char text, 10 sends/min per webhook, 30/min per client, 8 s upstream timeout | forwarder/src/forward.ts, forwarder/wrangler.jsonc |
| Transcription | xAI `grok-voice-transcribe-2.0` | app/src/config.ts |
| Sent screen | 1.5 s | app/src/config.ts |

## Develop
```
npm install
VITE_MIC_STUB=1 npm run dev:app                 # app on :5174
scripts/sim-start.sh "fake=1"                   # simulator with faked xAI + forwarder (dev builds only)
                                                # also fake=sendfail, fake=sttfail, fake=fbfail, fake=fbrate
                                                # (feedback is always faked with ?fake=..., no Turnstile, no GitHub)
npm test && npm run typecheck                   # app + forwarder + feedback

# forwarder end to end, locally (never touches api2.cursor.sh)
node scripts/fake-webhook.mjs &                 # fake webhook on 127.0.0.1:8899
npm run dev:forwarder                           # wrangler dev on :8787 (wrangler.dev-test.jsonc)
VITE_FORWARDER_URL=http://127.0.0.1:8787 VITE_MIC_STUB=1 npm run dev:app
scripts/sim-start.sh "fake=sttonly"             # only xAI faked; sends go through the local forwarder

# feedback end to end, locally, with Cloudflare's Turnstile TEST keys and dry run (no GitHub issue)
#   feedback/.dev.vars (gitignored): FEEDBACK_DRY_RUN="true", TURNSTILE_SITEKEY="1x00000000000000000000AA",
#   TURNSTILE_SECRET="1x0000000000000000000000000000000AA", GITHUB_FEEDBACK_TOKEN="unused",
#   TURNSTILE_HOSTNAMES="localhost,127.0.0.1"
(cd feedback && npx wrangler dev --port 8787)
VITE_FEEDBACK_URL=http://127.0.0.1:8787 npm run dev:app
```

## Build the package
```
FORWARDER_URL=https://bud-forward.admin2655.workers.dev FEEDBACK_URL=https://bud-feedback.admin2655.workers.dev npm run pack
```
Builds into `../builds/`. Fails unless the app.json whitelist is exactly xAI, the forwarder, the feedback origin,
Turnstile, PayPal and the xAI console, then runs
`scripts/check-ehpk-urls.mjs`, which fails on any URL literal outside the whitelist, on secrets (xAI keys, bearer
literals, private keys, a baked-in webhook URL), on a direct webhook origin, and on dev-only code (fake network,
localhost, DEV_UPSTREAM), and on any of CMDLAB's personal bot names (scripts/private-names.mjs). `npm test` also
runs `scripts/check-names.mjs` over every tracked file.

## Deploy status
- bud-forward deployed Oct 10, 2026, 11:44 AM ET: https://bud-forward.admin2655.workers.dev, version
  f5604034-b049-4ea2-99d0-0d386431e4ec. Live checks: health ok; preflight 204 with ACAO `*`; a non-cursor URL
  gets 400 `bad_webhook_url`; Workers Logs shows 0 events for bud-forward.
- bud-relay is still deployed (relay code, GlassStore DO, ADMIN_TOKEN/BOT_WRITE_TOKEN). Retiring it is a separate
  gate (docs/setup.md step 2).
- bud-feedback deployed Oct 10, 2026, 12:12 PM ET: https://bud-feedback.admin2655.workers.dev, version
  3ff2f39f-3932-4fa7-981d-2e7d7364527f (dry run off). KV namespace bud-feedback (87fcef0a9d15403593d72a219d3c05d3);
  secrets TURNSTILE_SECRET and GITHUB_FEEDBACK_TOKEN set; labels feedback, needs-triage, source:app, source:web
  created in cmdlabtech/bud. Live checks: health ok, verify frame and /feedback served with their CSP, loopback
  CORS only, a dummy Turnstile token is refused (403), and the Turnstile widget renders on the Worker's host.
  Kill switch: FEEDBACK_ENABLED.
