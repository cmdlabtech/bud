// Direct calls from the phone WebView: xAI speech to text, and the bot's Grok Bot webhook.
// No relay. Nothing here logs a key, a header, or a request body.
import { SEND_TIMEOUT_MS, STT_MODEL, STT_TIMEOUT_MS, STT_URL } from './config';
import type { BotConfig } from './types';

export type NetKind = 'network' | 'auth' | 'rate' | 'bad' | 'server' | 'nokey';
export class NetError extends Error { constructor(public kind: NetKind, public status = 0) { super(kind); } }

export type Fetch = typeof fetch;

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

function kindFor(status: number): NetKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status >= 400 && status < 500) return 'bad';
  return 'server';
}

// POST https://api.x.ai/v1/stt (multipart: file + model) -> { text }.
export async function transcribe(f: Fetch, xaiKey: string, wav: Uint8Array): Promise<string> {
  if (!xaiKey) throw new NetError('nokey');
  const form = new FormData();
  form.append('model', STT_MODEL);
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
  let res: Response;
  try {
    res = await f(STT_URL, { method: 'POST', headers: { Authorization: `Bearer ${xaiKey}` }, body: form, signal: AbortSignal.timeout(STT_TIMEOUT_MS) });
  } catch { throw new NetError('network'); }
  if (!res.ok) throw new NetError(kindFor(res.status), res.status);
  let data: any;
  try { data = await res.json(); } catch { throw new NetError('server', res.status); }
  return typeof data?.text === 'string' ? data.text.trim() : '';
}

// Body the "Glass inbox" routine reads (docs/setup.md). request_id lets the bot ignore duplicates.
export type BodyKind = 'voice' | 'test';
export function webhookBody(kind: BodyKind, text: string, requestId = uuid(), now = Date.now()) {
  return { source: 'bud', kind, request_id: requestId, text, ts: now };
}

// POST to the bot's webhook with its sender key, as the make-bot-ui skill specifies:
// Content-Type JSON, Authorization: Bearer <key>, X-Automation-Key: <key>, 8 s timeout, one try.
// 200 means the routine woke.
export async function sendToBot(f: Fetch, bot: BotConfig, body: ReturnType<typeof webhookBody>): Promise<void> {
  let res: Response;
  try {
    res = await f(bot.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bot.key}`, 'X-Automation-Key': bot.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch { throw new NetError('network'); }
  if (res.status !== 200) throw new NetError(kindFor(res.status), res.status);
}
