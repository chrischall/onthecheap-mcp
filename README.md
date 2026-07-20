# onthecheap-mcp

MCP server for the [On the Cheap](https://livingonthecheap.com) network — local
guides to free and cheap things to do across 14 US cities. Daily event listings
with times, prices and venues, plus a searchable archive of deals and guides.

> Developed and maintained by AI (Claude Code). Use at your own discretion.

**No credentials required.** Every site is public, so the server reads them
server-side over plain HTTPS. There is nothing to configure beyond which city
you want, and no browser extension involved.

## Install

```bash
npx onthecheap-mcp
```

Or as a Claude Code plugin:

```
/plugin marketplace add chrischall/onthecheap-mcp
/plugin install onthecheap-mcp
```

## Choosing a city

One server reads one site. Set `OTC_SITE` to a city key — it defaults to
`charlotte`:

| Key | Site | Area |
| --- | --- | --- |
| `charlotte` | Charlotte On The Cheap | Charlotte, NC |
| `denver` | Mile High on the Cheap | Denver, CO |
| `atlanta` | Atlanta on the Cheap | Atlanta, GA |
| `chicago` | Chicago on the Cheap | Chicago, IL |
| `columbus` | Columbus on the Cheap | Columbus, OH |
| `seattle` | Greater Seattle on the Cheap | Seattle–Tacoma |
| `kansascity` | Kansas City on the Cheap | Kansas City |
| `miami` | South Florida on the Cheap | Miami / Broward / Palm Beach |
| `orlando` | Orlando on the Cheap | Orlando, FL |
| `portland` | Portland Living on the Cheap | Portland, OR |
| `richmond` | RVA on the Cheap | Richmond, VA |
| `southernmaine` | Southern Maine on the Cheap | Southern Maine |
| `triangle` | Triangle on the Cheap | Raleigh / Durham / Chapel Hill |
| `national` | Living On The Cheap | US-wide deals (no local events calendar) |

Common aliases work too — `milehigh`, `raleigh`, `rva`, `kc`, `southflorida`.
`otc_list_sites` reports the same list and which site is active.

## Tools

All tools are read-only and act on the configured site. The two event tools are
**not registered for `national`**, which has no local events calendar.

| Tool | What it does |
| --- | --- |
| `otc_list_events` | Everything on a given day — time, price, venue. `free_only` filters to no-cost listings. Defaults to today. |
| `otc_events_month_overview` | Day-by-day counts for a month, to find the busiest days. Each day's list is a preview; `total` is the real count. |
| `otc_search_posts` | Search articles by text, category, location and date range. Returns slim summaries by default. |
| `otc_get_post` | One article in full, as readable text or raw HTML. Accepts an id, slug, or URL. |
| `otc_list_categories` | Category ids and post counts, for filtering searches by topic. |
| `otc_list_locations` | Local area ids and post counts, for filtering geographically. |
| `otc_list_sites` | The cities in the network, and which one is active. |
| `otc_healthcheck` | Confirm the configured site is reachable. |

### Examples

> What's free in Charlotte this Saturday?

> Find kids' events in Lake Norman in August

> Any free museum days coming up?

## Two things worth knowing

**Retired deals are excluded by default.** Each site parks expired offers in an
`expired` category, so searches skip them and you don't get deals that no
longer exist. Pass `include_expired: true` to search the archive. The category's
id differs on every site, so it's resolved by slug at request time — a
hardcoded id silently disables the filter elsewhere.

**Month overviews are previews, with honest counts.** The calendar shows at
most four listings per day. `otc_events_month_overview` reports each day's
*true* total alongside the preview — call `otc_list_events` with a date for the
complete schedule.

## Configuration

| Env var | Purpose |
| --- | --- |
| `OTC_SITE` | Which city to read (default `charlotte`). |
| `OTC_BASE_URL` | Advanced: an explicit site URL, overriding `OTC_SITE`. |

## Hosted connector (optional)

The same tools can run as a Cloudflare Worker, making them reachable from
claude.ai on the web, desktop and mobile rather than only from a machine with
this package installed. Because the sites are public, connecting asks for
nothing — the login page is a single "Authorize" button and no credentials are
stored. One Worker serves one city.

It's a manual deploy into your own Cloudflare account: see
[`docs/DEPLOY-CONNECTOR.md`](docs/DEPLOY-CONNECTOR.md).

## Development

```bash
npm install
npm test          # node suite
npm run worker:test   # Workers-runtime suite
npm run build
```

See [`docs/OTC-API.md`](docs/OTC-API.md) for the verified data surface,
including the events calendar's US `M-D-YYYY` date routing (an ISO date is
silently parsed as 1970), the month-view truncation, and why term ids are never
hardcoded.

## License

MIT
