#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const files = [
  'index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js',
  'docs/assets/calculator-sample.png',
];
const directories = [
  'src', 'data', 'fonts', 'gallery', 'gear_textures', 'icons', 'logo', 'maps',
  'models', 'skins_test', 'stats', 'textures_extracted', 'voice_extracted',
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const relative of files) {
  const destination = path.join(dist, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, relative), destination);
}
for (const relative of directories) {
  fs.cpSync(path.join(root, relative), path.join(dist, relative), { recursive: true });
}

const copied = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else copied.push(path.relative(dist, full).replaceAll(path.sep, '/'));
  }
};
walk(dist);
const manifest = {
  schema_version: 1,
  build: 'static-pages',
  base_path: process.env.PAGES_BASE_PATH || '/',
  files: copied.sort(),
};
fs.writeFileSync(path.join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[build-pages] copied ${copied.length} files into dist/`);
