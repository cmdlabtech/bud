# BUD (Bots Up Display) — Privacy Policy (DRAFT, needs CMDLAB review and a public URL)

Last updated: (fill in at publish)

BUD (Bots Up Display) lets you talk to your own Grok Bots from Even Realities G2 glasses. It is published by
cmdlabtech (CMDLAB). BUD has no server of its own and collects nothing for itself.

## What the app uses and why
- **Glasses microphone (g2-microphone).** Only while you hold or tap to talk. The recording is sent from your
  phone directly to xAI's speech-to-text API (api.x.ai) with your own xAI API key to turn it into text.
  BUD does not store the audio. You see the text and choose to send it or not.
- **Network.** Two destinations only: xAI (api.x.ai) for speech to text, and the Grok Bot webhook of the bot
  you picked (api2.cursor.sh) to deliver the text you confirmed.
- **Phone storage (Even app local storage).** Your bot list (names, webhook URLs, sender keys) and your xAI
  API key. These are stored only on your phone, are never sent to CMDLAB, and are shown only partly
  ("ends abcd") after you save them. Each key is sent only to its own service: the xAI key to xAI, each
  sender key to that bot's webhook.

## Who receives your data
- **xAI** receives your voice recordings for transcription, under your own xAI account. See xAI's privacy terms.
- **Grok Bot** (the webhook service) receives the message text you confirm, so your bot can work on it and
  reply in your Grok Bot chat. See Grok Bot's privacy terms.
No ads, no analytics, no BUD server, no selling or sharing of data with anyone else.

## Your choices
Delete a bot or remove your xAI key on the BUD phone page at any time. Uninstalling BUD removes its
local storage from the Even app.

Contact: (CMDLAB contact email)
