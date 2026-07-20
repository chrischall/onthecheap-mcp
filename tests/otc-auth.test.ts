import { describe, it, expect, vi, afterEach } from 'vitest';
import { otcAuth } from '../src/otc-auth.js';
import { OtcClient } from '../src/client.js';
import { requireSite } from '../src/sites.js';

// otc-auth.ts imports @chrischall/mcp-connector for TYPES only, so it stays
// loadable under Node and its logic is testable here rather than in the much
// slower Workers pool.

const CHARLOTTE = requireSite('charlotte').baseUrl;
const DENVER = requireSite('denver').baseUrl;

afterEach(() => vi.restoreAllMocks());

const healthy = () =>
  vi.spyOn(OtcClient.prototype, 'healthcheck').mockResolvedValue({ ok: true, baseUrl: 'x' });

describe('otcAuth', () => {
  it('declares a public service — no credential fields', () => {
    // The whole point: these sites have no accounts. A non-empty fields array
    // would put a credential form in front of public data.
    expect(otcAuth.fields).toEqual([]);
  });

  it('brands as the network, not one city', () => {
    // The login page renders from this module-scope object, before the
    // Worker's env (and so the configured site) is known.
    expect(otcAuth.service).toBe('On the Cheap');
  });

  it('says plainly that nothing is stored', () => {
    expect(otcAuth.privacyNote).toMatch(/no account/i);
    expect(otcAuth.privacyNote).toMatch(/stores no credentials/i);
  });

  it('defaults to Charlotte when no site is configured', async () => {
    healthy();
    await expect(otcAuth.login({}, {})).resolves.toMatchObject({
      baseUrl: CHARLOTTE,
      siteKey: 'charlotte',
    });
  });

  it('honours OTC_SITE, so a deployment can read another city', async () => {
    healthy();
    await expect(otcAuth.login({}, { OTC_SITE: 'denver' })).resolves.toMatchObject({
      baseUrl: DENVER,
      siteKey: 'denver',
    });
  });

  it('accepts a site alias', async () => {
    healthy();
    await expect(otcAuth.login({}, { OTC_SITE: 'milehigh' })).resolves.toMatchObject({
      siteKey: 'denver',
    });
  });

  it('lets OTC_BASE_URL override the site key', async () => {
    healthy();
    await expect(
      otcAuth.login({}, { OTC_SITE: 'denver', OTC_BASE_URL: CHARLOTTE }),
    ).resolves.toMatchObject({ baseUrl: CHARLOTTE, siteKey: 'charlotte' });
  });

  it('rejects an unknown site rather than silently serving another city', async () => {
    healthy();
    await expect(otcAuth.login({}, { OTC_SITE: 'atlantis' })).rejects.toThrow(/unknown site/i);
  });

  it('throws an actionable error when the site is unreachable', async () => {
    // healthcheck() reports rather than throws, so without this check a user
    // could authorize successfully and only discover the outage on their first
    // tool call.
    vi.spyOn(OtcClient.prototype, 'healthcheck').mockResolvedValue({
      ok: false,
      baseUrl: CHARLOTTE,
      error: 'ECONNREFUSED',
    });
    await expect(otcAuth.login({}, {})).rejects.toThrow(/ECONNREFUSED/);
  });
});
