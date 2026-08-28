// tests/gear-toggle-clarity.test.mjs — explain what loadout toggles include
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const gear = readFileSync(join(root, 'src/views/gear.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const FN_RE = /function\s+gearToggleDescription\s*\([\s\S]*?\n\}/;
const helperSrc = gear.match(FN_RE);
assert.ok(helperSrc, 'gear.js must define gearToggleDescription(slotType)');

function description(slotType) {
  const sandbox = { gearToggleDescription: undefined };
  vm.createContext(sandbox);
  vm.runInContext(helperSrc[0], sandbox);
  return sandbox.gearToggleDescription(slotType);
}

describe('gear loadout toggle clarity', () => {
  it('describes gear, booster/food, and medikit inclusion separately', () => {
    assert.equal(description('armor'), 'Include this gear in loadout stats');
    assert.equal(description('booster'), 'Include this booster / food in loadout stats');
    assert.equal(description('medikit'), 'Include this medikit in loadout stats');
  });

  it('shows a visible explanation beside the paperdoll', () => {
    assert.match(html, /id="gear-toggle-guide"/);
    assert.match(html, /Checked\s*=\s*included in/s);
    assert.match(html, /<b>Loadout Stats<\/b>/);
    assert.match(html, /Unchecked.*excluded/s);
  });

  it('places the toggle explanation below the gear picker', () => {
    const picker = html.indexOf('class="gear-paperdoll"');
    const guide = html.indexOf('id="gear-toggle-guide"');
    const actions = html.indexOf('class="gear-actions"');
    assert.ok(picker >= 0 && guide > picker && actions > guide);
  });

  it('maps both chest implants to the torso/chest slot', () => {
    assert.match(gear, /TorsoArmor:\s*\['Stamina Amplification',\s*'Shield Implant'\]/);
    assert.match(gear, /Stamina Amp - Torso, Shield Implant - Torso/);
  });

  it('gives each checkbox an accessible description and visible state', () => {
    assert.match(gear, /gear-toggle-control/);
    assert.match(gear, /gear-toggle-text/);
    assert.match(gear, /gearToggleDescription\(slotType\)/);
    assert.match(gear, /toggleText\.textContent\s*=\s*toggleEl\.checked/);
  });
});
