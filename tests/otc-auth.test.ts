import { describe, it, expect, vi, afterEach } from 'vitest';
import { otcAuth } from '../src/otc-auth.js';
import { OtcClient } from '../src/client.js';

// otc-auth.ts imports @chrischall/mcp-connector for TYPES only, so it stays
// loadable under Node and its logic is testable here rather than in the much
// slower Workers pool.

afterEach(() => vi.restoreAllMocks());

describe('otcAuth', () => {
  it('declares a public service — no credential fields', () => {
    // The whole point: these sites have no accounts. A non-empty fields array
    // would put a credential form in front of public data.
    expect(otcAuth.fields).toEqual([]);
  });

  it('brands as the network, not one city', () => {
    expect(otcAuth.service).toBe('On the Cheap');
  });

  it('says plainly that nothing is stored', () => {
    expect(otcAuth.privacyNote).toMatch(/no account/i);
    expect(otcAuth.privacyNote).toMatch(/stores no credentials/i);
  });

  it('stores no site in the grant, because the connector serves them all', async () => {
    // A site recorded at authorization time is exactly what pinned the old
    // deployment to one city. The site now comes from each tool call.
    await expect(otcAuth.login({}, {})).resolves.toEqual({});
  });

  it('ignores OTC_SITE and OTC_BASE_URL rather than honouring a stale pin', async () => {
    await expect(
      otcAuth.login({}, { OTC_SITE: 'denver', OTC_BASE_URL: 'https://example.com' }),
    ).resolves.toEqual({});
  });

  it('does not probe any site for reachability', async () => {
    // With fourteen sites there is no single one whose health is the
    // connector's health: failing authorization because Charlotte is briefly
    // down would block a user who only ever asks about Denver. Per-site
    // reachability is what otc_healthcheck is for.
    const healthcheck = vi.spyOn(OtcClient.prototype, 'healthcheck');
    await otcAuth.login({}, {});
    expect(healthcheck).not.toHaveBeenCalled();
  });

  it('authorizes even while a site is down', async () => {
    vi.spyOn(OtcClient.prototype, 'healthcheck').mockResolvedValue({
      ok: false,
      baseUrl: 'https://www.charlotteonthecheap.com',
      error: 'ECONNREFUSED',
    });
    await expect(otcAuth.login({}, {})).resolves.toEqual({});
  });
});
