# Store listing — BUD (Bots Up Display) 1.0.5, FINAL DRAFT for CMDLAB's review

Nothing is submitted. Sources: [submission](https://hub.evenrealities.com/docs/ship/app-submission) (updated
2026-08-07), [packaging](https://hub.evenrealities.com/docs/ship/packaging), [design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines),
[videos EP13](https://hub.evenrealities.com/docs/learn/videos) (lists the form: .ehpk, name and tagline, icon,
simulator screenshots, category and search tags, privacy checklist). Even's docs give **no character limit for
the tagline or description and no screenshot pixel size**; the portal form may enforce its own. Counts below
are exact so they can be checked against the form.

## Fields

| Field | Text | Chars | Limit (source) |
|---|---|---|---|
| Name | BUD | 3 | ≤20, no "Even" ([packaging](https://hub.evenrealities.com/docs/ship/packaging)). Same as app.json and the glasses header. |
| Tagline | Bots Up Display | 15 | not documented |
| Description | below | 773 | not documented; "no keyword stuffing" ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Release notes (en) | below | 168 (1 line) | "1-3 lines per locale"; first version describes what the app does ([submission](https://hub.evenrealities.com/docs/ship/app-submission#release-notes)) |
| Permission: network | in app.json | 284 | desc 1–300 ([packaging](https://hub.evenrealities.com/docs/ship/packaging)) |
| Permission: g2-microphone | in app.json | 128 | desc 1–300 |
| Category | Productivity | – | values not documented; pick in the form |
| Search tags | assistant, voice, bots, productivity | – | not documented |
| Privacy policy URL | https://bud-feedback.admin2655.workers.dev/privacy | – | live (bud-feedback 72e45c28) |
| Terms URL | https://bud-feedback.admin2655.workers.dev/terms | – | live (bud-feedback 72e45c28) |
| Contact email (privacy/terms) | contact@cmdlab.tech | – | public contact on /privacy and /terms |
| Version / package | 1.0.5 / tech.cmdlab.bud | – | semver, reverse-domain ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |

### Description (773 characters)
    Talk to your Grok Bots from your G2. Pick a bot on your glasses, speak a task, check the text, and send. Replies arrive as Grok Bot notifications. Approvals stay in the Grok Bot app.

    Get started
    1. Get an xAI API key at console.x.ai and paste it in BUD on your phone.
    2. Add the BUD hub bot to Grok Bot: https://x.ai/bot/915uZ58K2YkQhevdmxt74, then send it "Set up BUD for my glasses".
    3. Paste the webhook URL and sender key from its "BUD hub inbox" routine (Webhook section, Grok Bot desktop app), then the code it sends back.
    4. On your glasses, pick a bot, speak, and send.

    Requires a Grok Bot account and your own xAI API key (paid, billed by xAI for speech-to-text).

    Zero retention: BUD's forwarder passes your request to your bot and stores or logs nothing. Your keys stay on your phone.

    Not affiliated with xAI.

### Release notes, en (168 characters)
    Get the BUD hub bot opens https://x.ai/bot/915uZ58K2YkQhevdmxt74. If the tap stays in the Even app, copy that https address into your phone's browser, then add the bot.

## Wording decisions
- **"Grok Bot"** is named only to say what BUD works with (nominative use): "your Grok Bots", "Grok Bot
  notifications", "Grok Bot app". No logo, not in the app name, and the description ends with "Not affiliated
  with xAI." Nothing says BUD is made or endorsed by xAI.
- **No audio-output claims** (the G2 has no speaker): replies are "notifications", never "spoken" or "heard".
- **Hub bot template link** (https://x.ai/bot/915uZ58K2YkQhevdmxt74, "BUD for Even Realities G2 by CMDLAB") is step 2, so a new user's Grok Bot gets the routine instructions from the template.
- **Generic bot names only** (Research bot, Inbox bot, ...), in copy and screenshots.
- **Costs are explicit:** a Grok Bot account and the user's own paid xAI API key.

## Visual assets
| Asset | File | Format | Rule |
|---|---|---|---|
| Screenshot 1, bot list | store/screenshots/1-bot-list.png | PNG 576x288 RGBA | captured with the simulator's screenshot function ([submission](https://hub.evenrealities.com/docs/ship/app-submission)); 576x288 is the G2 canvas ([FAQ](https://hub.evenrealities.com/docs/reference/faq)) |
| Screenshot 2, listening | store/screenshots/2-listening.png | same | |
| Screenshot 3, transcript | store/screenshots/3-transcript.png | same | |
| Screenshot 4, sent | store/screenshots/4-sent.png | same | |
| Screenshot 5, first run on the glasses | store/screenshots/5-setup-on-glasses.png | same | shows the "finish setup on your phone" screen |
| Background / cover candidate | store/cover/cover-576x288.png | PNG 576x288, 8-bit greyscale | "foreground and background supplied", "monochrome / greyscale only" ([submission](https://hub.evenrealities.com/docs/ship/app-submission)); exact spec not documented |
| Icon | drawn in the portal's 24x24 editor | 1-bit, 2x2 blocks | [design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines); see docs/icon.md |

Phone-page screenshots are not included: Even asks for screenshots that "match what the app actually renders on
device", captured via the simulator, which renders the glasses only.

Screenshots are from the 1.0.3 code in the simulator (`fake=hub` with a generic six-name BUD1 code), Oct 10, 2026.
