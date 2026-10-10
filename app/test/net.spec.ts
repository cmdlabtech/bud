import { describe, expect, it, vi } from 'vitest';
import { NetError, sendToBot, transcribe, webhookBody } from '../src/net';

const bot = { id: 'b1', name: 'EDITH', url: 'https://api2.cursor.sh/automations/webhook/abc123', key: 'sender-key-abc' };

describe('direct network calls', () => {
  it('webhook body matches the Glass inbox routine (kind, request_id, text, source bud)', () => {
    const b = webhookBody('voice', 'hello', 'rid-1', 123);
    expect(b).toEqual({ source: 'bud', kind: 'voice', request_id: 'rid-1', text: 'hello', ts: 123 });
  });
  it('maps webhook statuses to errors (200 only is success)', async () => {
    for (const [status, kind] of [[401, 'auth'], [403, 'auth'], [404, 'bad'], [429, 'rate'], [500, 'server'], [202, 'server']] as const) {
      const f = vi.fn(async () => new Response('', { status }));
      await expect(sendToBot(f as any, bot, webhookBody('voice', 'x'))).rejects.toMatchObject({ kind });
    }
    const ok = vi.fn(async () => new Response('', { status: 200 }));
    await expect(sendToBot(ok as any, bot, webhookBody('voice', 'x'))).resolves.toBeUndefined();
  });
  it('a thrown fetch (offline or CORS-blocked) is a network error', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(sendToBot(f as any, bot, webhookBody('voice', 'x'))).rejects.toMatchObject({ kind: 'network' });
  });
  it('transcribe needs a key and reads { text }', async () => {
    await expect(transcribe(vi.fn() as any, '', new Uint8Array(10))).rejects.toBeInstanceOf(NetError);
    const f = vi.fn(async () => new Response(JSON.stringify({ text: ' hi ' }), { status: 200 }));
    expect(await transcribe(f as any, 'k-12345678', new Uint8Array(10))).toBe('hi');
    expect(f).toHaveBeenCalledWith('https://api.x.ai/v1/stt', expect.objectContaining({ method: 'POST' }));
  });
});
