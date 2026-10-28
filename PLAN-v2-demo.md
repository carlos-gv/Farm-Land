# FarmLand v2 Demo: UI-first walkthrough for investors and jury

Status: built (see section 13 for what changed while building). Builder: one person. Time: 2 days. Parent plan: `PLAN-v2.md` (the real product). This file only covers the demo.

## 1. Purpose and constraints

**Purpose.** Show investors and the jury what the v2 app does and feels like, on a phone, with believable data. It must be presentable from a laptop (screen share) and usable by the audience on their own phones through a link.

**What the demo proves:** the farmer can see where water went, what each line uses, how full the reservoirs are, and what to irrigate over the next 30 days and why. The numbers are exact and show their working.

**What the demo does NOT prove (be honest about it in the pitch):** real sync, real accounts, real weather, real persistence, multi-user conflicts, compliance report format. These are in `PLAN-v2.md`.

### Constraints

| Constraint | Decision |
| --- | --- |
| Time | 2 days, one person. |
| Hosting | GitHub Pages, static files only, no backend, no API keys. |
| Data | Plain CSV files committed to the repo (read-only seed). Size is not a hard limit. |
| Persistence | **None.** All state lives in memory and resets on reload. A "Reset demo" button also restores the start state. |
| Edits | **Staged.** Only a few scripted edit paths work (section 5). Everything else is visible but marked "Not in demo". |
| Weather | Canned, in CSV. Three scenarios: Heatwave, Heavy rain, Normal. |
| Offline | Real: a service worker caches the app so it opens offline. Plus a visible "Simulate offline" switch for the stage (sync is simulated and labeled as such). |
| Users | One user. No multi-user or conflict story. |
| Reminders | In-app "due now" banner plus a "Send test notification" button. |
| Languages and units | English. Gallons/acres/inches by default, metric toggle. |
| Look | Clean, high contrast, large tap targets, mobile first. Branding comes later. |

### Decisions made along the way

- **Fixed demo date: Monday 13 July 2026**, shown in the header as "Demo date". Real today is outside the growing season, which would look wrong for irrigation of potatoes and corn. A fixed date also keeps the story identical on every device.
- **No build step.** Preact + htm and decimal.js are **copied into the repo** (`docs/vendor/`), not loaded from a CDN. This removes a failure point on stage and lets the app work offline.
- **Pages serves from `docs/`.** GitHub Pages can serve the repo root or `/docs`, but not other folders. The v1 files at the root stay untouched.
- **Exact math is kept real.** Even in the demo, volumes are computed with decimals from `rate x time`, not typed in. This is the part investors can check with a calculator.

## 2. Demo story (3 to 5 minutes)

The presenter holds the phone, with the laptop mirroring it.

1. **Dashboard** (30 s). "This is Boise Valley Farm. Last 14 days: 8.2 million gallons used, rain in the strip below. Main Pond is at 77%, about 9 days of water left at recent use."
2. **Today** (45 s). A banner says "Irrigate Shared Lateral today, 6:00 AM, 14 h 17 min, about 342,800 gal." Tap **Start** on a line. The timer runs (demo clock x60). Tap **Stop**. The card shows the live `rate x minutes = gallons` line, and the toast shows the saved volume.
3. **Log a past run** (30 s). Add yesterday's run on the shared lateral. Show how its water splits between East Block and West Corn.
4. **Plan** (60 s). 30-day schedule. Tap an item to see why ("Deficit 0.52 in, rain 0.0 in, Tuber Bulking"). Days 17 to 30 are labeled "typical". Switch the scenario to **Heavy rain** and watch irrigation items disappear. Switch to **Heatwave** and see a reservoir shortfall warning.
5. **Farm** (45 s). Open Shared Lateral, change its rate from 400 to 420 gpm. Show version history. Past runs stay at 400 gpm and their totals do not change; the plan's minutes recompute.
6. **Reservoirs** (20 s). Add a refill. The level and "days left" update.
7. **Report** (30 s). Pick the last 14 days, expand a total to show its runs and formulas, tap **Export PDF**.
8. **Offline** (30 s). Flip **Simulate offline**, log a run, show "1 change waiting", flip back, show "Synced". Close with the unit toggle (gal to L, acre to ha).

## 3. Screens and UI elements

Layout: phone gets a bottom tab bar with 5 tabs. Laptop gets a left side rail and a wider two-column grid. Header on every screen: farm name, **Demo date** chip, sync-status chip, bell (alerts), gear (settings and demo panel). A thin banner reads "Demo data. Weather and sync are simulated."

### 3.1 Dashboard (tab 1)

The "see the information at a glance" screen.

| Element | Content |
| --- | --- |
| KPI tiles | Water used last 7 days; water used last 14 days; next irrigation (line, when); open alerts. |
| Usage chart | Daily water used for the last 14 days, stacked by sector, with rain as bars on a second scale. |
| Reservoir gauges | One per reservoir: level, capacity, percent, estimated days left, max outflow. Warning color below 25%. |
| Next 7 days strip | One chip per day: irrigate (minutes, line) or "skip: rain". |
| Usage by line | Small table: line, rate, minutes run, gallons, last 14 days. |
| Alerts preview | Top 3 alerts with a link to all. |

All numbers drill into the Report screen.

### 3.2 Today (tab 2)

- **Due now banner** (the in-app reminder), with a plain sentence: "Irrigate Shared Lateral today at 6:00 AM for 14 h 17 min, about 342,800 gal (East Block + West Corn)."
- **Line cards** (5): name, sector(s), reservoir, rate, status (idle / running / due). Big **Start** or **Stop** button, live timer, running volume (`rate x elapsed`).
- **Flow warning** if running lines exceed a reservoir's max outflow.
- **Floating "+ Log run"** button, opens the Log sheet.
- **Log sheet:** line, date, start time, duration (or stop time), optional "water taken from reservoir". The result shows the formula and the split by sector.

### 3.3 Plan (tab 3)

- Scenario switcher at the top (Heatwave / Heavy rain / Normal).
- **List by day** for 30 days. Each day: weather (rain, ET), and irrigation items (line, sector, start time, minutes, gallons). Days 1 to 16 are tagged "Forecast", days 17 to 30 "Typical".
- Tap an item for the **Why panel**: crop, stage, ET0, Kc, effective rain, deficit, efficiency, depth, volume, minutes, with each step shown.
- **Warnings** inline: reservoir shortfall, stagger due to flow limit, skipped because of rain.
- Toggle: list view or month grid.

### 3.4 Farm (tab 4)

- Tree view: Farm, Sectors (area, crop, stage), Lines (rate, reservoir, shares), Reservoirs (capacity, max outflow, level).
- **Line detail** with the one scripted edit (section 5), a **version history** list, and a note "Past runs keep the rate they ran at".
- **Reservoir detail:** level history, **Add refill** and **Add reading** forms, withdrawal confirmation with a difference shown ("computed 288,000 gal, reported 291,500 gal, +1.2%").
- Everything else is shown but disabled with a "Not in demo" tag.

### 3.5 Report (tab 5)

- Date range presets (last 7 days, last 14 days, all demo history).
- Totals by line, by sector, by reservoir. Tap to expand into the runs, each with `rate x minutes = gallons`.
- Note: "Values rounded for display. Totals use unrounded values."
- **Export PDF** opens the print view with a print stylesheet, so the browser's "Save as PDF" produces the file. No PDF library.

### 3.6 Alerts (bell) and Settings (gear)

- **Alerts sheet:** due-now irrigation, reservoir low, plan shortfall, flow limit exceeded, rain skip. Each with a short plain sentence.
- **Settings and demo panel:**
  - Units: volume (gal / L), area (acre / ha), depth (in / mm). Display only, nothing stored changes.
  - Scenario (same control as in Plan).
  - Simulate offline.
  - Demo clock speed (x1 / x60).
  - Send test notification.
  - Reset demo.

## 4. Data (CSV in `docs/data/`)

Files are loaded at start and kept in memory. Values are labeled demo data and are not agronomic advice.

| File | Columns | Notes |
| --- | --- | --- |
| `farm.csv` | name, lat, lon, tz, demo_date | Boise Valley Farm, 43.6150, -116.2023, America/Denver, 2026-07-13 |
| `sectors.csv` | id, name, area_ac, crop_id, gdd_now, fallback_weekly_in | North Pivot (Russet Potato, 40 ac), East Block (Russet Potato, 25 ac), West Corn (Sweet Corn, 30 ac) |
| `lines.csv` | id, name, rate_gpm, reservoir_id, system, efficiency | 5 lines, see below |
| `line_sectors.csv` | line_id, sector_id, share_pct | Shares sum to 100 per line. Shared lateral splits 45 / 55. |
| `reservoirs.csv` | id, name, capacity_gal, max_outflow_gpm, planned_inflow_gpd | Main Pond, Well Tank. Planned inflow is an assumption the plan uses for refills; real refills are entered by the user. |
| `crops.csv` | crop_id, crop_name, stage, min_gdd, max_gdd, kc, sensitivity, tip | From v1 `data/crops.json`, plus a Kc per stage |
| `runs.csv` | id, line_id, start_iso, seconds, source, rate_gpm_snapshot, note | About 25 runs over the 14 days before the demo date, mixed `timer` and `manual` |
| `reservoir_readings.csv` | reservoir_id, kind, gal, at_iso | Levels, one refill, one withdrawal confirmation with a small difference |
| `weather_history.csv` | day_offset, rain_in, et0_in, temp_f | Days -14 to 0 (real-looking, one rain event) |
| `weather_scenarios.csv` | scenario, day_offset, kind, rain_in, et0_in, temp_f | 3 scenarios x days +1 to +30, `kind` is `forecast` (1 to 16) or `typical` (17 to 30) |
| `rules.csv` | key, value | Rain skip threshold 0.5 in, max application 1.5 in, minimum application 0.5 in, start time 06:00 |

### Seed farm layout

| Line | Rate | Sector (share) | Reservoir | System |
| --- | --- | --- | --- | --- |
| L1 Pivot 1 | 1,200 gpm | North Pivot (100%) | Main Pond | Pivot |
| L2 East Drip 1 | 200 gpm | East Block (100%) | Well Tank | Drip |
| L3 Shared Lateral | 400 gpm | East Block (45%), West Corn (55%) | Well Tank | Sprinkler |
| L4 Pivot 2 | 800 gpm | West Corn (100%) | Main Pond | Pivot |
| L5 East Drip 2 | 200 gpm | East Block (100%) | Well Tank | Drip |

| Reservoir | Capacity | Max outflow | Lines |
| --- | --- | --- | --- |
| Main Pond | 6,000,000 gal | 2,200 gpm | L1, L4 (2,000 gpm together) |
| Well Tank | 2,500,000 gal | 700 gpm | L2, L3, L5 (800 gpm together, so one line waits its turn) |

The seed numbers are tuned so that: Normal gives a clean schedule, Heavy rain skips most days, and Heatwave produces one visible shortfall on the Well Tank. This is checked by hand before the demo (section 8).

## 5. Staged actions (the only things that change state)

State is in memory only. Reload or **Reset demo** returns to the start.

| # | Action | What happens |
| --- | --- | --- |
| A1 | Start / Stop a line | Live timer using the demo clock. On stop, a run is added with exact seconds and volume, the reservoir level drops, and dashboard, report and plan carry-over update. |
| A2 | Log a past run | The same record as A1, `source = manual`. Shows the formula and the sector split. |
| A3 | Edit Shared Lateral rate (400 to 420 gpm) | Creates version 2 with an effective time. History shows both. Past runs stay at 400. Plan minutes recompute. Other fields are disabled. |
| A4 | Add reservoir refill / reading / withdrawal confirmation | Level and days-left update. A withdrawal confirmation shows the difference from the computed value. |
| A5 | Switch scenario | Plan, dashboard strip and alerts recompute. |
| A6 | Unit toggles | Display only. |
| A7 | Simulate offline | Banner and sync chip change. Actions A1 to A4 are counted as "N changes waiting". Switching back shows "Syncing" for about 1.5 s, then "Synced, N changes uploaded". Labeled as simulated. |
| A8 | Test notification | Uses the browser Notification API when allowed (Android; iOS only after Add to Home Screen). Otherwise shows an in-app message. |
| A9 | Export PDF | Print view. |

## 6. Calculation rules the demo implements

Same rules as `PLAN-v2.md` section 6 and 9, in simplified form. All math is in `docs/lib/` as pure modules with no UI code, so it can move into `packages/core` later.

1. **Run volume** = `rate_gpm x seconds / 60`, computed in decimals, shown as `gpm x min = gal`. Rate and seconds are the snapshot stored on the run.
2. **Sector split** = run volume x share %. Shares sum to 100, so split totals equal the run volume exactly. Any leftover from rounding is kept unrounded, and only display is rounded.
3. **Conversions:** 1 US gal = 3.785411784 L, 1 acre = 0.40468564224 ha, 1 acre-inch = 27,154.285 gal (as in `PLAN-v2.md` G11).
4. **Plan, per sector and day:**
   - Stage from GDD (starting `gdd_now`, plus a simple daily gain `max(0, temp_f - 50)`).
   - `ETc = ET0 x Kc(stage)`.
   - Effective rain: 0 below 0.1 in; otherwise the rain amount, capped at 1.0 in per day.
   - Running deficit = previous deficit + ETc - effective rain - recent irrigation depth (from past runs / earlier plan items).
   - If rain >= 0.5 in that day (v1 rule), skip and say why.
   - When the deficit reaches the minimum application (0.5 in), schedule one application = deficit, capped at 1.5 in, divided by system efficiency.
   - Depth to volume to minutes: `volume = depth x area x 27,154.285`, split to lines by share, `minutes = volume / rate`.
5. **Limits:** lines on the same reservoir are staggered so total flow stays at or below the max outflow. If projected level falls below zero, the item shows a shortfall warning with the missing gallons. Reservoir level: start level - plan volume + refills (refills only from the user).
6. **Fallback** (not shown in the demo flow, but present in code): weekly target depth from `sectors.csv` replaces `ETc`.

## 7. Technical plan

### 7.1 Structure

```
docs/                       <- served by GitHub Pages
  index.html
  styles.css                design tokens (light + dark), components
  app.js                    entry, store, routing (hash-based)
  sw.js                     cache-first app shell
  manifest.webmanifest
  icons/
  vendor/                   preact, htm, decimal.js (copied, version-pinned)
  lib/
    csv.js                  small CSV parser
    units.js                conversions and formatting (decimal-based)
    runs.js                 run volume, sector split, version snapshots
    planner.js              the 30-day plan from section 6
    store.js                in-memory state, actions A1 to A9
  ui/                       one file per screen + shared components
  data/*.csv
tests/
  math.test.mjs             hand-calculated cases, run with `node --test`
```

### 7.2 Stack choices

| Item | Choice | Why |
| --- | --- | --- |
| UI | Preact + htm, ES modules, no build | Re-rendering timers, charts and toggles is much easier than plain DOM; no tooling to break. |
| Math | decimal.js | No floating-point drift, same library as the full plan. |
| Charts | Small hand-written SVG (bars, stacked bars, gauges) | Keeps the bundle tiny and fully styled. Use the `dataviz` skill guidance when building. |
| Routing | Hash routes (`#/plan`) | Works on GitHub Pages with no server config. |
| Offline | Service worker, cache-first for the app shell and CSVs, versioned cache name | Real offline load after the first visit. |
| Tests | `node --test` on `lib/` only | Cheap, runs in seconds, protects the part that matters. |

### 7.3 Design

- Light theme by default, dark theme through `prefers-color-scheme`. Colors as CSS variables so branding can be swapped later.
- High contrast (text at least 7:1 where possible, 4.5:1 minimum), tap targets at least 48 px, no information in color alone (icon and text on every status).
- Thousands separators, fixed decimals per unit, unit always shown next to the number.
- Every screen shows the "Demo data" label.
- Use the `frontend-design` skill when building, to avoid a template look.

## 8. Two-day schedule

About 8 focused hours per day. Each block ends with something visible. If a block runs over, use the cut list.

### Day 1: data, math and the live screens

| Time | Work | Done when |
| --- | --- | --- |
| 0:00 to 1:00 | Scaffold `docs/`, shell, tabs, header chips, design tokens, CSV loader. Write seed CSVs. | App shows empty tabs on a phone through `python3 -m http.server`. |
| 1:00 to 2:30 | `units.js`, `runs.js`, `store.js` and `math.test.mjs` with hand-calculated cases (e.g. `600 gpm x 12.5 min = 7,500 gal`; 45/55 split; round trips). | `node --test` passes. |
| 2:30 to 4:30 | **Today** and **Log**: line cards, timer, demo clock, Start/Stop, log sheet, formula display. | A1 and A2 work end to end. |
| 4:30 to 6:30 | **Dashboard**: KPI tiles, usage and rain chart, reservoir gauges, usage by line. | Numbers on the dashboard equal the sums from the raw runs. |
| 6:30 to 8:00 | **Farm** (read-only tree, reservoir detail) and unit toggles. | Toggles change every number, stored values unchanged. |

**End-of-day-1 checkpoint:** a viewable, shareable demo of Dashboard, Today, Log and Farm. If this is not true, drop the month grid, the stage-by-GDD advance and the dark theme.

### Day 2: plan, edits, report, offline and polish

| Time | Work | Done when |
| --- | --- | --- |
| 0:00 to 2:30 | `planner.js` and **Plan** screen: scenarios, list, Why panel, warnings. Hand-check Normal and Heatwave results. | Plan matches the hand calculation for one sector. |
| 2:30 to 4:00 | Line 3 edit (A3) with version history. Reservoir refill / reading / confirmation (A4). | History and recalculated plan visible. |
| 4:00 to 5:30 | **Report**, expandable totals, print stylesheet (A9). **Alerts** sheet. | Report totals equal dashboard totals. |
| 5:30 to 6:30 | Service worker, manifest, offline simulation (A7), test notification (A8), Settings and demo panel, Reset. | Opens offline after one load. |
| 6:30 to 8:00 | Test on a real iPhone and Android phone, fix layout and contrast, rehearse the 3 to 5 minute script twice, write a short README. | Rehearsal runs without a hiccup. |

### Cut list (in this order)

1. Month grid view in Plan.
2. GDD-based stage advance (stage fixed per sector).
3. Dark theme.
4. Reservoir withdrawal confirmation (keep refill and reading).
5. Test notification (keep the in-app banner).
6. Per-sector report grouping (keep by line and by reservoir).

Never cut: exact run math with visible formula, Dashboard, Today with timer, Plan with the Why panel, the Line 3 versioned edit, unit toggle.

## 9. Acceptance checklist (before showing it)

**Numbers**
- [ ] Every run shows `rate x minutes = gallons` and matches a hand calculation.
- [ ] Sector splits add up to the run volume exactly.
- [ ] Dashboard, Today and Report totals agree for the same period.
- [ ] After the Line 3 edit, old runs still show 400 gpm and the same gallons.
- [ ] Unit toggles change display only; toggling back shows the original values.

**Plan**
- [ ] Normal, Heavy rain and Heatwave give clearly different plans.
- [ ] Heatwave shows a shortfall warning; no item exceeds a reservoir's max outflow.
- [ ] Days 17 to 30 are labeled "Typical".
- [ ] One plan item checked by hand against section 6.

**Experience**
- [ ] Phone (iOS Safari and Android Chrome): no horizontal scroll, readable outdoors-style contrast, buttons are easy to hit.
- [ ] Laptop: side rail and two-column layout work on a projected screen.
- [ ] Opens with airplane mode after one visit.
- [ ] Simulate offline shows the waiting count and "Synced".
- [ ] Reset demo restores the start state; reload does the same.
- [ ] No console errors on any screen.

**Hosting**
- [ ] Works from the Pages URL (relative paths only, hash routing).
- [ ] Link opens on a phone without login and installs as an app.

## 10. Risks

| Risk | Response |
| --- | --- |
| Seed numbers produce odd plans (too many or too few irrigations) | Tune the CSV and rules early on Day 2, check with a hand calculation. |
| Two days is short for 7 screens | Day 1 checkpoint, cut list, no features beyond the staged actions. |
| Service worker serves a stale version after you update | Versioned cache name, and test with a hard reload before the demo. |
| iOS does not show the test notification | Expected. The banner is the primary reminder; say so in the pitch. |
| Audience mistakes demo data for real data | "Demo data" label on every screen and the demo-date chip. |
| Pages deploy fails or is slow to update at the last minute | Deploy on the evening of Day 2 at the latest, and keep `python3 -m http.server` as a local backup. |

## 11. Working rules

- Everything stays local until you say otherwise. **No pushing or deploying by me.**
- Every commit needs your explicit approval first, and commit messages carry no Claude or AI attribution.
- **Reminder for you:** when the demo is ready, you push the branch manually and enable GitHub Pages (Settings, Pages, deploy from the branch, folder `/docs`). A free account needs a **public repo**, so the demo data becomes public.

## 12. After the demo

Items that carry over to the real build (`PLAN-v2.md`): move `lib/` into `packages/core`, replace in-memory state with IndexedDB and sync, replace canned weather with the weather adapter, replace the print view with a real report, add auth, roles and the conflict flow, and decide the compliance report layout with the pilot farm.

## 13. Build notes (what changed while building)

- **Seed numbers.** Rates and reservoir sizes were raised so run times stay realistic (a pivot pass takes about 11 h, not 30 h). Line names are Pivot 1 and Pivot 2. The edit path is Shared Lateral, 400 to 420 gpm.
- **Seed generator.** `tools/gen-seed.mjs` writes all the CSVs. The past 14 days of runs come from the same planner the app uses, with small timing jitter. Run `node tools/gen-seed.mjs` to regenerate them.
- **Planned inflow.** Reservoirs have `planned_inflow_gpd` (an assumption for refills in the plan). Without it, any 30-day plan would drain the ponds.
- **Shared lines.** When a line serves two sectors, running it credits both. The planner applies that water to both sectors' deficits, so a sector can need less because its neighbour was irrigated.
- **Plan scenarios.** Normal has no shortfall. Heatwave shows runs short of water on the Well Tank from about day 9 and a low Main Pond by day 30. Heavy rain has no irrigation for the 16 forecast days, and a rain-skip day.
- **Tests.** `node --test tests/math.test.mjs` (10 tests): exact run math, sector splits, unit round trips, rounding, seed recompute, and plan invariants (gallons = rate x minutes, flow limits, scenario differences).
- **Not built (cut list):** month grid in Plan, GDD slider, dark-theme toggle (dark follows the device setting), withdrawal-confirmation difference is shown but there is no calibration hint.
- **Checked in headless Chrome:** phone and desktop layouts, no horizontal scroll, no console errors, real offline reload with the server stopped. Not yet checked on a physical iPhone or Android phone.
