import type { ConnectorAuth } from '@chrischall/mcp-connector';
import { OtcClient } from './client.js';
import { DEFAULT_SITE_KEY, requireSite } from './sites.js';

/**
 * OAuth props stored per grant by the Cloudflare connector's OAuth provider.
 *
 * The "on the Cheap" sites are fully public — there is no API key, no account,
 * and nothing user-specific to keep. All that is stored is which site this
 * grant reads, so `worker.ts`'s `buildClient` can construct a client without
 * re-reading the environment.
 *
 * The index signature satisfies `createConnector`'s
 * `Props extends Record<string, unknown>` constraint.
 */
export interface OtcProps {
  baseUrl: string;
  siteKey?: string;
  [key: string]: unknown;
}

/**
 * `ConnectorAuth` for the On the Cheap remote connector.
 *
 * This is the zero-auth case: `fields: []` declares a public service, so the
 * login page renders a bare authorize button instead of a credential form and
 * `login` receives an empty object. (That path is why
 * `@chrischall/mcp-connector` >= 1.1.0 is required — before it, an empty
 * `fields` array crashed the harness deriving the OAuth userId from
 * `fields[0]`.)
 *
 * Because a public service has no per-user identity, every grant is keyed on
 * the userId `'public'`. That is correct here — the connector reads the same
 * public pages for everyone and holds nothing personal — but it does mean
 * grants are not isolated per user, so this shape must not be reused for a
 * service that actually has accounts.
 *
 * The branding stays the network name rather than a city: the login page is
 * rendered from a module-scope object, before the Worker's env (and so the
 * configured site) is known. Which city a deployment reads is reported by
 * `otc_healthcheck` and `otc_list_sites`.
 *
 * `login` still runs: it resolves the configured site and verifies it is
 * reachable, so a user who authorizes while the site is down gets an
 * actionable error on the login page rather than a connector that fails on its
 * first tool call.
 */
export const otcAuth: ConnectorAuth<OtcProps> = {
  service: 'On the Cheap',
  accent: '#0F766E',
  fields: [],
  privacyNote:
    'The On the Cheap sites are public websites — this connector needs no account, stores no credentials, ' +
    'and only reads pages anyone can visit.',
  async login(_fields, env) {
    const explicitUrl = env?.OTC_BASE_URL as string | undefined;
    const siteKey = (env?.OTC_SITE as string | undefined) || DEFAULT_SITE_KEY;
    // requireSite throws (listing valid keys) on a misconfigured deployment,
    // which surfaces on the login page instead of failing silently later.
    const baseUrl = explicitUrl || requireSite(siteKey).baseUrl;

    const client = new OtcClient({ baseUrl });
    const health = await client.healthcheck();
    if (!health.ok) {
      // Surface the underlying reason: a bare "site may be down" hides an
      // upstream block or a config problem, which look identical to the user.
      throw new Error(
        `Could not reach ${client.site?.name ?? baseUrl}: ${health.error ?? 'unknown error'}`,
      );
    }
    return { baseUrl, siteKey: client.site?.key };
  },
};
