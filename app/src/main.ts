import { AudioInputSource, EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { APP_VERSION, FORWARDER_URL, MIC_STUB, SENT_SCREEN_MS } from './config';
import { initExternalLinks, initFeedbackForm } from './feedback';
import { Controller } from './controller';
import { toGesture } from './gestures';
import { NetError, sendToBot, webhookBody, type Fetch } from './net';
import { GlassDisplay } from './render';
import { cleanName, loadSettings, mask, move, newId, saveSettings, validKey, validWebhookUrl, type KV } from './store';
import type { BotConfig, Settings } from './types';
import { sendErrorText } from './controller';

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

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const say = (id: string, s: string, cls: '' | 'ok' | 'err' = '') => { const el = $(id); el.textContent = s; el.className = 'msg ' + cls; };
const el = (tag: string, props: Record<string, string> = {}, text = '') => { const e = document.createElement(tag); Object.assign(e, props); if (text) e.textContent = text; return e; };

async function main() {
  const bridge = await initBridge();
  const kv: KV = {
    get: k => bridge.getLocalStorage(k).then(v => v ?? ''),
    set: async (k, v) => { await bridge.setLocalStorage(k, v); },
  };
  let f: Fetch = (...a) => fetch(...a);
  let forwarder = FORWARDER_URL;
  // DEV ONLY (stripped from builds): `?fake=1` fakes xAI and the forwarder, no network at all.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('fake')) {
    const { createFakeNet, seedFakeSettings } = await import('./dev/fake-net');
    f = createFakeNet(new URLSearchParams(location.search).get('fake')!) as Fetch;
    if (new URLSearchParams(location.search).get('fake') !== 'sttonly' || !forwarder) forwarder = 'fake:forwarder';
    await seedFakeSettings(kv);
  }

  let settings: Settings = await loadSettings(kv);
  savedSecrets = () => [settings.xaiKey, ...settings.bots.flatMap(b => [b.url, b.key])].filter(Boolean);
  const display = new GlassDisplay(bridge);
  const ctl = new Controller({
    display, fetch: f,
    mic: { open: () => bridge.audioControl(true, AudioInputSource.Glasses), close: () => bridge.audioControl(false) },
    loadSettings: () => loadSettings(kv),
    exit: () => { void bridge.shutDownPageContainer(1); },
    sentMs: SENT_SCREEN_MS,
    forwarder,
    micStub: MIC_STUB,
    log: (...a) => console.log(...a),
  });
  bridge.onEvenHubEvent(ev => {
    const g = toGesture(ev);
    if (!g) return;
    if (g.kind !== 'audio') console.log('[bud] gesture', g.kind, 'on', ctl.screen);
    ctl.handle(g).catch(() => console.warn('[bud] handler error'));
  });
  await ctl.start();

  // ---------------------------------------------------------------- phone page
  let editing: string | null = null; // bot id, or '' for a new bot

  const persist = async (next: Settings) => {
    settings = await saveSettings(kv, next);
    render();
    await ctl.reload();
  };

  function render() {
    $('xaiState').textContent = `Key: ${mask(settings.xaiKey)}`;
    const box = $('bots');
    box.replaceChildren();
    if (!settings.bots.length) box.append(el('p', {}, 'No bots yet. Add your first bot below.'));
    settings.bots.forEach((b, i) => {
      const row = el('div', { className: 'bot' });
      row.append(el('div', { className: 'name' }, b.name));
      row.append(el('div', { className: 'meta' }, `Webhook ...${b.url.slice(-6)}   Sender key ${mask(b.key)}`));
      const acts = el('div', { className: 'row' });
      const btn = (label: string, cls: string, fn: () => void) => { const x = el('button', { className: cls }, label); x.addEventListener('click', fn); acts.append(x); };
      btn('Send test', '', () => void testBot(b));
      btn('Edit', 'ghost', () => openEdit(b.id));
      if (i > 0) btn('Up', 'ghost', () => void persist({ ...settings, bots: move(settings.bots, i, i - 1) }));
      if (i < settings.bots.length - 1) btn('Down', 'ghost', () => void persist({ ...settings, bots: move(settings.bots, i, i + 1) }));
      btn('Delete', 'danger', () => { if (confirm(`Delete ${b.name} from BUD? This only removes it from this phone.`)) void persist({ ...settings, bots: settings.bots.filter(x => x.id !== b.id) }); });
      row.append(acts);
      box.append(row);
    });
  }

  async function testBot(b: BotConfig) {
    say('listMsg', `Sending a test to ${b.name}...`);
    try {
      await sendToBot(f, b, webhookBody('test', 'BUD test'), forwarder);
      say('listMsg', `Test sent. ${b.name} should reply "BUD test received" in Grok Bot.`, 'ok');
    } catch (e) {
      say('listMsg', `${b.name}: ${sendErrorText(e instanceof NetError ? e.kind : 'server')}`, 'err');
    }
  }

  function openEdit(id: string) {
    editing = id;
    const b = settings.bots.find(x => x.id === id);
    $('editTitle').textContent = b ? `Edit ${b.name}` : 'Add a bot';
    $<HTMLInputElement>('botName').value = b?.name ?? '';
    $<HTMLInputElement>('botUrl').value = b?.url ?? '';
    $<HTMLInputElement>('botKey').value = ''; // never put a saved key back into the page
    $('keyState').textContent = b ? `Sender key ${mask(b.key)}. Leave blank to keep it.` : '';
    say('editMsg', '');
    $('editCard').classList.remove('hidden');
    $('editCard').scrollIntoView({ behavior: 'smooth' });
  }
  function closeEdit() { editing = null; $<HTMLInputElement>('botKey').value = ''; $('editCard').classList.add('hidden'); }

  $('addBtn').addEventListener('click', () => openEdit(''));
  $('cancelEdit').addEventListener('click', closeEdit);
  $('saveBot').addEventListener('click', async () => {
    const name = cleanName($<HTMLInputElement>('botName').value);
    const url = $<HTMLInputElement>('botUrl').value.trim();
    const typedKey = $<HTMLInputElement>('botKey').value.trim();
    const existing = settings.bots.find(x => x.id === editing);
    const key = typedKey || existing?.key || '';
    if (!name) return say('editMsg', 'Give the bot a name.', 'err');
    if (!validWebhookUrl(url)) return say('editMsg', 'That is not a Grok Bot webhook URL. It should look like api2.cursor.sh/automations/webhook/... (https).', 'err');
    if (!validKey(key)) return say('editMsg', 'Paste the sender key from the routine panel.', 'err');
    if (!existing && settings.bots.length >= 30) return say('editMsg', 'BUD holds up to 30 bots.', 'err');
    const bot: BotConfig = { id: existing?.id ?? newId(), name, url, key };
    const bots = existing ? settings.bots.map(x => (x.id === bot.id ? bot : x)) : [...settings.bots, bot];
    await persist({ ...settings, bots });
    closeEdit();
    say('listMsg', `${name} saved.`, 'ok');
  });

  $('xaiSave').addEventListener('click', async () => {
    const input = $<HTMLInputElement>('xaiKey');
    const k = input.value.trim();
    input.value = '';
    if (!validKey(k)) return say('xaiMsg', 'Paste your xAI API key.', 'err');
    await persist({ ...settings, xaiKey: k });
    say('xaiMsg', 'Key saved on this phone.', 'ok');
  });
  $('xaiClear').addEventListener('click', async () => {
    if (!confirm('Remove the xAI key from this phone?')) return;
    await persist({ ...settings, xaiKey: '' });
    say('xaiMsg', 'Key removed.', 'ok');
  });

  render();
}

// Donate link and feedback form: set up right away, independent of the glasses/bridge.
// The feedback form refuses any text containing a key or webhook URL saved on this phone.
let savedSecrets: () => string[] = () => [];
async function initPhoneExtras() {
  initExternalLinks();
  const opts: Parameters<typeof initFeedbackForm>[0] = { version: APP_VERSION, savedSecrets: () => savedSecrets() };
  // DEV ONLY (stripped from builds): with ?fake=..., feedback is faked too (no Turnstile frame, no GitHub issue).
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('fake')) {
    const { createFakeNet, FAKE_FEEDBACK_BASE, FAKE_TURNSTILE_TOKEN } = await import('./dev/fake-net');
    Object.assign(opts, { fetch: createFakeNet(new URLSearchParams(location.search).get('fake')!), base: FAKE_FEEDBACK_BASE, devToken: FAKE_TURNSTILE_TOKEN });
  }
  initFeedbackForm(opts);
}
void initPhoneExtras();

main().catch(() => { console.error('[bud] start failed'); $('status').textContent = 'Could not connect to the glasses. Open the Even app and connect your G2.'; });
