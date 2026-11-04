/**
 * Context-group hints, published on each tool as `_meta.mint` (mcp-host's
 * context-groups contract, `mintHintSchema`). Inert data: a host that does not
 * read them sees an extra `_meta` key and nothing else. The shape is fixed by
 * the host's contract, so it is restated here rather than imported — this
 * server takes no dependency on mcp-host.
 *
 * Nothing here is `canonical`. A canonical read is one the host calls by
 * itself — once, or once per label of a subject enum — to answer "what's on?".
 * Every events read takes a required `site` with no default (by design: a
 * question about Denver must never be answered with Charlotte), so an unbound
 * call is refused; and the sites are the network's thirteen cities, not the
 * person's own children, properties or accounts, so publishing them as a
 * subject enum would fan one question out over the whole country. The events
 * reads are therefore `whats-on` hints a model routes on, with no canonical.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'family';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for an On the Cheap tool: every tool here is in the `family` domain. */
export function familyMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'family', intent, ...extra } };
}

/** What people say when they want the events calendar. Lowercase, ≤ 8, each ≤ 40 chars. */
export const EVENT_ALIASES = [
  'things to do',
  'free events',
  'cheap events',
  'this weekend',
  'kids activities',
  'family fun',
  'going on',
];

/** What people say when they want the articles — deals and guides. */
export const DEAL_ALIASES = ['deals', 'freebies', 'discounts', 'coupons', 'festivals', 'free museum days'];
