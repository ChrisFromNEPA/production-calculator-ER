#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const htmlPath = join(root, 'index.html');
let html;
try { html = readFileSync(htmlPath, 'utf8'); } catch (error) { console.error(`[check-a11y] ${error.message}`); process.exit(1); }

function omitDelimited(input, open, close) {
  let output = '';
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf(open, cursor);
    if (start < 0) return output + input.slice(cursor);
    output += input.slice(cursor, start);
    const end = input.indexOf(close, start + open.length);
    if (end < 0) throw new Error(`unterminated ${open} block`);
    cursor = end + close.length;
  }
  return output;
}

function omitElementBlocks(input, tagName) {
  const lower = input.toLowerCase();
  const open = `<${tagName.toLowerCase()}`;
  const close = `</${tagName.toLowerCase()}>`;
  let output = '';
  let cursor = 0;
  while (cursor < input.length) {
    const start = lower.indexOf(open, cursor);
    if (start < 0) return output + input.slice(cursor);
    output += input.slice(cursor, start);
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) throw new Error(`unterminated ${tagName} element`);
    cursor = end + close.length;
  }
  return output;
}

function hasAccessibleText(fragment) {
  for (const image of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const alt = image[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];
    if (alt && alt.trim()) return true;
  }
  let inTag = false;
  for (const character of fragment) {
    if (character === '<') { inTag = true; continue; }
    if (character === '>') { inTag = false; continue; }
    if (!inTag && !/\s/.test(character)) return true;
  }
  return false;
}

const source = omitElementBlocks(omitDelimited(html, '<!--', '-->'), 'script');
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
  if (!hasAccessibleText(inner) && !a['aria-label'] && !a['aria-labelledby'] && !a.title) errors.push(`${name} is missing an accessible name`);
}
for (const match of source.matchAll(/\baria-(?:labelledby|describedby)\s*=\s*["']([^"']+)["']/gi)) {
  for (const id of match[1].split(/\s+/)) if (!ids.has(id)) errors.push(`ARIA reference targets missing id: ${id}`);
}
if (errors.length) { console.error(`[check-a11y] ${errors.length} issue(s)\n${errors.map(e => `- ${e}`).join('\n')}`); process.exit(1); }
console.log(`[check-a11y] static accessibility checks passed (${ids.size} ids)`);
