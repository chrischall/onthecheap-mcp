import { describe, it, expect, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { CotcClient } from '../src/client.js';
import { registerPostTools } from '../src/tools/posts.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from '../src/tools/taxonomy.js';

// Registers every tool and verifies the roster through a client, the same way
// a host sees it at install time.
describe('tool registry', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('exposes the expected tools', async () => {
    const client = new CotcClient();
    harness = await createTestHarness((server) => {
      registerPostTools(server, client);
      registerEventTools(server, client);
      registerTaxonomyTools(server, client);
      registerUtilityTools(server, client);
    });

    const names = (await harness.listTools()).map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      'cotc_events_month_overview',
      'cotc_get_post',
      'cotc_healthcheck',
      'cotc_list_categories',
      'cotc_list_events',
      'cotc_list_locations',
      'cotc_search_posts',
    ]);
  });

  // Annotations are asserted in tests/server-boot.test.ts instead: the test
  // harness's listTools() surfaces names only, whereas the boot test reads a
  // real tools/list response off the wire, where the hints actually appear.
});
