import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const buildPages = readFileSync(join(root, 'scripts', 'build-pages.mjs'), 'utf8');
const allowlist = JSON.parse(readFileSync(join(root, 'public-files.json'), 'utf8'));

test('Pages build uses an explicit runtime allowlist rather than whole directories', () => {
  assert.match(buildPages, /runtime|allowlist|manifest/i);
  assert.doesNotMatch(buildPages, /fs\.cpSync\([^\n]+\{ recursive: true \}/);
  for (const excluded of ['textures_extracted', 'skins_test', 'gallery', 'stats', 'logo']) {
    assert.doesNotMatch(buildPages, new RegExp(`['"]${excluded}['"]`), `must not ship ${excluded}`);
  }
  assert.ok(Array.isArray(allowlist.runtime), 'public-files.json must define runtime entries');
  for (const required of ['models/**/*.glb', 'models/models_manifest.json', 'models/character_skins.json', 'models/skins/**/*.webp', 'maps/*.png', 'icons/*.png', 'gear_textures/**/*.png', 'voice_extracted/*.ogg', 'fonts/*.woff2']) {
    assert.ok(allowlist.runtime.includes(required), `missing runtime entry: ${required}`);
  }
  for (const representative of ['gear_textures/CMG/TorsoArmour.png', 'gear_textures/EC/Helmet.png', 'gear_textures/BOS/LegPads.png']) {
    assert.equal(existsSync(join(root, representative)), true, `missing source gear texture: ${representative}`);
    assert.ok(allowlist.runtime.includes('gear_textures/**/*.png'), `missing allowlist coverage: ${representative}`);
  }
  for (const forbidden of ['textures_extracted', 'skins_test', 'gallery', 'stats', 'logo', 'uv_grid.png']) {
    assert.equal(allowlist.runtime.some(entry => entry === forbidden || entry.startsWith(`${forbidden}/`)), false, `must not ship ${forbidden}`);
  }
});

test('Pages artifact has explicit total byte and file budgets', () => {
  assert.equal(typeof allowlist.budgets?.max_bytes, 'number');
  assert.equal(typeof allowlist.budgets?.max_files, 'number');
  assert.ok(allowlist.budgets.max_bytes <= 200 * 1024 * 1024);
  assert.ok(allowlist.budgets.max_files <= 3000);
});
