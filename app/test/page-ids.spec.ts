import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every element main.ts looks up with $('id') must exist in index.html, or the phone page throws at start.
describe('phone page wiring', () => {
  it('main.ts only uses ids that index.html has', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const used = new Set([...main.matchAll(/\$(?:<[^>]+>)?\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
    for (const m of main.matchAll(/for \(const id of \[([^\]]+)\]\)/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) used.add(q[1]);
    const missing = [...used].filter(id => !html.includes(`id="${id}"`));
    expect(used.size).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });
});
