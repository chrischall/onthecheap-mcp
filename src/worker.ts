import { createConnector } from '@chrischall/mcp-connector';
import { OtcRegistry } from './registry.js';
import { otcAuth, type OtcProps } from './otc-auth.js';
import { VERSION } from './version.js';
import { registerPostTools } from './tools/posts.js';
import { registerEventTools } from './tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from './tools/taxonomy.js';

// The Cloudflare remote-connector entrypoint: wires the same tool registrars
// the stdio server uses (`src/index.ts`) into `@chrischall/mcp-connector`'s
// OAuth + McpAgent harness, so the configured On the Cheap site is reachable
// from claude.ai rather than only from a terminal on one machine.
//
// The FULL tool set ships here, unlike connectors that have to drop a
// cookie-session or fetchproxy subset: every tool is a read of a public
// website over plain HTTPS, which is exactly what a serverless runtime can do.
//
// STATELESS — no cache and no Durable Object storage beyond the harness's own
// per-session MCP agent, so none of ofw-connector's cache plumbing applies.
//
// ZERO-AUTH — `otcAuth` declares `fields: []`, so there is no credential to
// collect and no per-user client state; `buildClient` just builds a registry.
// It is constructed per grant here rather than reusing the stdio singleton,
// keeping module scope free of construction side effects.
//
// GLOBAL — one deployment serves the WHOLE network. Which city a call reads
// comes from that call's `site` argument, so there is no OTC_SITE var and no
// site recorded in the grant props. The registry keeps one client per city it
// has been asked for, which is what preserves each site's cached `expired`
// category id across calls within a session.
const { Agent, handler } = createConnector<OtcProps, OtcRegistry>({
  name: 'onthecheap-mcp',
  version: VERSION,
  auth: otcAuth,
  buildClient: () => new OtcRegistry(),
  tools: [registerPostTools, registerEventTools, registerTaxonomyTools, registerUtilityTools],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `OtcMcpAgent`) resolves this named export.
export { Agent as OtcMcpAgent };

export default handler;
