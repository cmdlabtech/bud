# Even Hub submission checklist — Grok Bot Glass 1.0.0

Source for every item: https://hub.evenrealities.com/docs/ship/app-submission (updated 2026-08-07) unless noted.
Status: ✅ done and verified locally · ⏳ needs a gate or CMDLAB · ❓ not verifiable here

## Manifest
- ✅ package_id `tech.cmdlab.grokbotglass` (valid format). ⏳ availability: `evenhub pack ... -c` contacts Even (run at gate time)
- ✅ edition 202601 · name 14 chars, no "Even" · version 1.0.0 · min_sdk_version 0.0.14 · CLI stamped min_app_version 2.2.9
- ✅ entrypoint index.html exists in the build folder (pack succeeded)
- ✅ permissions are objects with name+desc (103 and 145 chars); network has a whitelist of the relay origin only
- ✅ every permission is used: network (relay fetches), g2-microphone (`audioControl(true, AudioInputSource.Glasses)`)
- ✅ no secrets in the bundle ([packaging](https://hub.evenrealities.com/docs/ship/packaging) "Don't commit your API key"); scripts/check-ehpk-urls.mjs passes on the build and fails on a dev build (self-test)
- ⏳ changelog/release notes text: docs/store-listing.md

## Store listing & assets
- ✅ icon 24x24 1-bit, 2x2 blocks (validated) — ⏳ re-draw in the portal editor
- ❓ background image: required non-empty, monochrome; spec not in docs → check portal
- ✅ screenshots from the simulator screenshot API (store/screenshots)
- ✅ display name = app.json name
- ⏳ brand/impersonation: confirm right to use "Grok Bot" (store-listing.md risk 1)

## Privacy
- ⏳ publish docs/privacy.md at a public URL; it covers network + g2-microphone and names the relay, xAI, Cloudflare

## First run (no black screens)
- ✅ not paired → on-glasses "Not paired" screen with steps (sim shot 27) · pairing remembered in local storage
- ✅ first launch draws cached state or "Loading your bots..." before any network call; offline with no cache → Offline screen (sim shots 01, 26, 29)
- ✅ relay sends CORS headers (`Access-Control-Allow-Origin: *`, preflight 204, verified under wrangler dev)

## Locked phone (Beta build only — ❓ cannot test on the box)
- ⏳ phone locked + Even app backgrounded → app renders, no spinner/black screen
- ⏳ core flow on glasses + ring alone (pairing is the one-time phone step)
- ⏳ 2 minutes idle → still responsive (polling every 15 s, timers paused in background)
- ⏳ 5-minute lock test ([beta testing](https://hub.evenrealities.com/docs/test/beta-testing)); Android may cold-start the WebView → state is in local storage (cache, outbox, token) ([background & lifecycle](https://hub.evenrealities.com/docs/build/background-lifecycle))
- ✅ mic is re-armed on every talk (never assumed live after background); backgrounding while listening cancels and closes the mic

## Exit & lifecycle
- ✅ root double press → `shutDownPageContainer(1)` (Home page 1, Offline-as-root, Pairing, empty Home). Sim: shots 22, 31
- ❓ phone WebView closes after exit; Conversate launches after exit → check on device

## Permission denial
- ✅ mic: no audio within 3 s → "No sound from the glasses mic. In the Even app, allow the microphone..." (sim shot 41) ([beta testing](https://hub.evenrealities.com/docs/test/beta-testing) check 3)
- ✅ network: offline screen / "offline, saved HH:MM" header / queued sends

## Every gesture has a visible response
- ✅ boundary swipes flash "Top of list", "End of list", "No older messages here", "End of reply"; snooze/hold show a done line

## Final sanity loop (from the doc) — all ⏳ at gate time
1. `evenhub pack app.json dist -o ... -c` · 2. Beta install + 5-minute lock · 3. root double-tap → dialog + WebView closes · 4. Conversate launches · 5. privacy covers all permissions
