// Network endpoints. Both origins must match app.json network.whitelist exactly
// (scripts/check-ehpk-urls.mjs fails the build on any other URL literal).
export const STT_URL = 'https://api.x.ai/v1/stt';            // xAI speech to text (REST, multipart)
export const STT_MODEL = 'grok-voice-transcribe-2.0';
export const WEBHOOK_ORIGIN = 'https://api2.cursor.sh';       // Grok Bot webhook routines (make-bot-ui skill)
export const WEBHOOK_PATH = '/automations/webhook/';
export const SEND_TIMEOUT_MS = 8_000;                         // same as the make-bot-ui skill
export const STT_TIMEOUT_MS = 30_000;
export const SENT_SCREEN_MS = 1_500;                          // "Sent to <bot>" then back to the list
export const MAX_BOTS = 30;
export const MIC_STUB: boolean = import.meta.env.DEV && import.meta.env.VITE_MIC_STUB === '1';
