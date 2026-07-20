# Deploying the hosted connector

The connector makes the On the Cheap network reachable from **claude.ai** (web,
desktop, mobile) instead of only from Claude Code on a machine with this
package installed. It is a Cloudflare Worker wrapping the same tool registrars
the stdio server uses.

**One Worker serves the whole network.** Every tool takes a `site` argument, so
there is no `OTC_SITE` var and nothing to configure per city — a single
deployment reaches all of them. (Earlier versions pinned one city per Worker;
if you deployed several, they are now redundant and can be torn down.)

**Releases deploy automatically.** The `deploy-connector` job in
`release-please.yml` deploys the newly tagged ref through the shared
`chrischall/workflows` reusable workflow, using the repo's
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets. Any ref can also be
deployed on demand from **Actions → deploy-connector → Run workflow**. The
manual `npm run worker:deploy` below stays available for local iteration and is
what you need for the one-time setup in your own Cloudflare account.

## What makes this one unusual

It is **zero-auth**. The On the Cheap sites are public, so the login
page collects nothing: it renders a bare "Authorize" button, and the grant
stores nothing at all — not even a site, since the site is a tool argument.
That requires `@chrischall/mcp-connector`
>= 1.1.0 — earlier versions crashed on an empty `fields` array.

One consequence worth understanding: with no credentials there is no per-user
identity, so **every grant is keyed on the OAuth user id `'public'`**. That is
correct for reading a public site and nothing personal is stored, but it means
grants are not isolated per user. Don't copy this shape to a service that has
accounts.

## One-time setup

1. **Authenticate** with a token that has **Workers Scripts:Edit** and
   **Workers KV Storage:Edit** (the "Edit Cloudflare Workers" template), or run
   `wrangler login`. A read-only or zone-only token fails KV creation and
   deploy with `code: 10000` auth errors.

2. **Create this connector's own KV namespace.** Each connector needs a
   separate one, or two connectors cross-wire their OAuth grants:

   ```bash
   npx wrangler kv namespace create onthecheap-connector-oauth
   ```

3. **Paste the returned id** into `wrangler.jsonc`, replacing
   `PLACEHOLDER_RUN_KV_NAMESPACE_CREATE` in the `OAUTH_KV` binding. The binding
   *name* stays `OAUTH_KV`; only the id differs between connectors.

## Deploy

```bash
npm run worker:deploy
```

Then add `https://connector.onthecheap.nullnet.app/mcp` as a custom
connector in claude.ai and click through the authorize page.

The custom domain's edge TLS certificate provisions a few minutes **after** the
first deploy, so `https://` may fail the handshake briefly — that is normal.
Use the `*.workers.dev` URL meanwhile; the custom domain self-heals. The zone
(`nullnet.app`) must be in the deploying account.

## Verifying

```bash
npm test               # BOTH suites — node pool then the Workers pool
npm run test:node      # node pool only (faster inner loop)
npm run worker:test    # Workers pool only (OAuth discovery, 401, login page)
npm run typecheck:worker   # typechecks src/worker.ts, which tsconfig.json excludes
```

`npm run build` runs `typecheck:worker`, and `npm test` runs both pools, so CI
(`build-command: npm run build`, `test-command: npm test`) covers the Worker
entry point and its suite without needing a workflow change.

Against a live deploy, check OAuth discovery responds and `/mcp` refuses
unauthenticated calls:

```bash
curl -s https://connector.onthecheap.nullnet.app/.well-known/oauth-authorization-server | jq .
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://connector.onthecheap.nullnet.app/mcp   # expect 401
```

Hitting `/authorize` directly with a made-up `client_id` returns an error —
that is expected. claude.ai registers a client first (`/register`), and the
Workers test does the same.

## Gotchas

- **`wrangler deploy --dry-run` is not a deploy gate.** It only bundles; it
  does not run Worker startup validation. Some failures (`code: 10021`) surface
  only on a real deploy — notably a module-scope `fileURLToPath(import.meta.url)`
  for `.env` loading, or disallowed global-scope work (async I/O, timers,
  `crypto.randomUUID()`) in a module-singleton client constructor. This repo's
  `OtcClient` constructor is deliberately pure, and `src/worker.ts` builds its
  client per grant rather than at module scope.
- **`npm run worker:test` is likewise not a deploy gate** — Miniflare provides
  `import.meta.url` and does not perform startup validation.
- **A detached `globalThis.fetch` breaks every request** in the Worker with
  `Illegal invocation`, while passing `wrangler deploy` and BOTH test suites.
  The client wraps the global rather than storing it; don't "simplify" that.
  Note the Workers *test pool does not enforce this rule* — reintroducing the
  bug still returns ok there — so the guard is structural and lives in the node
  suite (it asserts the receiver passed to `fetch` is globalThis). Only
  `wrangler dev` or a real deploy reproduces the runtime error.
- **The Workers pool needs `node-html-parser` pre-bundled.** Its `css-what`
  dependency uses extensionless ESM imports the Workers module resolver
  rejects, so `vitest.workers.config.ts` enables the SSR dep optimizer for it.
  `wrangler deploy` is unaffected — esbuild resolves the extensions at build
  time.
- **`src/worker.ts` is excluded from `tsconfig.json`**, so the stdio `tsc`
  build never emits `dist/worker.js`. `src/otc-auth.ts` is *not* excluded: it
  imports the connector for types only, so it stays node-loadable and its
  logic is covered by the fast node suite.
