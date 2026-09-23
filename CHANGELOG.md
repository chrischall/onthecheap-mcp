# Changelog

## [1.1.1](https://github.com/chrischall/onthecheap-mcp/compare/v1.1.0...v1.1.1) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#93](https://github.com/chrischall/onthecheap-mcp/issues/93)) ([2be7d4f](https://github.com/chrischall/onthecheap-mcp/commit/2be7d4f24314e653ad628ec4c6ba76173804c388))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#91](https://github.com/chrischall/onthecheap-mcp/issues/91)) ([9a84904](https://github.com/chrischall/onthecheap-mcp/commit/9a8490402f0393db0c753d13745af67de9984fc0))

## [1.1.0](https://github.com/chrischall/onthecheap-mcp/compare/v1.0.0...v1.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0, fixing server/discover ([#87](https://github.com/chrischall/onthecheap-mcp/issues/87)) ([95d4e9b](https://github.com/chrischall/onthecheap-mcp/commit/95d4e9b84f25d9152cbea8480f28e8566ea99b43))

## [1.0.0](https://github.com/chrischall/onthecheap-mcp/compare/v0.4.3...v1.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#84](https://github.com/chrischall/onthecheap-mcp/issues/84))

### Features

* **mcp:** migrate server to SDK v2 ([#84](https://github.com/chrischall/onthecheap-mcp/issues/84)) ([77810e7](https://github.com/chrischall/onthecheap-mcp/commit/77810e7e2bcc1c09ff21c6a79263c1bba9d11952))

## [0.4.3](https://github.com/chrischall/onthecheap-mcp/compare/v0.4.2...v0.4.3) (2026-09-13)


### Bug Fixes

* **deps:** Bump the production-dependencies group with 2 updates ([#81](https://github.com/chrischall/onthecheap-mcp/issues/81)) ([706a43f](https://github.com/chrischall/onthecheap-mcp/commit/706a43f812c6d238bdc509a52cfa7ff505305077))

## [0.4.2](https://github.com/chrischall/onthecheap-mcp/compare/v0.4.1...v0.4.2) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#78](https://github.com/chrischall/onthecheap-mcp/issues/78)) ([d477b18](https://github.com/chrischall/onthecheap-mcp/commit/d477b187894017952fc62db3341980ab944d3dda))
* **deps:** Bump hono from 4.13.1 to 4.13.7 ([#76](https://github.com/chrischall/onthecheap-mcp/issues/76)) ([ae11aa9](https://github.com/chrischall/onthecheap-mcp/commit/ae11aa99558c6459f3ea91d4dd2876ca958c9540))
* **deps:** declare the peer floors mcp-utils 0.26.1 requires ([#79](https://github.com/chrischall/onthecheap-mcp/issues/79)) ([c248642](https://github.com/chrischall/onthecheap-mcp/commit/c24864297c4931c2730c911b55c6636ffd5a1766))

## [0.4.1](https://github.com/chrischall/onthecheap-mcp/compare/v0.4.0...v0.4.1) (2026-09-04)


### Documentation

* **skill:** document the view response shape on otc_search_posts ([#68](https://github.com/chrischall/onthecheap-mcp/issues/68)) ([c473c54](https://github.com/chrischall/onthecheap-mcp/commit/c473c547079ad71cef30b49b1bcd2dfce7774bc5))

## [0.4.0](https://github.com/chrischall/onthecheap-mcp/compare/v0.3.3...v0.4.0) (2026-09-04)


### Features

* **tools:** adopt the fleet `view` vocabulary ([#63](https://github.com/chrischall/onthecheap-mcp/issues/63)) ([77473f1](https://github.com/chrischall/onthecheap-mcp/commit/77473f13fa3fb767b0a6a6ea46fffb1a64d2813e))


### Bug Fixes

* **build:** restore the literal em dash in the package description ([#66](https://github.com/chrischall/onthecheap-mcp/issues/66)) ([0d37058](https://github.com/chrischall/onthecheap-mcp/commit/0d37058c536d28b2087c2977dd420935cbb9576f))


### Refactor

* **tools:** drop the unused textResult import from posts.ts ([#67](https://github.com/chrischall/onthecheap-mcp/issues/67)) ([ed07fe4](https://github.com/chrischall/onthecheap-mcp/commit/ed07fe437fc03796bbf7f97724fee326cd1cf673))

## [0.3.3](https://github.com/chrischall/onthecheap-mcp/compare/v0.3.2...v0.3.3) (2026-08-09)


### Bug Fixes

* **connector:** finish the retirement sweep ([#36](https://github.com/chrischall/onthecheap-mcp/issues/36)) ([d52026d](https://github.com/chrischall/onthecheap-mcp/commit/d52026d187a585ca1222fcc0766fab841e807d39))


### Refactor

* **connector:** retire the standalone Cloudflare Worker connector ([#33](https://github.com/chrischall/onthecheap-mcp/issues/33)) ([9acc48f](https://github.com/chrischall/onthecheap-mcp/commit/9acc48fb256d40d1717740f51bbfcb5e1b7d7e66))

## [0.3.2](https://github.com/chrischall/onthecheap-mcp/compare/v0.3.1...v0.3.2) (2026-07-27)


### Bug Fixes

* **posts:** reject a full URL belonging to a different site ([#27](https://github.com/chrischall/onthecheap-mcp/issues/27)) ([ed35a7c](https://github.com/chrischall/onthecheap-mcp/commit/ed35a7cd5ff9c4512e9cbf33dc762812d9e0347c))

## [0.3.1](https://github.com/chrischall/onthecheap-mcp/compare/v0.3.0...v0.3.1) (2026-07-27)


### Bug Fixes

* **deps:** require @chrischall/mcp-connector &gt;=1.1.1 ([#24](https://github.com/chrischall/onthecheap-mcp/issues/24)) ([014c386](https://github.com/chrischall/onthecheap-mcp/commit/014c386bf273041d53b89568e8d4a7e57466e866))

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
