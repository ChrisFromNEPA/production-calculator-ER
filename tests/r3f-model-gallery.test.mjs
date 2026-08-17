// tests/r3f-model-gallery.test.mjs — manifest-selected model gallery contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = readFileSync(join(root, 'src', '3d', 'entry.jsx'), 'utf8');
const models = readFileSync(join(root, 'src', 'views', 'models.js'), 'utf8');

describe('R3F model gallery', () => {
  it('loads the selected manifest GLB inside Suspense with no preload', () => {
    assert.match(entry, /useGLTF\(`models\/\$\{entry\.file\}`\)/);
    assert.match(entry, /<React\.Suspense/);
    assert.doesNotMatch(entry, /useGLTF\.preload/);
  });

  it('keeps the classic viewer as the default and switches only under r3f_v1', () => {
    assert.match(models, /if \(window\.CMG_FEATURE_FLAGS\?\.r3f_v1/);
    assert.match(models, /window\.cmgLoadR3F\(\)\.then/);
    assert.match(models, /ensureViewer\(\);/);
  });

  it('fits the camera to each loaded model instead of using only the static startup camera', () => {
    assert.match(entry, /import \{[^}]*Bounds[^}]*\} from '@react-three\/drei'/);
    assert.match(entry, /<Bounds[^>]*fit[^>]*clip[^>]*observe[^>]*margin=\{1\.2\}/);
  });

  it('invalidates the demand-render frame after an animated model resolves', () => {
    assert.match(entry, /useThree/);
    assert.match(entry, /invalidate\(\)/);
  });

  it('plays only manifest-confirmed clips and disables playback for reduced motion', () => {
    assert.match(entry, /useAnimations\(animations, scene\)/);
    assert.match(entry, /options\?\.animation/);
    assert.match(entry, /CustomEvent\('models:animation'/);
    assert.match(models, /Playing verified gameplay clip/);
    assert.match(models, /emitModelMetric\(/);
    assert.match(models, /confirmedAnimations/);

    assert.match(models, /models-animation/);
  });

  it('provides a user-facing opt-in before loading the enhanced player', () => {
    assert.match(models, /models-enable-r3f/);
    assert.match(models, /setCMGFeatureFlag\('r3f_v1', true\)/);
    assert.match(models, /updateR3fOptIn\(\)/);
    assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /models-r3f-optin/);
  });

  it('supports interactive orbiting but defaults the new scene to static motion', () => {
    assert.match(entry, /<OrbitControls[^>]*makeDefault[^>]*enableDamping/);
    assert.match(entry, /autoRotate=\{Boolean\(options\?\.autoRotate\) && !reducedMotion\}/);
    assert.match(entry, /material\.wireframe/);
  });
});
