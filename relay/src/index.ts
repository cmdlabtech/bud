import { DurableObject } from 'cloudflare:workers';
import { createApp, type Env } from './app';
import { migrate, purge, type Sql } from './db';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // app runs at http://127.0.0.1:<random port>; auth is the bearer token
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Glass-Ts, X-Glass-Request-Id',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  r.headers.set('Cache-Control', 'no-store');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  return r;
}

const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

// One Durable Object instance holds all relay state (personal, single-user relay).
export class GlassStore extends DurableObject<Env> {
  private sql: Sql;
  private app: ReturnType<typeof createApp>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const s = ctx.storage.sql;
    this.sql = {
      all: (q, ...p) => s.exec(q, ...(p as SqlStorageValue[])).toArray() as never,
      run: (q, ...p) => { s.exec(q, ...(p as SqlStorageValue[])); },
    };
    migrate(this.sql);
    this.app = createApp({ sql: this.sql, env, fetch: (...a) => fetch(...a), now: () => Date.now() });
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) == null) await ctx.storage.setAlarm(Date.now() + PURGE_EVERY_MS);
    });
  }

  async fetch(req: Request): Promise<Response> {
    return this.app.fetch(req);
  }

  async alarm(): Promise<void> {
    purge(this.sql, Date.now());
    await this.ctx.storage.setAlarm(Date.now() + PURGE_EVERY_MS);
  }
}

export default {
  async fetch(req: Request, env: Env & { STORE: DurableObjectNamespace<GlassStore> }): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/v1/')) return withCors(Response.json({ error: 'Not found' }, { status: 404 }));
    const stub = env.STORE.get(env.STORE.idFromName('main'));
    try {
      // Buffer the body (≤2 MB, enforced in the app) so an early 4xx in the DO never
      // leaves a half-read request stream behind.
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
      return withCors(await stub.fetch(new Request(req.url, { method: req.method, headers: req.headers, body })));
    } catch {
      return withCors(Response.json({ error: 'Something went wrong' }, { status: 500 }));
    }
  },
};
