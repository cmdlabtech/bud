import { describe, expect, it, vi } from 'vitest';
import { NetError, sendToBot, transcribe, webhookBody } from '../src/net';

const bot = { id: 'b1', name: 'EDITH', url: 'https://api2.cursor.sh/automations/webhook/abc123', key: 'sender-key-abc' };
const FWD = 'https://bud-forward.test';
const fwd = (status: number, out: unknown) => vi.fn(async (_u?: any, _i?: any) => new Response(JSON.stringify(out), { status }));

describe('network calls', () => {
  it('webhook body matches the Glass inbox routine (kind, request_id, text, source bud)', () => {
    const b = webhookBody('voice', 'hello', 'rid-1', 123);
    expect(b).toEqual({ source: 'bud', kind: 'voice', request_id: 'rid-1', text: 'hello', ts: 123 });
  });
  it('sends {webhook_url, key, body} to <forwarder>/v1/send; 200 + ok only is success', async () => {
    const ok = fwd(200, { ok: true, upstream_status: 200 });
    await expect(sendToBot(ok as any, bot, webhookBody('voice', 'x', 'r', 1), FWD)).resolves.toBeUndefined();
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe(FWD + '/v1/send');
    expect(JSON.parse(init.body)).toEqual({ webhook_url: bot.url, key: bot.key, body: { source: 'bud', kind: 'voice', request_id: 'r', text: 'x', ts: 1 } });
    await expect(sendToBot(fwd(200, {}) as any, bot, webhookBody('voice', 'x'), FWD)).rejects.toMatchObject({ kind: 'server' });
  });
  it('maps webhook (upstream) and forwarder statuses to errors', async () => {
    const cases: [number, unknown, string][] = [
      [502, { ok: false, error: 'upstream', upstream_status: 401 }, 'auth'],
      [502, { ok: false, error: 'upstream', upstream_status: 403 }, 'auth'],
      [502, { ok: false, error: 'upstream', upstream_status: 404 }, 'bad'],
      [502, { ok: false, error: 'upstream', upstream_status: 429 }, 'rate'],
      [502, { ok: false, error: 'upstream', upstream_status: 500 }, 'server'],
      [502, { ok: false, error: 'unreachable' }, 'server'],
      [504, { ok: false, error: 'timeout' }, 'timeout'],
      [429, { ok: false, error: 'rate_limited' }, 'rate'],
      [413, { ok: false, error: 'text_too_long' }, 'toolong'],
      [400, { ok: false, error: 'bad_webhook_url' }, 'bad'],
    ];
    for (const [status, out, kind] of cases)
      await expect(sendToBot(fwd(status, out) as any, bot, webhookBody('voice', 'x'), FWD)).rejects.toMatchObject({ kind });
  });
  it('refuses before sending: no forwarder configured, or text over 1000 chars', async () => {
    const f = fwd(200, { ok: true });
    await expect(sendToBot(f as any, bot, webhookBody('voice', 'x'), '')).rejects.toMatchObject({ kind: 'config' });
    await expect(sendToBot(f as any, bot, webhookBody('voice', 'a'.repeat(1001)), FWD)).rejects.toMatchObject({ kind: 'toolong' });
    expect(f).not.toHaveBeenCalled();
  });
  it('a thrown fetch (offline) is a network error', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(sendToBot(f as any, bot, webhookBody('voice', 'x'), FWD)).rejects.toMatchObject({ kind: 'network' });
  });
  it('transcribe needs a key and reads { text } directly from xAI', async () => {
    await expect(transcribe(vi.fn() as any, '', new Uint8Array(10))).rejects.toBeInstanceOf(NetError);
    const f = vi.fn(async () => new Response(JSON.stringify({ text: ' hi ' }), { status: 200 }));
    expect(await transcribe(f as any, 'k-12345678', new Uint8Array(10))).toBe('hi');
    expect(f).toHaveBeenCalledWith('https://api.x.ai/v1/stt', expect.objectContaining({ method: 'POST' }));
  });
});
