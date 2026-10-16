import { describe, expect, it } from 'vitest';
import { detectSetup, remainingSteps, setupProgress } from '../src/setup';

const URL = 'https://api2.cursor.sh/automations/webhook/abcDEF123_-x';
const KEY = 'sk_live_Q2hlY2tUaGlzS2V5MTIzNDU2';
const CODE = 'BUD1.eyJ2IjoxLCJib3RzIjpbIlJlc2VhcmNoIGJvdCIsIkluYm94IGJvdCIsIkNhbGVuZGFyIGJvdCJdfQ.05f001';
const XAI = 'xai-AbCdEfGhIjKlMnOpQrStUvWx12';

describe('paste setup: detect each item by its pattern', () => {
  it('one paste with everything, any order, with labels around it', () => {
    const d = detectSetup(`Paste this in BUD:\n${CODE}\nWebhook URL: ${URL}\nSender key: ${KEY}`);
    expect(d).toMatchObject({ url: URL, key: KEY, code: CODE });
    expect(detectSetup(`${KEY} ${CODE} ${URL}`)).toMatchObject({ url: URL, key: KEY, code: CODE });
  });
  it('successive single pastes', () => {
    expect(detectSetup(URL)).toEqual({ url: URL, ignored: 0 });
    expect(detectSetup(`  ${KEY}\n`)).toEqual({ key: KEY, ignored: 0 });
    expect(detectSetup(CODE)).toEqual({ code: CODE, ignored: 0 });
    expect(detectSetup(XAI)).toEqual({ xaiKey: XAI, ignored: 0 });
    expect(detectSetup('shortkey1')).toEqual({ key: 'shortkey1', ignored: 0 }); // a lone 8+ char token is a key
  });
  it('a code wrapped across lines by a chat app still reads', () => {
    expect(detectSetup(`${CODE.slice(0, 40)}\n${CODE.slice(40)}`).code).toBe(CODE);
  });
  it('never takes a URL or the code as the sender key, and ignores other links', () => {
    const d = detectSetup(`https://example.com/x ${CODE} ${URL}`);
    expect(d.key).toBeUndefined();
    expect(d.ignored).toBe(1);
    expect(detectSetup('Paste this in BUD on your phone').key).toBeUndefined();
  });
});

describe('paste setup: the routine header field', () => {
  it('takes the key out of "Authorization: Bearer <key>"', () => {
    expect(detectSetup(`Authorization: Bearer ${KEY}`)).toEqual({ key: KEY, ignored: 0 });
    expect(detectSetup(`${URL}\nAuthorization: Bearer ${KEY}`)).toMatchObject({ url: URL, key: KEY, ignored: 0 });
  });
});

describe('first-run progress', () => {
  it('speech key, then hub, then done', () => {
    expect(setupProgress({ xaiKey: false, hub: false })).toMatchObject({ step: 1, label: 'Setup 1/2: Speech key' });
    expect(setupProgress({ xaiKey: true, hub: false })).toMatchObject({ step: 2, label: 'Setup 2/2: Connect your hub bot' });
    expect(setupProgress({ xaiKey: true, hub: true }).done).toBe(true);
    expect(remainingSteps({ xaiKey: false, hub: false, bots: 0 })).toHaveLength(2);
    expect(remainingSteps({ xaiKey: true, hub: false, bots: 1 })).toEqual([]); // direct bots count as connected
  });
});
