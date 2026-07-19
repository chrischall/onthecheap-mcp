import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/worker.js';

// Runs inside the real Workers runtime (Miniflare) against wrangler.jsonc's
// bindings. Covers what the node suite structurally cannot: that the Worker
// entry point loads at all, and that the OAuth surface the connector depends
// on is mounted.

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await (worker as any).fetch(
    new Request(`https://connector.test${path}`, init),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('OAuth discovery', () => {
  it('advertises the authorization server so claude.ai can register', async () => {
    const res = await fetchWorker('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.authorization_endpoint).toContain('/authorize');
    expect(body.token_endpoint).toContain('/token');
  });

  it('rejects an unauthenticated /mcp call', async () => {
    // Without this, the connector would serve the tools to anyone who found
    // the hostname.
    const res = await fetchWorker('/mcp', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('zero-auth login page', () => {
  /**
   * Registers a client the way claude.ai does before authorizing. The OAuth
   * provider rejects an unknown client_id outright, so /authorize cannot be
   * exercised without going through dynamic client registration first.
   */
  async function registerClient(): Promise<string> {
    const res = await fetchWorker('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'worker-test',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(res.status).toBeLessThan(400);
    return ((await res.json()) as any).client_id;
  }

  it('renders an authorize page with no credential inputs', async () => {
    const clientId = await registerClient();
    const res = await fetchWorker(
      `/authorize?client_id=${encodeURIComponent(clientId)}` +
        '&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback' +
        '&response_type=code',
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Charlotte On The Cheap has no accounts: the page must not ask for any.
    expect(html).not.toMatch(/<input[^>]*type="(password|text)"/);
    expect(html).not.toContain('Secure sign-in');
    expect(html).toContain('Charlotte On The Cheap');
    // It must still be a usable form, or the grant can never complete.
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain('name="oauthReq"');
  });
});

describe('worker entry point', () => {
  it('exports the MCP agent Durable Object class wrangler binds', async () => {
    // A missing/renamed export fails only at deploy time otherwise.
    const mod: any = await import('../src/worker.js');
    expect(typeof mod.CotcMcpAgent).toBe('function');
  });

  it('binds the Durable Object and KV namespace the harness needs', () => {
    expect(env.MCP_OBJECT).toBeDefined();
    expect(env.OAUTH_KV).toBeDefined();
  });
});
