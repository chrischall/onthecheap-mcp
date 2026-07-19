import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `tests/worker.test.ts` only runs under the Workers runtime pool
    // (`vitest.workers.config.ts` / `npm run worker:test`), which provides the
    // virtual `cloudflare:test` module it imports. Exclude it from the node pool.
    exclude: [...configDefaults.exclude, 'tests/worker.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The Worker-only entry points import agents/@chrischall/mcp-connector
      // (cloudflare:workers), which cannot load under the node pool — they are
      // exercised by the Workers pool suite via `npm run worker:test`.
      exclude: [...configDefaults.coverage.exclude, 'src/worker.ts'],
    },
  },
});
