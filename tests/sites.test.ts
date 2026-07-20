import { describe, it, expect } from 'vitest';
import {
  SITES,
  DEFAULT_SITE_KEY,
  SITE_ARG_DESCRIPTION,
  findSite,
  requireSite,
  requireLocalSite,
  siteForBaseUrl,
} from '../src/sites.js';

describe('the site registry', () => {
  it('has a unique, url-safe key per site', () => {
    const keys = SITES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]+$/);
  });

  it('points every site at a distinct https base URL with no trailing slash', () => {
    const urls = SITES.map((s) => s.baseUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\//);
      expect(u.endsWith('/')).toBe(false);
    }
  });

  it('defaults to a site that actually exists', () => {
    expect(findSite(DEFAULT_SITE_KEY)).toBeDefined();
  });

  it('marks exactly one site as the national hub', () => {
    // It has no local events calendar, so tools must be able to tell it apart.
    expect(SITES.filter((s) => s.national)).toHaveLength(1);
  });
});

describe('findSite', () => {
  it('resolves a key', () => {
    expect(findSite('denver')?.name).toBe('Mile High on the Cheap');
  });

  it('resolves the aliases people actually say', () => {
    // The Denver site is branded "Mile High", and the Triangle covers three
    // cities — a user naming any of them should not get a miss.
    expect(findSite('milehigh')?.key).toBe('denver');
    expect(findSite('raleigh')?.key).toBe('triangle');
    expect(findSite('durham')?.key).toBe('triangle');
    expect(findSite('rva')?.key).toBe('richmond');
    expect(findSite('southflorida')?.key).toBe('miami');
  });

  it('ignores case, spacing and punctuation', () => {
    expect(findSite('  Kansas City ')?.key).toBe('kansascity');
    expect(findSite('SOUTHERN-MAINE')?.key).toBe('southernmaine');
    expect(findSite('chapel_hill')?.key).toBe('triangle');
  });

  it('returns undefined for an unknown site', () => {
    expect(findSite('atlantis')).toBeUndefined();
  });
});

describe('requireSite', () => {
  it('fails loudly on an unknown key, listing the valid ones', () => {
    // Falling back silently would return another city's events with nothing to
    // indicate the configured site was wrong.
    expect(() => requireSite('atlantis')).toThrow(/unknown site/i);
    expect(() => requireSite('atlantis')).toThrow(/charlotte/);
  });
});

describe('requireLocalSite', () => {
  it('resolves a city site like requireSite does', () => {
    expect(requireLocalSite('denver').key).toBe('denver');
    expect(requireLocalSite('rva').key).toBe('richmond');
  });

  it('rejects the national hub, which has no local events calendar', () => {
    // The hub's /events/ pages do answer, but carry one evergreen online offer
    // repeated on every date — worse than empty, because it reads as a real
    // listing. Refusing beats returning it.
    expect(() => requireLocalSite('national')).toThrow(/no local events calendar/i);
  });

  it('names an alternative rather than just refusing', () => {
    // Only ever thrown from a tool call, where the hint is rendered — unlike
    // requireSite, which can throw during construction and so puts everything
    // in the message.
    expect(() => requireLocalSite('national')).toThrow(
      expect.objectContaining({ hint: expect.stringMatching(/otc_list_sites/) }),
    );
  });

  it('still fails loudly on an unknown site', () => {
    expect(() => requireLocalSite('atlantis')).toThrow(/unknown site/i);
  });
});

describe('SITE_ARG_DESCRIPTION', () => {
  it('lists every selectable key, so the model can pick without a second call', () => {
    for (const site of SITES) expect(SITE_ARG_DESCRIPTION).toContain(site.key);
  });
});

describe('siteForBaseUrl', () => {
  it('matches a base URL back to its site, with or without www', () => {
    expect(siteForBaseUrl('https://www.charlotteonthecheap.com')?.key).toBe('charlotte');
    expect(siteForBaseUrl('https://charlotteonthecheap.com')?.key).toBe('charlotte');
    expect(siteForBaseUrl('https://milehighonthecheap.com')?.key).toBe('denver');
  });

  it('returns undefined for a URL outside the network', () => {
    expect(siteForBaseUrl('https://example.com')).toBeUndefined();
  });

  it('returns undefined for a malformed URL instead of throwing', () => {
    expect(siteForBaseUrl('not a url')).toBeUndefined();
  });
});
