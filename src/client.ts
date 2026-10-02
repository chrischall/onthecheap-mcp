import { EdgeBlockedError, McpToolError, detectEdgeBlock, readEnvVar } from '@chrischall/mcp-utils';
import {
  runCredentialHealthcheck,
  type CredentialHealthcheckResult,
  type RegisterCredentialHealthcheckToolArgs,
} from '@chrischall/mcp-utils/healthcheck';
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
  siteHostKey,
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

/**
 * How long one request may take before it is abandoned. A site that accepts
 * the connection and then stalls (a WAF tarpit, an overloaded WordPress, a slow
 * calendar render) would otherwise pin the tool call open until the MCP
 * client's own timeout — and leave healthcheck, which exists to diagnose
 * exactly that, hanging too.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** A site answered with a non-2xx that is not a CDN/WAF block; carries the status. */
export class OtcHttpError extends McpToolError {
  constructor(
    readonly status: number,
    message: string,
    hint: string,
  ) {
    super(message, { hint });
    this.name = 'OtcHttpError';
  }
}

/** The site did not answer within the client's timeout. */
export class OtcTimeoutError extends McpToolError {
  constructor(message: string, opts: { hint: string; cause: unknown }) {
    super(message, opts);
    this.name = 'OtcTimeoutError';
  }
}

/** The site could not be reached at all (DNS, refused, reset). */
export class OtcUnreachableError extends McpToolError {
  constructor(message: string, opts: { hint: string; cause?: unknown }) {
    super(message, opts);
    this.name = 'OtcUnreachableError';
  }
}

/**
 * What `otc_healthcheck` reports: the shared credential-healthcheck envelope
 * (`ok`, `credential`, `probe`, `error.kind`, `hint`) plus which site was read.
 * `credential` always reads `resolved: true` from source `none-required` —
 * these sites are keyless, so a failure is never a credential problem.
 */
export type OtcHealth = CredentialHealthcheckResult & {
  site?: string;
  siteKey?: string;
  baseUrl: string;
};

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
  /** Per-request timeout; defaults to `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
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
  private readonly timeoutMs: number;
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
    // reference. Node tolerates `const f = globalThis.fetch; f(url)`, but some
    // sandboxed runtimes throw "Illegal invocation: function called with
    // incorrect `this` reference" — there, every request would fail. The
    // wrapper keeps `this` bound to
    // globalThis and still picks up a test spy installed on globalThis.fetch.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private get headers(): Record<string, string> {
    return {
      // Identify the client rather than impersonating a browser: this is a
      // public API being read as intended, not an evasion.
      'user-agent': `onthecheap-mcp/${VERSION} (+https://github.com/chrischall/onthecheap-mcp)`,
      accept: 'application/json, text/html;q=0.9',
    };
  }

  /**
   * Fetches a URL and reads its body, bounded by the client's timeout and by
   * the caller's `signal` (the MCP request's cancellation), whichever fires
   * first. The body read shares the signal: a site can stall mid-body as
   * easily as before the headers.
   */
  private async request(url: string, signal?: AbortSignal): Promise<{ res: Response; body: string }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
    let res: Response;
    let body: string;
    try {
      if (signal?.aborted) throw signal.reason;
      res = await this.fetchImpl(url, { headers: this.headers, signal: combined });
      body = await res.text();
    } catch (e) {
      if (signal?.aborted) {
        throw new McpToolError(`Request to ${this.site?.name ?? this.baseUrl} was cancelled.`, {
          cause: e,
        });
      }
      if (timeout.aborted) {
        throw new OtcTimeoutError(
          `${this.site?.name ?? this.baseUrl} did not respond within ${this.timeoutMs / 1000}s.`,
          { hint: 'The site may be overloaded or briefly unavailable; retry shortly.', cause: e },
        );
      }
      throw new OtcUnreachableError(
        `Could not reach ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
        { hint: 'Check network connectivity; the site needs no credentials.', cause: e },
      );
    }
    // A CDN/WAF refusal or challenge page is not the site's answer. Judged on
    // every response, not just non-2xx: a challenge can arrive as 200, and the
    // events pages are parsed from HTML, where it would read as an empty day
    // (chrischall/mcp-host#1015).
    const edge = detectEdgeBlock({ body, headers: res.headers, status: res.status });
    if (edge) {
      throw new EdgeBlockedError(res.status, edge.vendor, {
        service: this.site?.name ?? this.baseUrl,
        method: 'GET',
        path: new URL(url).pathname,
      });
    }
    if (!res.ok) {
      throw new OtcHttpError(
        res.status,
        `${this.site?.name ?? this.baseUrl} returned HTTP ${res.status} for ${url}`,
        res.status === 404
          ? 'The path does not exist — check the id, slug or date.'
          : 'The site may be briefly unavailable; retry shortly.',
      );
    }
    return { res, body };
  }

  /**
   * Fetches JSON, refusing to parse a non-JSON body.
   *
   * A maintenance or WAF page answers 200 with HTML; parsing it blindly would
   * surface an opaque SyntaxError instead of something a caller can act on.
   */
  private async getJson<T>(
    path: string,
    query?: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<{ data: T; res: Response }> {
    const qs = query && [...query].length ? `?${query}` : '';
    const { res, body } = await this.request(`${this.baseUrl}${path}${qs}`, signal);
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

  private async getHtml(path: string, signal?: AbortSignal): Promise<string> {
    return (await this.request(`${this.baseUrl}${path}`, signal)).body;
  }

  /**
   * Looks up this site's `expired` category id from its slug, caching the
   * result (including "this site has none") for the client's lifetime.
   *
   * Resolving rather than hardcoding is what makes the exclusion correct on
   * every site in the network — see `EXPIRED_CATEGORY_SLUG`.
   */
  async resolveExpiredCategoryId(signal?: AbortSignal): Promise<number | null> {
    if (this.expiredCategoryId !== undefined) return this.expiredCategoryId;
    const q = new URLSearchParams({ slug: EXPIRED_CATEGORY_SLUG, _fields: 'id', per_page: '1' });
    const { data } = await this.getJson<WpTerm[]>('/wp-json/wp/v2/categories', q, signal);
    this.expiredCategoryId = Array.isArray(data) && data.length ? data[0].id : null;
    return this.expiredCategoryId;
  }

  async listPosts(params: ListPostsParams, signal?: AbortSignal): Promise<ListPostsResult> {
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
      const expiredId = await this.resolveExpiredCategoryId(signal);
      if (expiredId !== null) q.set('categories_exclude', String(expiredId));
    }
    if (params.fields?.length) q.set('_fields', params.fields.join(','));

    const { data, res } = await this.getJson<WpPost[]>('/wp-json/wp/v2/posts', q, signal);
    const header = (name: string) => {
      const raw = res.headers.get(name);
      return raw === null ? null : Number(raw);
    };
    return { posts: data, total: header('x-wp-total'), totalPages: header('x-wp-totalpages') };
  }

  /** Looks up a post by numeric id, slug, or full URL. */
  async getPost(idOrSlugOrUrl: string, signal?: AbortSignal): Promise<WpPost> {
    const ref = idOrSlugOrUrl.trim();

    // A full URL names its own site. Reducing it to a slug and querying
    // whichever site the caller happened to pass silently returns a DIFFERENT
    // city's article whenever the slug collides — and slugs collide constantly
    // across these sites ("free-museum-day" exists in most of them). The tool
    // description already promises "a full URL must match the site you name";
    // this enforces it instead of hoping.
    this.assertSameSite(ref, idOrSlugOrUrl);

    if (/^\d+$/.test(ref)) {
      const { data } = await this.getJson<WpPost>(`/wp-json/wp/v2/posts/${ref}`, undefined, signal);
      return data;
    }

    const slug = this.toSlug(ref);
    const q = new URLSearchParams({ slug, per_page: '1' });
    const { data } = await this.getJson<WpPost[]>('/wp-json/wp/v2/posts', q, signal);
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

  /**
   * Reject a full URL belonging to a different On the Cheap site.
   *
   * Non-URL refs (ids, slugs) are unaffected — they carry no site of their own,
   * so the caller's `site` is the only signal and is taken at face value.
   */
  private assertSameSite(ref: string, original: string): void {
    if (!/^https?:\/\//i.test(ref)) return;
    // siteHostKey, not a raw host comparison: these sites all serve both the
    // bare and the `www.` host, and SITES records only one form each. Comparing
    // raw hosts rejected the other form of the SAME site — and then named it as
    // the other site, because siteForBaseUrl below DOES strip `www.`, so the
    // message read "belongs to Mile High on the Cheap, but you asked for Mile
    // High on the Cheap". Both sides normalize through the one helper now.
    const refHost = siteHostKey(ref);
    if (!refHost) return; // unparseable: fall through to the existing slug handling
    if (refHost === siteHostKey(this.baseUrl)) return;
    const named = this.site?.name ?? this.baseUrl;
    // Show the canonical host from SITES, not the stripped comparison key —
    // "pass a URL on www.milehighonthecheap.com" is the form we actually record.
    const ownHost = new URL(this.baseUrl).host;
    const other = siteForBaseUrl(`https://${refHost}`);
    throw new McpToolError(
      `The URL "${original}" belongs to ${other?.name ?? refHost}, but you asked for ${named}.`,
      {
        hint: other
          ? `Pass site: "${other.key}" to read it, or give a slug/id from ${named}.`
          : `Pass a URL on ${ownHost}, or a slug/id from ${named}.`,
      },
    );
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
  async listTerms(
    taxonomy: 'categories' | 'tags' | 'locations',
    perPage = 100,
    signal?: AbortSignal,
  ): Promise<WpTerm[]> {
    const q = new URLSearchParams({
      per_page: String(perPage),
      orderby: 'count',
      order: 'desc',
      _fields: 'id,name,slug,count',
    });
    const { data } = await this.getJson<WpTerm[]>(`/wp-json/wp/v2/${taxonomy}`, q, signal);
    return data;
  }

  /** Full listings for one day. */
  async getEventsForDate(isoDate: string, signal?: AbortSignal): Promise<OtcDay> {
    const path = toDatePath(isoDate); // validates before any request is made
    return parseDayPage(await this.getHtml(`/events/view-date/${path}/`, signal));
  }

  /** Per-day summaries for a month; each day's listing is a truncated preview. */
  async getEventsForMonth(isoMonth: string, signal?: AbortSignal): Promise<OtcMonthDay[]> {
    const path = toMonthPath(isoMonth);
    return parseMonthPage(await this.getHtml(`/events/calendar/${path}/`, signal));
  }

  /**
   * One round-trip to the site's REST index, classified by mcp-utils' shared
   * healthcheck ladder so a failure carries `error.kind`: `edge_blocked`,
   * `http`, `timeout`, `transport` (or `unknown`). The sites are keyless, so
   * there is no credential to resolve and no credential arm can fire: an
   * origin 401/403 is reported as `http`.
   */
  async healthcheck(signal?: AbortSignal): Promise<OtcHealth> {
    const host = new URL(this.baseUrl).host;
    const name = this.site?.name ?? host;
    let siteName: string | undefined;
    const args: Omit<RegisterCredentialHealthcheckToolArgs, 'server'> = {
      prefix: 'otc',
      hostLabel: host,
      probePath: '/wp-json/',
      resolveCredential: async () => ({ source: 'none-required' }),
      probeFn: async () => {
        const { data } = await this.getJson<{ name?: string }>('/wp-json/', undefined, signal);
        siteName = data.name;
      },
      classifyThrown: (err) => {
        if (err instanceof EdgeBlockedError) return undefined; // the shared ladder names it
        if (err instanceof OtcTimeoutError) return { kind: 'timeout' };
        if (err instanceof OtcUnreachableError) return { kind: 'transport' };
        // Keyless: an origin 401/403 is not a rejected credential.
        if (err instanceof OtcHttpError) return { kind: 'http' };
        return undefined;
      },
      // The shared copy speaks of a credential; these sites have none.
      hints: {
        ok: `${name} is reachable and its public API answered. These sites need no credentials; if a tool still fails, the problem is that tool.`,
        edge_blocked: `${name} refused the request at its CDN/WAF before it reached the site. This is usually a block on this host's IP address or request fingerprint, not something to fix here — retry later or from a different network.`,
        http: `${name} answered with an error status. A 404 usually means the probe path changed; a 5xx means the site is briefly unavailable — retry shortly.`,
        timeout: `${name} did not answer in time. Usually transient — retry; if it persists the site is overloaded or unreachable from here.`,
        transport: `Could not reach ${name} at all. Check network egress.`,
        unknown: 'Unexpected failure — see error.message.',
      },
    };
    // `server` is only read by registerCredentialHealthcheckTool; the runner
    // never touches it, and this client has no server to hand it.
    const result = await runCredentialHealthcheck(args as RegisterCredentialHealthcheckToolArgs);
    const body = JSON.parse(result.content[0].text) as CredentialHealthcheckResult;
    return { ...body, site: siteName, siteKey: this.site?.key, baseUrl: this.baseUrl };
  }
}
