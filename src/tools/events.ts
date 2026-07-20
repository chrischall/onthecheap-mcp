import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { OtcRegistry } from '../registry.js';
import { SITE_ARG_DESCRIPTION, requireLocalSite } from '../sites.js';

export function registerEventTools(server: McpServer, registry: OtcRegistry): void {
  // The events tools are registered unconditionally, then refuse the national
  // hub per call via requireLocalSite. Registration cannot be gated on the site
  // any more, because the site is chosen per call rather than per deployment.
  const site = z.string().min(1).describe(SITE_ARG_DESCRIPTION);

  server.registerTool(
    'otc_list_events',
    {
      title: 'List a city’s events for a day',
      description:
        'List everything happening in an "on the Cheap" city on a given date, from that site’s events calendar — ' +
        'each with its time, price (most are free) and venue. ' +
        'Pass the `site` key for the city (see otc_list_sites) and an ISO `date` (YYYY-MM-DD); the date defaults to today. ' +
        'Set `free_only` to keep just the no-cost listings. ' +
        'The national hub has no local calendar and is not a valid `site` here. ' +
        'Use otc_get_post on a listing\'s url for the full write-up. Read-only.',
      annotations: toolAnnotations({
        title: 'List a city’s events for a day',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        site,
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date, e.g. 2026-07-25')
          .optional()
          .describe('Day to list, as ISO YYYY-MM-DD. Defaults to today.'),
        free_only: z.boolean().optional().describe('Only listings marked FREE'),
      },
    },
    async ({ site: siteKey, date, free_only }) => {
      const resolved = requireLocalSite(siteKey);
      const client = registry.for(resolved.key);
      const target = date ?? new Date().toISOString().slice(0, 10);
      const day = await client.getEventsForDate(target);
      const events = free_only ? day.events.filter((e) => e.is_free) : day.events;

      return textResult({
        site: resolved.key,
        site_name: resolved.name,
        date: day.date ?? target,
        count: events.length,
        total_on_day: day.events.length,
        free_count: day.events.filter((e) => e.is_free).length,
        events,
      });
    },
  );

  server.registerTool(
    'otc_events_month_overview',
    {
      title: 'Overview of a city’s events across a month',
      description:
        'Day-by-day overview of a whole month from an "on the Cheap" city’s events calendar: for each day, the true ' +
        'number of listings and a short preview of them. ' +
        'Pass the `site` key for the city (see otc_list_sites). ' +
        'The calendar shows at most four listings per day, so `events` is a preview while `total` is the real count — ' +
        'call otc_list_events for a specific date to get that day\'s complete schedule. ' +
        'The national hub has no local calendar and is not a valid `site` here. ' +
        'Use this to find the busiest days or scan a month at a glance. Read-only.',
      annotations: toolAnnotations({
        title: 'Overview of a city’s events across a month',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        site,
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/, 'Expected an ISO month, e.g. 2026-08')
          .optional()
          .describe('Month to summarise, as ISO YYYY-MM. Defaults to the current month.'),
      },
    },
    async ({ site: siteKey, month }) => {
      const resolved = requireLocalSite(siteKey);
      const client = registry.for(resolved.key);
      const target = month ?? new Date().toISOString().slice(0, 7);
      const days = await client.getEventsForMonth(target);

      return textResult({
        site: resolved.key,
        site_name: resolved.name,
        month: target,
        days_with_events: days.filter((d) => d.total > 0).length,
        total_events: days.reduce((sum, d) => sum + d.total, 0),
        note:
          'Each day\'s `events` list is a preview capped by the site at four entries; `total` is the day\'s real count. ' +
          'Call otc_list_events with a date for the full listing.',
        days,
      });
    },
  );
}
