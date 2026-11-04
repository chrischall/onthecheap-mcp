import { describe, it, expect, afterAll } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { OtcRegistry } from '../src/registry.js';
import { registerPostTools } from '../src/tools/posts.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from '../src/tools/taxonomy.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * asserted against the served `tools/list` — what a host actually sees.
 */
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
  _meta?: { mint?: Record<string, any> };
};

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  otc_search_posts: 'lookup',
  otc_get_post: 'lookup',
  otc_list_events: 'whats-on',
  otc_events_month_overview: 'whats-on',
  otc_list_categories: 'lookup',
  otc_list_locations: 'lookup',
  otc_list_sites: 'lookup',
};

let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;
let listed: Listed[] | undefined;

async function served(): Promise<Listed[]> {
  if (listed) return listed;
  const registry = new OtcRegistry();
  harness = await createTestHarness((server) => {
    registerPostTools(server, registry);
    registerEventTools(server, registry);
    registerTaxonomyTools(server, registry);
    registerUtilityTools(server, registry);
  });
  listed = (await harness.client.listTools()).tools as Listed[];
  return listed;
}

afterAll(async () => {
  if (harness) await harness.close();
});

describe('_meta.mint on tools/list', () => {
  it('names every served tool, so a new tool cannot skip the decision', async () => {
    const names = (await served()).map((t) => t.name).filter((n) => !n.endsWith('_healthcheck'));
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
  });

  it.each(Object.entries(EXPECTED_INTENT))('%s declares domain family and intent %s', async (name, intent) => {
    const mint = (await served()).find((t) => t.name === name)?._meta?.mint;
    expect(mint, name).toBeDefined();
    expect(mint!.domain).toBe('family');
    expect(mint!.intent).toBe(intent);
  });

  it('leaves the healthcheck unhinted: it joins no group', async () => {
    const hc = (await served()).find((t) => t.name === 'otc_healthcheck');
    expect(hc).toBeDefined();
    expect(hc!._meta?.mint).toBeUndefined();
  });

  it('every hint is shaped per the host contract', async () => {
    for (const t of await served()) {
      if (t.name.endsWith('_healthcheck')) continue;
      const m = t._meta!.mint!;
      const props = t.inputSchema.properties ?? {};
      expect(Object.keys(m).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(m.domain);
      expect(INTENTS, t.name).toContain(m.intent);
      if ('canonical' in m) expect(m.canonical, t.name).toBe(true);
      if ('subject' in m) {
        expect(typeof m.subject, t.name).toBe('string');
        expect(props, t.name).toHaveProperty(m.subject);
      }
      if ('when' in m) {
        expect(Object.keys(m.when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(m.when.start);
        expect(props, t.name).toHaveProperty(m.when.end);
      }
      if ('aliases' in m) {
        expect(m.aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of m.aliases as string[]) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('canonical only on read-only whats-new/whats-due/whats-on reads, at most one per intent', async () => {
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical === true);
    const seen = new Set<string>();
    for (const t of canonical) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS, t.name).toContain(t._meta!.mint!.intent);
      expect(seen.has(t._meta!.mint!.intent), t.name).toBe(false);
      seen.add(t._meta!.mint!.intent);
      // A canonical read answers the intent tool's brief view.
      const view = t.inputSchema.properties?.view;
      expect(view?.enum, t.name).toContain('brief');
    }
  });

  it('marks nothing canonical: every read needs a city the person has not named, and the cities are the network, not the person’s subjects', async () => {
    // A canonical read is called once (or once per subject label). Every
    // events read here takes a required `site` with no default, so an unbound
    // call is refused; publishing all 13 cities as a subject enum would fan a
    // "what's on?" out over the whole network rather than the person's own
    // things. So the events reads are whats-on hints a model can route on,
    // and none of them is canonical.
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical === true).map((t) => t.name);
    expect(canonical).toEqual([]);
  });

  it('the events reads carry the words a person says', async () => {
    const tools = await served();
    for (const name of ['otc_list_events', 'otc_events_month_overview']) {
      const aliases = tools.find((t) => t.name === name)?._meta?.mint?.aliases as string[];
      expect(aliases, name).toEqual(expect.arrayContaining(['things to do', 'free events']));
    }
    const search = tools.find((t) => t.name === 'otc_search_posts')?._meta?.mint?.aliases as string[];
    expect(search).toEqual(expect.arrayContaining(['deals', 'freebies']));
  });
});
