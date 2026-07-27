import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Runs `tests/worker.test.ts` inside the real Workers runtime (via Miniflare),
// against `wrangler.jsonc`'s bindings (the `CotcMcpAgent` Durable Object +
// `OAUTH_KV`). Kept separate from the stdio suite's `vitest.config.ts`, which
// runs under Node — but `npm test` now runs BOTH (`vitest run && npm run
// worker:test`), so this file IS exercised by a plain `npm test`. Use
// `npm run test:node` for the node pool alone.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['tests/worker.test.ts'],
    // node-html-parser (used by src/events.ts and src/normalize.ts) pulls in
    // css-what, whose ESM build uses extensionless relative imports. The
    // Workers runtime's module resolver rejects those, so the raw package
    // cannot load in this pool — even though `wrangler deploy` bundles it
    // fine, because esbuild resolves the extensions at build time. Pre-bundle
    // it here so the test pool sees the same shape the deployed Worker does.
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['node-html-parser'],
        },
      },
    },
  },
});
