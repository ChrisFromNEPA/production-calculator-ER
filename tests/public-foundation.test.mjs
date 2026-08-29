import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const forbiddenPaths = [
  'cloudflare-worker',
  'empire-rising-scraper',
  'comms',
  'flyers',
  'wrangler.toml',
  'AGENT_HANDOFF.md',
  'REFACTOR_PLAN.md',
  'data/production_requests.json',
  'data/shared_inventory.json',
  'data/shared_gear_sets.json',
  'data/colony_taxes.json',
];

test('public staging tree excludes private and Cloudflare-only material', () => {
  for (const relative of forbiddenPaths) {
    assert.equal(existsSync(join(root, relative)), false, `forbidden path remains: ${relative}`);
  }
});

test('public allowlist exists and excludes deployment/private paths', () => {
  const allowlist = JSON.parse(readFileSync(join(root, 'public-files.json'), 'utf8'));
  assert.ok(Array.isArray(allowlist.files));
  assert.ok(allowlist.files.includes('src'));
  assert.ok(allowlist.files.includes('data'));
  for (const forbidden of ['cloudflare-worker', 'wrangler.toml', '.hermes', 'empire-rising-scraper']) {
    assert.equal(allowlist.files.includes(forbidden), false, `allowlist contains ${forbidden}`);
  }
});

test('public asset provenance manifest exists and is fail-closed', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'data/asset-provenance.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.ok(manifest.records.some(record => record.status === 'approved'));
  assert.ok(manifest.records.every(record => !['pending_permission', 'unknown'].includes(record.status)));
  assert.ok(existsSync(join(root, 'docs/asset-provenance.md')));
});

test('Pages build contract and neutral public shell metadata exist', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(pkg.scripts['build:pages'], 'npm run build:3d && node scripts/build-pages.mjs');
  assert.equal(manifest.name, 'Empire Rising Production Calculator');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<title>Empire Rising Production Calculator<\/title>/);
  assert.doesNotMatch(html, /CMG Guild Production Planner|Star Citizen crafting/);
});

test('public package metadata targets the ER repository and Pages site', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.repository.url, 'git+https://github.com/ChrisFromNEPA/production-calculator-ER.git');
  assert.equal(pkg.homepage, 'https://chrisfromnepa.github.io/production-calculator-ER/');
  assert.equal(pkg.license, 'MIT');
});
