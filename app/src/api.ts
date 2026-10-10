// Relay client. The only network origin the app talks to (app.json whitelist).
import type { Bot, Message, Need } from './types';

export interface KV { get(k: string): Promise<string>; set(k: string, v: string): Promise<void> }
export const TOKEN_KEY = 'glass.deviceToken';

export class ApiError extends Error {
  constructor(public kind: 'offline' | 'auth' | 'notfound' | 'rate' | 'server' | 'bad', public status = 0) { super(kind); }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

export class RelayClient {
  private token: string | null = null;
  constructor(private base: string, private kv: KV, private f: typeof fetch = (...a) => fetch(...a)) {}

  async load(): Promise<boolean> {
    const t = await this.kv.get(TOKEN_KEY).catch(() => '');
    this.token = t && t.startsWith('bud_d_') ? t : null;
    return this.token !== null;
  }
  get paired(): boolean { return this.token !== null; }
  async forget(): Promise<void> { this.token = null; await this.kv.set(TOKEN_KEY, ''); }

  private async call<T>(method: string, path: string, opts: { body?: unknown; form?: FormData; auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (opts.auth !== false) {
      if (!this.token) throw new ApiError('auth', 401);
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (method !== 'GET') { headers['X-Glass-Ts'] = String(Date.now()); headers['X-Glass-Request-Id'] = uuid(); }
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    let res: Response;
    try {
      res = await this.f(this.base + path, { method, headers, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 12000) });
    } catch {
      throw new ApiError('offline');
    }
    if (res.status === 401) { if (opts.auth !== false) await this.forget(); throw new ApiError('auth', 401); }
    if (res.status === 404) throw new ApiError('notfound', 404);
    if (res.status === 429) throw new ApiError('rate', 429);
    if (res.status === 400 || res.status === 409 || res.status === 413) throw new ApiError('bad', res.status);
    let data: any;
    try { data = await res.json(); } catch { throw new ApiError('server', res.status); }
    if (res.status >= 500 && !(res.status === 502 && data?.message_id)) throw new ApiError('server', res.status);
    return data as T;
  }

  async pair(code: string, deviceName: string): Promise<void> {
    const r = await this.call<{ token: string }>('POST', '/v1/pair', { body: { code, device_name: deviceName }, auth: false });
    if (!r.token?.startsWith('bud_d_')) throw new ApiError('server');
    this.token = r.token;
    await this.kv.set(TOKEN_KEY, r.token);
  }
  bots() { return this.call<{ bots: Bot[] }>('GET', '/v1/bots').then(r => r.bots); }
  needs() { return this.call<{ needs: Need[] }>('GET', '/v1/needs').then(r => r.needs); }
  thread(botId: string) { return this.call<{ messages: Message[]; total: number }>('GET', `/v1/bots/${encodeURIComponent(botId)}/messages?limit=20`); }
  markRead(botId: string) { return this.call<{ ok: boolean }>('POST', `/v1/bots/${encodeURIComponent(botId)}/read`, { body: {} }); }
  message(id: string) { return this.call<Message>('GET', `/v1/messages/${encodeURIComponent(id)}`); }
  send(botId: string, text: string) { return this.call<{ message_id: string; status: 'sent' | 'failed' }>('POST', '/v1/messages', { body: { bot_id: botId, text } }); }
  act(needId: string, action: string) { return this.call<{ ok: boolean; forwarded: boolean }>('POST', `/v1/needs/${encodeURIComponent(needId)}/act`, { body: { action } }); }
  transcribe(wav: Uint8Array) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    return this.call<{ transcript: string; stub?: boolean }>('POST', '/v1/transcribe', { form, timeoutMs: 30000 }).then(r => r.transcript);
  }
}
