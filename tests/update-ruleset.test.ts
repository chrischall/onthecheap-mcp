import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// scripts/update-ruleset.sh rewrites branch protection, so its no-argument
// default must name THIS repo. It still pointed at the pre-rename single-city
// repo, chrischall/charlotteonthecheap-mcp (fleet-audit#624).
describe('scripts/update-ruleset.sh', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));

  it('defaults to the repository package.json names', () => {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
    const url: string = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url;
    const slug = /github\.com[/:]([^/]+\/[^/.]+)/.exec(url)?.[1];
    expect(slug).toBe('chrischall/onthecheap-mcp');

    const script = readFileSync(`${root}/scripts/update-ruleset.sh`, 'utf8');
    const fallback = /^REPO="\$\{1:-([^}]+)\}"/m.exec(script)?.[1];
    expect(fallback).toBe(slug);
  });
});
