import { describe, expect, it } from 'vitest';
import { HOME_VISIBLE_ROWS, homeListText, homePage, listeningPage, sendErrorPage, sentPage, setupPage, transcriptPage, validatePage } from '../src/screens';

const names = Array.from({ length: 30 }, (_, i) => `Bot ${i + 1}`);

describe('screens fit the Even limits', () => {
  const pages = [
    homePage({ names: ['EDITH', 'Shuri'], selected: 0, showPos: true }),
    homePage({ names, selected: 29, showPos: false }),
    setupPage({ reason: 'nobots' }), setupPage({ reason: 'nokey', message: 'x' }),
    listeningPage({ botName: 'EDITH', elapsedMs: 4200, levels: [100, 3000], holdMode: true }),
    transcriptPage({ botName: 'EDITH', text: null }), transcriptPage({ botName: 'EDITH', text: 'x'.repeat(2000) }), transcriptPage({ botName: 'EDITH', text: '', error: 'err' }),
    sentPage({ botName: 'EDITH', sending: true }), sentPage({ botName: 'EDITH', sending: false }),
    sendErrorPage({ botName: 'EDITH', text: 'y'.repeat(500), reason: 'Grok Bot had a problem.' }),
  ];
  for (const p of pages) it(`${p.key} is valid`, () => expect(validatePage(p)).toEqual([]));
});

describe('home list', () => {
  it('windows long lists around the cursor', () => {
    const t = homeListText(names, 20).split('\n');
    expect(t).toHaveLength(HOME_VISIBLE_ROWS);
    expect(t.find(l => l.startsWith('▶'))).toBe('▶ Bot 21');
  });
  it('BUD branding: short header, name plus tagline on setup', () => {
    expect(homePage({ names: ['EDITH'], selected: 0, showPos: true }).containers[0]).toMatchObject({ content: 'BUD' });
    expect(JSON.stringify(setupPage({ reason: 'nobots' }))).toContain('BUD   Bots Up Display');
  });
  it('no relay-era features on any screen', () => {
    const all = JSON.stringify([homePage({ names: ['EDITH'], selected: 0, showPos: true }), sentPage({ botName: 'EDITH', sending: false })]);
    expect(all).not.toMatch(/Needs you|new repl|relay|Waiting for|pair/i);
  });
  it('Sent page says Sent to <bot>', () => {
    expect(JSON.stringify(sentPage({ botName: 'Shuri', sending: false }))).toContain('Sent to Shuri');
  });
});
