# BUD — Bots Up Display

**BUD (Bots Up Display)** lets you talk to your Grok Bots from Even G2 glasses (touchpads or R1 ring):
pick a bot, speak a task, and BUD sends it. Replies and alerts come from Grok Bot's own phone
notifications, which the Even app mirrors to the glasses. Approvals always stay in the Grok Bot app.

**Zero retention:** BUD's forwarder passes your request straight to your bot and stores or logs nothing.
Your keys stay on your phone.

The app runs in the Even app's WebView on the phone and calls:
- **xAI speech to text** (`https://api.x.ai/v1/stt`) directly, with the user's own xAI API key. Audio never
  touches the forwarder.
- **the BUD forwarder** (`forwarder/`, a Cloudflare Worker run by CMDLAB, planned at
  `https://bud-forward.admin2655.workers.dev`): `POST /v1/send {webhook_url, key, body}`. It checks that the URL is
  `https://api2.cursor.sh/automations/webhook/<id>` (no other host, so it isn't an open proxy) and makes one
  request with the make-bot-ui headers. It returns only the status code. It is needed because Grok Bot webhooks
  don't answer the WebView's CORS preflight.

What passes through the forwarder, in transit only: the confirmed text (≤1,000 chars), request id, timestamp,
the webhook URL and sender key. Nothing is stored: there are no storage bindings, no `console` calls, and Workers
Logs, traces and Logpush are off (`forwarder/wrangler.jsonc`, enforced by tests). Rate limiting counts SHA-256
hashes in 60 s windows. Cloudflare carries the traffic as the host. Details: docs/privacy.md, docs/setup.md.

```
app/       Even Hub plugin (SDK 0.0.14, Vite, TypeScript). Glasses UI + phone setup page.
forwarder/ zero-retention Cloudflare Worker (POST /v1/send, GET /v1/health); retire/ retires bud-relay.
scripts/   pack + bundle URL/secret check, simulator drivers, fake webhook for local tests.
store/    simulator screenshots for the listing (icon is drawn in the Even portal's editor).
docs/     setup, store listing, privacy draft, submission checklist, simulator findings.
```

## Flow on the glasses
Bot list (swipe to move) → press or long press a bot to listen → release or press to stop →
transcript (press send, double cancel, long press redo) → "Sent to <bot>" for 1.5 s → back to the list.
A failed send shows a short reason; press retries.

## Phone page (BUD in the Even app)
Add, edit, delete and reorder bots (name, webhook URL, sender key), "Send test" per bot, and one xAI API key.
Everything is stored in the Even app's local storage on that phone. Keys are never logged and are shown only
as "saved, ends abcd" after saving. Webhook URLs and sender keys leave the phone only inside each send, to the
forwarder. The page shows the zero-retention note next to the key fields.

## Defaults
| Setting | Default | Where |
|---|---|---|
| App name | BUD (tagline "Bots Up Display") | app/app.json |
| Package id | tech.cmdlab.bud | app/app.json (permanent once uploaded) |
| Network whitelist | `https://api.x.ai`, forwarder origin | app/app.json (pack checks it equals these two) |
| Forwarder | `FORWARDER_URL`, default `https://bud-forward.admin2655.workers.dev` | scripts/pack.mjs → VITE_FORWARDER_URL |
| Forwarder limits | 6 KB request, 1,000-char text, 10 sends/min per webhook, 30/min per client, 8 s upstream timeout | forwarder/src/forward.ts, forwarder/wrangler.jsonc |
| Transcription | xAI `grok-voice-transcribe-2.0` | app/src/config.ts |
| Sent screen | 1.5 s | app/src/config.ts |

## Develop
```
npm install
VITE_MIC_STUB=1 npm run dev:app                 # app on :5174
scripts/sim-start.sh "fake=1"                   # simulator with faked xAI + forwarder (dev builds only)
                                                # also fake=sendfail, fake=sttfail
npm test && npm run typecheck                   # app + forwarder

# forwarder end to end, locally (never touches api2.cursor.sh)
node scripts/fake-webhook.mjs &                 # fake webhook on 127.0.0.1:8899
npm run dev:forwarder                           # wrangler dev on :8787 (wrangler.dev-test.jsonc)
VITE_FORWARDER_URL=http://127.0.0.1:8787 VITE_MIC_STUB=1 npm run dev:app
scripts/sim-start.sh "fake=sttonly"             # only xAI faked; sends go through the local forwarder
```

## Build the package
```
FORWARDER_URL=https://bud-forward.admin2655.workers.dev npm run pack
```
Builds into `../builds/`. Fails unless the app.json whitelist is exactly xAI + the forwarder origin, then runs
`scripts/check-ehpk-urls.mjs`, which fails on any URL literal outside the whitelist, on secrets (xAI keys, bearer
literals, private keys, a baked-in webhook URL), on a direct webhook origin, and on dev-only code (fake network,
localhost, DEV_UPSTREAM).

## Deploy status
Not deployed. Deploying bud-forward and retiring bud-relay are gated; the plan and rollback are in docs/setup.md.
