import { Hono, type Context } from 'hono';
import { purge, NONCE_TTL_MS, type Sql } from './db';
import { randomDigits, randomId, randomToken, safeEqualHex, sha256Hex } from './crypto';
import rosterJson from './roster.json';

export interface Env {
  DEV?: string;                 // "true" only in wrangler dev; enables http webhooks + STT stub
  ADMIN_TOKEN?: string;         // secret: issues pairing codes, lists/revokes devices
  BOT_WRITE_TOKEN?: string;     // secret: bots post replies and needs-you items
  XAI_API_KEY?: string;         // secret: speech-to-text
  STT_STUB_TEXT?: string;       // dev only: fixed transcript when no XAI key
  REPLY_TIMEOUT_MS?: string;    // default 180000
  [key: string]: unknown;       // WEBHOOK_URL_<SUFFIX>, WEBHOOK_KEY_<SUFFIX>
}

export interface RosterBot { id: string; name: string; label: string; suffix: string; needs_feed: boolean }
export const ROSTER: RosterBot[] = (rosterJson as { bots: RosterBot[] }).bots;

export interface Deps {
  sql: Sql;
  env: Env;
  fetch: typeof fetch;
  now: () => number;
  roster?: RosterBot[];
}

type Vars = { deviceId: string };
type C = Context<{ Variables: Vars }>;

export const LIMITS = {
  pair: { n: 5, windowMs: 60 * 60 * 1000 },
  read: { n: 120, windowMs: 60 * 1000 },
  transcribe: { n: 20, windowMs: 60 * 1000 },
  message: { n: 10, windowMs: 60 * 1000 },
  messageDay: { n: 200, windowMs: 24 * 60 * 60 * 1000 },
  act: { n: 30, windowMs: 60 * 1000 },
  bot: { n: 60, windowMs: 60 * 1000 },
  admin: { n: 20, windowMs: 60 * 1000 },
};
export const TS_SKEW_MS = 60 * 1000;
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
export const SNOOZE_MS = 60 * 60 * 1000;
export const MAX_AUDIO_BYTES = 2_000_000;
export const MAX_TEXT = 1000;
export const MAX_REPLY = 1500; // glasses page long replies in the Reader
export const MAX_TITLE = 60;
export const MAX_DETAIL = 400;
export const WEBHOOK_TIMEOUT_MS = 8000;

class HttpError extends Error {
  constructor(public status: 400 | 401 | 404 | 409 | 413 | 429 | 502 | 503, msg: string) { super(msg); }
}
const ERR = {
  bad: () => new HttpError(400, 'Bad request'),
  auth: () => new HttpError(401, 'Unauthorized'),
  notFound: () => new HttpError(404, 'Not found'),
  replay: () => new HttpError(409, 'Request rejected'),
  tooBig: () => new HttpError(413, 'Too large'),
  rate: () => new HttpError(429, 'Too many requests'),
  upstream: () => new HttpError(502, 'Upstream failed'),
  unavailable: () => new HttpError(503, 'Unavailable'),
};

// Strip characters the G2 firmware font is unlikely to have (emoji, control chars)
// and collapse whitespace, then trim to max length.
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  const s = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 3).trimEnd() + '...' : s;
}

export function createApp(deps: Deps) {
  const { sql, env, now } = deps;
  const roster = deps.roster ?? ROSTER;
  const app = new Hono<{ Variables: Vars }>();
  const replyTimeout = Number(env.REPLY_TIMEOUT_MS ?? 180000) || 180000;
  const isDev = env.DEV === 'true';

  function rateLimit(key: string, lim: { n: number; windowMs: number }) {
    const t = now();
    const row = sql.all<{ window_start: number; count: number }>(`SELECT window_start, count FROM rate WHERE key = ?`, key)[0];
    if (!row || t - row.window_start >= lim.windowMs) {
      sql.run(`INSERT OR REPLACE INTO rate (key, window_start, count) VALUES (?, ?, 1)`, key, t);
      return;
    }
    if (row.count >= lim.n) throw ERR.rate();
    sql.run(`UPDATE rate SET count = count + 1 WHERE key = ?`, key);
  }

  function bearer(c: C): string {
    const h = c.req.header('authorization') ?? '';
    const m = /^Bearer\s+(\S{16,256})$/.exec(h);
    if (!m) throw ERR.auth();
    return m[1];
  }

  async function secretMatches(given: string, secret: unknown): Promise<boolean> {
    if (typeof secret !== 'string' || secret.length < 16) return false;
    return safeEqualHex(await sha256Hex(given), await sha256Hex(secret));
  }

  // Replay guard: X-Glass-Ts within ±60 s, X-Glass-Request-Id unseen for 10 min.
  function replayGuard(c: C) {
    const ts = Number(c.req.header('x-glass-ts'));
    const rid = c.req.header('x-glass-request-id') ?? '';
    if (!Number.isFinite(ts) || Math.abs(now() - ts) > TS_SKEW_MS) throw ERR.replay();
    if (!/^[A-Za-z0-9-]{16,64}$/.test(rid)) throw ERR.replay();
    const seen = sql.all(`SELECT 1 FROM nonces WHERE request_id = ? AND expires_at >= ?`, rid, now());
    if (seen.length) throw ERR.replay();
    sql.run(`INSERT OR REPLACE INTO nonces (request_id, expires_at) VALUES (?, ?)`, rid, now() + NONCE_TTL_MS);
    return rid;
  }

  async function requireDevice(c: C): Promise<string> {
    const token = bearer(c);
    if (!token.startsWith('gbg_d_')) throw ERR.auth();
    const hash = await sha256Hex(token);
    const row = sql.all<{ id: string }>(`SELECT id FROM devices WHERE token_hash = ? AND revoked = 0`, hash)[0];
    if (!row) throw ERR.auth();
    sql.run(`UPDATE devices SET last_seen = ? WHERE id = ?`, now(), row.id);
    c.set('deviceId', row.id);
    return row.id;
  }

  async function requireBot(c: C) {
    if (!(await secretMatches(bearer(c), env.BOT_WRITE_TOKEN))) throw ERR.auth();
    rateLimit('bot', LIMITS.bot);
  }

  async function requireAdmin(c: C) {
    if (!(await secretMatches(bearer(c), env.ADMIN_TOKEN))) throw ERR.auth();
    rateLimit('admin', LIMITS.admin);
  }

  function webhookFor(bot: RosterBot): { url: string; key: string } | null {
    const url = env[`WEBHOOK_URL_${bot.suffix}`];
    const key = env[`WEBHOOK_KEY_${bot.suffix}`];
    if (typeof url !== 'string' || typeof key !== 'string' || key.length < 8) return null;
    if (!url.startsWith('https://') && !(isDev && url.startsWith('http://'))) return null;
    return { url, key };
  }

  function activeBot(id: unknown): RosterBot {
    const bot = roster.find(b => b.id === id);
    if (!bot || !webhookFor(bot)) throw ERR.notFound();
    return bot;
  }

  async function postWebhook(bot: RosterBot, body: Record<string, unknown>): Promise<boolean> {
    const hook = webhookFor(bot);
    if (!hook) return false;
    try {
      const res = await deps.fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hook.key}`,
          'X-Automation-Key': hook.key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function json(c: C): Promise<Record<string, unknown>> {
    try {
      const b = await c.req.json();
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
      return b as Record<string, unknown>;
    } catch {
      throw ERR.bad();
    }
  }

  function messageView(m: MessageRow) {
    let status = m.status;
    if (status === 'sent' && now() - m.created_at > replyTimeout) status = 'timeout';
    return { id: m.id, bot_id: m.bot_id, text: m.text, status, reply_short: m.reply_short ?? null, created_at: m.created_at, replied_at: m.replied_at ?? null };
  }

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    console.error('[relay] internal error');
    return c.json({ error: 'Something went wrong' }, 500);
  });
  app.notFound(c => c.json({ error: 'Not found' }, 404));

  app.get('/v1/health', c => c.json({ ok: true }));

  // ---- pairing / devices -------------------------------------------------
  app.post('/v1/pair/code', async c => {
    await requireAdmin(c);
    const code = randomDigits(8);
    sql.run(`INSERT INTO pair_codes (code_hash, expires_at) VALUES (?, ?)`, await sha256Hex(code), now() + PAIR_CODE_TTL_MS);
    return c.json({ code, expires_in_s: PAIR_CODE_TTL_MS / 1000 });
  });

  app.post('/v1/pair', async c => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    rateLimit(`pair:${ip}`, LIMITS.pair);
    const b = await json(c);
    const code = typeof b.code === 'string' ? b.code.replace(/\D/g, '') : '';
    if (code.length !== 8) throw ERR.auth();
    const hash = await sha256Hex(code);
    const row = sql.all<{ code_hash: string }>(`SELECT code_hash FROM pair_codes WHERE code_hash = ? AND used = 0 AND expires_at >= ?`, hash, now())[0];
    if (!row) throw ERR.auth();
    sql.run(`UPDATE pair_codes SET used = 1 WHERE code_hash = ?`, hash);
    const token = randomToken('gbg_d_');
    const id = randomId();
    const name = cleanText(b.device_name, 40) || 'G2';
    sql.run(`INSERT INTO devices (id, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`, id, name, await sha256Hex(token), now(), now());
    return c.json({ device_id: id, token });
  });

  app.get('/v1/devices', async c => {
    await requireAdmin(c);
    return c.json({ devices: sql.all(`SELECT id, name, created_at, last_seen, revoked FROM devices ORDER BY created_at DESC`) });
  });

  app.delete('/v1/devices/:id', async c => {
    await requireAdmin(c);
    sql.run(`UPDATE devices SET revoked = 1 WHERE id = ?`, c.req.param('id'));
    return c.json({ ok: true });
  });

  // ---- bots ----------------------------------------------------------------
  app.get('/v1/bots', async c => {
    const dev = await requireDevice(c);
    rateLimit(`read:${dev}`, LIMITS.read);
    const t = now();
    const needs = sql.all<{ bot_id: string; n: number }>(`SELECT bot_id, COUNT(*) AS n FROM needs WHERE status = 'open' AND (snooze_until IS NULL OR snooze_until < ?) GROUP BY bot_id`, t);
    const unread = sql.all<{ bot_id: string; n: number }>(`SELECT bot_id, COUNT(*) AS n FROM messages WHERE status = 'replied' AND seen = 0 GROUP BY bot_id`);
    const nMap = new Map(needs.map(r => [r.bot_id, Number(r.n)]));
    const uMap = new Map(unread.map(r => [r.bot_id, Number(r.n)]));
    const bots = roster.filter(b => webhookFor(b)).map(b => ({ id: b.id, name: b.name, label: b.label, needs: nMap.get(b.id) ?? 0, unread: uMap.get(b.id) ?? 0 }));
    return c.json({ bots });
  });

  app.get('/v1/bots/:id/messages', async c => {
    const dev = await requireDevice(c);
    rateLimit(`read:${dev}`, LIMITS.read);
    const bot = activeBot(c.req.param('id'));
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 10) || 10, 1), 20);
    const rows = sql.all<MessageRow>(`SELECT * FROM messages WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?`, bot.id, limit);
    const total = Number(sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE bot_id = ?`, bot.id)[0]?.n ?? 0);
    return c.json({ messages: rows.reverse().map(messageView), total });
  });

  app.post('/v1/bots/:id/read', async c => {
    const dev = await requireDevice(c);
    rateLimit(`act:${dev}`, LIMITS.act);
    const bot = activeBot(c.req.param('id'));
    sql.run(`UPDATE messages SET seen = 1 WHERE bot_id = ?`, bot.id);
    return c.json({ ok: true });
  });

  // ---- voice ---------------------------------------------------------------
  app.post('/v1/transcribe', async c => {
    const dev = await requireDevice(c);
    replayGuard(c);
    rateLimit(`transcribe:${dev}`, LIMITS.transcribe);
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_AUDIO_BYTES + 10_000) throw ERR.tooBig();
    let form: FormData;
    try { form = await c.req.formData(); } catch { throw ERR.bad(); }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw ERR.bad();
    const audio = file as File;
    if (audio.size === 0) throw ERR.bad();
    if (audio.size > MAX_AUDIO_BYTES) throw ERR.tooBig();

    if (!env.XAI_API_KEY) {
      if (isDev && typeof env.STT_STUB_TEXT === 'string') {
        return c.json({ transcript: cleanText(env.STT_STUB_TEXT, MAX_TEXT), stub: true });
      }
      throw ERR.unavailable();
    }
    // Same path as Wondereye's /api/transcribe (packages/worker/src/index.ts).
    const stt = new FormData();
    stt.append('file', audio, 'audio.wav');
    stt.append('model', 'whisper-1');
    let text = '';
    try {
      const res = await deps.fetch('https://api.x.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.XAI_API_KEY}` },
        body: stt,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { text?: string };
      text = cleanText(data.text ?? '', MAX_TEXT);
    } catch {
      throw ERR.upstream();
    }
    return c.json({ transcript: text });
  });

  // ---- messages --------------------------------------------------------------
  app.post('/v1/messages', async c => {
    const dev = await requireDevice(c);
    const rid = replayGuard(c);
    rateLimit(`message:${dev}`, LIMITS.message);
    rateLimit(`messageDay:${dev}`, LIMITS.messageDay);
    const b = await json(c);
    const bot = activeBot(b.bot_id);
    const text = cleanText(b.text, MAX_TEXT);
    if (!text) throw ERR.bad();
    const id = randomId();
    const t = now();
    sql.run(`INSERT INTO messages (id, bot_id, device_id, text, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`, id, bot.id, dev, text, t);
    const ok = await postWebhook(bot, { source: 'grokbot-glass', kind: 'voice', bot_id: bot.id, message_id: id, request_id: rid, text, ts: t });
    sql.run(`UPDATE messages SET status = ? WHERE id = ?`, ok ? 'sent' : 'failed', id);
    return c.json({ message_id: id, status: ok ? 'sent' : 'failed' }, ok ? 200 : 502);
  });

  app.get('/v1/messages/:id', async c => {
    const dev = await requireDevice(c);
    rateLimit(`read:${dev}`, LIMITS.read);
    const m = sql.all<MessageRow>(`SELECT * FROM messages WHERE id = ?`, c.req.param('id'))[0];
    if (!m) throw ERR.notFound();
    return c.json(messageView(m));
  });

  app.post('/v1/replies', async c => {
    await requireBot(c);
    replayGuard(c);
    const b = await json(c);
    const short = cleanText(b.short, MAX_REPLY);
    if (!short || typeof b.message_id !== 'string' || typeof b.bot_id !== 'string') throw ERR.bad();
    const m = sql.all<MessageRow>(`SELECT * FROM messages WHERE id = ? AND bot_id = ?`, b.message_id, b.bot_id)[0];
    if (!m) throw ERR.notFound();
    if (m.status === 'replied') return c.json({ ok: true, duplicate: true });
    sql.run(`UPDATE messages SET status = 'replied', reply_short = ?, replied_at = ?, seen = 0 WHERE id = ?`, short, now(), m.id);
    return c.json({ ok: true });
  });

  // ---- needs you -------------------------------------------------------------
  app.get('/v1/needs', async c => {
    const dev = await requireDevice(c);
    rateLimit(`read:${dev}`, LIMITS.read);
    const rows = sql.all(`SELECT id, bot_id, kind, title, detail, created_at, action, action_at FROM needs WHERE status = 'open' AND (snooze_until IS NULL OR snooze_until < ?) ORDER BY created_at DESC LIMIT 20`, now());
    const names = new Map(roster.map(b => [b.id, b.name]));
    return c.json({ needs: rows.map(r => ({ ...r, bot_name: names.get(String(r.bot_id)) ?? String(r.bot_id) })) });
  });

  app.post('/v1/needs', async c => {
    await requireBot(c);
    replayGuard(c);
    const b = await json(c);
    const bot = roster.find(x => x.id === b.bot_id);
    if (!bot || !bot.needs_feed) throw ERR.notFound();
    const ref = cleanText(b.ref, 64);
    const kind = ['approval', 'question', 'draft', 'other'].includes(String(b.kind)) ? String(b.kind) : 'other';
    const title = cleanText(b.title, MAX_TITLE);
    const detail = cleanText(b.detail ?? '', MAX_DETAIL);
    if (!ref || !title) throw ERR.bad();
    const existing = sql.all<{ id: string }>(`SELECT id FROM needs WHERE bot_id = ? AND ref = ?`, bot.id, ref)[0];
    if (existing) {
      sql.run(`UPDATE needs SET kind = ?, title = ?, detail = ?, status = 'open' WHERE id = ?`, kind, title, detail, existing.id);
      return c.json({ id: existing.id, updated: true });
    }
    const id = randomId();
    sql.run(`INSERT INTO needs (id, bot_id, ref, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, bot.id, ref, kind, title, detail, now());
    return c.json({ id });
  });

  app.post('/v1/needs/resolve', async c => {
    await requireBot(c);
    replayGuard(c);
    const b = await json(c);
    const ref = cleanText(b.ref, 64);
    if (typeof b.bot_id !== 'string' || !ref) throw ERR.bad();
    sql.run(`UPDATE needs SET status = 'resolved' WHERE bot_id = ? AND ref = ?`, b.bot_id, ref);
    return c.json({ ok: true });
  });

  app.post('/v1/needs/:id/act', async c => {
    const dev = await requireDevice(c);
    const rid = replayGuard(c);
    rateLimit(`act:${dev}`, LIMITS.act);
    const b = await json(c);
    const action = String(b.action);
    if (!['hold', 'snooze_1h', 'ask_at_desk'].includes(action)) throw ERR.bad();
    const item = sql.all<{ id: string; bot_id: string; ref: string; status: string }>(`SELECT id, bot_id, ref, status FROM needs WHERE id = ?`, c.req.param('id'))[0];
    if (!item || item.status !== 'open') throw ERR.notFound();
    const t = now();
    sql.run(`UPDATE needs SET action = ?, action_at = ?, snooze_until = ? WHERE id = ?`, action, t, action === 'snooze_1h' ? t + SNOOZE_MS : null, item.id);
    let forwarded = false;
    if (action !== 'snooze_1h') {
      const bot = roster.find(x => x.id === item.bot_id);
      if (bot) forwarded = await postWebhook(bot, { source: 'grokbot-glass', kind: 'needs_action', bot_id: bot.id, item_ref: item.ref, action, request_id: rid, ts: t });
    }
    return c.json({ ok: true, forwarded });
  });

  return app;
}

export interface MessageRow {
  id: string; bot_id: string; device_id: string; text: string; status: string;
  reply_short: string | null; created_at: number; replied_at: number | null; seen: number;
}

export { purge };
