import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { OtcClient } from '../client.js';
import { decodeEntities } from '../normalize.js';
import { SITES } from '../sites.js';

export function registerTaxonomyTools(server: McpServer, client: OtcClient): void {
  const site = client.site;
  const label = site?.name ?? 'the configured On the Cheap site';
  const area = site?.area ?? 'the site’s area';

  server.registerTool(
    'otc_list_categories',
    {
      title: `List ${label} categories`,
      description:
        `List ${label}'s article categories with their ids and post counts (kids, music, food, festivals, art, museums, and so on). ` +
        'Use an id to filter otc_search_posts by topic. Read-only.',
      annotations: toolAnnotations({
        title: `List ${label} categories`,
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const terms = await client.listTerms('categories');
      return textResult({
        site: site?.key,
        count: terms.length,
        categories: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );

  server.registerTool(
    'otc_list_locations',
    {
      title: `List ${label} locations`,
      description:
        `List ${label}'s location taxonomy with ids and post counts — the neighbourhoods and surrounding areas of ${area}. ` +
        'Use an id to filter otc_search_posts geographically. Read-only.',
      annotations: toolAnnotations({
        title: `List ${label} locations`,
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => {
      const terms = await client.listTerms('locations');
      return textResult({
        site: site?.key,
        count: terms.length,
        locations: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );
}

export function registerUtilityTools(server: McpServer, client: OtcClient): void {
  const site = client.site;
  const label = site?.name ?? 'the configured On the Cheap site';

  server.registerTool(
    'otc_list_sites',
    {
      title: 'List the On the Cheap sites',
      description:
        'List the cities in the "on the Cheap" network, with the key used to select each one. ' +
        'This server reads ONE site at a time — the one it is configured for (see otc_healthcheck). ' +
        'Switching sites is a configuration change (OTC_SITE), not a tool argument, so use this to tell the user ' +
        'which cities exist and which one is active rather than to query another city. Read-only.',
      annotations: toolAnnotations({
        title: 'List the On the Cheap sites',
        readOnly: true,
        idempotent: true,
        openWorld: false,
      }),
      inputSchema: {},
    },
    async () =>
      textResult({
        active_site: site?.key,
        count: SITES.length,
        note: 'Set OTC_SITE to one of these keys to point the server at that city.',
        sites: SITES.map((s) => ({
          key: s.key,
          name: s.name,
          area: s.area,
          url: s.baseUrl,
          ...(s.national
            ? { national: true, note: 'National deals hub; no local events calendar.' }
            : {}),
        })),
      }),
  );

  server.registerTool(
    'otc_healthcheck',
    {
      title: `Check ${label} connectivity`,
      description:
        `Verify the configured site (${label}) is reachable and its public API is responding, and report which ` +
        'site this server is pointed at. The sites need no credentials, so this checks connectivity only. Read-only.',
      annotations: toolAnnotations({
        title: `Check ${label} connectivity`,
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {},
    },
    async () => textResult(await client.healthcheck()),
  );
}
