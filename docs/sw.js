// Network-first with cache fallback: always fresh when online, still opens offline after one visit.
const CACHE = 'farmland-demo-v2';
const FILES = ["app.js", "data/crops.csv", "data/farm.csv", "data/line_sectors.csv", "data/lines.csv", "data/reservoir_readings.csv", "data/reservoirs.csv", "data/rules.csv", "data/runs.csv", "data/sectors.csv", "data/weather_history.csv", "data/weather_scenarios.csv", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "index.html", "lib/csv.js", "lib/data.js", "lib/dates.js", "lib/planner.js", "lib/report.js", "lib/runs.js", "lib/store.js", "lib/units.js", "manifest.webmanifest", "styles.css", "ui/charts.js", "ui/common.js", "ui/dashboard.js", "ui/farm.js", "ui/plan.js", "ui/report.js", "ui/sheets.js", "ui/today.js", "vendor/decimal.mjs", "vendor/hooks.mjs", "vendor/htm.mjs", "vendor/preact.mjs"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FILES])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  );
});
