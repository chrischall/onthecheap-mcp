import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { OtcClient } from '../src/client.js';
import { registerPostTools } from '../src/tools/posts.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from '../src/tools/taxonomy.js';

const client = new OtcClient();
const listPosts = vi.spyOn(client, 'listPosts');
const getPost = vi.spyOn(client, 'getPost');
const listTerms = vi.spyOn(client, 'listTerms');
const getEventsForDate = vi.spyOn(client, 'getEventsForDate');
const getEventsForMonth = vi.spyOn(client, 'getEventsForMonth');

let harness: Awaited<ReturnType<typeof createTestHarness>>;

async function setup() {
  harness ??= await createTestHarness((server) => {
    registerPostTools(server, client);
    registerEventTools(server, client);
    registerTaxonomyTools(server, client);
    registerUtilityTools(server, client);
  });
  return harness;
}

const parse = (result: any) => JSON.parse(result.content[0].text);

beforeEach(() => {
  vi.clearAllMocks();
});
afterAll(async () => {
  if (harness) await harness.close();
});

const POST = {
  id: 1,
  slug: 'free-museum',
  date: '2026-07-19T10:00:00',
  link: 'https://www.charlotteonthecheap.com/free-museum/',
  title: { rendered: 'Free museum day &#8212; Mint' },
  excerpt: { rendered: '<p>Free entry &amp; tours.</p>' },
  content: { rendered: '<p>Doors open at <b>10am</b>.</p>' },
  categories: [13],
  locations: [6276],
};

describe('otc_search_posts', () => {
  it('maps arguments onto the client and returns compact summaries', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [POST], total: 308, totalPages: 103 });

    const out = parse(
      await h.callTool('otc_search_posts', {
        query: 'free museum',
        category: 13,
        location: 6276,
        after: '2026-01-01',
      }),
    );

    expect(listPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'free museum',
        category: 13,
        location: 6276,
        after: '2026-01-01',
      }),
    );
    expect(out.total).toBe(308);
    expect(out.posts[0]).toMatchObject({
      id: 1,
      title: 'Free museum day — Mint',
      excerpt: 'Free entry & tours.',
    });
    expect(out.posts[0].content).toBeUndefined();
  });

  it('requests only summary fields when compact, to avoid pulling every body', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [], total: 0, totalPages: 0 });
    await h.callTool('otc_search_posts', {});
    expect(listPosts.mock.calls[0][0].fields).toContain('title');
    expect(listPosts.mock.calls[0][0].fields).not.toContain('content');
  });

  it('returns full records when compact is disabled', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [POST], total: 1, totalPages: 1 });
    const out = parse(await h.callTool('otc_search_posts', { compact: false }));
    expect(listPosts.mock.calls[0][0].fields).toBeUndefined();
    expect(out.posts[0].content.rendered).toContain('Doors open');
  });

  it('rejects a non-ISO date instead of passing it through', async () => {
    const h = await setup();
    const result: any = await h.callTool('otc_search_posts', { after: '07/25/2026' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/2026-07-25/);
    expect(listPosts).not.toHaveBeenCalled();
  });
});

describe('otc_get_post', () => {
  it('returns the body as readable text by default', async () => {
    const h = await setup();
    getPost.mockResolvedValue(POST);
    const out = parse(await h.callTool('otc_get_post', { post: 'free-museum' }));
    expect(getPost).toHaveBeenCalledWith('free-museum');
    expect(out.title).toBe('Free museum day — Mint');
    expect(out.content).toBe('Doors open at 10am.');
  });

  it('returns raw markup when asked for html', async () => {
    const h = await setup();
    getPost.mockResolvedValue(POST);
    const out = parse(await h.callTool('otc_get_post', { post: '1', format: 'html' }));
    expect(out.content).toContain('<b>10am</b>');
  });
});

describe('otc_list_events', () => {
  const DAY = {
    date: '2026-07-25',
    events: [
      { title: 'Free thing', url: 'https://x/a/', time: '7:00 pm', price: 'FREE', venue: 'Park', is_free: true },
      { title: 'Paid thing', url: 'https://x/b/', time: 'All Day', price: '$30', venue: 'Hall', is_free: false },
    ],
  };

  it('lists a given day with free counts', async () => {
    const h = await setup();
    getEventsForDate.mockResolvedValue(DAY);
    const out = parse(await h.callTool('otc_list_events', { date: '2026-07-25' }));
    expect(getEventsForDate).toHaveBeenCalledWith('2026-07-25');
    expect(out).toMatchObject({ date: '2026-07-25', count: 2, free_count: 1 });
  });

  it('filters to free listings while still reporting the day total', async () => {
    const h = await setup();
    getEventsForDate.mockResolvedValue(DAY);
    const out = parse(await h.callTool('otc_list_events', { free_only: true, date: '2026-07-25' }));
    expect(out.count).toBe(1);
    expect(out.total_on_day).toBe(2);
    expect(out.events[0].title).toBe('Free thing');
  });

  it('defaults to today when no date is given', async () => {
    const h = await setup();
    getEventsForDate.mockResolvedValue(DAY);
    await h.callTool('otc_list_events', {});
    expect(getEventsForDate.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('otc_events_month_overview', () => {
  it('reports true totals rather than the truncated preview counts', async () => {
    const h = await setup();
    getEventsForMonth.mockResolvedValue([
      { date: '2026-08-01', events: [], shown: 4, total: 27, truncated: true },
      { date: '2026-08-02', events: [], shown: 1, total: 1, truncated: false },
    ]);
    const out = parse(await h.callTool('otc_events_month_overview', { month: '2026-08' }));
    expect(out.total_events).toBe(28);
    expect(out.days_with_events).toBe(2);
    expect(out.note).toMatch(/preview/i);
  });
});

describe('taxonomy and health tools', () => {
  it('lists categories with decoded names', async () => {
    const h = await setup();
    listTerms.mockResolvedValue([{ id: 5, name: 'Food &amp; Drink', slug: 'food', count: 10 }]);
    const out = parse(await h.callTool('otc_list_categories', {}));
    expect(listTerms).toHaveBeenCalledWith('categories');
    expect(out.categories[0].name).toBe('Food & Drink');
  });

  it('lists locations', async () => {
    const h = await setup();
    listTerms.mockResolvedValue([{ id: 6276, name: 'Center City', slug: 'center-city', count: 1158 }]);
    const out = parse(await h.callTool('otc_list_locations', {}));
    expect(listTerms).toHaveBeenCalledWith('locations');
    expect(out.locations[0].slug).toBe('center-city');
  });

  it('reports health', async () => {
    const h = await setup();
    vi.spyOn(client, 'healthcheck').mockResolvedValue({
      ok: true,
      site: 'Charlotte On The Cheap',
      baseUrl: 'https://www.charlotteonthecheap.com',
    });
    expect(parse(await h.callTool('otc_healthcheck', {})).ok).toBe(true);
  });
});
