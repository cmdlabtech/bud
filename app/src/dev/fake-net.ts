// DEV ONLY (never in builds; check-ehpk-urls.mjs fails on createFakeNet): fakes xAI STT and
// the bot webhooks so the simulator can run the whole flow with no network and no real keys.
//   ?fake=1        everything works
//   ?fake=sendfail the webhook (behind the forwarder) returns 500
//   ?fake=sttfail  xAI returns 401
//   ?fake=sttonly  only xAI is faked; sends really go to VITE_FORWARDER_URL (local wrangler dev)
//   ?fake=fbfail   feedback endpoint returns 502;  ?fake=fbrate  feedback returns 429
// Feedback is always faked in dev mode (no Turnstile, no GitHub issue); the last payload is kept
// in window.__budFeedbackSent for the simulator check.
import { SETTINGS_KEY, type KV } from '../store';

export const FAKE_FEEDBACK_BASE = 'https://bud-feedback.fake.invalid';
export const FAKE_TURNSTILE_TOKEN = 'dev-fake-turnstile-token';

export function createFakeNet(mode: string) {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = String(input);
    await new Promise(r => setTimeout(r, 300));
    if (url.includes('/v1/stt')) {
      if (mode === 'sttfail') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ text: 'Remind me to call the bank at three.' }), { status: 200 });
    }
    if (url.endsWith('/api/feedback')) {
      (globalThis as any).__budFeedbackSent = JSON.parse(String(_init?.body ?? '{}'));
      if (mode === 'fbfail') return new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 502 });
      if (mode === 'fbrate') return new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 429 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (mode === 'sttonly' && url.endsWith('/v1/send')) return fetch(input, _init);
    if (url.endsWith('/v1/send')) {
      // Log only the forwarded body (never the webhook URL or key) so the simulator pass can check target.
      try { const body = JSON.parse(String(_init?.body ?? '{}')).body; (globalThis as any).__budLastSend = body; console.log('[bud-dev] forwarded body', JSON.stringify(body)); } catch { /* ignore */ }
      if (mode === 'sendfail') return new Response(JSON.stringify({ ok: false, error: 'upstream', upstream_status: 500 }), { status: 502 });
      return new Response(JSON.stringify({ ok: true, upstream_status: 200 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
}

//   ?fake=hub      hub mode: a fake hub with no bot names yet and no direct bots (paste a code with &paste=BUD1...)
//   ?fake=fresh    first run: nothing saved (paste-setup measurements)
export async function seedFakeSettings(kv: KV, mode = '1') {
  if (mode === 'fresh') { await kv.set(SETTINGS_KEY, ''); return; }
  if (mode === 'hub') {
    await kv.set(SETTINGS_KEY, JSON.stringify({ xaiKey: 'dev-fake-key-not-real', bots: [], hub: { url: 'https://api2.cursor.sh/automations/webhook/devfakehub0', key: 'dev-fake-hub-key' }, hubBots: [] }));
    return;
  }
  if (await kv.get(SETTINGS_KEY)) return;
  const hook = (id: string) => `https://api2.cursor.sh/automations/webhook/devfake${id}`;
  await kv.set(SETTINGS_KEY, JSON.stringify({
    xaiKey: 'dev-fake-key-not-real',
    bots: ['Research bot', 'Inbox bot', 'Calendar bot', 'Travel bot', 'Writing bot', 'Finance bot', 'Home bot', 'Code bot', 'News bot', 'Shopping bot'].map((name, i) => ({ id: `d${i}`, name, url: hook(String(i).padStart(4, '0')), key: 'dev-fake-sender-key' })),
  }));
}
