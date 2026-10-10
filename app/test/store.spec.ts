import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, loadSettings, mask, move, saveSettings, validWebhookUrl, type KV } from '../src/store';

class MemKV implements KV { m = new Map<string, string>(); async get(k: string) { return this.m.get(k) ?? ''; } async set(k: string, v: string) { this.m.set(k, v); } }
const HOOK = 'https://api2.cursor.sh/automations/webhook/abc123XYZ';

describe('settings store (phone-local)', () => {
  it('accepts only Grok Bot webhook URLs', () => {
    expect(validWebhookUrl(HOOK)).toBe(true);
    expect(validWebhookUrl('http://api2.cursor.sh/automations/webhook/abc123')).toBe(false);
    expect(validWebhookUrl('https://evil.example/automations/webhook/abc123')).toBe(false);
    expect(validWebhookUrl(HOOK + '?k=1')).toBe(false);
    expect(validWebhookUrl('https://api2.cursor.sh/other/abc123')).toBe(false);
    expect(validWebhookUrl('not a url')).toBe(false);
    expect(validWebhookUrl('https://api2.cursor.sh.evil.com/automations/webhook/abc123')).toBe(false);
    expect(validWebhookUrl('https://api2.cursor.sh/automations/webhook/abc123#x')).toBe(false);
  });
  it('round-trips bots and the xAI key, dropping invalid entries', async () => {
    const kv = new MemKV();
    await saveSettings(kv, { xaiKey: 'xai-key-123456', bots: [
      { id: 'a', name: '  EDITH ', url: HOOK, key: 'sender-key-1' },
      { id: 'b', name: 'Bad', url: 'https://example.com/x', key: 'sender-key-2' },
      { id: 'c', name: 'NoKey', url: HOOK, key: 'x' },
    ] });
    const s = await loadSettings(kv);
    expect(s.xaiKey).toBe('xai-key-123456');
    expect(s.bots.map(b => b.name)).toEqual(['EDITH']);
    expect(kv.m.has(SETTINGS_KEY)).toBe(true);
  });
  it('survives corrupt storage', async () => {
    const kv = new MemKV(); kv.m.set(SETTINGS_KEY, '{nope');
    expect(await loadSettings(kv)).toEqual({ bots: [], xaiKey: '' });
  });
  it('masks keys: never the whole value', () => {
    const k = 'super-secret-sender-key-9f3a';
    expect(mask(k)).toBe('saved, ends 9f3a');
    expect(mask(k)).not.toContain('super-secret');
    expect(mask('')).toBe('not set');
  });
  it('reorders', () => {
    expect(move([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(move([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});
