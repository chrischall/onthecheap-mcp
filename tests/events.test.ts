import { describe, it, expect } from 'vitest';
import { parseDayPage, parseMonthPage, toDatePath, toMonthPath } from '../src/events.js';

// Mirrors the real markup at /events/view-date/<M-D-YYYY>/, covering every
// shape the live page emits:
//   - a three-segment meta (time | price | venue)
//   - a two-segment one where the price is absent
//   - a FEATURED row, which nests the text in a col-sm-9 column beside an
//     image column instead of the plain col-sm-12 used by ordinary rows
// The featured variant is why this parses via the event containers rather than
// by pattern-matching the row markup: its extra nesting defeats a naive
// "row ... </div></div>" match, which silently drops the event entirely.
const DAY_HTML = `
<h2 class="lotc-event">Saturday, July 25, 2026</h2>
<div class="lotc-v2 row event">
  <div class="col-sm-3"><a href="https://www.charlotteonthecheap.com/theatre-beach/"><img src="/tristan.jpg" /></a></div>
  <div class="col-sm-9 col-xs-12">
    <h3><a href="https://www.charlotteonthecheap.com/theatre-beach/" target="_blank">Theatre on the Beach: Tristan &amp; Isolde</a></h3>
    <p class="meta">7:00 pm | <strong>FREE</strong> | Jetton Park</p>
  </div>
</div>
<div class="lotc-v2 row event"><div class="col-sm-12">
  <h3><a href="https://www.charlotteonthecheap.com/queens-feast/" target="_blank">Queen&#8217;s Feast &#8212; Restaurant Week</a></h3>
  <p class="meta"><strong>All Day</strong> | <strong>$30.00-55.00</strong> | Charlotte, NC (many locations)</p>
</div></div>
<div class="lotc-v2 row event"><div class="col-sm-12">
  <h3><a href="https://www.charlotteonthecheap.com/sensory-friendly-films/" target="_blank">AMC Sensory-Friendly Family Movie</a></h3>
  <p class="meta"><strong>All Day</strong> | AMC Theatres, participating locations</p>
</div></div>
<div class="lotc-v2 row event"><div class="col-sm-12">
  <h3><a href="https://www.charlotteonthecheap.com/birding-tours/" target="_blank">Free Birding Tours</a></h3>
  <p class="meta"><strong>8:00 am to 9:00 am</strong> | <strong>FREE</strong> | Lake Norman State Park</p>
</div></div>
`;

// Mirrors /events/calendar/<MM-YYYY>/ — a grid of td.calendar-day cells, each
// showing at most four events plus a "+N more events" link to the day page.
const MONTH_HTML = `
<table class="lotc-calendar">
<tr class="calendar-row">
  <td class="calendar-day-np"> </td>
  <td class="calendar-day"><div class="content">
    <div class="day-number"><a href="https://www.charlotteonthecheap.com/events/view-date/08-01-2026/">1</a></div>
    <div class="lotc-v2 row event"><div><h3><a href="https://www.charlotteonthecheap.com/a/">Event A</a></h3>
      <p class="meta"><strong>All Day</strong> | <strong>FREE</strong> | Venue A</p></div></div>
    <div class="lotc-v2 row event"><div><h3><a href="https://www.charlotteonthecheap.com/b/">Event B</a></h3>
      <p class="meta"><strong>7:00 pm</strong> | <strong>FREE</strong> | Venue B</p></div></div>
    <a href="https://www.charlotteonthecheap.com/events/view-date/08-01-2026/">+23 more events &raquo;</a>
  </div></td>
  <td class="calendar-day"><div class="content">
    <div class="day-number"><a href="https://www.charlotteonthecheap.com/events/view-date/08-02-2026/">2</a></div>
    <div class="lotc-v2 row event"><div><h3><a href="https://www.charlotteonthecheap.com/c/">Event C</a></h3>
      <p class="meta"><strong>9:00 am</strong> | <strong>FREE</strong> | Venue C</p></div></div>
  </div></td>
</tr>
</table>
`;

describe('toDatePath / toMonthPath', () => {
  // The site routes on US M-D-YYYY, not ISO. An ISO segment is silently parsed
  // as garbage (the live site renders "Thursday, January 1, 1970"), so this
  // conversion is load-bearing — a wrong format fails quietly, not loudly.
  it('converts an ISO date to the site’s M-D-YYYY day path', () => {
    expect(toDatePath('2026-07-25')).toBe('7-25-2026');
    expect(toDatePath('2026-08-04')).toBe('8-4-2026');
    expect(toDatePath('2026-12-25')).toBe('12-25-2026');
  });

  it('converts an ISO month to the site’s MM-YYYY calendar path', () => {
    expect(toMonthPath('2026-08')).toBe('08-2026');
    expect(toMonthPath('2026-12')).toBe('12-2026');
  });

  it('rejects a malformed date rather than emitting an epoch-yielding path', () => {
    expect(() => toDatePath('25-07-2026')).toThrow();
    expect(() => toDatePath('not-a-date')).toThrow();
    expect(() => toMonthPath('2026-13')).toThrow();
  });
});

describe('parseDayPage', () => {
  it('extracts the heading date', () => {
    expect(parseDayPage(DAY_HTML).date).toBe('2026-07-25');
  });

  it('parses every row, including the image-column featured variant', () => {
    const { events } = parseDayPage(DAY_HTML);
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      title: 'Theatre on the Beach: Tristan & Isolde',
      time: '7:00 pm',
      price: 'FREE',
      venue: 'Jetton Park',
    });
  });

  it('decodes entities in titles', () => {
    const { events } = parseDayPage(DAY_HTML);
    expect(events[1].title).toBe('Queen’s Feast — Restaurant Week');
  });

  it('splits meta into time, price and venue', () => {
    const { events } = parseDayPage(DAY_HTML);
    expect(events[1]).toMatchObject({
      time: 'All Day',
      price: '$30.00-55.00',
      venue: 'Charlotte, NC (many locations)',
    });
    expect(events[3]).toMatchObject({
      time: '8:00 am to 9:00 am',
      price: 'FREE',
      venue: 'Lake Norman State Park',
    });
  });

  it('treats a two-segment meta as time + venue, leaving price null', () => {
    // Not time + price: mis-assigning the venue to `price` would report
    // "AMC Theatres, participating locations" as this event's cost.
    const { events } = parseDayPage(DAY_HTML);
    expect(events[2]).toMatchObject({
      time: 'All Day',
      price: null,
      venue: 'AMC Theatres, participating locations',
    });
  });

  it('flags free events', () => {
    const { events } = parseDayPage(DAY_HTML);
    expect(events.map((e) => e.is_free)).toEqual([true, false, false, true]);
  });

  it('keeps the post URL so a caller can fetch the full write-up', () => {
    expect(parseDayPage(DAY_HTML).events[3].url).toBe(
      'https://www.charlotteonthecheap.com/birding-tours/',
    );
  });

  it('returns an empty list for a page with no events', () => {
    expect(parseDayPage('<html><body>nothing</body></html>').events).toEqual([]);
  });
});

describe('parseMonthPage', () => {
  it('groups events by day with the ISO date of each cell', () => {
    const days = parseMonthPage(MONTH_HTML);
    expect(days.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('reports the true per-day total, not just the shown preview', () => {
    // The cell shows at most four events; the "+N more" link carries the rest.
    // Reporting 2 here would understate Aug 1 by 23 events.
    const [aug1, aug2] = parseMonthPage(MONTH_HTML);
    expect(aug1.shown).toBe(2);
    expect(aug1.total).toBe(25);
    expect(aug1.truncated).toBe(true);
    expect(aug2).toMatchObject({ shown: 1, total: 1, truncated: false });
  });

  it('parses the preview events within each day', () => {
    const [aug1] = parseMonthPage(MONTH_HTML);
    expect(aug1.events.map((e) => e.title)).toEqual(['Event A', 'Event B']);
    expect(aug1.events[0]).toMatchObject({ time: 'All Day', price: 'FREE', venue: 'Venue A' });
  });

  it('returns an empty list for a page with no calendar cells', () => {
    expect(parseMonthPage('<html><body>nothing</body></html>')).toEqual([]);
  });
});
