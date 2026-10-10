// BUD forwarder: one zero-retention hop from the phone WebView to a Grok Bot webhook.
//
// Why it exists: api2.cursor.sh answers browser preflights only for its own origin, so the
// glasses app (a WebView on http://127.0.0.1) cannot POST to a webhook directly.
//
// What it does, and nothing more:
//   POST /v1/send  {webhook_url, key, body}  ->  POST webhook_url  (body re-built from known fields)
//   GET  /v1/health                          ->  "ok"
// Zero retention: no storage bindings, no cache, no console output of any kind, and Workers
// Logs / traces / Logpush are switched off in wrangler.jsonc. The only state it touches is the
// Rate Limiting binding, keyed by a SHA-256 hash (never the URL, key or text).
// Speech to text never comes here: the phone calls xAI directly.

export interface Env {
  RL_WEBHOOK: RateLimit;   // per webhook (hashed)
  RL_CLIENT: RateLimit;    // per client IP (hashed), stops spraying many webhook ids
  DEV_UPSTREAM?: string;   // local testing only; honored only for a loopback http origin
}

export const WEBHOOK_RE = /^https:\/\/api2\.cursor\.sh\/automations\/webhook\/[A-Za-z0-9_-]+$/;
export const MAX_URL_CHARS = 256;
export const MAX_KEY_CHARS = 512;
export const MAX_TEXT_CHARS = 1000;      // ~3x a 30 s recording
export const MAX_REQUEST_BYTES = 6144;   // whole JSON request
export const UPSTREAM_TIMEOUT_MS = 8000; // same as the make-bot-ui skill
const KEY_RE = /^[\x21-\x7E]{8,512}$/;   // printable ASCII, no spaces or line breaks
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEV_UPSTREAM_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const BASE: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

type Out = { ok: boolean; error?: string; upstream_status?: number };
function json(status: number, out: Out, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(out), { status, headers: { ...BASE, ...CORS, 'Content-Type': 'application/json', ...extra } });
}
const fail = (status: number, error: string, extra?: Record<string, string>) => json(status, { ok: false, error }, extra);

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Read at most `max` bytes; null if the body is bigger.
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

export type ForwardBody = { source: 'bud'; kind: 'voice' | 'test'; request_id: string; text: string; ts: number };
export type Parsed = { webhookUrl: string; key: string; body: ForwardBody };

// Validate and re-build. Unknown fields are dropped, so nothing else can ride along.
export function parseSend(raw: unknown): Parsed | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'bad_request';
  const r = raw as Record<string, unknown>;
  const url = r.webhook_url, key = r.key, b = r.body as Record<string, unknown> | undefined;
  if (typeof url !== 'string' || url.length > MAX_URL_CHARS || !WEBHOOK_RE.test(url)) return 'bad_webhook_url';
  if (typeof key !== 'string' || key.length > MAX_KEY_CHARS || !KEY_RE.test(key)) return 'bad_key';
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'bad_body';
  if (b.source !== 'bud' || (b.kind !== 'voice' && b.kind !== 'test')) return 'bad_body';
  if (typeof b.request_id !== 'string' || !REQUEST_ID_RE.test(b.request_id)) return 'bad_body';
  if (typeof b.text !== 'string' || !b.text.trim()) return 'bad_body';
  if (b.text.length > MAX_TEXT_CHARS) return 'text_too_long';
  if (typeof b.ts !== 'number' || !Number.isFinite(b.ts)) return 'bad_body';
  return { webhookUrl: url, key, body: { source: 'bud', kind: b.kind, request_id: b.request_id, text: b.text, ts: b.ts } };
}

export function upstreamTarget(webhookUrl: string, env: Env): string {
  const dev = env.DEV_UPSTREAM;
  if (dev && DEV_UPSTREAM_RE.test(dev)) return dev + new URL(webhookUrl).pathname;
  return webhookUrl;
}

async function send(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const ct = (req.headers.get('Content-Type') ?? '').toLowerCase();
  if (!ct.startsWith('application/json')) return fail(415, 'json_only');
  const bytes = await readCapped(req, MAX_REQUEST_BYTES);
  if (!bytes) return fail(413, 'too_large');
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail(400, 'bad_json'); }
  const p = parseSend(raw);
  if (typeof p === 'string') return fail(p === 'text_too_long' ? 413 : 400, p);

  if (!env.RL_WEBHOOK || !env.RL_CLIENT) return fail(500, 'misconfigured');
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  const [hookKey, ipKey] = await Promise.all([sha256('w:' + p.webhookUrl), sha256('c:' + ip)]);
  const [a, c] = await Promise.all([env.RL_CLIENT.limit({ key: ipKey }), env.RL_WEBHOOK.limit({ key: hookKey })]);
  if (!a.success || !c.success) return fail(429, 'rate_limited', { 'Retry-After': '60' });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(upstreamTarget(p.webhookUrl, env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, 'X-Automation-Key': p.key },
      body: JSON.stringify(p.body),
      redirect: 'manual',   // never follow the webhook somewhere else
      signal: ctl.signal,
    });
  } catch {
    return ctl.signal.aborted ? fail(504, 'timeout') : fail(502, 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  try { await res.body?.cancel(); } catch { /* upstream body is never read or returned */ }
  if (res.status === 200) return json(200, { ok: true, upstream_status: 200 });
  return json(502, { ok: false, error: 'upstream', upstream_status: res.status });
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  try {
    const { pathname } = new URL(req.url);
    if (pathname === '/v1/health') {
      return req.method === 'GET' ? new Response('ok', { headers: { ...BASE, 'Content-Type': 'text/plain' } }) : new Response(null, { status: 405, headers: { ...BASE, Allow: 'GET' } });
    }
    if (pathname === '/v1/send') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...BASE, ...CORS } });
      if (req.method === 'POST') return await send(req, env, fetchImpl);
      return fail(405, 'method', { Allow: 'POST, OPTIONS' });
    }
    return new Response('not found', { status: 404, headers: { ...BASE, 'Content-Type': 'text/plain' } });
  } catch {
    // Swallow so nothing about the request reaches an exception log.
    return fail(500, 'internal');
  }
}
