#!/usr/bin/env node
// Build-time bundle check (after Wondereye 1.7.2's scripts/check-ehpk-urls.mjs):
//  1. every http(s) URL literal in the built folder must be on app.json's network whitelist
//     (Even Hub's review scanner flags stray literals);
//  2. no secrets or dev-only code may ship (Even: "Never bundle secrets or API keys into the .ehpk").
// Usage: node scripts/check-ehpk-urls.mjs <app.json> <build dir>. Exit 1 on any problem.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const [manifestPath, dir] = process.argv.slice(2);
if (!manifestPath || !dir) { console.error('usage: check-ehpk-urls.mjs <app.json> <build dir>'); process.exit(2); }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const net = (manifest.permissions || []).find(p => p.name === 'network');
const allowed = new Set((net?.whitelist || []).map(u => new URL(u).origin));

// Literals that are not network calls and are safe to ship (XML/SVG namespaces in the SDK or Vite runtime).
const IGNORE = [/^http:\/\/www\.w3\.org\//];

// Secret and dev-leak patterns. Values are never printed, only the rule and file.
const LEAKS = [
  ['xAI API key', /\bxai-[A-Za-z0-9]{20,}/],
  ['bearer literal', /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Cloudflare API token var', /CLOUDFLARE_API_TOKEN|CF_API_TOKEN/],
  ['old relay token var', /ADMIN_TOKEN|BOT_WRITE_TOKEN|WEBHOOK_KEY_/],
  ['baked-in webhook URL', /api2\.cursor\.sh\/automations\/webhook\/[A-Za-z0-9_-]/],
  ['direct webhook origin literal (sends must go through the forwarder)', /https:\/\/api2\.cursor\.sh/],
  ['forwarder dev upstream', /DEV_UPSTREAM/],
  ['dev fake network', /createFakeNet|seedFakeSettings|dev-fake-|devfake/],
  ['localhost URL', /https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/],
  ['placeholder', /REPLACE-ME/],
];

const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);

let bad = 0;
const found = new Map();
for (const f of files) {
  if (!['.js', '.html', '.css', '.json', '.mjs', '.map', '.txt', '.svg'].includes(extname(f))) continue;
  const text = readFileSync(f, 'utf8');
  const rel = relative(dir, f);
  for (const m of text.matchAll(/https?:\/\/[^\s"'`<>()\\]+/g)) found.set(m[0].replace(/&amp;/g, '&'), rel);
  for (const [label, re] of LEAKS) {
    if (re.test(text)) { bad++; console.log(`LEAK  ${label}  (${rel})`); }
  }
}
for (const [url, file] of [...found].sort()) {
  if (IGNORE.some(r => r.test(url))) { console.log(`ignored (not a network call)  ${url}  (${file})`); continue; }
  let origin = '';
  try { origin = new URL(url.replace(/\$\{[^}]*\}?/g, 'x')).origin; } catch { /* unparseable */ }
  const ok = allowed.has(origin);
  if (!ok) bad++;
  console.log(`${ok ? 'whitelisted' : 'NOT WHITELISTED'}  ${url}  (${file})`);
}
for (const o of allowed) if (![...found.keys()].some(u => u.startsWith(o))) console.log(`note: whitelist entry with no literal in bundle: ${o}`);
if (!net?.whitelist?.length) { console.log('network permission has no whitelist'); bad++; }
if (bad) { console.error(`\n${bad} problem(s): stray URL literals or leaked secrets/dev code`); process.exit(1); }
console.log(`\nOK: ${files.length} files, ${found.size} URL literal(s), all whitelisted; no secrets or dev code`);
