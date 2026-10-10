import { describe, it, expect } from 'vitest';
import { harness, pairDevice, ADMIN, BOTTOKEN } from './helpers';
import { cleanText, LIMITS } from '../src/app';
import { purge } from '../src/db';

describe('pairing and devices', () => {
  it('issues a code only to the admin token', async () => {
    const h = harness();
    expect((await h.req('POST', '/v1/pair/code')).status).toBe(401);
    expect((await h.req('POST', '/v1/pair/code', { token: BOTTOKEN })).status).toBe(401);
    const r = await h.req('POST', '/v1/pair/code', { token: ADMIN });
    expect(r.status).toBe(200);
    const j = await r.json() as { code: string };
    expect(j.code).toMatch(/^\d{8}$/);
  });

  it('pairs once, stores only a hash, and the token works', async () => {
    const h = harness();
    const { code } = await (await h.req('POST', '/v1/pair/code', { token: ADMIN })).json() as { code: string };
    const p = await h.req('POST', '/v1/pair', { body: { code } });
    expect(p.status).toBe(200);
    const { token } = await p.json() as { token: string };
    expect(token.startsWith('bud_d_')).toBe(true);
    const stored = JSON.stringify(h.sql.all('SELECT * FROM devices'));
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(code);
    expect(JSON.stringify(h.sql.all('SELECT * FROM pair_codes'))).not.toContain(code);
    expect((await h.req('GET', '/v1/bots', { token })).status).toBe(200);
    // code is single use
    expect((await h.req('POST', '/v1/pair', { body: { code } })).status).toBe(401);
  });

  it('expires codes after 10 minutes', async () => {
    const h = harness();
    const { code } = await (await h.req('POST', '/v1/pair/code', { token: ADMIN })).json() as { code: string };
    h.clock.t += 10 * 60 * 1000 + 1;
    expect((await h.req('POST', '/v1/pair', { body: { code } })).status).toBe(401);
  });

  it('rate limits pairing attempts per IP', async () => {
    const h = harness();
    for (let i = 0; i < LIMITS.pair.n; i++) {
      expect((await h.req('POST', '/v1/pair', { body: { code: '00000000' }, ip: '9.9.9.9' })).status).toBe(401);
    }
    expect((await h.req('POST', '/v1/pair', { body: { code: '00000000' }, ip: '9.9.9.9' })).status).toBe(429);
  });

  it('revoked devices are rejected', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { devices } = await (await h.req('GET', '/v1/devices', { token: ADMIN })).json() as { devices: { id: string }[] };
    expect((await h.req('DELETE', `/v1/devices/${devices[0].id}`, { token: ADMIN })).status).toBe(200);
    expect((await h.req('GET', '/v1/bots', { token })).status).toBe(401);
  });

  it('rejects garbage and wrong-prefix tokens with a generic error', async () => {
    const h = harness();
    const r = await h.req('GET', '/v1/bots', { token: 'bud_d_not-a-real-token-at-all' });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'Unauthorized' });
    expect((await h.req('GET', '/v1/bots', { token: BOTTOKEN })).status).toBe(401);
  });
});

describe('bots', () => {
  it('lists only roster bots with a configured webhook', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { bots } = await (await h.req('GET', '/v1/bots', { token })).json() as { bots: { id: string }[] };
    expect(bots.map(b => b.id)).toEqual(['edith', 'shuri']);
    expect(JSON.stringify(bots)).not.toContain('hooks.test');
  });

  it('ignores http webhooks outside dev', async () => {
    const h = harness({ WEBHOOK_URL_SHURI: 'http://localhost:9999/shuri' });
    const token = await pairDevice(h);
    const { bots } = await (await h.req('GET', '/v1/bots', { token })).json() as { bots: { id: string }[] };
    expect(bots.map(b => b.id)).toEqual(['edith']);
  });
});

describe('messages and replies', () => {
  it('sends to the bot webhook with the sender key and stores the reply', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const r = await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'Check PR 16' } });
    expect(r.status).toBe(200);
    const { message_id, status } = await r.json() as { message_id: string; status: string };
    expect(status).toBe('sent');
    expect(h.hooks).toHaveLength(1);
    const hook = h.hooks[0];
    expect(hook.url).toBe('https://hooks.test/shuri');
    expect((hook.init.headers as Record<string, string>).Authorization).toBe('Bearer shuri-sender-key-xyz');
    expect((hook.init.headers as Record<string, string>)['X-Automation-Key']).toBe('shuri-sender-key-xyz');
    expect(hook.body).toMatchObject({ source: 'bud', kind: 'voice', bot_id: 'shuri', message_id, text: 'Check PR 16' });
    expect(hook.body.request_id).toBeTruthy();

    // bot replies
    expect((await h.req('POST', '/v1/replies', { token, body: { message_id, bot_id: 'shuri', short: 'x' } })).status).toBe(401);
    const rep = await h.req('POST', '/v1/replies', { token: BOTTOKEN, body: { message_id, bot_id: 'shuri', short: 'PR 16 is green. Ready for you.' } });
    expect(rep.status).toBe(200);
    const m = await (await h.req('GET', `/v1/messages/${message_id}`, { token })).json() as { status: string; reply_short: string };
    expect(m).toMatchObject({ status: 'replied', reply_short: 'PR 16 is green. Ready for you.' });

    // unread shows on the bot list until marked read
    let bots = (await (await h.req('GET', '/v1/bots', { token })).json() as { bots: { id: string; unread: number }[] }).bots;
    expect(bots.find(b => b.id === 'shuri')!.unread).toBe(1);
    await h.req('POST', '/v1/bots/shuri/read', { token });
    bots = (await (await h.req('GET', '/v1/bots', { token })).json() as { bots: { id: string; unread: number }[] }).bots;
    expect(bots.find(b => b.id === 'shuri')!.unread).toBe(0);

    const thread = await (await h.req('GET', '/v1/bots/shuri/messages', { token })).json() as { messages: unknown[]; total: number };
    expect(thread.total).toBe(1);
  });

  it('rejects a reply from the wrong bot id and keeps the first reply', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { message_id } = await (await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' } })).json() as { message_id: string };
    expect((await h.req('POST', '/v1/replies', { token: BOTTOKEN, body: { message_id, bot_id: 'edith', short: 'nope' } })).status).toBe(404);
    await h.req('POST', '/v1/replies', { token: BOTTOKEN, body: { message_id, bot_id: 'shuri', short: 'first' } });
    const dup = await (await h.req('POST', '/v1/replies', { token: BOTTOKEN, body: { message_id, bot_id: 'shuri', short: 'second' } })).json() as { duplicate?: boolean };
    expect(dup.duplicate).toBe(true);
    const m = await (await h.req('GET', `/v1/messages/${message_id}`, { token })).json() as { reply_short: string };
    expect(m.reply_short).toBe('first');
  });

  it('marks a message failed when the webhook is not 200', async () => {
    const h = harness();
    h.hookStatus.code = 401;
    const token = await pairDevice(h);
    const r = await h.req('POST', '/v1/messages', { token, body: { bot_id: 'edith', text: 'hi' } });
    expect(r.status).toBe(502);
    expect((await r.json() as { status: string }).status).toBe('failed');
  });

  it('reports timeout after 3 minutes without a reply', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { message_id } = await (await h.req('POST', '/v1/messages', { token, body: { bot_id: 'edith', text: 'hi' } })).json() as { message_id: string };
    h.clock.t += 180_001;
    const m = await (await h.req('GET', `/v1/messages/${message_id}`, { token })).json() as { status: string };
    expect(m.status).toBe('timeout');
  });

  it('refuses unknown or unconfigured bots and empty text', async () => {
    const h = harness();
    const token = await pairDevice(h);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'pepper', text: 'hi' } })).status).toBe(404);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: '   ' } })).status).toBe(400);
    expect(h.hooks).toHaveLength(0);
  });

  it('rate limits messages per device', async () => {
    const h = harness();
    const token = await pairDevice(h);
    for (let i = 0; i < LIMITS.message.n; i++) {
      expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: `m${i}` } })).status).toBe(200);
    }
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'one more' } })).status).toBe(429);
  });
});

describe('replay protection', () => {
  it('requires ts and request id on mutating calls', async () => {
    const h = harness();
    const token = await pairDevice(h);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' }, replay: false })).status).toBe(409);
  });
  it('rejects a reused request id', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const rid = 'same-request-id-1234567890';
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' }, rid })).status).toBe(200);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' }, rid })).status).toBe(409);
    expect(h.hooks).toHaveLength(1);
  });
  it('rejects stale timestamps', async () => {
    const h = harness();
    const token = await pairDevice(h);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' }, ts: h.clock.t - 61_000 })).status).toBe(409);
    expect((await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'hi' }, ts: h.clock.t + 61_000 })).status).toBe(409);
  });
});

describe('needs you', () => {
  async function addNeed(h: ReturnType<typeof harness>, bot = 'shuri', ref = 'pr-16') {
    return h.req('POST', '/v1/needs', { token: BOTTOKEN, body: { bot_id: bot, ref, kind: 'approval', title: 'Merge PR #16?', detail: 'Approve in the app.' } });
  }

  it('only the bot token can add, only pilot bots, and adds are idempotent by ref', async () => {
    const h = harness();
    const token = await pairDevice(h);
    expect((await h.req('POST', '/v1/needs', { token, body: { bot_id: 'shuri', ref: 'x', title: 't' } })).status).toBe(401);
    expect((await addNeed(h, 'pepper')).status).toBe(404);
    const a = await (await addNeed(h)).json() as { id: string };
    const b = await (await addNeed(h)).json() as { id: string; updated: boolean };
    expect(b.id).toBe(a.id);
    const { needs } = await (await h.req('GET', '/v1/needs', { token })).json() as { needs: { id: string; bot_name: string }[] };
    expect(needs).toHaveLength(1);
    expect(needs[0].bot_name).toBe('Shuri');
  });

  it('hold forwards to the bot webhook as needs_action, never as approval', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { id } = await (await addNeed(h)).json() as { id: string };
    const r = await h.req('POST', `/v1/needs/${id}/act`, { token, body: { action: 'hold' } });
    expect(await r.json()).toEqual({ ok: true, forwarded: true });
    expect(h.hooks[0].body).toMatchObject({ kind: 'needs_action', action: 'hold', item_ref: 'pr-16', bot_id: 'shuri' });
    expect((await h.req('POST', `/v1/needs/${id}/act`, { token, body: { action: 'approve' } })).status).toBe(400);
  });

  it('snooze hides the item for an hour without waking the bot', async () => {
    const h = harness();
    const token = await pairDevice(h);
    const { id } = await (await addNeed(h)).json() as { id: string };
    await h.req('POST', `/v1/needs/${id}/act`, { token, body: { action: 'snooze_1h' } });
    expect(h.hooks).toHaveLength(0);
    expect(((await (await h.req('GET', '/v1/needs', { token })).json()) as { needs: unknown[] }).needs).toHaveLength(0);
    h.clock.t += 60 * 60 * 1000 + 1;
    expect(((await (await h.req('GET', '/v1/needs', { token })).json()) as { needs: unknown[] }).needs).toHaveLength(1);
  });

  it('resolve removes the item', async () => {
    const h = harness();
    const token = await pairDevice(h);
    await addNeed(h);
    await h.req('POST', '/v1/needs/resolve', { token: BOTTOKEN, body: { bot_id: 'shuri', ref: 'pr-16' } });
    expect(((await (await h.req('GET', '/v1/needs', { token })).json()) as { needs: unknown[] }).needs).toHaveLength(0);
  });
});

describe('transcribe', () => {
  function wavForm(bytes = 1000) {
    const f = new FormData();
    f.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'audio.wav');
    return f;
  }
  it('uses xAI when the key is set', async () => {
    const h = harness({ XAI_API_KEY: 'xai-test-key' });
    const token = await pairDevice(h);
    const r = await h.req('POST', '/v1/transcribe', { token, form: wavForm() });
    expect(await r.json()).toEqual({ transcript: 'transcribed words' });
    expect(h.sttCalls).toBe(1);
  });
  it('returns the stub only in dev without a key, else 503', async () => {
    const dev = harness({ DEV: 'true', STT_STUB_TEXT: 'stub words' });
    const t1 = await pairDevice(dev);
    expect(await (await dev.req('POST', '/v1/transcribe', { token: t1, form: wavForm() })).json()).toEqual({ transcript: 'stub words', stub: true });
    const prod = harness({ STT_STUB_TEXT: 'stub words' });
    const t2 = await pairDevice(prod);
    expect((await prod.req('POST', '/v1/transcribe', { token: t2, form: wavForm() })).status).toBe(503);
  });
  it('rejects oversize audio', async () => {
    const h = harness({ XAI_API_KEY: 'k' });
    const token = await pairDevice(h);
    expect((await h.req('POST', '/v1/transcribe', { token, form: wavForm(2_000_001) })).status).toBe(413);
  });
});

describe('retention and text', () => {
  it('purges data older than 7 days', async () => {
    const h = harness();
    const token = await pairDevice(h);
    await h.req('POST', '/v1/messages', { token, body: { bot_id: 'shuri', text: 'old' } });
    await h.req('POST', '/v1/needs', { token: BOTTOKEN, body: { bot_id: 'shuri', ref: 'r', title: 't' } });
    purge(h.sql, h.clock.t + 7 * 24 * 3600 * 1000 + 1);
    expect(h.sql.all('SELECT * FROM messages')).toHaveLength(0);
    expect(h.sql.all('SELECT * FROM needs')).toHaveLength(0);
  });
  it('cleans emoji, dashes and control chars, and truncates', () => {
    expect(cleanText('Hi 🚀 there \u2014 ok\u0007', 100)).toBe('Hi there - ok');
    expect(cleanText('x'.repeat(70), 64)).toHaveLength(64);
  });
  it('returns generic JSON for unknown routes', async () => {
    const h = harness();
    const r = await h.req('GET', '/v1/nope');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'Not found' });
  });
});
