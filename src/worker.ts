import { createConnector } from '@chrischall/mcp-connector';
import { CotcClient } from './client.js';
import { cotcAuth, type CotcProps } from './cotc-auth.js';
import { VERSION } from './version.js';
import { registerPostTools } from './tools/posts.js';
import { registerEventTools } from './tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from './tools/taxonomy.js';

// The Cloudflare remote-connector entrypoint: wires the same tool registrars
// the stdio server uses (`src/index.ts`) into `@chrischall/mcp-connector`'s
// OAuth + McpAgent harness, so Charlotte On The Cheap is reachable from
// claude.ai rather than only from a terminal on one machine.
//
// The FULL tool set ships here, unlike connectors that have to drop a
// cookie-session or fetchproxy subset: every tool is a read of a public
// website over plain HTTPS, which is exactly what a serverless runtime can do.
//
// STATELESS — no cache and no Durable Object storage beyond the harness's own
// per-session MCP agent, so none of ofw-connector's cache plumbing applies.
//
// ZERO-AUTH — `cotcAuth` declares `fields: []`, so there is no credential to
// collect and no per-user client state; `buildClient` just points a client at
// the site. The client is constructed per grant here rather than reusing the
// stdio singleton, keeping module scope free of construction side effects.
const { Agent, handler } = createConnector<CotcProps, CotcClient>({
  name: 'charlotteonthecheap-mcp',
  version: VERSION,
  auth: cotcAuth,
  buildClient: (props) => new CotcClient({ baseUrl: props.baseUrl }),
  tools: [registerPostTools, registerEventTools, registerTaxonomyTools, registerUtilityTools],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `CotcMcpAgent`) resolves this named export.
export { Agent as CotcMcpAgent };

export default handler;
