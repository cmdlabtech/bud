# Grok Bot Glass

Talk to your Grok Bots from Even G2 glasses (touchpads or R1 ring). See what needs you,
read short replies, and speak a message to any bot. Approvals always stay in the Grok Bot app.

```
app/      Even Hub plugin (SDK 0.0.14, Vite, TypeScript). Runs in the Even app WebView.
relay/    Cloudflare Worker + one SQLite Durable Object (Hono). The only server the app talks to.
bin/glass CLI bots use to post replies and needs-you items (token from env or file, never printed).
scripts/  dev helpers, fake Grok Bot webhook receiver, pack + bundle URL/secret check, simulator drivers.
store/    store icon (24x24, 1-bit, 2x2 blocks), simulator screenshots for the listing.
docs/     setup (with gates), store listing, privacy draft, submission checklist, simulator findings.
```

## Defaults (all changeable)

| Setting | Default | Where |
|---|---|---|
| App name | Grok Bot Glass | app/app.json `name` (≤20 chars, no "Even") |
| Package id | tech.cmdlab.grokbotglass | app/app.json `package_id` (permanent once uploaded) |
| Version | 1.0.0 | app/app.json `version` |
| Pilot bots | EDITH, Shuri | relay/src/roster.json `needs_feed`; webhook secrets decide which bots appear |
| Roster | 16 fleet bots | relay/src/roster.json (only bots with a configured webhook are shown) |
| Relay host | `grokbot-glass-relay.<subdomain>.workers.dev` | relay/wrangler.jsonc `name`; `GLASS_RELAY_URL` at pack time |
| Transcription | xAI speech-to-text, called by the relay (key stays server-side) | relay `XAI_API_KEY` secret |
| Reply wait | 3 min, then "still working, full reply in Grok Bot" | relay `REPLY_TIMEOUT_MS`, app/src/config.ts |
| Poll | every 15 s while open, paused in background, refresh on resume | app/src/config.ts |
| Retention | 7 days for messages, replies, needs items | relay/src/db.ts |

## Develop

```
npm install
node scripts/make-dev-vars.mjs          # local-only random tokens in relay/.dev.vars (gitignored)
npm run dev:relay                        # wrangler dev on :8788
node scripts/fake-grokbot.mjs            # fake bot webhooks on :9911 (replies after 1.5 s)
VITE_MIC_STUB=1 npm run dev:app          # app on :5174
# simulator, no network at all (in-browser fake relay, dev builds only):
scripts/sim-start.sh "fake=1&reset=1&devpair=12345678"   # modes: many, nobots, noneeds, offlinepair, flaky
npm test && npm run typecheck
```

## Build the package

```
GLASS_RELAY_URL=https://grokbot-glass-relay.<subdomain>.workers.dev npm run pack
```
Builds into `../builds/`, writes the relay origin into both the bundle and `network.whitelist`,
then runs `scripts/check-ehpk-urls.mjs`. That check fails the build on any URL literal outside
the whitelist, on secrets (xAI keys, device tokens, bearer literals, private keys, relay token names),
and on dev-only code (fake relay, dev pairing hook, localhost). Without `GLASS_RELAY_URL` you get a
`-candidate-placeholder` build that is not submittable.

## Security model (short)

- Nothing secret ships in the `.ehpk`. The device gets a token at pairing; only its SHA-256 is stored.
- Webhook URLs and sender keys exist only as Worker secrets. The app never sees them.
- Mutating calls carry a timestamp (±60 s) and a single-use request id (10 min). Rate limits per route.
- Errors are generic. Glasses can never approve anything: needs-you actions are hold, snooze 1h, ask at desk.

See docs/setup.md for the steps and approvals needed before first use.
