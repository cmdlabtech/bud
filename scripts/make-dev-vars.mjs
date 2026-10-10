// Writes relay/.dev.vars with random LOCAL-ONLY tokens for wrangler dev (gitignored).
// Never used for production. Prints nothing secret.
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const path = new URL('../relay/.dev.vars', import.meta.url);
if (existsSync(path) && !process.argv.includes('--force')) { console.log('relay/.dev.vars exists (use --force to regenerate)'); process.exit(0); }
const r = () => randomBytes(24).toString('base64url');
const port = process.env.FAKE_PORT ?? '9911';
writeFileSync(path, [
  'DEV=true',
  `ADMIN_TOKEN=${r()}`,
  `BOT_WRITE_TOKEN=${r()}`,
  'STT_STUB_TEXT="Summarize what is waiting for me today."',
  `WEBHOOK_URL_EDITH=http://127.0.0.1:${port}/hook/edith`,
  `WEBHOOK_KEY_EDITH=${r()}`,
  `WEBHOOK_URL_SHURI=http://127.0.0.1:${port}/hook/shuri`,
  `WEBHOOK_KEY_SHURI=${r()}`,
  '',
].join('\n'), { mode: 0o600 });
console.log('wrote relay/.dev.vars (local dev tokens, not printed)');
