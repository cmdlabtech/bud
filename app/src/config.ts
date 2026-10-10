// Network endpoints. Both origins must match app.json network.whitelist exactly
// (scripts/check-ehpk-urls.mjs fails the build on any other URL literal).
export const STT_URL = 'https://api.x.ai/v1/stt';            // xAI speech to text (REST, multipart), direct from the phone
export const STT_MODEL = 'grok-voice-transcribe-2.0';
// BUD forwarder (forwarder/, zero retention). Build setting: FORWARDER_URL (scripts/pack.mjs
// passes it as VITE_FORWARDER_URL). Grok Bot webhooks don't answer browser CORS, so sends go
// through it; the webhook URL and sender key stay on the phone and ride along in each send only.
export const FORWARDER_URL: string = (import.meta.env.VITE_FORWARDER_URL ?? '').replace(/\/+$/, '');
export const FORWARDER_SEND_PATH = '/v1/send';
export const MAX_TEXT_CHARS = 1000;                           // forwarder rejects longer text
export const SEND_TIMEOUT_MS = 12_000;                        // forwarder waits 8 s for the webhook
export const STT_TIMEOUT_MS = 30_000;
export const SENT_SCREEN_MS = 1_500;                          // "Sent to <bot>" then back to the list
export const MAX_BOTS = 30;
export const MIC_STUB: boolean = import.meta.env.DEV && import.meta.env.VITE_MIC_STUB === '1';
