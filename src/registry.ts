import { OtcClient } from './client.js';
import { requireSite } from './sites.js';

export interface OtcRegistryOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Hands out one `OtcClient` per site in the network, building each on first use
 * and reusing it thereafter.
 *
 * This exists because the server is global — every tool takes a `site`
 * argument, so a single pinned client is no longer enough — but a fresh client
 * per tool call would be worse than either. `OtcClient` caches the site's
 * `expired` category id per instance (see `resolveExpiredCategoryId`), and that
 * id costs a request to resolve and differs on every install in the network.
 * Rebuilding the client each call would pay that request on every single read.
 *
 * The environment is deliberately not consulted. `OtcClient` will fall back to
 * `OTC_BASE_URL` / `OTC_SITE` when constructed bare, which was right when a
 * deployment served one city; here it would let a stale env var silently
 * redirect every read to the wrong site. The base URL is always passed
 * explicitly.
 */
export class OtcRegistry {
  private readonly clients = new Map<string, OtcClient>();

  constructor(private readonly opts: OtcRegistryOptions = {}) {}

  /**
   * Resolves a site key or alias to its client.
   *
   * Throws (listing the valid keys) on an unknown site rather than falling back
   * to a default — answering a question about one city with another city's data
   * is the failure this whole design is built to prevent.
   */
  for(keyOrAlias: string): OtcClient {
    // Memoize on the RESOLVED key, so "milehigh" and "denver" share one client
    // — and so one spelling's warm `expired` id is not wasted by the other.
    const site = requireSite(keyOrAlias);
    let client = this.clients.get(site.key);
    if (!client) {
      client = new OtcClient({ baseUrl: site.baseUrl, fetchImpl: this.opts.fetchImpl });
      this.clients.set(site.key, client);
    }
    return client;
  }
}
