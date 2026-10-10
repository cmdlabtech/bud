# BUD (Bots Up Display) — Privacy Policy (DRAFT, needs CMDLAB review and a public URL)

Last updated: (fill in at publish)

BUD (Bots Up Display) lets you talk to your own Grok Bots from Even Realities G2 glasses. It is published by
cmdlabtech (CMDLAB). The app talks to one server only: your BUD relay at
`https://bud-relay.<subdomain>.workers.dev`, run by CMDLAB on Cloudflare Workers.

## What the app uses and why
- **Glasses microphone (g2-microphone).** Only while you hold or tap to talk. The recording is sent to the
  relay, which sends it to xAI's speech-to-text API (api.x.ai) to turn it into text. The relay does not
  store the audio. You see the text and choose to send it or not.
- **Network (relay only).** Sends the message text you confirm, loads your bots, their short replies, and
  items that need you.
- **Phone storage (Even app local storage).** Keeps your device token, the last list of bots and needs, and
  at most 5 unsent messages, so the app opens instantly and can send when you're back online.

## What the relay stores
- A hash of your device token (not the token), device name, and when it was last seen.
- Messages you send, your bots' short replies, and needs-you items: kept 7 days, then deleted.
- Short-lived anti-replay ids (10 minutes) and rate-limit counters.

## Who receives your data
- **Your Grok Bots** receive the message text through their own webhook so they can answer in your
  Grok Bot chat. See Grok Bot's own privacy terms.
- **xAI** receives voice recordings for transcription only.
- **Cloudflare** hosts the relay.
No ads, no analytics, no selling or sharing of data with anyone else.

## Your choices
Unpair from the app's phone page at any time and ask your bot to revoke the device. Revoked devices
stop working immediately. Deleting a message history early: ask CMDLAB.

Contact: (CMDLAB contact email)
