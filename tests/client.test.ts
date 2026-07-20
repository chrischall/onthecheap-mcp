import { describe, it, expect, vi } from 'vitest';
import { OtcClient } from '../src/client.js';

/** The `expired` category id this fixture site reports for the slug lookup. */
const EXPIRED_ID = 6193;

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Captures the URLs a client requests, replying with canned responses.
 *
 * The `expired` category lookup is answered separately from the queue: the
 * client resolves that id by slug before a default listing, so folding it into
 * the response sequence would make every test's ordering depend on it.
 */
function stubFetch(...responses: Response[]) {
  const calls: string[] = [];
  let i = 0;
  const impl = vi.fn(async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/categories') && url.includes('slug=expired')) {
      return jsonResponse([{ id: EXPIRED_ID }]);
    }
    // Clone: a Response body can only be read once, and a queued response is
    // reused when a test makes more calls than it enqueued.
    return responses[Math.min(i++, responses.length - 1)].clone();
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

/** The request the assertions care about, ignoring the expired-slug lookup. */
const postCalls = (calls: string[]) => calls.filter((c) => !c.includes('slug=expired'));

const client = (impl: typeof fetch) => new OtcClient({ fetchImpl: impl });

describe('listPosts', () => {
  it('requests the WP posts endpoint and returns items plus the header total', async () => {
    const { impl, calls } = stubFetch(
      jsonResponse([{ id: 1, slug: 'a', title: { rendered: 'A' } }], { 'x-wp-total': '8547' }),
    );
    const res = await client(impl).listPosts({ search: 'free concert' });

    expect(postCalls(calls)[0]).toContain('/wp-json/wp/v2/posts');
    expect(postCalls(calls)[0]).toContain('search=free+concert');
    expect(res.total).toBe(8547);
    expect(res.posts).toHaveLength(1);
  });

  it('resolves the "expired" category by slug and excludes it by default', async () => {
    // Roughly a third of a site's posts are expired deals; returning them by
    // default would surface offers that no longer exist as if they were live.
    // The id is looked up by slug because it differs on every site in the
    // network — a hardcoded id silently disables the filter elsewhere.
    const { impl, calls } = stubFetch(jsonResponse([]));
    await client(impl).listPosts({});
    expect(calls.some((c) => c.includes('slug=expired'))).toBe(true);
    expect(postCalls(calls)[0]).toContain(`categories_exclude=${EXPIRED_ID}`);
  });

  it('caches the expired lookup instead of repeating it per search', async () => {
    const { impl, calls } = stubFetch(jsonResponse([]));
    const c = client(impl);
    await c.listPosts({});
    await c.listPosts({ search: 'again' });
    expect(calls.filter((x) => x.includes('slug=expired'))).toHaveLength(1);
  });

  it('omits the exclusion when a site has no expired category', async () => {
    // Absent the category, filtering on a guessed id would exclude something
    // arbitrary; returning everything unfiltered is the honest fallback.
    const calls: string[] = [];
    const impl = vi.fn(async (input: any) => {
      const url = String(input);
      calls.push(url);
      return jsonResponse([]);
    }) as unknown as typeof fetch;
    await new OtcClient({ fetchImpl: impl }).listPosts({});
    expect(postCalls(calls)[0]).not.toContain('categories_exclude');
  });

  it('includes expired posts when explicitly asked', async () => {
    const { impl, calls } = stubFetch(jsonResponse([]));
    await client(impl).listPosts({ includeExpired: true });
    expect(calls.some((c) => c.includes('slug=expired'))).toBe(false);
    expect(postCalls(calls)[0]).not.toContain('categories_exclude');
  });

  it('passes taxonomy and date filters through', async () => {
    const { impl, calls } = stubFetch(jsonResponse([]));
    await client(impl).listPosts({
      category: 4,
      location: 6276,
      after: '2026-01-01',
      before: '2026-06-30',
      perPage: 25,
      page: 2,
    });
    const url = postCalls(calls)[0];
    expect(url).toContain('categories=4');
    expect(url).toContain('locations=6276');
    expect(url).toContain('after=2026-01-01T00%3A00%3A00');
    expect(url).toContain('before=2026-06-30T23%3A59%3A59');
    expect(url).toContain('per_page=25');
    expect(url).toContain('page=2');
  });

  it('treats a missing total header as an unknown total, not zero', async () => {
    const { impl } = stubFetch(jsonResponse([{ id: 1 }]));
    expect((await client(impl).listPosts({})).total).toBeNull();
  });
});

describe('getPost', () => {
  it('looks a numeric id up directly', async () => {
    const { impl, calls } = stubFetch(jsonResponse({ id: 42, slug: 'x' }));
    await client(impl).getPost('42');
    expect(calls[0]).toMatch(/\/posts\/42(\?|$)/);
  });

  it('resolves a slug through a filtered collection query', async () => {
    const { impl, calls } = stubFetch(jsonResponse([{ id: 7, slug: 'dippin-dots' }]));
    const post = await client(impl).getPost('dippin-dots');
    expect(calls[0]).toContain('slug=dippin-dots');
    expect(post.id).toBe(7);
  });

  it('accepts a full post URL by reducing it to its slug', async () => {
    const { impl, calls } = stubFetch(jsonResponse([{ id: 7, slug: 'dippin-dots' }]));
    await client(impl).getPost('https://www.charlotteonthecheap.com/dippin-dots/');
    expect(calls[0]).toContain('slug=dippin-dots');
  });

  it('raises a helpful error when a slug matches nothing', async () => {
    const { impl } = stubFetch(jsonResponse([]));
    await expect(client(impl).getPost('no-such-post')).rejects.toThrow(/no post/i);
  });

  it('names the configured site in the not-found error, not a fixed one', async () => {
    // A URL from a sister site won't resolve here, so pointing the caller at
    // some other city's domain is actively misleading.
    const { impl } = stubFetch(jsonResponse([]));
    const denver = new OtcClient({ site: 'denver', fetchImpl: impl });
    await expect(denver.getPost('no-such-post')).rejects.toThrow(/Mile High on the Cheap/);
    await expect(denver.getPost('no-such-post')).rejects.not.toThrow(/charlotteonthecheap/);
  });
});

describe('error handling', () => {
  it('surfaces a non-2xx response as a tool error carrying the status', async () => {
    const { impl } = stubFetch(new Response('nope', { status: 500 }));
    await expect(client(impl).listPosts({})).rejects.toThrow(/500/);
  });

  it('does not try to JSON-parse an HTML error page', async () => {
    // A WAF or maintenance page answers 200 with HTML; blind JSON.parse would
    // throw an opaque SyntaxError instead of something actionable.
    const { impl } = stubFetch(
      new Response('<html>maintenance</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(client(impl).listPosts({})).rejects.toThrow(/unexpected non-JSON/i);
  });
});

describe('events', () => {
  it('fetches a day using the site’s M-D-YYYY path and parses the listings', async () => {
    const html = `<h2 class="lotc-event">Saturday, July 25, 2026</h2>
      <div class="lotc-v2 row event"><div><h3><a href="https://x/e/">E</a></h3>
      <p class="meta"><strong>7:00 pm</strong> | <strong>FREE</strong> | Venue</p></div></div>`;
    const { impl, calls } = stubFetch(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const day = await client(impl).getEventsForDate('2026-07-25');

    expect(calls[0]).toContain('/events/view-date/7-25-2026/');
    expect(day.date).toBe('2026-07-25');
    expect(day.events[0]).toMatchObject({ title: 'E', price: 'FREE' });
  });

  it('fetches a month using the MM-YYYY calendar path', async () => {
    const { impl, calls } = stubFetch(
      new Response('<table></table>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await client(impl).getEventsForMonth('2026-08');
    expect(calls[0]).toContain('/events/calendar/08-2026/');
  });

  it('rejects a malformed date before issuing a request', async () => {
    // The site answers an ISO path with a 1970 page rather than an error, so a
    // bad format must be caught here or it returns confidently wrong data.
    const { impl, calls } = stubFetch(jsonResponse([]));
    await expect(client(impl).getEventsForDate('07/25/2026')).rejects.toThrow(/invalid date/i);
    expect(calls).toHaveLength(0);
  });
});

describe('healthcheck', () => {
  it('reports reachability and the site name', async () => {
    const { impl } = stubFetch(jsonResponse({ name: 'Charlotte On The Cheap', url: 'https://x' }));
    const health = await client(impl).healthcheck();
    expect(health).toMatchObject({ ok: true, site: 'Charlotte On The Cheap' });
  });

  it('reports not-ok instead of throwing when the site is unreachable', async () => {
    const impl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const health = await client(impl).healthcheck();
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/ECONNREFUSED/);
  });
});
