#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const publicManifest = JSON.parse(fs.readFileSync(path.join(root, 'public-files.json'), 'utf8'));
const runtime = publicManifest.runtime;
const budgets = publicManifest.budgets;
if (!Array.isArray(runtime) || !runtime.length ||
    runtime.some(pattern => typeof pattern !== 'string' || !pattern.length)) {
  throw new Error('[build-pages] runtime allowlist must contain at least one non-empty pattern');
}
for (const field of ['max_bytes', 'max_files']) {
  if (!Number.isSafeInteger(budgets?.[field]) || budgets[field] <= 0) {
    throw new Error(`[build-pages] budget ${field} must be a positive safe integer`);
  }
}

function patternToRegExp(pattern) {
  let escaped = '';
  for (let i = 0; i < pattern.length;) {
    if (pattern.startsWith('**/', i)) { escaped += '(?:.*/)?'; i += 3; continue; }
    if (pattern.startsWith('**', i)) { escaped += '.*'; i += 2; continue; }
    if (pattern[i] === '*') { escaped += '[^/]*'; i++; continue; }
    escaped += pattern[i].replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    i++;
  }
  return new RegExp(`^${escaped}$`);
}

function trackedRuntimeFiles() {
  const files = new Set();
  for (const pattern of runtime) {
    const normalized = pattern.replaceAll(path.sep, '/');
    const absolute = path.join(root, normalized.replace(/\/\*\*?$/, ''));
    if (!normalized.includes('*')) {
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Missing runtime file: ${normalized}`);
      files.add(normalized);
      continue;
    }
    const base = normalized.split('*')[0].replace(/\/$/, '');
    const basePath = path.join(root, base);
    if (!fs.existsSync(basePath)) throw new Error(`Missing runtime directory: ${base}`);
    const matcher = patternToRegExp(normalized);
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const relative = path.relative(root, full).replaceAll(path.sep, '/');
        if (entry.isDirectory()) walk(full);
        else if (matcher.test(relative)) files.add(relative);
      }
    };
    walk(basePath);
  }
  return [...files].sort();
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const copied = trackedRuntimeFiles();
for (const relative of copied) {
  const destination = path.join(dist, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, relative), destination);
}

const payloadBytes = copied.reduce((total, relative) => total + fs.statSync(path.join(dist, relative)).size, 0);
if (copied.length + 1 > budgets.max_files) throw new Error(`Pages artifact exceeds file budget: ${copied.length + 1} > ${budgets.max_files}`);
const manifest = {
  schema_version: 2,
  build: 'static-pages-runtime-allowlist',
  base_path: process.env.PAGES_BASE_PATH || '/',
  files: copied,
  payload_bytes: payloadBytes,
  budgets,
  total_bytes: payloadBytes,
};
let manifestText;
for (;;) {
  manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const nextTotal = payloadBytes + Buffer.byteLength(manifestText);
  if (nextTotal === manifest.total_bytes) break;
  manifest.total_bytes = nextTotal;
}
fs.writeFileSync(path.join(dist, 'build-manifest.json'), manifestText);
if (manifest.total_bytes > budgets.max_bytes) throw new Error(`Pages artifact exceeds byte budget: ${manifest.total_bytes} > ${budgets.max_bytes}`);
console.log(`[build-pages] copied ${copied.length + 1} files (${manifest.total_bytes} bytes) into dist/`);
