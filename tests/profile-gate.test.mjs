// Mandatory name + faction onboarding gate contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const store = readFileSync(join(root, 'src/store.js'), 'utf8');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const player = readFileSync(join(root, 'src/views/player.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles/ux-release.css'), 'utf8');

test('profile gate requires a real name and faction before navigation', async (t) => {
  await t.test('stores a reusable completeness predicate and rejects unaffiliated defaults', () => {
    assert.match(store, /function isProfileComplete\(/);
    assert.match(store, /UNAFFILIATED/);
    assert.match(store, /isProfileComplete/);
  });

  await t.test('guards direct navigation and hash routes', () => {
    assert.match(core, /hasCompletePlayerProfile/);
    assert.match(core, /pendingProfileView/);
    assert.match(core, /function clearPendingProfileView\(/);
    assert.match(core, /v !== ['"]calc['"]/);
    assert.match(init, /applyPublicHashRoute/);
    assert.match(init, /profile/i);
  });

  await t.test('clears stale pending routes only when Calculator is chosen explicitly', () => {
    assert.match(init, /route === ['"]calc['"][\s\S]*clearPendingProfileView\(\)/);
    assert.match(init, /t\.dataset\.view === ['"]calc['"][\s\S]*clearPendingProfileView\(\)/);
    assert.match(init, /tab\.dataset\.view === ['"]calc['"][\s\S]*clearPendingProfileView\(\)/);
    assert.match(init, /button\.dataset\.navView === ['"]calc['"][\s\S]*clearPendingProfileView\(\)/);
  });

  await t.test('leaves Settings available while the rest of the app is gated', () => {
    assert.match(html, /class="settings-menu"/);
    assert.match(html, /id="profile-gate-notice"/);
    assert.match(css, /profile-gated/);
    assert.match(css, /settings-menu/);
    assert.match(player, /isProfileComplete|hasCompletePlayerProfile/);
  });

  await t.test('requires a non-placeholder onboarding faction', () => {
    assert.match(html, /id="onboarding-faction"[^>]*required/);
    assert.match(init, /Choose a faction/);
    assert.match(init, /onboardingFaction\?\.value/);
  });
});
