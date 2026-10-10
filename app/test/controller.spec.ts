import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type KV } from '../src/api';
import { CACHE_KEY, Controller, OUTBOX_KEY } from '../src/controller';
import type { Display } from '../src/render';
import type { PageSpec } from '../src/screens';
import { syntheticChunk } from '../src/voice';
import type { Bot, Message, Need } from '../src/types';

class FakeDisplay implements Display {
  current: PageSpec | null = null; shows: string[] = []; updates: [string, string][] = [];
  async show(p: PageSpec) { this.current = p; this.shows.push(p.key); }
  async update(n: string, c: string) { this.updates.push([n, c]); }
  text(name: string) { const c = this.current?.containers.find(x => x.name === name); return c?.kind === 'text' ? c.content : c?.kind === 'list' ? c.items.join('|') : ''; }
}
class MemKV implements KV { m = new Map<string, string>(); async get(k: string) { return this.m.get(k) ?? ''; } async set(k: string, v: string) { this.m.set(k, v); } }

const BOTS: Bot[] = [
  { id: 'edith', name: 'EDITH', label: '', needs: 0, unread: 0 },
  { id: 'shuri', name: 'Shuri', label: '', needs: 1, unread: 2 },
];
const NEEDS: Need[] = [{ id: 'n1', bot_id: 'shuri', bot_name: 'Shuri', kind: 'approval', title: 'Approve invoice', detail: '', created_at: Date.now(), action: null }];

function fakeApi() {
  const msgs: Record<string, Message> = {};
  let online = true; let paired = true;
  const api: any = {
    get paired() { return paired; },
    load: vi.fn(async () => paired),
    forget: vi.fn(async () => { paired = false; }),
    bots: vi.fn(async () => { if (!online) throw new ApiError('offline'); return structuredClone(BOTS); }),
    needs: vi.fn(async () => { if (!online) throw new ApiError('offline'); return structuredClone(NEEDS); }),
    thread: vi.fn(async (id: string) => { if (!online) throw new ApiError('offline'); const m = Object.values(msgs).filter(x => x.bot_id === id); return { messages: m, total: m.length }; }),
    markRead: vi.fn(async () => ({ ok: true })),
    transcribe: vi.fn(async () => { if (!online) throw new ApiError('offline'); return 'Check the deploy status'; }),
    send: vi.fn(async (bot_id: string, text: string) => {
      if (!online) throw new ApiError('offline');
      const id = `m${Object.keys(msgs).length + 1}`;
      msgs[id] = { id, bot_id, text, status: 'pending', reply_short: null, created_at: Date.now(), replied_at: null };
      return { message_id: id, status: 'sent' };
    }),
    message: vi.fn(async (id: string) => structuredClone(msgs[id])),
    act: vi.fn(async () => { if (!online) throw new ApiError('offline'); return { ok: true, forwarded: true }; }),
  };
  return { api, msgs, setOnline: (v: boolean) => { online = v; }, setPaired: (v: boolean) => { paired = v; } };
}

function setup(opts: { cache?: boolean; online?: boolean; paired?: boolean } = {}) {
  const display = new FakeDisplay(); const kv = new MemKV(); const f = fakeApi();
  if (opts.online === false) f.setOnline(false);
  if (opts.paired === false) f.setPaired(false);
  if (opts.cache) kv.m.set(CACHE_KEY, JSON.stringify({ bots: BOTS, needs: NEEDS, savedAt: Date.now() - 600_000 }));
  const exit = vi.fn();
  const mic = { open: vi.fn(async () => true), close: vi.fn(async () => true) };
  const ctl = new Controller({ display, api: f.api, kv, mic, exit, pollMs: 15000, replyPollMs: 3000, replyTimeoutMs: 180000 });
  return { ctl, display, kv, f, exit, mic };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T14:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('controller', () => {
  it('first screen is the cached home, then live (never blank)', async () => {
    const { ctl, display, f } = setup({ cache: true });
    f.api.bots.mockImplementationOnce(() => new Promise(r => setTimeout(() => r(structuredClone(BOTS)), 1000)));
    const p = ctl.start();
    await flush();
    expect(display.shows[0]).toBe('home0');
    expect(display.text('hdr')).toMatch(/saved/);
    expect(display.text('rows')).toContain('Shuri');
    await vi.advanceTimersByTimeAsync(1000); await p;
    expect(ctl.freshness).toBe('live');
  });
  it('no cache: loading screen first, then home', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    expect(display.shows[0]).toBe('home0');
    expect(display.shows.length).toBeGreaterThanOrEqual(2);
    expect(display.text('rows')).toContain('Needs you (1)');
    expect(display.text('rows')).toContain('Shuri - Approve invoice');
  });
  it('opened offline with no cache: offline is root, double press exits', async () => {
    const { ctl, display, exit } = setup({ online: false });
    await ctl.start();
    expect(ctl.screen).toBe('offline'); expect(ctl.root).toBe('offline');
    expect(display.text('foot')).toContain('double exit');
    await ctl.handle({ kind: 'double' });
    expect(exit).toHaveBeenCalled();
  });
  it('opened offline with cache: cached home marked offline', async () => {
    const { ctl, display } = setup({ online: false, cache: true });
    await ctl.start();
    expect(ctl.screen).toBe('home');
    expect(display.updates.some(([n, c]) => n === 'hdr' && /offline, saved/.test(c))).toBe(true);
  });
  it('not paired: pairing is root; double exits', async () => {
    const { ctl, exit } = setup({ paired: false });
    await ctl.start();
    expect(ctl.screen).toBe('pairing');
    await ctl.handle({ kind: 'double' }); expect(exit).toHaveBeenCalled();
  });
  it('home double press at root opens system exit; on page 2 it goes back', async () => {
    const { ctl, exit } = setup();
    await ctl.start();
    ctl.homePageNo = 1; await ctl.handle({ kind: 'double' });
    expect(exit).not.toHaveBeenCalled(); expect(ctl.homePageNo).toBe(0);
    await ctl.handle({ kind: 'double' }); expect(exit).toHaveBeenCalled();
  });
  it('swipe moves the cursor and counter; press opens the selected thread and marks read', async () => {
    const { ctl, display, f } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'down' });
    expect(display.updates.at(-2)![0]).toBe('rows'); expect(display.updates.at(-2)![1]).toMatch(/▶ ■ Shuri/);
    expect(display.updates.at(-1)).toEqual(['pos', '△\n\n\n2/3\n\n\n▼']);
    await ctl.handle({ kind: 'up' }); await ctl.handle({ kind: 'up' }); // clamps at the top
    expect(ctl.homeSel).toBe(0);
    await ctl.handle({ kind: 'down', source: 'ring' });
    await ctl.handle({ kind: 'press', source: 'ring' });
    expect(ctl.screen).toBe('thread'); expect(ctl.botId).toBe('shuri');
    await flush();
    expect(f.api.markRead).toHaveBeenCalledWith('shuri');
  });
  it('full voice flow from Home: long press talks to selected bot, release, transcript, send, reply opens thread', async () => {
    const { ctl, display, f, mic } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'down' }); await ctl.handle({ kind: 'down' }); // EDITH (Shuri sorts first)
    await ctl.handle({ kind: 'long' });
    expect(ctl.screen).toBe('listening'); expect(ctl.botId).toBe('edith'); expect(mic.open).toHaveBeenCalled();
    for (let i = 0; i < 12; i++) await ctl.handle({ kind: 'audio', pcm: syntheticChunk(i) });
    await ctl.handle({ kind: 'longRelease' });
    await flush();
    expect(ctl.screen).toBe('transcript'); expect(display.text('draft')).toBe('Check the deploy status');
    await ctl.handle({ kind: 'press' });
    expect(ctl.screen).toBe('sent'); expect(f.api.send).toHaveBeenCalledWith('edith', 'Check the deploy status');
    expect(display.text('status')).toContain('Waiting for EDITH');
    f.msgs.m1.status = 'replied'; f.msgs.m1.reply_short = 'Deploy is green.';
    await vi.advanceTimersByTimeAsync(3000);
    expect(display.updates.some(([n, c]) => n === 'status' && c.includes('replied'))).toBe(true);
    await vi.advanceTimersByTimeAsync(1300); await flush();
    expect(ctl.screen).toBe('thread'); expect(display.text('bot2')).toContain('Deploy is green.');
  });
  it('Thread: plain press starts tap-to-talk; press stops; double on transcript cancels; long press redoes', async () => {
    const { ctl, display } = setup();
    await ctl.start(); await ctl.openThread('edith');
    await ctl.handle({ kind: 'press' });
    expect(ctl.screen).toBe('listening'); expect(ctl.holdMode).toBe(false);
    expect(display.text('hint')).toContain('Press to stop');
    await ctl.handle({ kind: 'longRelease' }); expect(ctl.screen).toBe('listening'); // ignored in tap mode
    for (let i = 0; i < 5; i++) await ctl.handle({ kind: 'audio', pcm: syntheticChunk(i) });
    await ctl.handle({ kind: 'press' }); await flush();
    expect(ctl.screen).toBe('transcript');
    await ctl.handle({ kind: 'long' }); expect(ctl.screen).toBe('listening'); expect(ctl.holdMode).toBe(true);
    await ctl.handle({ kind: 'double' }); expect(ctl.screen).toBe('thread');
  });
  it('silence timeout ends listening; nothing said gives a clear empty transcript', async () => {
    const { ctl, display, f } = setup();
    await ctl.start(); await ctl.openThread('edith');
    await ctl.handle({ kind: 'long' });
    for (let i = 0; i < 50; i++) await ctl.handle({ kind: 'audio', pcm: new Uint8Array(3200) });
    await flush();
    expect(ctl.screen).toBe('transcript');
    expect(display.text('draft')).toContain('Nothing heard');
    expect(f.api.transcribe).not.toHaveBeenCalled();
  });
  it('backgrounding while listening cancels and closes the mic', async () => {
    const { ctl, mic } = setup();
    await ctl.start(); await ctl.openThread('edith');
    await ctl.handle({ kind: 'long' });
    await ctl.handle({ kind: 'foregroundExit' });
    expect(ctl.screen).toBe('thread'); expect(mic.close).toHaveBeenCalled();
  });
  it('contextual menu overlay does not pause polling; a real background does', async () => {
    const { ctl, f } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'foregroundEnter' }); // overlay opened while in foreground
    await ctl.handle({ kind: 'foregroundExit' });  // overlay closed
    expect(ctl.inForeground).toBe(true);
    const calls = f.api.bots.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.api.bots.mock.calls.length).toBe(calls + 1);
    await ctl.handle({ kind: 'foregroundExit' }); // real background
    expect(ctl.inForeground).toBe(false);
    await vi.advanceTimersByTimeAsync(45000);
    expect(f.api.bots.mock.calls.length).toBe(calls + 1);
    await ctl.handle({ kind: 'foregroundEnter' }); await flush(); // resume refreshes now
    expect(f.api.bots.mock.calls.length).toBe(calls + 2);
  });
  it('offline send is queued, persisted, and flushed by the next poll', async () => {
    const { ctl, display, f, kv } = setup();
    await ctl.start(); await ctl.openThread('edith');
    ctl.draft = 'Remind me at 5'; ctl.screen = 'transcript';
    f.setOnline(false);
    await ctl.handle({ kind: 'press' });
    expect(display.text('status')).toContain('Saved. Will send when online.');
    expect(JSON.parse(kv.m.get(OUTBOX_KEY)!)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.api.send).toHaveBeenCalledTimes(1);
    f.setOnline(true);
    await vi.advanceTimersByTimeAsync(15000); await flush();
    expect(f.api.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(kv.m.get(OUTBOX_KEY)!)).toHaveLength(0);
    expect(display.text('status')).toContain('Waiting for EDITH');
  });
  it('outbox survives a restart', async () => {
    const a = setup();
    a.kv.m.set(OUTBOX_KEY, JSON.stringify([{ bot_id: 'shuri', text: 'queued hi', ts: Date.now() - 1000 }, { bot_id: 'shuri', text: 'too old', ts: Date.now() - 13 * 3600_000 }]));
    await a.ctl.start(); await flush();
    expect(a.f.api.send).toHaveBeenCalledTimes(1);
    expect(a.f.api.send).toHaveBeenCalledWith('shuri', 'queued hi');
  });
  it('needs: list, item, hold removes it and shows the done text; snooze too', async () => {
    const { ctl, display, f } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press', index: 0 });
    expect(ctl.screen).toBe('needsList');
    await ctl.handle({ kind: 'press', index: 0 });
    expect(ctl.screen).toBe('needItem'); expect(display.text('note')).toContain('Approve in Grok Bot app.');
    await ctl.handle({ kind: 'press', index: 0 });
    expect(f.api.act).toHaveBeenCalledWith('n1', 'hold');
    expect(display.updates.at(-1)).toEqual(['hdr', 'Held. It waits for you.']);
    await vi.advanceTimersByTimeAsync(1500);
    expect(ctl.screen).toBe('needsList'); expect(display.text('hdr')).toContain('All clear');
  });
  it('needs: offline act shows a clear message and keeps the item', async () => {
    const { ctl, display, f } = setup();
    await ctl.start(); await ctl.handle({ kind: 'press', index: 0 }); await ctl.handle({ kind: 'press', index: 0 });
    f.setOnline(false);
    await ctl.handle({ kind: 'press', index: 1 });
    expect(display.updates.at(-1)![1]).toContain('Offline');
    expect(ctl.needs).toHaveLength(1);
  });
  it('long reply: thread shows first part, swipe down opens paged reader', async () => {
    const { ctl, display, f } = setup();
    await ctl.start();
    f.msgs.m9 = { id: 'm9', bot_id: 'edith', text: 'status?', status: 'replied', reply_short: 'All good here and the build is green. '.repeat(30), created_at: Date.now(), replied_at: Date.now() };
    await ctl.openThread('edith'); await flush();
    expect(display.text('foot')).toContain('swipe down read all');
    await ctl.handle({ kind: 'down' });
    expect(ctl.screen).toBe('reader'); expect(display.text('hdr')).toMatch(/reply 1 of \d/);
    await ctl.handle({ kind: 'down' }); expect(display.text('hdr')).toMatch(/reply 2 of/);
    await ctl.handle({ kind: 'up' }); expect(display.text('hdr')).toMatch(/reply 1 of/);
    await ctl.handle({ kind: 'down' }); await ctl.handle({ kind: 'down' }); await ctl.handle({ kind: 'down' });
    expect(display.updates.at(-1)).toEqual(['hdr', 'End of reply']);
    await ctl.handle({ kind: 'double' }); expect(ctl.screen).toBe('thread');
  });
  it('every boundary swipe gets visible feedback, then the header comes back', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    const hdr = display.text('hdr');
    await ctl.handle({ kind: 'up' });
    expect(display.updates.at(-1)).toEqual(['hdr', 'Top of list']);
    await vi.advanceTimersByTimeAsync(1500);
    expect(display.updates.at(-1)).toEqual(['hdr', hdr]);
    await ctl.openThread('edith'); await flush();
    await ctl.handle({ kind: 'up' });
    expect(display.updates.at(-1)![1]).toMatch(/No messages yet|No older/);
  });
  it('unpaired by the relay (401) goes to pairing', async () => {
    const { ctl, f } = setup();
    await ctl.start();
    f.api.bots.mockRejectedValueOnce(new ApiError('auth', 401));
    await ctl.refresh();
    expect(ctl.screen).toBe('pairing');
  });
  it('menu items work (Talk to EDITH, Needs you, Cancel)', async () => {
    const { ctl } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'menu', itemId: 2 }); expect(ctl.screen).toBe('listening'); expect(ctl.botId).toBe('edith');
    await ctl.handle({ kind: 'menu', itemId: 21 }); expect(ctl.screen).toBe('home');
    await ctl.handle({ kind: 'menu', itemId: 3 }); expect(ctl.screen).toBe('needsList');
  });
  it('mic permission denied (no audio within 3 s) shows a clear next step', async () => {
    const { ctl, display, mic } = setup();
    mic.open.mockResolvedValueOnce(false);
    await ctl.start(); await ctl.openThread('edith');
    await ctl.handle({ kind: 'long' });
    expect(ctl.screen).toBe('listening');
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctl.screen).toBe('transcript'); expect(display.text('draft')).toContain('allow the microphone');
    expect(mic.close).toHaveBeenCalled();
    await ctl.handle({ kind: 'press' }); expect(ctl.screen).toBe('transcript'); // nothing to send
    await ctl.handle({ kind: 'double' }); expect(ctl.screen).toBe('thread');
  });
  it('mic returning false but audio flowing still records (simulator behaviour)', async () => {
    const { ctl, mic } = setup();
    mic.open.mockResolvedValueOnce(false);
    await ctl.start(); await ctl.openThread('edith');
    await ctl.handle({ kind: 'long' });
    for (let i = 0; i < 5; i++) await ctl.handle({ kind: 'audio', pcm: syntheticChunk(i) });
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctl.screen).toBe('listening');
  });
  it('long press on Needs row asks to pick a bot', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'long' });
    expect(ctl.screen).toBe('home'); expect(display.updates.at(-1)![1]).toContain('Pick a bot');
  });
});
