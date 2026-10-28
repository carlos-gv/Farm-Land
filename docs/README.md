# FarmLand v2 demo

Static, installable web app with sample data. No backend, no build step. Served from this `docs/` folder by GitHub Pages.

## Run locally

```
python3 -m http.server 8000 --directory docs
```

Open http://localhost:8000 (a phone on the same Wi-Fi can use your computer's address).

## What is real and what is simulated

| Real | Simulated |
| --- | --- |
| Run volume = rate x time, exact decimals (`vendor/decimal.mjs`) | Weather (canned CSV, three scenarios) |
| Sector split, unit conversions (display only) | Sync: "Simulate offline" counts changes and fakes the upload |
| 30-day plan from crop stage, ET, rain, area, line rates, reservoir limits | Notifications: one test button |
| Versioned line rate (past runs keep their rate) | Persistence: none, a reload resets everything |
| Opens offline after one visit (service worker) | Demo date: fixed at 13 July 2026 |

## Layout

```
index.html, styles.css, app.js   shell, routing, header
ui/                              one file per screen, plus sheets and charts
lib/                             math, planner, store (no DOM; tested in node)
data/*.csv                       seed data (regenerate: node tools/gen-seed.mjs)
vendor/                          preact, htm, decimal.js (copied in, not loaded from a CDN)
sw.js                            network-first cache, works offline
```

Tests: `node --test tests/math.test.mjs` (from the repo root).

After adding or renaming files, update the `FILES` list in `sw.js` and bump `CACHE`.

## Publish on GitHub Pages

Repo Settings, Pages, deploy from a branch, folder `/docs`. A free account needs a public repo. The link works on phones with no login.
