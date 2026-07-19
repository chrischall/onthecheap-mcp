import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { CotcClient } from '../client.js';

export function registerEventTools(server: McpServer, client: CotcClient): void {
  server.registerTool(
    'cotc_list_events',
    {
      title: 'List Charlotte events for a day',
      description:
        'List everything happening in the Charlotte area on a given date, from the Charlotte On The Cheap events calendar — ' +
        'each with its time, price (most are free) and venue. Pass an ISO `date` (YYYY-MM-DD); defaults to today. ' +
        'Set `free_only` to keep just the no-cost listings. ' +
        'Use cotc_get_post on a listing\'s url for the full write-up. Read-only.',
      annotations: toolAnnotations({
        title: 'List Charlotte events for a day',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date, e.g. 2026-07-25')
          .optional()
          .describe('Day to list, as ISO YYYY-MM-DD. Defaults to today.'),
        free_only: z.boolean().optional().describe('Only listings marked FREE'),
      },
    },
    async ({ date, free_only }) => {
      const target = date ?? new Date().toISOString().slice(0, 10);
      const day = await client.getEventsForDate(target);
      const events = free_only ? day.events.filter((e) => e.is_free) : day.events;

      return textResult({
        date: day.date ?? target,
        count: events.length,
        total_on_day: day.events.length,
        free_count: day.events.filter((e) => e.is_free).length,
        events,
      });
    },
  );

  server.registerTool(
    'cotc_events_month_overview',
    {
      title: 'Overview of Charlotte events across a month',
      description:
        'Day-by-day overview of a whole month from the Charlotte On The Cheap events calendar: for each day, the true number of ' +
        'listings and a short preview of them. ' +
        'The site\'s calendar shows at most four listings per day, so `events` is a preview while `total` is the real count — ' +
        'call cotc_list_events for a specific date to get that day\'s complete schedule. ' +
        'Use this to find the busiest days or scan a month at a glance. Read-only.',
      annotations: toolAnnotations({
        title: 'Overview of Charlotte events across a month',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/, 'Expected an ISO month, e.g. 2026-08')
          .optional()
          .describe('Month to summarise, as ISO YYYY-MM. Defaults to the current month.'),
      },
    },
    async ({ month }) => {
      const target = month ?? new Date().toISOString().slice(0, 7);
      const days = await client.getEventsForMonth(target);

      return textResult({
        month: target,
        days_with_events: days.filter((d) => d.total > 0).length,
        total_events: days.reduce((sum, d) => sum + d.total, 0),
        note:
          'Each day\'s `events` list is a preview capped by the site at four entries; `total` is the day\'s real count. ' +
          'Call cotc_list_events with a date for the full listing.',
        days,
      });
    },
  );
}
