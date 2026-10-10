import { describe, expect, it } from 'vitest';
import { validateEvenHubPageContainer, formatEvenHubPageContainerValidationError } from '@evenrealities/even_hub_sdk';
import {
  homePage, homeRows, homeItems, homeListText, HOME_VISIBLE_ROWS, needItemPage, needsListPage, offlinePage, pairingPage, readerPage, sentPage, threadPage,
  transcriptPage, listeningPage, validatePage, pageText, botRow, type PageSpec, READER_PAGE_CHARS,
} from '../src/screens';
import { toSdk } from '../src/render';
import type { Bot, Message, Need } from '../src/types';

const now = Date.UTC(2026, 9, 10, 14, 0);
const mkBots = (n: number): Bot[] => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `BOT${i}`, label: '', needs: i === 3 ? 1 : 0, unread: i === 5 ? 2 : i === 6 ? 1 : 0 }));
const long = 'The deploy finished and all checks passed. '.repeat(40);
const msg = (i: number, extra: Partial<Message> = {}): Message => ({ id: `m${i}`, bot_id: 'edith', text: `Question number ${i} about the build`, status: 'replied', reply_short: `Answer ${i}`, created_at: now - 60000 * (10 - i), replied_at: now, ...extra });
const need = (i: number, extra: Partial<Need> = {}): Need => ({ id: `n${i}`, bot_id: 'shuri', bot_name: 'Shuri', kind: 'approval', title: `Approve sending invoice ${i}`, detail: 'To Acme, $1,200, due Friday', created_at: now - 3600_000, action: null, ...extra });

function allPages(): PageSpec[] {
  const bot = mkBots(1)[0];
  return [
    homePage({ bots: mkBots(3), needs: [need(1)], page: 0, selected: 0, showPos: true }),
    homePage({ bots: mkBots(16), needs: [], page: 0, selected: 4, showPos: true, freshness: 'cached', savedAt: now, now, outbox: 2 }),
    homePage({ bots: mkBots(40), needs: [need(1)], page: 0, selected: 19, showPos: true }),
    homePage({ bots: mkBots(40), needs: [], page: 1, selected: 0, showPos: false }),
    homePage({ bots: [], needs: [], page: 0, selected: 0, showPos: true, freshness: 'loading' }),
    homePage({ bots: [], needs: [], page: 0, selected: 0, showPos: true, freshness: 'live' }),
    threadPage({ bot, messages: [], total: 0, offset: 0, now }),
    threadPage({ bot, messages: [msg(1)], total: 1, offset: 0, now }),
    threadPage({ bot, messages: [msg(1), msg(2), msg(3, { reply_short: long })], total: 9, offset: 0, now }),
    threadPage({ bot, messages: [msg(1), msg(2), msg(3, { status: 'queued', reply_short: null })], total: 3, offset: 1, now }),
    readerPage({ botName: 'EDITH', text: long, page: 0 }),
    readerPage({ botName: 'EDITH', text: long, page: 99 }),
    listeningPage({ botName: 'EDITH', elapsedMs: 4200, levels: [100, 3000, 6000], holdMode: true }),
    listeningPage({ botName: 'EDITH', elapsedMs: 0, levels: [], holdMode: false }),
    transcriptPage({ botName: 'EDITH', text: null }),
    transcriptPage({ botName: 'EDITH', text: long }),
    transcriptPage({ botName: 'EDITH', text: '' }),
    transcriptPage({ botName: 'EDITH', text: null, error: 'Offline.' }),
    needsListPage({ needs: [] }),
    needsListPage({ needs: Array.from({ length: 30 }, (_, i) => need(i, { title: long.slice(0, 60) })) }),
    needItemPage({ need: need(1, { detail: long.slice(0, 400) }), index: 0, total: 3, now }),
    ...['sending', 'pending', 'queued', 'failed', 'timeout', 'replied'].map(status => sentPage({ botName: 'EDITH', text: long.slice(0, 1000), status, frac: 0.5 })),
    offlinePage({ reason: 'offline', hasOutbox: true, attempt: 2, maxAttempts: 3, now, isRoot: true }),
    offlinePage({ reason: 'error', hasOutbox: false, attempt: 1, maxAttempts: 3, now, isRoot: false }),
    pairingPage({}),
  ];
}

describe('screens', () => {
  it('every screen passes the Even display limits (our checker)', () => {
    for (const p of allPages()) expect(validatePage(p), p.key).toEqual([]);
  });
  it('every screen passes the SDK validator', () => {
    for (const p of allPages()) {
      const r = validateEvenHubPageContainer(toSdk(p) as any);
      expect(r.valid, r.valid ? '' : `${p.key}: ${formatEvenHubPageContainerValidationError(r as any)}`).toBe(true);
    }
  });
  it('home: Needs you + 18 bots + More bots (N), page 2 starts with Back', () => {
    const r0 = homeRows(mkBots(40), 0);
    expect(r0.length).toBe(20);
    expect(r0[0]).toEqual({ type: 'needs' });
    expect(r0[19]).toEqual({ type: 'more' });
    expect(homeItems({ bots: mkBots(40), needs: [], page: 0 }).items[19]).toBe('▽ More bots (22)');
    const r1 = homeRows(mkBots(40), 1);
    expect(r1[0]).toEqual({ type: 'back' });
    expect(r1.length).toBe(20);
    // 19 bots fit without a More row
    expect(homeRows(mkBots(19), 0).some(r => r.type === 'more')).toBe(false);
  });
  it('home: bots needing you then unread float to the top, with unread counts', () => {
    const list = homeItems({ bots: mkBots(8), needs: [], page: 0 });
    expect(list.items[1]).toMatch(/^■ BOT3/);
    expect(list.items[2]).toBe('● BOT5 - 2 new replies');
    expect(list.items[3]).toBe('● BOT6 - 1 new reply');
    expect(botRow({ id: 'x', name: 'X', label: '', needs: 0, unread: 0 })).toBe('○ X');
  });
  it('home cursor list keeps the selection visible and marks it', () => {
    const items = Array.from({ length: 20 }, (_, i) => `row ${i}`);
    expect(homeListText(items, 0).split('\n')[0]).toBe('▶ row 0');
    const mid = homeListText(items, 10).split('\n');
    expect(mid).toHaveLength(HOME_VISIBLE_ROWS); expect(mid.find(l => l.startsWith('▶'))).toBe('▶ row 10');
    const end = homeListText(items, 19).split('\n');
    expect(end.at(-1)).toBe('▶ row 19');
    expect(homeListText(['a', 'b'], 1)).toBe('     a\n▶ b');
  });
  it('home: never blank; loading and empty states and cached/offline tag', () => {
    const loading = homePage({ bots: [], needs: [], page: 0, selected: 0, showPos: true, freshness: 'loading' });
    expect(JSON.stringify(loading)).toContain('Loading your bots');
    const empty = homePage({ bots: [], needs: [], page: 0, selected: 0, showPos: true, freshness: 'live' });
    expect(JSON.stringify(empty)).toContain('No bots connected yet');
    const off = homePage({ bots: mkBots(2), needs: [], page: 0, selected: 0, showPos: true, freshness: 'offline', savedAt: now, now, outbox: 1 });
    const hdr = off.containers[0]; expect(hdr.kind === 'text' && hdr.content).toMatch(/offline, saved .*1 queued/);
  });
  it('long replies are paged on word boundaries, never silently cut', () => {
    const pages = pageText(long, READER_PAGE_CHARS);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.every(p => p.length <= READER_PAGE_CHARS)).toBe(true);
    expect(pages.join(' ')).toBe(long.trim());
    expect(pageText('x'.repeat(700), 330).map(p => p.length)).toEqual([330, 330, 40]);
    const t = threadPage({ bot: mkBots(1)[0], messages: [msg(1, { reply_short: long })], total: 1, offset: 0, now });
    expect(JSON.stringify(t)).toContain('swipe down read all');
    const r = readerPage({ botName: 'EDITH', text: long, page: 1 });
    expect(r.containers[0].kind === 'text' && r.containers[0].content).toMatch(/reply 2 of \d+/);
  });
  it('needs item says approvals happen in the Grok Bot app', () => {
    expect(JSON.stringify(needItemPage({ need: need(1), index: 0, total: 1, now }))).toContain('Approve in Grok Bot app.');
  });
  it('offline at root says double exit, elsewhere double home', () => {
    expect(JSON.stringify(offlinePage({ reason: 'offline', hasOutbox: false, attempt: 1, maxAttempts: 3, now, isRoot: true }))).toContain('double exit');
    expect(JSON.stringify(offlinePage({ reason: 'offline', hasOutbox: false, attempt: 1, maxAttempts: 3, now, isRoot: false }))).toContain('double home');
  });
});
