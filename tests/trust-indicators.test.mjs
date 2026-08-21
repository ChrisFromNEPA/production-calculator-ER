// tests/trust-indicators.test.mjs — data freshness, offline, and update indicators
// ============================================================================
// P2 player-trust contract: the app must show truthful, compact indicators for
// snapshot data (dates read from the bundled data files only — never invented),
// cached/offline state, and pending app updates. It must never claim live sync.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Minimal browser globals the module expects (mirrors harness.mjs).
// NOTE: Node 22 defines a read-only global `navigator` getter, so we never
// reassign it — the module only reads it inside DOM init, which the pure
// function tests below never trigger.
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
};

const trust = require(join(root, 'src', 'ui', 'trust-indicators.js'));

describe('data freshness indicator', () => {
  it('derives the snapshot date from the real bundled metadata, not an invented date', () => {
    const gameData = JSON.parse(readFileSync(join(root, 'data/game_data.json'), 'utf8'));
    const balanceStats = JSON.parse(readFileSync(join(root, 'data/balance_stats.json'), 'utf8'));
    const costs = JSON.parse(readFileSync(join(root, 'data/costs.json'), 'utf8'));
    const armorClasses = JSON.parse(readFileSync(join(root, 'data/armor_classes.json'), 'utf8'));

    const meta = trust.collectDataMeta(gameData, balanceStats, costs, armorClasses);
    assert.ok(meta.fields.length >= 3, 'should read at least the three dated datasets');
    // The newest bundled dataset is the balance sheet fetch.
    assert.equal(meta.latest, balanceStats._meta.fetched);
    const label = trust.formatDataLabel(meta);
    assert.match(label, new RegExp(balanceStats._meta.fetched));
    assert.match(label, /snapshot/i);
    // Source attribution is explicit and truthful.
    assert.match(meta.sources, /Balance Sheet/i);
    assert.match(meta.sources, /game data/i);
  });

  it('never invents a date when metadata is missing', () => {
    const meta = trust.collectDataMeta({}, {}, {}, {});
    assert.equal(meta.latest, null);
    const label = trust.formatDataLabel(meta);
    assert.doesNotMatch(label, /\d{4}-\d{2}-\d{2}/, 'must not fabricate a date');
    assert.match(label, /snapshot/i);
  });

  it('never claims live sync in any static indicator text', () => {
    for (const text of [trust.offlineText(), trust.formatDataLabel(trust.collectDataMeta({}, {}, {}, {}))]) {
      assert.doesNotMatch(text, /\blive\b/i, `indicator text must not claim live sync: "${text}"`);
    }
  });
});

describe('offline indicator', () => {
  it('shows cached-copy status only when the browser reports offline', () => {
    assert.equal(trust.shouldShowOffline({ onLine: false }), true);
    assert.equal(trust.shouldShowOffline({ onLine: true }), false);
    assert.equal(trust.shouldShowOffline({}), false);
  });

  it('uses accessible status wording for the offline state', () => {
    assert.match(trust.offlineText(), /offline/i);
    assert.match(trust.offlineText(), /saved copy|cached/i);
  });
});

describe('update indicator', () => {
  it('prompts to reload only when a new worker is installed while a controller exists', () => {
    assert.equal(trust.updateStatus('installed', { hasController: true, sawUpdate: false }), null);
    const first = trust.updateStatus('installed', { hasController: true, sawUpdate: true });
    assert.match(first.text, /reload/i);
    // First-ever install (no controller) is not an update — nothing stale to reload.
    assert.equal(trust.updateStatus('installed', { hasController: false, sawUpdate: false }), null);
    // Activation after a tracked update still tells the player to reload.
    const after = trust.updateStatus('activated', { hasController: true, sawUpdate: true });
    assert.match(after.text, /reload/i);
  });
});

describe('footer wiring', () => {
  it('renders the data snapshot chip from the real bundled globals on init', () => {
    const makeEl = (hidden) => ({ hidden: !!hidden, textContent: '', title: '', dataset: {}, addEventListener() {} });
    const els = {
      'trust-data': makeEl(),
      'trust-online': makeEl(true),
      'trust-update': makeEl(true),
      'trust-update-text': makeEl(),
      'trust-update-reload': makeEl(),
    };
    const savedGet = globalThis.document.getElementById;
    globalThis.document.getElementById = id => els[id] || null;
    try {
      globalThis.window.GAME_DATA = JSON.parse(readFileSync(join(root, 'data/game_data.json'), 'utf8'));
      globalThis.window.BALANCE_STATS = JSON.parse(readFileSync(join(root, 'data/balance_stats.json'), 'utf8'));
      globalThis.window.COSTS = JSON.parse(readFileSync(join(root, 'data/costs.json'), 'utf8'));
      globalThis.window.ARMOR_CLASSES = JSON.parse(readFileSync(join(root, 'data/armor_classes.json'), 'utf8'));

      trust.initTrustIndicators();

      const fetched = JSON.parse(readFileSync(join(root, 'data/balance_stats.json'), 'utf8'))._meta.fetched;
      assert.match(els['trust-data'].textContent, new RegExp(fetched));
      assert.match(els['trust-data'].title, /Balance Sheet/);
      assert.equal(els['trust-online'].hidden, true, 'online start keeps the offline chip hidden');
      assert.equal(els['trust-update'].hidden, true, 'no update yet keeps the update chip hidden');
    } finally {
      globalThis.document.getElementById = savedGet;
    }
  });
});

describe('shell contract for the indicators', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const gear = readFileSync(join(root, 'src/views/gear.js'), 'utf8');
  const moduleSrc = readFileSync(join(root, 'src/ui/trust-indicators.js'), 'utf8');

  it('ships the trust module and registers the service worker from it', () => {
    assert.match(html, /src="src\/ui\/trust-indicators\.js\?v=\d+"/);
    assert.match(moduleSrc, /serviceWorker\.register\('sw\.js'\)/);
    assert.doesNotMatch(html, /navigator\.serviceWorker\.register/, 'registration must live in the trust module, not inline');
  });

  it('places the indicators in the footer with accessible status regions', () => {
    assert.match(html, /<footer>[\s\S]*?class="footer-bar"/);
    assert.match(html, /id="trust-data"/);
    assert.match(html, /id="trust-online"[\s\S]*?role="status"/);
    assert.match(html, /id="trust-update"[\s\S]*?role="status"/);
  });

  it('keeps the shell precache honest about its own version', () => {
    assert.match(sw, /const CACHE\s*=\s*['"]er-v0\.2\.33['"]/);
    assert.match(sw, /'\.\/src\/ui\/trust-indicators\.js'/);
  });

  it('does not claim the balance sheet is live — it is a fetched snapshot', () => {
    assert.doesNotMatch(gear, /live Google Sheet/);
    assert.match(gear, /snapshot/i);
  });
});
