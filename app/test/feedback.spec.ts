import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DONATE_URL, HUB_BOT_URL, XAI_KEYS_URL } from '../src/config';
import { buildPayload, fallbackUrl, isFatalVerifyCode, isVerifyMessage, looksSecret, verifyFrameUrl, verifyOrigin, MSG_MAX, TITLE_MAX } from '../src/feedback';

const BASE = 'https://bud-feedback.admin2655.workers.dev';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

describe('verify frame helpers (mirrors Wondereye)', () => {
  it('frame URL is on bud-feedback with the loopback parent', () => {
    expect(verifyOrigin(BASE + '/')).toBe(BASE);
    expect(verifyFrameUrl('http://127.0.0.1:5173', 'en', BASE)).toBe(`${BASE}/verify-frame?parent=http%3A%2F%2F127.0.0.1%3A5173&lang=en`);
    expect(fallbackUrl('1.0.0', BASE)).toBe(`${BASE}/feedback?v=1.0.0`);
    expect(verifyOrigin('')).toBe('');
  });
  it('accepts only bud-verify messages from the frame window on the frame origin', () => {
    const frame = {} as Window;
    const ok = { origin: BASE, source: frame, data: { source: 'bud-verify', event: 'token', token: 't' } };
    expect(isVerifyMessage(ok as any, frame, BASE)).toBe(true);
    expect(isVerifyMessage({ ...ok, origin: 'https://wondereye.app' } as any, frame, BASE)).toBe(false);
    expect(isVerifyMessage({ ...ok, source: {} } as any, frame, BASE)).toBe(false);
    expect(isVerifyMessage({ ...ok, data: { source: 'wondereye-verify' } } as any, frame, BASE)).toBe(false);
    expect(isVerifyMessage(ok as any, null, BASE)).toBe(false);
  });
  it('fatal codes show the browser fallback, retryable ones do not', () => {
    for (const c of ['load', 'timeout', 'config', '110200', '110510', '200500', '400020']) expect(isFatalVerifyCode(c)).toBe(true);
    for (const c of ['300030', '600010', undefined]) expect(isFatalVerifyCode(c)).toBe(false);
  });
});

describe('feedback never carries keys, webhook URLs or task text', () => {
  it('flags webhook URLs, key shapes and any string saved on the phone', () => {
    expect(looksSecret('see api2.cursor.sh/automations/webhook/abc')).toBe(true);
    expect(looksSecret('key xai-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).toBe(true);
    expect(looksSecret('Bearer abcdefghijklmnopqrstuvwxyz0123')).toBe(true);
    expect(looksSecret('my sender key is s3cret-sender-123 ok', ['s3cret-sender-123'])).toBe(true);
    expect(looksSecret('The list skips a name when I swipe fast.', ['s3cret-sender-123', ''])).toBe(false);
  });
  it('payload has exactly the Wondereye fields, nothing about bots', () => {
    const p = buildPayload({ category: 'idea', message: '  Add haptics please  ', title: ' ', version: '1.0.0', website: '', elapsedMs: 5000, token: 'tok' });
    expect(Object.keys(p).sort()).toEqual(['appVersion', 'category', 'elapsedMs', 'message', 'page', 'source', 'title', 'turnstileToken', 'website']);
    expect(p).toMatchObject({ category: 'idea', message: 'Add haptics please', title: undefined, source: 'app', page: '/app', appVersion: '1.0.0' });
  });
});

describe('phone page', () => {
  it('has the Wondereye form fields, caps and wording', () => {
    expect(html).toContain('id="feedback-toggle"');
    for (const c of ['bug', 'idea', 'other']) expect(html).toContain(`data-category="${c}"`);
    expect(html).toContain(`maxlength="${TITLE_MAX}" placeholder="Title (optional)"`);
    expect(html).toContain(`maxlength="${MSG_MAX}" placeholder="What happened, or what would you like to see?"`);
    expect(html).toContain('name="website"');
    expect(html).toContain('0 / 2000');
    expect(html).toMatch(/id="feedback-submit" disabled/);
  });
  it('says feedback is the one thing BUD keeps and asks to leave out keys, webhook URLs and tasks', () => {
    expect(html).toContain('Feedback is the one thing BUD keeps');
    expect(html).toContain('public GitHub issue');
    expect(html).toContain("Don't include personal info");
  });
  it('has the PayPal Donate pill opened like Wondereye (data-external, new window)', () => {
    expect(DONATE_URL).toBe('https://www.paypal.com/donate/?hosted_button_id=Z5SDZULELYGNS');
    expect(html).toMatch(/class="donate-btn"[^>]*href="https:\/\/www\.paypal\.com\/donate\/\?hosted_button_id=Z5SDZULELYGNS" target="_blank" rel="noopener noreferrer" data-external/);
  });
  it('has the "Get an xAI API key" link (xAI console API Keys page) opened like Donate, with the stays-on-phone hint', () => {
    expect(XAI_KEYS_URL).toBe('https://console.x.ai/team/default/api-keys');
    expect(html).toMatch(/href="https:\/\/console\.x\.ai\/team\/default\/api-keys" target="_blank" rel="noopener noreferrer" data-external>Get an xAI API key<\/a>/);
    expect(html).toContain('it stays on this phone.');
  });
  it('has the "Get the BUD hub bot" https template as a normal target=_blank link', () => {
    expect(HUB_BOT_URL).toBe('https://x.ai/bot/915uZ58K2YkQhevdmxt74');
    expect(html).not.toMatch(/href=["']grokbot:/);
    expect(html).toContain('>https://x.ai/bot/915uZ58K2YkQhevdmxt74</a>');
    expect(html).toMatch(/id="hubBotLink" href="https:\/\/x\.ai\/bot\/915uZ58K2YkQhevdmxt74" target="_blank" rel="noopener noreferrer">Get the BUD hub bot<\/a>/);
    expect(html).not.toMatch(/id="hubBotLink"[^>]*data-external/);
    expect(html).toContain('id="copyHubLink"');
  });
  it('whitelist covers every origin, and zero-retention copy stays scoped to the forwarder', () => {
    const wl = manifest.permissions.find((p: any) => p.name === 'network').whitelist;
    const net = manifest.permissions.find((p: any) => p.name === 'network');
    expect(wl).toEqual(['https://api.x.ai', 'https://bud-forward.admin2655.workers.dev', 'https://bud-feedback.admin2655.workers.dev', 'https://challenges.cloudflare.com', 'https://www.paypal.com', 'https://console.x.ai', 'https://x.ai']);
    expect(manifest.version).toBe('1.0.5');
    expect(manifest.description).toContain("Zero retention: BUD's forwarder passes your request straight to your bot and stores or logs nothing.");
    expect(manifest.description).toContain('The only thing BUD keeps is feedback');
    expect(manifest.description).toContain('public GitHub issue');
    expect(manifest.description).not.toContain('private GitHub issue');
    expect(net.desc).toContain('public GitHub issue');
    expect(net.desc).not.toContain('private GitHub issue');
    expect(net.desc.length).toBeGreaterThan(0);
    expect(net.desc.length).toBeLessThanOrEqual(300);
  });
});
