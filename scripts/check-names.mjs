#!/usr/bin/env node
// Repo-wide check: no personal bot names in tracked text files (names are stored as hashes in private-names.mjs).
// Usage: node scripts/check-names.mjs [dir ...]  (default: git ls-files). Exit 1 on any hit.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { findNames } from './private-names.mjs';

const SKIP = new Set(['package-lock.json']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ehpk', '.ico', '.woff', '.woff2']);
let files = [];
if (process.argv.length > 2) {
  for (const d of process.argv.slice(2)) (function walk(p) {
    if (statSync(p).isDirectory()) readdirSync(p).forEach(n => walk(join(p, n))); else files.push(p);
  })(d);
} else files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
let hits = 0;
for (const f of files) {
  if (SKIP.has(f) || BINARY.has(extname(f).toLowerCase())) continue;
  const names = findNames(readFileSync(f, 'utf8'));
  if (names.length) { hits += names.length; console.log(`NAME  hash ${names.join(', ')}  (${f})`); }
}
if (hits) { console.error(`\n${hits} personal bot name hit(s)`); process.exit(1); }
console.log(`OK: ${files.length} files, no personal bot names`);
