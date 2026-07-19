import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, PositiveInt } from '@chrischall/mcp-utils';
import type { CotcClient } from '../client.js';
import { compactPost, htmlToText, decodeEntities } from '../normalize.js';

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date, e.g. 2026-07-25');

export function registerPostTools(server: McpServer, client: CotcClient): void {
  server.registerTool(
    'cotc_search_posts',
    {
      title: 'Search Charlotte On The Cheap articles',
      description:
        'Search and filter Charlotte On The Cheap articles — free and cheap things to do, deals, festivals, kids activities and local guides. ' +
        'Filter by full-text `query`, `category` or `location` id (see cotc_list_categories / cotc_list_locations), and publication date range. ' +
        'Retired deals live in an "expired" category and are excluded by default; set `include_expired` to search them too. ' +
        'Returns slim summaries by default — use cotc_get_post for an article\'s full text. Read-only.',
      annotations: toolAnnotations({
        title: 'Search Charlotte On The Cheap articles',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        query: z.string().optional().describe('Full-text search, e.g. "free museum day"'),
        category: PositiveInt.optional().describe('Category id from cotc_list_categories'),
        location: PositiveInt.optional().describe('Location id from cotc_list_locations'),
        tag: PositiveInt.optional().describe('Tag id'),
        after: IsoDate.optional().describe('Only posts published on or after this date'),
        before: IsoDate.optional().describe('Only posts published on or before this date'),
        include_expired: z
          .boolean()
          .optional()
          .describe('Include retired/expired deals (default false)'),
        compact: z
          .boolean()
          .optional()
          .describe('Return slim summaries instead of full records (default true)'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (max 100)'),
        page: PositiveInt.optional().describe('1-based page number'),
      },
    },
    async (args) => {
      const compact = args.compact ?? true;
      const result = await client.listPosts({
        search: args.query,
        category: args.category,
        location: args.location,
        tag: args.tag,
        after: args.after,
        before: args.before,
        includeExpired: args.include_expired,
        perPage: args.per_page,
        page: args.page,
        // Ask WordPress for only the fields a summary uses, so a compact
        // search doesn't transfer ~20 KB of rendered body per post.
        fields: compact
          ? [
              'id',
              'slug',
              'date',
              'link',
              'title',
              'excerpt',
              'categories',
              'locations',
              'jetpack_featured_media_url',
            ]
          : undefined,
      });

      return textResult({
        total: result.total,
        total_pages: result.totalPages,
        returned: result.posts.length,
        posts: compact ? result.posts.map(compactPost) : result.posts,
      });
    },
  );

  server.registerTool(
    'cotc_get_post',
    {
      title: 'Get a Charlotte On The Cheap article',
      description:
        'Fetch one Charlotte On The Cheap article in full by numeric id, slug, or full URL. ' +
        'Returns the article text as readable plain text by default; set `format` to "html" for the original markup. Read-only.',
      annotations: toolAnnotations({
        title: 'Get a Charlotte On The Cheap article',
        readOnly: true,
        idempotent: true,
        openWorld: true,
      }),
      inputSchema: {
        post: z
          .string()
          .min(1)
          .describe('Post id, slug, or full charlotteonthecheap.com URL'),
        format: z
          .enum(['text', 'html'])
          .optional()
          .describe('Body format: readable text (default) or raw HTML'),
      },
    },
    async ({ post, format }) => {
      const record = await client.getPost(post);
      const body = record.content?.rendered ?? '';
      return textResult({
        id: record.id,
        slug: record.slug,
        date: record.date?.slice(0, 10),
        url: record.link,
        title: decodeEntities(record.title?.rendered),
        excerpt: htmlToText(record.excerpt?.rendered),
        categories: record.categories,
        locations: record.locations,
        tags: record.tags,
        image: record.jetpack_featured_media_url || undefined,
        content: format === 'html' ? body : htmlToText(body),
      });
    },
  );
}
