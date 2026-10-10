import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handle, MAX_TEXT_CHARS, upstreamTarget, type Env } from '../src/forward';

const HOOK = 'https://api2.cursor.sh/automations/webhook/AbC_123-xyz';
const KEY = 'sender-key-SECRET-9f8e7d';
const TEXT = 'Remind me to call the bank at three. SECRET-TEXT';
const body = (over: Record<string, unknown> = {}) => ({ source: 'bud', kind: 'voice', request_id: 'rid-1', text: TEXT, ts: 1, ...over });
const payload = (over: Record<string, unknown> = {}) => ({ webhook_url: HOOK, key: KEY, body: body(), ...over });

function limiter(allow = true) {
  const keys: string[] = [];
  return { keys, limit: vi.fn(async ({ key }: { key: string }) => { keys.push(key); return { success: allow }; }) };
}
function env(over: Partial<Record<keyof Env, unknown>> = {}) {
  const RL_WEBHOOK = limiter(), RL_CLIENT = limiter();
  return { RL_WEBHOOK, RL_CLIENT, ...over } as any;
}
const post = (data: unknown, headers: Record<string, string> = {}) =>
  new Request('https://bud-forward.example/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', Origin: 'http://127.0.0.1:5173', ...headers },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  });
const upstreamOk = () => vi.fn(async (_u: any, _i?: any) => new Response('UPSTREAM-BODY-SECRET', { status: 200 }));

// Every console method is watched in every test; none may be called (zero retention).
const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const;
let spies: any[] = [];
beforeEach(() => { spies = METHODS.map(m => vi.spyOn(console, m).mockImplementation(() => {})); });
afterEach(() => {
  for (const s of spies) expect(s, 'console must never be called').not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('POST /v1/send', () => {
  it('forwards a re-built body with the make-bot-ui headers and returns only status + ok', async () => {
    const f = upstreamOk();
    const res = await handle(post(payload({ extra: 'x', body: { ...body(), smuggled: 'no' } })), env(), f as any);
    expect(res.status).toBe(200);
    const out = await res.text();
    expect(JSON.parse(out)).toEqual({ ok: true, upstream_status: 200 });
    expect(out).not.toContain('UPSTREAM-BODY-SECRET');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(HOOK);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-Automation-Key': KEY });
    expect(JSON.parse(init.body)).toEqual(body());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('never returns the upstream body, only its status', async () => {
    for (const status of [401, 403, 404, 429, 500, 302]) {
      const f = vi.fn(async () => new Response('UPSTREAM-BODY-SECRET', { status, headers: status === 302 ? { Location: 'https://evil.example' } : {} }));
      const res = await handle(post(payload()), env(), f as any);
      const out = await res.text();
      expect(res.status).toBe(502);
      expect(JSON.parse(out)).toEqual({ ok: false, error: 'upstream', upstream_status: status });
      expect(out).not.toContain('SECRET');
      expect(res.headers.get('Location')).toBeNull();
    }
  });

  it('only api2.cursor.sh webhook URLs are accepted (not an open proxy)', async () => {
    const bad = [
      'http://api2.cursor.sh/automations/webhook/abc', 'https://api2.cursor.sh/automations/webhook/',
      'https://api2.cursor.sh/automations/webhook/abc?x=1', 'https://api2.cursor.sh/automations/webhook/abc#x',
      'https://api2.cursor.sh/automations/webhook/abc/../../x', 'https://api2.cursor.sh/other/abc',
      'https://api2.cursor.sh.evil.com/automations/webhook/abc', 'https://evil.com/automations/webhook/abc',
      'https://user:pw@api2.cursor.sh/automations/webhook/abc', 'https://API2.cursor.sh/automations/webhook/abc',
      'https://api2.cursor.sh:444/automations/webhook/abc', 'https://api2.cursor.sh/automations/webhook/abc\n',
      'https://api2.cursor.sh/automations/webhook/' + 'a'.repeat(300), 42, null,
    ];
    for (const webhook_url of bad) {
      const f = upstreamOk();
      const res = await handle(post(payload({ webhook_url })), env(), f as any);
      expect(res.status, String(webhook_url)).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad_webhook_url' });
      expect(f).not.toHaveBeenCalled();
    }
  });

  it('rejects bad keys, bodies, JSON and content types without echoing input', async () => {
    const cases: [any, number, string][] = [
      [post(payload({ key: 'short' })), 400, 'bad_key'],
      [post(payload({ key: 'has space inside' })), 400, 'bad_key'],
      [post(payload({ body: body({ source: 'x' }) })), 400, 'bad_body'],
      [post(payload({ body: body({ kind: 'reply' }) })), 400, 'bad_body'],
      [post(payload({ body: body({ text: '   ' }) })), 400, 'bad_body'],
      [post(payload({ body: body({ request_id: 'a b' }) })), 400, 'bad_body'],
      [post(payload({ body: body({ ts: 'now' }) })), 400, 'bad_body'],
      [post('{not json'), 400, 'bad_json'],
      [post(payload(), { 'Content-Type': 'text/plain' }), 415, 'json_only'],
    ];
    for (const [req, status, error] of cases) {
      const f = upstreamOk();
      const res = await handle(req, env(), f as any);
      const out = await res.text();
      expect(res.status).toBe(status);
      expect(JSON.parse(out)).toEqual({ ok: false, error });
      expect(out).not.toMatch(/SECRET|api2|webhook\//);
      expect(f).not.toHaveBeenCalled();
    }
  });

  it('caps the text length and the request size', async () => {
    const long = await handle(post(payload({ body: body({ text: 'a'.repeat(MAX_TEXT_CHARS + 1) }) })), env(), upstreamOk() as any);
    expect(long.status).toBe(413);
    expect(await long.json()).toEqual({ ok: false, error: 'text_too_long' });
    const huge = await handle(post(payload({ pad: 'x'.repeat(7000) })), env(), upstreamOk() as any);
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ ok: false, error: 'too_large' });
    const ok = await handle(post(payload({ body: body({ text: 'a'.repeat(MAX_TEXT_CHARS) }) })), env(), upstreamOk() as any);
    expect(ok.status).toBe(200);
  });

  it('rate limits on SHA-256 hashes only (no URL, key, IP or text in the limiter)', async () => {
    const e = env();
    await handle(post(payload()), e, upstreamOk() as any);
    const keys = [...e.RL_WEBHOOK.keys, ...e.RL_CLIENT.keys];
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(k).toMatch(/^[0-9a-f]{64}$/);
      for (const s of [HOOK, KEY, TEXT, '203.0.113.9', 'AbC_123']) expect(k).not.toContain(s);
    }
    const blocked = env({ RL_WEBHOOK: limiter(false) });
    const f = upstreamOk();
    const res = await handle(post(payload()), blocked, f as any);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(f).not.toHaveBeenCalled();
    expect((await handle(post(payload()), env({ RL_CLIENT: limiter(false) }), upstreamOk() as any)).status).toBe(429);
  });

  it('times out after 8 s and reports unreachable upstreams', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const st = vi.spyOn(globalThis, 'setTimeout');
    const hang = vi.fn((_u: any, init: any) => new Promise<Response>((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = handle(post(payload()), env(), hang as any);
    while (!hang.mock.calls.length) await new Promise(r => setImmediate(r));
    expect(st.mock.calls.some(c => c[1] === 8000)).toBe(true);
    expect(hang.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8000);
    const res = await p;
    vi.useRealTimers();
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ ok: false, error: 'timeout' });
    const down = vi.fn(async () => { throw new TypeError('connect failed ' + KEY); });
    const r2 = await handle(post(payload()), env(), down as any);
    expect(r2.status).toBe(502);
    expect(await r2.text()).not.toContain('SECRET');
  });
});

describe('routes and CORS', () => {
  it('OPTIONS /v1/send allows any origin for POST', async () => {
    const res = await handle(new Request('https://x/v1/send', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), env());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('GET /v1/health is ok; other paths and methods have no CORS', async () => {
    const h = await handle(new Request('https://x/v1/health'), env());
    expect(h.status).toBe(200);
    expect(await h.text()).toBe('ok');
    expect(h.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const nf = await handle(new Request('https://x/v1/stt', { method: 'POST' }), env());
    expect(nf.status).toBe(404);
    expect(nf.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await handle(new Request('https://x/v1/send'), env())).status).toBe(405);
  });
  it('DEV_UPSTREAM is honored only for a loopback http origin', () => {
    expect(upstreamTarget(HOOK, { DEV_UPSTREAM: 'http://127.0.0.1:8899' } as any)).toBe('http://127.0.0.1:8899/automations/webhook/AbC_123-xyz');
    for (const d of ['https://evil.com', 'http://evil.com:80', 'http://127.0.0.1.evil.com:80', 'http://10.0.0.1:80', undefined])
      expect(upstreamTarget(HOOK, { DEV_UPSTREAM: d } as any)).toBe(HOOK);
  });
});

describe('zero retention, statically', () => {
  const root = join(__dirname, '..');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');
  const config = (f: string) => JSON.parse(strip(readFileSync(join(root, f), 'utf8')));

  it('source has no console, cache, or storage API calls', () => {
    for (const dir of ['src', 'retire']) for (const f of readdirSync(join(root, dir)).filter(n => n.endsWith('.ts'))) {
      const code = strip(readFileSync(join(root, dir, f), 'utf8'));
      expect(code, f).not.toMatch(/\bconsole\s*\.|\bcaches\b|\.put\(|\bstorage\b|waitUntil|\bKVNamespace\b|\bD1Database\b|\bR2Bucket\b|DurableObject/);
    }
  });

  it('production wrangler config: no storage bindings, logs/traces/logpush off, no vars', () => {
    const c = config('wrangler.jsonc');
    for (const k of ['kv_namespaces', 'durable_objects', 'd1_databases', 'r2_buckets', 'queues', 'analytics_engine_datasets',
      'vectorize', 'hyperdrive', 'tail_consumers', 'migrations', 'exports', 'services', 'vars', 'secrets_store_secrets', 'send_email', 'workflows', 'containers'])
      expect(c[k], k).toBeUndefined();
    expect(c.logpush).toBe(false);
    expect(c.observability).toEqual({
      enabled: false, head_sampling_rate: 0,
      logs: { enabled: false, invocation_logs: false, head_sampling_rate: 0, persist: false },
      traces: { enabled: false, head_sampling_rate: 0, persist: false },
      issues: { enabled: false },
    });
    expect(c.ratelimits.map((r: any) => r.name).sort()).toEqual(['RL_CLIENT', 'RL_WEBHOOK']);
    expect(c.name).toBe('bud-forward');
  });

  it('retire config deletes the old GlassStore class and binds nothing', () => {
    const c = config('retire/wrangler.jsonc');
    expect(c.name).toBe('bud-relay');
    expect(c.durable_objects).toBeUndefined();
    expect(c.migrations).toEqual([{ tag: 'v1', new_sqlite_classes: ['GlassStore'] }, { tag: 'v2', deleted_classes: ['GlassStore'] }]);
  });
});
