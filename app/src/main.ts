import { AudioInputSource, EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { ApiError, RelayClient, type KV } from './api';
import { MIC_STUB, POLL_MS, RELAY_URL, REPLY_POLL_MS, REPLY_TIMEOUT_MS } from './config';
import { Controller } from './controller';
import { toGesture } from './gestures';
import { GlassDisplay } from './render';

// Bridge acquisition copied from Wondereye (bridge.ts): wait up to 5 s, then fall back to the singleton.
async function initBridge(): Promise<EvenAppBridge> {
  try {
    return await Promise.race([
      waitForEvenAppBridge(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Bridge timeout')), 5000)),
    ]);
  } catch {
    return EvenAppBridge.getInstance();
  }
}

const $ = (id: string) => document.getElementById(id)!;
const status = (s: string) => { $('status').textContent = s; };
const showPaired = (paired: boolean) => { $('pairCard').classList.toggle('hidden', paired); $('pairedCard').classList.toggle('hidden', !paired); };

async function main() {
  const bridge = await initBridge();
  const kv: KV = {
    get: k => bridge.getLocalStorage(k).then(v => v ?? ''),
    set: async (k, v) => { await bridge.setLocalStorage(k, v); },
  };
  let api = new RelayClient(RELAY_URL, kv);
  // DEV ONLY: `?fake=1` runs against an in-browser fake relay (no network at all).
  const fakeMode = import.meta.env.DEV ? new URLSearchParams(location.search).get('fake') : null;
  if (import.meta.env.DEV && fakeMode) {
    const { createFakeRelay } = await import('./dev/fake-relay');
    api = new RelayClient('http://fake.invalid', kv, createFakeRelay(fakeMode) as typeof fetch);
    if (new URLSearchParams(location.search).has('reset')) { await kv.set('glass.deviceToken', ''); await kv.set('glass.cache.v1', ''); await kv.set('glass.outbox.v1', ''); }
  }
  const display = new GlassDisplay(bridge);
  const ctl = new Controller({
    display, api, kv,
    mic: { open: () => bridge.audioControl(true, AudioInputSource.Glasses), close: () => bridge.audioControl(false) },
    exit: () => { void bridge.shutDownPageContainer(1); },
    pollMs: POLL_MS, replyPollMs: REPLY_POLL_MS, replyTimeoutMs: REPLY_TIMEOUT_MS,
    micStub: MIC_STUB,
    log: (...a) => console.log(...a),
  });
  bridge.onEvenHubEvent(ev => {
    if (import.meta.env.DEV && !(ev as any).audioEvent) console.log('[glass] raw', JSON.stringify(ev));
    const g = toGesture(ev);
    if (!g) return;
    if (g.kind !== 'audio') console.log('[glass] gesture', g.kind, 'index' in g ? g.index : '', 'source' in g ? g.source ?? '' : '', 'on', ctl.screen);
    ctl.handle(g).catch(err => console.warn('[glass] handler error', err));
  });
  // Dev only (stripped from builds): the simulator cannot type into the phone form,
  // so `?devpair=<code>` submits the same pairing call the form does.
  if (import.meta.env.DEV) {
    const code = new URLSearchParams(location.search).get('devpair');
    if (code && !(await api.load())) { try { await api.pair(code, 'Even simulator'); } catch (e) { console.warn('[glass] devpair failed', e); } }
  }
  await ctl.start();
  showPaired(api.paired);

  $('pairBtn').addEventListener('click', async () => {
    const code = ($('code') as HTMLInputElement).value.replace(/\D/g, '');
    if (code.length !== 8) { status('Enter all 8 digits.'); return; }
    status('Pairing...');
    try {
      await api.pair(code, 'G2 via Even app');
      ($('code') as HTMLInputElement).value = '';
      status('Paired.');
      showPaired(true);
      await ctl.onPaired();
    } catch (e) {
      const k = e instanceof ApiError ? e.kind : 'server';
      status(k === 'offline' ? "Can't reach the relay. Check your connection." : k === 'rate' ? 'Too many tries. Wait an hour or ask Shuri.' : 'That code did not work. Ask Shuri for a new one.');
    }
  });
  $('unpairBtn').addEventListener('click', async () => {
    await api.forget();
    showPaired(false);
    status('Unpaired on this phone. Ask Shuri to revoke the device too.');
    ctl.stopPolling(); ctl.root = 'pairing';
    await ctl.go('pairing');
  });
}

main().catch(err => { console.error('[glass] start failed', String(err), (err as Error)?.stack ?? ''); status('Could not connect to the glasses. Open the Even app and connect your G2.'); });
