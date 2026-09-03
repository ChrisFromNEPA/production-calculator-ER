import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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
  assert.equal(allowlist.runtime.includes('src/**'), false, 'source-only JSX must not be copied by a broad src pattern');
  for (const sourcePattern of ['src/**/*.js', 'src/**/*.css']) {
    assert.ok(allowlist.runtime.includes(sourcePattern), `missing runtime source pattern: ${sourcePattern}`);
  }
  for (const required of ['maps/*.png', 'icons/*.png', 'gear_textures/**/*.png', 'voice_extracted/*.ogg', 'fonts/*.woff2']) {
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

test('Pages build rejects missing or malformed budgets instead of disabling enforcement', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'er-pages-budget-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    copyFileSync(join(root, 'scripts', 'build-pages.mjs'), join(fixture, 'scripts', 'build-pages.mjs'));
    writeFileSync(join(fixture, 'index.html'), '<!doctype html>');
    writeFileSync(join(fixture, 'public-files.json'), JSON.stringify({
      runtime: ['index.html'],
      budgets: { max_bytes: 'not-a-number', max_files: 10 },
    }));
    const run = spawnSync(process.execPath, [join(fixture, 'scripts', 'build-pages.mjs')], { cwd: fixture, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}\n${run.stderr}`, /budget/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
