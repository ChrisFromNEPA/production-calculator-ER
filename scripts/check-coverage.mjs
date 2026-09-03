#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = join(root, 'coverage', 'summary.json');
const threshold = 60;
if (process.argv.includes('--help')) {
  console.log('Runs Node V8 coverage for the instrumented runtime module src/engine.js; function threshold: 60%.');
  process.exit(0);
}
const dir = join(tmpdir(), `er-v8-coverage-${process.pid}`);
mkdirSync(dir, { recursive: true });
try {
  const run = spawnSync(process.execPath, ['--test', 'tests/engine.test.mjs', 'tests/cmg-net-path.test.mjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE_V8_COVERAGE: dir },
  });
  if (run.status !== 0) { process.stdout.write(run.stdout); process.stderr.write(run.stderr); process.exit(run.status || 1); }
  const functions = [];
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const script of data.result || []) {
      if (script.url.endsWith('/src/engine.js')) functions.push(...(script.functions || []));
    }
  }
  const total = functions.length;
  const covered = functions.filter(fn => fn.ranges?.some(range => range.count > 0)).length;
  const percent = total ? Number((covered * 100 / total).toFixed(2)) : 0;
  const report = { module: 'src/engine.js', metric: 'function', covered, total, percent, threshold, pass: percent >= threshold };
  mkdirSync(join(root, 'coverage'), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ generatedBy: 'scripts/check-coverage.mjs', files: [report] }, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.pass) process.exit(1);
} finally { rmSync(dir, { recursive: true, force: true }); }
