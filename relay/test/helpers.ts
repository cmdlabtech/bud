import { DatabaseSync } from 'node:sqlite';
import { createApp, type Env, type RosterBot } from '../src/app';
import { migrate, type Sql } from '../src/db';

export const ADMIN = 'admin-token-for-tests-0123456789';
export const BOTTOKEN = 'bot-token-for-tests-0123456789ab';

export const TEST_ROSTER: RosterBot[] = [
  { id: 'edith', name: 'EDITH', label: 'Chief of staff', suffix: 'EDITH', needs_feed: true },
  { id: 'shuri', name: 'Shuri', label: 'Engineering', suffix: 'SHURI', needs_feed: true },
  { id: 'pepper', name: 'Pepper', label: 'Finance', suffix: 'PEPPER', needs_feed: false },
];

export function makeSql(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    all: (q, ...p) => db.prepare(q).all(...(p as never[])) as never,
    run: (q, ...p) => { db.prepare(q).run(...(p as never[])); },
  };
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  sql: Sql;
  clock: { t: number };
  hooks: { url: string; init: RequestInit; body: any }[];
  hookStatus: { code: number };
  sttCalls: number;
  req: (method: string, path: string, opts?: { token?: string; body?: unknown; form?: FormData; replay?: boolean; ip?: string; rid?: string; ts?: number }) => Promise<Response>;
}

export function harness(envOverride: Partial<Env> = {}): Harness {
  const sql = makeSql();
  migrate(sql);
  const clock = { t: 1_800_000_000_000 };
  const hooks: Harness['hooks'] = [];
  const hookStatus = { code: 200 };
  const h = { sttCalls: 0 } as Harness;
  const env: Env = {
    ADMIN_TOKEN: ADMIN,
    BOT_WRITE_TOKEN: BOTTOKEN,
    WEBHOOK_URL_EDITH: 'https://hooks.test/edith',
    WEBHOOK_KEY_EDITH: 'edith-sender-key-xyz',
    WEBHOOK_URL_SHURI: 'https://hooks.test/shuri',
    WEBHOOK_KEY_SHURI: 'shuri-sender-key-xyz',
    ...envOverride,
  };
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.x.ai/')) {
      h.sttCalls++;
      return Response.json({ text: 'transcribed words' });
    }
    hooks.push({ url, init: init!, body: JSON.parse(String(init!.body)) });
    return new Response('ok', { status: hookStatus.code });
  }) as typeof fetch;
  const app = createApp({ sql, env, fetch: fakeFetch, now: () => clock.t, roster: TEST_ROSTER });
  let n = 0;
  const req: Harness['req'] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.replay !== false) {
      headers['X-Glass-Ts'] = String(opts.ts ?? clock.t);
      headers['X-Glass-Request-Id'] = opts.rid ?? `req-${(++n).toString().padStart(4, '0')}-abcdefghijkl`;
    }
    if (opts.ip) headers['cf-connecting-ip'] = opts.ip;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
    return app.request(path, { method, headers, body });
  };
  return Object.assign(h, { app, sql, clock, hooks, hookStatus, req });
}

export async function pairDevice(h: Harness, ip = '1.1.1.1'): Promise<string> {
  const c = await (await h.req('POST', '/v1/pair/code', { token: ADMIN })).json() as { code: string };
  const p = await (await h.req('POST', '/v1/pair', { body: { code: c.code, device_name: 'G2 test' }, ip })).json() as { token: string };
  return p.token;
}
