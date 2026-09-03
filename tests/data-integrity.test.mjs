import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import harness from './harness.mjs';

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
  const temp = mkdtempSync(join(tmpdir(), 'er-data-integrity-'));
  try {
    mkdirSync(join(temp, 'scripts'));
    mkdirSync(join(temp, 'data'));
    mkdirSync(join(temp, 'src'));
    cpSync(join(root, 'scripts/build-data.mjs'), join(temp, 'scripts/build-data.mjs'));
    cpSync(join(root, 'data/data-integrity.json'), join(temp, 'data/data-integrity.json'));
    symlinkSync(join(root, 'icons'), join(temp, 'icons'), 'dir');
    const gameData = JSON.parse(readFileSync(join(root, 'data/game_data.json'), 'utf8'));
    const recipe = gameData.recipes.find(entry => Array.isArray(entry.inputs) && entry.inputs.length);
    recipe.inputs[0].item = 'unallowlisted audit mineral';
    writeFileSync(join(temp, 'data/game_data.json'), JSON.stringify(gameData));
    const result = spawnSync(process.execPath, [join(temp, 'scripts/build-data.mjs')], {
      cwd: temp, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'generator must reject an unresolved input');
    assert.match(result.stderr, /unallowlisted audit mineral.*no source or explicit external-material allowlist/s);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
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

test('runtime icon rendering avoids 404 requests for deliberate fallbacks', () => {
  for (const item of ['Portable Vortex Particle Emitter', 'ultra resilient mineral', 'Pythica Sustained Gloves']) {
    const html = harness.iconFor(item);
    assert.match(html, /icon-badge/);
    assert.doesNotMatch(html, /<img\b/);
  }
});

test('provenance gate rejects approved records with pending license evidence', () => {
  const script = readFileSync(join(root, 'scripts/check-assets.mjs'), 'utf8');
  assert.match(script, /pending.*license|license.*pending/i);
});
