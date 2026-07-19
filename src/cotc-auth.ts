import type { ConnectorAuth } from '@chrischall/mcp-connector';
import { CotcClient, DEFAULT_BASE_URL } from './client.js';

/**
 * OAuth props stored per grant by the Cloudflare connector's OAuth provider.
 *
 * Charlotte On The Cheap is a fully public site — there is no API key, no
 * account, and nothing user-specific to keep. All that is stored is which site
 * the client should read, so `worker.ts`'s `buildClient` can construct a
 * `CotcClient` without re-reading the environment.
 *
 * The index signature satisfies `createConnector`'s
 * `Props extends Record<string, unknown>` constraint.
 */
export interface CotcProps {
  baseUrl: string;
  [key: string]: unknown;
}

/**
 * `ConnectorAuth` for the Charlotte On The Cheap remote connector.
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
 * `login` still runs: it verifies the site is reachable, so a user who
 * authorizes while the site is down gets an actionable error on the login page
 * rather than a connector that fails on its first tool call.
 */
export const cotcAuth: ConnectorAuth<CotcProps> = {
  service: 'Charlotte On The Cheap',
  accent: '#0F766E',
  fields: [],
  privacyNote:
    'Charlotte On The Cheap is a public website — this connector needs no account, stores no credentials, ' +
    'and only reads pages anyone can visit.',
  async login(_fields, env) {
    const baseUrl = (env?.COTC_BASE_URL as string | undefined) || DEFAULT_BASE_URL;
    const health = await new CotcClient({ baseUrl }).healthcheck();
    if (!health.ok) {
      throw new Error(
        `Could not reach Charlotte On The Cheap (${baseUrl}). The site may be temporarily down — try again shortly.`,
      );
    }
    return { baseUrl };
  },
};
