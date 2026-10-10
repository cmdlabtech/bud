// Ported from Wondereye packages/worker/tests/feedback.spec.ts, adapted to BUD (app + web sources,
// cmdlabtech/bud, loopback CORS, secret guard, verify frame).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { route } from '../src/index';
import { buildIssue, checkAndCountRate, cleanText, validateFeedback, FEEDBACK_LIMITS } from '../src/feedback';

class FakeKV {
  store = new Map<string, string>();
  async get(k: string) { return this.store.get(k) ?? null; }
  async put(k: string, v: string) { this.store.set(k, v); }
}

const HOST = 'bud-feedback.admin2655.workers.dev';
const SELF = `https://${HOST}`;
const APP = 'http://127.0.0.1:51234';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
function body(over: Record<string, unknown> = {}) {
  return {
    category: 'bug',
    message: 'The bot list skips a name when I swipe fast.',
    title: 'Swipe skips',
    source: 'app',
    page: '/app',
    appVersion: '1.0.0',
    turnstileToken: TOKEN,
    elapsedMs: 9000,
    website: '',
    ...over,
  };
}

let kv: FakeKV;
let env: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
let ipCounter = 0;

function turnstileOk(hostname = HOST) {
  return new Response(JSON.stringify({ success: true, hostname }), { status: 200 });
}

function post(payload: unknown, opts: { origin?: string; ip?: string; raw?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'cf-connecting-ip': opts.ip ?? `203.0.113.${++ipCounter}`,
    'user-agent': 'Mozilla/5.0 test',
  };
  if (opts.origin !== '') headers.origin = opts.origin ?? APP;
  return route(new Request(`${SELF}/api/feedback`, { method: 'POST', headers, body: opts.raw ?? JSON.stringify(payload) }), env as any);
}

beforeEach(() => {
  kv = new FakeKV();
  env = {
    FEEDBACK_KV: kv,
    FEEDBACK_ENABLED: 'true',
    TURNSTILE_SECRET: 'test-secret',
    GITHUB_FEEDBACK_TOKEN: 'test-gh-token',
    TURNSTILE_HOSTNAMES: HOST,
    TURNSTILE_SITEKEY: '0x4AAAAAAATESTKEY',
  };
  fetchMock = vi.fn(async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u.includes('siteverify')) return turnstileOk();
    if (u.startsWith('https://api.github.com/')) return new Response('{"number":1}', { status: 201 });
    throw new Error(`unexpected fetch ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const githubCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('https://api.github.com/'));
const turnstileCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('siteverify'));

describe('POST /api/feedback happy path', () => {
  it('creates one labelled issue in cmdlabtech/bud with no IP or email', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(githubCalls()).toHaveLength(1);
    const [url, init] = githubCalls()[0];
    expect(String(url)).toBe('https://api.github.com/repos/cmdlabtech/bud/issues');
    const sent = JSON.parse(init.body);
    expect(sent.labels).toEqual(['feedback', 'needs-triage', 'source:app']);
    expect(sent.title).toBe('[Feedback] Swipe skips');
    expect(sent.body).toContain('**Category:** bug');
    expect(sent.body).toContain('BUD phone page');
    expect(sent.body).toContain('**App version:** 1.0.0');
    expect(sent.body).not.toMatch(/203\.0\.113/);
    expect(init.headers.Authorization).toBe('Bearer test-gh-token');
  });

  it('never calls GitHub in dry-run mode', async () => {
    env.FEEDBACK_DRY_RUN = 'true';
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(githubCalls()).toHaveLength(0);
  });

  it('accepts the web fallback form only from this Worker\'s own origin', async () => {
    expect((await post(body({ source: 'web', page: '/feedback' }), { origin: SELF })).status).toBe(200);
    expect((await post(body({ source: 'web', page: '/feedback' }), { origin: APP })).status).toBe(403);
    expect((await post(body({ source: 'app' }), { origin: SELF })).status).toBe(403);
    const sent = JSON.parse(githubCalls()[0][1].body);
    expect(sent.labels).toContain('source:web');
  });
});

describe('gates before any GitHub call', () => {
  it('is off unless FEEDBACK_ENABLED=true', async () => {
    env.FEEDBACK_ENABLED = undefined;
    expect((await post(body())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed without secrets', async () => {
    env.TURNSTILE_SECRET = undefined;
    expect((await post(body())).status).toBe(503);
    env.TURNSTILE_SECRET = 'x';
    env.GITHUB_FEEDBACK_TOKEN = undefined;
    expect((await post(body())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a foreign or missing Origin', async () => {
    expect((await post(body(), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(body(), { origin: '' })).status).toBe(403);
    expect((await post(body(), { origin: 'http://127.0.0.1.evil.example' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-JSON and oversized bodies', async () => {
    expect((await post(body(), { contentType: 'text/plain' })).status).toBe(415);
    expect((await post(null, { raw: '{"a":' })).status).toBe(400);
    expect((await post(null, { raw: JSON.stringify(body({ message: 'x'.repeat(7000) })) })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown keys such as email, webhook_url or key', async () => {
    for (const extra of [{ email: 'a@b.c' }, { webhook_url: 'x' }, { key: 'x' }, { text: 'task' }]) {
      expect((await post(body(extra))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses messages that contain a webhook URL or key-like strings (BUD guard)', async () => {
    for (const message of [
      'My bot fails: https://api2.cursor.sh/automations/webhook/abcDEF123 help',
      'My key is xai-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 is that ok',
      'Header was Bearer abcdefghijklmnopqrstuvwxyz0123',
      'Token github_pat_ABCDEFGHIJKLMNOPQRSTUV_123456 leaked',
    ]) expect((await post(body({ message }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a filled honeypot with a fake success', async () => {
    const res = await post(body({ website: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects forms submitted too fast', async () => {
    expect((await post(body({ elapsedMs: 800 }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects messages with more than one link', async () => {
    const m = 'See https://a.example and https://b.example for details please';
    expect((await post(body({ message: m }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not file an issue when Turnstile fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('siteverify')
        ? new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 })
        : new Response('{}', { status: 201 }),
    );
    const res = await post(body());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Feedback couldn't be sent. Please try again later." });
    expect(githubCalls()).toHaveLength(0);
  });

  it('does not file an issue when the Turnstile hostname is wrong (e.g. wondereye.app)', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('siteverify') ? turnstileOk('wondereye.app') : new Response('{}', { status: 201 }),
    );
    expect((await post(body())).status).toBe(403);
    expect(githubCalls()).toHaveLength(0);
  });

  it('treats an unreachable Turnstile as a failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('siteverify')) throw new Error('network');
      return new Response('{}', { status: 201 });
    });
    expect((await post(body())).status).toBe(403);
    expect(githubCalls()).toHaveLength(0);
  });

  it('a GitHub failure is a generic 502', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('siteverify') ? turnstileOk() : new Response('{"message":"Bad credentials"}', { status: 401 }),
    );
    const res = await post(body());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('credentials');
  });
});

describe('rate limits and dedupe', () => {
  it('allows 3 per hour per IP, then 429 without calling Turnstile', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await post(body({ message: `Distinct feedback message number ${i}` }), { ip: '198.51.100.7' });
      expect(res.status).toBe(200);
    }
    const before = turnstileCalls().length;
    const res = await post(body({ message: 'Fourth distinct feedback message' }), { ip: '198.51.100.7' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: 'Too many submissions. Please try again later.' });
    expect(turnstileCalls().length).toBe(before);
    expect(githubCalls()).toHaveLength(3);
  });

  it('enforces 10 per day per IP', async () => {
    const now = Date.UTC(2026, 9, 7, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
      expect((await checkAndCountRate(kv as unknown as KVNamespace, '1.2.3.4', now + i * 3_600_000)).ok).toBe(true);
    }
    expect((await checkAndCountRate(kv as unknown as KVNamespace, '1.2.3.4', now + 10 * 3_600_000)).reason).toBe('rate_day');
  });

  it('stores no raw IP and no message text in KV', async () => {
    await post(body(), { ip: '198.51.100.99' });
    for (const [k, v] of kv.store) {
      expect(k).not.toContain('198.51.100.99');
      expect(k + v).not.toMatch(/swipe/i);
    }
  });

  it('files an identical message only once', async () => {
    await post(body(), { ip: '192.0.2.1' });
    const res = await post(body({ message: 'the bot list SKIPS a name when I swipe fast!' }), { ip: '192.0.2.2' });
    expect(res.status).toBe(200);
    expect(githubCalls()).toHaveLength(1);
  });

  it('stops at the global daily cap', async () => {
    const day = Math.floor(Date.now() / 86_400_000);
    kv.store.set(`fb:rl:g:${day}`, String(FEEDBACK_LIMITS.globalPerDay));
    expect((await post(body())).status).toBe(429);
    expect(githubCalls()).toHaveLength(0);
  });
});

describe('sanitizing', () => {
  it('strips HTML and control characters', () => {
    expect(cleanText('<b>hi</b>\u0000 <script>x</script>there')).toBe('hi xthere');
  });

  it('fences user text so it cannot break out', () => {
    const v = validateFeedback(body({ message: 'Break ``` out @cmdlabtech ![x](https://a.example/i.png)' }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const issue = buildIssue(v.value, 'UA');
    expect(issue.body).toContain('````text\nBreak ``` out @cmdlabtech');
  });

  it('requires strict types', () => {
    expect(validateFeedback(body({ category: 'spam' })).ok).toBe(false);
    expect(validateFeedback(body({ source: 'map' })).ok).toBe(false);
    expect(validateFeedback(body({ page: 'https://evil.example' })).ok).toBe(false);
    expect(validateFeedback(body({ appVersion: '1.0.0-beta<script>' })).ok).toBe(false);
    expect(validateFeedback(body({ title: 'x'.repeat(81) })).ok).toBe(false);
    expect(validateFeedback(body({ message: 'short' })).ok).toBe(false);
  });
});

describe('CORS, verify frame and pages', () => {
  it('preflight allows only loopback origins', async () => {
    const pre = (origin: string) => route(new Request(`${SELF}/api/feedback`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } }), env as any);
    const ok = await pre(APP);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(APP);
    expect((await pre('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('verify frame may be framed only by loopback pages and posts only to a loopback parent', async () => {
    const res = await route(new Request(`${SELF}/verify-frame?parent=${encodeURIComponent(APP)}&lang=en`), env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors http://127.0.0.1:* http://localhost:*');
    const js = await (await route(new Request(`${SELF}/verify-frame.js`), env as any)).text();
    expect(js).toContain("var SITEKEY = '0x4AAAAAAATESTKEY'");
    expect(js).toContain("msg.source = 'bud-verify'");
    expect(js).toContain('window.parent.postMessage(msg, parentOrigin)');
  });

  it('an empty sitekey makes the frame report a config error (app shows the fallback)', async () => {
    env.TURNSTILE_SITEKEY = '';
    const js = await (await route(new Request(`${SELF}/verify-frame.js`), env as any)).text();
    expect(js).toContain("code: 'config'");
  });

  it('serves the fallback /feedback page with the private-issue note and no framing', async () => {
    const res = await route(new Request(`${SELF}/feedback`), env as any);
    const html = await res.text();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(html).toContain('private GitHub issue');
    expect(html).toContain('Leave out keys, webhook URLs');
    expect((await route(new Request(`${SELF}/health`), env as any)).status).toBe(200);
  });
});

describe('legal pages (/privacy, /terms)', () => {
  it('serve the generated policy pages, in sync with docs', async () => {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [new URL('../../scripts/build-legal.mjs', import.meta.url).pathname, '--check']);
    for (const [path, title] of [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Use']]) {
      const res = await route(new Request('https://bud-feedback.example' + path), {} as any);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(res.headers.get('x-robots-tag')).toBeNull();
      const html = await res.text();
      expect(html).toContain(title);
      expect(html).not.toMatch(/<script/i);
    }
    const priv = await (await route(new Request('https://bud-feedback.example/privacy'), {} as any)).text();
    for (const w of ['g2-microphone', 'api.x.ai', 'bud-forward', 'Turnstile', 'not affiliated', 'Contact']) expect(priv).toContain(w);
  });
});
