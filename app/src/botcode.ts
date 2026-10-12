// Bot list code (hub mode). The user's hub bot replies with a short code holding ONLY display
// names; the user pastes it on the BUD phone page and the names become glasses list entries that
// all send through the hub's webhook with a `target` name.
//
//   BUD1.<payload>.<check>
//   payload = base64url(JSON {"v":1,"bots":["Research bot","Inbox bot"]})   (UTF-8, no padding)
//   check   = first 6 hex chars of SHA-256(payload)                         (catches typos/truncation)
//
// A bot can make one with:  python3 -c 'import json,base64,hashlib,sys; p=base64.urlsafe_b64encode(
//   json.dumps({"v":1,"bots":sys.argv[1:]},separators=(",",":")).encode()).decode().rstrip("=");
//   print("BUD1."+p+"."+hashlib.sha256(p.encode()).hexdigest()[:6])' "Research bot" "Inbox bot"
//
// Never holds keys or URLs: anything URL- or key-like is rejected, and only "v" and "bots" are allowed.

export const CODE_PREFIX = 'BUD1.';
export const MAX_HUB_BOTS = 18;      // keeps Home at <= 20 items with the More/direct rows
export const MAX_NAME_CHARS = 24;
export const MAX_CODE_CHARS = 2000;

export type CodeResult = { ok: true; names: string[] } | { ok: false; error: string };

const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const PRINTABLE_RE = /^[^\p{C}]+$/u;              // no control/format/unassigned characters
// URL- or key-like content. Names are short words; anything like these is refused.
const SUSPICIOUS: RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//i,                       // any scheme://
  /\bwww\./i,
  /\b[a-z0-9-]+\.(com|net|org|io|ai|sh|dev|app|co|me|xyz)\b/i, // bare domains
  /\/automations\//i,
  /\bxai-/i,
  /\b(sk|pk|ghp|gho|ghs|github_pat)_/i,
  /\bbearer\b/i,
  /[A-Za-z0-9_\-]{16,}/,                           // long token-like run (no spaces)
  /[<>{}\\`]/,                                     // markup/code characters
];

export function looksUrlOrKey(s: string): boolean { return SUSPICIOUS.some(re => re.test(s)); }

async function sha6(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 3).map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  } catch { return null; }
}

/** Validates one display name; returns the cleaned name or an error. */
export function checkName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'A name in the code is not text.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'The code has an empty name.' };
  if ([...name].length > MAX_NAME_CHARS) return { ok: false, error: `"${name.slice(0, 24)}…" is longer than ${MAX_NAME_CHARS} characters.` };
  if (!PRINTABLE_RE.test(name)) return { ok: false, error: 'A name in the code has characters BUD cannot show.' };
  if (looksUrlOrKey(name)) return { ok: false, error: 'The code contains something that looks like a link or a key. BUD only accepts bot names. Ask your hub bot for a new code.' };
  return { ok: true, name };
}

/** Parse a pasted code. Whitespace and line breaks inside the paste are ignored. */
export async function parseBotCode(input: string): Promise<CodeResult> {
  const code = String(input ?? '').replace(/\s+/g, '');
  const bad = (error: string): CodeResult => ({ ok: false, error });
  if (!code) return bad('Paste the bot list code from your hub bot.');
  if (code.length > MAX_CODE_CHARS) return bad('That code is too long. Ask your hub bot for a new code.');
  if (!code.startsWith(CODE_PREFIX)) return bad('That is not a BUD bot list code. It should start with BUD1.');
  const parts = code.slice(CODE_PREFIX.length).split('.');
  if (parts.length !== 2 || !parts[0] || !/^[0-9a-f]{6}$/i.test(parts[1]) || !B64URL_RE.test(parts[0])) {
    return bad('The code looks cut off or changed. Copy the whole code again.');
  }
  if ((await sha6(parts[0])) !== parts[1].toLowerCase()) return bad('The code does not check out (a typo or a cut-off copy). Copy the whole code again.');
  const json = b64urlDecode(parts[0]);
  if (json === null) return bad('The code looks cut off or changed. Copy the whole code again.');
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(json) || /\/automations\//i.test(json)) {
    return bad('The code contains something that looks like a link or a key. BUD only accepts bot names. Ask your hub bot for a new code.');
  }
  let data: unknown;
  try { data = JSON.parse(json); } catch { return bad('The code looks cut off or changed. Copy the whole code again.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return bad('That code is not in a format BUD knows.');
  const d = data as Record<string, unknown>;
  if (Object.keys(d).some(k => k !== 'v' && k !== 'bots')) return bad('The code has extra data. BUD only accepts bot names. Ask your hub bot for a new code.');
  if (d.v !== 1) return bad('That code is for a different BUD version. Update BUD or ask your hub bot for a new code.');
  if (!Array.isArray(d.bots) || d.bots.length === 0) return bad('The code has no bot names.');
  if (d.bots.length > MAX_HUB_BOTS) return bad(`The code has ${d.bots.length} names; BUD shows up to ${MAX_HUB_BOTS}.`);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of d.bots) {
    const r = checkName(raw);
    if (!r.ok) return bad(r.error);
    const k = r.name.toLowerCase();
    if (seen.has(k)) return bad(`"${r.name}" is in the code twice.`);
    seen.add(k); names.push(r.name);
  }
  return { ok: true, names };
}

/** Build a code (tests, docs and the dev fake hub). */
export async function makeBotCode(names: string[]): Promise<string> {
  const p = b64urlEncode(JSON.stringify({ v: 1, bots: names }));
  return `${CODE_PREFIX}${p}.${await sha6(p)}`;
}
