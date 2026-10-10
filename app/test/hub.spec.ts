import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller } from '../src/controller';
import { webhookBody } from '../src/net';
import type { Display } from '../src/render';
import type { PageSpec } from '../src/screens';
import { loadSettings, routes, saveSettings, type KV } from '../src/store';
import type { Settings } from '../src/types';
import { syntheticChunk } from '../src/voice';

const HOOK = (id: string) => `https://api2.cursor.sh/automations/webhook/${id}`;
const HUB = { url: HOOK('hubhook001'), key: 'sender-key-hub' };
const S: Settings = {
  xaiKey: 'xai-test-key-0000', hub: HUB, hubBots: ['Research bot', 'Inbox bot', 'Calendar bot'],
  bots: [{ id: 'd1', name: 'Travel bot', url: HOOK('travel001'), key: 'sender-key-travel' }],
};

class FakeDisplay implements Display {
  current: PageSpec | null = null;
  async show(p: PageSpec) { this.current = p; }
  async update() {}
  text(n: string) { const c = this.current?.containers.find(x => x.name === n); return c?.kind === 'text' ? c.content : ''; }
}
const memKV = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: async k => m.get(k) ?? '', set: async (k, v) => { m.set(k, v); } }; };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T17:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('hub mode', () => {
  it('routes: hub names first (target = name, hub webhook), then direct bots without target', () => {
    const r = routes(S);
    expect(r.map(x => x.name)).toEqual(['Research bot', 'Inbox bot', 'Calendar bot', 'Travel bot']);
    expect(r.slice(0, 3).every(x => x.url === HUB.url && x.key === HUB.key && x.target === x.name)).toBe(true);
    expect(r[3].target).toBeUndefined();
    expect(routes({ ...S, hubBots: [] }).map(x => [x.name, x.target])).toEqual([['Hub', undefined], ['Travel bot', undefined]]);
    expect(routes({ ...S, hub: null }).map(x => x.name)).toEqual(['Travel bot']); // names need a hub
  });
  it('store keeps the hub and names, and drops bad ones', async () => {
    const kv = memKV();
    await saveSettings(kv, { ...S, hubBots: ['Research bot', 'research BOT', 'https://x.example', 'x'.repeat(30), ...Array.from({ length: 30 }, (_, i) => `Bot ${i}`)] });
    const s = await loadSettings(kv);
    expect(s.hub).toEqual(HUB);
    expect(s.hubBots![0]).toBe('Research bot');
    expect(s.hubBots).not.toContain('https://x.example');
    expect(s.hubBots!.length).toBe(18);
    await saveSettings(kv, { ...S, hub: { url: 'https://evil.example/hook', key: 'k' } });
    expect((await loadSettings(kv)).hub).toBeNull();
  });
  it('webhook body: target only when given', () => {
    expect(webhookBody('voice', 'hi', 'r', 1, 'Inbox bot')).toEqual({ source: 'bud', kind: 'voice', request_id: 'r', text: 'hi', ts: 1, target: 'Inbox bot' });
    expect('target' in webhookBody('voice', 'hi', 'r', 1)).toBe(false);
  });
  it('glasses: pick a hub name, speak, send -> hub webhook with target; direct bot -> no target', async () => {
    const display = new FakeDisplay();
    const sent: any[] = [];
    const f = vi.fn(async (u: any, init: any = {}) => {
      if (String(u).includes('/v1/stt')) return new Response(JSON.stringify({ text: 'Book a table for two' }), { status: 200 });
      sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, upstream_status: 200 }), { status: 200 });
    });
    const ctl = new Controller({ display, fetch: f as any, mic: { open: async () => true, close: async () => true }, loadSettings: async () => structuredClone(S), exit: () => {}, sentMs: 1500, forwarder: 'https://fwd.test' });
    await ctl.start();
    expect(display.text('rows')).toContain('Research bot');
    expect(display.text('pos')).toContain('1/4');
    const talkTo = async (downs: number) => {
      for (let i = 0; i < downs; i++) await ctl.handle({ kind: 'down' } as any);
      await ctl.handle({ kind: 'press' } as any);
      for (let t = 0; t < 10; t++) ctl.onAudio(syntheticChunk(t));
      await ctl.handle({ kind: 'press' } as any);
      await vi.advanceTimersByTimeAsync(0);
      await ctl.handle({ kind: 'press' } as any);
      await vi.advanceTimersByTimeAsync(0);
    };
    await talkTo(1);
    expect(display.text('hdr')).toContain('Inbox bot');
    expect(sent[0].webhook_url).toBe(HUB.url);
    expect(sent[0].key).toBe(HUB.key);
    expect(sent[0].body).toMatchObject({ source: 'bud', kind: 'voice', text: 'Book a table for two', target: 'Inbox bot' });
    await vi.advanceTimersByTimeAsync(1600);
    expect(ctl.screen).toBe('home');
    await talkTo(2); // from Inbox bot (index 1) down 2 -> Travel bot (direct)
    expect(sent[1].webhook_url).toBe(HOOK('travel001'));
    expect('target' in sent[1].body).toBe(false);
  });
});
