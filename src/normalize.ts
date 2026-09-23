import { parse, NodeType, type HTMLElement, type Node, type TextNode } from 'node-html-parser';
import type { WpPost } from './client.js';

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

/** Elements whose content is code or data, never readable article text. */
const NON_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'SVG']);

/**
 * Elements that start a new line when rendered. Their boundaries become a word
 * break; inline elements (`<b>`, `<a>`, …) do not, so "<b>F</b>ree" stays one
 * word.
 */
const BREAK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
  'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH',
  'TR', 'UL',
]);

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push((node as TextNode).text); // `.text` is entity-decoded
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return; // comments
  const tag = (node as HTMLElement).tagName ?? '';
  if (NON_TEXT_TAGS.has(tag)) return;
  const breaks = BREAK_TAGS.has(tag);
  if (breaks) out.push(' ');
  for (const child of node.childNodes) collectText(child, out);
  if (breaks) out.push(' ');
}

/**
 * Strips markup, decodes entities, and collapses whitespace.
 *
 * Not plain `textContent`: that glues adjacent blocks into one word
 * ("<p>One</p><p>Two</p>" → "OneTwo") and surfaces inline `<script>`/`<style>`
 * /JSON-LD as if it were article text. Instead, code-bearing elements are
 * skipped and block/`<br>` boundaries become word breaks, while inline markup
 * is left joined so a word split across tags stays whole.
 */
export function htmlToText(html: string | undefined | null, limit?: number): string {
  if (!html) return '';
  const parts: string[] = [];
  collectText(parse(html), parts);
  const text = parts.join('').replace(/\s+/g, ' ').trim();
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
 *
 * `expiredCategoryId` is passed in rather than hardcoded because it differs on
 * every site in the network; omit it and the `expired` flag is left undefined
 * rather than guessed wrong.
 */
export function compactPost(post: WpPost, expiredCategoryId?: number | null): CompactPost {
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
    expired:
      categories && typeof expiredCategoryId === 'number'
        ? categories.includes(expiredCategoryId)
        : undefined,
  };
}
