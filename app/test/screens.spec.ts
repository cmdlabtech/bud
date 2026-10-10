import { describe, expect, it } from 'vitest';
import { HOME_VISIBLE_ROWS, homeListText, homePage, listeningPage, sendErrorPage, sentPage, setupPage, transcriptPage, validatePage } from '../src/screens';

const names = Array.from({ length: 30 }, (_, i) => `Bot ${i + 1}`);

describe('screens fit the Even limits', () => {
  const pages = [
    homePage({ names: ['Research bot', 'Inbox bot'], selected: 0, showPos: true }),
    homePage({ names, selected: 29, showPos: false }),
    setupPage({ steps: ['Add your xAI key (speech to text)', 'Connect your hub bot (paste setup)'] }), setupPage({ steps: ['Add your xAI key (speech to text)'], message: 'x' }), setupPage({ steps: [] }),
    listeningPage({ botName: 'Research bot', elapsedMs: 4200, levels: [100, 3000], holdMode: true }),
    transcriptPage({ botName: 'Research bot', text: null }), transcriptPage({ botName: 'Research bot', text: 'x'.repeat(2000) }), transcriptPage({ botName: 'Research bot', text: '', error: 'err' }),
    sentPage({ botName: 'Research bot', sending: true }), sentPage({ botName: 'Research bot', sending: false }),
    sendErrorPage({ botName: 'Research bot', text: 'y'.repeat(500), reason: 'Grok Bot had a problem.' }),
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
    expect(homePage({ names: ['Research bot'], selected: 0, showPos: true }).containers[0]).toMatchObject({ content: 'BUD' });
    expect(JSON.stringify(setupPage({ steps: ['x'] }))).toContain('BUD   Bots Up Display');
  });
  it('no relay-era features on any screen', () => {
    const all = JSON.stringify([homePage({ names: ['Research bot'], selected: 0, showPos: true }), sentPage({ botName: 'Research bot', sending: false })]);
    expect(all).not.toMatch(/Needs you|new repl|relay|Waiting for|pair/i);
  });
  it('Sent page says Sent to <bot>', () => {
    expect(JSON.stringify(sentPage({ botName: 'Inbox bot', sending: false }))).toContain('Sent to Inbox bot');
  });
});
