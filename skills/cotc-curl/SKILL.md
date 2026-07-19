---
name: cotc-curl
description: Query Charlotte On The Cheap (charlotteonthecheap.com) from the shell with curl and jq — daily Charlotte event listings with times/prices/venues, plus searchable articles on free and cheap local things to do. Use when the user wants Charlotte event or deal data and the charlotteonthecheap MCP server is not available.
---

# Charlotte On The Cheap via curl

`charlotteonthecheap.com` is a public WordPress site with an open REST API and
no bot wall, so it is read directly with `curl` — **no API key, no login, no
browser bridge**. Nothing needs installing beyond `curl` and `jq`.

If the `charlotteonthecheap` MCP server is available, prefer its tools; they
handle the date-format and truncation traps below for you. This skill is the
fallback.

```bash
BASE=https://www.charlotteonthecheap.com
UA='charlotteonthecheap-skill (+https://github.com/chrischall/charlotteonthecheap-mcp)'
```

## Articles — JSON

```bash
# Search (slim fields; drop _fields for full records)
curl -sA "$UA" "$BASE/wp-json/wp/v2/posts?search=free+museum&per_page=10&categories_exclude=6193&_fields=id,slug,date,link,title,excerpt" | jq -r '.[] | "\(.date[0:10])  \(.title.rendered)"'

# One article by slug
curl -sA "$UA" "$BASE/wp-json/wp/v2/posts?slug=<slug>" | jq -r '.[0].content.rendered'

# Filter ids
curl -sA "$UA" "$BASE/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc&_fields=id,slug,count" | jq -r '.[] | "\(.id)\t\(.count)\t\(.slug)"'
```

**Always pass `categories_exclude=6193`.** Category 6193 is `expired` — about a
third of the site's 8,547 posts are retired deals. Without it you will show the
user offers that no longer exist.

Titles and excerpts come back HTML-entity-encoded (`&#8217;`, `&#8212;`). See
`references/recipes.md` for a decode filter.

## Events — HTML

Events are **not** in the REST API (`/wp-json/wp/v2/event` → 404); they are
parsed from rendered HTML.

```bash
# One day  — note the US M-D-YYYY order
curl -sLA "$UA" "$BASE/events/view-date/7-25-2026/"

# One month
curl -sLA "$UA" "$BASE/events/calendar/08-2026/"
```

### The date format fails silently — get it right

The path is US **`M-D-YYYY`**, not ISO. An ISO date does not 404; it parses to
a nonsense timestamp and renders **January 1, 1970**, so you get confidently
wrong data:

```
/events/view-date/7-25-2026/    ->  Saturday, July 25, 2026   ✅
/events/view-date/2026-07-25/   ->  Thursday, January 1, 1970 ❌
```

Always confirm the `h2.lotc-event` heading matches the date you asked for.

### Month pages are truncated

Each calendar cell shows at most **four** listings plus a `+N more events`
link. For August 2026 the grid renders 124 listings against a true total of
510. Use the month view to find busy days, then fetch the day page for the
complete schedule — never present the grid as the full month.

See `references/recipes.md` for ready-to-run extraction commands.
