// One-time stub that retires the old bud-relay Worker. Deploying it (gated) applies the
// delete-class migration in retire/wrangler.jsonc, which deletes the GlassStore Durable Object
// namespace and all of its stored data. After that: `wrangler delete bud-relay`.
export default {
  fetch: () => new Response('BUD relay retired', { status: 410, headers: { 'Cache-Control': 'no-store' } }),
} satisfies ExportedHandler;
