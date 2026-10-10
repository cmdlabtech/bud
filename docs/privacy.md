# BUD (Bots Up Display) — Privacy Policy (DRAFT, needs CMDLAB review and a public URL)

Last updated: (fill in at publish)

BUD (Bots Up Display) lets you talk to your own Grok Bots from Even Realities G2 glasses. It is published by
cmdlabtech (CMDLAB).

**Zero retention:** BUD's forwarder passes your request straight to your bot and stores or logs nothing.
Your keys stay on your phone. Your voice goes directly from your phone to xAI and never through BUD's forwarder.

## What the app uses and why
- **Glasses microphone (g2-microphone).** Only while you hold or tap to talk. The recording goes from your
  phone **directly** to xAI's speech-to-text API (api.x.ai) with your own xAI API key. BUD does not store the
  audio, and it never passes through BUD's forwarder. You see the text and choose whether to send it.
- **Phone storage (Even app local storage).** Your bot list (names, webhook URLs, sender keys) and your xAI
  API key are saved only on your phone. After you save a key, the page shows only its last four characters.
- **Network.** Two destinations only:
  1. **xAI** (api.x.ai): your recording and your xAI key, for speech to text.
  2. **BUD's forwarder** (bud-forward, run by CMDLAB on Cloudflare Workers): each time you send, it receives
     the text you confirmed (up to 1,000 characters), that bot's webhook URL, and its sender key, plus a request
     id and a timestamp. It immediately makes one request to that Grok Bot webhook (api2.cursor.sh only), then
     answers your phone with only "sent" or "not sent" and a status code.

## What the forwarder does not do
The forwarder exists only because Grok Bot webhooks can't be called directly from inside the Even app's WebView.
It has no database or file storage of any kind, writes nothing to logs, and does not read or return your bot's
reply. Cloudflare's Workers Logs, tracing and Logpush are switched off for it. You can check this in the source
(`forwarder/`) and its configuration (`forwarder/wrangler.jsonc`).

To limit abuse, the forwarder counts requests for each bot and each sender connection over 60-second windows
(up to 10 sends a minute per bot) using Cloudflare's rate limiting. The counter uses a one-way hash of the
webhook URL or of the connecting IP address. No text, URL, key or readable IP address is used for counting.

## Hosting
The forwarder runs on Cloudflare's network. Like any host, Cloudflare carries the traffic and handles it under
its own privacy policy (https://www.cloudflare.com/privacypolicy/), for example aggregate request counts and
network security. The forwarder adds no logging or storage on top of that.

## Who receives your data
- **xAI** receives your recordings for transcription, under your own xAI account. See xAI's privacy terms.
- **Grok Bot** (the webhook service) receives the text you confirm, so your bot can work on it and reply in your
  Grok Bot chat. See Grok Bot's privacy terms.
- **CMDLAB** receives nothing it keeps: the forwarder passes the text, webhook URL and key through while they are
  in transit only.
BUD has no ads, no analytics, and no account, and no data is sold or shared with anyone else.

## Your choices
Delete a bot or remove your xAI key on the BUD phone page at any time. Uninstalling BUD removes its local storage
from the Even app.

Contact: (CMDLAB contact email)
