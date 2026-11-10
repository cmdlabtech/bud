// One "Paste setup" box (1.0.2): the user pastes, in any order and in one or several pastes,
// the hub routine's webhook URL and sender key (copied from the routine's Webhook section in Grok Bot desktop: "POST to" and "key", or the
// whole "header" line, "Authorization: Bearer <key>") and the BUD1 bot
// list code (copied from the hub's chat reply). An xAI API key pasted here is recognized too.
// Each item is told apart by its pattern; nothing here touches the network or storage.

const WEBHOOK_IN_TEXT = /https:\/\/api2\.cursor\.sh\/automations\/webhook\/[A-Za-z0-9_-]{6,128}(?![A-Za-z0-9_-])/;
const CODE_IN_TEXT = /BUD1\.[A-Za-z0-9_-]+\.[0-9a-fA-F]{6}(?![0-9a-zA-Z])/;
const XAI_KEY = /^xai-[A-Za-z0-9_-]{20,}$/;
const KEYISH = /^[\x21-\x7E]{8,512}$/;          // printable ASCII, no spaces (forwarder KEY_RE)

export interface Detected { url?: string; key?: string; code?: string; xaiKey?: string; ignored: number }

export function detectSetup(raw: string): Detected {
  const text = String(raw ?? '');
  const out: Detected = { ignored: 0 };
  // The routine's "header" field is "Authorization: Bearer <key>": drop the labels so only the key is left.
  let rest = text.replace(/\bAuthorization:\s*/gi, ' ').replace(/\bBearer\s+/gi, ' ');
  const url = rest.match(WEBHOOK_IN_TEXT);
  if (url) { out.url = url[0]; rest = rest.replace(url[0], ' '); }
  // Chat apps may wrap a long code across lines: also look with all whitespace removed.
  const code = rest.match(CODE_IN_TEXT) ?? rest.replace(/\s+/g, '').match(CODE_IN_TEXT);
  if (code) {
    out.code = code[0];
    const at = rest.indexOf('BUD1.');
    rest = at >= 0 ? rest.slice(0, at) + ' ' + rest.slice(at).replace(/^BUD1\.[A-Za-z0-9_.\s-]*/, ' ') : rest;
  }
  const tokens = rest.split(/\s+/).map(t => t.replace(/^["'`(<\[]+|["'`)>\],;]+$/g, '')).filter(Boolean);
  for (const t of tokens) {
    if (XAI_KEY.test(t)) { out.xaiKey ??= t; continue; }
    if (/:\/\//.test(t)) { out.ignored++; continue; }
    // A sender key is one long printable token. Short words ("Sender", "key:") are labels, not keys.
    const minLen = tokens.length === 1 ? 8 : 16;
    if (KEYISH.test(t) && t.length >= minLen && !t.startsWith('BUD1.')) { if (!out.key) out.key = t; else out.ignored++; continue; }
    if (t.length >= 8) out.ignored++;
  }
  return out;
}

export type StepState = 'done' | 'todo' | 'busy' | 'error';
export interface SetupStatus { xaiKey: boolean; url: boolean; key: boolean; names: number; test: StepState }

/** First-run progress: step 1 speech key, step 2 hub (URL + key + test). Bot list is optional. */
export function setupProgress(s: { xaiKey: boolean; hub: boolean }): { step: 1 | 2 | 0; done: boolean; label: string } {
  if (!s.xaiKey) return { step: 1, done: false, label: 'Setup 1/2: Speech key' };
  if (!s.hub) return { step: 2, done: false, label: 'Setup 2/2: Connect your hub bot' };
  return { step: 0, done: true, label: 'Setup done. Put on your glasses, pick a bot and talk.' };
}

/** What the glasses list as still missing (setup screen). */
export function remainingSteps(s: { xaiKey: boolean; hub: boolean; bots: number }): string[] {
  const steps: string[] = [];
  if (!s.xaiKey) steps.push('Add your xAI key (speech to text)');
  if (!s.hub && s.bots === 0) steps.push('Add the BUD hub bot in Grok Bot, then paste setup');
  return steps;
}
