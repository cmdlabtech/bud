// Network endpoints. Every origin here must be on app.json network.whitelist
// (scripts/check-ehpk-urls.mjs fails the build on any other URL literal).
export const STT_URL = 'https://api.x.ai/v1/stt';            // xAI speech to text (REST, multipart), direct from the phone
export const STT_MODEL = 'grok-voice-transcribe-2.0';
// BUD forwarder (forwarder/, zero retention). Build setting: FORWARDER_URL (scripts/pack.mjs
// passes it as VITE_FORWARDER_URL). Grok Bot webhooks don't answer browser CORS, so sends go
// through it; the webhook URL and sender key stay on the phone and ride along in each send only.
export const FORWARDER_URL: string = (import.meta.env.VITE_FORWARDER_URL ?? '').replace(/\/+$/, '');
export const FORWARDER_SEND_PATH = '/v1/send';
// BUD feedback Worker (feedback/). Feedback is the one thing BUD keeps (a public GitHub issue);
// it is a separate Worker from the forwarder. Build setting: FEEDBACK_URL (VITE_FEEDBACK_URL).
export const FEEDBACK_URL: string = (import.meta.env.VITE_FEEDBACK_URL ?? '').replace(/\/+$/, '');
// xAI console API Keys page, as linked from xAI's quickstart (docs.x.ai/developers/quickstart). Link only.
export const XAI_KEYS_URL = 'https://console.x.ai/team/default/api-keys';
// Public Grok Bot template for the BUD hub bot (sets up its own inbox, lists the bots, routes tasks). Link only.
export const HUB_BOT_URL = 'https://x.ai/bot/915uZ58K2YkQhevdmxt74';
export const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=Z5SDZULELYGNS'; // link only, opened outside BUD
export const APP_VERSION: string = __APP_VERSION__;
export const MAX_TEXT_CHARS = 1000;                           // forwarder rejects longer text
export const SEND_TIMEOUT_MS = 12_000;                        // forwarder waits 8 s for the webhook
export const STT_TIMEOUT_MS = 30_000;
export const SENT_SCREEN_MS = 1_500;                          // "Sent to <bot>" then back to the list
export const MAX_BOTS = 30;
export const MIC_STUB: boolean = import.meta.env.DEV && import.meta.env.VITE_MIC_STUB === '1';
