import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const run = (script, args = [], cwd = root) => spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd, encoding: 'utf8' });

test('legacy quality gate accepts browser globals and rejects syntax/debugger', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'er-quality-'));
  try {
    mkdirSync(join(fixture, 'src'));
    writeFileSync(join(fixture, 'src', 'good.js'), "window.answer = document.title;\n");
    let result = run('check-quality.mjs', [fixture]);
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(join(fixture, 'src', 'bad.js'), 'debugger;\\nfunction (broken {\\n');
    result = run('check-quality.mjs', [fixture]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /debugger|syntax/i);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('static accessibility gate rejects unlabeled controls and unnamed buttons', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'er-a11y-'));
  try {
    writeFileSync(join(fixture, 'index.html'), '<html><body><input id="x"><button></button><img src="x"></body></html>');
    const result = run('check-a11y.mjs', [fixture]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /label|name|alt/i);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('quality gate scripts are wired into check and coverage names an instrumented module', async () => {
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.check, /check:quality/);
  assert.match(pkg.scripts.check, /check:a11y/);
  assert.match(pkg.scripts['test:coverage'], /coverage/);
  const result = run('check-coverage.mjs', ['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /engine\.js/);
});

test('the calculator picker caps rendered cards while reporting the full match count', () => {
  const source = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
  const render = source.match(/function renderPicker\(\)[\s\S]*?\n}/)?.[0] || '';
  assert.match(render, /PICKER_RENDER_LIMIT/);
  assert.match(render, /matches\.slice\(0, PICKER_RENDER_LIMIT\)/);
  assert.match(render, /matches\.length/);
});

test('browser transfer budgets wait for settled responses and fail on network errors', () => {
  const source = readFileSync(join(root, 'tests', 'browser', 'calculator-ux.spec.mjs'), 'utf8');
  const serviceWorkerSource = readFileSync(join(root, 'tests', 'browser', 'service-worker-update.spec.mjs'), 'utf8');
  assert.match(source, /Network\.responseReceived/);
  assert.match(source, /Network\.loadingFailed/);
  assert.match(source, /waitForNetworkIdle/);
  assert.match(source, /networkFailures/);
  assert.match(source, /response\.exceptionDetails/);
  assert.match(serviceWorkerSource, /response\.exceptionDetails/);
  assert.doesNotMatch(source, /BROWSER_TEST_OPTIONAL/);
  assert.match(source, /redirectResponse/);
});
