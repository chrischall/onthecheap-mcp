import { describe, it, expect } from 'vitest';
import { decodeEntities, htmlToText, htmlToMarkdown, compactPost } from '../src/normalize.js';

describe('decodeEntities', () => {
  it('decodes the numeric entities WordPress emits in rendered titles', () => {
    // The REST API returns titles pre-rendered with entities intact, e.g.
    // "Back to School Bashes &#8212; many with free school supplies".
    expect(decodeEntities('Free Dippin&#8217; Dots')).toBe('Free Dippin’ Dots');
    expect(decodeEntities('Bashes &#8212; free supplies')).toBe('Bashes — free supplies');
  });

  it('decodes named entities', () => {
    expect(decodeEntities('Arts &amp; Science &lt;free&gt;')).toBe('Arts & Science <free>');
  });

  it('leaves plain text untouched', () => {
    expect(decodeEntities('Free Museum Day')).toBe('Free Museum Day');
  });

  it('handles an empty or missing value', () => {
    expect(decodeEntities('')).toBe('');
    expect(decodeEntities(undefined)).toBe('');
  });
});

describe('htmlToText', () => {
  it('strips markup and collapses whitespace', () => {
    expect(htmlToText('<p>Free  <b>museum</b> day</p>\n<p>Sunday</p>')).toBe(
      'Free museum day Sunday',
    );
  });

  it('decodes entities while stripping', () => {
    expect(htmlToText('<p>Arts &amp; Crafts</p>')).toBe('Arts & Crafts');
  });

  it('truncates to a limit on a word boundary with an ellipsis', () => {
    const text = htmlToText('<p>one two three four five six seven</p>', 15);
    expect(text.length).toBeLessThanOrEqual(16);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/\s…$/);
  });

  it('does not truncate text already within the limit', () => {
    expect(htmlToText('<p>short</p>', 50)).toBe('short');
  });

  it('keeps adjacent blocks apart instead of gluing their words together', () => {
    expect(htmlToText('<p>One</p><p>Two</p><div>Three</div><ul><li>Four</li><li>Five</li></ul>')).toBe(
      'One Two Three Four Five',
    );
  });

  it('treats a <br> as a word break, so addresses and hours stay readable', () => {
    expect(htmlToText('123 Main St<br>Charlotte, NC<br/>Hours: 9&#8211;5')).toBe(
      '123 Main St Charlotte, NC Hours: 9–5',
    );
  });

  it('drops script, style and JSON-LD content rather than surfacing it as article text', () => {
    expect(
      htmlToText(
        '<p>Doors open</p><script>var x=1</script><style>.a{}</style>' +
          '<script type="application/ld+json">{"@type":"Event"}</script><noscript>enable js</noscript><p>at 10</p>',
      ),
    ).toBe('Doors open at 10');
  });

  it('does not split a word wrapped in inline markup', () => {
    expect(htmlToText('<p><b>F</b>ree <a href="#">entry</a>, <em>all</em>day</p>')).toBe(
      'Free entry, allday',
    );
  });

  it('decodes named entities the lightweight decoders miss', () => {
    expect(htmlToText('<p>9&ndash;5 &hellip; caf&eacute;&nbsp;open</p>')).toBe('9–5 … café open');
  });

  // Gained by delegating to mcp-utils htmlToReadableText (fleet-audit#1083).
  it('does not read a leading doctype as words', () => {
    expect(htmlToText('<!DOCTYPE html><html><body><p>Hi there</p></body></html>')).toBe('Hi there');
  });

  it('survives hostile nesting depth without overflowing the stack', () => {
    const depth = 20_000;
    const html = '<span>'.repeat(depth) + 'deep' + '</span>'.repeat(depth);
    expect(htmlToText(html)).toBe('deep');
  });
});

describe('htmlToMarkdown', () => {
  it('keeps links, headings, lists and emphasis', () => {
    expect(
      htmlToMarkdown(
        '<p>Visit <a href="https://www.oldarmorbeer.net/">Old Armor</a> for <strong>free</strong> music.</p>' +
          '<h2>Upcoming Events</h2><ul><li>Friday: <b>Octopus Band</b></li><li>Saturday</li></ul>',
      ),
    ).toBe(
      'Visit [Old Armor](https://www.oldarmorbeer.net/) for **free** music.\n\n' +
        '## Upcoming Events\n\n- Friday: **Octopus Band**\n- Saturday',
    );
  });

  it('decodes the named entities authors type, as htmlToText does', () => {
    expect(htmlToMarkdown('<p>9&ndash;5 &hellip; caf&eacute;&nbsp;open &amp; &lt;free&gt;</p>')).toBe(
      '9–5 … café open & <free>',
    );
  });

  it('leaves an unknown entity name as written', () => {
    expect(htmlToMarkdown('<p>&notanentity; &copy;</p>')).toBe('&notanentity; ©');
  });

  it('drops the option lists of embedded signup forms', () => {
    expect(
      htmlToMarkdown('<p>Address</p><select><option>Afghanistan</option><option>Albania</option></select><p>Thanks</p>'),
    ).toBe('Address\n\nThanks');
  });

  it('reads a figure caption apart from its image', () => {
    expect(
      htmlToMarkdown('<figure><img alt="Brewery exterior" src="x.jpg"><figcaption>Photo: Mace</figcaption></figure><p>Text</p>'),
    ).toBe('[Brewery exterior]\n\nPhoto: Mace\n\nText');
  });

  it('drops script content and hidden form fields', () => {
    expect(
      htmlToMarkdown('<p>Doors open</p><script>var x=1</script><div style="display:none">honeypot</div><p>at 10</p>'),
    ).toBe('Doors open\n\nat 10');
  });

  it('reads an empty body as empty', () => {
    expect(htmlToMarkdown(undefined)).toBe('');
    expect(htmlToMarkdown('')).toBe('');
  });
});

describe('compactPost', () => {
  const post = {
    id: 779948,
    slug: 'back-to-school',
    date: '2026-07-19T10:00:00',
    link: 'https://www.charlotteonthecheap.com/back-to-school/',
    title: { rendered: 'Back to School Bashes &#8212; free supplies' },
    excerpt: { rendered: '<p>Lots of <b>free</b> events &amp; giveaways.</p>' },
    content: { rendered: '<p>'.padEnd(20000, 'x') },
    categories: [4],
    tags: [6282],
    locations: [6276],
    jetpack_featured_media_url: 'https://x/img.jpg',
  };

  it('projects a slim, decoded summary', () => {
    expect(compactPost(post)).toMatchObject({
      id: 779948,
      slug: 'back-to-school',
      date: '2026-07-19',
      url: 'https://www.charlotteonthecheap.com/back-to-school/',
      title: 'Back to School Bashes — free supplies',
      excerpt: 'Lots of free events & giveaways.',
      image: 'https://x/img.jpg',
    });
  });

  it('omits the full content body', () => {
    // A single post's rendered content runs to ~20 KB; a listing of twenty
    // would bury the caller in markup it did not ask for.
    const compact = compactPost(post) as Record<string, unknown>;
    expect(compact.content).toBeUndefined();
    expect(JSON.stringify(compact).length).toBeLessThan(600);
  });

  it('survives a partial record from a _fields-limited query', () => {
    expect(() => compactPost({ id: 1 })).not.toThrow();
    expect(compactPost({ id: 1 })).toMatchObject({ id: 1, title: '' });
  });

  it('flags a post carrying the expired category, using the id it is given', () => {
    // The id is passed in, not hardcoded: it differs on every site in the
    // network, so a baked-in constant would mislabel posts elsewhere.
    expect(compactPost(post, 6193).expired).toBe(false);
    expect(compactPost({ ...post, categories: [6193] }, 6193).expired).toBe(true);
    expect(compactPost({ ...post, categories: [7803] }, 7803).expired).toBe(true);
  });

  it('leaves the expired flag undefined when no id is supplied', () => {
    // Better to say nothing than to guess with another site's id.
    expect(compactPost(post).expired).toBeUndefined();
  });
});
