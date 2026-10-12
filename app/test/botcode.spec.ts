import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { MAX_HUB_BOTS, looksUrlOrKey, makeBotCode, parseBotCode } from '../src/botcode';

const NAMES = ['Research bot', 'Inbox bot', 'Calendar bot'];
// Same recipe the hub routine uses (python in docs/hub-inbox.md), done independently here.
function pyStyle(obj: unknown): string {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `BUD1.${p}.${createHash('sha256').update(p).digest('hex').slice(0, 6)}`;
}

describe('bot list code', () => {
  it('round-trips names and matches the documented recipe', async () => {
    const code = await makeBotCode(NAMES);
    expect(code).toBe(pyStyle({ v: 1, bots: NAMES }));
    expect(code).toMatch(/^BUD1\.[A-Za-z0-9_-]+\.[0-9a-f]{6}$/);
    expect(await parseBotCode(code)).toEqual({ ok: true, names: NAMES });
    expect(await parseBotCode(`  ${code.slice(0, 20)}\n${code.slice(20)}  `)).toEqual({ ok: true, names: NAMES }); // line breaks from chat copy
  });
  it('accepts unicode names and collapses spaces', async () => {
    expect(await parseBotCode(pyStyle({ v: 1, bots: ['Café  bot', 'Agenda 日本'] }))).toEqual({ ok: true, names: ['Café bot', 'Agenda 日本'] });
  });
  it('catches typos and truncation with the checksum', async () => {
    const code = await makeBotCode(NAMES);
    const typo = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    expect((await parseBotCode(typo)).ok).toBe(false);
    const cut = await parseBotCode(code.slice(0, -3));
    expect(cut).toMatchObject({ ok: false });
    expect((await parseBotCode(code.slice(0, 30))).ok).toBe(false);
  });
  it('gives clear errors for wrong input', async () => {
    expect(await parseBotCode('')).toMatchObject({ ok: false, error: expect.stringMatching(/Paste/) });
    expect(await parseBotCode('hello there')).toMatchObject({ ok: false, error: expect.stringMatching(/start with BUD1/) });
    expect(await parseBotCode(pyStyle({ v: 2, bots: NAMES }))).toMatchObject({ ok: false, error: expect.stringMatching(/different BUD version/) });
    expect(await parseBotCode(pyStyle({ v: 1, bots: [] }))).toMatchObject({ ok: false, error: expect.stringMatching(/no bot names/) });
    expect(await parseBotCode(pyStyle({ v: 1, bots: ['A bot', 'a  BOT'] }))).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) });
    expect(await parseBotCode(pyStyle([1, 2]))).toMatchObject({ ok: false });
  });
  it(`enforces at most ${MAX_HUB_BOTS} names, 24 chars each, printable text`, async () => {
    const many = Array.from({ length: MAX_HUB_BOTS }, (_, i) => `Bot ${i + 1}`);
    expect((await parseBotCode(pyStyle({ v: 1, bots: many }))).ok).toBe(true);
    expect(await parseBotCode(pyStyle({ v: 1, bots: [...many, 'One more'] }))).toMatchObject({ ok: false, error: expect.stringMatching(/up to 18/) });
    expect('A very long bot name xyz'.length).toBe(24);
    expect((await parseBotCode(pyStyle({ v: 1, bots: ['A very long bot name xyz'] }))).ok).toBe(true);
    expect((await parseBotCode(pyStyle({ v: 1, bots: ['A very long bot name xyzw'] }))).ok).toBe(false);
    expect((await parseBotCode(pyStyle({ v: 1, bots: ['bad\u0007bell'] }))).ok).toBe(false);
    expect((await parseBotCode(pyStyle({ v: 1, bots: ['two\nlines'] }))).ok).toBe(true); // whitespace collapses to one line
    expect((await parseBotCode(pyStyle({ v: 1, bots: [7] }))).ok).toBe(false);
  });
  it('rejects anything URL- or key-like, and any extra field', async () => {
    for (const bad of ['https://evil.example', 'api2.cursor.sh', 'xai-abc', 'abcdefghijklmnop1234', 'Bearer x', 'www.site', 'github_pat_x', '<b>bot</b>']) {
      expect(looksUrlOrKey(bad), bad).toBe(true);
      expect((await parseBotCode(pyStyle({ v: 1, bots: ['Research bot', bad] }))).ok, bad).toBe(false);
    }
    expect(await parseBotCode(pyStyle({ v: 1, bots: NAMES, url: 'x' }))).toMatchObject({ ok: false, error: expect.stringMatching(/extra data/) });
    expect(await parseBotCode(pyStyle({ v: 1, bots: NAMES, key: 'k' }))).toMatchObject({ ok: false });
    expect((await parseBotCode(pyStyle({ v: 1, bots: ['Research bot'], x: 'https://a.b/automations/webhook/abc' }))).ok).toBe(false);
    for (const ok of NAMES.concat(['Bot 2.0', 'R&D bot', "Mom's helper"])) expect(looksUrlOrKey(ok), ok).toBe(false);
  });
});

describe('documented example', () => {
  it('docs/hub-inbox.md example code parses to the generic names', async () => {
    expect(await parseBotCode('BUD1.eyJ2IjoxLCJib3RzIjpbIlJlc2VhcmNoIGJvdCIsIkluYm94IGJvdCIsIkNhbGVuZGFyIGJvdCJdfQ.05f001')).toEqual({ ok: true, names: ['Research bot', 'Inbox bot', 'Calendar bot'] });
  });
});
