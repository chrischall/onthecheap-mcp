import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { OtcClient } from '../src/client.js';
import { OtcRegistry } from '../src/registry.js';
import { registerPostTools } from '../src/tools/posts.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from '../src/tools/taxonomy.js';

// Spy on the prototype rather than one instance: the registry builds a client
// per site on demand, so a per-instance spy would only cover whichever city a
// test happened to touch first.
const listPosts = vi.spyOn(OtcClient.prototype, 'listPosts');
const getPost = vi.spyOn(OtcClient.prototype, 'getPost');
const listTerms = vi.spyOn(OtcClient.prototype, 'listTerms');
const getEventsForDate = vi.spyOn(OtcClient.prototype, 'getEventsForDate');
const getEventsForMonth = vi.spyOn(OtcClient.prototype, 'getEventsForMonth');
const healthcheck = vi.spyOn(OtcClient.prototype, 'healthcheck');
const resolveExpiredCategoryId = vi.spyOn(OtcClient.prototype, 'resolveExpiredCategoryId');

const registry = new OtcRegistry();
let harness: Awaited<ReturnType<typeof createTestHarness>>;

async function setup() {
  harness ??= await createTestHarness((server) => {
    registerPostTools(server, registry);
    registerEventTools(server, registry);
    registerTaxonomyTools(server, registry);
    registerUtilityTools(server, registry);
  });
  return harness;
}

const parse = (result: any) => JSON.parse(result.content[0].text);

beforeEach(() => {
  vi.clearAllMocks();
  resolveExpiredCategoryId.mockResolvedValue(379);
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

// Every site-scoped tool, with a minimal valid argument set besides `site`.
const SITE_SCOPED: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['otc_search_posts', {}],
  ['otc_get_post', { post: 'free-museum' }],
  ['otc_list_categories', {}],
  ['otc_list_locations', {}],
  ['otc_healthcheck', {}],
  ['otc_list_events', { date: '2026-07-25' }],
  ['otc_events_month_overview', { month: '2026-08' }],
];

describe('the site argument', () => {
  it.each(SITE_SCOPED)('is required by %s', async (tool, args) => {
    // There is deliberately no default site. Falling back to one would answer a
    // question about Denver with Charlotte's data and flag nothing.
    const h = await setup();
    const result: any = await h.callTool(tool, args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/site/i);
  });

  it.each(SITE_SCOPED)('is validated by %s before any request is made', async (tool, args) => {
    const h = await setup();
    const result: any = await h.callTool(tool, { ...args, site: 'atlantis' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unknown site/i);
    for (const spy of [listPosts, getPost, listTerms, getEventsForDate, getEventsForMonth, healthcheck]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it.each(SITE_SCOPED)('is echoed back by %s, so the answer names its city', async (tool, args) => {
    // The model has to be able to tell which city an answer came from —
    // otherwise a mis-selected site is invisible in the response.
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [], total: 0, totalPages: 0 });
    getPost.mockResolvedValue(POST);
    listTerms.mockResolvedValue([]);
    getEventsForDate.mockResolvedValue({ date: '2026-07-25', events: [] });
    getEventsForMonth.mockResolvedValue([]);
    healthcheck.mockResolvedValue({ ok: true, baseUrl: 'https://milehighonthecheap.com' });

    const out = parse(await h.callTool(tool, { ...args, site: 'denver' }));
    expect(out.site_name).toBe('Mile High on the Cheap');
  });

  it('accepts an alias', async () => {
    const h = await setup();
    listTerms.mockResolvedValue([]);
    const out = parse(await h.callTool('otc_list_categories', { site: 'rva' }));
    expect(out.site).toBe('richmond');
  });

  it('routes the request to that site’s client, not a default one', async () => {
    // The bug this whole change exists to kill: reading one city while
    // reporting another. Asserting on the echoed key alone would not catch it
    // — that key is computed separately from the client actually used. So
    // check which client the call landed on.
    const h = await setup();
    listTerms.mockResolvedValue([]);

    await h.callTool('otc_list_categories', { site: 'denver' });

    expect(listTerms.mock.contexts[0]).toBe(registry.for('denver'));
    expect(listTerms.mock.contexts[0]).not.toBe(registry.for('charlotte'));
  });
});

describe('otc_search_posts', () => {
  it('maps arguments onto the client and returns compact summaries', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [POST], total: 308, totalPages: 103 });

    const out = parse(
      await h.callTool('otc_search_posts', {
        site: 'charlotte',
        query: 'free museum',
        category: 13,
        location: 6276,
        after: '2026-01-01',
      }),
    );

    expect(listPosts.mock.calls[0][0]).toEqual(
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
    await h.callTool('otc_search_posts', { site: 'charlotte' });
    expect(listPosts.mock.calls[0][0].fields).toContain('title');
    expect(listPosts.mock.calls[0][0].fields).not.toContain('content');
  });

  it('returns full records on view:"full"', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [POST], total: 1, totalPages: 1 });
    const out = parse(await h.callTool('otc_search_posts', { site: 'charlotte', view: 'full' }));
    expect(listPosts.mock.calls[0][0].fields).toBeUndefined();
    expect(out.posts[0].content.rendered).toContain('Doors open');
  });

  it('rejects a non-ISO date instead of passing it through', async () => {
    const h = await setup();
    const result: any = await h.callTool('otc_search_posts', {
      site: 'charlotte',
      after: '07/25/2026',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/2026-07-25/);
    expect(listPosts).not.toHaveBeenCalled();
  });

  it('searches the national hub, which has articles even though it has no calendar', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [], total: 0, totalPages: 0 });
    const out = parse(await h.callTool('otc_search_posts', { site: 'national' }));
    expect(out.site).toBe('national');
  });
});

describe('otc_get_post', () => {
  it('returns the body as readable text by default', async () => {
    const h = await setup();
    getPost.mockResolvedValue(POST);
    const out = parse(await h.callTool('otc_get_post', { site: 'charlotte', post: 'free-museum' }));
    expect(getPost.mock.calls[0][0]).toBe('free-museum');
    expect(out.title).toBe('Free museum day — Mint');
    expect(out.content).toBe('Doors open at 10am.');
  });

  it('returns raw markup when asked for html', async () => {
    const h = await setup();
    getPost.mockResolvedValue(POST);
    const out = parse(
      await h.callTool('otc_get_post', { site: 'charlotte', post: '1', format: 'html' }),
    );
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
    const out = parse(await h.callTool('otc_list_events', { site: 'charlotte', date: '2026-07-25' }));
    expect(getEventsForDate.mock.calls[0][0]).toBe('2026-07-25');
    expect(out).toMatchObject({ date: '2026-07-25', count: 2, free_count: 1 });
  });

  it('filters to free listings while still reporting the day total', async () => {
    const h = await setup();
    getEventsForDate.mockResolvedValue(DAY);
    const out = parse(
      await h.callTool('otc_list_events', { site: 'charlotte', free_only: true, date: '2026-07-25' }),
    );
    expect(out.count).toBe(1);
    expect(out.total_on_day).toBe(2);
    expect(out.events[0].title).toBe('Free thing');
  });

  it('defaults to today when no date is given', async () => {
    const h = await setup();
    getEventsForDate.mockResolvedValue(DAY);
    await h.callTool('otc_list_events', { site: 'charlotte' });
    expect(getEventsForDate.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // "Today" is the city's wall-clock date, not UTC's. 02:00Z on 26 July is
  // still the evening of 25 July on every site in the network; reading the UTC
  // date there served tomorrow's calendar as today's.
  it.each([
    ['charlotte', '2026-07-26T02:00:00Z', '2026-07-25'],
    ['seattle', '2026-07-26T06:30:00Z', '2026-07-25'],
    ['denver', '2026-07-26T05:59:00Z', '2026-07-25'],
    ['charlotte', '2026-07-26T04:00:00Z', '2026-07-26'],
  ])('defaults "today" to %s’s local date at %s', async (siteKey, now, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(now));
      const h = await setup();
      getEventsForDate.mockResolvedValue({ date: null, events: [] } as any);
      await h.callTool('otc_list_events', { site: siteKey });
      expect(getEventsForDate.mock.calls[0][0]).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the national hub', () => {
  // It has no local events calendar. Its /events/ pages do respond, but carry
  // one evergreen online offer repeated on every date — worse than empty,
  // because it reads as a real listing.
  //
  // A single-city deployment used to handle this by not registering the event
  // tools at all. A global server cannot: the tools must exist for the other
  // thirteen sites, so the hub is refused per call instead.
  it('still registers the event tools, because other sites need them', async () => {
    const h = await setup();
    const names = (await h.listTools()).map((t: { name: string }) => t.name);
    expect(names).toContain('otc_list_events');
    expect(names).toContain('otc_events_month_overview');
  });

  it.each(['otc_list_events', 'otc_events_month_overview'])(
    'refuses %s rather than returning its junk calendar',
    async (tool) => {
      const h = await setup();
      const result: any = await h.callTool(tool, { site: 'national' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/no local events calendar/i);
      expect(getEventsForDate).not.toHaveBeenCalled();
      expect(getEventsForMonth).not.toHaveBeenCalled();
    },
  );

  it('is refused by its alias too, not just its key', async () => {
    const h = await setup();
    const result: any = await h.callTool('otc_list_events', { site: 'living' });
    expect(result.isError).toBe(true);
    expect(getEventsForDate).not.toHaveBeenCalled();
  });
});

describe('otc_events_month_overview', () => {
  it('reports true totals rather than the truncated preview counts', async () => {
    const h = await setup();
    getEventsForMonth.mockResolvedValue([
      { date: '2026-08-01', events: [], shown: 4, total: 27, truncated: true },
      { date: '2026-08-02', events: [], shown: 1, total: 1, truncated: false },
    ]);
    const out = parse(
      await h.callTool('otc_events_month_overview', { site: 'charlotte', month: '2026-08' }),
    );
    expect(out.total_events).toBe(28);
    expect(out.days_with_events).toBe(2);
    expect(out.note).toMatch(/preview/i);
  });

  it('defaults to the city’s current month, not UTC’s, on the last evening of a month', async () => {
    // 03:00Z on 1 August is still 31 July in Portland: the overview must stay
    // on July rather than jumping a month ahead.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-01T03:00:00Z'));
      const h = await setup();
      getEventsForMonth.mockResolvedValue([]);
      const out = parse(await h.callTool('otc_events_month_overview', { site: 'portland' }));
      expect(getEventsForMonth.mock.calls[0][0]).toBe('2026-07');
      expect(out.month).toBe('2026-07');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('request cancellation', () => {
  // Each site-scoped tool must hand the MCP request's abort signal to the
  // client, so a user cancelling the call actually drops the socket instead of
  // leaving it pinned open.
  const CALLS: ReadonlyArray<[string, Record<string, unknown>, () => unknown[]]> = [
    ['otc_search_posts', {}, () => listPosts.mock.calls[0]],
    ['otc_get_post', { post: 'free-museum' }, () => getPost.mock.calls[0]],
    ['otc_list_categories', {}, () => listTerms.mock.calls[0]],
    ['otc_list_locations', {}, () => listTerms.mock.calls[0]],
    ['otc_healthcheck', {}, () => healthcheck.mock.calls[0]],
    ['otc_list_events', { date: '2026-07-25' }, () => getEventsForDate.mock.calls[0]],
    ['otc_events_month_overview', { month: '2026-08' }, () => getEventsForMonth.mock.calls[0]],
  ];

  it.each(CALLS)('%s passes the request’s abort signal to the client', async (tool, args, callOf) => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [], total: 0, totalPages: 0 });
    getPost.mockResolvedValue(POST);
    listTerms.mockResolvedValue([]);
    getEventsForDate.mockResolvedValue({ date: '2026-07-25', events: [] });
    getEventsForMonth.mockResolvedValue([]);
    healthcheck.mockResolvedValue({ ok: true, baseUrl: 'https://www.charlotteonthecheap.com' });

    await h.callTool(tool, { ...args, site: 'charlotte' });
    expect(callOf().at(-1)).toBeInstanceOf(AbortSignal);
  });

  it('otc_search_posts also bounds the expired-category lookup', async () => {
    const h = await setup();
    listPosts.mockResolvedValue({ posts: [], total: 0, totalPages: 0 });
    await h.callTool('otc_search_posts', { site: 'charlotte' });
    expect(resolveExpiredCategoryId.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });
});

describe('taxonomy and health tools', () => {
  it('lists categories with decoded names', async () => {
    const h = await setup();
    listTerms.mockResolvedValue([{ id: 5, name: 'Food &amp; Drink', slug: 'food', count: 10 }]);
    const out = parse(await h.callTool('otc_list_categories', { site: 'charlotte' }));
    expect(listTerms.mock.calls[0][0]).toBe('categories');
    expect(out.categories[0].name).toBe('Food & Drink');
  });

  it('lists locations', async () => {
    const h = await setup();
    listTerms.mockResolvedValue([{ id: 6276, name: 'Center City', slug: 'center-city', count: 1158 }]);
    const out = parse(await h.callTool('otc_list_locations', { site: 'charlotte' }));
    expect(listTerms.mock.calls[0][0]).toBe('locations');
    expect(out.locations[0].slug).toBe('center-city');
  });

  it('reports health for the named site', async () => {
    const h = await setup();
    healthcheck.mockResolvedValue({
      ok: true,
      site: 'Charlotte On The Cheap',
      baseUrl: 'https://www.charlotteonthecheap.com',
    });
    expect(parse(await h.callTool('otc_healthcheck', { site: 'charlotte' })).ok).toBe(true);
  });
});

describe('otc_list_sites', () => {
  it('takes no site argument — it is how you discover the keys', async () => {
    const h = await setup();
    const out = parse(await h.callTool('otc_list_sites', {}));
    expect(out.count).toBeGreaterThan(1);
    expect(out.sites.map((s: { key: string }) => s.key)).toContain('denver');
  });

  it('no longer reports an "active" site, because there is not one', async () => {
    const h = await setup();
    const out = parse(await h.callTool('otc_list_sites', {}));
    expect(out.active_site).toBeUndefined();
  });

  it('flags the national hub as having no events calendar', async () => {
    const h = await setup();
    const out = parse(await h.callTool('otc_list_sites', {}));
    const national = out.sites.find((s: { key: string }) => s.key === 'national');
    expect(national.national).toBe(true);
    expect(national.note).toMatch(/no local events calendar/i);
  });
});
