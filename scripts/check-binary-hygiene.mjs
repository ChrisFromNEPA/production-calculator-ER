#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const LARGE_BINARY_BYTES = 10 * 1024 * 1024;
const MAX_NEW_BINARY_BYTES = 25 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.glb', '.gltf', '.ogg', '.mp3', '.wav', '.dtx', '.stl', '.woff', '.woff2']);

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: options.encoding ?? 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function die(message) {
  console.error(`Binary hygiene gate failed closed: ${message}`);
  process.exit(1);
}
function isBinary(path) {
  const dot = path.lastIndexOf('.');
  return dot !== -1 && BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase());
}
function parseNames(output) { return output.split('\0').filter(Boolean); }
function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}
function content(revision, file) {
  return git(['show', `${revision}:${file}`], { encoding: null });
}
function revisionExists(revision) {
  try { git(['rev-parse', '--verify', `${revision}^{commit}`]); return true; } catch { return false; }
}

const baseArg = process.argv.indexOf('--base');
const requestedBase = baseArg === -1 ? null : process.argv[baseArg + 1];
if (baseArg !== -1 && !requestedBase) die('--base requires a revision');
const base = requestedBase || 'HEAD';
if (!revisionExists(base)) die(`cannot resolve base revision: ${base}`);

let added;
try {
  const args = requestedBase
    ? ['diff', '--name-status', '-z', '--diff-filter=A', `${base}...HEAD`]
    : ['diff', '--cached', '--name-status', '-z', '--diff-filter=A'];
  added = parseNames(git(args)).filter(isBinary);
} catch (error) {
  die(`cannot inspect added files (${error.message})`);
}

const failures = [];
const additions = [];
for (const file of added) {
  let data;
  try {
    data = requestedBase ? content('HEAD', file) : git(['show', `:${file}`], { encoding: null });
  } catch (error) {
    failures.push(`${file}: cannot read added content (${error.message})`);
    continue;
  }
  const size = data.length;
  additions.push({ file, size, digest: hash(data) });
  if (size > LARGE_BINARY_BYTES) failures.push(`${file}: ${formatMiB(size)} exceeds 10 MiB per-file limit`);
}
const total = additions.reduce((sum, item) => sum + item.size, 0);
if (total > MAX_NEW_BINARY_BYTES) failures.push(`new binary aggregate ${formatMiB(total)} exceeds 25 MiB aggregate limit`);

let existing;
try {
  existing = parseNames(git(['ls-tree', '-r', '-z', '--name-only', base])).filter(isBinary);
} catch (error) {
  die(`cannot inspect base tree (${error.message})`);
}
const byDigest = new Map();
for (const file of existing) {
  try {
    const digest = hash(content(base, file));
    if (!byDigest.has(digest)) byDigest.set(digest, file);
  } catch (error) {
    die(`cannot read base binary ${file} (${error.message})`);
  }
}
for (const item of additions) {
  const prior = byDigest.get(item.digest);
  if (prior) failures.push(`${item.file}: exact duplicate of existing binary ${prior}`);
}
const report = `${additions.length} new binary file(s), ${formatMiB(total)} total`;
if (failures.length) {
  console.error(`Binary hygiene gate found ${failures.length} issue(s).`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Binary hygiene gate passed: ${report}.`);

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
