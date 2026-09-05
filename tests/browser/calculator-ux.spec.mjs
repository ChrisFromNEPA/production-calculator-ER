// tests/browser/calculator-ux.spec.mjs
// Real-browser smoke coverage for the calculator, inventory rapid entry,
// retired-surface routing, and Gear picker/reference separation.
//
// Run: npm run test:browser-ux
// Or against an already-running server:
//   SMOKE_URL=http://127.0.0.1:4173 node --test tests/browser/calculator-ux.spec.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const externalBase = process.env.SMOKE_URL?.replace(/\/$/, '');

function findChromium() {
  if (process.env.CHROMIUM_BIN) {
    if (existsSync(process.env.CHROMIUM_BIN)) return process.env.CHROMIUM_BIN;
    throw new Error(`CHROMIUM_BIN does not exist: ${process.env.CHROMIUM_BIN}`);
  }
  const candidates = [
    join(homedir(), '.cache', 'ms-playwright'),
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  const fsCandidates = [];
  for (const candidate of candidates) {
    if (candidate.endsWith('ms-playwright')) {
      try {
        for (const dir of readdirSync(candidate).filter(d => d.startsWith('chromium-')).sort().reverse()) {
          fsCandidates.push(join(candidate, dir, 'chrome-linux64', 'chrome'));
          fsCandidates.push(join(candidate, dir, 'chrome-linux', 'chrome'));
        }
      } catch { /* use system candidates */ }
    } else fsCandidates.push(candidate);
  }
  const hit = fsCandidates.find(existsSync);
  if (hit) return hit;
  throw new Error('No Chromium found. Set CHROMIUM_BIN or install system Chromium.');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onmessage = event => this.onMessage(event.data);
    ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'));
      this.pending.clear();
    };
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
      ws.onerror = reject;
      ws.onopen = () => { clearTimeout(timer); resolve(new Cdp(ws)); };
    });
  }

  onMessage(data) {
    const message = JSON.parse(data);
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) listener(message.params);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  waitForEvent(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      const listener = params => {
        clearTimeout(timer);
        this.listeners.set(method, (this.listeners.get(method) || []).filter(fn => fn !== listener));
        resolve(params);
      };
      this.on(method, listener);
    });
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function evalJs(page, expression, awaitPromise = false) {
  const response = await page.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'page evaluation failed');
  return response.result?.value;
}

async function waitFor(page, expression, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await evalJs(page, expression);
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}; last=${JSON.stringify(last)}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
};

const state = { server: null, port: 0, profile: null, chrome: null, browser: null, browserContextId: null, page: null, errors: [], consoleErrors: [], requests: new Map(), redirects: [], ownsChrome: false };

async function cleanupBrowser() {
  state.page?.close();
  if (state.browser && state.browserContextId) {
    try { await state.browser.send('Target.disposeBrowserContext', { browserContextId: state.browserContextId }); } catch { /* context may already be gone */ }
  }
  state.browser?.close();
  if (state.ownsChrome) {
    try { state.chrome?.kill('SIGKILL'); } catch { /* already stopped */ }
  }
  if (state.profile) rmSync(state.profile, { recursive: true, force: true });
  if (state.server?.listening) await new Promise(resolve => state.server.close(resolve));
}

async function createStaticServer() {
  if (externalBase) return externalBase;
  assert.ok(existsSync(join(dist, 'index.html')), 'dist/index.html missing; run npm run build first');
  state.server = createServer((request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/') pathname = '/index.html';
      const file = join(dist, pathname);
      const body = readFileSync(file);
      response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    state.server.once('error', reject);
    state.server.listen(0, '127.0.0.1', resolve);
  });
  state.port = state.server.address().port;
  return `http://127.0.0.1:${state.port}`;
}

async function attachPage(browser, targetId, httpBase) {
  let pageUrl;
  for (let i = 0; i < 50 && !pageUrl; i++) {
    const targets = await (await fetch(`${httpBase}/json/list`)).json();
    pageUrl = targets.find(target => target.id === targetId)?.webSocketDebuggerUrl;
    if (!pageUrl) await sleep(100);
  }
  assert.ok(pageUrl, 'Could not resolve the page websocket');
  state.browser = browser;
  state.page = await Cdp.connect(pageUrl);
  await state.page.send('Page.enable');
  await state.page.send('Runtime.enable');
  await state.page.send('Network.enable');
  state.page.on('Runtime.exceptionThrown', params => state.errors.push(params.exceptionDetails?.text || 'page exception'));
  state.page.on('Runtime.consoleAPICalled', params => {
    if (['error', 'assert'].includes(params.type)) state.consoleErrors.push(params.type);
  });
  state.page.on('Network.requestWillBeSent', params => {
    if (params.redirectResponse) {
      const prior = state.requests.get(params.requestId);
      state.redirects.push({
        url: prior?.url || params.redirectResponse.url,
        bytes: params.redirectResponse.encodedDataLength || prior?.bytes || 0,
        status: params.redirectResponse.status,
        finished: true,
        failed: null,
      });
    }
    state.requests.set(params.requestId, {
      url: params.request.url, bytes: 0, status: null, finished: false, failed: null,
    });
  });
  state.page.on('Network.responseReceived', params => {
    const request = state.requests.get(params.requestId);
    if (request) request.status = params.response.status;
  });
  state.page.on('Network.loadingFinished', params => {
    const request = state.requests.get(params.requestId);
    if (request) {
      request.bytes = params.encodedDataLength || 0;
      request.finished = true;
    }
  });
  state.page.on('Network.loadingFailed', params => {
    const request = state.requests.get(params.requestId);
    if (request) {
      request.failed = params.errorText || 'network request failed';
      request.finished = true;
    }
  });
}

async function tryPersistentChrome() {
  const httpBase = process.env.SMOKE_CDP_URL || 'http://127.0.0.1:9222';
  try {
    const response = await fetch(`${httpBase}/json/version`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    const version = await response.json();
    if (!version.webSocketDebuggerUrl) return null;
    return { httpBase, browser: await Cdp.connect(version.webSocketDebuggerUrl) };
  } catch {
    return null;
  }
}

async function launchBrowser() {
  const persistent = await tryPersistentChrome();
  if (persistent) {
    const context = await persistent.browser.send('Target.createBrowserContext');
    state.browserContextId = context.browserContextId;
    const { targetId } = await persistent.browser.send('Target.createTarget', {
      url: 'about:blank', browserContextId: state.browserContextId,
    });
    await attachPage(persistent.browser, targetId, persistent.httpBase);
    return;
  }

  state.profile = mkdtempSync(join(tmpdir(), 'er-calculator-smoke-'));
  state.ownsChrome = true;
  state.chrome = spawn(findChromium(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${state.profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  state.chrome.stderr.on('data', () => {});
  const activePortFile = join(state.profile, 'DevToolsActivePort');
  let port;
  let path;
  for (let i = 0; i < 600 && !port; i++) {
    if (existsSync(activePortFile)) [port, path] = readFileSync(activePortFile, 'utf8').trim().split('\n');
    if (!port) await sleep(100);
  }
  assert.ok(port, 'Chromium did not expose a DevTools port');
  const browser = await Cdp.connect(`ws://127.0.0.1:${port}${path}`);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  await attachPage(browser, targetId, `http://127.0.0.1:${port}`);
}

async function setViewport(width, height) {
  await state.page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
  });
}

async function navigate(base, hash = '') {
  await state.page.send('Page.navigate', { url: `${base}/${hash}` });
  await waitFor(state.page, `!!document.getElementById('view-calc')`, 'calculator shell');
  await evalJs(state.page, 'localStorage.clear(); sessionStorage.clear();');
  await state.page.send('Page.reload', { ignoreCache: true });
  await waitFor(state.page, `!!document.getElementById('view-calc')`, 'fresh calculator shell');
}

function isHttpRequest(request) {
  try { return ['http:', 'https:'].includes(new URL(request.url).protocol); }
  catch { return false; }
}

async function waitForNetworkIdle(timeout = 15000) {
  const deadline = Date.now() + timeout;
  let idleSince = 0;
  while (Date.now() < deadline) {
    const relevant = [...state.requests.values()].filter(isHttpRequest);
    const pending = relevant.filter(request => !request.finished);
    if (relevant.length && pending.length === 0) {
      if (!idleSince) idleSince = Date.now();
      if (Date.now() - idleSince >= 1000) return relevant;
    } else {
      idleSince = 0;
    }
    await sleep(50);
  }
  const pending = [...state.requests.values()].filter(request =>
    isHttpRequest(request) && !request.finished).map(request => request.url);
  throw new Error(`Timed out waiting for network idle; pending=${JSON.stringify(pending)}`);
}

async function measureInitialLoad(base, width, height) {
  await setViewport(width, height);
  await state.page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await state.page.send('Network.setBypassServiceWorker', { bypass: true });
  state.requests.clear();
  state.redirects.length = 0;
  state.consoleErrors.length = 0;
  state.errors.length = 0;
  const marker = `${width}-${height}-${Date.now()}`;
  await state.page.send('Page.navigate', { url: `${base}/?budget=${marker}#calc` });
  await waitFor(state.page, `document.readyState === 'complete' && !!document.getElementById('view-calc')`, 'budget calculator shell');
  await evalJs(state.page, 'document.fonts?.ready');
  const settled = await waitForNetworkIdle();
  const networkRequests = [...state.redirects, ...settled].filter(isHttpRequest);
  const networkFailures = networkRequests
    .filter(request => request.failed || request.status == null || request.status >= 400)
    .map(request => `${request.url}: ${request.failed || `HTTP ${request.status}`}`);
  return {
    viewport: `${width}x${height}`,
    elements: await evalJs(state.page, 'document.getElementsByTagName("*").length'),
    viewElements: await evalJs(state.page, 'Object.fromEntries([...document.querySelectorAll(".view")].map(view => [view.id, view.getElementsByTagName("*").length]).sort((a, b) => b[1] - a[1]))'),
    requests: networkRequests.length,
    bytes: networkRequests.reduce((sum, request) => sum + request.bytes, 0),
    networkFailures,
    consoleErrors: [...state.consoleErrors],
    pageErrors: [...state.errors],
  };
}

async function createProfile() {
  await waitFor(state.page, `(() => { const select = document.getElementById('onboarding-faction'); return !!document.getElementById('onboarding-create') && select && select.options.length > 1; })()`, 'onboarding controls');
  await evalJs(state.page, `(() => {
    document.getElementById('onboarding-name').value = 'Smoke Pilot';
    const faction = document.getElementById('onboarding-faction');
    faction.value = 'BOS';
    document.getElementById('onboarding-create').click();
    return true;
  })()`);
  await waitFor(state.page, `document.getElementById('first-run').hidden && !document.getElementById('calc-workbench').hidden`, 'profile setup');
}

async function activateTab(view) {
  await evalJs(state.page, `document.querySelector('.tab[data-view="${view}"]')?.click()`);
  await waitFor(state.page, `document.querySelector('.view.active')?.id === 'view-${view}'`, `${view} tab`);
}

describe('real-browser calculator UX smoke', () => {
  let base;
  const smokeIt = it;

  before(async () => {
    base = await createStaticServer();
    await launchBrowser();
    await setViewport(1280, 900);
    await navigate(base, '#calc');
    await createProfile();
  });

  after(cleanupBrowser);

  smokeIt('keeps initial-load budgets within desktop and mobile limits', async () => {
    const desktop = await measureInitialLoad(base, 1280, 900);
    const mobile = await measureInitialLoad(base, 390, 844);
    for (const metrics of [desktop, mobile]) {
      assert.ok(metrics.elements <= 1250, `${metrics.viewport} initial DOM budget exceeded: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.elements >= 400, `${metrics.viewport} shell is unexpectedly empty: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.requests <= 90, `${metrics.viewport} request budget exceeded: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.requests >= 20, `${metrics.viewport} request measurement is unexpectedly empty: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.bytes <= 2 * 1024 * 1024, `${metrics.viewport} byte budget exceeded: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.bytes >= 512 * 1024, `${metrics.viewport} byte measurement is unexpectedly empty: ${JSON.stringify(metrics)}`);
      assert.deepEqual(metrics.networkFailures, [], `${metrics.viewport} network failures: ${metrics.networkFailures.join('; ')}`);
      assert.deepEqual(metrics.consoleErrors, [], `${metrics.viewport} console errors: ${metrics.consoleErrors.join('; ')}`);
      assert.deepEqual(metrics.pageErrors, [], `${metrics.viewport} page errors: ${metrics.pageErrors.join('; ')}`);
    }
    console.log(`[browser-budgets] ${JSON.stringify({ desktop, mobile })}`);
  });

  smokeIt('lazy-renders data-heavy views when they are opened', async () => {
    await activateTab('colonies');
    await waitFor(state.page, `document.querySelectorAll('#col-grid > *').length > 0`, 'colony cards');
    await activateTab('drugs');
    await waitFor(state.page, `document.querySelectorAll('#drug-table tr').length > 1`, 'drug rows');
    await activateTab('battle');
    await waitFor(state.page, `document.querySelectorAll('#bn-colony-chips > *').length > 0 && document.querySelectorAll('#bn-body > *').length > 0`, 'battle map controls');
    await activateTab('calc');
  });

  smokeIt('keeps the duplicate current-execution section removed', async () => {
    await evalJs(state.page, `document.getElementById('calc-guide-sample')?.click()`);
    await waitFor(state.page, `!!document.querySelector('#calc-result .plan-summary')`, 'calculator result');
    const snapshot = await evalJs(state.page, `(() => {
      return {
        executionPresent: !!document.getElementById('calc-execution-summary'),
        planVisible: !!document.querySelector('#calc-result .plan-summary'),
      };
    })()`);
    assert.equal(snapshot.executionPresent, false);
    assert.equal(snapshot.planVisible, true);
    assert.equal(await evalJs(state.page, 'document.title'), 'Empire Rising Production Calculator');
    const quantities = await evalJs(state.page, `(() => {
      const read = () => ({
        requested: document.querySelector('#calc-result .unit-table tbody tr td:nth-child(2)').textContent.trim(),
        summary: document.querySelector('#calc-result .plan-hero-note').textContent.replace(/\\s+/g, ' ').trim(),
      });
      const first = read();
      document.getElementById('calc-qty').value = '20';
      document.getElementById('calc-run').click();
      const next = read();
      document.getElementById('calc-qty').value = '10';
      document.getElementById('calc-run').click();
      return { first, next };
    })()`);
    assert.equal(quantities.first.requested, '10');
    assert.match(quantities.first.summary, /produces 12 × Emergency Medikit, including 2 extra/);
    assert.equal(quantities.next.requested, '20');
    assert.match(quantities.next.summary, /produces 21 × Emergency Medikit, including 1 extra/);
  });

  smokeIt('keeps invalid quantity from leaving stale execution markup', async () => {
    const stateAfter = await evalJs(state.page, `(() => {
      const qty = document.getElementById('calc-qty');
      qty.value = '0';
      document.getElementById('calc-run').click();
      return {
        executionPresent: !!document.getElementById('calc-execution-summary'),
        error: document.getElementById('calc-qty-error').textContent,
      };
    })()`);
    assert.equal(stateAfter.executionPresent, false);
    assert.match(stateAfter.error, /at least 1/i);
  });

  smokeIt('keeps a single-result batch click isolated from a pending tray', async () => {
    const stateAfter = await evalJs(state.page, `(() => {
      resetCalculatorForNewPlan();
      const scratch = document.getElementById('calc-scratch');
      if (scratch) scratch.checked = false;
      document.getElementById('calc-item').value = 'Emergency MediKit';
      document.getElementById('calc-qty').value = '10';
      runCalculator();
      addToTray('Linner PP7', 1);
      const mine = document.querySelector('#calc-result .obtain-batch.progress-run');
      mine?.click();
      return {
        mineFound: !!mine,
        singleVisible: !!document.querySelector('#calc-result .plan-summary'),
        combinedVisible: !!document.querySelector('#calc-multi .multi-head'),
      };
    })()`);
    assert.equal(stateAfter.mineFound, true);
    assert.equal(stateAfter.singleVisible, true);
    assert.equal(stateAfter.combinedVisible, false);
  });

  smokeIt('supports Ignore current inventory for combined plans', async () => {
    const stateAfter = await evalJs(state.page, `(() => {
      resetCalculatorForNewPlan();
      const scratch = document.getElementById('calc-scratch');
      if (scratch) scratch.checked = false;
      addToTray('Emergency MediKit', 2);
      addToTray('Linner PP7', 1);
      document.getElementById('calc-runmulti').click();
      const beforeInventory = JSON.stringify(STORE.INV_TOTAL);
      if (scratch) {
        scratch.checked = true;
        scratch.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        combinedVisible: !!document.querySelector('#calc-multi .multi-head'),
        singleVisible: !!document.querySelector('#calc-result .plan-summary'),
        scratchHeader: document.querySelector('#calc-multi .multi-head')?.textContent.includes('ignoring current inventory'),
        inventoryUnchanged: beforeInventory === JSON.stringify(STORE.INV_TOTAL),
      };
    })()`);
    assert.equal(stateAfter.combinedVisible, true);
    assert.equal(stateAfter.singleVisible, false);
    assert.equal(stateAfter.scratchHeader, true);
    assert.equal(stateAfter.inventoryUnchanged, true);
  });

  smokeIt('supports rapid inventory entry without losing focus', async () => {
    await activateTab('inventory');
    await setViewport(390, 844);
    const inventory = await evalJs(state.page, `(() => {
      const rapid = document.querySelector('.inventory-rapid-entry');
      return {
        right: rapid.getBoundingClientRect().right,
        width: rapid.getBoundingClientRect().width,
        viewport: window.innerWidth,
        position: getComputedStyle(rapid).position,
      };
    })()`);
    assert.ok(inventory.right <= inventory.viewport + 1, `rapid panel overflows viewport: ${JSON.stringify(inventory)}`);
    assert.equal(inventory.position, 'sticky');

    await evalJs(state.page, `(() => {
      const zone = document.getElementById('inv-zone');
      zone.value = zone.options[1]?.value || '';
      zone.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(state.page, `document.querySelector('#qp-grid [data-qp-item="bauxite"]')`, 'Bauxite inventory picker item');
    await evalJs(state.page, `document.querySelector('#qp-grid [data-qp-item="bauxite"]').click()`);
    const selected = await evalJs(state.page, `document.activeElement?.id`);
    assert.equal(selected, 'inv-qty');
    await evalJs(state.page, `(() => {
      document.getElementById('inv-qty').value = '3';
      document.getElementById('inv-addzone').click();
      return true;
    })()`);
    await waitFor(state.page, `document.getElementById('inv-table').textContent.includes('Bauxite')`, 'inventory row');
  });

  smokeIt('does not expose the retired Models area and safely redirects its old hash', async () => {
    await setViewport(1280, 900);
    const retired = await evalJs(state.page, `(() => {
      location.hash = '#models';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return {
        legacyNav: !!document.querySelector('[data-view="models"]'),
        groupedNav: !!document.querySelector('[data-nav-view="models"]'),
        view: !!document.getElementById('view-models'),
        calculatorActive: document.getElementById('view-calc')?.classList.contains('active'),
      };
    })()`);
    assert.deepEqual(retired, {
      legacyNav: false,
      groupedNav: false,
      view: false,
      calculatorActive: true,
    });
  });

  smokeIt('makes Gear picker intent distinct from the combat reference list', async () => {
    await activateTab('gear');
    const gearText = await evalJs(state.page, `document.getElementById('view-gear').innerText`);
    assert.match(gearText, /Click a loadout slot to choose compatible gear/i);
    assert.match(gearText, /Combat Stats Reference/);
    assert.match(gearText, /reference list below is for comparison/i);
  });

  smokeIt('keeps calculator cards and the inventory rapid panel inside a mobile viewport', async () => {
    await setViewport(390, 844);
    await activateTab('calc');
    await evalJs(state.page, `(() => {
      document.getElementById('calc-item').value = 'Emergency MediKit';
      document.getElementById('calc-qty').value = '10';
      document.getElementById('calc-run').click();
      return true;
    })()`);
    await waitFor(state.page, `!!document.querySelector('#calc-result .plan-summary')`, 'mobile calculator result');
    const bounds = await evalJs(state.page, `(() => {
      const selectors = ['#calc-result', '#calc-result .plan-top', '#calc-result .flow-card', '#calc-result .recipe-card', '#calc-result .batch-progress'];
      return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map(el => {
        const rect = el.getBoundingClientRect();
        return { selector, right: rect.right, left: rect.left, width: rect.width };
      }));
    })()`);
    for (const rect of bounds) {
      assert.ok(rect.left >= -1, `${rect.selector} starts outside viewport: ${JSON.stringify(rect)}`);
      assert.ok(rect.right <= 391, `${rect.selector} overflows viewport: ${JSON.stringify(rect)}`);
      assert.ok(rect.width <= 391, `${rect.selector} is wider than viewport: ${JSON.stringify(rect)}`);
    }
  });

  smokeIt('keeps Refine and Manufacture objectives readable across card widths', async () => {
    await activateTab('calc');
    const failures = [];
    try {
    for (const [width, scale] of [
      [360, 100], [360, 150], [430, 100], [430, 150],
      [663, 100], [663, 150], [768, 100], [768, 150],
      [1024, 100], [1280, 100], [1920, 100], [2292, 100],
    ]) {
      await setViewport(width, 844);
      await evalJs(state.page, `(() => {
        resetCalculatorForNewPlan();
        applyFontScale(${scale});
        document.getElementById('calc-item').value = 'Emergency MediKit';
        document.getElementById('calc-qty').value = '300';
        document.getElementById('calc-run').click();
        return true;
      })()`);
      await waitFor(state.page, `!!document.querySelector('#calc-result .recipe-card.refine')`, 'mobile refine card');
      const stateAtWidth = await evalJs(state.page, `(() => {
        const lineCount = el => {
          const node = el.firstChild;
          if (!node || node.nodeType !== Node.TEXT_NODE) return 0;
          const tops = new Set();
          const range = document.createRange();
          for (let i = 0; i < node.length; i += 1) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0) tops.add(Math.round(rect.top));
          }
          return tops.size;
        };
        const advanceTo = selector => {
          for (let step = 0; step < 80; step += 1) {
            const target = document.querySelector(selector);
            if (target) return target;
            const current = document.querySelector('#calc-result [data-current-objective="true"]');
            if (!current) return null;
            const control = current.querySelector('input[type="checkbox"]:not(:checked), button:not(:disabled)');
            if (!control) return null;
            control.click();
          }
          return null;
        };
        const inspect = card => {
          if (!card) return null;
          const badge = getComputedStyle(card, '::before');
          const output = card.querySelector('.flow-chip.output');
          const name = output.querySelector('.flow-name');
          const outputRect = output.getBoundingClientRect();
          const nameRect = name.getBoundingClientRect();
          return {
            process: card.classList.contains('refine') ? 'refine' : 'manufacture',
            runtimeCurrent: card.dataset.currentObjective,
            ariaCurrent: card.getAttribute('aria-current'),
            name: name.textContent.trim(),
            nameLines: lineCount(name),
            nameWidth: nameRect.width,
            fontSize: parseFloat(getComputedStyle(name).fontSize),
            inputNames: Array.from(card.querySelectorAll('.flow-chip.input .flow-name')).map(inputName => ({
              name: inputName.textContent.trim(),
              lines: lineCount(inputName),
              width: inputName.getBoundingClientRect().width,
              fontSize: parseFloat(getComputedStyle(inputName).fontSize),
            })),
            outputOverflow: output.scrollWidth > output.clientWidth + 1,
            badgeColor: badge.color,
            badgeWidth: parseFloat(badge.width),
            badgeFontSize: parseFloat(badge.fontSize),
            badgeWhiteSpace: badge.whiteSpace,
            badgeLeft: badge.left,
            badgeRight: badge.right,
            cardRight: card.getBoundingClientRect().right,
            outputRight: outputRect.right,
          };
        };
        const refine = inspect(advanceTo('#calc-result .recipe-card.refine[data-current-objective="true"]'));
        const manufacture = inspect(advanceTo('#calc-result .section[data-section="manufacture"] .recipe-card.manufacture[data-current-objective="true"]'));
        return { refine, manufacture };
      })()`);
      assert.ok(stateAtWidth.refine, `runtime did not advance to a Refine objective at ${width}px/${scale}%`);
      assert.ok(stateAtWidth.manufacture, `runtime did not advance to a Manufacture objective at ${width}px/${scale}%`);
      assert.equal(stateAtWidth.refine.process, 'refine');
      assert.equal(stateAtWidth.manufacture.process, 'manufacture');

      for (const card of [stateAtWidth.refine, stateAtWidth.manufacture]) {
        if (card.runtimeCurrent !== 'true' || card.ariaCurrent !== 'step') failures.push({ width, scale, issue: 'runtime objective state missing', card });
        if (card.badgeColor === 'rgb(0, 0, 0)') failures.push({ width, scale, issue: 'black objective label', card });
        if (card.badgeWhiteSpace !== 'nowrap' || card.badgeWidth < card.badgeFontSize * 8 || parseFloat(card.badgeLeft) < -1) failures.push({ width, scale, issue: 'collapsed objective label', card });
        if (card.nameLines > 2 || card.nameWidth < card.fontSize * 3) failures.push({ width, scale, issue: 'character-by-character item name', card });
        if (card.inputNames.some(name => name.lines > 2 || name.width < name.fontSize * 3)) failures.push({ width, scale, issue: 'character-by-character input name', card });
        if (card.outputOverflow || card.outputRight > width + 1 || card.cardRight > width + 1) failures.push({ width, scale, issue: 'recipe output overflow', card });
      }
    }
    } finally {
      await evalJs(state.page, `applyFontScale(100)`);
    }
    assert.deepEqual(failures, [], `mobile recipe-step readability failures: ${JSON.stringify(failures)}`);
  });

  smokeIt('keeps Gear 1.10 inside a phone viewport without horizontal page overflow', async () => {
    await setViewport(360, 640);
    await activateTab('patch-changes');
    await waitFor(state.page, `document.querySelectorAll('#view-patch-changes .patch-profile-card').length > 0`, 'Gear 1.10 profile cards');
    for (const scale of [75, 100, 150]) {
      await evalJs(state.page, `applyFontScale(${scale})`);
      const bounds = await evalJs(state.page, `(() => ({
        scale: document.getElementById('size-range')?.value,
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        widestCard: Math.max(0, ...Array.from(document.querySelectorAll('#view-patch-changes .patch-profile-card')).map(card => card.getBoundingClientRect().right)),
      }))()`);
      assert.ok(bounds.documentWidth <= bounds.viewport + 1, `Gear 1.10 document overflows phone viewport: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.bodyWidth <= bounds.viewport + 1, `Gear 1.10 body overflows phone viewport: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.widestCard <= bounds.viewport + 1, `Gear 1.10 card overflows phone viewport: ${JSON.stringify(bounds)}`);
    }
    await evalJs(state.page, `applyFontScale(100)`);
  });

  smokeIt('keeps calculator labels and picker names unclipped at every required display size', async () => {
    await activateTab('calc');
    const failures = [];
    for (const [label, width, height] of [
      ['mobile', 390, 844], ['ipad', 768, 1024], ['720p', 1280, 720],
      ['1080p', 1920, 1080], ['2k', 2560, 1440], ['4k', 3840, 2160],
    ]) {
      await setViewport(width, height);
      for (const scale of [75, 100, 150]) {
        await evalJs(state.page, `applyFontScale(${scale})`);
        const clipped = await evalJs(state.page, `(() => Array.from(document.querySelectorAll('.pick-name, .cb-label, .mat-name'))
          .filter(el => el.getClientRects().length && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
          .map(el => ({ className: el.className, text: el.textContent.trim(), client: [el.clientWidth, el.clientHeight], scroll: [el.scrollWidth, el.scrollHeight] })))()`);
        if (clipped.length) failures.push({ label, width, height, scale, clipped });
      }
    }
    await evalJs(state.page, `applyFontScale(100)`);
    assert.deepEqual(failures, [], `responsive text clipping detected: ${JSON.stringify(failures)}`);
  });

  smokeIt('keeps every public view inside every required viewport at every text size', async () => {
    const failures = [];
    for (const [label, width, height] of [
      ['mobile', 390, 844], ['ipad', 768, 1024], ['720p', 1280, 720],
      ['1080p', 1920, 1080], ['2k', 2560, 1440], ['4k', 3840, 2160],
    ]) {
      await setViewport(width, height);
      for (const scale of [75, 100, 150]) {
        await evalJs(state.page, `applyFontScale(${scale})`);
        for (const view of ['calc', 'inventory', 'gear', 'patch-changes', 'colonies', 'drugs', 'battle', 'community']) {
          await activateTab(view);
          const widths = await evalJs(state.page, `(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            offenders: Array.from(document.querySelectorAll('.view.active *, header *, .playerbar *')).filter(el => {
              if (el.closest('[hidden], [aria-hidden="true"], details:not([open])')) return false;
              const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
              if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0) return false;
              const outside = rect.left < -1 || rect.right > innerWidth + 1 || rect.width > innerWidth + 1;
              if (!outside) return false;
              for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                const parentStyle = getComputedStyle(parent);
                if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowX) && parent.scrollWidth > parent.clientWidth + 1) return false;
              }
              return true;
            }).map(el => { const rect = el.getBoundingClientRect(); return { tag: el.tagName, id: el.id, className: String(el.className).slice(0, 80), text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 100), left: rect.left, right: rect.right, width: rect.width }; }).slice(0, 20),
          }))()`);
          if (widths.document > widths.viewport + 1 || widths.body > widths.viewport + 1 || widths.offenders.length) failures.push({ label, width, height, scale, view, widths });
        }
      }
    }
    await evalJs(state.page, `applyFontScale(100)`);
    assert.deepEqual(failures, [], `public-view horizontal overflow detected: ${JSON.stringify(failures)}`);
  });

  smokeIt('switches and persists every theme at every required viewport', async () => {
    const failures = [];
    for (const [label, width, height] of [
      ['mobile', 390, 844], ['ipad', 768, 1024], ['720p', 1280, 720],
      ['1080p', 1920, 1080], ['2k', 2560, 1440], ['4k', 3840, 2160],
    ]) {
      await setViewport(width, height);
      for (const theme of ['auto', 'dark', 'light', 'trans', 'pride', 'bos', 'cmg', 'ec', 'fdc', 'gom', 'led', 'motb', 'vi']) {
        const applied = await evalJs(state.page, `(() => { applyTheme('${theme}'); return { selected: document.getElementById('theme-select').value, saved: localStorage.getItem('cmg_theme'), resolved: document.documentElement.dataset.theme, autoResolved: resolveTheme('auto') }; })()`);
        const expected = theme === 'auto' ? applied.autoResolved : theme;
        if (applied.selected !== theme || applied.saved !== theme || applied.resolved !== expected) failures.push({ label, width, height, theme, expected, applied });
      }
    }
    await evalJs(state.page, `applyTheme('trans')`);
    await state.page.send('Page.reload', { ignoreCache: true });
    await waitFor(state.page, `document.getElementById('theme-select')?.value === 'trans' && document.documentElement.dataset.theme === 'trans'`, 'persisted Trans theme');
    assert.deepEqual(failures, [], `theme switching failed: ${JSON.stringify(failures)}`);
  });

  smokeIt('keeps transient notifications bounded, single-instance, and dismissible', async () => {
    await setViewport(390, 844);
    await activateTab('calc');
    const toastState = await evalJs(state.page, `(() => {
      document.getElementById('toast-area')?.remove();
      toast('First test notification', 10000, 'success');
      toast('Second test notification', 10000, 'success');
      const area = document.getElementById('toast-area');
      const latest = area.lastElementChild;
      const close = latest.querySelector('button');
      const nav = document.querySelector('.mobile-nav-v2');
      const tr = latest.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      return { count: area.children.length, hasClose: !!close, closeSize: close ? [close.getBoundingClientRect().width, close.getBoundingClientRect().height] : [0, 0], toastBottom: tr.bottom, navTop: nr.top };
    })()`);
    assert.equal(toastState.count, 1, `notifications stack over content: ${JSON.stringify(toastState)}`);
    assert.equal(toastState.hasClose, true, `notification has no dismiss action: ${JSON.stringify(toastState)}`);
    assert.ok(toastState.closeSize[0] >= 44 && toastState.closeSize[1] >= 44, `notification dismiss action is not touch sized: ${JSON.stringify(toastState)}`);
    assert.ok(toastState.toastBottom <= toastState.navTop - 4, `notification overlaps mobile navigation: ${JSON.stringify(toastState)}`);
    await evalJs(state.page, `document.querySelector('#toast-area .toast button').click()`);
    await waitFor(state.page, `document.querySelectorAll('#toast-area .toast').length === 0`, 'dismissed notification');
  });

  smokeIt('keeps the iPad More menu above the player toolbar', async () => {
    await setViewport(768, 1024);
    await evalJs(state.page, `document.querySelector('.nav-more-btn').click()`);
    await waitFor(state.page, `document.getElementById('nav-more-menu')?.hidden === false`, 'More menu');
    const stacking = await evalJs(state.page, `(() => {
      const menu = document.getElementById('nav-more-menu');
      const player = document.querySelector('.playerbar');
      const header = document.querySelector('header');
      const m = menu.getBoundingClientRect();
      const p = player.getBoundingClientRect();
      const overlapTop = Math.max(m.top, p.top, 0);
      const overlapBottom = Math.min(m.bottom, p.bottom, innerHeight);
      let topInsideMenu = null;
      if (overlapBottom > overlapTop) {
        const x = Math.max(0, Math.min(innerWidth - 1, m.left + m.width / 2));
        const y = overlapTop + (overlapBottom - overlapTop) / 2;
        const top = document.elementFromPoint(x, y);
        topInsideMenu = !!top && (top === menu || menu.contains(top));
      }
      return { headerZ: Number(getComputedStyle(header).zIndex), playerZ: Number(getComputedStyle(player).zIndex), menu: { top: m.top, bottom: m.bottom }, player: { top: p.top, bottom: p.bottom }, topInsideMenu };
    })()`);
    assert.ok(stacking.headerZ > stacking.playerZ, `More menu stacking context is below the player toolbar: ${JSON.stringify(stacking)}`);
    if (stacking.topInsideMenu !== null) assert.equal(stacking.topInsideMenu, true, `More menu is painted behind another surface: ${JSON.stringify(stacking)}`);
    await evalJs(state.page, `document.querySelector('.nav-more-btn').click()`);
  });

  smokeIt('keeps mobile settings and modal controls inside the viewport with touch-sized actions', async () => {
    await setViewport(360, 640);
    await activateTab('gear');
    await evalJs(state.page, `(() => { document.querySelector('.settings-menu').open = true; applyFontScale(150); })()`);
    const settings = await evalJs(state.page, `(() => ({
      viewport: window.innerWidth,
      panel: (() => { const r = document.querySelector('.settings-panel').getBoundingClientRect(); return { left: r.left, right: r.right }; })(),
      controls: Array.from(document.querySelectorAll('.size-control > *')).filter(el => getComputedStyle(el).display !== 'none').map(el => { const r = el.getBoundingClientRect(); return { id: el.id, left: r.left, right: r.right }; }),
    }))()`);
    assert.ok(settings.panel.left >= -1 && settings.panel.right <= settings.viewport + 1, `settings panel escapes viewport: ${JSON.stringify(settings)}`);
    for (const control of settings.controls) {
      assert.ok(control.left >= settings.panel.left - 1 && control.right <= settings.panel.right + 1, `settings control escapes panel: ${JSON.stringify({ settings, control })}`);
    }
    await evalJs(state.page, `(() => { document.querySelector('.settings-menu').open = false; applyFontScale(100); document.querySelector('.gear-slot')?.click(); })()`);
    await waitFor(state.page, `document.getElementById('gear-picker-overlay')?.hidden === false`, 'gear picker');
    const close = await evalJs(state.page, `(() => { const r = document.getElementById('gear-picker-close').getBoundingClientRect(); return { width: r.width, height: r.height }; })()`);
    assert.ok(close.width >= 44 && close.height >= 44, `gear picker close action is not touch sized: ${JSON.stringify(close)}`);
    await evalJs(state.page, `document.getElementById('gear-picker-close').click()`);
  });

  smokeIt('keeps touch controls comfortably sized on phone and iPad layouts', async () => {
    const undersized = [];
    for (const [label, width, height] of [['mobile', 390, 844], ['ipad', 768, 1024]]) {
      await setViewport(width, height);
      await evalJs(state.page, `applyFontScale(100)`);
      for (const view of ['calc', 'inventory', 'gear', 'patch-changes', 'colonies', 'drugs', 'battle', 'community']) {
        await activateTab(view);
        const controls = await evalJs(state.page, `(() => {
          const roots = [document.querySelector('.view.active'), document.querySelector('header'), document.querySelector('.playerbar'), document.querySelector('.mobile-nav-v2')].filter(Boolean);
          return roots.flatMap(root => Array.from(root.querySelectorAll('button, summary, select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])')))
            .filter((el, index, all) => all.indexOf(el) === index && !el.disabled && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none' && el.getClientRects().length)
            .map(el => { const rect = el.getBoundingClientRect(); return { tag: el.tagName, id: el.id, className: String(el.className).slice(0, 60), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 70), width: rect.width, height: rect.height }; })
            .filter(item => item.height < 43.5 || item.width < 43.5);
        })()`);
        if (controls.length) undersized.push({ label, width, height, view, controls });
      }
    }
    assert.deepEqual(undersized, [], `undersized touch controls detected: ${JSON.stringify(undersized)}`);
  });

  smokeIt('moves focus into a gated direct route after onboarding', async () => {
    await setViewport(390, 844);
    await evalJs(state.page, `localStorage.clear(); sessionStorage.clear(); location.hash = '#patch-changes'; location.reload();`);
    await waitFor(state.page, `document.getElementById('onboarding-faction')?.options.length > 1`, 'gated-route onboarding');
    await createProfile();
    await waitFor(state.page, `document.querySelector('.view.active')?.id === 'view-patch-changes'`, 'restored Gear 1.10 route');
    await waitFor(state.page, `document.getElementById('view-patch-changes')?.dataset.ready === 'true'`, 'Gear 1.10 initialization');
    const focus = await evalJs(state.page, `(() => ({
      id: document.activeElement?.id || '',
      tag: document.activeElement?.tagName || '',
      insideActiveView: !!document.querySelector('.view.active')?.contains(document.activeElement),
      activeView: document.querySelector('.view.active')?.id || '',
    }))()`);
    assert.equal(focus.insideActiveView, true, `focus did not move into the restored route: ${JSON.stringify(focus)}`);
  });

  smokeIt('finishes without page exceptions', () => {
    assert.deepEqual(state.errors, [], `browser exceptions: ${state.errors.join('; ')}`);
  });
});
