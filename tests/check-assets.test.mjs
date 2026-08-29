import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(root, 'scripts', 'check-assets.mjs');

// Isolate git from any host/user configuration that could interfere with the
// fixture repositories (autocrlf, hooks, safe.directory, etc.).
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function makeFixture() {
  return mkdtempSync(join(tmpdir(), 'check-assets-'));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function writeManifest(dir, records) {
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data', 'asset-provenance.json'), JSON.stringify({
    schema_version: 1,
    generated_at: 'test fixture',
    purpose: 'test fixture',
    policy: 'Every shipped binary asset must be approved before release.',
    records,
  }));
}

function gitInit(dir) {
  spawnSync('git', ['init', '-q'], { cwd: dir, env: gitEnv });
  spawnSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
}

function runGate(dir) {
  return spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' });
}

const approvedIcons = [{ path: 'icons/**', status: 'approved', class: 'test-fixture' }];

test('gate ignores untracked .worktrees and .hermes directories in a git checkout', (t) => {
  const dir = makeFixture();
  t.after(() => cleanup(dir));
  writeManifest(dir, approvedIcons);
  mkdirSync(join(dir, 'icons'), { recursive: true });
  writeFileSync(join(dir, 'icons', 'ok.png'), 'x');
  gitInit(dir);
  // Untracked tooling trees created after staging: exactly the scenario that
  // used to fail the gate from a main checkout containing sibling worktrees.
  mkdirSync(join(dir, '.worktrees', 't_abc', 'icons'), { recursive: true });
  writeFileSync(join(dir, '.worktrees', 't_abc', 'icons', 'other.png'), 'x');
  mkdirSync(join(dir, '.hermes'), { recursive: true });
  writeFileSync(join(dir, '.hermes', 'scratch.png'), 'x');

  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /passed for 1 binary file\(s\)/);
});

test('gate checks tracked files only, so uncommitted binaries are not gated locally', (t) => {
  const dir = makeFixture();
  t.after(() => cleanup(dir));
  writeManifest(dir, approvedIcons);
  mkdirSync(join(dir, 'icons'), { recursive: true });
  writeFileSync(join(dir, 'icons', 'ok.png'), 'x');
  gitInit(dir);
  // Not staged/committed, therefore not part of the shipped tree.
  writeFileSync(join(dir, 'icons', 'not-committed.png'), 'x');

  const res = runGate(dir);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /passed for 1 binary file\(s\)/);
});

test('gate fails closed on a tracked binary with no provenance record', (t) => {
  const dir = makeFixture();
  t.after(() => cleanup(dir));
  writeManifest(dir, approvedIcons);
  mkdirSync(join(dir, 'icons'), { recursive: true });
  writeFileSync(join(dir, 'icons', 'ok.png'), 'x');
  mkdirSync(join(dir, 'models'), { recursive: true });
  writeFileSync(join(dir, 'models', 'mystery.glb'), 'x'); // tracked, no record
  gitInit(dir);

  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /models\/mystery\.glb: no provenance record/);
});

test('gate fails closed on a tracked binary whose record is not approved', (t) => {
  const dir = makeFixture();
  t.after(() => cleanup(dir));
  writeManifest(dir, [{ path: 'voice_extracted/**', status: 'pending_permission', class: 'test-fixture' }]);
  mkdirSync(join(dir, 'voice_extracted'), { recursive: true });
  writeFileSync(join(dir, 'voice_extracted', 'clip.ogg'), 'x');
  gitInit(dir);

  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /voice_extracted\/clip\.ogg: status=pending_permission/);
});

test('non-git fallback walk skips .worktrees/.hermes and stays fail-closed elsewhere', (t) => {
  const dir = makeFixture();
  t.after(() => cleanup(dir));
  writeManifest(dir, approvedIcons);
  mkdirSync(join(dir, 'icons'), { recursive: true });
  writeFileSync(join(dir, 'icons', 'ok.png'), 'x');
  mkdirSync(join(dir, '.worktrees', 't_abc', 'icons'), { recursive: true });
  writeFileSync(join(dir, '.worktrees', 't_abc', 'icons', 'other.png'), 'x');
  mkdirSync(join(dir, '.hermes'), { recursive: true });
  writeFileSync(join(dir, '.hermes', 'scratch.png'), 'x');
  // No `git init`: the fallback walk must apply the same exclusions and pass.
  const pass = runGate(dir);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /passed for 1 binary file\(s\)/);

  // A binary outside the excluded tooling trees still fails closed.
  mkdirSync(join(dir, 'maps'), { recursive: true });
  writeFileSync(join(dir, 'maps', 'bad.png'), 'x');
  const fail = runGate(dir);
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /maps\/bad\.png: no provenance record/);
});
