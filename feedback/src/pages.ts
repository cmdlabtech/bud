// Pages served by bud-feedback itself (BUD has no website):
//  /verify-frame      Turnstile host frame embedded by the BUD phone page (loopback origin), same
//                     pattern as wondereye.app/verify-frame: the widget runs on this Worker's real
//                     hostname and hands the token to the parent with postMessage.
//  /feedback          Fallback form opened in the phone's browser if the frame can't load in the app
//                     (like Wondereye's "Send feedback on wondereye.app instead").
// The sitekey is public by design. All checks still run in POST /api/feedback.

const esc = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

export const FRAME_CSP =
  "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; " +
  "style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors http://127.0.0.1:* http://localhost:*";
export const PAGE_CSP =
  "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; " +
  "style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const VERIFY_FRAME_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>BUD verification</title>
  <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#ts{min-height:65px}</style>
</head>
<body>
  <div id="ts"></div>
  <script src="/verify-frame.js"></script>
</body>
</html>`;

export function verifyFrameJs(sitekey: string): string {
  return `// See /verify-frame. postMessage goes only to the exact parent origin, and frame-ancestors only
// lets loopback pages (the BUD app in the Even WebView) embed this frame.
(function () {
  var SITEKEY = '${esc(sitekey)}'; // public Turnstile sitekey
  var PARENT = /^http:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d{1,5})?$/;
  var params = new URLSearchParams(location.search);
  var anc = location.ancestorOrigins;
  var parentOrigin = anc && anc.length ? anc[0] : params.get('parent') || '';
  if (window.parent === window || !PARENT.test(parentOrigin)) return;
  var lang = params.get('lang') || 'auto';
  if (!/^(auto|[a-z]{2}(-[a-z]{2})?)$/.test(lang)) lang = 'auto';
  var widgetId;
  function post(msg) { msg.source = 'bud-verify'; window.parent.postMessage(msg, parentOrigin); }
  if (!SITEKEY) return post({ event: 'error', code: 'config' });
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== parentOrigin) return;
    var d = e.data || {};
    if (d.source === 'bud-verify' && d.cmd === 'reset' && window.turnstile && widgetId) window.turnstile.reset(widgetId);
  });
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onerror = function () { post({ event: 'error', code: 'load' }); };
  s.onload = function () {
    if (!window.turnstile) return post({ event: 'error', code: 'load' });
    widgetId = window.turnstile.render(document.getElementById('ts'), {
      sitekey: SITEKEY, theme: 'dark', size: 'flexible', action: 'feedback', language: lang,
      callback: function (t) { post({ event: 'token', token: t }); },
      'expired-callback': function () { post({ event: 'expired' }); },
      'error-callback': function (code) { post({ event: 'error', code: String(code) }); },
    });
    post({ event: 'ready' });
  };
  document.head.appendChild(s);
})();
`;
}

export const FEEDBACK_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>BUD feedback</title>
  <style>
    body{margin:0;background:#0b0d0c;color:#e8f5ec;font-family:-apple-system,system-ui,sans-serif;padding:24px 20px}
    h1{font-size:22px;margin:0 0 4px} p{color:#9fb5a8;font-size:14px;line-height:1.45}
    .seg{display:flex;gap:4px;margin:12px 0} .seg button{flex:1;padding:8px;border-radius:8px;border:1px solid #2f4a3c;background:transparent;color:#9fb5a8;font-size:14px}
    .seg button.on{background:#22302a;color:#fff}
    input,textarea{width:100%;box-sizing:border-box;font-size:16px;padding:10px;border-radius:8px;border:1px solid #2f4a3c;background:#141816;color:#e8f5ec;margin-top:8px;font-family:inherit}
    .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
    .meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#6f8a7b;margin-top:8px}
    #ts{margin-top:10px;min-height:65px} #send{width:100%;margin-top:10px;padding:12px;border:0;border-radius:10px;background:#3ddc84;color:#04120a;font-weight:600;font-size:16px}
    #send:disabled{opacity:.4} #status{min-height:1.3em;font-size:14px}
  </style>
</head>
<body>
  <h1>BUD feedback</h1>
  <p>Bots Up Display</p>
  <form id="f" novalidate>
    <div class="seg" role="radiogroup" aria-label="Category">
      <button type="button" class="on" data-category="bug">Bug</button>
      <button type="button" data-category="idea">Idea</button>
      <button type="button" data-category="other">Other</button>
    </div>
    <input id="title" type="text" maxlength="80" placeholder="Title (optional)" aria-label="Title (optional)" autocomplete="off" />
    <textarea id="message" rows="5" maxlength="2000" placeholder="What happened, or what would you like to see?" aria-label="Message"></textarea>
    <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <div class="meta"><span>Posted as a public GitHub issue in cmdlabtech/bud. Don't include personal info, keys, webhook URLs, or the tasks you send.</span><span id="count">0 / 2000</span></div>
    <div id="ts"></div>
    <button id="send" type="submit" disabled>Send</button>
    <p id="status" role="status" aria-live="polite"></p>
  </form>
  <script src="/feedback.js"></script>
</body>
</html>`;

export function feedbackPageJs(sitekey: string): string {
  return `(function () {
  var SITEKEY = '${esc(sitekey)}';
  var f = document.getElementById('f'), msg = document.getElementById('message'), title = document.getElementById('title');
  var hp = f.querySelector('input[name="website"]'), send = document.getElementById('send'), status = document.getElementById('status');
  var count = document.getElementById('count'), cats = [].slice.call(f.querySelectorAll('[data-category]'));
  var category = 'bug', token = '', openedAt = Date.now(), sending = false, widgetId;
  var params = new URLSearchParams(location.search);
  var appVersion = /^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/.test(params.get('v') || '') ? params.get('v') : undefined;
  function refresh() { count.textContent = msg.value.length + ' / 2000'; send.disabled = sending || !token || msg.value.trim().length < 10; }
  cats.forEach(function (b) { b.addEventListener('click', function () { category = b.dataset.category; cats.forEach(function (x) { x.classList.toggle('on', x === b); }); }); });
  msg.addEventListener('input', refresh);
  f.addEventListener('submit', function (e) {
    e.preventDefault(); if (send.disabled) return;
    sending = true; refresh(); status.textContent = 'Sending…';
    fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      category: category, message: msg.value.trim(), title: title.value.trim() || undefined, source: 'web', page: '/feedback',
      appVersion: appVersion, website: hp.value, elapsedMs: Date.now() - openedAt, turnstileToken: token }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && d.ok, status: r.status }; }); })
      .catch(function () { return { ok: false, status: 0 }; })
      .then(function (r) {
        sending = false;
        if (r.ok) { f.reset(); [].slice.call(f.children).forEach(function (el) { if (el !== status) el.hidden = true; }); status.textContent = 'Thank you. Your feedback has been received and will be reviewed.'; return; }
        status.textContent = r.status === 429 ? 'Too many submissions. Please try again later.' : "Feedback couldn't be sent. Please try again later.";
        token = ''; if (window.turnstile && widgetId) window.turnstile.reset(widgetId); refresh();
      });
  });
  if (!SITEKEY) { status.textContent = 'Verification could not load. Please try again later.'; return; }
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
  s.onerror = function () { status.textContent = 'Verification could not load. Please try again later.'; };
  s.onload = function () {
    widgetId = window.turnstile.render(document.getElementById('ts'), { sitekey: SITEKEY, theme: 'dark', size: 'flexible', action: 'feedback',
      callback: function (t) { token = t; refresh(); }, 'expired-callback': function () { token = ''; refresh(); },
      'error-callback': function () { token = ''; status.textContent = 'Verification could not load. Please try again later.'; refresh(); } });
  };
  document.head.appendChild(s);
  refresh();
})();
`;
}
