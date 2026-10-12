// Text helpers for the G2 firmware font (proportional, no emoji).
// Glyphs used by the design come from Even's "useful characters" table.
export const G = {
  needs: '■', reply: '●', idle: '○', next: '▶', back: '◀', up: '△', down: '▼',
  barOn: '━', barOff: '─', levels: '▁▂▃▄▅▆▇',
} as const;

export function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function trunc(s: string, max: number): string {
  const c = clean(s);
  return c.length <= max ? c : c.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
}

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function clock(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function progressBar(frac: number, width = 34): string {
  const on = Math.round(Math.min(1, Math.max(0, frac)) * width);
  return G.barOn.repeat(on) + G.barOff.repeat(width - on);
}

export function levelMeter(rmsHistory: number[], width = 14): string {
  const vals = rmsHistory.slice(-width);
  while (vals.length < width) vals.unshift(0);
  return vals.map(v => G.levels[Math.min(G.levels.length - 1, Math.floor((Math.min(v, 6000) / 6000) * G.levels.length))]).join('');
}

// "Centering" on G2 means padding with spaces (proportional font, approximate).
export function pad(n: number, s: string): string {
  return ' '.repeat(n) + s;
}
