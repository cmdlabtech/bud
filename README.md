# BUD — Bots Up Display

**BUD (Bots Up Display)** lets you talk to your Grok Bots from Even G2 glasses (touchpads or R1 ring):
pick a bot, speak a task, and BUD sends it. Replies and alerts come from Grok Bot's own phone
notifications, which the Even app mirrors to the glasses. Approvals always stay in the Grok Bot app.

BUD 1.0 has no server of its own. The app runs in the Even app's WebView on the phone and calls:
- **xAI speech to text** (`https://api.x.ai/v1/stt`) with the user's own xAI API key;
- **the picked bot's Grok Bot webhook** (`https://api2.cursor.sh/automations/webhook/<id>`) with that bot's sender key.

```
app/      Even Hub plugin (SDK 0.0.14, Vite, TypeScript). Glasses UI + phone setup page.
scripts/  pack + bundle URL/secret check, simulator drivers.
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
as "saved, ends abcd" after saving.

## Defaults
| Setting | Default | Where |
|---|---|---|
| App name | BUD (tagline "Bots Up Display") | app/app.json |
| Package id | tech.cmdlab.bud | app/app.json (permanent once uploaded) |
| Network whitelist | `https://api.x.ai`, `https://api2.cursor.sh` | app/app.json, app/src/config.ts |
| Transcription | xAI `grok-voice-transcribe-2.0` | app/src/config.ts |
| Sent screen | 1.5 s | app/src/config.ts |

## Develop
```
npm install
VITE_MIC_STUB=1 npm run dev:app                 # app on :5174
scripts/sim-start.sh "fake=1"                   # simulator with faked xAI + webhooks (dev builds only)
                                                # also fake=sendfail, fake=sttfail
npm test && npm run typecheck
```

## Build the package
```
npm run pack
```
Builds into `../builds/` and runs `scripts/check-ehpk-urls.mjs`, which fails the build on any URL literal
outside the whitelist, on secrets (xAI keys, bearer literals, private keys, a baked-in webhook URL) and on
dev-only code (fake network, localhost).

## Known blocker (Oct 10, 2026)
The Grok Bot webhook host does not allow cross-origin requests from the Even WebView (its CORS preflight
only allows `https://cursor.com`), and Even's WebView enforces CORS. Until that changes, sends from the
glasses fail with "Couldn't reach Grok Bot". See docs/setup.md.
