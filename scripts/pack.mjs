#!/usr/bin/env node
// Build + check + pack the Even Hub package (BUD 1.0).
//   FORWARDER_URL=https://bud-forward.<account>.workers.dev FEEDBACK_URL=https://bud-feedback.<account>.workers.dev npm run pack
// FORWARDER_URL (build setting) is the zero-retention forwarder origin (forwarder/).
// FEEDBACK_URL is the separate feedback Worker (feedback/), the one thing BUD keeps.
// The network whitelist in app/app.json must be exactly [xAI, forwarder, feedback,
// Turnstile, PayPal, xAI console, https://x.ai] (the last three as in Wondereye: Turnstile runs in the feedback frame, and the
// PayPal Donate, xAI console key, and hub bot template links are URL literals Even's scanner checks); the build fails otherwise.
// No keys are built in: the user enters them on the phone page and they stay on the phone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const builds = process.env.PACK_OUT_DIR ? resolve(process.env.PACK_OUT_DIR) : resolve(root, '..', 'builds');
const manifestPath = join(app, 'app.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const DEFAULT_FORWARDER = 'https://bud-forward.admin2655.workers.dev'; // deployed, see docs/setup.md
const DEFAULT_FEEDBACK = 'https://bud-feedback.admin2655.workers.dev'; // planned name, see docs/setup.md
const TURNSTILE = 'https://challenges.cloudflare.com';
const PAYPAL = 'https://www.paypal.com';
const XAI_CONSOLE = 'https://console.x.ai'; // "Get an xAI API key" link-out (literal, like PayPal)
const HUB_BOT = 'https://x.ai'; // "Get the BUD hub bot" Grok Bot template link-out (literal, like PayPal)
function bareOrigin(name, value) {
  const v = value.replace(/\/+$/, '');
  try { const u = new URL(v); if (u.protocol === 'https:' && u.origin === v) return u.origin; } catch { /* invalid */ }
  console.error(`${name} must be a bare https origin, e.g. https://${name === 'FEEDBACK_URL' ? 'bud-feedback' : 'bud-forward'}.example.workers.dev`);
  process.exit(1);
}
const fwdOrigin = bareOrigin('FORWARDER_URL', process.env.FORWARDER_URL || DEFAULT_FORWARDER);
const fbOrigin = bareOrigin('FEEDBACK_URL', process.env.FEEDBACK_URL || DEFAULT_FEEDBACK);
const wl = ((manifest.permissions || []).find(p => p.name === 'network')?.whitelist || []).map(u => new URL(u).origin).sort();
const want = ['https://api.x.ai', fwdOrigin, fbOrigin, TURNSTILE, PAYPAL, XAI_CONSOLE, HUB_BOT].sort();
if (JSON.stringify(wl) !== JSON.stringify(want)) {
  console.error(`app.json network whitelist must be exactly ${JSON.stringify(want)}; it is ${JSON.stringify(wl)}`);
  process.exit(1);
}
console.log(`Forwarder: ${fwdOrigin}\nFeedback: ${fbOrigin}`);
const out = join(app, 'dist-ehpk');
rmSync(out, { recursive: true, force: true });
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } });

run('npx', ['vite', 'build', '--outDir', 'dist-ehpk', '--mode', 'production'], { VITE_MIC_STUB: '', VITE_FORWARDER_URL: fwdOrigin, VITE_FEEDBACK_URL: fbOrigin });
run('node', [join(root, 'scripts', 'check-ehpk-urls.mjs'), manifestPath, out]);

mkdirSync(builds, { recursive: true });
const name = `bud-${manifest.version}.ehpk`;
const target = join(builds, name);
run('npx', ['evenhub', 'pack', manifestPath, 'dist-ehpk', '--sdk-ver', '0.0.14', '-o', target]);
copyFileSync(manifestPath, join(builds, name.replace(/\.ehpk$/, '.app.json')));
console.log(`\nBuild: ${target}`);
