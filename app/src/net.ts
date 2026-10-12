// Network calls from the phone WebView:
//  - speech to text: directly to xAI with the user's key (audio never touches the forwarder);
//  - send: to the zero-retention BUD forwarder, which passes it to the bot's Grok Bot webhook.
// Nothing here logs a key, a header, or a request body.
import { FORWARDER_SEND_PATH, FORWARDER_URL, MAX_TEXT_CHARS, SEND_TIMEOUT_MS, STT_MODEL, STT_TIMEOUT_MS, STT_URL } from './config';
import type { BotConfig } from './types';

export type NetKind = 'network' | 'auth' | 'rate' | 'bad' | 'server' | 'nokey' | 'toolong' | 'config' | 'timeout';
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
// Hub mode adds an optional `target` (a display name from the bot list code) and kind "sync"
// (ask the hub for a fresh bot list code). Direct bots never get a target.
export type BodyKind = 'voice' | 'test' | 'sync';
export interface WebhookBody { source: 'bud'; kind: BodyKind; request_id: string; text: string; ts: number; target?: string }
export function webhookBody(kind: BodyKind, text: string, requestId = uuid(), now = Date.now(), target?: string): WebhookBody {
  const b: WebhookBody = { source: 'bud', kind, request_id: requestId, text, ts: now };
  if (target) b.target = target;
  return b;
}
export const SYNC_TEXT = 'Send my BUD bot list code.';

// Send through the forwarder: POST <FORWARDER_URL>/v1/send {webhook_url, key, body}.
// The forwarder re-sends body to webhook_url with the make-bot-ui headers (Authorization:
// Bearer <key> + X-Automation-Key: <key>, 8 s timeout, one try) and answers only
// {ok, upstream_status, error}; it never returns the webhook's body. 200 + ok means the routine woke.
export async function sendToBot(f: Fetch, bot: Pick<BotConfig, 'url' | 'key'>, body: WebhookBody, forwarder = FORWARDER_URL): Promise<void> {
  if (!forwarder) throw new NetError('config');
  if (body.text.length > MAX_TEXT_CHARS) throw new NetError('toolong');
  let res: Response;
  try {
    res = await f(forwarder + FORWARDER_SEND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: bot.url, key: bot.key, body }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch { throw new NetError('network'); }
  let out: { ok?: boolean; error?: string; upstream_status?: number } = {};
  try { out = await res.json(); } catch { /* status alone decides */ }
  if (res.status === 200 && out.ok === true) return;
  if (res.status === 502 && out.error === 'upstream' && typeof out.upstream_status === 'number') {
    throw new NetError(kindFor(out.upstream_status), out.upstream_status);
  }
  if (res.status === 504) throw new NetError('timeout', 504);
  if (res.status === 429) throw new NetError('rate', 429);
  if (res.status === 413 && out.error === 'text_too_long') throw new NetError('toolong', 413);
  if (res.status >= 400 && res.status < 500) throw new NetError('bad', res.status);
  throw new NetError('server', res.status);
}
