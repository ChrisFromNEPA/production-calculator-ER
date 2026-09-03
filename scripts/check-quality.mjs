#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const ignored = new Set(['vendor', 'generated']);
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith('.js')) files.push(file);
  }
}
walk(join(root, 'src'));
const failures = [];
for (const file of files) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${file}: syntax error\n${syntax.stderr || syntax.stdout}`);
  const source = readFileSync(file, 'utf8');
  if (/\bdebugger\s*;?/.test(source)) failures.push(`${file}: debugger statement is not allowed`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`[check-quality] checked ${files.length} browser-global JavaScript files (syntax, debugger)`);
