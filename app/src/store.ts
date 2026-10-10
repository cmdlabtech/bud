// Device-local settings (Even app local storage on the phone). Keys never leave the phone
// except to their own service (xAI key -> api.x.ai, sender key -> that bot's webhook).
import { MAX_BOTS, WEBHOOK_ORIGIN, WEBHOOK_PATH } from './config';
import type { BotConfig, Settings } from './types';

export interface KV { get(k: string): Promise<string>; set(k: string, v: string): Promise<void> }
export const SETTINGS_KEY = 'bud.settings.v1';
export const EMPTY: Settings = { bots: [], xaiKey: '' };

// A Grok Bot webhook URL looks like https://api2.cursor.sh/automations/webhook/<id>, no query string.
export function validWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  if (u.origin !== WEBHOOK_ORIGIN || u.search || u.hash || u.username || u.password) return false;
  if (!u.pathname.startsWith(WEBHOOK_PATH)) return false;
  return /^[A-Za-z0-9_-]{6,128}$/.test(u.pathname.slice(WEBHOOK_PATH.length));
}

export function validKey(k: string): boolean { return k.trim().length >= 8 && !/\s/.test(k.trim()); }

// Shown after saving: never the whole key.
export function mask(k: string): string { return k ? `saved, ends ${k.slice(-4)}` : 'not set'; }

export function newId(): string {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return 'b' + [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function cleanName(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const bots: BotConfig[] = [];
  for (const b of Array.isArray(r.bots) ? r.bots : []) {
    if (!b || typeof b !== 'object') continue;
    const name = cleanName(String((b as BotConfig).name ?? ''));
    const url = String((b as BotConfig).url ?? '').trim();
    const key = String((b as BotConfig).key ?? '').trim();
    const id = typeof (b as BotConfig).id === 'string' && (b as BotConfig).id ? (b as BotConfig).id : newId();
    if (name && validWebhookUrl(url) && validKey(key)) bots.push({ id, name, url, key });
    if (bots.length >= MAX_BOTS) break;
  }
  return { bots, xaiKey: typeof r.xaiKey === 'string' ? r.xaiKey.trim() : '' };
}

export async function loadSettings(kv: KV): Promise<Settings> {
  try { return sanitize(JSON.parse((await kv.get(SETTINGS_KEY)) || 'null')); } catch { return { ...EMPTY, bots: [] }; }
}

export async function saveSettings(kv: KV, s: Settings): Promise<Settings> {
  const clean = sanitize(s);
  await kv.set(SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice();
  if (from < 0 || from >= a.length || to < 0 || to >= a.length) return a;
  const [x] = a.splice(from, 1); a.splice(to, 0, x);
  return a;
}
