// Workspace portability contract — RED before implementation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const store = readFileSync(join(root, 'src', 'store.js'), 'utf8');
const player = readFileSync(join(root, 'src', 'views', 'player.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');

describe('portable public workspace', () => {
  it('defines a versioned workspace envelope and validates before mutation', () => {
    assert.match(store, /empire-rising-workspace/);
    assert.match(store, /WORKSPACE_SCHEMA_VERSION/);
    assert.match(store, /Invalid workspace snapshot/);
    assert.match(store, /validate.*workspace|workspace.*validate/i);
  });

  it('includes player, local settings, and all public local-storage namespaces', () => {
    assert.match(store, /players/);
    assert.match(store, /localStorage/);
    assert.match(store, /cmg_tray_v1/);
    assert.match(store, /er_saved_plans_v1/);
    assert.match(store, /CMG_HYDRATE_WORKSPACE/);
  });

  it('exposes workspace import/export controls in the public shell', () => {
    assert.match(init, /workspace-export|Export workspace/i);
    assert.match(init, /workspace-import|Import workspace/i);
    assert.match(init, /S\.exportWorkspace|S\.importWorkspace/);
  });

  it('exports a workspace with a player/entry summary and timestamp in the filename', () => {
    assert.match(player, /function workspaceExportFilename\(\)/);
    assert.match(init, /downloadJSON\(S\.exportWorkspace\(\), workspaceExportFilename\(\)\)/);
    assert.match(player, /empire-rising-workspace-/);
    assert.match(player, /toISOString/);
  });

  it('skips the first-run tutorial after a complete workspace import', () => {
    assert.match(init, /S\.importWorkspace\(JSON\.parse\(reader\.result\)\)/);
    assert.match(init, /S\.importWorkspace\(JSON\.parse\(reader\.result\)\)[\s\S]*dismissCalcGuide\(\{ focus: false \}\)[\s\S]*refreshAll\(\)/);
  });

  it('preserves legacy inventory-only imports', () => {
    assert.match(player, /Array\.isArray\(obj\).*obj\.inventory|obj\.inventory/);
  });
});
