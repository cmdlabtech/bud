# Reviewer notes — BUD 1.0.3 (draft for CMDLAB)

## Notes to paste in the submission form (Option A: demo mode; needs a 1.0.4 build)
BUD sends spoken tasks from the G2 to the user's own Grok Bot (an AI agent service). Full use needs a Grok Bot
account and the user's own paid xAI API key, so reviewers can't send real tasks without them.

To review without accounts: open BUD on the phone and tap "Try demo". The glasses then show sample bots. Pick one,
press, speak, press to stop: a sample transcript appears (no audio leaves the phone in demo). Press to "send":
the Sent screen appears and nothing is sent. Every glasses screen, gesture, the locked-phone checks and the root
double-press exit dialog work the same as in normal use. Leave demo on the phone page.

Without demo mode, on first launch the glasses show "Open BUD on your phone to finish setup" and the steps left.

## Notes for Option B (no new build; reviewers need accounts)
BUD sends spoken tasks from the G2 to the user's own Grok Bot. It requires a Grok Bot account and the user's own
xAI API key. On first launch the glasses show "Open BUD on your phone to finish setup" and list what is missing;
the phone page walks through it (1/2 speech key, 2/2 connect your bot). The hub bot is a public Grok Bot template:
https://x.ai/bot/915uZ58K2YkQhevdmxt74. Add it, send it "Set up BUD for my glasses", and paste what it gives you into BUD. If you need test credentials, reply to
this submission and we will provide a time-limited test setup.

## Recommendation: Option A, demo mode (clear best)
- Reviewers can't create a Grok Bot account and paid xAI key just to review; without that, they only see the
  setup screen and can't check the core flow, gestures, locked-phone behaviour, or exit, which is most of the
  rubric. Rejection risk is high.
- Sharing CMDLAB's keys or webhook with reviewers means handing out secrets (a billed xAI key and a live bot
  webhook) through a form. Avoid.
- Demo mode also lets new users try BUD before paying for an xAI key.

Effort: about half a day (3-4 hours), as a 1.0.4 build:
- a "Try demo" button on the phone page and a "demo" flag in settings; sample generic bots;
- in demo, skip xAI (fixed sample transcript) and skip the forwarder (Sent screen, no network); mic still
  opens so the listening screen and level meter are real; a "DEMO" tag on every glasses header;
- leaving demo restores normal setup; tests for "demo makes no network calls"; the release check keeps
  rejecting dev fakes, so demo code is separate from the dev-only fake network;
- update the store copy (one line: "Try demo without accounts") and these notes.

## Setup instructions for new users: solved in 1.0.3
The public hub bot template (https://x.ai/bot/915uZ58K2YkQhevdmxt74) carries the routine prompt, so "Set up BUD for my glasses" works for
any user who adds it. The phone page links it ("Get the BUD hub bot"), the glasses' setup step says "Add the BUD
hub bot in Grok Bot, then paste setup", and the store "Get started" names it as step 2.
