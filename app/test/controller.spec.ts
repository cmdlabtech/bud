import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, MIC_OFF_TEXT, MIC_WATCHDOG_MS } from '../src/controller';
import type { Display } from '../src/render';
import type { PageSpec } from '../src/screens';
import type { Settings } from '../src/types';
import { syntheticChunk } from '../src/voice';

class FakeDisplay implements Display {
  current: PageSpec | null = null; shows: string[] = []; updates: [string, string][] = [];
  async show(p: PageSpec) { this.current = p; this.shows.push(p.key); }
  async update(n: string, c: string) { this.updates.push([n, c]); }
  text(name: string) { const c = this.current?.containers.find(x => x.name === name); return c?.kind === 'text' ? c.content : ''; }
}

const HOOK = (id: string) => `https://api2.cursor.sh/automations/webhook/${id}`;
const SETTINGS: Settings = {
  xaiKey: 'xai-test-key-0000',
  bots: [
    { id: 'b1', name: 'EDITH', url: HOOK('edith123'), key: 'sender-key-edith' },
    { id: 'b2', name: 'Shuri', url: HOOK('shuri456'), key: 'sender-key-shuri' },
  ],
};

type Call = { url: string; init: RequestInit };
function fakeFetch(opts: { stt?: number; hook?: number; offline?: boolean } = {}) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (opts.offline) throw new TypeError('Failed to fetch');
    if (url === 'https://api.x.ai/v1/stt') return new Response(JSON.stringify({ text: ' Check the deploy status ' }), { status: opts.stt ?? 200 });
    return new Response('{}', { status: opts.hook ?? 200 });
  });
  return { f, calls };
}

function setup(o: { settings?: Settings; stt?: number; hook?: number; offline?: boolean } = {}) {
  const display = new FakeDisplay();
  const net = fakeFetch(o);
  const exit = vi.fn();
  const mic = { open: vi.fn(async () => true), close: vi.fn(async () => true) };
  let settings = structuredClone(o.settings ?? SETTINGS);
  const ctl = new Controller({ display, fetch: net.f as unknown as typeof fetch, mic, loadSettings: async () => structuredClone(settings), exit, sentMs: 1500 });
  return { ctl, display, net, exit, mic, setSettings: (s: Settings) => { settings = s; } };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };

async function speak(ctl: Controller) {
  for (let t = 0; t < 10; t++) ctl.onAudio(syntheticChunk(t));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T14:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('home: bot list', () => {
  it('shows the configured bots in order with the cursor on the first', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    expect(ctl.screen).toBe('home');
    expect(display.text('hdr')).toBe('BUD');
    expect(display.text('rows').split('\n')[0]).toMatch(/^▶ EDITH$/);
    expect(display.text('rows')).toContain('Shuri');
    expect(display.text('rows')).not.toMatch(/need|new|Needs you/i);
  });
  it('shows setup when no bots are configured, and press re-checks', async () => {
    const { ctl, display, setSettings } = setup({ settings: { bots: [], xaiKey: '' } });
    await ctl.start();
    expect(ctl.screen).toBe('setup');
    expect(display.text('state')).toMatch(/No bots set up/);
    setSettings(SETTINGS);
    await ctl.handle({ kind: 'press' });
    expect(ctl.screen).toBe('home');
  });
  it('swipes move the cursor and nudge at the ends', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'down' });
    expect(ctl.homeSel).toBe(1);
    expect(display.updates.at(-2)?.[1].split('\n')[1]).toMatch(/^▶ Shuri/);
    await ctl.handle({ kind: 'down' });
    expect(display.updates.at(-1)).toEqual(['hdr', 'End of list']);
  });
  it('double press on the list exits', async () => {
    const { ctl, exit } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'double' });
    expect(exit).toHaveBeenCalled();
  });
  it('without an xAI key, picking a bot shows the key-missing setup page', async () => {
    const { ctl, display } = setup({ settings: { ...SETTINGS, xaiKey: '' } });
    await ctl.start();
    await ctl.handle({ kind: 'press' });
    expect(ctl.screen).toBe('setup');
    expect(display.text('state')).toMatch(/Speech key missing/);
  });
  it('reload picks up phone-page changes while on the list', async () => {
    const { ctl, display, setSettings } = setup();
    await ctl.start();
    setSettings({ ...SETTINGS, bots: [SETTINGS.bots[1], SETTINGS.bots[0]] });
    await ctl.reload();
    expect(display.text('rows').split('\n')[0]).toMatch(/Shuri/);
  });
});

describe('talk flow: press to listen, transcript, send, back to list', () => {
  it('press listens, press stops, xAI transcribes with the user key', async () => {
    const { ctl, display, net, mic } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'down' }); // Shuri
    await ctl.handle({ kind: 'press' });
    expect(ctl.screen).toBe('listening');
    expect(mic.open).toHaveBeenCalled();
    expect(display.text('hdr')).toBe('To Shuri');
    await speak(ctl);
    await ctl.handle({ kind: 'press' });
    await flush();
    expect(ctl.screen).toBe('transcript');
    expect(ctl.draft).toBe('Check the deploy status');
    const stt = net.calls.find(c => c.url === 'https://api.x.ai/v1/stt')!;
    expect((stt.init.headers as Record<string, string>).Authorization).toBe('Bearer xai-test-key-0000');
    const form = stt.init.body as FormData;
    expect(form.get('model')).toBe('grok-voice-transcribe-2.0');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });
  it('long press holds to talk and release stops', async () => {
    const { ctl } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'long' });
    expect(ctl.holdMode).toBe(true);
    await speak(ctl);
    await ctl.handle({ kind: 'longRelease' });
    await flush();
    expect(ctl.screen).toBe('transcript');
  });
  it('press on the transcript posts the voice body to the bot webhook, shows Sent, then returns to the list', async () => {
    const { ctl, display, net } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press' });
    await speak(ctl);
    await ctl.handle({ kind: 'press' });
    await flush();
    await ctl.handle({ kind: 'press' });
    await flush();
    const hook = net.calls.find(c => c.url.startsWith('https://api2.cursor.sh/'))!;
    expect(hook.url).toBe(SETTINGS.bots[0].url);
    const h = hook.init.headers as Record<string, string>;
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Authorization).toBe('Bearer sender-key-edith');
    expect(h['X-Automation-Key']).toBe('sender-key-edith');
    const body = JSON.parse(String(hook.init.body));
    expect(body).toMatchObject({ source: 'bud', kind: 'voice', text: 'Check the deploy status' });
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctl.screen).toBe('sent');
    expect(display.text('status')).toMatch(/Sent to EDITH/);
    await vi.advanceTimersByTimeAsync(1499);
    expect(ctl.screen).toBe('sent');
    await vi.advanceTimersByTimeAsync(2);
    expect(ctl.screen).toBe('home');
    expect(net.calls.filter(c => c.url.startsWith('https://api2.cursor.sh/'))).toHaveLength(1); // one try, no polling
  });
  it('double on the transcript cancels to the list; long press redoes', async () => {
    const { ctl } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press' }); await speak(ctl); await ctl.handle({ kind: 'press' }); await flush();
    await ctl.handle({ kind: 'long' });
    expect(ctl.screen).toBe('listening');
    await ctl.handle({ kind: 'double' });
    expect(ctl.screen).toBe('home');
  });
  it('a failed send shows a short error and press retries with a new request', async () => {
    const { ctl, display, net } = setup({ hook: 500 });
    await ctl.start();
    await ctl.handle({ kind: 'press' }); await speak(ctl); await ctl.handle({ kind: 'press' }); await flush();
    await ctl.handle({ kind: 'press' }); await flush();
    expect(ctl.screen).toBe('sendError');
    expect(display.text('state')).toMatch(/Not sent to EDITH/);
    await ctl.handle({ kind: 'press' }); await flush();
    expect(net.calls.filter(c => c.url.startsWith('https://api2.cursor.sh/'))).toHaveLength(2);
    await ctl.handle({ kind: 'double' });
    expect(ctl.screen).toBe('home');
  });
  it('a rejected sender key says to check the bot on the phone page', async () => {
    const { ctl, display } = setup({ hook: 401 });
    await ctl.start();
    await ctl.handle({ kind: 'press' }); await speak(ctl); await ctl.handle({ kind: 'press' }); await flush();
    await ctl.handle({ kind: 'press' }); await flush();
    expect(display.text('why')).toMatch(/sender key was not accepted/);
  });
  it('a network failure (also what a CORS block looks like) gives a clear error', async () => {
    const { ctl, display } = setup({ offline: true });
    await ctl.start();
    await ctl.handle({ kind: 'press' }); await speak(ctl); await ctl.handle({ kind: 'press' }); await flush();
    expect(display.text('draft')).toMatch(/Can't reach xAI/);
  });
  it('a rejected xAI key is reported on the transcript', async () => {
    const { ctl, display } = setup({ stt: 401 });
    await ctl.start();
    await ctl.handle({ kind: 'press' }); await speak(ctl); await ctl.handle({ kind: 'press' }); await flush();
    expect(display.text('draft')).toMatch(/xAI did not accept the key/);
  });
  it('mic watchdog: no audio within 3 s shows the microphone help', async () => {
    const { ctl, display } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press' });
    await vi.advanceTimersByTimeAsync(MIC_WATCHDOG_MS + 10);
    expect(ctl.screen).toBe('transcript');
    expect(display.text('draft')).toBe(MIC_OFF_TEXT);
  });
  it('nothing heard: no STT call', async () => {
    const { ctl, net } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press' });
    ctl.onAudio(new Uint8Array(3200));
    await ctl.handle({ kind: 'press' }); await flush();
    expect(ctl.draft).toBe('');
    expect(net.calls).toHaveLength(0);
  });
  it('going to the background while listening cancels to the list', async () => {
    const { ctl } = setup();
    await ctl.start();
    await ctl.handle({ kind: 'press' });
    await ctl.handle({ kind: 'foregroundExit' });
    expect(ctl.screen).toBe('home');
  });
});

describe('no relay, no polling', () => {
  it('makes no network call while idle on the list', async () => {
    const { ctl, net } = setup();
    await ctl.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(net.calls).toHaveLength(0);
  });
});
