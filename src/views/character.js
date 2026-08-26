/**
 * src/views/character.js — Character Studio (dress-up) tab
 *
 * Loads a client-derived "Average Studio" body (f_Average_Studio.glb /
 * m_Average_Studio.glb) and switches matching Torso1–4 / Legs1–4 geometry
 * and AVG clothing skins across every faction, plus gear visibility. Skins
 * live in models/skins/ as WebP (converted during private asset preparation)
 * with the variant index in models/character_skins.json. Declarations only —
 * DOM wiring happens in app-init.js hooks (wireCharacterStudioEvents).
 */
'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // § STATE
  // ────────────────────────────────────────────────────────────────────────

  let studioManifest = null;        // character_skins.json
  let studioGender = 'f';           // 'f' | 'm'
  let studioFaction = 'LED';
  let studioGroup = null;           // loaded body THREE.Group
  let studioClothing = {};          // slot -> {meshes:{style:mesh}, mesh, style, file}
  let studioGear = [];              // [{name, mesh}]
  let studioGltf = null;            // raw gltf object (export)
  let studioGlbInfo = null;         // {json, bin, imageIdx:{Torso,L Legs}} (export)

  // three.js state (created lazily on first show)
  let sRenderer = null, sScene = null, sCamera = null, sControls = null;
  let sFrameId = 0, sViewerInit = false, sAutoRotate = true;
  let sTexCache = {};               // url -> THREE.Texture
  let sBaked = {};                  // slot -> {dataUrl, pngBytes} for export

  const STUDIO_BODIES = { f: 'Characters/f_Average_Studio.glb', m: 'Characters/m_Average_Studio.glb' };

  function studioStyleFromFile(file, slot) {
    var match = String(file || '').match(/_(Torso|Legs)([1-4])_/i);
    return match && match[1].toLowerCase() === String(slot || '').toLowerCase() ? Number(match[2]) : null;
  }

  function studioPreferredEntry(entries, slot) {
    var preferred = '_' + slot + '2_4.webp';
    return (entries || []).find(function (entry) {
      return String(entry.file || '').toLowerCase().endsWith(preferred.toLowerCase());
    }) || (entries && entries[0]) || null;
  }

  function studioExportNodeIndices(nodes, torsoStyle, legsStyle, visibleGearNames) {
    var gear = visibleGearNames || new Set();
    return (nodes || []).map(function (_, index) { return index; }).filter(function (index) {
      var name = (nodes[index] && nodes[index].name) || '';
      var torso = name.match(/^Torso([1-4])$/);
      if (torso) return Number(torso[1]) === torsoStyle;
      var legs = name.match(/^Legs([1-4])$/);
      if (legs) return Number(legs[1]) === legsStyle;
      return gear.has(name);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // § MANIFEST
  // ────────────────────────────────────────────────────────────────────────

  function initCharacterStudio() {
    if (studioManifest) { populateStudioFactions(); return; }
    fetch('models/character_skins.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        studioManifest = data;
        populateStudioFactions();
        loadStudioBody();
      })
      .catch(function () {
        var el = document.getElementById('studio-hint');
        if (el) el.textContent = 'Could not load the skin manifest.';
      });
  }

  function studioFactionList() {
    if (!studioManifest) return [];
    return Object.keys(studioManifest.factions).filter(function (f) {
      // keep factions that actually have skins for the current gender
      var g = studioManifest.factions[f] && studioManifest.factions[f][studioGender];
      return g && (g.Torso.length || g.Legs.length);
    }).sort();
  }

  function populateStudioFactions() {
    var sel = document.getElementById('studio-faction');
    if (!sel) return;
    var factions = studioFactionList();
    if (!factions.length) return;
    var cur = factions.indexOf(studioFaction);
    sel.innerHTML = factions.map(function (f, i) {
      return '<option value="' + f + '"' + (i === cur ? ' selected' : '') + '>' + f + '</option>';
    }).join('');
    if (cur === -1) studioFaction = factions[0];
    populateStudioSlots();
  }

  function studioSlotOptions(slot) {
    var g = studioManifest && studioManifest.factions[studioFaction]
        && studioManifest.factions[studioFaction][studioGender];
    if (!g || !g[slot]) return [];
    return g[slot]; // array of webp filenames, e.g. ['f_AVG_Torso1_1.webp', ...]
  }

  function populateStudioSlots() {
    ['Torso', 'Legs'].forEach(function (slot) {
      var sel = document.getElementById('studio-' + slot.toLowerCase());
      if (!sel) return;
      var entries = studioSlotOptions(slot);   // [{file}]
      sel.innerHTML = entries.map(function (e) {
        var label = e.file.replace(/^[fm]_AVG_/, '').replace(/\.webp$/, '');
        return '<option value="' + e.file + '">' + label + '</option>';
      }).join('');
      var cur = studioClothing[slot] && studioClothing[slot].file;
      var curEntry = cur && entries.find(function (e) { return e.file === cur; });
      if (curEntry) { sel.value = cur; applyStudioSkin(slot, cur); return; }
      var pick = studioPreferredEntry(entries, slot);
      if (pick) { sel.value = pick.file; applyStudioSkin(slot, pick.file); }
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // § THREE.JS VIEWER
  // ────────────────────────────────────────────────────────────────────────

  function ensureStudioViewer() {
    if (sViewerInit) return;
    sViewerInit = true;
    var container = document.getElementById('studio-viewer');
    if (!container) return;

    sScene = new THREE.Scene();
    sScene.background = new THREE.Color(0x16181d);

    sCamera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 5000);
    sCamera.position.set(2.2, 1.4, 2.8);

    sRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    sRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    sRenderer.setSize(container.clientWidth, container.clientHeight);
    sRenderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(sRenderer.domElement);

    sControls = new THREE.OrbitControls(sCamera, sRenderer.domElement);
    sControls.enableDamping = true;
    sControls.dampingFactor = 0.08;
    sControls.autoRotate = sAutoRotate;
    sControls.autoRotateSpeed = 1.6;

    sScene.add(new THREE.HemisphereLight(0xbfd4ff, 0x23272e, 0.9));
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 4);
    sScene.add(key);
    var rim = new THREE.DirectionalLight(0x88aaff, 0.5);
    rim.position.set(-4, -2, -3);
    sScene.add(rim);

    animateStudio();
  }

  function animateStudio() {
    sFrameId = requestAnimationFrame(animateStudio);
    if (sControls) {
      sControls.autoRotate = sAutoRotate;
      sControls.update();
    }
    if (sRenderer && sScene && sCamera) sRenderer.render(sScene, sCamera);
  }

  function disposeStudioBody() {
    if (studioGroup) {
      sScene.remove(studioGroup);
      studioGroup.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (mt) { mt.dispose(); });
          else obj.material.dispose();
        }
      });
      studioGroup = null;
    }
    studioClothing = {};
    studioGear = [];
    studioGltf = null;
    studioGlbInfo = null;
    sBaked = {};
  }

  function fitStudioCamera() {
    if (!studioGroup) return;
    var box = new THREE.Box3().setFromObject(studioGroup);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var fov = sCamera.fov * Math.PI / 180;
    var aspect = sCamera.aspect || 1.6;
    var hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    var dist = Math.max((size.y / 2) / Math.tan(fov / 2), (size.x / 2) / Math.tan(hFov / 2)) * 1.35;
    if (!isFinite(dist) || dist < 0.01) dist = 5;
    sCamera.position.set(center.x + dist * 0.75, center.y + dist * 0.35, center.z + dist * 0.75);
    sControls.target.copy(center);
    sControls.update();
  }

  // ────────────────────────────────────────────────────────────────────────
  // § BODY LOAD + SKIN SWAP
  // ────────────────────────────────────────────────────────────────────────

  function syncR3FStudio() {
    if (!window.CMG_FEATURE_FLAGS?.r3f_v1 || !window.CMG3D) return;
    var torso = studioClothing.Torso;
    var legs = studioClothing.Legs;
    window.CMG3D.setMode('studio');
    window.CMG3D.setOutfit({
      bodyFile: STUDIO_BODIES[studioGender],
      faction: studioFaction,
      torso: torso && torso.file ? { file: torso.file, style: torso.style } : null,
      legs: legs && legs.file ? { file: legs.file, style: legs.style } : null,
    });
  }

  function loadStudioBody() {
    if (window.CMG_FEATURE_FLAGS?.r3f_v1 && window.CMG3D) {
      syncR3FStudio();
      return;
    }
    ensureStudioViewer();
    disposeStudioBody();
    var hint = document.getElementById('studio-hint');
    if (hint) hint.textContent = 'Loading ' + studioGender.toUpperCase() + ' body…';
    var url = 'models/' + STUDIO_BODIES[studioGender];

    // also fetch the raw GLB once for the export baker
    fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      studioGlbInfo = parseStudioGlb(buf);
    }).catch(function () { /* export will be disabled */ });

    new THREE.GLTFLoader().load(url, function (gltf) {
      studioGltf = gltf;
      studioGroup = gltf.scene;
      sScene.add(studioGroup);
      if (hint) hint.remove();

      // Collect all numbered clothing alternatives. The style number in the
      // selected skin filename is the authoritative geometry key.
      studioGroup.traverse(function (o) {
        if (!o.isMesh) return;
        var n = o.name || '';
        var match = n.match(/^(Torso|Legs)([1-4])$/);
        if (match) {
          var slot = match[1];
          if (!studioClothing[slot]) studioClothing[slot] = { meshes: {}, mesh: null, style: null, file: null };
          studioClothing[slot].meshes[Number(match[2])] = o;
          o.visible = false;
        } else studioGear.push({ name: n, mesh: o });
      });

      renderStudioGearGrid();
      populateStudioSlots();
      applyStudioSkins();
      updateStudioName();
      fitStudioCamera();
    }, undefined, function (err) {
      if (hint) hint.textContent = 'Body load failed.';
      console.error('Studio body load failed:', err);
    });
  }

  function applyStudioSkins() {
    ['Torso', 'Legs'].forEach(function (slot) {
      var sel = document.getElementById('studio-' + slot.toLowerCase());
      var file = sel && sel.value;
      if (file) applyStudioSkin(slot, file);
    });
  }

  function applyStudioSkin(slot, file) {
    var entry = studioClothing[slot];
    var style = studioStyleFromFile(file, slot);
    if (window.CMG_FEATURE_FLAGS?.r3f_v1 && (!entry || !entry.meshes)) {
      studioClothing[slot] = { ...(entry || {}), file: file, style: style };
      syncR3FStudio();
      return;
    }
    if (!entry || !style || !entry.meshes[style] || !file) return;
    Object.keys(entry.meshes).forEach(function (key) {
      entry.meshes[key].visible = Number(key) === style;
    });
    entry.style = style;
    entry.mesh = entry.meshes[style];
    entry.file = file;
    var url = 'models/skins/' + studioFaction + '/' + file;
    getStudioTexture(url, function (tex) {
      if (entry.file !== file || entry.style !== style) return;
      var mesh = entry.meshes[style];
      var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(function (mt) {
        // keep the GLB's color-space setting so colors don't wash out
        var enc = mt.map ? mt.map.encoding : THREE.sRGBEncoding;
        tex.encoding = enc;
        mt.map = tex;
        mt.needsUpdate = true;
      });
      updateStudioName();
    });
  }

  function getStudioTexture(url, cb) {
    if (sTexCache[url]) { cb(sTexCache[url]); return; }
    new THREE.TextureLoader().load(url, function (tex) {
      sTexCache[url] = tex;
      cb(tex);
    });
  }

  function updateStudioName() {
    var el = document.getElementById('studio-model-name');
    if (!el) return;
    var parts = [studioGender.toUpperCase() + ' Average body', studioFaction];
    ['Torso', 'Legs'].forEach(function (slot) {
      var e = studioClothing[slot];
      if (e && e.file) parts.push(slot + ' ' + e.file.replace(/^[fm]_AVG_/, '').replace(/\.webp$/, ''));
    });
    el.textContent = parts.join(' · ');
  }

  // ────────────────────────────────────────────────────────────────────────
  // § GEAR VISIBILITY
  // ────────────────────────────────────────────────────────────────────────

  function gearLabel(name) {
    return name.replace(/(\d+)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  function renderStudioGearGrid() {
    var grid = document.getElementById('studio-gear-grid');
    if (!grid) return;
    if (!studioGear.length) {
      grid.innerHTML = '<span class="muted" style="font-size:0.7rem">no gear pieces</span>';
      return;
    }
    grid.innerHTML = studioGear.map(function (g) {
      return '<label title="' + g.name + '"><input type="checkbox" data-gear="' + g.name + '" checked /> ' +
        gearLabel(g.name) + '</label>';
    }).join('');
  }

  function setStudioGearVisibility() {
    studioGear.forEach(function (g) {
      var cb = document.querySelector('#studio-gear-grid input[data-gear="' + g.name + '"]');
      g.mesh.visible = !cb || cb.checked;
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // § GLB EXPORT (bake current skins into a new GLB)
  // ────────────────────────────────────────────────────────────────────────

  // parse GLB container: returns {json, bin, imageIdx:{Torso,Legs}}
  function parseStudioGlb(arrayBuffer) {
    var dv = new DataView(arrayBuffer);
    var jsonLen = dv.getUint32(12, true);
    var jsonType = dv.getUint32(16, true);       // 0x4E4F534A = 'JSON'
    var jsonBytes = new Uint8Array(arrayBuffer, 20, jsonLen);
    var json = JSON.parse(new TextDecoder().decode(jsonBytes));
    var binStart = 20 + jsonLen + 8;
    var bin = new Uint8Array(arrayBuffer, binStart);

    // find images whose name matches the AVG torso/legs skins
    var imageIdx = {};
    (json.images || []).forEach(function (im, i) {
      var n = (im.name || '').toLowerCase();
      if (/avg_torso/.test(n) && imageIdx.Torso === undefined) imageIdx.Torso = i;
      if (/avg_legs/.test(n) && imageIdx.Legs === undefined) imageIdx.Legs = i;
    });
    return { json: json, bin: bin, imageIdx: imageIdx };
  }

  function bakeStudioImage(slot, cb) {
    var entry = studioClothing[slot];
    if (!entry || !entry.mesh) return cb(null);
    var mats = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
    var map = null;
    for (var i = 0; i < mats.length; i++) { if (mats[i] && mats[i].map) { map = mats[i].map; break; } }
    if (!map || !map.image) return cb(null);
    var img = map.image;
    var c = document.createElement('canvas');
    c.width = img.width || 512; c.height = img.height || 512;
    c.getContext('2d').drawImage(img, 0, 0);
    c.toBlob(function (blob) {
      if (!blob) return cb(null);
      var fr = new FileReader();
      fr.onload = function () { cb(new Uint8Array(fr.result)); };
      fr.readAsArrayBuffer(blob);
    }, 'image/png');
  }

  function exportStudioGlb() {
    if (!studioGlbInfo) {
      alert('Export not ready (GLB data not loaded).');
      return;
    }
    var info = studioGlbInfo;
    var json = JSON.parse(JSON.stringify(info.json));
    var bin = Array.from(info.bin);           // copy (Uint8Array copy via spread)
    var bufferViews = json.bufferViews || [];

    // Keep only the selected clothing silhouettes and currently visible gear
    // in the exported scene. Unreferenced binary data may remain in the GLB,
    // but loaders will instantiate only this scene-node list.
    var visibleGear = new Set(studioGear.filter(function (g) { return g.mesh.visible; }).map(function (g) { return g.name; }));
    var keepNodes = new Set(studioExportNodeIndices(
      json.nodes || [],
      studioClothing.Torso && studioClothing.Torso.style,
      studioClothing.Legs && studioClothing.Legs.style,
      visibleGear
    ));
    var scene = json.scenes && json.scenes[json.scene || 0];
    if (scene && scene.nodes) scene.nodes = scene.nodes.filter(function (index) { return keepNodes.has(index); });

    var pending = ['Torso', 'Legs'].filter(function (s) { return info.imageIdx[s] !== undefined; });
    if (!pending.length) { downloadStudioGlb(json, bin, json.buffers[0]); return; }

    var done = 0;
    pending.forEach(function (slot) {
      bakeStudioImage(slot, function (pngBytes) {
        if (pngBytes) {
          var imgIdx = info.imageIdx[slot];
          var byteOffset = bin.length;
          bin = bin.concat(Array.from(pngBytes));
          // pad to 4 bytes
          while (bin.length % 4) bin.push(0);
          var bvIdx = bufferViews.length;
          bufferViews.push({ buffer: 0, byteOffset: byteOffset, byteLength: pngBytes.length });
          json.images[imgIdx].bufferView = bvIdx;
          json.images[imgIdx].mimeType = 'image/png';
        }
        done++;
        if (done === pending.length) {
          json.bufferViews = bufferViews;
          json.buffers[0].byteLength = bin.length;
          downloadStudioGlb(json, bin, json.buffers[0]);
        }
      });
    });
  }

  function downloadStudioGlb(json, bin, buffer) {
    var jsonStr = JSON.stringify(json);
    var enc = new TextEncoder();
    var jsonBytes = enc.encode(jsonStr);
    while (jsonBytes.length % 4) { jsonBytes = concatBytes(jsonBytes, new Uint8Array([0x20])); }
    var binBytes = new Uint8Array(bin);

    var total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
    var out = new ArrayBuffer(total);
    var dv = new DataView(out);
    var u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true);          // 'glTF'
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonBytes.length, true);
    dv.setUint32(16, 0x4E4F534A, true);
    u8.set(jsonBytes, 20);
    dv.setUint32(20 + jsonBytes.length, binBytes.length, true);
    dv.setUint32(24 + jsonBytes.length, 0x004E4942, true);
    u8.set(binBytes, 28 + jsonBytes.length);

    var blob = new Blob([out], { type: 'model/gltf-binary' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (studioGender === 'f' ? 'f_Average' : 'm_Average') + '_' + studioFaction + '_outfit.glb';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // § ENTRY (wired from app-init.js + models.js subtab switch)
  // ────────────────────────────────────────────────────────────────────────

  function wireCharacterStudioEvents() {
    document.getElementById('studio-gender')?.addEventListener('change', function (e) {
      studioGender = e.target.value;
      loadStudioBody();
    });
    document.getElementById('studio-faction')?.addEventListener('change', function (e) {
      studioFaction = e.target.value;
      populateStudioSlots();
      applyStudioSkins();
    });
    document.getElementById('studio-torso')?.addEventListener('change', function (e) {
      applyStudioSkin('Torso', e.target.value);
    });
    document.getElementById('studio-legs')?.addEventListener('change', function (e) {
      applyStudioSkin('Legs', e.target.value);
    });
    document.getElementById('studio-gear-grid')?.addEventListener('change', setStudioGearVisibility);
    document.getElementById('studio-autorotate')?.addEventListener('click', function () {
      sAutoRotate = !sAutoRotate;
      this.classList.toggle('active', sAutoRotate);
    });
    document.getElementById('studio-reset')?.addEventListener('click', function () {
      if (studioGroup) fitStudioCamera();
    });
    document.getElementById('studio-export')?.addEventListener('click', exportStudioGlb);

    window.addEventListener('resize', function () {
      var container = document.getElementById('studio-viewer');
      if (!container || !sRenderer || !sCamera) return;
      sCamera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      sCamera.updateProjectionMatrix();
      sRenderer.setSize(container.clientWidth, container.clientHeight);
    });

    // pause the studio render loop when leaving the Models tab
    registerViewHook({
      view: 'models',
      leave: function () { if (sFrameId) { cancelAnimationFrame(sFrameId); sFrameId = 0; } },
      enter: function () {
        if (!sFrameId && sViewerInit) animateStudio();
        if (sRenderer && sRenderer.domElement.parentElement !== document.getElementById('studio-viewer')) {
          document.getElementById('studio-viewer')?.appendChild(sRenderer.domElement);
        }
      }
    });
  }
