import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(root, 'scripts', 'check-binary-hygiene.mjs');
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const run = (dir, args = []) => spawnSync(process.execPath, [scriptPath, ...args], { cwd: dir, env: gitEnv, encoding: 'utf8' });
const fixture = () => mkdtempSync(join(tmpdir(), 'binary-hygiene-'));
const init = dir => {
  spawnSync('git', ['init', '-q'], { cwd: dir, env: gitEnv });
  spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir, env: gitEnv });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv });
};
const commit = dir => {
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  spawnSync('git', ['commit', '-qm', 'fixture'], { cwd: dir, env: gitEnv });
};
const bytes = (size, value = 7) => Buffer.alloc(size, value);

test('staged additions pass when they are small and unique', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true })); init(dir);
  writeFileSync(join(dir, 'README.md'), 'base'); commit(dir);
  mkdirSync(join(dir, 'icons')); writeFileSync(join(dir, 'icons', 'new.png'), bytes(1024));
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /1 new binary/);
});

test('new binary over 10 MiB is rejected', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true })); init(dir);
  writeFileSync(join(dir, 'README.md'), 'base'); commit(dir);
  writeFileSync(join(dir, 'large.glb'), bytes(10 * 1024 * 1024 + 1));
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  const result = run(dir);
  assert.equal(result.status, 1); assert.match(result.stderr, /large\.glb.*10 MiB/);
});

test('new exact duplicate of an existing tracked binary is rejected', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true })); init(dir);
  writeFileSync(join(dir, 'old.png'), bytes(2048, 3)); commit(dir);
  writeFileSync(join(dir, 'copy.png'), bytes(2048, 3));
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  const result = run(dir);
  assert.equal(result.status, 1); assert.match(result.stderr, /copy\.png.*duplicate.*old\.png/);
});

test('missing base revision fails closed', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true })); init(dir);
  writeFileSync(join(dir, 'README.md'), 'base'); commit(dir);
  const result = run(dir, ['--base', 'does-not-exist']);
  assert.equal(result.status, 1); assert.match(result.stderr, /cannot resolve base revision/);
});

test('new binary aggregate growth over 25 MiB is rejected', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true, force: true })); init(dir);
  writeFileSync(join(dir, 'README.md'), 'base'); commit(dir);
  for (const name of ['one.png', 'two.png', 'three.png']) writeFileSync(join(dir, name), bytes(9 * 1024 * 1024, name.length));
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  const result = run(dir);
  assert.equal(result.status, 1); assert.match(result.stderr, /aggregate.*25 MiB/);
});
