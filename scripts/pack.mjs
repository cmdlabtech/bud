#!/usr/bin/env node
// Build + check + pack the Even Hub package.
//   GLASS_RELAY_URL=https://grokbot-glass-relay.<subdomain>.workers.dev npm run pack
// Without GLASS_RELAY_URL it builds a CANDIDATE with the placeholder relay (not submittable).
// The relay origin goes into BOTH the bundle (VITE_RELAY_URL) and app.json's network whitelist.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const builds = process.env.PACK_OUT_DIR ? resolve(process.env.PACK_OUT_DIR) : resolve(root, '..', 'builds');
const PLACEHOLDER = 'https://grokbot-glass-relay.REPLACE-ME.workers.dev';
const relay = (process.env.GLASS_RELAY_URL || PLACEHOLDER).replace(/\/$/, '');
const u = new URL(relay);
if (u.protocol !== 'https:' || u.pathname !== '/' || u.search) throw new Error('GLASS_RELAY_URL must be an https origin with no path');
const isCandidate = relay === PLACEHOLDER;

const manifest = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8'));
const net = manifest.permissions.find(p => p.name === 'network');
net.whitelist = [u.origin]; // the app only talks to the relay; xAI is called server-side by the relay
const out = join(app, 'dist-ehpk');
rmSync(out, { recursive: true, force: true });
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } });

run('npx', ['vite', 'build', '--outDir', 'dist-ehpk', '--mode', 'production'], { VITE_RELAY_URL: u.origin, VITE_MIC_STUB: '' });
const builtManifest = join(app, 'app.build.json');
writeFileSync(builtManifest, JSON.stringify(manifest, null, 2) + '\n');
run('node', [join(root, 'scripts', 'check-ehpk-urls.mjs'), builtManifest, out], { ALLOW_PLACEHOLDER: isCandidate ? '1' : '' });

mkdirSync(builds, { recursive: true });
const name = `grokbot-glass-${manifest.version}${isCandidate ? '-candidate-placeholder' : ''}.ehpk`;
const target = join(builds, name);
run('npx', ['evenhub', 'pack', builtManifest, 'dist-ehpk', '--sdk-ver', '0.0.14', '-o', target]);
copyFileSync(builtManifest, join(builds, name.replace(/\.ehpk$/, '.app.json')));
rmSync(builtManifest, { force: true });
console.log(`\n${isCandidate ? 'CANDIDATE (placeholder relay, not submittable)' : 'Release build'}: ${target}`);
