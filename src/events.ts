import { parse, type HTMLElement } from 'node-html-parser';
import { McpToolError } from '@chrischall/mcp-utils';

/** A single listing as rendered by the site's `lotc` events plugin. */
export interface OtcEvent {
  title: string;
  url: string;
  /** As printed: "All Day", "7:00 pm", "8:00 am to 9:00 am". */
  time: string | null;
  /** As printed: "FREE", "$30.00-55.00". Null when the listing omits a price. */
  price: string | null;
  venue: string | null;
  is_free: boolean;
}

export interface OtcDay {
  /** ISO date (YYYY-MM-DD), or null when the page carries no parseable heading. */
  date: string | null;
  events: OtcEvent[];
}

export interface OtcMonthDay {
  date: string;
  /** Events actually listed in the calendar cell (the site shows at most four). */
  events: OtcEvent[];
  /** How many this cell rendered. */
  shown: number;
  /** True total for the day, from the cell's "+N more events" link. */
  total: number;
  truncated: boolean;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Converts an ISO date to the day path the site routes on.
 *
 * The `lotc` plugin parses US `M-D-YYYY`. Handing it an ISO segment does not
 * 404 — it parses to a nonsense date and renders "Thursday, January 1, 1970",
 * so a wrong format silently returns the wrong day's events rather than
 * failing. Validate here so that can't happen.
 */
export function toDatePath(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new McpToolError(`Invalid date "${isoDate}" — expected ISO YYYY-MM-DD.`, {
      hint: 'Pass a date like 2026-07-25.',
    });
  }
  const [, year, month, day] = m;
  const [mo, d] = [Number(month), Number(day)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new McpToolError(`Invalid date "${isoDate}" — month or day out of range.`, {
      hint: 'Pass a real calendar date like 2026-07-25.',
    });
  }
  return `${mo}-${d}-${year}`;
}

/** Converts an ISO month (YYYY-MM) to the site's `MM-YYYY` calendar path. */
export function toMonthPath(isoMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(isoMonth);
  if (!m) {
    throw new McpToolError(`Invalid month "${isoMonth}" — expected ISO YYYY-MM.`, {
      hint: 'Pass a month like 2026-08.',
    });
  }
  const [, year, month] = m;
  if (Number(month) < 1 || Number(month) > 12) {
    throw new McpToolError(`Invalid month "${isoMonth}" — month out of range.`, {
      hint: 'Pass a month between 01 and 12, e.g. 2026-08.',
    });
  }
  return `${month}-${year}`;
}

/** "Saturday, July 25, 2026" -> "2026-07-25". */
function headingToIso(heading: string): string | null {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(heading);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx === -1) return null;
  return `${m[3]}-${String(idx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** "…/view-date/08-01-2026/" -> "2026-08-01". */
function dayLinkToIso(href: string): string | null {
  const m = /view-date\/(\d{1,2})-(\d{1,2})-(\d{4})/.exec(href);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

const isPriceSegment = (s: string): boolean => /^(free\b|\$|donation)/i.test(s.trim());

/**
 * Splits a listing's `p.meta` into its parts.
 *
 * The site emits either `time | price | venue` or, when a listing has no
 * price, `time | venue`. The two-segment case must not be read positionally:
 * treating segment two as the price would report a venue name as the cost.
 */
function parseMeta(meta: string): Pick<OtcEvent, 'time' | 'price' | 'venue'> {
  const segments = meta
    .split('|')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (segments.length === 0) return { time: null, price: null, venue: null };
  if (segments.length === 1) return { time: segments[0], price: null, venue: null };

  const [time, ...rest] = segments;
  if (rest.length === 1) {
    // Two segments: the lone tail is a price only if it looks like one.
    return isPriceSegment(rest[0])
      ? { time, price: rest[0], venue: null }
      : { time, price: null, venue: rest[0] };
  }
  return { time, price: rest[0], venue: rest.slice(1).join(' | ') };
}

function parseEventRow(row: HTMLElement): OtcEvent | null {
  const anchor = row.querySelector('h3 a');
  if (!anchor) return null;
  const meta = parseMeta(row.querySelector('p.meta')?.textContent ?? '');
  return {
    title: anchor.textContent.replace(/\s+/g, ' ').trim(),
    url: anchor.getAttribute('href') ?? '',
    ...meta,
    is_free: /free/i.test(meta.price ?? ''),
  };
}

const eventRowsIn = (root: HTMLElement): OtcEvent[] =>
  root
    .querySelectorAll('div.lotc-v2.row.event')
    .map(parseEventRow)
    .filter((e): e is OtcEvent => e !== null);

/**
 * Parses a single-day listing page.
 *
 * Rows are read via the event containers rather than by scraping every
 * `p.meta` on the page: the live day page carries a `p.meta` outside any event
 * row, which a global scrape would turn into a phantom event.
 */
export function parseDayPage(html: string): OtcDay {
  const root = parse(html);
  const heading = root.querySelector('h2.lotc-event')?.textContent ?? '';
  return { date: headingToIso(heading), events: eventRowsIn(root) };
}

/**
 * Parses a month calendar page into per-day summaries.
 *
 * Each cell renders at most four listings plus a "+N more events" link, so the
 * cell's own rows are a preview, not the day's full schedule. `total` adds the
 * overflow count back so callers aren't misled; fetch the day page for the
 * complete list.
 */
export function parseMonthPage(html: string): OtcMonthDay[] {
  const root = parse(html);
  const days: OtcMonthDay[] = [];

  for (const cell of root.querySelectorAll('td.calendar-day')) {
    const href = cell.querySelector('div.day-number a')?.getAttribute('href') ?? '';
    const date = dayLinkToIso(href);
    if (!date) continue;

    const events = eventRowsIn(cell);
    const more = /\+\s*(\d+)\s*more/i.exec(cell.textContent ?? '');
    const overflow = more ? Number(more[1]) : 0;

    days.push({
      date,
      events,
      shown: events.length,
      total: events.length + overflow,
      truncated: overflow > 0,
    });
  }

  return days;
}
