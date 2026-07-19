# Charlotte On The Cheap — data surface

Everything here was verified live against `https://www.charlotteonthecheap.com`
on 2026-07-19. No credentials of any kind are involved: the site is public,
reachable server-side with plain `curl`, and there is no bot wall — so this
repo uses no browser bridge.

## Two surfaces

| | Articles | Events |
| --- | --- | --- |
| Transport | WordPress REST API (JSON) | Server-rendered HTML |
| Path | `/wp-json/wp/v2/...` | `/events/view-date/...`, `/events/calendar/...` |
| Auth | none | none |
| Parsed by | `src/client.ts` | `src/events.ts` |

The site runs WordPress 6.9.4. Its taxonomies reference `event`, `venue` and
`business-offers` post types, but those are **not registered with the REST
API** — `/wp-json/wp/v2/event` returns 404. Events are therefore parsed from
the events plugin's rendered HTML, which is why `src/events.ts` exists.

## Articles — WordPress REST

Base: `https://www.charlotteonthecheap.com/wp-json/wp/v2`

```
GET /posts?search=free+museum&categories=13&locations=6276&after=2026-01-01T00:00:00&per_page=20
GET /posts/<id>
GET /posts?slug=<slug>
GET /categories?per_page=100&orderby=count&order=desc
GET /locations?per_page=100&orderby=count&order=desc
```

Verified counts (2026-07-19): 8,547 posts total, 51 categories, 42 locations.

Notes that shaped the client:

- **`X-WP-Total` / `X-WP-TotalPages`** carry the result count. A missing header
  is reported as `null`, not `0` — an unknown total is not an empty one.
- **`_fields`** projects the response server-side. Compact searches request only
  summary fields, because a full record carries a ~20 KB rendered `content`.
- **Rendered fields stay entity-encoded** — `title.rendered` comes back as
  `Back to School Bashes &#8212; free supplies`. Anything user-facing is decoded
  (`src/normalize.ts`).
- **`after` / `before` compare against a full timestamp**, so a bare date is
  widened to `T00:00:00` / `T23:59:59`. Without that, `before` drops the posts
  published on the boundary day itself.
- **The `expired` category (id 6193, 2,774 posts)** holds retired deals.
  Excluded by default via `categories_exclude`; opt back in with
  `include_expired`. Verified that expired posts are *recategorised* rather than
  dual-tagged, so exclusion does not silently drop live topical posts.

## Events — rendered HTML

### Date routing is US `M-D-YYYY`, not ISO

This is the single most important detail, and it fails silently:

```
/events/view-date/7-25-2026/     ->  Saturday, July 25, 2026   (37+ listings)
/events/calendar/08-2026/        ->  the August 2026 grid
/events/view-date/2026-07-25/    ->  Thursday, January 1, 1970 (!)
```

An ISO segment does **not** 404 — the plugin parses it to a nonsense timestamp
and renders the epoch, so a wrong format returns confidently wrong data.
`toDatePath` / `toMonthPath` validate and convert before any request is issued,
and are covered by tests.

Both padded (`08-01-2026`) and unpadded (`8-1-2026`) day segments work.

### Day page markup

```html
<h2 class="lotc-event">Saturday, July 25, 2026</h2>
<div class="lotc-v2 row event">
  <div class="col-sm-12"><h3><a href="...">Title</a></h3>
  <p class="meta"><strong>8:00 am to 9:00 am</strong> | <strong>FREE</strong> | Lake Norman State Park</p>
</div></div>
```

- `p.meta` is `time | price | venue` — **but not always**. Listings without a
  price emit two segments (`All Day | AMC Theatres, participating locations`).
  Reading positionally would report a venue as the cost, so the parser only
  treats a segment as a price when it looks like one.
- **Featured listings nest differently**: an image column plus `col-sm-9`
  instead of the plain `col-sm-12`. Parsing via the event containers handles
  both; a regex over the row markup silently drops featured events (it did —
  it under-counted 2026-07-25 by one).

### Month pages are truncated — read `total`, not the row count

Each `td.calendar-day` renders **at most four** listings plus a
`+N more events` link. For 2026-08:

| | value |
| --- | --- |
| listings rendered across the grid | 124 |
| true total (`shown + N more`, summed) | **510** |

Verified against the authoritative day page: the grid reports 27 for
2026-08-01 (4 shown + 23 more) and `/events/view-date/8-1-2026/` returns
exactly 27. So `parseMonthPage` returns a per-day `total` alongside the
preview, and `cotc_events_month_overview` says so in its output. Taking the
rendered rows as the month's schedule would understate it by ~76%.

## Deliberately not used

- **`fpx` / the fetchproxy browser bridge.** Every endpoint above is reachable
  server-side with no credentials, so routing through a signed-in tab would add
  a browser extension dependency and buy nothing.
- **A browser-like `User-Agent`.** The client identifies itself as
  `charlotteonthecheap-mcp/<version>` with a link to this repo. This is a public
  API being read as intended.
