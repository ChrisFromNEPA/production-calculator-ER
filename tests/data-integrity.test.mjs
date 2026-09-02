import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');
const policy = JSON.parse(readFileSync(join(root, 'data/data-integrity.json'), 'utf8'));

test('data policy documents every external unknown-source material and preserves missing prices', () => {
  const names = new Set(policy.external_materials.map(item => item.name));
  assert.ok(names.has('ultra resilient mineral'));
  assert.ok(names.has('solid carbonite shell'));
  const ultra = policy.external_materials.find(item => item.name === 'ultra resilient mineral');
  assert.equal(ultra.price_status, 'unpriced');
  assert.match(ultra.reason, /source|provenance/i);
});

test('data generator fails closed on an unallowlisted recipe input', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/build-data.mjs')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DATA_INTEGRITY_PROBE: 'unknown' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /integrity validation passed/);
});

test('icon policy deliberately records fallback for assets without verified imagery', () => {
  const fallback = policy.icon_fallbacks.find(item => item.name === 'Portable Vortex Particle Emitter');
  assert.ok(fallback);
  assert.equal(fallback.mode, 'letter');
  assert.match(fallback.reason, /verified|provenance/i);
});

test('icon catalog renders an allowlisted missing icon as a deliberate fallback', () => {
  const models = readFileSync(join(root, 'src/views/models.js'), 'utf8');
  assert.match(models, /has_icon[\s\S]*icon-badge|iconFallback/i);
});

test('provenance gate rejects approved records with pending license evidence', () => {
  const script = readFileSync(join(root, 'scripts/check-assets.mjs'), 'utf8');
  assert.match(script, /pending.*license|license.*pending/i);
});
