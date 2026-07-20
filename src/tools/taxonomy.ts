import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { OtcRegistry } from '../registry.js';
import { decodeEntities } from '../normalize.js';
import { SITES, SITE_ARG_DESCRIPTION, requireSite } from '../sites.js';

export function registerTaxonomyTools(server: McpServer, registry: OtcRegistry): void {
  const site = z.string().min(1).describe(SITE_ARG_DESCRIPTION);

  server.registerTool(
    'otc_list_categories',
    {
      title: 'List a city’s article categories',
      description:
        'List one "on the Cheap" site\'s article categories with their ids and post counts (kids, music, food, festivals, art, museums, and so on). ' +
        'Pass the `site` key for the city (see otc_list_sites). ' +
        'Use an id to filter otc_search_posts by topic — ids are per-site, so use them only against the site they came from. Read-only.',
      annotations: toolAnnotations({
        title: 'List a city’s article categories',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { site },
    },
    async ({ site: siteKey }) => {
      const resolved = requireSite(siteKey);
      const terms = await registry.for(resolved.key).listTerms('categories');
      return textResult({
        site: resolved.key,
        site_name: resolved.name,
        count: terms.length,
        categories: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );

  server.registerTool(
    'otc_list_locations',
    {
      title: 'List a city’s locations',
      description:
        'List one "on the Cheap" site\'s location taxonomy with ids and post counts — the neighbourhoods and surrounding areas it covers. ' +
        'Pass the `site` key for the city (see otc_list_sites). ' +
        'Use an id to filter otc_search_posts geographically — ids are per-site, so use them only against the site they came from. Read-only.',
      annotations: toolAnnotations({
        title: 'List a city’s locations',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { site },
    },
    async ({ site: siteKey }) => {
      const resolved = requireSite(siteKey);
      const terms = await registry.for(resolved.key).listTerms('locations');
      return textResult({
        site: resolved.key,
        site_name: resolved.name,
        count: terms.length,
        locations: terms.map((t) => ({ ...t, name: decodeEntities(t.name) })),
      });
    },
  );
}

export function registerUtilityTools(server: McpServer, registry: OtcRegistry): void {
  server.registerTool(
    'otc_list_sites',
    {
      title: 'List the On the Cheap sites',
      description:
        'List every city in the "on the Cheap" network with the `site` key used to select it. ' +
        'This server reads them all — every other tool takes a `site` argument, and there is no default, ' +
        'so start here when you do not already know which key covers the city the user means. Read-only.',
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
        count: SITES.length,
        note: 'Pass one of these keys as the `site` argument on any other tool.',
        sites: SITES.map((s) => ({
          key: s.key,
          name: s.name,
          area: s.area,
          url: s.baseUrl,
          ...(s.national
            ? {
                national: true,
                note: 'National deals hub; searchable, but has no local events calendar.',
              }
            : {}),
        })),
      }),
  );

  server.registerTool(
    'otc_healthcheck',
    {
      title: 'Check an On the Cheap site’s connectivity',
      description:
        'Verify one "on the Cheap" site is reachable and its public API is responding. ' +
        'Pass the `site` key for the city (see otc_list_sites). ' +
        'The sites need no credentials, so this checks connectivity only. Read-only.',
      annotations: toolAnnotations({
        title: 'Check an On the Cheap site’s connectivity',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: { site: z.string().min(1).describe(SITE_ARG_DESCRIPTION) },
    },
    async ({ site: siteKey }) => {
      const resolved = requireSite(siteKey);
      return textResult({
        site_name: resolved.name,
        ...(await registry.for(resolved.key).healthcheck()),
      });
    },
  );
}
