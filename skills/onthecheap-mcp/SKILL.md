---
name: onthecheap-mcp
description: Find free and cheap things to do in a US city — daily event listings with times, prices and venues, plus searchable deals, festivals, kids activities and local guides from the On the Cheap network (Charlotte, Denver, Atlanta, Chicago, Columbus, Seattle, Kansas City, South Florida, Orlando, Portland, Richmond, Southern Maine, the Triangle). Use when the user asks what's happening locally, wants free or cheap things to do on a date or weekend, or asks about local deals, festivals, or family activities.
---

# On the Cheap

Reads the [On the Cheap](https://livingonthecheap.com) network — local guides to
free and cheap things to do across ~14 US cities. Everything is read-only and
needs no credentials.

## Always name the city

**Every tool except `otc_list_sites` takes a required `site` argument, and there
is no default.** Pick the key that matches the city the user means; if you're not
sure one exists, call `otc_list_sites` first. Common aliases work (`milehigh`,
`raleigh`, `rva`, `kc`, `southflorida`).

An unknown key is refused with the valid ones listed, so you'll never silently
read the wrong city — but do check that the key you picked is the city the user
actually asked about. Every result echoes back `site` and `site_name`.

Because the whole network is reachable, you can answer across cities in one go —
comparing a weekend in Denver and Portland is just two calls.

**Category and location ids are per-site.** Each site is a separate WordPress
install, so an id from `otc_list_categories` is only meaningful against that
same `site`. Reusing one across cities filters to something unrelated rather
than erroring.

The `national` site (Living On The Cheap) covers US-wide deals and has **no
local events calendar**. The event tools reject it with an explanatory error;
use `otc_search_posts` with `site: "national"` for national deals.

## Picking the right tool

- **What's on for a date** → `otc_list_events` with an ISO `date`
  (defaults to today). Each listing has its time, price and venue. Add
  `free_only: true` for no-cost listings only.
- **Scan or compare a whole month** → `otc_events_month_overview`.
- **Find articles by topic, place or text** → `otc_search_posts`
  (`query`, `category`, `location`, `after`/`before`).
- **Read one article in full** → `otc_get_post` with an id, slug, or URL.
- **Discover filter ids** → `otc_list_categories`, `otc_list_locations`.
- **Find which cities exist** → `otc_list_sites` (the only tool with no `site`).

## Typical flow

Pass `site` on every one of these calls.

For "what's free this weekend?", call `otc_list_events` once per date with
`free_only: true` — the events calendar is per-day, so a weekend is two calls
(three over a long weekend). Give the user the title, time and venue, and offer
`otc_get_post` on anything they want details for.

For a topic ("free museum days", "kids stuff in Lake Norman"), search instead:
resolve the category or location id first if you need to filter — against the
same `site` — then `otc_search_posts`.

## Two behaviours to get right

**Month overviews are previews.** The calendar renders at most four listings
per day. In `otc_events_month_overview`, each day's `events` is a *preview*
while `total` is the day's real count — for one August that was 124 previewed
against 510 actual. Use `total` when telling the user how much is on, and call
`otc_list_events` for a date to get that day's full schedule. Never present the
preview as the complete list.

**Expired deals are hidden by default.** Retired offers are parked in an
`expired` category and excluded from searches, so results reflect things still
available. Only pass `include_expired: true` when the user is explicitly
researching past deals or history — and say so when those results are shown,
since the offers no longer stand.

## Dates

Pass dates as ISO `YYYY-MM-DD` (and months as `YYYY-MM`). The tools convert to
whatever the site expects and reject a malformed date rather than guessing.
Resolve relative dates ("this Saturday") against today before calling.
