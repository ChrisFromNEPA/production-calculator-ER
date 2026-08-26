// tests/browser/calculator-ux.spec.mjs
// Real-browser smoke coverage for the calculator, inventory rapid entry,
// Item Catalog keyboard access, and Gear picker/reference separation.
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
  const result = await page.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
  return result.result?.value;
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

const state = { server: null, port: 0, profile: null, chrome: null, browser: null, browserContextId: null, page: null, errors: [], ownsChrome: false };

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
  state.page.on('Runtime.exceptionThrown', params => state.errors.push(params.exceptionDetails?.text || 'page exception'));
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
  let setupError = null;
  const smokeIt = (name, fn) => it(name, async t => {
    if (setupError) return t.skip(`browser setup unavailable: ${setupError.message}`);
    return fn();
  });

  before(async () => {
    try {
      base = await createStaticServer();
      await launchBrowser();
      await setViewport(1280, 900);
      await navigate(base, '#calc');
      await createProfile();
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
      await cleanupBrowser();
    }
  });

  after(cleanupBrowser);

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

  smokeIt('opens Item Catalog details from a focused card with Enter', async () => {
    await setViewport(1280, 900);
    await activateTab('models');
    await evalJs(state.page, `document.getElementById('models-tab-icons').click()`);
    await waitFor(state.page, `document.querySelector('#icons-grid .icon-card')`, 'item catalog card');
    const card = await evalJs(state.page, `(() => {
      const item = document.querySelector('#icons-grid .icon-card');
      item.focus();
      return { role: item.getAttribute('role'), tabindex: item.getAttribute('tabindex'), pressed: item.getAttribute('aria-pressed') };
    })()`);
    assert.equal(card.role, 'button');
    assert.equal(card.tabindex, '0');
    assert.equal(card.pressed, 'false');
    await state.page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await state.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(state.page, `!document.getElementById('icons-detail').hidden`, 'item detail panel');
    assert.ok(await evalJs(state.page, `document.getElementById('icons-detail-name').textContent.length > 0`));
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

  smokeIt('finishes without page exceptions', () => {
    assert.deepEqual(state.errors, [], `browser exceptions: ${state.errors.join('; ')}`);
  });
});
