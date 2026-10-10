// DEV ONLY. An in-browser stand-in for the relay so the simulator can exercise every
// screen with no network, no relay, and no bots. Never imported in production builds
// (main.ts guards it with import.meta.env.DEV; the pack check fails if it leaks).
type J = Record<string, any>;
const ROSTER = ['edith', 'shuri', 'pepper', 'forge', 'riri', 'scout', 'collector', 'ouroboros', 'jev', 'gambit', 'agent-zero', 'eitri', 'phastos', 'wong', 'friday', 'vision'];
const NAMES: Record<string, string> = { edith: 'EDITH', shuri: 'Shuri', 'agent-zero': 'Agent Zero', jev: 'Jev' };
const LONG_REPLY = 'Here is where things stand. The relay build passed all tests, the app bundle is clean, and the candidate package is ready for your private test. Two items still need you: the Worker deploy and the secrets. After that, Shuri can issue a pairing code. I also checked the store listing against the Even docs; the icon editor needs a 2 by 2 pixel grid, so Riri will redraw it there. The full report is in your Grok Bot chat with links to every source.';

export function createFakeRelay(mode: string) {
  const extra = mode.includes('many') ? Array.from({ length: 8 }, (_, i) => `test${i + 1}`) : [];
  const bots = [...ROSTER, ...extra].map((id, i) => ({ id, name: NAMES[id] ?? id[0].toUpperCase() + id.slice(1), label: '', needs: 0, unread: id === 'edith' ? 1 : 0, order: i }));
  const now = Date.now();
  let needs: J[] = mode.includes('noneeds') ? [] : [
    { id: 'n1', bot_id: 'shuri', bot_name: 'Shuri', kind: 'approval', title: 'Approve invoice 1042 to Acme', detail: '1,200 USD, due Friday. The draft is ready in Shuri.', created_at: now - 40 * 60000, action: null },
    { id: 'n2', bot_id: 'edith', bot_name: 'EDITH', kind: 'question', title: 'Merge PR 77 now or after QA?', detail: 'QA finishes at 11.', created_at: now - 12 * 60000, action: null },
  ];
  const msgs: J[] = [
    { id: 'm1', bot_id: 'edith', text: 'What is on my calendar after lunch?', status: 'replied', reply_short: 'Design review at 1:30 and a call with Forge at 3.', created_at: now - 3 * 3600000, replied_at: now - 3 * 3600000 + 40000, seen: 1 },
    { id: 'm2', bot_id: 'edith', text: 'How is the glasses build going?', status: 'replied', reply_short: LONG_REPLY, created_at: now - 20 * 60000, replied_at: now - 19 * 60000, seen: 0 },
  ];
  let offline = mode.includes('offline');
  const t0 = Date.now();
  const flaky = mode.includes('flaky'); // online, offline from 15 s to 50 s, then online again
  const sync = () => bots.forEach(b => { b.needs = needs.filter(n => n.bot_id === b.id).length; b.unread = msgs.filter(m => m.bot_id === b.id && m.status === 'replied' && !m.seen).length; });
  const json = (body: J, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  (globalThis as any).__glassFake = { setOffline: (v: boolean) => { offline = v; } };

  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    await new Promise(r => setTimeout(r, 150));
    const url = new URL(String(input));
    const dt = Date.now() - t0;
    const down = offline || (flaky && dt > 15000 && dt < 50000);
    if (down && !(mode.includes('offlinepair') && url.pathname === '/v1/pair')) throw new TypeError('Failed to fetch');
    const p = url.pathname; const m = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    sync();
    if (p === '/v1/pair' && m === 'POST') return body.code === '12345678' ? json({ token: 'gbg_d_FAKE_DEV_ONLY_TOKEN_0000', device_id: 'dev1' }) : json({ error: 'Unauthorized' }, 401);
    if (p === '/v1/bots') return json({ bots: bots.filter(b => mode.includes('nobots') ? false : true).map(({ order, ...b }) => b) });
    if (p === '/v1/needs') return json({ needs });
    let r = /^\/v1\/bots\/([^/]+)\/messages$/.exec(p);
    if (r) { const list = msgs.filter(x => x.bot_id === r![1]); return json({ messages: list.slice(-20).map(({ seen, ...x }) => x), total: list.length }); }
    r = /^\/v1\/bots\/([^/]+)\/read$/.exec(p);
    if (r) { msgs.forEach(x => { if (x.bot_id === r![1]) x.seen = 1; }); return json({ ok: true }); }
    if (p === '/v1/transcribe') return json({ transcript: 'Summarize what is waiting for me today.', stub: true });
    if (p === '/v1/messages' && m === 'POST') {
      const id = `m${msgs.length + 1}`;
      msgs.push({ id, bot_id: body.bot_id, text: body.text, status: 'sent', reply_short: null, created_at: Date.now(), replied_at: null, seen: 0 });
      setTimeout(() => { const x = msgs.find(y => y.id === id)!; x.status = 'replied'; x.reply_short = `Two things wait for you: invoice 1042 needs approval in the app, and PR 77 needs a merge call.`; x.replied_at = Date.now(); }, 5000);
      return json({ message_id: id, status: 'sent' });
    }
    r = /^\/v1\/messages\/([^/]+)$/.exec(p);
    if (r) { const x = msgs.find(y => y.id === r![1]); if (!x) return json({ error: 'Not found' }, 404); const { seen, ...rest } = x; return json(rest); }
    r = /^\/v1\/needs\/([^/]+)\/act$/.exec(p);
    if (r) { const n = needs.find(x => x.id === r![1]); if (!n) return json({ error: 'Not found' }, 404); needs = needs.filter(x => x !== n); return json({ ok: true, forwarded: body.action !== 'snooze_1h' }); }
    return json({ error: 'Not found' }, 404);
  };
}
