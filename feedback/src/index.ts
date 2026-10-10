// bud-feedback Worker. Separate from bud-forward so the forwarder's zero-retention config stays
// untouched: this Worker has a KV namespace (hashed rate-limit counters + 24 h dedupe hashes) and
// files GitHub issues. Logs are off; the only console output is a reason code on rejects.
import { handleFeedback, LOOPBACK_ORIGIN, type Env } from './feedback';
import { LEGAL_CSP, PRIVACY_HTML, TERMS_HTML } from './legal';
import { FEEDBACK_PAGE_HTML, FRAME_CSP, PAGE_CSP, VERIFY_FRAME_HTML, feedbackPageJs, verifyFrameJs } from './pages';

const BASE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function cors(origin: string | null): Record<string, string> {
  // Only the BUD app's loopback WebView origin gets CORS; the /feedback page is same-origin.
  if (!origin || !LOOPBACK_ORIGIN.test(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
}

export async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  const text = (body: string, type: string, extra: Record<string, string> = {}, status = 200) =>
    new Response(body, { status, headers: { ...BASE, 'Content-Type': type, ...extra } });

  switch (url.pathname) {
    case '/api/feedback': {
      const c = cors(origin);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...BASE, ...c } });
      if (req.method !== 'POST') return text('method not allowed', 'text/plain', { ...c, Allow: 'POST, OPTIONS' }, 405);
      const json = (status: number, data: unknown) => text(JSON.stringify(data), 'application/json', { ...c, 'Cache-Control': 'no-store' }, status);
      try {
        return await handleFeedback(req, env, json);
      } catch {
        return json(500, { ok: false, error: "Feedback couldn't be sent. Please try again later." });
      }
    }
    case '/verify-frame':
      return text(VERIFY_FRAME_HTML, 'text/html; charset=utf-8', { 'Content-Security-Policy': FRAME_CSP, 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' });
    case '/verify-frame.js':
      return text(verifyFrameJs(env.TURNSTILE_SITEKEY ?? ''), 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=300' });
    case '/feedback':
      return text(FEEDBACK_PAGE_HTML, 'text/html; charset=utf-8', { 'Content-Security-Policy': PAGE_CSP, 'X-Frame-Options': 'DENY', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' });
    case '/feedback.js':
      return text(feedbackPageJs(env.TURNSTILE_SITEKEY ?? ''), 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=300' });
    case '/privacy':
    case '/terms':
      // Public, indexable legal pages for the Even Hub listing (generated from docs/privacy.md, docs/terms.md).
      return text(url.pathname === '/privacy' ? PRIVACY_HTML : TERMS_HTML, 'text/html; charset=utf-8', { 'Content-Security-Policy': LEGAL_CSP, 'X-Frame-Options': 'DENY', 'Cache-Control': 'public, max-age=3600' });
    case '/health':
      return text('ok', 'text/plain');
    default:
      return text('not found', 'text/plain', {}, 404);
  }
}

export default { fetch: (req: Request, env: Env) => route(req, env) } satisfies ExportedHandler<Env>;
