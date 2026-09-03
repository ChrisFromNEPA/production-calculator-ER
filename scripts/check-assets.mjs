#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'data', 'asset-provenance.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
const binaryExt = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.glb', '.gltf', '.ogg', '.mp3', '.wav', '.dtx', '.stl', '.woff', '.woff2']);
const ignored = new Set(['node_modules', '.git', 'dist', '.worktrees', '.hermes']);

function isBinaryFile(name) {
  return binaryExt.has(path.extname(name).toLowerCase());
}

function filesUnder(relative) {
  const base = relative.replace('/**', '').split(',')[0].trim();
  const absolute = path.join(root, base);
  if (!fs.existsSync(absolute)) return [];
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).replaceAll(path.sep, '/'));
    }
  };
  if (fs.statSync(absolute).isDirectory()) walk(absolute);
  else out.push(relative);
  return out;
}

// Directory-walk fallback for non-git contexts (e.g. a release tarball without
// .git). Applies the same exclusions, including untracked tooling trees.
function walkBinaryFiles() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (isBinaryFile(entry.name)) out.push(path.relative(root, full).replaceAll(path.sep, '/'));
    }
  };
  walk(root);
  return out;
}

// Gate tracked repository files only. Untracked trees (.worktrees/, .hermes/,
// scratch dirs) are not shipped, so they must never fail the gate. Falls back
// to the directory walk when git is unavailable or root is not a git checkout.
function binaryFilesToCheck() {
  try {
    const listing = execFileSync('git', ['ls-files', '-z', '--full-name'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return listing.split('\0').filter(Boolean).filter(isBinaryFile);
  } catch {
    return walkBinaryFiles();
  }
}

const binaryFiles = binaryFilesToCheck();

// Approval is a release assertion. It cannot coexist with an unresolved
// license/permission claim, even when the asset path is otherwise covered.
for (const record of manifest.records || []) {
  const status = String(record.status || '').toLowerCase();
  const evidence = `${record.license_or_permission || ''} ${record.evidence || ''}`.toLowerCase();
  if (['approved', 'approved_for_code_review'].includes(status) && /pending|unresolved|review required/.test(evidence)) {
    failures.push(`${record.path}: approved status has pending license evidence`);
  }
}

for (const file of binaryFiles) {
  const record = manifest.records.find(r => {
    const prefix = r.path.replace('/**', '').split(',')[0].trim();
    return file === prefix || file.startsWith(`${prefix}/`);
  });
  if (!record) failures.push(`${file}: no provenance record`);
  else if (!['approved', 'approved_for_code_review'].includes(record.status)) failures.push(`${file}: status=${record.status}`);
}

if (failures.length) {
  const reportOnly = process.argv.includes('--report-only');
  console.error(`Asset provenance gate found ${failures.length} file(s) requiring review.`);
  console.error(failures.slice(0, 25).join('\n'));
  if (failures.length > 25) console.error(`... plus ${failures.length - 25} more`);
  if (!reportOnly) process.exit(1);
  console.error('Report-only mode: continuing without approving these assets.');
  process.exit(0);
}
console.log(`Asset provenance gate passed for ${binaryFiles.length} binary file(s).`);
