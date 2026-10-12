// Device-local settings (Even app local storage on the phone). Keys are saved only here.
// The xAI key goes only to api.x.ai; a bot's webhook URL and sender key travel only inside
// each send, through the zero-retention forwarder, to that bot's webhook.
import { MAX_HUB_BOTS, checkName } from './botcode';
import { MAX_BOTS } from './config';
import type { BotConfig, HubConfig, Route, Settings } from './types';

export interface KV { get(k: string): Promise<string>; set(k: string, v: string): Promise<void> }
export const SETTINGS_KEY = 'bud.settings.v1';
export const EMPTY: Settings = { bots: [], xaiKey: '', hub: null, hubBots: [] };
export const HUB_FALLBACK_NAME = 'Hub';

// A Grok Bot webhook URL: api2.cursor.sh/automations/webhook/<id> over https, nothing else.
// Same rule as the forwarder (forwarder/src/forward.ts WEBHOOK_RE), with a length bound.
const WEBHOOK_RE = /^https:\/\/api2\.cursor\.sh\/automations\/webhook\/[A-Za-z0-9_-]{6,128}$/;
export function validWebhookUrl(raw: string): boolean { return WEBHOOK_RE.test(raw.trim()); }

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
  let hub: HubConfig | null = null;
  const h = r.hub as Partial<HubConfig> | null | undefined;
  if (h && typeof h === 'object') {
    const url = String(h.url ?? '').trim(), key = String(h.key ?? '').trim();
    if (validWebhookUrl(url) && validKey(key)) hub = { url, key };
  }
  const hubBots: string[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(r.hubBots) ? r.hubBots : []) {
    const c = checkName(n);
    if (!c.ok || seen.has(c.name.toLowerCase())) continue;
    seen.add(c.name.toLowerCase()); hubBots.push(c.name);
    if (hubBots.length >= MAX_HUB_BOTS) break;
  }
  return { bots, xaiKey: typeof r.xaiKey === 'string' ? r.xaiKey.trim() : '', hub, hubBots };
}

/** Glasses list: hub-routed names first (or one "Hub" entry before a code is pasted), then direct bots. */
export function routes(s: Settings): Route[] {
  const out: Route[] = [];
  if (s.hub) {
    const names = s.hubBots ?? [];
    if (names.length) names.forEach((name, i) => out.push({ id: `hub:${i}`, name, url: s.hub!.url, key: s.hub!.key, target: name, viaHub: true }));
    else out.push({ id: 'hub:self', name: HUB_FALLBACK_NAME, url: s.hub.url, key: s.hub.key, viaHub: true });
  }
  for (const b of s.bots) out.push({ ...b });
  return out;
}

export async function loadSettings(kv: KV): Promise<Settings> {
  try { return sanitize(JSON.parse((await kv.get(SETTINGS_KEY)) || 'null')); } catch { return { ...EMPTY, bots: [], hubBots: [] }; }
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
