import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');

describe('service-worker cache safety contract', () => {
  it('uses project-namespaced, separate shell and runtime caches', () => {
    assert.match(sw, /const CACHE = 'er-prodcalc-v\d+\.\d+\.\d+-shell'/);
    assert.match(sw, /const RUNTIME_CACHE = 'er-prodcalc-v\d+\.\d+\.\d+-runtime'/);
    assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
    assert.match(sw, /CACHE_PREFIX/);
    assert.match(sw, /RUNTIME_CACHE/);
  });

  it('precaches every eagerly loaded local script in the application shell', () => {
    assert.match(sw, /er-prodcalc-v0\.2\.45-shell/);
    const eagerScripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map(match => match[1].split('?')[0])
      .filter(src => !/^https?:/.test(src));
    for (const src of eagerScripts) {
      const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(sw, new RegExp(`['"]\\./${escaped}['"]`), `${src} must be available on an offline reload`);
    }
  });

  it('derives optional asset paths from the registration scope for Pages subpaths', () => {
    assert.match(sw, /new URL\(directory, self\.registration\.scope\)\.pathname/);
    for (const directory of ['maps/', 'icons/', 'gear_textures/', 'voice_extracted/']) {
      assert.match(sw, new RegExp(directory.replace('/', '\\/')));
    }
  });

  it('preserves unrelated origin caches during activation and waits for client claiming', () => {
    assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
    assert.doesNotMatch(sw, /keys\.filter\(k => k !== CACHE\)/);
    assert.match(sw, /e\.waitUntil\(cleanupOldCaches\(\)\.then\(\(\) => self\.clients\.claim\(\)\)\)/);
  });

  it('does not classify deployment-excluded source trees as runtime assets', () => {
    for (const excluded of ['textures_extracted/', 'skins_test/', 'gallery/']) {
      assert.equal(sw.includes(`'${excluded}'`), false, `${excluded} must not enter runtime cache policy`);
    }
  });

  it('bounds runtime caching and only caches eligible same-origin successful GETs', () => {
    assert.match(sw, /MAX_RUNTIME_ENTRIES\s*=\s*\d+/);
    assert.match(sw, /request\.url.*self\.location\.origin|new URL\(request\.url\).*origin/);
    assert.match(sw, /request\.method !== ['"]GET['"]/);
    assert.match(sw, /response\.ok/);
    assert.match(sw, /OPTIONAL_PATH_PREFIXES/);
    assert.match(sw, /cache\.delete\(keys.shift\(\)\)/);
  });
});
