// Local stand-in for Grok Bot webhook routines (dev/e2e only).
// Checks the sender key like Grok Bot would, then "replies" by POSTing a short
// summary to the relay's /v1/replies with the bot write token, as a real
// Glass inbox routine is told to do. Reads keys from relay/.dev.vars; prints no secrets.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const vars = Object.fromEntries(readFileSync(new URL('../relay/.dev.vars', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const RELAY = process.env.RELAY_URL ?? 'http://127.0.0.1:8788';
const PORT = Number(process.env.FAKE_PORT ?? 9911);
const DELAY = Number(process.env.FAKE_DELAY_MS ?? 1500);
const log = [];

async function relayPost(path, body) {
  const res = await fetch(RELAY + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vars.BOT_WRITE_TOKEN}`, 'X-Glass-Ts': String(Date.now()), 'X-Glass-Request-Id': randomUUID() },
    body: JSON.stringify(body),
  });
  return res.status;
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/log') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(log)); return; }
  const m = /^\/hook\/([a-z-]+)$/.exec(req.url ?? '');
  if (req.method !== 'POST' || !m) { res.writeHead(404); res.end(); return; }
  const bot = m[1];
  const expected = vars[`WEBHOOK_KEY_${bot.toUpperCase().replace(/-/g, '_')}`];
  const auth = req.headers.authorization ?? '';
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', async () => {
    if (!expected || auth !== `Bearer ${expected}` || req.headers['x-automation-key'] !== expected) {
      log.push({ bot, rejected: true }); res.writeHead(401); res.end(); return;
    }
    let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end(); return; }
    log.push({ bot, kind: body.kind, text: body.text, action: body.action, item_ref: body.item_ref, message_id: body.message_id });
    console.log(`[fake-grokbot] ${bot} woke: kind=${body.kind}${body.text ? ` text="${body.text}"` : ''}${body.action ? ` action=${body.action}` : ''}`);
    res.writeHead(200); res.end('ok');
    if (body.kind === 'voice') {
      setTimeout(async () => {
        const st = await relayPost('/v1/replies', { message_id: body.message_id, bot_id: bot, short: `Got it. (${bot} stub) You asked: "${String(body.text).slice(0, 120)}". Full answer is in my Grok Bot chat.` });
        console.log(`[fake-grokbot] ${bot} reply posted -> ${st}`);
      }, DELAY);
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`[fake-grokbot] listening on 127.0.0.1:${PORT}`));
