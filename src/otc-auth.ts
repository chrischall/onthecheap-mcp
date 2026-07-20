import type { ConnectorAuth } from '@chrischall/mcp-connector';

/**
 * OAuth props stored per grant by the Cloudflare connector's OAuth provider.
 *
 * The "on the Cheap" sites are fully public — there is no API key, no account,
 * and nothing user-specific to keep. Nor is there a site to record: the
 * connector serves the whole network, and which city a call reads comes from
 * that call's `site` argument. So the props carry nothing at all, and exist
 * only to satisfy `createConnector`'s `Props extends Record<string, unknown>`
 * constraint.
 */
export interface OtcProps {
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
 * `login` deliberately does NOT probe a site for reachability. It did when a
 * deployment served exactly one city and that city's health was the
 * connector's health. With fourteen sites there is no single site whose state
 * represents the whole connector: failing authorization because Charlotte is
 * briefly down would block a user who only ever asks about Denver. Per-site
 * reachability is what `otc_healthcheck` is for.
 */
export const otcAuth: ConnectorAuth<OtcProps> = {
  service: 'On the Cheap',
  accent: '#0F766E',
  fields: [],
  privacyNote:
    'The On the Cheap sites are public websites — this connector needs no account, stores no credentials, ' +
    'and only reads pages anyone can visit.',
  async login() {
    return {};
  },
};
