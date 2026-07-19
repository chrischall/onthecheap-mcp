import { describe, it, expect } from 'vitest';
import { decodeEntities, htmlToText, compactPost } from '../src/normalize.js';

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

  it('flags a post carrying the expired category', () => {
    expect(compactPost(post).expired).toBe(false);
    expect(compactPost({ ...post, categories: [6193] }).expired).toBe(true);
  });
});
