#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { OtcRegistry } from './registry.js';
import { VERSION } from './version.js';
import { registerPostTools } from './tools/posts.js';
import { registerEventTools } from './tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from './tools/taxonomy.js';

// One registry serves the whole network: every tool takes a `site` argument and
// the registry hands out (and reuses) a client per city.
const registry = new OtcRegistry();

await runMcp({
  name: 'onthecheap-mcp',
  version: VERSION,
  banner:
    '[onthecheap-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  deps: registry,
  tools: [registerPostTools, registerEventTools, registerTaxonomyTools, registerUtilityTools],
});
