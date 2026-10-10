// Pure screen builders: app state -> SDK-style page spec (Riri's design).
// No SDK calls here so every screen can be unit tested against the Even limits.
import { BRIGHT, BORDER, FOOT_H, FOOT_Y, HDR_H, HOME_BOT_SLOTS, HOME_LIST_W, W } from './design/tokens';
import { G, clean, clock, levelMeter, mmss, pad, progressBar, trunc } from './text';
import type { Bot, Message, Need } from './types';

export interface TextSpec { kind: 'text'; name: string; x: number; y: number; w: number; h: number; content: string; color?: number; border?: number; bcolor?: number; pad?: number; capture?: boolean }
export interface ListSpec { kind: 'list'; name: string; x: number; y: number; w: number; h: number; items: string[]; capture?: boolean; pad?: number }
export type ContainerSpec = TextSpec | ListSpec;
export interface MenuItem { id: number; label: string }
export interface PageSpec { key: string; containers: ContainerSpec[]; menu: MenuItem[] }

const T = (name: string, x: number, y: number, w: number, h: number, content: string, o: Partial<TextSpec> = {}): TextSpec =>
  ({ kind: 'text', name, x, y, w, h, content, color: BRIGHT.focus, pad: 4, ...o });
const L = (name: string, x: number, y: number, w: number, h: number, items: string[]): ListSpec =>
  ({ kind: 'list', name, x, y, w, h, items, capture: true, pad: 4 });
const foot = (s: string) => T('foot', 0, FOOT_Y, W, FOOT_H, s, { color: BRIGHT.hint });

export const MENU = {
  home: [{ id: 1, label: 'Refresh' }, { id: 2, label: 'Talk to EDITH' }, { id: 3, label: 'Needs you' }],
  thread: [{ id: 11, label: 'Older' }, { id: 12, label: 'Mark read' }, { id: 13, label: 'Home' }],
  reader: [{ id: 15, label: 'First page' }, { id: 16, label: 'Back to thread' }],
  listening: [{ id: 21, label: 'Cancel' }],
  transcript: [{ id: 31, label: 'Send' }, { id: 32, label: 'Redo' }, { id: 33, label: 'Cancel' }],
  needsList: [{ id: 41, label: 'Refresh' }, { id: 43, label: 'Home' }],
  needItem: [{ id: 51, label: 'Next item' }, { id: 52, label: 'Open thread' }, { id: 53, label: 'Home' }],
  sent: [{ id: 61, label: 'Open thread' }, { id: 62, label: 'Home' }],
  offline: [{ id: 71, label: 'Retry' }, { id: 72, label: 'Home' }],
  pairing: [{ id: 81, label: 'Check again' }],
} satisfies Record<string, MenuItem[]>;

// ---- 1 Home ---------------------------------------------------------------
export type HomeRow = { type: 'needs' } | { type: 'bot'; id: string } | { type: 'more' } | { type: 'back' };

export function botRow(b: Bot, needTitle?: string): string {
  if (b.needs > 0) return trunc(`${G.needs} ${b.name}${needTitle ? ' - ' + needTitle : ' - needs you'}`, 64);
  if (b.unread > 0) return trunc(`${G.reply} ${b.name} - ${b.unread} new ${b.unread === 1 ? 'reply' : 'replies'}`, 64);
  return trunc(`${G.idle} ${b.name}`, 64);
}

export function homeRows(bots: Bot[], page: 0 | 1): HomeRow[] {
  if (page === 0) {
    const rows: HomeRow[] = [{ type: 'needs' }];
    const shown = bots.length > HOME_BOT_SLOTS + 1 ? bots.slice(0, HOME_BOT_SLOTS) : bots.slice(0, HOME_BOT_SLOTS + 1);
    rows.push(...shown.map(b => ({ type: 'bot' as const, id: b.id })));
    if (bots.length > shown.length) rows.push({ type: 'more' });
    return rows;
  }
  return [{ type: 'back' }, ...bots.slice(HOME_BOT_SLOTS, HOME_BOT_SLOTS + 19).map(b => ({ type: 'bot' as const, id: b.id }))];
}

// Bots that need you or have new replies float to the top (stable otherwise).
export function sortBots(bots: Bot[]): Bot[] {
  const rank = (b: Bot) => (b.needs > 0 ? 0 : b.unread > 0 ? 1 : 2);
  return bots.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map(x => x.b);
}

export function freshTag(f: Freshness, savedAt?: number, now = Date.now(), outbox = 0): string {
  const q = outbox > 0 ? `   ${outbox} queued` : '';
  if (f === 'offline') return `   offline${savedAt ? ', saved ' + clock(savedAt, now) : ''}` + q;
  if (f === 'cached') return `   saved ${savedAt ? clock(savedAt, now) : ''}`.trimEnd() + q;
  if (f === 'loading') return '   updating' + q;
  return q;
}

export function homeHeader(needCount: number, newCount: number): string {
  return `Grok Bot   ${needCount} need you   ${newCount} new`;
}

export function posText(index: number, total: number): string {
  return `${G.up}\n\n\n${index + 1}/${total}\n\n\n${G.down}`;
}

// freshness: 'live' after a good poll, 'cached' when drawn from the last saved state,
// 'loading' on first run with no cache (never a blank screen).
export type Freshness = 'live' | 'cached' | 'loading' | 'offline';

export const HOME_VISIBLE_ROWS = 8; // 24 px per line measured in the simulator; 8 x 24 = 192 of 226 px

// Home rows as display strings (Needs you, bots, More/Back).
export function homeItems(p: { bots: Bot[]; needs: Need[]; page: 0 | 1 }): { rows: HomeRow[]; items: string[] } {
  const sorted = sortBots(p.bots);
  const rows = homeRows(sorted, p.page);
  const byId = new Map(sorted.map(b => [b.id, b]));
  const firstNeed = new Map<string, string>();
  for (const n of p.needs) if (!firstNeed.has(n.bot_id)) firstNeed.set(n.bot_id, n.title);
  const items = rows.map(r => {
    if (r.type === 'needs') return `${G.needs} Needs you (${p.needs.length})`;
    if (r.type === 'more') return `▽ More bots (${sorted.length - HOME_BOT_SLOTS})`; // not ▶: the cursor is ▶
    if (r.type === 'back') return `${G.back} Back`;
    return botRow(byId.get(r.id)!, firstNeed.get(r.id));
  });
  return { rows, items };
}

// App-drawn cursor list (Even "fake buttons" pattern): native list containers do not
// report swipes, so the app owns the selection and redraws this one text container.
export function homeListText(items: string[], selected: number, visible = HOME_VISIBLE_ROWS): string {
  const sel = Math.max(0, Math.min(items.length - 1, selected));
  const first = Math.max(0, Math.min(sel - Math.floor(visible / 2), items.length - visible));
  return items.slice(first, first + visible)
    .map((it, i) => (first + i === sel ? `${G.next} ${trunc(it, 46)}` : `     ${trunc(it, 46)}`))
    .join('\n');
}

export function homePage(p: { bots: Bot[]; needs: Need[]; page: 0 | 1; selected: number; showPos: boolean; freshness?: Freshness; savedAt?: number; now?: number; outbox?: number }): PageSpec {
  const fresh = p.freshness ?? 'live';
  if (p.bots.length === 0) {
    const msg = fresh === 'loading' ? `${G.idle} Loading your bots...` : `${G.idle} No bots connected yet`;
    const why = fresh === 'loading' ? 'Getting the list from Grok Bot.' : 'Ask Shuri to turn on a Glass inbox routine for a bot. EDITH and Shuri come first.';
    return {
      key: 'home0',
      containers: [
        T('hdr', 0, 0, W, HDR_H, 'Grok Bot' + (fresh === 'offline' ? '   offline' : ''), { color: BRIGHT.meta }),
        T('state', 0, 44, W, 36, fresh === 'offline' ? `${G.idle} Offline` : msg, { capture: true }),
        T('why', 0, 84, W, 82, fresh === 'offline' ? "Can't reach Grok Bot. Press to try again." : why, { color: BRIGHT.secondary }),
        foot(fresh === 'loading' ? 'double exit' : 'press refresh    double exit'),
      ],
      menu: MENU.home,
    };
  }
  const { items } = homeItems(p);
  const newCount = p.bots.reduce((a, b) => a + (b.unread > 0 ? 1 : 0), 0);
  const containers: ContainerSpec[] = [
    T('hdr', 0, 0, W, HDR_H, (p.page === 0 ? homeHeader(p.needs.length, newCount) : 'Grok Bot   more bots') + freshTag(fresh, p.savedAt, p.now, p.outbox), { color: BRIGHT.meta }),
    T('rows', 0, HDR_H, p.showPos ? HOME_LIST_W : W, 226, homeListText(items, p.selected), { capture: true, pad: 4 }),
  ];
  if (p.showPos) containers.push(T('pos', HOME_LIST_W, HDR_H, W - HOME_LIST_W, 226, posText(p.selected, items.length), { color: BRIGHT.hint }));
  containers.push(foot('swipe move    press open    long press talk'));
  return { key: `home${p.page}`, containers, menu: MENU.home };
}

// ---- 2 Thread -------------------------------------------------------------
export function threadPage(p: { bot: Bot; messages: Message[]; total: number; offset: number; now: number }): PageSpec {
  // offset = how many newest exchanges are hidden below (0 = latest).
  const end = p.messages.length - p.offset;
  const shown = p.messages.slice(Math.max(0, end - 2), end);
  const earlier = Math.max(0, p.total - p.offset - shown.length);
  const name = p.bot.name;
  const hdr = `${G.back} ${name}${p.bot.unread > 0 ? `   ${G.reply} ${p.bot.unread} new` : ''}`;
  const c: ContainerSpec[] = [T('hdr', 0, 0, W, HDR_H, hdr, { color: BRIGHT.secondary })];
  let more = false;
  c.push(T('older', 0, HDR_H, W, 28, earlier > 0 ? `${G.up} ${earlier} earlier` : p.offset > 0 ? `${G.down} ${p.offset} newer` : ' ', { color: BRIGHT.hint }));
  const botLine = (m: Message) =>
    m.status === 'replied' ? m.reply_short ?? '' :
    m.status === 'failed' ? 'Not delivered. Try again.' :
    m.status === 'timeout' ? 'Still working. The full reply will be in Grok Bot.' :
    m.status === 'queued' ? 'Saved. Sends when you are back online.' : 'Working on it...';
  if (shown.length === 0) {
    c.push(T('bot2', 0, 60, W, 196, `No messages yet. Long press or press to talk to ${name}.`, { color: BRIGHT.secondary, border: 1, bcolor: BORDER.reply, pad: 6, capture: true }));
  } else {
    const prev = shown.length === 2 ? shown[0] : null;
    const last = shown[shown.length - 1];
    if (prev) {
      c.push(T('you1', 0, 60, W, 30, trunc(`You ${clock(prev.created_at, p.now)} - ${prev.text}`, 60), { color: BRIGHT.meta }));
      c.push(T('bot1', 0, 90, W, 30, trunc(`${name}: ${botLine(prev)}`, 60), { color: BRIGHT.secondary }));
    }
    c.push(T('you2', 0, 122, W, 30, trunc(`You ${clock(last.created_at, p.now)} - ${last.text}`, 60), { color: BRIGHT.meta }));
    const full = `${name}: ${botLine(last)}`;
    const pages = pageText(full, THREAD_BOX_CHARS);
    more = pages.length > 1 && p.offset === 0;
    c.push(T('bot2', 0, 154, W, 102, more ? pages[0] + ` ${G.down}` : trunc(full, THREAD_BOX_CHARS), { color: BRIGHT.focus, border: 1, bcolor: BORDER.reply, pad: 6, capture: true }));
  }
  c.push(foot(more ? 'press talk    swipe down read all    double back' : 'press talk    swipe older    double back'));
  return { key: 'thread', containers: c, menu: MENU.thread };
}

// ---- 2b Reader: long replies, paged (no silent truncation) -------------------
export const THREAD_BOX_CHARS = 170; // ~3 lines in the 102 px reply box (unconfirmed font metrics)
export const READER_PAGE_CHARS = 420; // 8 lines x ~55 chars in the 216 px body (Even: paginate at ~400-500 chars)

// Split on word boundaries into pages of at most `max` chars (hard-split very long words).
export function pageText(s: string, max: number): string[] {
  const words = clean(s).split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > max) { if (cur) { pages.push(cur); cur = ''; } pages.push(w.slice(0, max)); w = w.slice(max); }
    if (!w) continue;
    if (cur && cur.length + 1 + w.length > max) { pages.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur || pages.length === 0) pages.push(cur);
  return pages;
}

export function readerPage(p: { botName: string; text: string; page: number }): PageSpec {
  const pages = pageText(p.text, READER_PAGE_CHARS);
  const i = Math.min(Math.max(0, p.page), pages.length - 1);
  return {
    key: 'reader',
    containers: [
      T('hdr', 0, 0, W, HDR_H, `${G.back} ${p.botName}   reply ${i + 1} of ${pages.length}`, { color: BRIGHT.meta }),
      T('body', 0, 36, W, 216, pages[i], { capture: true, pad: 6 }),
      foot(i < pages.length - 1 ? 'swipe down next    press talk    double back' : i > 0 ? 'swipe up back a page    press talk    double back' : 'press talk    double back'),
    ],
    menu: MENU.reader,
  };
}

// ---- 3a Listening -------------------------------------------------------------
export function recText(ms: number): string { return pad(23, `${G.reply} REC   ${mmss(ms)}`); }
export function levelText(hist: number[]): string { return pad(20, levelMeter(hist)); }

export function listeningPage(p: { botName: string; elapsedMs: number; levels: number[]; holdMode: boolean }): PageSpec {
  return {
    key: 'listening',
    containers: [
      T('hdr', 0, 0, W, HDR_H, `To ${p.botName}`, { color: BRIGHT.meta }),
      T('rec', 0, 70, W, 36, recText(p.elapsedMs), { capture: true }),
      T('level', 0, 112, W, 36, levelText(p.levels), { color: BRIGHT.secondary }),
      T('hint', 0, 160, W, 32, pad(18, p.holdMode ? 'Speak now. Release to stop.' : 'Speak now. Press to stop.'), { color: BRIGHT.meta }),
      foot(p.holdMode ? 'release or press stop    double cancel' : 'press stop    double cancel'),
    ],
    menu: MENU.listening,
  };
}

// ---- 3b Transcript --------------------------------------------------------------
export function transcriptPage(p: { botName: string; text: string | null; error?: string }): PageSpec {
  const busy = p.text === null && !p.error;
  return {
    key: 'transcript',
    containers: [
      T('hdr', 0, 0, W, HDR_H, busy ? `To ${p.botName}   transcribing` : p.error || !p.text ? `To ${p.botName}` : `To ${p.botName}   check, then send`, { color: BRIGHT.meta }),
      T('draft', 0, 36, W, 124, busy ? 'Transcribing...' : p.error ? p.error : trunc(p.text ?? '', 900) || 'Nothing heard. Long press to try again.', { border: 1, bcolor: BORDER.draft, pad: 8, capture: true }),
      T('acts', 0, 172, W, 64, busy ? ' ' : p.error || !p.text ? `${G.back} double   cancel        ${G.reply} long press   redo` : `${G.next} press   send\n${G.back} double   cancel        ${G.reply} long press   redo`, { color: BRIGHT.secondary }),
      foot('swipe scroll text'),
    ],
    menu: MENU.transcript,
  };
}

// ---- Needs you list (entry from Home) ------------------------------------------------
export function needRow(n: Need): string { return trunc(`${G.needs} ${n.bot_name} - ${n.title}`, 64); }

export function needsListPage(p: { needs: Need[]; toast?: string }): PageSpec {
  const items = p.needs.length ? p.needs.slice(0, 20).map(needRow) : [`${G.idle} Nothing needs you`];
  return {
    key: 'needsList',
    containers: [
      T('hdr', 0, 0, W, HDR_H, p.toast ?? `${G.needs} Needs you (${p.needs.length})`, { color: BRIGHT.meta }),
      L('needs', 0, HDR_H, W, 226, items),
      foot('press open    double back'),
    ],
    menu: MENU.needsList,
  };
}

// ---- 4 Needs-you item ---------------------------------------------------------------
export const NEED_ACTIONS = [
  { action: 'hold', label: 'Hold', done: 'Held. It waits for you.' },
  { action: 'snooze_1h', label: 'Snooze 1h', done: 'Snoozed for 1 hour.' },
  { action: 'ask_at_desk', label: 'Ask me at desk', done: 'Asked to remind you at your desk.' },
] as const;

export function needSince(n: Need, now: number): string {
  const tail = n.kind === 'approval' ? 'Approval happens in the app.' : n.kind === 'draft' ? 'Sending needs your OK in the app.' : 'Answer in the Grok Bot app.';
  return trunc(`Waiting since ${clock(n.created_at, now)}. ${tail}`, 60);
}

export function needItemPage(p: { need: Need; index: number; total: number; now: number }): PageSpec {
  const n = p.need;
  const sep = /[.?!]$/.test(n.title.trim()) ? ' ' : '. ';
  const what = trunc(n.detail ? `${n.title.trim()}${sep}${n.detail}` : n.title, 110);
  return {
    key: 'needItem',
    containers: [
      T('hdr', 0, 0, W, HDR_H, trunc(`${G.needs} Needs you  ${p.index + 1} of ${p.total}   ${n.bot_name}`, 50), { color: BRIGHT.meta }),
      // Native list rows sit ~40 px apart (simulator), so 3 actions need 120 px.
      T('what', 0, 34, W, 64, what, { border: 1, bcolor: BORDER.reply, pad: 6 }),
      T('since', 0, 100, W, 30, needSince(n, p.now), { color: BRIGHT.meta }),
      L('acts', 0, 132, 300, 124, NEED_ACTIONS.map(a => a.label)),
      T('note', 312, 140, 264, 84, 'Approve in Grok Bot app.\nGlasses can\'t approve.', { color: BRIGHT.secondary }),
      foot('press choose    swipe move    double back'),
    ],
    menu: MENU.needItem,
  };
}

// ---- 5 Sent / waiting ---------------------------------------------------------------------
export function sentStatus(botName: string, status: string): string {
  if (status === 'failed') return `${G.idle} Not delivered to ${botName}.`;
  if (status === 'queued') return `${G.idle} Saved. Will send when online.`;
  if (status === 'sending') return `${G.next} Sending to ${botName}...`;
  if (status === 'timeout') return `${G.next} ${botName} is still working.`;
  if (status === 'replied') return `${G.next} ${botName} replied.`;
  return `${G.next} Sent. Waiting for ${botName}.`;
}

export function sentPage(p: { botName: string; text: string; status: string; frac: number }): PageSpec {
  const note = p.status === 'queued'
    ? 'The app retries every 15 seconds while open. Double press to go home.'
    : p.status === 'failed'
    ? 'Check that this bot has a Glass inbox routine turned on. Press to go back.'
    : p.status === 'timeout'
      ? 'The full reply will be in its Grok Bot chat.'
      : 'Keep the app open to see the reply. Closed apps get no alerts here.';
  return {
    key: 'sent',
    containers: [
      T('hdr', 0, 0, W, HDR_H, `To ${p.botName}`, { color: BRIGHT.meta }),
      T('status', 0, 44, W, 36, sentStatus(p.botName, p.status), { capture: true }),
      T('bar', 0, 82, W, 30, progressBar(p.frac), { color: BRIGHT.secondary }),
      T('echo', 0, 120, W, 58, trunc(`"${p.text}"`, 110), { color: BRIGHT.meta }),
      T('note', 0, 190, W, 58, note, { color: BRIGHT.hint }),
      foot('press thread    long press talk    double home'),
    ],
    menu: MENU.sent,
  };
}

// ---- 6 Error / offline ----------------------------------------------------------------------
export function offlinePage(p: { reason: 'offline' | 'error'; hasOutbox: boolean; attempt: number; maxAttempts: number; now: number; isRoot: boolean }): PageSpec {
  return {
    key: 'offline',
    containers: [
      T('hdr', 0, 0, W, HDR_H, 'Grok Bot', { color: BRIGHT.meta }),
      T('state', 0, 44, W, 36, p.reason === 'offline' ? `${G.idle} Offline` : `${G.idle} Something went wrong`, { capture: true }),
      T('why', 0, 84, W, 58, p.reason === 'offline' ? "Can't reach Grok Bot from your phone. Check the phone's signal." : 'The relay had a problem. Try again in a moment.', { color: BRIGHT.secondary }),
      T('saved', 0, 150, W, 58, p.hasOutbox ? "Your last message is saved. It sends when you're back online and the app is open." : ' ', { color: BRIGHT.meta }),
      T('retry', 0, 214, W, 30, `Retry ${p.attempt} of ${p.maxAttempts}   ${clock(p.now, p.now)}`, { color: BRIGHT.hint }),
      foot(p.isRoot ? 'press retry    double exit' : 'press retry    double home'),
    ],
    menu: MENU.offline,
  };
}

// ---- 7 Pairing (not in Riri's sheet; same visual language) ---------------------------------------
export function pairingPage(p: { message?: string }): PageSpec {
  return {
    key: 'pairing',
    containers: [
      T('hdr', 0, 0, W, HDR_H, 'Grok Bot Glass', { color: BRIGHT.meta }),
      T('state', 0, 44, W, 36, `${G.idle} Not paired`, { capture: true }),
      T('why', 0, 84, W, 82, 'On your phone, open Grok Bot Glass in the Even app and enter the 8-digit code from Shuri.', { color: BRIGHT.secondary }),
      T('saved', 0, 176, W, 58, p.message ?? 'The code works once and expires in 10 minutes.', { color: BRIGHT.meta }),
      foot('press check again    double exit'),
    ],
    menu: MENU.pairing,
  };
}

// ---- limits check (Even docs: display, contextual-menu) -----------------------------------------
export function validatePage(p: PageSpec): string[] {
  const errs: string[] = [];
  const tl = p.containers.length;
  if (tl > 8) errs.push(`${p.key}: ${tl} text/list containers > 8`);
  const caps = p.containers.filter(c => c.capture).length;
  if (caps !== 1) errs.push(`${p.key}: ${caps} event-capture containers (need exactly 1)`);
  const names = new Set<string>();
  for (const c of p.containers) {
    if (c.name.length > 16) errs.push(`${p.key}.${c.name}: name > 16 chars`);
    if (names.has(c.name)) errs.push(`${p.key}.${c.name}: duplicate name`);
    names.add(c.name);
    if (c.x < 0 || c.y < 0 || c.x + c.w > 576 || c.y + c.h > 288) errs.push(`${p.key}.${c.name}: off canvas`);
    if (c.kind === 'text') {
      if (c.content.length > 1000) errs.push(`${p.key}.${c.name}: text > 1000 chars`);
      if (c.color !== undefined && (c.color < 1 || c.color > 4)) errs.push(`${p.key}.${c.name}: textColor ${c.color}`);
      if (/[\u2014\u2013]/.test(c.content)) errs.push(`${p.key}.${c.name}: em/en dash`);
    } else {
      if (c.items.length < 1 || c.items.length > 20) errs.push(`${p.key}.${c.name}: ${c.items.length} list items`);
      for (const it of c.items) if (it.length > 64) errs.push(`${p.key}.${c.name}: item > 64 chars`);
    }
  }
  if (p.menu.length > 10) errs.push(`${p.key}: menu > 10 items`);
  const ids = new Set<number>();
  for (const m of p.menu) {
    if (new TextEncoder().encode(m.label).length > 32) errs.push(`${p.key}: menu label > 32 bytes`);
    if (m.id <= 0 || ids.has(m.id)) errs.push(`${p.key}: bad menu id ${m.id}`);
    ids.add(m.id);
  }
  return errs;
}
