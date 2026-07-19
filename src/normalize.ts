import { parse } from 'node-html-parser';
import { EXPIRED_CATEGORY_ID, type WpPost } from './client.js';

/**
 * Decodes the HTML entities WordPress leaves in its rendered fields.
 *
 * `title.rendered` and friends arrive pre-rendered but still entity-encoded
 * ("Bashes &#8212; free supplies"), so anything user-facing has to be decoded
 * or the entity text shows through verbatim.
 */
export function decodeEntities(value: string | undefined | null): string {
  if (!value) return '';
  return parse(value).textContent;
}

/** Strips markup, decodes entities, and collapses whitespace. */
export function htmlToText(html: string | undefined | null, limit?: number): string {
  const text = decodeEntities(html).replace(/\s+/g, ' ').trim();
  if (limit === undefined || text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export interface CompactPost {
  id: number;
  slug?: string;
  date?: string;
  url?: string;
  title: string;
  excerpt?: string;
  image?: string;
  categories?: number[];
  locations?: number[];
  expired?: boolean;
}

/**
 * Projects a WordPress post to a slim summary.
 *
 * Full records carry a ~20 KB rendered `content` body, which is far more than
 * a caller browsing or ranking listings needs. Fields are read defensively so
 * a `_fields`-limited response still projects cleanly.
 */
export function compactPost(post: WpPost): CompactPost {
  const categories = post.categories;
  return {
    id: post.id,
    slug: post.slug,
    date: post.date?.slice(0, 10),
    url: post.link,
    title: htmlToText(post.title?.rendered),
    excerpt: htmlToText(post.excerpt?.rendered, 280) || undefined,
    image: post.jetpack_featured_media_url || undefined,
    categories,
    locations: post.locations?.length ? post.locations : undefined,
    expired: categories ? categories.includes(EXPIRED_CATEGORY_ID) : undefined,
  };
}
