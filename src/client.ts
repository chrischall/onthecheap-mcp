import { McpToolError, readEnvVar } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import {
  parseDayPage,
  parseMonthPage,
  toDatePath,
  toMonthPath,
  type CotcDay,
  type CotcMonthDay,
} from './events.js';

export const DEFAULT_BASE_URL = 'https://www.charlotteonthecheap.com';

/**
 * The site's "expired" category. Retired deals are recategorised into it
 * rather than deleted, so listings exclude it unless a caller opts in.
 */
export const EXPIRED_CATEGORY_ID = 6193;

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

export interface CotcClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Reads Charlotte On The Cheap.
 *
 * The site exposes an unauthenticated WordPress REST API, so there are no
 * credentials to configure and every read is a plain server-side fetch. The
 * events plugin is the exception: it is deliberately not registered with the
 * REST API, so listings are parsed from its server-rendered HTML.
 */
export class CotcClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CotcClientOptions = {}) {
    this.baseUrl = (
      opts.baseUrl ??
      readEnvVar('COTC_BASE_URL') ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
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
      'user-agent': `charlotteonthecheap-mcp/${VERSION} (+https://github.com/chrischall/charlotteonthecheap-mcp)`,
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
      throw new McpToolError(`Charlotte On The Cheap returned HTTP ${res.status} for ${url}`, {
        hint:
          res.status === 404
            ? 'The path does not exist — check the id, slug or date.'
            : 'The site may be briefly unavailable; retry shortly.',
      });
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
    if (!params.includeExpired) q.set('categories_exclude', String(EXPIRED_CATEGORY_ID));
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
      throw new McpToolError(`Found no post matching "${idOrSlugOrUrl}".`, {
        hint: 'Pass a numeric post id, a slug, or a full charlotteonthecheap.com URL.',
      });
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
  async getEventsForDate(isoDate: string): Promise<CotcDay> {
    const path = toDatePath(isoDate); // validates before any request is made
    return parseDayPage(await this.getHtml(`/events/view-date/${path}/`));
  }

  /** Per-day summaries for a month; each day's listing is a truncated preview. */
  async getEventsForMonth(isoMonth: string): Promise<CotcMonthDay[]> {
    const path = toMonthPath(isoMonth);
    return parseMonthPage(await this.getHtml(`/events/calendar/${path}/`));
  }

  async healthcheck(): Promise<{ ok: boolean; site?: string; baseUrl: string; error?: string }> {
    try {
      const { data } = await this.getJson<{ name?: string }>('/wp-json/');
      return { ok: true, site: data.name, baseUrl: this.baseUrl };
    } catch (e) {
      return {
        ok: false,
        baseUrl: this.baseUrl,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
