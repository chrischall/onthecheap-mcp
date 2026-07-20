import { McpToolError, readEnvVar } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import {
  parseDayPage,
  parseMonthPage,
  toDatePath,
  toMonthPath,
  type OtcDay,
  type OtcMonthDay,
} from './events.js';
import {
  DEFAULT_SITE_KEY,
  requireSite,
  siteForBaseUrl,
  type OtcSite,
} from './sites.js';

/**
 * The slug every site in the network uses for retired deals. Posts are
 * recategorised into it rather than deleted, so listings exclude it unless a
 * caller opts in.
 *
 * The slug is stable across the network; the category **id behind it is not**
 * — it differs on every install (2, 3, 4, 379, … 16289). Hardcoding one site's
 * id silently disables the filter everywhere else: pointed at Denver, an id
 * taken from Charlotte matched nothing and served 4,187 dead deals as live.
 * So the id is resolved from this slug at request time and cached per client.
 */
export const EXPIRED_CATEGORY_SLUG = 'expired';

export interface ListPostsParams {
  search?: string;
  category?: number;
  location?: number;
  tag?: number;
  /** Inclusive ISO date (YYYY-MM-DD) lower bound on publication date. */
  after?: string;
  /** Inclusive ISO date (YYYY-MM-DD) upper bound on publication date. */
  before?: string;
  perPage?: number;
  page?: number;
  includeExpired?: boolean;
  /** Restrict the response to these WP fields (a slimmer payload). */
  fields?: string[];
}

export interface ListPostsResult {
  posts: WpPost[];
  /** Total matching posts, or null when the site omits the count header. */
  total: number | null;
  totalPages: number | null;
}

export interface WpPost {
  id: number;
  slug?: string;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
  tags?: number[];
  locations?: number[];
  jetpack_featured_media_url?: string;
  [key: string]: unknown;
}

export interface WpTerm {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface OtcClientOptions {
  /** Site key or alias, e.g. "denver". Ignored when `baseUrl` is given. */
  site?: string;
  /** Explicit base URL, overriding `site`. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Reads one site in the "on the Cheap" network.
 *
 * Every site exposes an unauthenticated WordPress REST API, so there are no
 * credentials to configure and every read is a plain server-side fetch. The
 * events plugin is the exception: it is deliberately not registered with the
 * REST API, so listings are parsed from its server-rendered HTML.
 *
 * Which site is read comes from (in order) an explicit `baseUrl`, an explicit
 * `site` key, `OTC_BASE_URL`, `OTC_SITE`, then the default.
 */
export class OtcClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** The network entry being read, when the base URL matches a known site. */
  readonly site: OtcSite | undefined;
  /** Cached `expired` category id: number when found, null when the site has none. */
  private expiredCategoryId: number | null | undefined;

  constructor(opts: OtcClientOptions = {}) {
    const explicitUrl = opts.baseUrl ?? readEnvVar('OTC_BASE_URL');
    const siteKey = opts.site ?? readEnvVar('OTC_SITE');
    this.baseUrl = (
      explicitUrl ?? requireSite(siteKey ?? DEFAULT_SITE_KEY).baseUrl
    ).replace(/\/+$/, '');
    this.site = siteForBaseUrl(this.baseUrl);
    // Call the global fetch as a method of globalThis, never as a detached
    // reference. Node tolerates `const f = globalThis.fetch; f(url)`, but the
    // Cloudflare Workers runtime (workerd) throws "Illegal invocation:
    // function called with incorrect `this` reference" — so the hosted
    // connector's every request would fail. The wrapper keeps `this` bound to
    // globalThis and still picks up a test spy installed on globalThis.fetch.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  private get headers(): Record<string, string> {
    return {
      // Identify the client rather than impersonating a browser: this is a
      // public API being read as intended, not an evasion.
      'user-agent': `onthecheap-mcp/${VERSION} (+https://github.com/chrischall/onthecheap-mcp)`,
      accept: 'application/json, text/html;q=0.9',
    };
  }

  private async request(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: this.headers });
    } catch (e) {
      throw new McpToolError(
        `Could not reach ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
        { hint: 'Check network connectivity; the site needs no credentials.' },
      );
    }
    if (!res.ok) {
      throw new McpToolError(
        `${this.site?.name ?? this.baseUrl} returned HTTP ${res.status} for ${url}`,
        {
        hint:
          res.status === 404
            ? 'The path does not exist — check the id, slug or date.'
            : 'The site may be briefly unavailable; retry shortly.',
        },
      );
    }
    return res;
  }

  /**
   * Fetches JSON, refusing to parse a non-JSON body.
   *
   * A maintenance or WAF page answers 200 with HTML; parsing it blindly would
   * surface an opaque SyntaxError instead of something a caller can act on.
   */
  private async getJson<T>(path: string, query?: URLSearchParams): Promise<{ data: T; res: Response }> {
    const qs = query && [...query].length ? `?${query}` : '';
    const res = await this.request(`${this.baseUrl}${path}${qs}`);
    const body = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new McpToolError(
        `Unexpected non-JSON response from ${path} (content-type: ${contentType || 'none'}).`,
        { hint: 'The site may be serving a maintenance or challenge page; retry shortly.' },
      );
    }
    try {
      return { data: JSON.parse(body) as T, res };
    } catch {
      throw new McpToolError(`Unexpected non-JSON body from ${path}.`, {
        hint: 'The site may be serving a maintenance page; retry shortly.',
      });
    }
  }

  private async getHtml(path: string): Promise<string> {
    return (await this.request(`${this.baseUrl}${path}`)).text();
  }

  /**
   * Looks up this site's `expired` category id from its slug, caching the
   * result (including "this site has none") for the client's lifetime.
   *
   * Resolving rather than hardcoding is what makes the exclusion correct on
   * every site in the network — see `EXPIRED_CATEGORY_SLUG`.
   */
  async resolveExpiredCategoryId(): Promise<number | null> {
    if (this.expiredCategoryId !== undefined) return this.expiredCategoryId;
    const q = new URLSearchParams({ slug: EXPIRED_CATEGORY_SLUG, _fields: 'id', per_page: '1' });
    const { data } = await this.getJson<WpTerm[]>('/wp-json/wp/v2/categories', q);
    this.expiredCategoryId = Array.isArray(data) && data.length ? data[0].id : null;
    return this.expiredCategoryId;
  }

  async listPosts(params: ListPostsParams): Promise<ListPostsResult> {
    const q = new URLSearchParams();
    q.set('per_page', String(params.perPage ?? 20));
    if (params.page) q.set('page', String(params.page));
    if (params.search) q.set('search', params.search);
    if (params.category !== undefined) q.set('categories', String(params.category));
    if (params.location !== undefined) q.set('locations', String(params.location));
    if (params.tag !== undefined) q.set('tags', String(params.tag));
    // WP compares against a full timestamp, so widen a bare date to cover the
    // whole day at each end — otherwise `before` drops that day's own posts.
    if (params.after) q.set('after', `${params.after}T00:00:00`);
    if (params.before) q.set('before', `${params.before}T23:59:59`);
    if (!params.includeExpired) {
      const expiredId = await this.resolveExpiredCategoryId();
      if (expiredId !== null) q.set('categories_exclude', String(expiredId));
    }
    if (params.fields?.length) q.set('_fields', params.fields.join(','));

    const { data, res } = await this.getJson<WpPost[]>('/wp-json/wp/v2/posts', q);
    const header = (name: string) => {
      const raw = res.headers.get(name);
      return raw === null ? null : Number(raw);
    };
    return { posts: data, total: header('x-wp-total'), totalPages: header('x-wp-totalpages') };
  }

  /** Looks up a post by numeric id, slug, or full URL. */
  async getPost(idOrSlugOrUrl: string): Promise<WpPost> {
    const ref = idOrSlugOrUrl.trim();

    if (/^\d+$/.test(ref)) {
      const { data } = await this.getJson<WpPost>(`/wp-json/wp/v2/posts/${ref}`);
      return data;
    }

    const slug = this.toSlug(ref);
    const q = new URLSearchParams({ slug, per_page: '1' });
    const { data } = await this.getJson<WpPost[]>('/wp-json/wp/v2/posts', q);
    if (!data.length) {
      throw new McpToolError(
        `Found no post matching "${idOrSlugOrUrl}" on ${this.site?.name ?? this.baseUrl}.`,
        {
          // Name the site actually being read, not a fixed one: a URL from a
          // sister site won't resolve here, and pointing the caller at the
          // wrong domain is exactly the mistake this server avoids elsewhere.
          hint: `Pass a numeric post id, a slug, or a full ${this.baseUrl} URL.`,
        },
      );
    }
    return data[0];
  }

  private toSlug(ref: string): string {
    if (!/^https?:\/\//i.test(ref)) return ref.replace(/^\/+|\/+$/g, '');
    try {
      const segments = new URL(ref).pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] ?? ref;
    } catch {
      return ref;
    }
  }

  /** Lists terms of a taxonomy ("categories", "tags" or "locations"). */
  async listTerms(taxonomy: 'categories' | 'tags' | 'locations', perPage = 100): Promise<WpTerm[]> {
    const q = new URLSearchParams({
      per_page: String(perPage),
      orderby: 'count',
      order: 'desc',
      _fields: 'id,name,slug,count',
    });
    const { data } = await this.getJson<WpTerm[]>(`/wp-json/wp/v2/${taxonomy}`, q);
    return data;
  }

  /** Full listings for one day. */
  async getEventsForDate(isoDate: string): Promise<OtcDay> {
    const path = toDatePath(isoDate); // validates before any request is made
    return parseDayPage(await this.getHtml(`/events/view-date/${path}/`));
  }

  /** Per-day summaries for a month; each day's listing is a truncated preview. */
  async getEventsForMonth(isoMonth: string): Promise<OtcMonthDay[]> {
    const path = toMonthPath(isoMonth);
    return parseMonthPage(await this.getHtml(`/events/calendar/${path}/`));
  }

  async healthcheck(): Promise<{
    ok: boolean;
    site?: string;
    siteKey?: string;
    baseUrl: string;
    error?: string;
  }> {
    try {
      const { data } = await this.getJson<{ name?: string }>('/wp-json/');
      return { ok: true, site: data.name, siteKey: this.site?.key, baseUrl: this.baseUrl };
    } catch (e) {
      return {
        ok: false,
        siteKey: this.site?.key,
        baseUrl: this.baseUrl,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
