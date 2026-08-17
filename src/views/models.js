/**
 * src/views/models.js — Interactive 3D model gallery (three.js)
 *
 * Loads a manifest of GLB models extracted from the Empire Rising client
 * source assets (models/models_manifest.json) and renders them in a
 * three.js scene. Orbit/zoom/pan via OrbitControls; toggles for
 * auto-rotate, wireframe, and face-normal display.
 *
 * Declarations only — all DOM wiring happens in app-init.js hooks.
 */
'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // § STATE
  // ────────────────────────────────────────────────────────────────────────

  let modelsManifest = null;        // full manifest array
  let modelsFiltered = [];          // current search+category result
  let modelsCurrent = null;         // selected model entry

  // three.js scene state (created lazily on first model load)
  let mRenderer = null, mScene = null, mCamera = null, mControls = null;
  let mCurrentGroup = null, mNormalsHelper = null;
  let mAutoRotate = true, mWireframe = false, mNormals = true;
  let mFrameId = 0, mViewerInit = false;

  // Motion is presentation-only. Keep model selection and calculations
  // identical when motion is reduced, while exposing measurable state hooks.
  function modelsReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function emitModelMetric(type, detail) {
    var payload = Object.assign({ type: type, at: performance.now() }, detail || {});
    window.dispatchEvent(new CustomEvent('models:metric', { detail: payload }));
    if (Array.isArray(window.__CMG_MODEL_METRICS__)) window.__CMG_MODEL_METRICS__.push(payload);
  }

  function setModelStatus(state, message, entry) {
    var viewer = document.getElementById('models-viewer');
    if (!viewer) return;
    viewer.dataset.modelState = state;
    viewer.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    var status = document.getElementById('models-status');
    if (!status) {
      status = document.createElement('p');
      status.id = 'models-status';
      status.className = 'models-viewer-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      viewer.appendChild(status);
    }
    status.textContent = message || '';
    status.hidden = !message;
    emitModelMetric('state', { state: state, file: entry && entry.file, textured: !!(entry && entry.textured) });
  }

  // ────────────────────────────────────────────────────────────────────────
  // § GALLERY
  // ────────────────────────────────────────────────────────────────────────

  function loadModelsManifest() {
    return fetch('models/models_manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        modelsManifest = data.models || [];
        fillModelsCategorySelect();
        renderModelsGallery();
        updateModelsCount();
        return modelsManifest;
      })
      .catch(function () {
        var el = document.getElementById('models-gallery');
        if (el) el.innerHTML = '<p class="muted">Could not load the model manifest.</p>';
      });
  }

  // curated category order: game categories first, then client asset types
  var GAME_CAT_ORDER = ['Armor', 'Weapons', 'Guns', 'Ammunition', 'Medical',
    'Drugs', 'Food & Drink', 'Explosive', 'Implants & Electronics', 'Tools',
    'Clothing', 'Material', 'Misc', 'Characters', 'Props', 'Einrichtung',
    'Enemies', 'ranks'];

  function modelCategory(m) {
    return m.game_category || m.category || 'Misc';
  }

  function fillModelsCategorySelect() {
    var sel = document.getElementById('models-category');
    if (!sel || !modelsManifest) return;
    var cats = {};
    modelsManifest.forEach(function (m) { cats[modelCategory(m)] = true; });
    var ordered = GAME_CAT_ORDER.filter(function (c) { return cats[c]; });
    // any categories not in the curated list, appended alphabetically
    Object.keys(cats).filter(function (c) { return GAME_CAT_ORDER.indexOf(c) === -1; })
      .sort().forEach(function (c) { ordered.push(c); });
    ordered.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  function modelsFilter() {
    var q = (document.getElementById('models-search')?.value || '').trim().toLowerCase();
    var cat = document.getElementById('models-category')?.value || '';
    var texOnly = document.getElementById('models-texonly')?.checked || false;
    modelsFiltered = modelsManifest.filter(function (m) {
      if (cat && modelCategory(m) !== cat) return false;
      if (texOnly && !m.textured) return false;
      if (q) {
        var hay = (m.name + ' ' + modelCategory(m) + ' ' + (m.slot || '') + ' ' + (m.faction || '') + ' ' + m.file).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderModelsGallery() {
    var el = document.getElementById('models-gallery');
    if (!el || !modelsManifest) return;
    modelsFilter();
    if (!modelsFiltered.length) {
      el.innerHTML = '<p class="muted">No models match.</p>';
      return;
    }
    el.innerHTML = modelsFiltered.map(function (m) {
      var cls = modelsCurrent && modelsCurrent.file === m.file ? ' model-card active' : ' model-card';
      var texBadge = m.textured
        ? '<span class="model-card-tex" title="' + (m.textures || []).join(', ') + '">🎨 textured</span>'
        : '<span class="model-card-tex model-card-tex-none" title="No skin found in the client">— untextured</span>';
      var meta = modelCategory(m);
      if (m.slot) meta += ' · ' + m.slot;
      if (m.faction) meta += ' · ' + m.faction;
      return '<button type="button" class="' + cls + '" data-model-file="' + m.file + '">' +
        '<span class="model-card-name">' + m.name + ' ' + texBadge + '</span>' +
        '<span class="model-card-meta">' + meta + '</span>' +
        '</button>';
    }).join('');
    updateModelsCount();
  }

  function updateModelsCount() {
    var el = document.getElementById('models-count');
    if (el && modelsFiltered.length) el.textContent = modelsFiltered.length + ' models';
  }

  // ────────────────────────────────────────────────────────────────────────
  // § THREE.JS VIEWER
  // ────────────────────────────────────────────────────────────────────────

  function ensureViewer() {
    if (mViewerInit) return;
    mViewerInit = true;
    var container = document.getElementById('models-viewer');
    if (!container) return;

    mScene = new THREE.Scene();
    mScene.background = new THREE.Color(0x16181d);

    mCamera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 5000);
    mCamera.position.set(2.2, 1.4, 2.8);

    mRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    mRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mRenderer.setSize(container.clientWidth, container.clientHeight);
    mRenderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(mRenderer.domElement);

    mControls = new THREE.OrbitControls(mCamera, mRenderer.domElement);
    mControls.enableDamping = true;
    mControls.dampingFactor = 0.08;
    mControls.autoRotate = mAutoRotate && !modelsReducedMotion();
    mControls.autoRotateSpeed = 1.6;

    // lights
    var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x23272e, 0.9);
    mScene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 4);
    mScene.add(key);
    var rim = new THREE.DirectionalLight(0x88aaff, 0.5);
    rim.position.set(-4, -2, -3);
    mScene.add(rim);

    // floor grid for scale reference — optional, default OFF (clutters renders)
    var grid = new THREE.GridHelper(6, 24, 0x3a3f4a, 0x24262e);
    grid.position.y = -1.2;
    grid.name = 'scaleGrid';
    grid.visible = false;
    mScene.add(grid);

    animateViewer();
  }

  function animateViewer() {
    mFrameId = requestAnimationFrame(animateViewer);
    if (mControls) {
      mControls.autoRotate = mAutoRotate;
      mControls.update();
    }
    if (mRenderer && mScene && mCamera) mRenderer.render(mScene, mCamera);
  }

  function disposeCurrentModel() {
    if (mCurrentGroup) {
      mScene.remove(mCurrentGroup);
      mCurrentGroup.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (mt) { mt.dispose(); });
          else obj.material.dispose();
        }
      });
      mCurrentGroup = null;
    }
    if (mNormalsHelper) {
      mScene.remove(mNormalsHelper);
      mNormalsHelper.geometry.dispose();
      mNormalsHelper.material.dispose();
      mNormalsHelper = null;
    }
  }

  function fitCameraToObject(obj) {
    var box = new THREE.Box3().setFromObject(obj);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    // Frame by the LARGER of (height / vertical FOV) vs (width / horizontal
    // FOV) so long-thin models (weapons) fill the frame too. Account for the
    // canvas aspect ratio when converting FOV.
    var fov = mCamera.fov * Math.PI / 180;
    var aspect = mCamera.aspect || 1.6;
    var hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    var distByH = (size.y / 2) / Math.tan(fov / 2);
    var distByW = (size.x / 2) / Math.tan(hFov / 2);
    var dist = Math.max(distByH, distByW) * 1.35;
    if (!isFinite(dist) || dist < 0.01) dist = 5;
    // slight elevation so the item reads in 3D
    var ang = Math.atan2(0.45, 1.2);
    mCamera.position.set(
      center.x + dist * Math.cos(ang) * 0.9,
      center.y + dist * Math.sin(ang) + size.y * 0.12,
      center.z + dist * Math.cos(ang)
    );
    mControls.target.copy(center);
    mControls.update();
  }

  function applyModelMaterials(group, wire) {
    group.traverse(function (obj) {
      if (obj.isMesh && obj.material) {
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (mt) {
          if (mt.userData._origWire === undefined) {
            mt.userData._origWire = !!mt.wireframe;
          }
          mt.wireframe = wire || mt.userData._origWire;
          mt.needsUpdate = true;
        });
      }
    });
  }

  function updateNormalsHelper() {
    if (mNormalsHelper) {
      mScene.remove(mNormalsHelper);
      mNormalsHelper.geometry.dispose();
      mNormalsHelper.material.dispose();
      mNormalsHelper = null;
    }
    if (!mNormals || !mCurrentGroup) return;
    // VertexNormalsHelper is not in the vendored three.min.js core — build
    // the normal lines manually from the geometry's position/normal buffers.
    var positions = [], colors = [];
    var LEN = 0.06, COLOR = new THREE.Color(0x40c4ff);
    mCurrentGroup.updateMatrixWorld(true);
    mCurrentGroup.traverse(function (obj) {
      if (!obj.isMesh || !obj.geometry) return;
      var pos = obj.geometry.attributes.position;
      var nrm = obj.geometry.attributes.normal;
      if (!pos || !nrm) return;
      var mat = obj.matrixWorld;
      for (var i = 0; i < pos.count; i++) {
        var p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mat);
        var n = new THREE.Vector3().fromBufferAttribute(nrm, i).normalize();
        var e = p.clone().addScaledVector(n, LEN);
        positions.push(p.x, p.y, p.z, e.x, e.y, e.z);
        colors.push(COLOR.r, COLOR.g, COLOR.b, COLOR.r, COLOR.g, COLOR.b);
      }
    });
    if (!positions.length) return;
    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    var mat2 = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 });
    mNormalsHelper = new THREE.LineSegments(geom, mat2);
    mScene.add(mNormalsHelper);
  }

  function updateAnimationPicker(entry) {
    var wrap = document.getElementById('models-animation-wrap');
    var select = document.getElementById('models-animation');
    if (!wrap || !select) return;
    select.replaceChildren(new Option('Camera motion only', ''));
    var clips = Array.isArray(entry.confirmedAnimations) ? entry.confirmedAnimations : [];
    var playable = !!(window.CMG_FEATURE_FLAGS?.r3f_v1 && window.cmgLoadR3F);
    clips.forEach(function (clip) { select.appendChild(new Option(clip, clip)); });
    select.value = '';
    wrap.hidden = !playable || clips.length === 0;
    select.disabled = !playable || clips.length === 0;
  }

  function loadModel(entry) {
    updateAnimationPicker(entry);
    var startedAt = performance.now();
    setModelStatus('loading', 'Loading ' + entry.name + '…', entry);
    emitModelMetric('load-start', { file: entry.file, textured: !!entry.textured });
    if (!window.CMG_FEATURE_FLAGS?.r3f_v1 && !window.THREE && window.cmgLoadLegacy3D) {
      window.cmgLoadLegacy3D().then(function () { loadModel(entry); }).catch(function (err) {
        console.error('Legacy 3D preview failed:', err);
      });
      return;
    }
    if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.cmgLoadR3F) {
      modelsCurrent = entry;
      mCurrentEntry = entry;
      renderModelsGallery();
      var r3fStage = document.getElementById('models-stage-controls');
      var r3fName = document.getElementById('models-model-name');
      var r3fMeta = document.getElementById('models-model-meta');
      if (r3fStage) r3fStage.hidden = false;
      if (r3fName) r3fName.textContent = entry.name;
      if (r3fMeta) r3fMeta.textContent = entry.confirmedAnimations?.length
        ? entry.confirmedAnimations.length + ' verified gameplay clips · ' + (entry.textured ? 'textured' : 'untextured')
        : (entry.textured ? 'textured' : 'untextured');
      document.getElementById('models-hint')?.remove();
      var r3fContainer = document.getElementById('models-viewer');
      if (r3fContainer) {
        r3fContainer.replaceChildren();
        setModelStatus('loading', 'Loading ' + entry.name + '…', entry);
        window.cmgLoadR3F().then(function (api) {
          api.mount(r3fContainer, { mode: 'gallery', entry: entry, reducedMotion: modelsReducedMotion() });
          setModelStatus('ready', entry.textured ? 'Textured model ready.' : 'Model ready; texture unavailable.', entry);
          emitModelMetric('load-success', { file: entry.file, textured: !!entry.textured, durationMs: performance.now() - startedAt });
        }).catch(function (err) {
          console.error('R3F preview failed:', err);
          setModelStatus('error', '3D preview unavailable; model metadata remains available. Try selecting it again.', entry);
          emitModelMetric('load-error', { file: entry.file, error: String(err && err.message || err) });
          r3fContainer.innerHTML = '<div class="models-viewer-hint">3D preview unavailable; metadata remains available.</div>';
        });
      }
      return;
    }
    ensureViewer();
    modelsCurrent = entry;
    mCurrentEntry = entry;
    mTexImages = [];
    renderModelsGallery();
    document.getElementById('models-hint')?.remove();
    var nameEl = document.getElementById('models-model-name');
    var metaEl = document.getElementById('models-model-meta');
    var stage = document.getElementById('models-stage-controls');
    var wb = document.getElementById('models-workbench');
    if (nameEl) nameEl.textContent = entry.name;
    if (wb) wb.hidden = false;
    if (metaEl) {
      var bits = [entry.category];
      if (entry.nodes) bits.push(entry.nodes + ' nodes');
      if (entry.lods) bits.push(entry.lods + ' LODs');
      if (entry.dims) bits.push((entry.dims[0] ?? 0).toFixed(1) + ' × ' + (entry.dims[1] ?? 0).toFixed(1) + ' × ' + (entry.dims[2] ?? 0).toFixed(1) + ' m');
      if (entry.bytes) bits.push((entry.bytes / 1024).toFixed(0) + ' KB');
      if (entry.textures && entry.textures.length) bits.push('🎨 ' + entry.textures.length + ' texture' + (entry.textures.length > 1 ? 's' : ''));
      else bits.push('— no texture');
      metaEl.textContent = bits.join(' · ');
    }
    if (stage) stage.hidden = false;

    disposeCurrentModel();

    var loader = new THREE.GLTFLoader();
    loader.load(
      'models/' + entry.file,
      function (gltf) {
        try {
          mCurrentGroup = gltf.scene;
          mScene.add(mCurrentGroup);
          applyModelMaterials(mCurrentGroup, mWireframe);
          updateNormalsHelper();
          fitCameraToObject(mCurrentGroup);
          collectModelTextures(gltf);
          setModelStatus('ready', entry.textured ? 'Textured model ready.' : 'Model ready; texture unavailable.', entry);
          emitModelMetric('load-success', { file: entry.file, textured: !!entry.textured, durationMs: performance.now() - startedAt });
        } catch (e) {
          console.error('Model setup failed:', entry.file, e);
          if (metaEl) metaEl.textContent += ' — ⚠ setup error';
          setModelStatus('error', 'Model loaded, but the preview could not be prepared. Metadata remains available.', entry);
          emitModelMetric('load-error', { file: entry.file, error: String(e && e.message || e) });
        }
      },
      undefined,
      function (err) {
        console.error('Model load failed:', entry.file, err);
        if (metaEl) metaEl.textContent += ' — ⚠ load failed';
        setModelStatus('error', '3D preview unavailable; model metadata remains available. Try selecting it again.', entry);
        emitModelMetric('load-error', { file: entry.file, error: String(err && err.message || err) });
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // § WORKBENCH (textures + pieces + re-import)
  // ────────────────────────────────────────────────────────────────────────

  // texture bookkeeping for the currently loaded model
  let mTexImages = [];       // [{name, img, w, h, materialRefs:[]}]
  let mTexActiveName = null; // name of the texture the user is re-importing
  let mCurrentEntry = null;  // mirror of modelsCurrent with file

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function collectModelTextures(gltf) {
    mTexImages = [];
    var refs = {}; // image-name -> {img, w, h, materialRefs:[]}
    gltf.scene.traverse(function (obj) {
      if (!obj.isMesh || !obj.material) return;
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (mt) {
        var map = mt.map;
        if (!map || !map.image) return;
        var img = map.image;
        var name = (img.name || map.name || 'texture').replace(/\.(png|jpg|jpeg)$/i, '');
        if (!refs[name]) {
          refs[name] = {
            img: img, name: name,
            w: img.width || img.naturalWidth || 0,
            h: img.height || img.naturalHeight || 0,
            materialRefs: []
          };
        }
        refs[name].materialRefs.push(mt);
      });
    });
    mTexImages = Object.keys(refs).sort().map(function (k) { return refs[k]; });
    renderModelsTextures();
    renderModelsPieces(gltf, refs);
  }

  function renderModelsTextures() {
    var el = document.getElementById('models-textures');
    var wb = document.getElementById('models-workbench');
    if (!el || !wb) return;
    wb.hidden = false;
    if (!mTexImages.length) {
      el.innerHTML = '<div class="models-wb-sub">No embedded skin — this model uses the neutral material.</div>';
      return;
    }
    el.innerHTML = mTexImages.map(function (t) {
      return '<div class="models-tex-thumb" data-tex-name="' + t.name + '" title="' +
        t.name + ' (' + t.w + '×' + t.h + ')">' +
        '<img src="' + texImageSrc(t) + '" alt="' + t.name + '" />' +
        '<span class="models-tex-thumb-name">' + t.name + '</span>' +
        '<span class="models-tex-thumb-dim">' + t.w + '×' + t.h + '</span>' +
        '<button type="button" class="tex-dl" data-tex-name="' + t.name + '">⬇️ Export PNG</button>' +
        '<button type="button" class="tex-upscale" data-tex-name="' + t.name + '" ' +
        'title="Upscale 4× (client-side preview)">🔍 Upscale 4×</button>' +
        '</div>';
    }).join('');
  }

  function texImageSrc(t) {
    // draw the (possibly ImageBitmap) into a canvas → dataURL for <img> use
    var c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    var ctx = c.getContext('2d');
    ctx.drawImage(t.img, 0, 0);
    return c.toDataURL('image/png');
  }

  function renderModelsPieces(gltf, refs) {
    var el = document.getElementById('models-pieces');
    if (!el) return;
    var rows = [];
    gltf.scene.traverse(function (obj) {
      if (!obj.isMesh) return;
      var name = obj.name || 'mesh';
      var maps = [];
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (mt) {
        if (mt.map && mt.map.image) maps.push(mt.map.image.name || mt.map.name || '?');
      });
      var vcount = obj.geometry ? (obj.geometry.attributes.position ? obj.geometry.attributes.position.count : 0) : 0;
      var skin = maps.length ? maps.join(', ') : '';
      rows.push({ name: name, skin: skin, v: vcount });
    });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    el.innerHTML = rows.map(function (r) {
      return '<div class="models-piece">' +
        '<span class="models-piece-name">' + r.name + '</span>' +
        (r.skin
          ? '<span class="models-piece-skin" title="' + r.skin + '">🎨 ' + r.skin + '</span>'
          : '<span class="models-piece-none">— no skin</span>') +
        '<span class="models-piece-v">' + r.v + 'v</span>' +
        '</div>';
    }).join('');
  }

  function openTexLightbox(name) {
    var t = mTexImages.find(function (x) { return x.name === name; });
    if (!t) return;
    document.getElementById('models-lightbox-img').src = texImageSrc(t);
    document.getElementById('models-lightbox-name').textContent =
      t.name + ' (' + t.w + '×' + t.h + ') — ' + (mCurrentEntry ? mCurrentEntry.name : '');
    document.getElementById('models-lightbox').hidden = false;
  }

  function exportTexturePng(name) {
    var t = mTexImages.find(function (x) { return x.name === name; });
    if (!t) return;
    var c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    c.getContext('2d').drawImage(t.img, 0, 0);
    c.toBlob(function (blob) {
      if (blob) downloadBlob(blob, t.name + '.png');
    }, 'image/png');
  }

  // client-side 4× upscale preview: canvas resample (smooth) + unsharp-ish
  // contrast. Re-imports live via applyImportedTexture — mirrors what the
  // server-side tex_upscale.py does for the final GLB rebuild.
  function upscaleTextureLive(name) {
    var t = mTexImages.find(function (x) { return x.name === name; });
    if (!t) return;
    var nw = t.w * 4, nh = t.h * 4;
    var c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t.img, 0, 0, nw, nh);
    // gentle contrast boost to compensate for the softening (like unsharp)
    var imgData = ctx.getImageData(0, 0, nw, nh);
    var px = imgData.data, i;
    for (i = 0; i < px.length; i += 4) {
      px[i] = Math.max(0, Math.min(255, (px[i] - 128) * 1.12 + 128));
      px[i + 1] = Math.max(0, Math.min(255, (px[i + 1] - 128) * 1.12 + 128));
      px[i + 2] = Math.max(0, Math.min(255, (px[i + 2] - 128) * 1.12 + 128));
    }
    ctx.putImageData(imgData, 0, 0);
    applyImportedTexture(name, c.toDataURL('image/png'));
  }

  // live re-import: replace the texture on every material that uses it
  function applyImportedTexture(name, dataUrl) {
    var t = mTexImages.find(function (x) { return x.name === name; });
    if (!t) return false;
    var img = new Image();
    img.onload = function () {
      t.img = img; t.w = img.width; t.h = img.height;
      t.materialRefs.forEach(function (mt) {
        if (mt.map) {
          mt.map.image = img;
          mt.map.needsUpdate = true;
        }
      });
      renderModelsTextures();
      // keep the lightbox in sync if it's open on this texture
      if (!document.getElementById('models-lightbox').hidden) openTexLightbox(name);
    };
    img.src = dataUrl;
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // § ITEM CATALOG (icon browser — all in-game items, 2D)
  // ────────────────────────────────────────────────────────────────────────

  let iconCatalog = null;       // [{id, file, png, group, name, item_name, item_category, recipe_count, processes, weapon_stats}]
  let iconFiltered = [];
  let iconCurrent = null;

  function loadIconCatalog() {
    return fetch('icons/icon_catalog.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        iconCatalog = data.icons || [];
        fillIconGroups();
        renderIconGrid();
        var c = document.getElementById('models-icon-count');
        if (c) c.textContent = iconCatalog.length;
        return iconCatalog;
      })
      .catch(function () {
        var el = document.getElementById('icons-grid');
        if (el) el.innerHTML = '<p class="muted">Could not load the item catalog.</p>';
      });
  }

  function fillIconGroups() {
    var sel = document.getElementById('icons-group');
    if (!sel || !iconCatalog) return;
    var groups = {};
    iconCatalog.forEach(function (e) { groups[e.group] = true; });
    Object.keys(groups).sort().forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      sel.appendChild(opt);
    });
  }

  function iconFilter() {
    var q = (document.getElementById('icons-search')?.value || '').trim().toLowerCase();
    var g = document.getElementById('icons-group')?.value || '';
    iconFiltered = iconCatalog.filter(function (e) {
      if (g && (e.group !== g && e.category !== g)) return false;
      if (q) {
        var hay = (e.name + ' ' + e.id + ' ' + (e.item_category || '') + ' ' + (e.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderIconGrid() {
    var el = document.getElementById('icons-grid');
    if (!el || !iconCatalog) return;
    iconFilter();
    if (!iconFiltered.length) {
      el.innerHTML = '<p class="muted">No items match.</p>';
      return;
    }
    el.innerHTML = iconFiltered.map(function (e) {
      var cls = iconCurrent && iconCurrent.id === e.id && iconCurrent.file === e.file ? 'icon-card active' : 'icon-card';
      var badge = '';
      if (e.recipe_count > 0) badge = '<div class="icon-card-badge">📦 craftable</div>';
      var imgSrc = e.icon || e.png;
      return '<div class="' + cls + '" data-icon-id="' + e.id + '" data-icon-file="' + (e.file || e.id) + '">' +
        '<img src="icons/' + imgSrc + '" alt="' + (e.name || e.id) + '" loading="lazy" />' +
        '<div class="icon-card-name">' + (e.name || e.id) + '</div>' +
        '<div class="icon-card-group">' + (e.item_category || e.group || '') + '</div>' +
        badge +
        '</div>';
    }).join('');
  }

  function renderIconDetail(entry) {
    var detail = document.getElementById('icons-detail');
    if (!detail) return;
    iconCurrent = entry;
    detail.hidden = false;
    renderIconGrid();
    document.getElementById('icons-detail-img').src = 'icons/' + (entry.icon || entry.png);
    document.getElementById('icons-detail-img').alt = entry.name || entry.id;
    document.getElementById('icons-detail-name').textContent = entry.name || entry.id;
    var metaBits = [entry.item_category || entry.category || entry.group];
    if (entry.id) metaBits.push('id: ' + entry.id);
    if (entry.w && entry.h) metaBits.push(entry.w + '×' + entry.h);
    if (entry.recipe_count > 0) metaBits.push('📦 ' + entry.recipe_count + ' recipe' + (entry.recipe_count > 1 ? 's' : ''));
    if (entry.processes && entry.processes.length) metaBits.push(entry.processes.join(', '));
    if (entry.quantity != null) metaBits.push(entry.quantity + ' per batch');
    document.getElementById('icons-detail-meta').textContent = metaBits.join(' · ');

    // stats
    var statsEl = document.getElementById('icons-detail-stats');
    var statsHtml = '';
    if (entry.weapon_stats) {
      var ws = entry.weapon_stats;
      if (ws.price != null) statsHtml += row('Price', ws.price + ' UC');
      if (ws.fire_modes != null) statsHtml += row('Fire modes', ws.fire_modes);
      if (ws.primary) {
        var p = ws.primary;
        statsHtml += row('Damage', p.damage != null ? p.damage : '—');
        statsHtml += row('Range', p.range != null ? p.range + 'm' : '—');
        statsHtml += row('Magazine', p.magazine != null ? p.magazine : '—');
        statsHtml += row('Capacity', p.capacity != null ? p.capacity : '—');
      }
      if (ws.alt_fire) statsHtml += row('Alt fire', 'yes');
    }
    statsEl.innerHTML = statsHtml || '<div class="muted" style="font-size:0.68rem">No stat data in this client.</div>';
    function row(k, v) { return '<div class="stat-row"><span>' + k + '</span><span>' + v + '</span></div>'; }

    // links: find a matching 3D model if one exists
    var linksEl = document.getElementById('icons-detail-links');
    var links = [];
    if (modelsManifest) {
      var model = findModelForIcon(entry);
      if (model) {
        links.push('<button type="button" data-icon-model="' + model.file + '">🧊 View 3D model</button>');
      }
    }
    linksEl.innerHTML = links.join('');
  }

  function findModelForIcon(entry) {
    if (!modelsManifest) return null;
    var name = (entry.item_name || entry.name || '').toLowerCase();
    // exact name match first
    var hit = modelsManifest.find(function (m) { return m.name.toLowerCase() === name; });
    if (hit) return hit;
    // WEAPONS: w# icons ↔ w#_hh.ltb hand-held models ("w5" → "w5_hh")
    var wid = entry.id && entry.id.match(/^(w\d+)$/);
    if (wid) {
      var base = wid[1].toLowerCase();
      var wm = modelsManifest.find(function (mm) { return mm.name.toLowerCase() === base + '_hh'; });
      if (wm) return wm;
      // fall back to any model starting with the weapon id
      var wany = modelsManifest.find(function (mm) {
        var n = mm.name.toLowerCase();
        return n === base || n.indexOf(base + '_') === 0;
      });
      if (wany) return wany;
    }
    // AMMO: w#_ammo icons ↔ w#_hh weapon model (no ammo mesh exists; the
    // weapon model carries the magazine)
    var aid = entry.id && entry.id.match(/^(w\d+)_ammo$/);
    if (aid) {
      var ab = aid[1].toLowerCase();
      var am = modelsManifest.find(function (mm) {
        return mm.weapon_id === aid[1] ||
               (mm.file && mm.file.toLowerCase().indexOf(ab + '_hh') !== -1);
      });
      if (am) return am;
    }
    // ammo-caliber items ("9mm standard rounds", "7.62mm standard rounds")
    // → the magazine models that ARE the dropped-ammo meshes
    var calMatch = name.match(/(\d+(?:\.\d+)?)\s*mm/);
    if (calMatch) {
      var cal = calMatch[1];
      var mags = ['mag_6mm', 'mag_762mm', 'mag_9mm'];
      var magHit = null;
      if (cal === '6') magHit = 'mag_6mm';
      else if (cal === '7.62' || cal === '762') magHit = 'mag_762mm';
      else if (cal === '9') magHit = 'mag_9mm';
      if (magHit) {
        var mag = modelsManifest.find(function (mm) { return mm.name.toLowerCase() === magHit; });
        if (mag) return mag;
      }
    }
    // brand ammo ("Zanathid 5 Rounds", "Gakk MG6 Rounds") → the weapon's
    // model (w#_hh) via weapon-name prefix matching
    if (name.indexOf('round') !== -1 || name.indexOf('cell') !== -1 || name.indexOf('ammo') !== -1) {
      var weaponPrefix = null;
      for (var wi = 0; wi < modelsManifest.length; wi++) {
        var mm = modelsManifest[wi];
        if (!mm.weapon_id) continue;
        var wname = mm.name.toLowerCase();
        if (wname !== 'zanathid 5 inflex' && name.indexOf(wname) !== -1 && wname.length > 4) {
          weaponPrefix = mm;
          break;
        }
      }
      if (weaponPrefix) return weaponPrefix;
      // fallback: ammo containing a weapon brand token ("linner pp7 rounds" → w?)
      var toks = name.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 2; });
      var best = null, bestScore = 0;
      for (var wi2 = 0; wi2 < modelsManifest.length; wi2++) {
        var mm2 = modelsManifest[wi2];
        if (!mm2.weapon_id) continue;
        var score = toks.filter(function (t) { return mm2.name.toLowerCase().indexOf(t) !== -1; }).length;
        if (score > bestScore) { bestScore = score; best = mm2; }
      }
      if (best && bestScore >= 1) return best;
    }
    // armor-piece icons: "Armpads1 1" / "Helmet3 3" → model "ArmPads1"/"Helmet3"
    // (the trailing number is the skin variant, not part of the piece name)
    var m2 = name.match(/^([a-z]+)(\d+)\s+\d+$/);
    if (m2) {
      var pieceName = m2[1] + m2[2];
      // faction-aware: icon file "GOM/TorsoArmour6_6.tga" → TorsoArmour6__GOM.glb
      // (each faction ships its own version of the same skin name; the plain
      // model would show the alphabetically-first faction — GOM)
      var fac = entry.file ? entry.file.split('/')[0] : '';
      if (fac && /^[A-Z]{3}$/.test(fac)) {
        var fv = modelsManifest.find(function (mm) {
          return mm.file && mm.file.toLowerCase() === 'items/characters/' + pieceName + '__' + fac.toLowerCase() + '.glb';
        });
        if (fv) return fv;
      }
      var ph = modelsManifest.find(function (mm) { return mm.name.toLowerCase() === pieceName; });
      if (ph) return ph;
      var ph2 = modelsManifest.find(function (mm) { return mm.name.toLowerCase() === 'f_' + pieceName || mm.name.toLowerCase() === 'm_' + pieceName; });
      if (ph2) return ph2;
    }
    // f_/m_ skin-variant icons: "F Shoes1 1" / "M Gloves2" → f_Shoes1.glb /
    // m_Hands2.glb (gloves map to the Hands model)
    var m3 = name.match(/^([fm])\s+([a-z]+)(\d+)(?:\s+\d+)?$/);
    if (m3) {
      var gender = m3[1];
      var slotName = m3[2] + m3[3];
      if (slotName.indexOf('glove') === 0) slotName = 'hands' + m3[3];
      var gv = modelsManifest.find(function (mm) { return mm.name.toLowerCase() === gender + '_' + slotName; });
      if (gv) return gv;
    }
    // armor set items: "MT-27 Ballistics Helmet" → Helmet slot piece models.
    // The calculator's armor items are SET names; the 3D models are the
    // armor-slot pieces (Helmet1-7, ArmPads1-7, ...). Match by the item's
    // slot keyword to the slot's piece models (prefer the base variant).
    var slotMap = { 'helmet': 'helmet', 'arm pad': 'armpads', 'glove': 'hands',
                    'leg pad': 'legpads', 'shoulder': 'shoulderpads',
                    'torso': 'torso', 'shoes': 'shoes', 'glasses': 'glasses' };
    for (var kw in slotMap) {
      if (name.indexOf(kw) !== -1) {
        var slot = slotMap[kw];
        var candidates = modelsManifest.filter(function (mm) {
          return mm.game_category === 'Armor' && mm.slot === slot && !mm.faction;
        });
        if (candidates.length) {
          // prefer a base piece (lowest number)
          candidates.sort(function (a, b) {
            var na = parseInt(a.name.replace(/\D/g, ''), 10) || 0;
            var nb = parseInt(b.name.replace(/\D/g, ''), 10) || 0;
            return na - nb;
          });
          return candidates[0];
        }
      }
    }
    // token overlap for manufacturer-prefixed names
    var toks = name.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 2; });
    var scored = modelsManifest.map(function (m) {
      var mt = m.name.toLowerCase();
      var score = toks.filter(function (t) { return mt.indexOf(t) !== -1; }).length;
      return { m: m, score: score };
    }).filter(function (x) { return x.score >= 2; })
      .sort(function (a, b) { return b.score - a.score; });
    return scored.length ? scored[0].m : null;
  }

  function switchModelsSubtab(which) {
    var pane3d = document.getElementById('models-pane-3d');
    var paneIcons = document.getElementById('models-pane-icons');
    var paneStudio = document.getElementById('models-pane-studio');
    var tab3d = document.getElementById('models-tab-3d');
    var tabIcons = document.getElementById('models-tab-icons');
    var tabStudio = document.getElementById('models-tab-studio');
    if (which === 'icons') {
      pane3d.hidden = true;
      paneIcons.hidden = false;
      if (paneStudio) paneStudio.hidden = true;
      tab3d.classList.remove('active');
      tabIcons.classList.add('active');
      if (tabStudio) tabStudio.classList.remove('active');
      if (!iconCatalog) loadIconCatalog();
    } else if (which === 'studio') {
      pane3d.hidden = true;
      paneIcons.hidden = true;
      if (paneStudio) paneStudio.hidden = false;
      tab3d.classList.remove('active');
      tabIcons.classList.remove('active');
      if (tabStudio) tabStudio.classList.add('active');
      if (typeof initCharacterStudio === 'function') {
        if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.cmgLoadR3F) {
          window.cmgLoadR3F().then(function (api) {
            var target = document.getElementById('studio-viewer');
            if (target) api.mount(target, { mode: 'studio' });
            initCharacterStudio();
          });
        } else if (!window.CMG_FEATURE_FLAGS?.r3f_v1 && !window.THREE && window.cmgLoadLegacy3D) window.cmgLoadLegacy3D().then(initCharacterStudio);
        else initCharacterStudio();
      }
    } else {
      pane3d.hidden = false;
      paneIcons.hidden = true;
      if (paneStudio) paneStudio.hidden = true;
      tab3d.classList.add('active');
      tabIcons.classList.remove('active');
      if (tabStudio) tabStudio.classList.remove('active');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // § ENTRY (wired from app-init.js)
  // ────────────────────────────────────────────────────────────────────────

  function updateR3fOptIn() {
    var panel = document.getElementById('models-r3f-optin');
    var button = document.getElementById('models-enable-r3f');
    var enabled = !!window.CMG_FEATURE_FLAGS?.r3f_v1;
    if (panel) panel.hidden = !enabled;
    if (button) button.disabled = enabled;
  }

  function initModelsView() {
    updateR3fOptIn();
    var gallery = document.getElementById('models-gallery');
    if (!gallery) return;
    if (!modelsManifest) loadModelsManifest();
    if (!iconCatalog) loadIconCatalog();
  }

  function wireModelsEvents() {
    window.addEventListener('models:animation', function (event) {
      var detail = event.detail || {};
      if (!mCurrentEntry || detail.file !== mCurrentEntry.file) return;
      var message = detail.state === 'playing'
        ? 'Playing verified gameplay clip: ' + detail.clip + '.'
        : (modelsReducedMotion() ? 'Reduced motion enabled; gameplay playback is paused.' : 'Camera motion only.');
      setModelStatus(detail.state, message, mCurrentEntry);
      // Metric names include animation-playing / animation-idle for browser QA.
      emitModelMetric('animation-' + detail.state, { file: detail.file, clip: detail.clip });
    });

    document.getElementById('models-enable-r3f')?.addEventListener('click', function () {
      if (typeof window.setCMGFeatureFlag !== 'function') return;
      window.setCMGFeatureFlag('r3f_v1', true);
      updateR3fOptIn();
      var manifestReady = modelsManifest ? Promise.resolve(modelsManifest) : loadModelsManifest();
      manifestReady.then(function () {
        if (modelsCurrent) loadModel(modelsCurrent);
        else setModelStatus('ready', 'Enhanced 3D preview enabled. Select a compatible model to play verified clips.', null);
      });
    });

    document.getElementById('models-gallery')?.addEventListener('click', function (e) {
      var card = e.target.closest('.model-card');
      if (card && modelsManifest) {
        var file = card.dataset.modelFile;
        var entry = modelsManifest.find(function (m) { return m.file === file; });
        if (entry) loadModel(entry);
      }
    });

    document.getElementById('models-search')?.addEventListener('input', renderModelsGallery);
    document.getElementById('models-category')?.addEventListener('change', renderModelsGallery);
    document.getElementById('models-texonly')?.addEventListener('change', renderModelsGallery);

    // subtab switching: 3D models ↔ item catalog ↔ character studio
    document.getElementById('models-tab-3d')?.addEventListener('click', function () { switchModelsSubtab('3d'); });
    document.getElementById('models-tab-icons')?.addEventListener('click', function () { switchModelsSubtab('icons'); });
    document.getElementById('models-tab-studio')?.addEventListener('click', function () { switchModelsSubtab('studio'); });

    // icon catalog events
    document.getElementById('icons-search')?.addEventListener('input', renderIconGrid);
    document.getElementById('icons-group')?.addEventListener('change', renderIconGrid);
    document.getElementById('icons-grid')?.addEventListener('click', function (e) {
      var card = e.target.closest('.icon-card');
      if (!card || !iconCatalog) return;
      var id = card.dataset.iconId;
      var file = card.dataset.iconFile;
      var entry = iconCatalog.find(function (x) { return x.id === id && (x.file === file || (!x.file && file === id)); });
      if (entry) renderIconDetail(entry);
    });
    document.getElementById('icons-detail-links')?.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-icon-model]');
      if (!btn) return;
      var file = btn.dataset.iconModel;
      var entry = modelsManifest.find(function (m) { return m.file === file; });
      if (entry) {
        switchModelsSubtab('3d');
        // find + click the model card after the pane is visible
        setTimeout(function () {
          var cards = document.querySelectorAll('.model-card');
          for (var i = 0; i < cards.length; i++) {
            if (cards[i].dataset.modelFile === file) { cards[i].click(); break; }
          }
        }, 150);
      }
    });

    // workbench: texture thumb click → set active + open lightbox; export → PNG
    document.getElementById('models-textures')?.addEventListener('click', function (e) {
      var dl = e.target.closest('.tex-dl');
      if (dl) { e.stopPropagation(); exportTexturePng(dl.dataset.texName); return; }
      var up = e.target.closest('.tex-upscale');
      if (up) { e.stopPropagation(); upscaleTextureLive(up.dataset.texName); return; }
      var thumb = e.target.closest('.models-tex-thumb');
      if (thumb) {
        mTexActiveName = thumb.dataset.texName;
        openTexLightbox(thumb.dataset.texName);
      }
    });

    // lightbox controls
    document.getElementById('models-lightbox-close')?.addEventListener('click', function () {
      document.getElementById('models-lightbox').hidden = true;
    });
    document.getElementById('models-lightbox-replace')?.addEventListener('click', function () {
      var name = document.getElementById('models-lightbox-name').textContent.split(' (')[0];
      mTexActiveName = name;
      document.getElementById('models-import-tex')?.click();
    });
    document.getElementById('models-lightbox-dl')?.addEventListener('click', function () {
      var name = document.getElementById('models-lightbox-name').textContent.split(' (')[0];
      exportTexturePng(name);
    });
    document.getElementById('models-lightbox')?.addEventListener('click', function (e) {
      if (e.target.id === 'models-lightbox') this.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.getElementById('models-lightbox').hidden = true;
    });

    // live re-import: pick a file → replace that texture everywhere it's used
    document.getElementById('models-import-tex')?.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var dataUrl = ev.target.result;
        var name = mTexActiveName || (mTexImages[0] ? mTexImages[0].name : '');
        if (!name) {
          var zone = document.getElementById('models-import-zone');
          if (zone) zone.classList.add('import-active');
          setTimeout(function () { if (zone) zone.classList.remove('import-active'); }, 1200);
          return;
        }
        applyImportedTexture(name, dataUrl);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // GLB export
    document.getElementById('models-export-glb')?.addEventListener('click', function () {
      if (!mCurrentEntry) return;
      fetch('models/' + mCurrentEntry.file)
        .then(function (r) { return r.blob(); })
        .then(function (blob) { downloadBlob(blob, mCurrentEntry.name + '.glb'); });
    });

    document.getElementById('models-close')?.addEventListener('click', function () {
      disposeCurrentModel();
      modelsCurrent = null;
      mCurrentEntry = null;
      mTexImages = [];
      renderModelsGallery();
      document.getElementById('models-hint')?.remove();
      var hint = document.createElement('div');
      hint.className = 'models-viewer-hint';
      hint.id = 'models-hint';
      hint.textContent = 'Select a model from the gallery';
      document.getElementById('models-viewer')?.appendChild(hint);
      document.getElementById('models-stage-controls').hidden = true;
      var wb = document.getElementById('models-workbench');
      if (wb) wb.hidden = true;
      document.getElementById('models-lightbox').hidden = true;
    });

    function setR3fViewerOption(options) {
      if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.CMG3D) window.CMG3D.setViewerOptions(options);
    }

    document.getElementById('models-animation')?.addEventListener('change', function () {
      setR3fViewerOption({ animation: this.value || null });
    });

    document.getElementById('models-autorotate')?.addEventListener('click', function () {
      mAutoRotate = !mAutoRotate;
      this.classList.toggle('active', mAutoRotate);
      setR3fViewerOption({ autoRotate: mAutoRotate && !modelsReducedMotion() });
    });
    document.getElementById('models-wireframe')?.addEventListener('click', function () {
      mWireframe = !mWireframe;
      this.classList.toggle('active', mWireframe);
      if (mCurrentGroup) applyModelMaterials(mCurrentGroup, mWireframe);
      setR3fViewerOption({ wireframe: mWireframe });
    });
    document.getElementById('models-normal')?.addEventListener('click', function () {
      mNormals = !mNormals;
      this.classList.toggle('active', mNormals);
      updateNormalsHelper();
      setR3fViewerOption({ normals: mNormals });
    });
    document.getElementById('models-grid')?.addEventListener('click', function () {
      if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.CMG3D) {
        var next = !this.classList.contains('active');
        this.classList.toggle('active', next);
        setR3fViewerOption({ grid: next });
        return;
      }
      var grid = mScene && mScene.getObjectByName('scaleGrid');
      if (!grid) return;
      grid.visible = !grid.visible;
      this.classList.toggle('active', grid.visible);
    });
    document.getElementById('models-reset')?.addEventListener('click', function () {
      if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.CMG3D) {
        setR3fViewerOption({ resetToken: Date.now() });
        return;
      }
      if (mCurrentGroup) fitCameraToObject(mCurrentGroup);
    });

    // resize handling
    window.addEventListener('resize', function () {
      var container = document.getElementById('models-viewer');
      if (!container || !mRenderer || !mCamera) return;
      mCamera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      mCamera.updateProjectionMatrix();
      mRenderer.setSize(container.clientWidth, container.clientHeight);
    });

    // stop the render loop when leaving the tab
    registerViewHook({
      view: 'models',
      leave: function () {
        if (mFrameId) { cancelAnimationFrame(mFrameId); mFrameId = 0; }
      },
      enter: function () {
        if (!mFrameId) animateViewer();
        if (mRenderer && mRenderer.domElement.parentElement !== document.getElementById('models-viewer')) {
          document.getElementById('models-viewer')?.appendChild(mRenderer.domElement);
        }
      }
    });
  }
