import { McpToolError } from '@chrischall/mcp-utils';

/** One site in the "on the Cheap" network. */
export interface OtcSite {
  /** Stable selector used by `OTC_SITE` and the site tools, e.g. "denver". */
  key: string;
  /** The site's own brand name. */
  name: string;
  /** The area it covers, for tool descriptions. */
  area: string;
  baseUrl: string;
  /**
   * True for the national hub, which publishes country-wide deals rather than
   * a local events calendar.
   */
  national?: boolean;
}

/**
 * The network, verified live on 2026-07-19: every entry answers the WordPress
 * REST API, carries an `expired` category and a `locations` taxonomy, and
 * (except the national hub) serves the `lotc` events calendar.
 *
 * Display names are curated rather than read from each site's WordPress title,
 * because several titles don't match their brand — miamionthecheap.com calls
 * itself "South Florida on the Cheap", and rvaonthecheap.com's title is the
 * sentence "Enjoying RVA and all it has to offer!".
 *
 * Note what is deliberately NOT stored here: each site's `expired` category id.
 * Those are per-install and differ wildly across the network (2, 3, 4, 379,
 * 840, … 16289), so they are resolved by slug at request time — see
 * `OtcClient.resolveExpiredCategoryId`.
 */
export const SITES: readonly OtcSite[] = [
  { key: 'charlotte', name: 'Charlotte On The Cheap', area: 'Charlotte, NC', baseUrl: 'https://www.charlotteonthecheap.com' },
  { key: 'denver', name: 'Mile High on the Cheap', area: 'Denver, CO', baseUrl: 'https://www.milehighonthecheap.com' },
  { key: 'atlanta', name: 'Atlanta on the Cheap', area: 'Atlanta, GA', baseUrl: 'https://atlantaonthecheap.com' },
  { key: 'chicago', name: 'Chicago on the Cheap', area: 'Chicago, IL', baseUrl: 'https://chicagoonthecheap.com' },
  { key: 'columbus', name: 'Columbus on the Cheap', area: 'Columbus, OH', baseUrl: 'https://columbusonthecheap.com' },
  { key: 'seattle', name: 'Greater Seattle on the Cheap', area: 'the Seattle–Tacoma metro area', baseUrl: 'https://greaterseattleonthecheap.com' },
  { key: 'kansascity', name: 'Kansas City on the Cheap', area: 'Kansas City', baseUrl: 'https://kansascityonthecheap.com' },
  { key: 'miami', name: 'South Florida on the Cheap', area: 'Miami, Broward and Palm Beach, FL', baseUrl: 'https://miamionthecheap.com' },
  { key: 'orlando', name: 'Orlando on the Cheap', area: 'Orlando, FL', baseUrl: 'https://orlandoonthecheap.com' },
  { key: 'portland', name: 'Portland Living on the Cheap', area: 'Portland, OR', baseUrl: 'https://portlandlivingonthecheap.com' },
  { key: 'richmond', name: 'RVA on the Cheap', area: 'Richmond, VA', baseUrl: 'https://rvaonthecheap.com' },
  { key: 'southernmaine', name: 'Southern Maine on the Cheap', area: 'Southern Maine', baseUrl: 'https://southernmaineonthecheap.com' },
  { key: 'triangle', name: 'Triangle on the Cheap', area: 'Raleigh, Durham and Chapel Hill, NC', baseUrl: 'https://triangleonthecheap.com' },
  { key: 'national', name: 'Living On The Cheap', area: 'the United States', baseUrl: 'https://livingonthecheap.com', national: true },
];

export const DEFAULT_SITE_KEY = 'charlotte';

/** Aliases people actually say, mapped to a site key. */
const ALIASES: Record<string, string> = {
  milehigh: 'denver',
  co: 'denver',
  nc: 'charlotte',
  raleigh: 'triangle',
  durham: 'triangle',
  chapelhill: 'triangle',
  rva: 'richmond',
  southflorida: 'miami',
  ftlauderdale: 'miami',
  palmbeach: 'miami',
  tacoma: 'seattle',
  kc: 'kansascity',
  maine: 'southernmaine',
  living: 'national',
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Looks a site up by key or alias. Returns undefined if there is no match. */
export function findSite(keyOrAlias: string): OtcSite | undefined {
  const wanted = normalize(keyOrAlias);
  const resolved = ALIASES[wanted] ?? wanted;
  return SITES.find((s) => s.key === resolved);
}

/**
 * Resolves a site key, failing with the valid options listed rather than
 * silently falling back — a wrong key would otherwise return another city's
 * events with no indication anything was off.
 */
export function requireSite(keyOrAlias: string): OtcSite {
  const site = findSite(keyOrAlias);
  if (!site) {
    // The valid keys go in the MESSAGE, not just the hint: this can throw
    // during client construction (a misconfigured OTC_SITE), where nothing
    // renders the hint.
    const valid = SITES.map((s) => s.key).join(', ');
    throw new McpToolError(`Unknown site "${keyOrAlias}". Valid sites: ${valid}.`, {
      hint: 'Set OTC_SITE to one of the listed keys, or OTC_BASE_URL to a site URL.',
    });
  }
  return site;
}

/** Matches a base URL back to its site, so an explicit URL still names itself. */
export function siteForBaseUrl(baseUrl: string): OtcSite | undefined {
  const host = (() => {
    try {
      return new URL(baseUrl).host.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  })();
  if (!host) return undefined;
  return SITES.find((s) => new URL(s.baseUrl).host.replace(/^www\./, '').toLowerCase() === host);
}
