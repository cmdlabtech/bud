// Pure screen builders: app state -> SDK-style page spec (design layout, BUD 1.0 send-only scope).
// No SDK calls here so every screen can be unit tested against the Even limits.
import { BRIGHT, BORDER, FOOT_H, FOOT_Y, HDR_H, HOME_LIST_W, W } from './design/tokens';
import { G, levelMeter, mmss, pad, trunc } from './text';

export interface TextSpec { kind: 'text'; name: string; x: number; y: number; w: number; h: number; content: string; color?: number; border?: number; bcolor?: number; pad?: number; capture?: boolean }
export interface ListSpec { kind: 'list'; name: string; x: number; y: number; w: number; h: number; items: string[]; capture?: boolean; pad?: number }
export type ContainerSpec = TextSpec | ListSpec;
export interface MenuItem { id: number; label: string }
export interface PageSpec { key: string; containers: ContainerSpec[]; menu: MenuItem[] }

const T = (name: string, x: number, y: number, w: number, h: number, content: string, o: Partial<TextSpec> = {}): TextSpec =>
  ({ kind: 'text', name, x, y, w, h, content, color: BRIGHT.focus, pad: 4, ...o });
const foot = (s: string) => T('foot', 0, FOOT_Y, W, FOOT_H, s, { color: BRIGHT.hint });

export const MENU = {
  home: [{ id: 1, label: 'Reload bots' }],
  setup: [{ id: 81, label: 'Check again' }],
  listening: [{ id: 21, label: 'Cancel' }],
  transcript: [{ id: 31, label: 'Send' }, { id: 32, label: 'Redo' }, { id: 33, label: 'Cancel' }],
  sent: [{ id: 62, label: 'Bot list' }],
  sendError: [{ id: 71, label: 'Retry' }, { id: 72, label: 'Bot list' }],
} satisfies Record<string, MenuItem[]>;

// ---- 1 Home: the bot list --------------------------------------------------------------
export const HOME_VISIBLE_ROWS = 8; // 24 px per line measured in the simulator; 8 x 24 = 192 of 226 px

export function posText(index: number, total: number): string {
  return `${G.up}\n\n\n${index + 1}/${total}\n\n\n${G.down}`;
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

export function homePage(p: { names: string[]; selected: number; showPos: boolean }): PageSpec {
  const containers: ContainerSpec[] = [
    T('hdr', 0, 0, W, HDR_H, 'BUD', { color: BRIGHT.meta }),
    T('rows', 0, HDR_H, p.showPos ? HOME_LIST_W : W, 226, homeListText(p.names, p.selected), { capture: true, pad: 4 }),
  ];
  if (p.showPos) containers.push(T('pos', HOME_LIST_W, HDR_H, W - HOME_LIST_W, 226, posText(p.selected, p.names.length), { color: BRIGHT.hint }));
  containers.push(foot('swipe move    press talk    double exit'));
  return { key: 'home', containers, menu: MENU.home };
}

// ---- 1b Setup needed: what is still missing, finished on the phone page --------------------------
export function setupPage(p: { steps: string[]; message?: string }): PageSpec {
  const steps = p.steps.length ? p.steps : ['Add a bot on the phone page'];
  const why = steps.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return {
    key: 'setup',
    containers: [
      T('hdr', 0, 0, W, HDR_H, 'BUD   Bots Up Display', { color: BRIGHT.meta }),
      T('state', 0, 40, W, 36, `${G.idle} Open BUD on your phone to finish setup`, { capture: true }),
      T('why', 0, 80, W, 90, why, { color: BRIGHT.secondary }),
      T('saved', 0, 176, W, 58, p.message ?? 'In the Even app: BUD. Keys stay on your phone.', { color: BRIGHT.meta }),
      foot('press check again    double exit'),
    ],
    menu: MENU.setup,
  };
}

// ---- 2 Listening -------------------------------------------------------------------------
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

// ---- 3 Transcript ------------------------------------------------------------------------
export function transcriptPage(p: { botName: string; text: string | null; error?: string }): PageSpec {
  const busy = p.text === null && !p.error;
  return {
    key: 'transcript',
    containers: [
      T('hdr', 0, 0, W, HDR_H, busy ? `To ${p.botName}   transcribing` : p.error || !p.text ? `To ${p.botName}` : `To ${p.botName}   check, then send`, { color: BRIGHT.meta }),
      T('draft', 0, 36, W, 124, busy ? 'Transcribing...' : p.error ? p.error : trunc(p.text ?? '', 900) || 'Nothing heard. Long press to try again.', { border: 1, bcolor: BORDER.draft, pad: 8, capture: true }),
      T('acts', 0, 172, W, 64, busy ? ' ' : p.error || !p.text ? `${G.back} double   cancel        ${G.reply} long press   redo` : `${G.next} press   send\n${G.back} double   cancel        ${G.reply} long press   redo`, { color: BRIGHT.secondary }),
      foot(busy ? 'double cancel' : 'press send    long press redo    double cancel'),
    ],
    menu: MENU.transcript,
  };
}

// ---- 4 Sent (about 1.5 s, then back to the list) ----------------------------------------------
export function sentPage(p: { botName: string; sending: boolean }): PageSpec {
  return {
    key: 'sent',
    containers: [
      T('hdr', 0, 0, W, HDR_H, `To ${p.botName}`, { color: BRIGHT.meta }),
      T('status', 0, 96, W, 40, pad(14, p.sending ? `${G.next} Sending to ${p.botName}...` : `${G.next} Sent to ${p.botName}`), { capture: true }),
      T('note', 0, 150, W, 58, p.sending ? ' ' : pad(10, 'The reply comes as a Grok Bot notification.'), { color: BRIGHT.meta }),
      foot(p.sending ? ' ' : 'back to the list...'),
    ],
    menu: MENU.sent,
  };
}

// ---- 5 Send failed (short error + retry) ----------------------------------------------------
export function sendErrorPage(p: { botName: string; text: string; reason: string }): PageSpec {
  return {
    key: 'sendError',
    containers: [
      T('hdr', 0, 0, W, HDR_H, `To ${p.botName}`, { color: BRIGHT.meta }),
      T('state', 0, 44, W, 36, `${G.idle} Not sent to ${p.botName}`, { capture: true }),
      T('why', 0, 84, W, 58, p.reason, { color: BRIGHT.secondary }),
      T('echo', 0, 150, W, 58, trunc(`"${p.text}"`, 110), { color: BRIGHT.meta }),
      foot('press retry    double back to list'),
    ],
    menu: MENU.sendError,
  };
}

// ---- limits check (Even docs: display, contextual-menu) ---------------------------------------
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
