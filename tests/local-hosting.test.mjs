// tests/local-hosting.test.mjs — keep the LAN development entry point documented
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const docs = readFileSync(join(root, 'docs', 'local-hosting.md'), 'utf8');

describe('long-running local hosting', () => {
  it('provides a LAN-bound Vite command for the working tree', () => {
    assert.equal(pkg.scripts['local:host'], 'vite --host 0.0.0.0 --port 4173 --strictPort');
  });

  it('documents the restartable user service and Windows URL workflow', () => {
    assert.match(docs, /systemctl --user (enable|start|restart)/);
    assert.match(docs, /<host-address>:4173|trusted LAN/);
    assert.match(docs, /do not expose|not expose|LAN only/i);
  });
});
