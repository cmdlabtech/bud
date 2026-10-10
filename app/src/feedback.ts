// Phone page: Send feedback form. Same logic as Wondereye's packages/frontend/src/feedback.ts:
// posts to bud-feedback's POST /api/feedback, and every abuse check (Turnstile, rate limits,
// honeypot, schema, origin) runs server side. No secret lives in this bundle; the Turnstile
// sitekey is public by design and lives in the verify frame, not here.
//
// Feedback is the ONE thing BUD keeps: it becomes an issue in the private cmdlabtech/bud repo.
// It is separate from the zero-retention forwarder (different Worker) and never carries a
// webhook URL, a key or task text: the form refuses text that looks like one, or that contains
// a key saved on this phone (the server refuses the same patterns again).
//
// Turnstile can't run on this page in the Even app (the .ehpk is served from
// http://127.0.0.1:<random port>, and Turnstile only authorizes real hostnames), so, as in
// Wondereye, the widget runs in a small frame on bud-feedback's own hostname and hands the
// token back with postMessage. bud-feedback still verifies every token (siteverify + hostname).
import { FEEDBACK_URL } from './config';

const VERIFY_PATH = '/verify-frame';
const VERIFY_TIMEOUT_MS = 15000;
// Turnstile codes that a retry won't fix in this WebView: offer the web form. ('config': the
// frame has no sitekey yet.)
const FATAL = /^(load|timeout|config|110[125]\d\d|200500|400\d{3})$/;
export const MSG_MAX = 2000;
export const TITLE_MAX = 80;
export const MSG_MIN = 10;

export const T = {
  sending: 'Sending…',
  thanks: 'Thank you. Your feedback has been received and will be reviewed.',
  error: "Feedback couldn't be sent. Please try again later.",
  tooMany: 'Too many submissions. Please try again later.',
  verifyFail: 'Verification could not load. Please try again later.',
  secret: 'Please remove keys, webhook URLs and other secrets before sending.',
} as const;

type VerifyMessage = { source?: string; event?: string; token?: string; code?: string };

export function verifyOrigin(base = FEEDBACK_URL): string {
  try { return new URL(base).origin; } catch { return ''; }
}

export function verifyFrameUrl(parentOrigin: string, lang: string, base = FEEDBACK_URL): string {
  const q = new URLSearchParams({ parent: parentOrigin, lang });
  return `${verifyOrigin(base)}${VERIFY_PATH}?${q.toString()}`;
}

/** Standalone form on bud-feedback, opened in the phone's browser when the frame can't load. */
export function fallbackUrl(version: string, base = FEEDBACK_URL): string {
  return `${verifyOrigin(base)}/feedback?v=${encodeURIComponent(version)}`;
}

/** True only for messages from our verify frame (right origin, right window). */
export function isVerifyMessage(e: Pick<MessageEvent, 'origin' | 'source' | 'data'>, frame: Window | null, origin = verifyOrigin()): boolean {
  const d = e.data as VerifyMessage | null;
  return !!origin && e.origin === origin && !!frame && e.source === frame && !!d && d.source === 'bud-verify';
}

export function isFatalVerifyCode(code: string | undefined): boolean {
  return FATAL.test(String(code ?? ''));
}

// Same patterns bud-feedback refuses (feedback/src/feedback.ts SECRET_RES).
const SECRET_RES = [
  /api2\.cursor\.sh\/automations\/webhook\//i,
  /\bxai-[A-Za-z0-9]{20,}/,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
];

/** True if the text looks like it holds a webhook URL or key, or contains any key saved on this phone. */
export function looksSecret(text: string, saved: readonly string[] = []): boolean {
  if (SECRET_RES.some(re => re.test(text))) return true;
  return saved.some(s => s.length >= 8 && text.includes(s));
}

export type FeedbackPayload = {
  category: string; message: string; title?: string; source: 'app'; page: '/app';
  appVersion: string; website: string; elapsedMs: number; turnstileToken: string;
};

export function buildPayload(p: { category: string; message: string; title: string; version: string; website: string; elapsedMs: number; token: string }): FeedbackPayload {
  return {
    category: p.category,
    message: p.message.trim(),
    title: p.title.trim() || undefined,
    source: 'app',
    page: '/app',
    appVersion: p.version,
    website: p.website,
    elapsedMs: p.elapsedMs,
    turnstileToken: p.token,
  };
}

export type FeedbackOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Strings saved on this phone that must never be sent (bot webhook URLs and keys, xAI key). */
  savedSecrets: () => string[];
  version: string;
  base?: string;
  /** DEV ONLY: skip the frame and use this token (simulator runs with the endpoint faked). */
  devToken?: string;
};

export function initFeedbackForm(opts: FeedbackOptions): void {
  const form = document.getElementById('feedback-form') as HTMLFormElement | null;
  const toggle = document.getElementById('feedback-toggle');
  if (!form || !toggle) return;
  const base = opts.base ?? FEEDBACK_URL;
  const origin = verifyOrigin(base);
  const doFetch = opts.fetch ?? ((i, n) => fetch(i, n));

  const message = form.querySelector<HTMLTextAreaElement>('#feedback-message')!;
  const title = form.querySelector<HTMLInputElement>('#feedback-title')!;
  const honeypot = form.querySelector<HTMLInputElement>('input[name="website"]')!;
  const widget = form.querySelector<HTMLElement>('#feedback-turnstile')!;
  const submit = form.querySelector<HTMLButtonElement>('#feedback-submit')!;
  const status = document.getElementById('feedback-status')!;
  const fallback = document.getElementById('feedback-fallback') as HTMLAnchorElement | null;
  const count = document.getElementById('feedback-count')!;
  const catButtons = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-category]'));
  if (fallback && origin) fallback.href = fallbackUrl(opts.version, base);

  let category = 'bug';
  let token = '';
  let openedAt = 0;
  let frame: HTMLIFrameElement | undefined;
  let mounted = false;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;

  const refresh = () => {
    count.textContent = `${message.value.length} / ${MSG_MAX}`;
    submit.disabled = sending || !token || message.value.trim().length < MSG_MIN;
  };

  catButtons.forEach(b =>
    b.addEventListener('click', () => {
      category = b.dataset.category!;
      catButtons.forEach(x => x.classList.toggle('active', x === b));
    }),
  );
  message.addEventListener('input', refresh);

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    form.hidden = open;
    if (open || mounted) return;
    mounted = true;
    openedAt = Date.now();
    if (opts.devToken) { token = opts.devToken; refresh(); return; }
    mountVerifyFrame();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    if (looksSecret(`${title.value}\n${message.value}`, opts.savedSecrets())) {
      status.textContent = T.secret;
      return;
    }
    sending = true;
    refresh();
    status.textContent = T.sending;
    let ok = false;
    let httpStatus = 0;
    try {
      const res = await doFetch(`${origin}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload({
          category, message: message.value, title: title.value, version: opts.version,
          website: honeypot.value, elapsedMs: Date.now() - openedAt, token,
        })),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      ok = res.ok && !!data.ok;
      httpStatus = res.status;
    } catch {
      /* network failure */
    }
    sending = false;
    if (ok) {
      form.reset();
      Array.from(form.children).forEach(el => {
        if (el !== status) (el as HTMLElement).hidden = true;
      });
      status.textContent = T.thanks;
      return;
    }
    status.textContent = httpStatus === 429 ? T.tooMany : T.error;
    if (opts.devToken) { refresh(); return; }
    token = '';
    frame?.contentWindow?.postMessage({ source: 'bud-verify', cmd: 'reset' }, origin);
    refresh();
  });

  const showFallback = () => {
    status.textContent = T.verifyFail;
    if (fallback) fallback.hidden = false;
  };

  const mountVerifyFrame = () => {
    if (!origin) return showFallback();
    frame = document.createElement('iframe');
    frame.className = 'feedback-verify';
    frame.title = 'Cloudflare Turnstile';
    frame.src = verifyFrameUrl(location.origin, 'en', base);
    widget.appendChild(frame);
    readyTimer = setTimeout(showFallback, VERIFY_TIMEOUT_MS);
  };

  window.addEventListener('message', e => {
    if (!isVerifyMessage(e, frame?.contentWindow ?? null, origin)) return;
    const d = e.data as VerifyMessage;
    if (d.event === 'ready') {
      clearTimeout(readyTimer);
    } else if (d.event === 'token' && typeof d.token === 'string') {
      token = d.token.slice(0, 4096);
      if (status.textContent === T.verifyFail) status.textContent = '';
    } else if (d.event === 'expired') {
      token = '';
    } else if (d.event === 'error') {
      token = '';
      clearTimeout(readyTimer);
      if (isFatalVerifyCode(d.code)) showFallback();
    }
    refresh();
  });

  refresh();
}

// Same as Wondereye's initExternalLinks: the Even WebView may not follow target="_blank", so try
// window.open first and only cancel the native navigation if that worked.
export function initExternalLinks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>('a[data-external]').forEach(link => {
    link.addEventListener('click', e => {
      const url = link.href;
      if (!url) return;
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) e.preventDefault();
    });
  });
}
