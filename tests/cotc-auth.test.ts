import { describe, it, expect, vi, afterEach } from 'vitest';
import { cotcAuth } from '../src/cotc-auth.js';
import { CotcClient, DEFAULT_BASE_URL } from '../src/client.js';

// cotc-auth.ts imports @chrischall/mcp-connector for TYPES only, so it stays
// loadable under Node and its logic is testable here rather than in the much
// slower Workers pool.

afterEach(() => vi.restoreAllMocks());

describe('cotcAuth', () => {
  it('declares a public service — no credential fields', () => {
    // The whole point: Charlotte On The Cheap has no accounts. A non-empty
    // fields array would put a credential form in front of public data.
    expect(cotcAuth.fields).toEqual([]);
  });

  it('says plainly that nothing is stored', () => {
    expect(cotcAuth.privacyNote).toMatch(/no account/i);
    expect(cotcAuth.privacyNote).toMatch(/stores no credentials/i);
  });

  it('verifies reachability and returns the base URL as props', async () => {
    const health = vi
      .spyOn(CotcClient.prototype, 'healthcheck')
      .mockResolvedValue({ ok: true, site: 'Charlotte On The Cheap', baseUrl: DEFAULT_BASE_URL });

    await expect(cotcAuth.login({}, {})).resolves.toEqual({ baseUrl: DEFAULT_BASE_URL });
    expect(health).toHaveBeenCalled();
  });

  it('honours a COTC_BASE_URL override from the Worker env', async () => {
    vi.spyOn(CotcClient.prototype, 'healthcheck').mockResolvedValue({
      ok: true,
      baseUrl: 'https://staging.example.com',
    });
    await expect(cotcAuth.login({}, { COTC_BASE_URL: 'https://staging.example.com' })).resolves
      .toEqual({ baseUrl: 'https://staging.example.com' });
  });

  it('throws an actionable error when the site is unreachable', async () => {
    // healthcheck() reports rather than throws, so without this check a user
    // could authorize successfully and only discover the outage on their first
    // tool call.
    vi.spyOn(CotcClient.prototype, 'healthcheck').mockResolvedValue({
      ok: false,
      baseUrl: DEFAULT_BASE_URL,
      error: 'ECONNREFUSED',
    });
    await expect(cotcAuth.login({}, {})).rejects.toThrow(/could not reach/i);
  });
});
