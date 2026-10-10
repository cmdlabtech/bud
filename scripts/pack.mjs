#!/usr/bin/env node
// Build + check + pack the Even Hub package (BUD 1.0).
//   FORWARDER_URL=https://bud-forward.<account>.workers.dev npm run pack
// FORWARDER_URL (build setting) is the zero-retention forwarder origin (forwarder/). The
// network whitelist in app/app.json must be exactly [xAI, that origin]; the build fails otherwise.
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
const DEFAULT_FORWARDER = 'https://bud-forward.admin2655.workers.dev'; // planned name, see docs/setup.md
const forwarder = (process.env.FORWARDER_URL || DEFAULT_FORWARDER).replace(/\/+$/, '');
let fwdOrigin = '';
try { const u = new URL(forwarder); if (u.protocol === 'https:' && u.origin === forwarder) fwdOrigin = u.origin; } catch { /* invalid */ }
if (!fwdOrigin) { console.error('FORWARDER_URL must be a bare https origin, e.g. https://bud-forward.example.workers.dev'); process.exit(1); }
const wl = ((manifest.permissions || []).find(p => p.name === 'network')?.whitelist || []).map(u => new URL(u).origin).sort();
const want = ['https://api.x.ai', fwdOrigin].sort();
if (JSON.stringify(wl) !== JSON.stringify(want)) {
  console.error(`app.json network whitelist must be exactly ${JSON.stringify(want)}; it is ${JSON.stringify(wl)}`);
  process.exit(1);
}
console.log(`Forwarder: ${fwdOrigin}`);
const out = join(app, 'dist-ehpk');
rmSync(out, { recursive: true, force: true });
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } });

run('npx', ['vite', 'build', '--outDir', 'dist-ehpk', '--mode', 'production'], { VITE_MIC_STUB: '', VITE_FORWARDER_URL: fwdOrigin });
run('node', [join(root, 'scripts', 'check-ehpk-urls.mjs'), manifestPath, out]);

mkdirSync(builds, { recursive: true });
const name = `bud-${manifest.version}.ehpk`;
const target = join(builds, name);
run('npx', ['evenhub', 'pack', manifestPath, 'dist-ehpk', '--sdk-ver', '0.0.14', '-o', target]);
copyFileSync(manifestPath, join(builds, name.replace(/\.ehpk$/, '.app.json')));
console.log(`\nBuild: ${target}`);
