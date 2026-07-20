# Changelog

## [0.3.0](https://github.com/chrischall/onthecheap-mcp/compare/v0.2.0...v0.3.0) (2026-07-20)


### ⚠ BREAKING CHANGES

* `OTC_SITE` and `OTC_BASE_URL` no longer select the site and are no longer read; the `site` argument is required on every tool except `otc_list_sites`. Existing per-city Worker deployments are redundant — one deployment now serves the whole network.

### Features

* serve every On the Cheap city from one server via a required `site` argument ([#15](https://github.com/chrischall/onthecheap-mcp/issues/15)) ([87d724e](https://github.com/chrischall/onthecheap-mcp/commit/87d724eb0a36dae56912474cd71991c8647a8ebd))


### Bug Fixes

* **ci:** typecheck the Worker entry and run its test suite ([#12](https://github.com/chrischall/onthecheap-mcp/issues/12)) ([d3030ee](https://github.com/chrischall/onthecheap-mcp/commit/d3030eeea9c4a91ad94091e47232856eba1de67e))

## [0.2.0](https://github.com/chrischall/onthecheap-mcp/compare/v0.1.1...v0.2.0) (2026-07-20)


### ⚠ BREAKING CHANGES

* the package, tool names and environment variables are renamed, and the hosted connector moves to a new hostname and KV namespace. Configured clients must point at onthecheap-mcp and use otc_* tools; the connector needs re-adding after redeploy.

### Features

* serve the whole On the Cheap network, resolving term ids per site ([#9](https://github.com/chrischall/onthecheap-mcp/issues/9)) ([669ca1e](https://github.com/chrischall/onthecheap-mcp/commit/669ca1e37d253589632b94143be9f45ebbd2bbfb))

## [0.1.1](https://github.com/chrischall/charlotteonthecheap-mcp/compare/v0.1.0...v0.1.1) (2026-07-19)


### Bug Fixes

* bind global fetch so the hosted connector can reach the site ([#7](https://github.com/chrischall/charlotteonthecheap-mcp/issues/7)) ([07160ff](https://github.com/chrischall/charlotteonthecheap-mcp/commit/07160ff82457eecf7fbd899769b8ad342b6359be))

## 0.1.0 (2026-07-19)


### Features

* Charlotte On The Cheap MCP server ([9aa66fe](https://github.com/chrischall/charlotteonthecheap-mcp/commit/9aa66fed2e7833f48d4307bb24536ae951d73539))
* hosted Cloudflare connector for claude.ai ([#4](https://github.com/chrischall/charlotteonthecheap-mcp/issues/4)) ([1ad8481](https://github.com/chrischall/charlotteonthecheap-mcp/commit/1ad848187989b6bb6bb58639d1dfa3767c831b7b))


### Bug Fixes

* start releases at 0.1.0 instead of 1.0.0 ([#3](https://github.com/chrischall/charlotteonthecheap-mcp/issues/3)) ([72ed400](https://github.com/chrischall/charlotteonthecheap-mcp/commit/72ed400f0b55865e21b1321f99270fd8516c40ee))
