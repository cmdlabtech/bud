#!/usr/bin/env node
// Build + check + pack the Even Hub package (BUD 1.0, no relay).
//   npm run pack
// The network whitelist comes straight from app/app.json (xAI STT + Grok Bot webhooks).
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
const out = join(app, 'dist-ehpk');
rmSync(out, { recursive: true, force: true });
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } });

run('npx', ['vite', 'build', '--outDir', 'dist-ehpk', '--mode', 'production'], { VITE_MIC_STUB: '' });
run('node', [join(root, 'scripts', 'check-ehpk-urls.mjs'), manifestPath, out]);

mkdirSync(builds, { recursive: true });
const name = `bud-${manifest.version}.ehpk`;
const target = join(builds, name);
run('npx', ['evenhub', 'pack', manifestPath, 'dist-ehpk', '--sdk-ver', '0.0.14', '-o', target]);
copyFileSync(manifestPath, join(builds, name.replace(/\.ehpk$/, '.app.json')));
console.log(`\nBuild: ${target}`);
