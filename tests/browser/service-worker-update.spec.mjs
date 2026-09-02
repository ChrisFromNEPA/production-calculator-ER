// tests/browser/service-worker-update.spec.mjs
// ============================================================================
// Deterministic clean-profile service-worker lifecycle test.
//
// Proves the trust-indicators update surface (src/ui/trust-indicators.js)
// against a REAL browser, with no stale shared profile state:
//
//   1. FIRST INSTALL   — a brand-new worker installs and controls the page,
//                        yet the update chip stays hidden (nothing stale to
//                        reload yet).
//   2. CHANGE + UPDATE — the served sw.js changes (versioned CACHE bump +
//                        marker comment) and reg.update() is triggered; the
//                        update chip appears with a reload prompt.
//   3. RELOAD          — clicking the chip's Reload button navigates; the new
//                        worker's cache is live, the old cache is cleaned up,
//                        and the chip clears.
//   4. OFFLINE SHELL   — with the origin unreachable, a reload is still served
//                        from the service-worker cache (offline shell/runtime
//                        behavior preserved).
//
// The browser is Chromium launched headless with a FRESH temporary
// --user-data-dir, so no localStorage/service-worker state leaks in from
// earlier runs. The DevTools Protocol is driven over Node's built-in WebSocket
// client — this project has no browser-automation dependency.
//
// Run:  npm run test:sw-update   (builds dist/, then runs this spec)
//       CHROMIUM_BIN=/path/to/chrome node --test tests/browser/service-worker-update.spec.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');

// ---------------------------------------------------------------------------
// Chromium discovery — prefer an explicit CHROMIUM_BIN, then Playwright's
// downloaded builds (full browser first, headless shell as a fallback), then
// system binaries. Never fall back to a shared profile: the test always
// creates its own temporary user-data-dir.
// ---------------------------------------------------------------------------
function findChromium() {
  if (process.env.CHROMIUM_BIN) {
    if (existsSync(process.env.CHROMIUM_BIN)) return process.env.CHROMIUM_BIN;
    throw new Error(`CHROMIUM_BIN is set to ${process.env.CHROMIUM_BIN} but that file does not exist`);
  }
  const candidates = [];
  const pw = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      candidates.push(
        join(pw, dir, 'chrome-linux64', 'chrome'),
        join(pw, dir, 'chrome-linux', 'chrome'),
      );
    }
    for (const dir of readdirSync(pw).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      candidates.push(
        join(pw, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        join(pw, dir, 'chrome-linux', 'headless_shell'),
      );
    }
  }
  candidates.push(
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  );
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chromium binary found for the service-worker lifecycle test. ' +
    'Set CHROMIUM_BIN, install a Playwright build under ~/.cache/ms-playwright, ' +
    'or install system chromium. Searched: ' + candidates.join(', '),
  );
}

// ---------------------------------------------------------------------------
// Minimal CDP client over Node's built-in WebSocket (zero dependencies).
// ---------------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onmessage = ev => this._onMessage(ev.data);
    ws.onclose = () => {
      for (const { rej } of this.pending.values()) rej(new Error('CDP connection closed'));
      this.pending.clear();
    };
  }

  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const onError = err => { clearTimeout(timer); reject(err); };
      const timer = setTimeout(() => onError(new Error('CDP connect timeout')), 10000);
      ws.onerror = onError;
      ws.onopen = () => { clearTimeout(timer); resolve(new Cdp(ws)); };
    });
  }

  _onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.id && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code || 'cdp'})`));
      else res(msg.result);
    } else if (msg.method && this.listeners.has(msg.method)) {
      for (const cb of this.listeners.get(msg.method)) cb(msg.params);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }

  /** Resolve once the next event of `method` arrives (one-shot). */
  waitForEvent(method, timeoutMs = 20000, description = method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for CDP event ${description}`)), timeoutMs);
      const cb = () => {
        clearTimeout(timer);
        this.listeners.set(method, (this.listeners.get(method) || []).filter(fn => fn !== cb));
        resolve();
      };
      this.on(method, cb);
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Evaluate an expression in the page and return its value. */
async function evalJs(page, expression, awaitPromise = false) {
  const { result } = await page.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result && result.exceptionDetails) {
    throw new Error(`page exception in ${expression}: ${result.exceptionDetails.text}`);
  }
  return result && 'value' in result ? result.value : undefined;
}

/** Poll an expression until it is truthy (deterministic waits, no fixed sleeps). */
async function waitFor(page, expression, { timeout = 20000, description = expression, awaitPromise = false } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await evalJs(page, expression, awaitPromise);
    if (last) return last;
    await sleep(200);
  }
  throw new Error(`timed out waiting for: ${description} (last value: ${JSON.stringify(last)})`);
}

// ---------------------------------------------------------------------------
// Static server over dist/ — no-store so service-worker update checks always
// see the latest bytes, and a swOverride flag that flips the served sw.js to
// a changed build (the controlled "deploy" in the middle of the test).
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
};

// Shared test state, populated by before().
const state = {
  server: null,
  port: 0,
  chrome: null,
  profile: null,
  page: null,
  swOverride: false,
  shellFailure: false,
  baseCache: null,
  updateCache: null,
};

describe('clean-profile service-worker lifecycle', () => {
  before(async () => {
    assert.ok(
      existsSync(join(dist, 'index.html')),
      'dist/index.html not found — run `npm run build` first (npm run test:sw-update does this)',
    );

    // Build the controlled "changed deploy": bump the versioned CACHE constant
    // and append a marker comment so the bytes genuinely differ from dist/sw.js.
    const swSrc = readFileSync(join(dist, 'sw.js'), 'utf8');
    const cacheMatch = swSrc.match(/const CACHE = '([^']+)'/);
    assert.ok(cacheMatch, 'sw.js must declare a versioned CACHE constant');
    state.baseCache = cacheMatch[1];
    state.updateCache = `${state.baseCache}-update-test`;
    const changedSw = swSrc.replace(/const CACHE = '[^']+'/, `const CACHE = '${state.updateCache}'`)
      + '\n// deterministic service-worker update test marker\n';
    assert.notEqual(changedSw, swSrc, 'the controlled update must change the served sw.js bytes');

    // Static server for the app (no-store: SW update checks must not be cached).
    state.server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') pathname = '/index.html';
        if (state.shellFailure && pathname === '/index.html') {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('required shell asset deliberately unavailable');
          return;
        }
        const file = join(dist, pathname);
        let body = await readFile(file);
        if (pathname === '/sw.js' && state.swOverride) body = Buffer.from(changedSw);
        res.writeHead(200, {
          'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    await new Promise((resolveListen, reject) => {
      state.server.once('error', reject);
      state.server.listen(0, '127.0.0.1', resolveListen);
    });
    state.port = state.server.address().port;

    // Fresh isolated profile — never a shared/stale Chromium profile.
    state.profile = mkdtempSync(join(tmpdir(), 'er-sw-update-'));
    state.chrome = spawn(findChromium(), [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--remote-debugging-port=0',
      `--user-data-dir=${state.profile}`,
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    state.chrome.stderr.on('data', () => { /* devtools banner / harmless warnings */ });

    // The DevTools port/path are written into the profile once the browser is up.
    let devPort = null;
    let devPath = null;
    const activePortFile = join(state.profile, 'DevToolsActivePort');
    for (let i = 0; i < 600 && !devPort; i++) {
      if (existsSync(activePortFile)) {
        const [p, path] = readFileSync(activePortFile, 'utf8').trim().split('\n');
        if (p) { devPort = p; devPath = path; }
      }
      if (!devPort) await sleep(100);
    }
    if (!devPort) throw new Error('Chromium did not open a DevTools port within 60s');

    const browser = await Cdp.connect(`ws://127.0.0.1:${devPort}${devPath}`);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });

    // Attach to the page target over its own websocket (no session juggling).
    let pageWs = null;
    for (let i = 0; i < 50 && !pageWs; i++) {
      const list = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();
      const target = list.find(t => t.id === targetId);
      if (target && target.webSocketDebuggerUrl) pageWs = target.webSocketDebuggerUrl;
      else await sleep(100);
    }
    if (!pageWs) throw new Error('Could not resolve the page target websocket');
    browser.close();

    state.page = await Cdp.connect(pageWs);
    await state.page.send('Page.enable');
    await state.page.send('Runtime.enable');
    await state.page.send('Network.enable');
    await state.page.send('Log.enable');
  });

  after(async () => {
    if (state.page) state.page.close();
    if (state.chrome) {
      try { state.chrome.kill('SIGKILL'); } catch { /* already dead */ }
    }
    if (state.profile) rmSync(state.profile, { recursive: true, force: true });
    if (state.server && state.server.listening) {
      await new Promise(r => state.server.close(r));
    }
  });

  it('first install keeps the update UI hidden while a fresh worker controls the page', async () => {
    const { page, port, baseCache } = state;
    const load = page.waitForEvent('Page.loadEventFired', 30000, 'initial page load');
    await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    await load;

    // The first install must fully complete: an active worker controls the page.
    await waitFor(
      page,
      `!!(navigator.serviceWorker && navigator.serviceWorker.controller)`,
      { description: 'first-install worker to activate and control the page' },
    );
    assert.match(
      await evalJs(page, `navigator.serviceWorker.controller.scriptURL`),
      /\/sw\.js$/,
      'the controlling worker must be sw.js',
    );

    // Trust indicators are wired up (data chip rendered)…
    assert.match(await evalJs(page, `document.getElementById('trust-data').textContent`), /snapshot/i);
    // …and the update chip stays hidden: a first install has nothing stale to reload.
    assert.equal(await evalJs(page, `document.getElementById('trust-update').hidden`), true);

    // The install precache landed under the versioned CACHE constant.
    const keys = await evalJs(page, `caches.keys()`, true);
    assert.ok(keys.includes(baseCache), `expected precache ${baseCache}, found ${keys.join(', ')}`);

    // A separate application cache on the same origin must not be treated as
    // stale service-worker state by this project's activation cleanup.
    const unrelated = await evalJs(page, `(async () => {
      const cache = await caches.open('unrelated-app-cache');
      await cache.put('/unrelated.txt', new Response('keep me'));
      return caches.keys();
    })()`, true);
    assert.ok(unrelated.includes('unrelated-app-cache'));
  });

  it('keeps optional runtime assets bounded to the declared maximum', async () => {
    const { page } = state;
    await evalJs(page, `(async () => {
      await Promise.all(Array.from({ length: 40 }, (_, i) =>
        fetch('/src/vendor/chart.min.js?cache-test=' + i)));
      return true;
    })()`, true);
    const runtimeCount = await waitFor(
      page,
      `(async () => {
        const names = await caches.keys();
        const runtime = names.find(name => name.endsWith('-runtime'));
        if (!runtime) return -1;
        return (await (await caches.open(runtime)).keys()).length;
      })()`,
      { description: 'runtime cache eviction to complete', awaitPromise: true },
    );
    assert.ok(runtimeCount > 0 && runtimeCount <= 32,
      `runtime cache must stay within its maximum (observed ${runtimeCount})`);
  });

  it('rejects a defective update install and keeps the existing worker in control', async () => {
    const { page, baseCache } = state;
    state.swOverride = true;
    state.shellFailure = true;
    await evalJs(page, `window.__initialController = navigator.serviceWorker.controller;`);

    await evalJs(
      page,
      `(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); return true; })()`,
      true,
    );
    await waitFor(
      page,
      `(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !reg.installing && !reg.waiting; })()`,
      { description: 'defective worker install to finish and be discarded', awaitPromise: true },
    );

    const snapshot = await evalJs(page, `(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        activeState: reg.active && reg.active.state,
        controller: !!navigator.serviceWorker.controller,
        caches: await caches.keys(),
      };
    })()`, true);
    assert.equal(snapshot.activeState, 'activated', 'the previous worker must remain active');
    assert.equal(snapshot.controller, true, 'the defective worker must not take control');
    assert.equal(
      await evalJs(page, `navigator.serviceWorker.controller === window.__initialController`),
      true,
      'the original controller must remain in control after the failed install',
    );
    assert.ok(snapshot.caches.includes(baseCache), `the original cache must remain: ${snapshot.caches.join(', ')}`);
  });

  it('restored required shell assets allow the update to install successfully', async () => {
    const { page } = state;
    state.shellFailure = false;

    await evalJs(
      page,
      `(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); return true; })()`,
      true,
    );

    const chipText = await waitFor(
      page,
      `(() => { const chip = document.getElementById('trust-update'); return (chip && !chip.hidden) ? document.getElementById('trust-update-text').textContent : null; })()`,
      { description: 'update chip to appear after the restored shell install' },
    );
    assert.match(chipText, /update/i, 'chip must announce the restored update');
    assert.match(chipText, /reload/i, 'chip must offer a reload for the restored update');
  });

  it('Reload applies the new worker, swaps the cache, and clears the chip', async () => {
    const { page, updateCache, baseCache } = state;
    const load = page.waitForEvent('Page.loadEventFired', 30000, 'reload after update');
    await evalJs(page, `document.getElementById('trust-update-reload').click()`);
    await load;

    await waitFor(
      page,
      `!!(navigator.serviceWorker && navigator.serviceWorker.controller)`,
      { description: 'controller to be present after reload' },
    );

    // The updated worker is now live: its precache exists, and activation has
    // Give the activation task a turn to finish before inspecting CacheStorage.
    await sleep(1000);
    const keys = await evalJs(page, `caches.keys()`, true);
    assert.ok(keys.includes(updateCache), `expected updated cache ${updateCache}, found ${keys.join(', ')}`);
    assert.ok(!keys.includes(baseCache), `old cache ${baseCache} must be cleaned up on activate; found ${keys.join(', ')}`);
    assert.ok(keys.includes('unrelated-app-cache'), 'unrelated origin cache must survive activation');

    // With the update applied there is nothing pending: the chip is hidden again.
    assert.equal(await evalJs(page, `document.getElementById('trust-update').hidden`), true);
  });

  it('offline shell/runtime behavior is preserved: reload still renders from cache with the origin down', async () => {
    const { page } = state;
    // Hard network failure: the origin is gone, so only the service-worker
    // cache can answer. (Network emulation does not cover loopback traffic,
    // so stopping the server is the deterministic way to go offline here.)
    await new Promise(r => state.server.close(r));
    state.server = null;

    const load = page.waitForEvent('Page.loadEventFired', 30000, 'offline reload');
    await page.send('Page.reload');
    await load;

    // The cached shell must render the full application…
    await waitFor(page, `!!document.getElementById('view-calc')`, {
      description: 'offline shell to render from the service-worker cache',
    });
    assert.equal(await evalJs(page, `document.title`), 'Empire Rising Production Calculator');
    // …with the trust surface intact and no phantom update chip.
    assert.match(await evalJs(page, `document.getElementById('trust-data').textContent`), /snapshot/i);
    assert.equal(await evalJs(page, `document.getElementById('trust-update').hidden`), true);
  });
});
