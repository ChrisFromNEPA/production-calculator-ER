import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const retiredPaths = [
  'models',
  'textures_extracted',
  'skins_test',
  'gallery',
  'logo',
  'uv_grid.png',
  'scripts/pipeline_drama.py',
  'scripts/convert_dtx.py',
];

const retiredDocs = [
  'docs/calculator-refinements.md',
  'docs/gear-110-refinements.md',
  'docs/maintainer-audit-2026-08-28.md',
  'docs/public-player-audit.md',
];

test('current checkout excludes retired extraction and presentation artifacts', () => {
  for (const path of [...retiredPaths, ...retiredDocs]) {
    assert.equal(existsSync(join(root, path)), false, `${path} should not exist`);
    assert.equal(
      tracked.some(file => file === path || file.startsWith(`${path}/`)),
      false,
      `${path} should not be tracked`,
    );
  }
});

test('retired extraction workspaces stay ignored after cleanup', () => {
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
  for (const path of ['models/', 'textures_extracted/', 'skins_test/', 'gallery/', 'logo/', 'uv_grid.png']) {
    assert.match(gitignore, new RegExp(`^${path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  }
});

test('tracked checkout stays within a focused source budget', () => {
  const totalBytes = tracked.reduce((total, file) => total + statSync(join(root, file)).size, 0);
  assert.ok(tracked.length <= 2000, `tracked file count ${tracked.length} exceeds 2000`);
  assert.ok(totalBytes <= 40 * 1024 * 1024, `tracked bytes ${totalBytes} exceed 40 MiB`);
});

test('provenance and deployment metadata describe only current assets', () => {
  const provenance = JSON.parse(readFileSync(join(root, 'data/asset-provenance.json'), 'utf8'));
  const publicFiles = JSON.parse(readFileSync(join(root, 'public-files.json'), 'utf8'));
  const retiredGlobs = new Set([
    'models/**',
    'textures_extracted/**',
    'skins_test/**',
    'gallery/**',
    'logo/**',
    'uv_grid.png',
  ]);
  assert.deepEqual(
    provenance.records.filter(record => retiredGlobs.has(record.path)),
    [],
    'retired assets should not remain in the active provenance manifest',
  );
  assert.equal('excluded' in publicFiles, false, 'unused exclusion metadata should not remain');
});

test('asset documentation records the non-destructive archive boundary', () => {
  const documentation = readFileSync(join(root, 'docs/asset-provenance.md'), 'utf8');
  assert.match(documentation, /v1\.4\.1.*tag/);
  assert.match(documentation, /without rewriting history/i);
});
