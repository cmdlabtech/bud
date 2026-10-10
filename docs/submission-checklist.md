# Even Hub submission checklist — BUD (Bots Up Display) 1.0.3 (hub mode)

Source for every item: https://hub.evenrealities.com/docs/ship/app-submission (updated 2026-08-07) unless noted.
Status: ✅ done and verified locally · ⏳ needs a gate or CMDLAB · ❓ not verifiable here

## 1.0.3 store run (Oct 10, 2026, against app-submission updated 2026-08-07)
| Check | Status | Note |
|---|---|---|
| package_id, edition, name ≤20 no "Even", semver, min_sdk 0.0.14, entrypoint | PASS | tech.cmdlab.bud, 202601, BUD, 1.0.3 |
| Permissions: objects, desc 1–300, network whitelist | PASS | 285 / 128 chars |
| Every permission used | PASS | network (xAI, forwarder, feedback), g2-microphone |
| No secrets in bundle | PASS | release check OK |
| Changelog / release notes non-empty | READY | docs/store-listing.md (151 chars, 1 line) |
| Icon legible, 1-bit, 2x2 | TODO | draw in the portal's 24x24 editor (docs/icon.md) |
| Foreground + background, greyscale | READY | store/cover/cover-576x288.png (spec unverified) |
| Screenshots from the simulator | PASS | store/screenshots/1-5 (576x288) |
| Display name = app.json = glasses | PASS | "BUD" |
| No impersonation / logos / keyword stuffing | PASS | Grok Bot named nominatively; "Not affiliated with xAI." |
| Privacy covers every permission; backend domains traceable | PASS (draft) | /privacy not live until bud-feedback deploy; contact is a placeholder |
| First run: on-glasses message, setup remembered, CORS | PASS | "Open BUD on your phone to finish setup"; localStorage; forwarder CORS |
| Reviewer can run the core flow | FAIL | needs a Grok Bot hub + xAI key: demo mode recommended (docs/review-notes.md) |
| New user can set up from the store copy | PASS | 1.0.3: public BUD hub bot template linked in the listing, phone page and glasses step |
| Locked phone, 2-min idle, unlock/relock | UNTESTED | needs a beta build on CMDLAB's phone |
| Root double press → shutDownPageContainer(1) | PASS | code + simulator |
| WebView closes after exit; Conversate launches | UNTESTED | on device |
| Content & safety | PASS | no medical/financial/emergency features; terms say so |
| `evenhub pack ... -c` (package_id availability) | NOT RUN | contacts Even; run at submission |

## Manifest
- ✅ package_id `tech.cmdlab.bud` (valid format). ⏳ availability: `evenhub pack ... -c` contacts Even (run at gate time)
- ✅ edition 202601 · name "BUD" 3 chars, no "Even" · version 1.0.3 · min_sdk_version 0.0.14 · CLI stamped min_app_version 2.2.9
- ✅ entrypoint index.html exists in the build folder (pack succeeded)
- ✅ permissions are objects with name+desc (network desc 285/300 chars); network whitelist is `https://api.x.ai`, `https://bud-forward.admin2655.workers.dev`, `https://bud-feedback.admin2655.workers.dev`, `https://challenges.cloudflare.com`, `https://www.paypal.com`, `https://console.x.ai` (exact origins, no wildcards; pack fails if it differs from FORWARDER_URL/FEEDBACK_URL + Turnstile + PayPal + xAI console; the last two are link-out literals, whitelisted as in Wondereye)
- ✅ every permission is used: network (xAI STT + forwarder POST + feedback POST/verify frame + Donate link literal), g2-microphone (`audioControl(true, AudioInputSource.Glasses)`)
- ✅ no secrets in the bundle ([packaging](https://hub.evenrealities.com/docs/ship/packaging) "Don't commit your API key"); scripts/check-ehpk-urls.mjs passes on the build and fails on a dev build (self-test)
- ⏳ changelog/release notes text: docs/store-listing.md

## Store listing & assets
- ⏳ icon: draw in the Developer Portal's 24x24 pixel editor (Even's tool; 1-bit, 2x2 blocks) ([design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines))
- ❓ background image: required non-empty, monochrome; spec not in docs → check portal
- ✅ screenshots: recaptured for the 1.0 scope with generic bot names (store/screenshots/1-4)
- ✅ no personal bot names in the bundle (release check) or the repo (`npm test` runs scripts/check-names.mjs)
- ✅ display name = app.json name
- ⏳ brand: name is BUD; confirm naming Grok Bot in the description (store-listing.md risk 1)

## Privacy
- ⏳ publish docs/privacy.md at a public URL; it covers network + g2-microphone, phone-only key storage, and names xAI, the CMDLAB forwarder (zero retention, Cloudflare-hosted) and Grok Bot; zero-retention copy matches forwarder/wrangler.jsonc

- ⏳ privacy draft also covers feedback (the one thing kept: private GitHub issue, hashed anti-spam counters ≤1 day), Turnstile and the PayPal link; zero-retention copy is scoped to the forwarder
- ✅ bud-feedback deployed Oct 10, 2026 (docs/setup.md step 2b); ⏳ one real test issue through the form (needs a human for the Turnstile checkbox)

## First run (no black screens)
- ✅ nothing set up → on-glasses "Open BUD on your phone to finish setup" with the missing steps (xAI key, hub); no network call at launch
- ✅ phone page first run: progress 1/2 → 2/2 → done; one Paste-setup box (URL, key, BUD1 code in any order), auto test after the hub is saved (tests/setup.spec.ts, evidence/hub/)
- ⏳ bud-forward update (target + sync) deployed before the 1.0.2 build ships (docs/setup.md step 1b)
- ⏳ reviewers need a hub: provide a test hub bot (routine + BUD1 code) or a note
- ✅ xAI STT allows CORS (`*`)
- ✅ Grok Bot webhook CORS (blocks the WebView) solved by the forwarder: `Access-Control-Allow-Origin: *` on /v1/send. Simulator WebView → local forwarder → fake webhook worked end to end (evidence/forwarder/).
- ⏳ forwarder deployed (gate "approve deploy"; docs/setup.md step 1) and health check ok

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
