# Store listing draft (v1.0.0) — for CMDLAB's review

All copy avoids audio-output claims (the G2 has no speaker) and says approvals happen in the Grok Bot app only.

| Field | Draft | Rule it meets (source) |
|---|---|---|
| Name | Grok Bot Glass | ≤20 chars, must not contain "Even" ([submission](https://hub.evenrealities.com/docs/ship/app-submission), [packaging](https://hub.evenrealities.com/docs/ship/packaging)). 14 chars. |
| Package id | tech.cmdlab.grokbotglass | reverse-domain, lowercase, no hyphens/underscores, ≥2 segments, each starts with a letter ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Version | 1.0.0 | three-part semver, no `v`, no suffix ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Edition / min SDK | 202601 / 0.0.14; CLI stamps min_app_version 2.2.9 | ([packaging](https://hub.evenrealities.com/docs/ship/packaging): "SDK 0.0.14 publishes a floor of 2.2.9") — confirmed by our pack output |
| Languages | en | valid set en/de/fr/es/it/zh/ja/ko ([packaging](https://hub.evenrealities.com/docs/ship/packaging)) |
| Tagline | Talk to your Grok Bots from your G2. | `tagline` is not in Even's field table; Wondereye ships one. Portal also asks for a tagline ([videos](https://hub.evenrealities.com/docs/learn/videos), ep. on the submission form). |
| Description | See which of your Grok Bots need you, read their replies, and speak a message to any bot with a long press. Approvals stay in the Grok Bot app. Needs your own Grok Bot Glass relay and a pairing code from your Grok Bot. | no keyword stuffing ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Release notes (en) | Talk to your Grok Bots from your glasses: see what needs you, read replies page by page, and send a voice message with a long press. Approvals stay in the Grok Bot app. | first version describes what the app does, 1–3 lines ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Permission: network | Sends your messages to your own Grok Bot Glass relay and loads bot replies and the items that need you. Whitelist: the relay origin only. | `desc` 1–300 chars; network needs `whitelist`; declare only what is used ([packaging](https://hub.evenrealities.com/docs/ship/packaging)) |
| Permission: g2-microphone | Records a short voice message while you hold or tap to talk. The audio goes to your relay to be turned into text, and the relay does not keep it. | `g2-microphone` maps to `audioControl(true, AudioInputSource.Glasses)`, which app/src/main.ts calls ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |
| Icon | store/icon-24.png (speech bubble with three dots; grid in store/icon-24.txt) | 24x24, 1-bit, every lit pixel in a 2x2 block, drawn in the portal's editor ([design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines)); greyscale only, legible ([submission](https://hub.evenrealities.com/docs/ship/app-submission)). Validated by store/make_icon.py. Must be re-drawn in the portal editor. |
| Icon background | NOT PREPARED: the docs say "both foreground and background are supplied (neither null nor empty)" and monochrome ([submission](https://hub.evenrealities.com/docs/ship/app-submission)), but give no size or format. Check the portal form. | unverified |
| Screenshots | store/screenshots/1-home.png, 2-reply.png, 3-confirm-message.png, 4-needs-you.png, 5-long-reply.png | captured from the simulator's screenshot API (RGBA 576x288) ([submission](https://hub.evenrealities.com/docs/ship/app-submission), [simulator](https://hub.evenrealities.com/docs/test/simulator)). Taken with the dev fake relay (sample bot data). |
| Category / search tags | Productivity? / "assistant, voice, bots" | The portal asks for category and tags ([videos](https://hub.evenrealities.com/docs/learn/videos)); the allowed values aren't in the docs I read. Unverified. |
| Privacy policy | docs/privacy.md (draft) — needs a public URL | must cover every permission; backend domains documented and traceable to the developer ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) |

Hardware facts used in copy: the G2 has a 4-mic array (16 kHz PCM) and no camera or speaker; R1 has the same gestures ([overview](https://hub.evenrealities.com/docs)).

## Open listing risks for CMDLAB
1. **"Grok" in the name.** Even rejects impersonation and unauthorized brand use ([submission](https://hub.evenrealities.com/docs/ship/app-submission)). Public listing under "Grok Bot Glass" needs confirmation that CMDLAB may use the Grok Bot name. Otherwise keep it a beta/private build or rename.
2. **Single-user app in a public store.** The app only works with CMDLAB's own relay and pairing codes. Reviewers install it as beta testers ([submission](https://hub.evenrealities.com/docs/ship/app-submission)) and will hit the pairing screen. They need a review pairing code (a reviewer device that can be revoked later) and a note in the submission. A Beta group may fit better than Released.
3. **Content & safety:** no medical/financial advice or emergency routing in the app itself ([submission](https://hub.evenrealities.com/docs/ship/app-submission)). Bot replies are user-generated by CMDLAB's own bots.
