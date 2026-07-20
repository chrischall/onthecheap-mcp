import { describe, it, expect, vi } from 'vitest';
import { OtcRegistry } from '../src/registry.js';

describe('OtcRegistry.for', () => {
  it('points a client at the requested site', () => {
    const registry = new OtcRegistry();
    expect(registry.for('denver').site?.key).toBe('denver');
    expect(registry.for('charlotte').site?.key).toBe('charlotte');
  });

  it('accepts the same aliases findSite does', () => {
    const registry = new OtcRegistry();
    expect(registry.for('milehigh').site?.key).toBe('denver');
    expect(registry.for('RVA').site?.key).toBe('richmond');
  });

  it('returns the SAME client for a site across calls', () => {
    // This is the whole point of the registry: OtcClient caches the site's
    // `expired` category id per instance, and that id costs a request to
    // resolve. A fresh client per tool call would re-resolve it every time.
    const registry = new OtcRegistry();
    expect(registry.for('denver')).toBe(registry.for('denver'));
  });

  it('memoizes on the resolved key, not the spelling', () => {
    const registry = new OtcRegistry();
    expect(registry.for('milehigh')).toBe(registry.for('denver'));
  });

  it('keeps each site on its own client', () => {
    const registry = new OtcRegistry();
    expect(registry.for('denver')).not.toBe(registry.for('charlotte'));
  });

  it('fails loudly on an unknown site, listing the valid keys', () => {
    // Same contract as requireSite: a silent fallback would answer a question
    // about one city with another city's data.
    const registry = new OtcRegistry();
    expect(() => registry.for('atlantis')).toThrow(/unknown site/i);
    expect(() => registry.for('atlantis')).toThrow(/denver/);
  });

  it('passes its fetch implementation down to every client it builds', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: 'Mile High on the Cheap' }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const registry = new OtcRegistry({ fetchImpl });
    await registry.for('denver').healthcheck();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toContain('milehighonthecheap.com');
  });

  it('ignores OTC_SITE and OTC_BASE_URL entirely', async () => {
    // The server is global now: the site comes from the tool argument, never
    // from the environment. A stale OTC_BASE_URL must not silently redirect
    // every read to one site.
    vi.stubEnv('OTC_SITE', 'atlanta');
    vi.stubEnv('OTC_BASE_URL', 'https://example.com');
    try {
      const registry = new OtcRegistry();
      const client = registry.for('denver');
      expect(client.site?.key).toBe('denver');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
