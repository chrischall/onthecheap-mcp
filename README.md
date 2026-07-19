# charlotteonthecheap-mcp

MCP server for [Charlotte On The Cheap](https://www.charlotteonthecheap.com) —
free and cheap things to do in Charlotte, NC. Daily event listings with times,
prices and venues, plus a searchable archive of deals and local guides.

> Developed and maintained by AI (Claude Code). Use at your own discretion.

**No credentials required.** The site is public, so the server reads it
server-side over plain HTTPS. There is nothing to configure and no browser
extension involved.

## Install

```bash
npx charlotteonthecheap-mcp
```

Or as a Claude Code plugin:

```
/plugin marketplace add chrischall/charlotteonthecheap-mcp
/plugin install charlotteonthecheap-mcp
```

## Tools

All tools are read-only.

| Tool | What it does |
| --- | --- |
| `cotc_list_events` | Everything on a given day — time, price, venue. `free_only` filters to no-cost listings. Defaults to today. |
| `cotc_events_month_overview` | Day-by-day counts for a month, to find the busiest days. Each day's list is a preview; `total` is the real count. |
| `cotc_search_posts` | Search articles by text, category, location and date range. Returns slim summaries by default. |
| `cotc_get_post` | One article in full, as readable text or raw HTML. Accepts an id, slug, or URL. |
| `cotc_list_categories` | Category ids and post counts, for filtering searches by topic. |
| `cotc_list_locations` | Charlotte-area location ids and post counts, for filtering geographically. |
| `cotc_healthcheck` | Confirm the site is reachable. |

### Examples

> What's free in Charlotte this Saturday?

> Find kids' events in Lake Norman in August

> Any free museum days coming up?

## Two things worth knowing

**Retired deals are excluded by default.** About a third of the site's 8,547
posts live in an `expired` category. Searches skip them so you don't get offers
that no longer exist; pass `include_expired: true` to search the archive.

**Month overviews are previews, with honest counts.** The site's calendar shows
at most four listings per day. `cotc_events_month_overview` reports each day's
*true* total alongside the preview — call `cotc_list_events` with a date for the
complete schedule.

## Configuration

| Env var | Purpose |
| --- | --- |
| `COTC_BASE_URL` | Optional. Override the site base URL. |

## Development

```bash
npm install
npm test
npm run build
```

See [`docs/COTC-API.md`](docs/COTC-API.md) for the verified data surface,
including the events calendar's US `M-D-YYYY` date routing (an ISO date is
silently parsed as 1970) and the month-view truncation.

## License

MIT
