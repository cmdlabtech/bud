import { AudioInputSource, EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { APP_VERSION, FORWARDER_URL, HUB_BOT_URL, MIC_STUB, SENT_SCREEN_MS } from './config';
import { initExternalLinks, initFeedbackForm } from './feedback';
import { Controller } from './controller';
import { toGesture } from './gestures';
import { NetError, SYNC_TEXT, sendToBot, webhookBody, type Fetch } from './net';
import { parseBotCode } from './botcode';
import { detectSetup, setupProgress, type StepState } from './setup';
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
    await seedFakeSettings(kv, new URLSearchParams(location.search).get('fake')!);
  }

  let settings: Settings = await loadSettings(kv);
  const pending: { url?: string; key?: string } = {}; // paste-box pieces not saved yet (memory only)
  savedSecrets = () => [settings.xaiKey, settings.hub?.url ?? '', settings.hub?.key ?? '', pending.url ?? '', pending.key ?? '', ...settings.bots.flatMap(b => [b.url, b.key])].filter(Boolean);
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
    renderHub();
    if (!settings.bots.length) box.append(el('p', {}, settings.hub ? 'None. Your hub covers your bots.' : 'No bots yet. Set up a hub bot above, or add a bot here.'));
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

  // ---------------------------------------------------------------- setup: progress, paste box, hub (1.0.2)
  // One "Paste setup" box takes the hub webhook URL, its sender key and the BUD1 bot list code in any
  // order, in one paste or several. The hub saves as soon as URL + key are known and is tested right
  // away. Unsaved pieces are held only in memory and the box is emptied after every paste.
  let testState: StepState = 'todo';
  let testNote = '';
  let pendingNames: string[] | null = null;

  function renderProgress() {
    const p = setupProgress({ xaiKey: !!settings.xaiKey, hub: !!settings.hub || settings.bots.length > 0 });
    const bar = $('progress');
    bar.textContent = p.label;
    bar.classList.toggle('done', p.done);
    if (p.done && $('xaiMsg').textContent?.includes('Next: step 2')) say('xaiMsg', '');
    $('xaiCard').classList.toggle('current', p.step === 1);
    $('hubCard').classList.toggle('current', p.step === 2);
    $('hubCard').classList.toggle('later', p.step === 1);
  }
  const ck = (id: string, state: StepState, text: string) => { const li = $(id); li.className = state; li.textContent = text; };
  function renderHub() {
    const hub = settings.hub;
    const names = settings.hubBots ?? [];
    ck('ckUrl', hub || pending.url ? 'done' : 'todo', hub || pending.url ? `Webhook URL${!hub ? ' (now paste the sender key)' : ''}` : 'Webhook URL');
    ck('ckKey', hub || pending.key ? 'done' : 'todo', hub || pending.key ? `Sender key${!hub ? ' (now paste the webhook URL)' : ''}` : 'Sender key');
    ck('ckTest', hub ? testState : 'todo', testNote || (hub ? 'Connection test (tap Send test)' : 'Connection test (runs by itself)'));
    ck('ckNames', names.length ? 'done' : 'todo', names.length ? `Bot list: ${names.length} bot${names.length === 1 ? '' : 's'}` : 'Bot list (optional; the glasses show "Hub" without it)');
    $('hubState').textContent = hub ? `Hub: webhook ...${hub.url.slice(-6)}   sender key ${mask(hub.key)}${names.length ? '   On your glasses:' : ''}` : '';
    $('hubNames').replaceChildren(...names.map(n => el('li', {}, n)));
    for (const id of ['hubSync', 'hubTest', 'hubClear']) $(id).classList.toggle('hidden', !hub);
    $('hubNamesClear').classList.toggle('hidden', !names.length);
    renderProgress();
  }

  const hubSend = async (kind: 'test' | 'sync') => {
    if (!settings.hub) return say('hubMsg', 'Paste the webhook URL and sender key first.', 'err');
    testState = 'busy'; testNote = 'Connection test: sending...'; renderHub();
    try {
      await sendToBot(f, settings.hub, kind === 'sync' ? webhookBody('sync', SYNC_TEXT) : webhookBody('test', 'BUD test'), forwarder);
      testState = 'done'; testNote = 'Connected: your hub bot got the test';
      say('hubMsg', kind === 'sync'
        ? 'Connected. Your hub bot will reply in Grok Bot with just a code (BUD1...). Long-press that message, Copy, then tap Paste here.'
        : (settings.hubBots?.length ? "Connected. You're set: put on your glasses, pick a bot and talk." : 'Connected. Your hub bot will reply "BUD test received" in Grok Bot.'), 'ok');
    } catch (e) {
      testState = 'error'; testNote = 'Connection test failed';
      say('hubMsg', `Hub: ${sendErrorText(e instanceof NetError ? e.kind : 'server')} Check the webhook URL and sender key, then paste them again.`, 'err');
    }
    renderHub();
  };

  async function useSetupText(text: string) {
    const d = detectSetup(text);
    $<HTMLTextAreaElement>('setupBox').value = ''; // never leave a pasted key on the page
    const got: string[] = [];
    const next: Settings = { ...settings };
    let err = '';
    if (d.xaiKey && validKey(d.xaiKey)) { next.xaiKey = d.xaiKey; got.push('speech key'); }
    if (d.url) { if (validWebhookUrl(d.url)) { pending.url = d.url; got.push('webhook URL'); } else err = 'That webhook URL does not look right.'; }
    if (d.key) { pending.key = d.key; got.push('sender key'); }
    let names: string[] | null = null;
    if (d.code) {
      const r = await parseBotCode(d.code);
      if (r.ok) { names = r.names; got.push(`bot list (${r.names.length})`); } else err = r.error;
    }
    if (!got.length && !err) err = 'Nothing BUD can use in that paste. Paste the webhook URL, the sender key or the BUD1 code.';
    const url = pending.url ?? settings.hub?.url;
    const key = pending.key ?? settings.hub?.key;
    let hubChanged = false;
    if (url && key && (url !== settings.hub?.url || key !== settings.hub?.key)) {
      if (!validKey(key)) err = 'That sender key does not look right. Copy it again from the routine panel.';
      else { next.hub = { url, key }; hubChanged = true; delete pending.url; delete pending.key; }
    } else if (url && key) { delete pending.url; delete pending.key; }
    if (names) {
      if (next.hub) next.hubBots = names;
      else { err = 'Got the bot list. Now paste the webhook URL and sender key from the routine panel too.'; pendingNames = names; }
    } else if (pendingNames && next.hub) { next.hubBots = pendingNames; pendingNames = null; }
    if (hubChanged || names || next.xaiKey !== settings.xaiKey || next.hubBots !== settings.hubBots) {
      if (hubChanged) { testState = 'todo'; testNote = ''; }
      await persist(next);
    } else renderHub();
    if (err) say('hubMsg', got.length ? `Got: ${got.join(', ')}. ${err}` : err, 'err');
    else say('hubMsg', `Got: ${got.join(', ')}.`, 'ok');
    // Auto test right after the hub is saved. With no names yet, the test asks for the bot list code too.
    if (hubChanged) await hubSend(settings.hubBots?.length ? 'test' : 'sync');
    else if (names && settings.hub && testState === 'done') say('hubMsg', `Saved ${names.length} bot names. You're set: put on your glasses, pick a bot and talk.`, 'ok');
  }

  const readClipboard = async (): Promise<string | null> => {
    try { return navigator.clipboard?.readText ? await navigator.clipboard.readText() : null; } catch { return null; }
  };
  const box = $<HTMLTextAreaElement>('setupBox');
  box.addEventListener('paste', e => {
    const t = e.clipboardData?.getData('text');
    if (t == null) return; // let it land in the box; "change" picks it up
    e.preventDefault();
    void useSetupText(t);
  });
  box.addEventListener('change', () => { if (box.value.trim()) void useSetupText(box.value); });
  $('setupPaste').addEventListener('click', async () => {
    const t = await readClipboard();
    if (t && t.trim()) return void useSetupText(t);
    box.focus();
    say('hubMsg', 'Long-press the box above and tap Paste.', '');
  });
  $('setupClear').addEventListener('click', () => { box.value = ''; delete pending.url; delete pending.key; pendingNames = null; say('hubMsg', ''); renderHub(); });
  $('copyAsk').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('Set up BUD for my glasses'); say('hubMsg', 'Copied. Paste it to your hub bot in Grok Bot.', 'ok'); }
    catch { say('hubMsg', 'Type "Set up BUD for my glasses" to your hub bot in Grok Bot.', ''); }
  });
  $('copyHubLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(HUB_BOT_URL); say('hubMsg', 'Copied. Paste the https link into your phone\'s browser, then add the bot.', 'ok'); }
    catch { say('hubMsg', `Copy this into your phone's browser: ${HUB_BOT_URL}`, ''); }
  });
  $('hubSave').addEventListener('click', async () => {
    const url = $<HTMLInputElement>('hubUrl').value.trim();
    const typed = $<HTMLInputElement>('hubKey').value.trim();
    $<HTMLInputElement>('hubKey').value = '';
    if (!validWebhookUrl(url)) return say('hubMsg', 'That is not a Grok Bot webhook URL. It should look like api2.cursor.sh/automations/webhook/... (https).', 'err');
    if (!validKey(typed || settings.hub?.key || '')) return say('hubMsg', "Paste the sender key from the hub bot's routine panel.", 'err');
    await useSetupText(`${url} ${typed || settings.hub?.key}`);
  });
  $('hubClear').addEventListener('click', async () => {
    if (!settings.hub || !confirm('Remove the hub and its bot names from this phone?')) return;
    testState = 'todo'; testNote = '';
    await persist({ ...settings, hub: null, hubBots: [] });
    say('hubMsg', 'Hub removed.', 'ok');
  });
  $('hubTest').addEventListener('click', () => void hubSend('test'));
  $('hubSync').addEventListener('click', () => void hubSend('sync'));
  $('hubNamesClear').addEventListener('click', async () => {
    if (!confirm('Clear the bot names from this phone?')) return;
    await persist({ ...settings, hubBots: [] });
  });
  // DEV ONLY (stripped from builds): ?paste=<text> runs the text through the paste box (simulator pass).
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('paste')) {
    void useSetupText(new URLSearchParams(location.search).get('paste')!);
  }

  const saveXai = async (raw: string) => {
    const k = detectSetup(raw).xaiKey ?? raw.trim();
    $<HTMLInputElement>('xaiKey').value = '';
    if (!validKey(k) || /:\/\//.test(k) || k.startsWith('BUD1.')) return say('xaiMsg', 'That is not an xAI API key. It starts with xai-.', 'err');
    await persist({ ...settings, xaiKey: k });
    say('xaiMsg', settings.hub || settings.bots.length ? 'Key saved on this phone.' : 'Key saved on this phone. Next: step 2.', 'ok');
  };
  $('xaiKey').addEventListener('paste', e => {
    const t = e.clipboardData?.getData('text');
    if (t == null) return;
    e.preventDefault();
    void saveXai(t);
  });
  $('xaiPaste').addEventListener('click', async () => {
    const t = await readClipboard();
    if (t && t.trim()) return void saveXai(t);
    $('xaiKey').focus();
    say('xaiMsg', 'Long-press the key box and tap Paste.', '');
  });
  $('xaiSave').addEventListener('click', () => void saveXai($<HTMLInputElement>('xaiKey').value));
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
