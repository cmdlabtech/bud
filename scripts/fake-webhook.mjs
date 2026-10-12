#!/usr/bin/env node
// LOCAL TEST ONLY: a fake Grok Bot webhook on 127.0.0.1 for `npm run dev:forwarder`.
// Accepts POST /automations/webhook/<id>; 200 when both auth headers carry the same key and
// the body is the BUD shape, 401 otherwise. Prints only a summary line (never the key).
import { createServer } from 'node:http';
const port = Number(process.env.PORT || 8899);
let n = 0;
createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    n++;
    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
    const auto = req.headers['x-automation-key'] || '';
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    const okPath = /^\/automations\/webhook\/[A-Za-z0-9_-]+$/.test(req.url || '');
    const okAuth = bearer && bearer === auto && bearer !== 'wrong-key-000';
    const okBody = body.source === 'bud' && (body.kind === 'voice' || body.kind === 'test') && typeof body.text === 'string';
    const status = req.method !== 'POST' || !okPath ? 404 : !okAuth ? 401 : !okBody ? 400 : 200;
    console.log(`fake-webhook #${n} ${req.method} ${req.url} -> ${status} keys_match=${bearer === auto} fields=${Object.keys(body).join(',')}`);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ upstream_secret_body: 'should never reach the phone' }));
  });
}).listen(port, '127.0.0.1', () => console.log(`fake webhook on http://127.0.0.1:${port}`));
