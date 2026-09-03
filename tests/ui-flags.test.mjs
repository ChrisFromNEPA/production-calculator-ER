// tests/ui-flags.test.mjs — progressive UI rollout flag contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const start = source.indexOf('// ---- Progressive feature flags ----');
const end = source.indexOf('// ---- Tabs ----');
assert.ok(start >= 0 && end > start, 'feature flag section markers must exist');
const featureSource = source.slice(start, end);

function loadFlags(initial = {}) {
  const store = new Map(Object.entries(initial));
  const rootElement = { dataset: {} };
  const storage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  const context = {
    window: { localStorage: storage },
    document: { documentElement: rootElement },
    localStorage: storage,
  };
  vm.runInNewContext(featureSource, context);
  return { context, rootElement, store };
}

describe('progressive UI rollout flags', () => {
  it('defaults all staged flags off and reflects them on the document root', () => {
    const { context, rootElement } = loadFlags();
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.CMG_FEATURE_FLAGS)), {
      layout_v2: false,
      motion_v2: false,
    });
    assert.deepEqual(rootElement.dataset, {
      cmgLayoutV2: 'off',
      cmgMotionV2: 'off',
    });
  });

  it('loads only known boolean persisted overrides', () => {
    const { context, rootElement } = loadFlags({
      cmg_feature_flags_v1: JSON.stringify({ layout_v2: true, motion_v2: false, unknown: true }),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.CMG_FEATURE_FLAGS)), {
      layout_v2: true,
      motion_v2: false,
    });
    assert.equal(rootElement.dataset.cmgLayoutV2, 'on');
    assert.equal(rootElement.dataset.cmgMotionV2, 'off');

  });

  it('ignores malformed storage and supports a persisted single-flag override', () => {
    const { context, rootElement, store } = loadFlags({ cmg_feature_flags_v1: '{bad json' });
    assert.equal(context.setCMGFeatureFlag('motion_v2', true), true);
    assert.equal(context.window.CMG_FEATURE_FLAGS.motion_v2, true);
    assert.deepEqual(JSON.parse(store.get('cmg_feature_flags_v1')), {
      layout_v2: false,
      motion_v2: true,
    });
    assert.equal(context.setCMGFeatureFlag('not_a_flag', true), false);
  });
});
