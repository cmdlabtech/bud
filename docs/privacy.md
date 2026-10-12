# BUD (Bots Up Display) Privacy Policy

Effective: October 10, 2026 (BUD 1.0.3)

BUD (Bots Up Display) lets you talk to your own Grok Bots from Even Realities G2 glasses. It is published by
CMDLAB (cmdlabtech). BUD is an independent app, not affiliated with or endorsed by xAI or Even Realities. It works with your own Grok Bot account and your own xAI API key.

**Zero retention:** BUD's forwarder passes your request straight to your bot and stores or logs nothing.
Your keys stay on your phone. Your voice goes directly from your phone to xAI and never through BUD's forwarder.

**The one thing BUD keeps is feedback you choose to send** from the phone page. It goes to a separate service
(bud-feedback), not the forwarder, and is posted as a **public** GitHub issue in cmdlabtech/bud that anyone can read (details below). Don't include
personal information.

## What the app uses and why
- **Glasses microphone (g2-microphone).** Only while you hold or tap to talk. The recording goes from your
  phone **directly** to xAI's speech-to-text API (api.x.ai) with your own xAI API key. BUD does not store the
  audio, and it never passes through BUD's forwarder. You see the text and choose whether to send it.
- **Phone storage (Even app local storage).** Your hub bot's webhook URL and sender key, the bot names from
  your hub's bot list code, any direct bots (names, webhook URLs, sender keys) and your xAI API key are saved
  only on your phone. The bot list code holds bot names only, never a link or key; BUD refuses any code that
  looks like it contains one. Anything you paste into the setup box is used on the phone and the box is
  emptied right away. After you save a key, the page shows only its last four characters.
- **Network.** For BUD's main job, two destinations only:
  1. **xAI** (api.x.ai): your recording and your xAI key, for speech to text.
  2. **BUD's forwarder** (bud-forward, run by CMDLAB on Cloudflare Workers): each time you send, it receives
     the text you confirmed (up to 1,000 characters), the webhook URL and sender key it goes to (your hub bot's,
     or a direct bot's), and, in hub mode, the name of the bot the task is for (up to 24 characters), plus a
     request id and a timestamp. Your hub bot then hands the task to that teammate inside Grok Bot. It immediately makes one request to that Grok Bot webhook (api2.cursor.sh only), then
     answers your phone with only "sent" or "not sent" and a status code.

  Only if you use them: **Send feedback** contacts BUD's feedback service (bud-feedback, also on Cloudflare
  Workers) and Cloudflare Turnstile (challenges.cloudflare.com) for a bot check; **Donate** opens PayPal
  (paypal.com) outside BUD. BUD sends PayPal nothing. **Get an xAI API key** and **Get the BUD hub bot** open
  xAI's console and the BUD hub bot template on x.ai, also outside BUD; BUD sends them nothing.

## Feedback (the one thing BUD keeps)
If you open **Send feedback** and press Send, BUD sends: the category (bug, idea or other), your title (optional,
up to 80 characters) and message (up to 2,000 characters), the BUD version, and technical anti-spam fields (a
Cloudflare Turnstile token, how long the form was open, and an empty hidden field). It never includes your
webhook URLs, sender keys, xAI key, or the tasks you send: the form refuses text that looks like a key or webhook
URL, or that contains a key saved on your phone, and the server refuses the same patterns again.

- **Where it is kept:** as a **public** issue in BUD's GitHub repository (https://github.com/cmdlabtech/bud), labelled
  `feedback`. Anyone can read it. The developer can read and act on it. GitHub stores it under its own privacy terms
  (https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). It stays until
  CMDLAB closes and deletes it; ask at the contact below to have yours removed.
- **What is not kept:** no name, email or account, and no IP address. The issue includes a shortened browser
  description (user agent) to help reproduce bugs.
- **Anti-spam:** the feedback service keeps short-lived counters keyed by a one-way hash of your IP address
  (limits: 3 an hour, 10 a day) and a one-way hash of each message for 24 hours to drop duplicates. These expire
  within a day and contain no readable IP address or message text. Cloudflare Turnstile checks that a person is
  sending, under Cloudflare's privacy policy (https://www.cloudflare.com/turnstile-privacy-policy/).
- **Don't include personal information** (names, emails, phone numbers, addresses), because feedback is public. The zero-retention promise above is about the forwarder and the tasks you
  send; it does not cover feedback, which is kept on purpose.

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
- **CMDLAB** keeps nothing from your tasks: the forwarder passes the text, bot name, webhook URL and key through while they
  are in transit only. CMDLAB does keep feedback you choose to send (see above).
- **GitHub** hosts feedback as public issues in the cmdlabtech/bud repository; **Cloudflare** runs the Turnstile check for
  feedback.
BUD has no ads, no analytics, and no account, and no data is sold or shared with anyone else.
Donations go through PayPal's own site under PayPal's terms; BUD never sees payment details.

## Your choices
Remove the hub, clear the bot names, delete a direct bot or remove your xAI key on the BUD phone page at any time. Uninstalling BUD removes its local storage
from the Even app.

## Children
BUD is not directed at children under 13 and does not knowingly collect their information.

## Changes
If this policy changes, the new version is posted at this address with a new effective date.

## Contact
Questions or removal requests: contact@cmdlab.tech
