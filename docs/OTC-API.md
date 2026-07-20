# On the Cheap — data surface

Everything here was verified live on 2026-07-19 against
`https://www.charlotteonthecheap.com`, and re-verified across the whole
network on 2026-07-20. No credentials of any kind are involved: the sites are
public, reachable server-side with plain `curl`, and there is no bot wall — so
this repo uses no browser bridge.

## The network

"On the Cheap" is ~14 sister sites on one platform (see `src/sites.ts`). Every
one answers the same WordPress REST API, carries an `expired` category and a
`locations` taxonomy, and — except the national hub, livingonthecheap.com —
serves the same `lotc` events calendar. One server reads one site, chosen with
`OTC_SITE` (or `OTC_BASE_URL`).

**Term ids are per-install and must never be hardcoded.** The `expired`
category alone spans `2, 3, 4, 379, 840, 1140, 4483, 4601, 5908, 6193, 7803,
9498, 10495, 16289` across the network. An id taken from one site silently
matches nothing on another: pointing a Charlotte-tuned client at Denver left
`categories_exclude` a no-op and served **4,187 dead deals as live**, with no
error. Ids are therefore resolved from the stable `expired` **slug** at request
time and cached per client.

## Two surfaces

| | Articles | Events |
| --- | --- | --- |
| Transport | WordPress REST API (JSON) | Server-rendered HTML |
| Path | `/wp-json/wp/v2/...` | `/events/view-date/...`, `/events/calendar/...` |
| Auth | none | none |
| Parsed by | `src/client.ts` | `src/events.ts` |

Every site runs WordPress 6.9.4. Its taxonomies reference `event`, `venue` and
`business-offers` post types, but those are **not registered with the REST
API** — `/wp-json/wp/v2/event` returns 404. Events are therefore parsed from
the events plugin's rendered HTML, which is why `src/events.ts` exists.

## Articles — WordPress REST

Base: `<site base URL>/wp-json/wp/v2`

```
GET /posts?search=free+museum&categories=13&locations=6276&after=2026-01-01T00:00:00&per_page=20
GET /posts/<id>
GET /posts?slug=<slug>
GET /categories?per_page=100&orderby=count&order=desc
GET /locations?per_page=100&orderby=count&order=desc
```

Verified counts for Charlotte (2026-07-19): 8,547 posts, 51 categories, 42 locations. Other sites range from ~283 (Southern Maine) to ~8,500 posts.

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
- **The `expired` category** holds retired deals — its id differs per site,
  so it is resolved by slug (see above). Excluded by default via
  `categories_exclude`; opt back in with `include_expired`. Verified that expired posts are *recategorised* rather than
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
preview, and `otc_events_month_overview` says so in its output. Taking the
rendered rows as the month's schedule would understate it by ~76%.

## Deliberately not used

- **`fpx` / the fetchproxy browser bridge.** Every endpoint above is reachable
  server-side with no credentials, so routing through a signed-in tab would add
  a browser extension dependency and buy nothing.
- **A browser-like `User-Agent`.** The client identifies itself as
  `onthecheap-mcp/<version>` with a link to this repo. This is a public
  API being read as intended.
