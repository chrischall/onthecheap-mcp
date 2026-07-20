#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { OtcClient } from './client.js';
import { VERSION } from './version.js';
import { registerPostTools } from './tools/posts.js';
import { registerEventTools } from './tools/events.js';
import { registerTaxonomyTools, registerUtilityTools } from './tools/taxonomy.js';

const client = new OtcClient();

await runMcp({
  name: 'onthecheap-mcp',
  version: VERSION,
  banner:
    '[onthecheap-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  deps: client,
  tools: [registerPostTools, registerEventTools, registerTaxonomyTools, registerUtilityTools],
});
