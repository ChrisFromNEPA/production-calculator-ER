#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const htmlPath = join(root, 'index.html');
let html;
try { html = readFileSync(htmlPath, 'utf8'); } catch (error) { console.error(`[check-a11y] ${error.message}`); process.exit(1); }
const source = html.replace(/<!--[\s\S]*?-->/g, '');
const errors = [];
const ids = new Map();
for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
  const id = match[1];
  if (ids.has(id)) errors.push(`duplicate id: ${id}`);
  ids.set(id, true);
}
const attrs = tag => Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/gi)].map(m => [m[1].toLowerCase(), m[2]]));
for (const match of source.matchAll(/<([a-z][\w-]*)(\s[\s\S]*?)?>/gi)) {
  const name = match[1].toLowerCase();
  const tag = match[0];
  const a = attrs(tag);
  if (name === 'img' && !Object.hasOwn(a, 'alt')) errors.push('img is missing alt text');
  if (['input', 'select', 'textarea'].includes(name) && !a.hidden && !a['aria-label'] && !a['aria-labelledby']) {
    const labelled = a.id && new RegExp(`<label[^>]+for=["']${a.id}["']`, 'i').test(source);
    const nested = a.id && new RegExp(`<label\\b[^>]*>[\\s\\S]*?id=["']${a.id}["'][\\s\\S]*?</label>`, 'i').test(source);
    if (!labelled && !nested) errors.push(`${name}${a.id ? `#${a.id}` : ''} is missing an associated label`);
  }
}
// Check paired controls so their text (including an image's alt text) is an
// accessible name. Opening-tag matching alone cannot see button contents.
for (const match of source.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
  const [, name, rawAttrs, inner] = match;
  const a = attrs(`<${name}${rawAttrs}>`);
  const text = inner.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, '$1').replace(/<[^>]*>/g, '').trim();
  if (!text && !a['aria-label'] && !a['aria-labelledby'] && !a.title) errors.push(`${name} is missing an accessible name`);
}
for (const match of source.matchAll(/\baria-(?:labelledby|describedby)\s*=\s*["']([^"']+)["']/gi)) {
  for (const id of match[1].split(/\s+/)) if (!ids.has(id)) errors.push(`ARIA reference targets missing id: ${id}`);
}
if (errors.length) { console.error(`[check-a11y] ${errors.length} issue(s)\n${errors.map(e => `- ${e}`).join('\n')}`); process.exit(1); }
console.log(`[check-a11y] static accessibility checks passed (${ids.size} ids)`);
