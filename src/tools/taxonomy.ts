import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { CotcClient } from '../client.js';
import { decodeEntities } from '../normalize.js';

export function registerTaxonomyTools(server: McpServer, client: CotcClient): void {
  server.registerTool(
    'cotc_list_categories',
    {
      title: 'List Charlotte On The Cheap categories',
      description:
        'List the site\'s article categories with their ids and post counts (kids, music, food, festivals, art, museums, and so on). ' +
        'Use an id to filter cotc_search_posts by topic. Read-only.',
      annotations: toolAnnotations({
        title: 'List Charlotte On The Cheap categories',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const terms = await client.listTerms('categories');
      return textResult({
        count: terms.length,
        categories: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );

  server.registerTool(
    'cotc_list_locations',
    {
      title: 'List Charlotte On The Cheap locations',
      description:
        'List the site\'s location taxonomy with ids and post counts — Charlotte neighbourhoods and surrounding areas ' +
        '(uptown/center city, NoDa, South End, Lake Norman, Cabarrus and Gaston counties, and more). ' +
        'Use an id to filter cotc_search_posts geographically. Read-only.',
      annotations: toolAnnotations({
        title: 'List Charlotte On The Cheap locations',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const terms = await client.listTerms('locations');
      return textResult({
        count: terms.length,
        locations: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );
}

export function registerUtilityTools(server: McpServer, client: CotcClient): void {
  server.registerTool(
    'cotc_healthcheck',
    {
      title: 'Check Charlotte On The Cheap connectivity',
      description:
        'Verify the Charlotte On The Cheap site is reachable and its public API is responding. ' +
        'The site needs no credentials, so this checks connectivity only. Read-only.',
      annotations: toolAnnotations({
        title: 'Check Charlotte On The Cheap connectivity',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => textResult(await client.healthcheck()),
  );
}
