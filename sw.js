const CACHE_PREFIX = 'er-prodcalc-';
const CACHE = 'er-prodcalc-v0.2.43-shell';
const RUNTIME_CACHE = 'er-prodcalc-v0.2.43-runtime';
const MAX_RUNTIME_ENTRIES = 32;
const OPTIONAL_RUNTIME_DIRECTORIES = [
  'src/generated/', 'src/vendor/', 'models/', 'maps/', 'icons/',
  'gear_textures/', 'voice_extracted/',
];
const OPTIONAL_PATH_PREFIXES = OPTIONAL_RUNTIME_DIRECTORIES.map(directory =>
  new URL(directory, self.registration.scope).pathname
);

// SHELL is the install-time precache: only assets the app needs immediately
// to render and calculate. Optional 3D/chart payloads (three.js, the R3F
// workbench bundle, Chart.js, and the model manifest) are fetched on demand
// and kept in the separately bounded runtime cache.
const SHELL = [
  './',
  './index.html',
  './src/styles.css',
  './src/styles/tokens.css',
  './src/styles/shell.css',
  './src/styles/components.css',
  './src/styles/views.css',
  './src/styles/ux-release.css',
  './src/styles/surviving-reference.css',
  './src/store.js',
  './src/engine.js',
  './src/game_data.js',
  './src/balance_stats.js',
  './src/costs.js',
  './src/armor_classes.js',
  './src/factions.js',
  './data/icon_hashes.json',
  './data/icon_dhashes.json',
  './icons/icon_catalog.json',
  './src/app-core.js',
  './src/colony-work.js',
  './src/ui/motion.js',
  './src/ui/value-transition.js',
  './src/ui/r3f-loader.js',
  './src/ui/spatial-emphasis.js',
  './src/ui/legacy-3d-loader.js',
  './src/ui/chart-loader.js',
  './src/app.js',
  './src/apply-plan.js',
  './src/views/models.js',
  './src/views/reference.js',
  './src/views/gear.js',
  './src/views/patch-changes.js',
  './src/views/inventory.js',
  './src/views/character.js',
  './src/views/player.js',
  './src/app-init.js',
  './src/ui/trust-indicators.js',
  './fonts/orbitron-latin.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './manifest.webmanifest',
  './favicon.svg'
];

// Install: cache app shell; a required asset failure rejects installation.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

const cleanupOldCaches = async () => {
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== RUNTIME_CACHE) {
      await caches.delete(key);
    }
  }
};

// Activate only removes caches belonging to this project. Other applications
// may share the origin (especially during local development) and must survive.
self.addEventListener('activate', e => {
  e.waitUntil(cleanupOldCaches().then(() => self.clients.claim()));
});

const isSameOrigin = request => new URL(request.url).origin === self.location.origin;
const isOptionalAsset = request => {
  const { pathname } = new URL(request.url);
  return OPTIONAL_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix));
};

// Cache writes are serialized so eviction order is deterministic even when
// several optional assets finish downloading at the same time.
let runtimeWrite = Promise.resolve();
const cacheRuntimeResponse = (request, response) => {
  runtimeWrite = runtimeWrite.then(async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response);
    const keys = await cache.keys();
    while (keys.length > MAX_RUNTIME_ENTRIES) {
      await cache.delete(keys.shift());
    }
  }).catch(() => {
    // Cache quota errors must never break the network response.
  });
  return runtimeWrite;
};

// Fetch: network-first for same-origin requests, with offline fallback from
// the two project caches. Only known optional assets enter runtime storage.
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || !isSameOrigin(request)) return;
  e.respondWith(
    fetch(request).then(response => {
      if (response.ok && isOptionalAsset(request)) {
        e.waitUntil(cacheRuntimeResponse(request, response.clone()));
      }
      return response;
    }).catch(() => Promise.all([
      caches.open(CACHE),
      caches.open(RUNTIME_CACHE),
    ]).then(([shell, runtime]) => shell.match(request, { ignoreSearch: true })
      .then(hit => hit || runtime.match(request, { ignoreSearch: true }))))
  );
});
