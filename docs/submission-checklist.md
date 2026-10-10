# Even Hub submission checklist — BUD (Bots Up Display) 1.0.0

Source for every item: https://hub.evenrealities.com/docs/ship/app-submission (updated 2026-08-07) unless noted.
Status: ✅ done and verified locally · ⏳ needs a gate or CMDLAB · ❓ not verifiable here

## Manifest
- ✅ package_id `tech.cmdlab.bud` (valid format). ⏳ availability: `evenhub pack ... -c` contacts Even (run at gate time)
- ✅ edition 202601 · name "BUD" 3 chars, no "Even" · version 1.0.0 · min_sdk_version 0.0.14 · CLI stamped min_app_version 2.2.9
- ✅ entrypoint index.html exists in the build folder (pack succeeded)
- ✅ permissions are objects with name+desc; network whitelist is `https://api.x.ai` and `https://api2.cursor.sh` (exact origins, no wildcards)
- ✅ every permission is used: network (xAI STT + webhook POST), g2-microphone (`audioControl(true, AudioInputSource.Glasses)`)
- ✅ no secrets in the bundle ([packaging](https://hub.evenrealities.com/docs/ship/packaging) "Don't commit your API key"); scripts/check-ehpk-urls.mjs passes on the build and fails on a dev build (self-test)
- ⏳ changelog/release notes text: docs/store-listing.md

## Store listing & assets
- ⏳ icon: draw in the Developer Portal's 24x24 pixel editor (Even's tool; 1-bit, 2x2 blocks) ([design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines))
- ❓ background image: required non-empty, monochrome; spec not in docs → check portal
- ⏳ screenshots: recapture for the 1.0 scope (store/screenshots shows relay-era screens)
- ✅ display name = app.json name
- ⏳ brand: name is BUD; confirm naming Grok Bot in the description (store-listing.md risk 1)

## Privacy
- ⏳ publish docs/privacy.md at a public URL; it covers network + g2-microphone, phone-only key storage, and names xAI and Grok Bot

## First run (no black screens)
- ✅ nothing set up → on-glasses "No bots set up yet" screen pointing to the phone page; no network call at launch
- ✅ xAI STT allows CORS (`*`)
- ❌ Grok Bot webhook CORS: blocks the WebView origin (docs/setup.md step 0). Blocker.

## Locked phone (Beta build only — ❓ cannot test on the box)
- ⏳ phone locked + Even app backgrounded → app renders, no spinner/black screen
- ⏳ core flow on glasses + ring alone (setup on the phone page is the one-time step)
- ⏳ 2 minutes idle → still responsive (no polling at all in 1.0)
- ⏳ 5-minute lock test ([beta testing](https://hub.evenrealities.com/docs/test/beta-testing)); Android may cold-start the WebView → settings are in local storage ([background & lifecycle](https://hub.evenrealities.com/docs/build/background-lifecycle))
- ✅ mic is re-armed on every talk (never assumed live after background); backgrounding while listening cancels and closes the mic

## Exit & lifecycle
- ✅ root double press → `shutDownPageContainer(1)` (bot list, setup screen)
- ❓ phone WebView closes after exit; Conversate launches after exit → check on device

## Permission denial
- ✅ mic: no audio within 3 s → "No sound from the glasses mic. In the Even app, allow the microphone..." (sim shot 41) ([beta testing](https://hub.evenrealities.com/docs/test/beta-testing) check 3)
- ✅ network: send failure screen with reason and press-to-retry; STT failure reason on the transcript

## Every gesture has a visible response
- ✅ boundary swipes flash "Top of list" / "End of list"; every screen has a footer hint

## Final sanity loop (from the doc) — all ⏳ at gate time
1. `evenhub pack app.json dist -o ... -c` · 2. Beta install + 5-minute lock · 3. root double-tap → dialog + WebView closes · 4. Conversate launches · 5. privacy covers all permissions
