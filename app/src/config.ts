// Relay origin is baked in at build time (VITE_RELAY_URL) and must match the single
// entry in app.json network.whitelist. scripts/pack.mjs sets both together.
// Dev falls back to the local `wrangler dev` relay; the branch is dropped from production builds.
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL as string | undefined)?.replace(/\/$/, '') || (import.meta.env.DEV ? 'http://127.0.0.1:8788' : '');
export const POLL_MS = 15_000;          // CMDLAB decision: ~15 s while open
export const REPLY_POLL_MS = 3_000;     // faster polling only on the Sent screen
export const REPLY_TIMEOUT_MS = 180_000; // 3 min
export const OFFLINE_MAX_ATTEMPTS = 3;
export const MIC_STUB: boolean = import.meta.env.DEV && import.meta.env.VITE_MIC_STUB === '1';
