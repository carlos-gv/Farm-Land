# FarmLand v2: Irrigation tracking, usage accounting and 30-day planning

Status: defaults G1 to G12 and the Supabase stack confirmed. Team: 5 developers. Target: a real pilot in 2 months (8 weeks), built so it can grow into a product that is sold.

## 1. Problem and goals

Farmers need one place to:

1. Record how much water each crop section actually received.
2. Know how much water each irrigation line uses, and how much is left in each reservoir.
3. Plan the next 30 days of irrigation from past irrigation, expected rain and crop need.
4. Get simple reminders that say where, when and how much to irrigate.

Two things are non-negotiable and shape every decision below:

- **Numbers must be exact and explainable.** They will be shown in compliance checks. Anyone must be able to recompute a number by hand (`gpm x minutes = gallons`) and get the same result.
- **The app must keep working when the connection drops** for 5 to 20 minutes, and sync by itself afterwards.

### Out of scope (confirmed)

Automatic valve control, sensors or flow-meter integration, payments, fertilizer and pest tracking, auditor role, non-English languages, correcting past log entries (kept open, see section 12).

### Decisions already made

| Topic | Decision |
| --- | --- |
| Users | One owner and up to 2 workers per farm. No auditor. |
| Usage | `rate x minutes run`. The farmer taps start/stop, or logs a run afterwards. Optional second confirmation: the farmer reports how much left the reservoir. |
| Hierarchy | Farm, Sector, Line. One line can serve several sectors. A line draws from exactly one reservoir. |
| Reservoirs | The user creates any number and assigns lines to them. The user updates the level. |
| Config edits | Versioned. History is never overwritten. |
| Past log entries | Not editable for now. Feature kept open. |
| Crop need | ET-based (crop type, growth stage, evapotranspiration). Fallback: farmer-set target minus rain. |
| Units | Imperial and metric, acre and hectare. Chosen per farm, and any single input or output can be toggled locally. |
| Edit conflicts | Latest edit wins. The ignored edit raises a warning (what, where) with a button to apply it again. |
| Offline | Everything works offline: logging, viewing the plan, editing configuration, reminders. |
| Sync status | Visible to the user (for example "3 changes waiting to upload"). |
| Reminders | PWA notifications for now. The platform may change if notifications prove unreliable. |
| Reports | PDF. Exact layout open until field testing. |
| Language and users | English only. Small to medium farms. |
| Hosting | North American servers. Details open. |
| Weather source | Open. A swappable adapter, default Open-Meteo. |

## 2. Gaps found while planning, and how this plan handles them

These were not in the original brief. Each has a default, and all of them (G1 to G12) are confirmed.

| # | Gap | Proposed default |
| --- | --- | --- |
| G1 | **A line serves several sectors, so whose water is it?** A run on Line 3 must be split between its sectors for per-sector totals and planning. | Each line-to-sector link has a **share (%)**, default is an even split by sector area. Shares sum to 100 per line. Versioned like all config. The run stores the shares it used. |
| G2 | **Forecasts do not reach 30 days.** Free weather APIs forecast about 16 days. | Days 1 to 16 use the forecast. Days 17 to 30 use the **historical average** for that location and date. The plan marks each day as "forecast" or "typical" so the farmer knows how firm it is. |
| G3 | **Offline reminders are not reliable on a plain PWA.** Web push needs a server and a connection. The browser API for scheduling a local notification offline is experimental and not shippable. On iOS, push only works after the app is added to the home screen. | Three layers: server-scheduled push (arrives when the phone is back online), a local scheduler while the app is open, and an in-app "due now" banner on open. Week 1 spike tests iOS and Android. Escape hatch: wrap the same app with Capacitor, which has reliable local notifications. |
| G4 | **Clocks on phones can be wrong.** Start/stop times and "latest wins" depend on them. | Store device time and server-received time. If they differ by more than 2 minutes, flag the entry. Use a hybrid logical clock for ordering edits. |
| G5 | **A run in progress when the app is closed or the phone dies.** | The running timer lives in local storage as a start timestamp, not as a counting number. On reopen: "Line 3 has been running since 6:12. Still running?" |
| G6 | **Two workers start the same line.** Overlapping runs would double count. | Warn when a run overlaps another run on the same line. Both are kept, the overlap is marked, and the owner resolves it. |
| G7 | **Flow limit.** The brief says the limit comes from tool capacity, and the app must ask for it. | Each reservoir (water source) has a **max outflow rate**, required at setup. The app warns when lines running together exceed it, and the planner never schedules above it. |
| G8 | **Weather API licensing.** The free tier of some APIs is for non-commercial use only. | Check the terms before the pilot. The adapter pattern lets us switch provider without touching the planner. |
| G9 | **Who can do what.** | Owner: everything. Worker: log runs, update reservoir levels, view plan and alerts. Workers cannot change configuration. Confirm. |
| G10 | **Deleting.** Compliance needs history. | Nothing is hard-deleted. Sectors, lines and reservoirs are archived. Old logs keep pointing at them. |
| G11 | **Depth vs. volume.** Crop need is a depth (inches or mm). Reservoirs and lines are volumes. | Each sector needs an **area**. Conversion: 1 acre-inch = 27,154.285 US gal. The planner converts depth to volume to run-minutes. |
| G12 | **Farm location and time zone** are needed for weather and for "today". | Asked at setup (map pin or address). Time zone stored on the farm. |

## 3. Core principles

1. **Local first.** The device database is the working copy. The server is the shared copy. The UI never waits for the network.
2. **Append-only records.** Runs, readings and config versions are only ever added.
3. **Snapshot what you used.** Every run stores the rate and shares that applied when it ran, so later config edits never change past totals.
4. **Exact math.** No floating-point money-style errors on water.
5. **Show the working.** Every total in the app and the PDF can show its formula.
6. **Pure planning engine.** The same TypeScript code computes plans on the phone (offline) and on the server (to schedule push).

## 4. Architecture

```
                    +--------------------------------------------+
                    |  PWA (phone first, works on desktop)       |
                    |  React + TypeScript + Vite                 |
                    |  UI  <->  core library (units, planner)    |
                    |            |                                |
                    |   IndexedDB (Dexie)   <- source of truth   |
                    |   outbox of pending changes                |
                    |   Service worker: app shell + sync + push  |
                    +---------------------+----------------------+
                                          | HTTPS, batched, idempotent
                    +---------------------v----------------------+
                    |  Backend (North America region)            |
                    |  Postgres + Auth + row-level security      |
                    |  Sync endpoints  | Scheduler (cron)        |
                    |  Weather fetcher | Web Push sender         |
                    +---------------------+----------------------+
                                          |
                                Weather provider (adapter)
```

### 4.1 Stack and why

| Layer | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript everywhere | One language, shared code between phone and server, easy to hire for. |
| UI | React + Vite + `vite-plugin-pwa` (Workbox) | Large ecosystem, mature PWA tooling. |
| Local DB | IndexedDB through Dexie | Reliable offline storage, simple API, handles schema upgrades. |
| Exact math | `decimal.js` in the app, `NUMERIC` in Postgres | No floating-point drift. |
| Backend (confirmed) | Supabase (managed Postgres, auth, row-level security, functions, cron) in a US or Canadian region | Fastest path to a pilot, standard Postgres underneath so we can move later. All app logic sits behind our own sync API, not the vendor client, to keep that option open. |
| PDF | `pdfmake` or `pdf-lib` in the client | Works offline. A server-side archive and signing step can be added later. |
| Weather | Adapter interface, default Open-Meteo | Gives forecast, history and reference ET (ET0). Swappable (G8). |
| Push | Web Push (VAPID) from the server | Standard. Revisit per G3. |
| Repo | pnpm monorepo: `packages/core`, `apps/web`, `supabase/` | `core` holds units, ID and clock helpers, ET and planner, so it is tested once and used everywhere. |
| CI | GitHub Actions: lint, typecheck, unit tests, offline e2e (Playwright) | The offline behavior is the highest risk, so it is tested on every PR. |

The existing v1 demo (vanilla JS, static JSON) is kept as a reference. Its crop stage data (`data/crops.json`) seeds the v2 crop catalog.

### 4.2 Built for resale

- **Multi-tenant from day one.** Every table has `farm_id`. Row-level security allows access only to the user's farms. The one-owner, two-worker limit is a plan setting, not hard-coded.
- **Versioned everywhere.** Database migrations, IndexedDB schema, event schema (`schema_version` on every record), PDF template.
- **Plans and limits as data.** A `plan` table (worker limit, farms per account) so pricing tiers need no rewrite.
- **Provider adapters** for weather, push and PDF archive.
- **Observability.** Error tracking, sync health metrics, structured logs.
- **Backups and export.** Nightly backups, and a "download all my data" option (also needed for trust and for G-privacy later).

## 5. Data model

All IDs are UUIDv7 created on the device, so records can be made offline and never collide.

### 5.1 Configuration (versioned)

Each editable entity has a stable `entity_id` and a list of immutable **versions**. The current one is the latest. Each version stores `effective_from`, `edited_by`, `edited_at` (hybrid logical clock), `base_version` (what the editor was looking at), and the changed fields.

| Entity | Fields |
| --- | --- |
| Farm | name, latitude, longitude, time zone, preferred units (volume, rate, area, depth), report settings |
| Sector | name, area (value, unit), crop, planting date, fallback weekly target depth, soil type (optional), archived flag |
| Line | name, rate (value, unit, such as gal/min), irrigation system type (efficiency), reservoir, archived flag |
| Line-Sector link | line, sector, share % |
| Reservoir | name, capacity (value, unit), max outflow rate, archived flag |
| Crop catalog (global, read-only) | crop, growth stages (from planting date or GDD), crop coefficient (Kc) per stage |
| Membership | user, farm, role (owner or worker) |

### 5.2 Records (append-only)

| Record | Fields |
| --- | --- |
| Run | id, line, started_at, ended_at (UTC, whole seconds), source (`timer` or `manual`), snapshot: rate value + unit, line-sector shares, computed volume, entered_by, device, device time and server time, flags (overlap, clock skew, resumed after restart) |
| Reservoir reading | reservoir, kind (`level`, `refill`, `withdrawal_confirmation`), amount, at, entered_by |
| Weather snapshot | location, fetched_at, daily forecast and history rows, ET0, provider |
| Plan | generated_at, inputs (config versions and weather snapshot used), daily items per line |
| Reminder | plan item, due time, state (pending, shown, done, dismissed) |
| Superseded edit | the ignored version, the winning version, who, when, state (open, re-applied, dismissed) |

## 6. Precision rules

These are written down because the numbers will be shown in compliance checks.

1. **Store what the user typed**, with its unit (for example `12.5 gal/min`). That is the legal number.
2. **Canonical units for math:** volume in liters, rate in liters per minute, area in square meters, time in whole seconds, using exact conversion factors (1 US gal = 3.785411784 L exactly; 1 acre = 4046.8564224 m2 exactly). Values are decimals, never floats.
3. **Run volume** = `rate x seconds / 60`, computed in the user's own unit first (`gpm x minutes`), so a hand calculation always matches.
4. **No rounding in storage or in sums.** Rounding happens only when displaying, half-up, to a fixed number of places per unit. Totals are summed from unrounded values, and reports state "values rounded for display" so rows may differ from a total by a rounding step.
5. **Unit toggles are display-only.** Switching a field from gallons to liters never changes the stored value.
6. **Time:** stored in UTC, shown in the farm's time zone. Run duration is end minus start, in whole seconds.
7. **Testing:** golden test cases computed by hand, property tests (convert and convert back gives the same value), and a "recompute from raw records" check that must equal the stored totals.

## 7. Offline and sync

### 7.1 What happens in a 5 to 20 minute drop

- Every action writes to IndexedDB first, plus a row in the **outbox**. The UI updates immediately.
- The app shell, the last forecast, and the current plan are cached, so all screens open.
- A banner shows state: `Online`, `Offline: working locally`, `Syncing`, `3 changes waiting`.
- When the connection returns (or the app opens), the outbox is sent in batches, oldest first, with retry and backoff. Each operation has its own ID, so the server ignores duplicates (safe to retry).
- Then the device pulls everything changed since its last cursor.

### 7.2 Rules by data type

| Data | Rule |
| --- | --- |
| Runs, readings | Append-only, never conflict. Overlaps and clock skew are flagged, not blocked (G4, G6). |
| Configuration | Latest edit wins (by hybrid logical clock). If the server already has a version newer than the editor's `base_version`, the incoming edit loses and is stored as a **superseded edit**. |
| Superseded edit | The losing user sees: "Your change to Line 3 rate (12 to 14 gal/min, made 2:05 PM) was not applied because Maria changed it at 2:09 PM. [Apply mine again] [Keep current]". Re-applying creates a new version. |
| Plans, reminders | Derived data. Recomputed on each device from synced inputs. |

### 7.3 Simple edge cases to test

- Start a run offline, stop it online, and the reverse.
- App killed during a run (G5).
- Two devices edit the same line offline.
- Phone clock 10 minutes wrong.
- Outbox sent twice (duplicate delivery).
- Connection drops in the middle of a batch.
- Schema upgrade while changes are waiting in the outbox.

## 8. Features and screens (mobile first)

Layout: bottom tab bar on phones, side rail on desktop. Large tap targets and high contrast for use outdoors.

1. **Today**: due and overdue irrigation, running lines with live timers, reservoir levels, alerts. One-tap Start/Stop per line.
2. **Log**: start/stop timer, or add a past run (line, date, start, duration or stop). Optional "water taken from reservoir" confirmation.
3. **Plan**: 30-day calendar and list by sector and line: where, when, how many minutes, how much water, and why (rain expected, crop stage). Days are marked forecast or typical (G2).
4. **Farm setup**: add, rename, archive sectors, lines, reservoirs. Set rates, areas, capacities, max outflow. A setup wizard walks a new farm through it. All edits create versions with a visible history.
5. **Reservoirs**: current estimated level, capacity, projected days of water left, refill entry, reading entry.
6. **Reports**: pick a date range, see totals per line, sector, reservoir, export PDF (layout open). Every total can expand to show its runs and formula.
7. **Alerts**: reminders, low reservoir, flow limit exceeded, overlap, clock skew, superseded edits.
8. **Settings**: units (farm default plus per-field toggles), team (invite up to 2 workers), notifications, data export.

Alert wording is plain: "Irrigate Line 3 (North Pivot, East Block) today at 6:00 AM for 45 minutes, about 2,700 gal. Little rain expected."

## 9. Planning engine (30 days)

Runs on device, from cached data. Steps for each sector and each day:

1. **Weather input.** ET0 and rain from the forecast for days 1 to 16, historical average for days 17 to 30 (G2).
2. **Crop need.** `ETc = ET0 x Kc(stage)`. The stage comes from planting date or GDD. Fallback when ET or crop data is missing: weekly target depth set by the farmer, spread over the days.
3. **Water balance.** `need = ETc - effective rain - carry-over from recent irrigation`, using past runs (volume divided by sector area gives depth applied). Effective rain uses a simple rule (a minimum threshold, and a cap) kept in editable settings, not code.
4. **Efficiency.** Divide by the system efficiency of the line type (pivot, drip, and so on).
5. **Convert depth to volume** (G11) and split across lines by the shares (G1).
6. **Convert volume to minutes** = `volume / line rate`.
7. **Check limits.** Reservoir capacity and expected refills, and max outflow of the source (G7). Lines in the same reservoir are staggered, never over the flow limit. If the reservoir cannot cover the need, the plan says so with the shortfall instead of hiding it.
8. **Output** daily items with the reason attached ("Rain 0.6 in expected Thursday, skipped").

Rules and thresholds live in a settings file, so agronomy changes do not need code changes. The v1 rules (skip irrigation at 0.5 in rain, cap one application at 1.5 in) become starting defaults. A plan always stores the inputs it used, so it can be explained later.

Validation: compare the output with a hand-built agronomist example for one potato and one corn sector before the pilot.

## 10. Roles and security

- Auth by email magic link (no passwords to reset on a field phone). Session survives offline.
- Row-level security on every table, by farm membership and role.
- All traffic over HTTPS. Data encrypted at rest by the host.
- Only the owner can invite workers (limit 2 at the plan level).
- Local data on the device is not encrypted beyond what the OS provides. Documented as a known limit.

## 11. Development cycle

### 11.1 How we work

- Small vertical slices (a feature from UI to database), each ending in something usable on a phone.
- Short-lived branches, a pull request per slice, CI must pass (lint, types, unit tests, offline e2e).
- Preview deploy per PR for phone testing.
- A weekly demo, with a short list of what moved, what is blocked, and what scope is at risk.
- Feature flags for anything unfinished.
- Spikes are time-boxed (2 days) and end with a written decision.
- Repo rules carried over from v1: everything stays local, no pushing or deploying until you say so, and every commit needs your explicit approval first.

### 11.2 Team (5 developers) and schedule (8 weeks)

With 5 people the work can run in parallel, but only if the shared contracts are fixed early. The first 3 days of week 1 go to agreeing the data model (section 5), the `core` library API and the sync API. After that, each stream works against those contracts with mocks.

| Stream | Owner | Scope |
| --- | --- | --- |
| A. Core and math | Dev 1 | `packages/core`: units, exact math, golden tests, ID and clock helpers, then the planning engine (section 9). Also owns the agronomy validation. |
| B. Sync and backend | Dev 2 | Supabase schema, row-level security, auth and roles, sync endpoints, outbox and pull on the device, conflict warnings, backups. |
| C. Field workflow UI | Dev 3 | Today, Log, Reservoirs screens, running timers, overlap and clock flags, sync status banner. |
| D. Setup, plan and alerts UI | Dev 4 | Farm setup and wizard, config versioning UI and history, Plan screen, alert center, settings and unit toggles. |
| E. Platform and quality | Dev 5 | Monorepo, CI, PWA shell and service worker, notification spike and reminders, weather adapter and fetcher, PDF reports, offline e2e test suite, accessibility and outdoor usability. |

Rules for working in parallel:
- Only Dev 1 changes `packages/core` public APIs. Others request changes through a pull request to it.
- Schema changes go through one migration folder, reviewed by Dev 2 and Dev 1.
- Every pull request needs one review from another stream, and any change touching money-style math (units, volume, rounding) needs Dev 1.
- A 15-minute daily sync, a weekly demo, and one integration day at the end of weeks 2, 4 and 6 where all streams merge onto a working build on a real phone.
- Dev 5 owns the offline simulation tests from week 1, so every other stream is tested against dropped connections from the start.

Dates are relative to the start. The weekly plan below shows the focus of the whole team, with the streams above working in parallel.

| Week | Focus | Exit criteria |
| --- | --- | --- |
| 0 to 1 | **Foundations and spikes.** Monorepo, CI, PWA shell. Spikes: push notifications on iOS and Android (G3), weather adapter and 30-day data (G2, G8), sync prototype. | Decision notes written. App installs on a phone and opens offline. |
| 1 to 2 | **Core library and farm setup.** Units and exact math with golden tests. Dexie schema. Farm, sector, line, reservoir CRUD with versioning and setup wizard. | Hand-checked numbers pass. A farm can be set up fully offline. |
| 3 to 4 | **Usage logging and reservoirs.** Timer and manual runs, snapshots, share split, reservoir levels, refills, withdrawal confirmation, overlap and clock flags. Auth, roles, backend, sync (outbox, pull, idempotency). | Two phones stay consistent through a 20-minute offline test. |
| 5 to 6 | **Planning and alerts.** Weather fetch and cache, ET and water balance, 30-day plan, limits, reminders and notifications, alert center, superseded-edit warnings. | Plan matches the hand-built example. Reminders arrive in the chosen platform. |
| 7 | **Reports and calibration.** PDF export (first version), formula drill-down, calibration hint when reservoir readings differ from computed use. Accessibility and outdoor usability pass. | PDF totals equal the app totals to the last digit. |
| 8 | **Pilot hardening.** Onboarding, error tracking, backups, data export, load and sync stress test, pilot farm setup, field-test checklist. | Pilot farm uses it for real. |

### 11.3 Scope cut order if time runs short

With 5 developers this list is a safety net, not the expected path. If a stream slips by more than a week, cut from the bottom first:

1. Calibration hint (keep the raw "withdrawal confirmation" entry).
2. Per-field local unit toggles (keep the farm-wide unit setting).
3. Setup wizard (keep plain forms).
4. ET model (ship the fallback "target minus rain" planner first, add ET after).
5. Desktop side rail (the phone layout works on desktop).

Never cut: exact math, versioned config, offline logging and sync, the snapshot on each run, PDF export.

## 12. Open items (not decided yet)

| Item | When to decide |
| --- | --- |
| Compliance report layout and any regulator-specific fields | After field testing, with the pilot farm |
| Correcting past log entries (likely as visible amendments that keep the original) | After the pilot |
| Weather provider and cost | Week 1 spike, final before pilot |
| Notification platform (PWA push or native wrapper) | Week 1 spike, revisit at week 6 |
| Data residency details (US vs Canada, privacy terms) | Before the first outside customer |
| Custom domain, app name and store listing | Before the pilot goes beyond one farm |
| Pricing tiers | After the pilot |

## 13. Risks

| Risk | Likelihood | Impact | Response |
| --- | --- | --- | --- |
| Offline reminders unreliable on iOS (G3) | High | High | Week 1 spike, three-layer approach, Capacitor fallback. |
| Two months is tight for sync, planner and PDF together | Medium (with 5 developers) | High | Parallel streams (11.2), cut list (11.3), ship the simple planner first, weekly scope check. |
| Five people working in parallel drift apart (mismatched contracts, merge pain) | Medium | Medium | Contracts fixed in week 1, single owner of `core` APIs, integration days at weeks 2, 4 and 6. |
| Planning numbers do not match agronomic reality | Medium | High | Validate with an agronomist or the pilot farmer. Show reasons for every item. Make rules editable. |
| Sync bugs lose or duplicate data | Medium | High | Idempotent operations, append-only records, an offline simulation test suite, "recompute from raw" check. |
| Farmers find setup too long | Medium | Medium | Wizard, sensible defaults, test setup on a real phone with a real farmer in week 2. |
| Weather API cost or terms change | Medium | Medium | Adapter pattern, cache aggressively. |
| Clock errors on phones | Medium | Medium | Dual timestamps and flags (G4). |

## 14. Expected outcomes (measurable)

**Accuracy and trust**
- Every run's volume equals `rate x minutes` exactly when checked by hand, across the golden test set (100% pass).
- Summing raw records reproduces every stored and displayed total exactly.
- Past totals never change after a config edit (tested).

**Offline**
- Zero lost or duplicated records across a scripted 5, 10 and 20 minute offline test, on two devices.
- After reconnecting, pending changes upload within 30 seconds.
- Every screen opens offline and every action works offline.

**Usability**
- Starting or stopping a run takes at most 2 taps from the Today screen.
- Logging a past run takes under 30 seconds.
- A new farm with 3 sectors, 5 lines and 2 reservoirs is set up in under 15 minutes without help.
- Passes a check for readability outdoors (contrast, tap-target size).

**Planning**
- A 30-day plan appears in under 2 seconds, offline, from cached data.
- Each plan item states where, when, how long, how much water, and why.
- No plan item exceeds the source flow limit or schedules water the reservoir does not have without showing a shortfall warning.

**Product**
- Lighthouse PWA checks pass and the app installs on iOS and Android.
- PDF report for a chosen date range, matching on-screen totals.
- A pilot farm (owner plus up to 2 workers) uses it for real irrigation for at least 2 weeks.
- Adding a second farm needs no code changes (multi-tenant check).

## 15. Next steps

1. Assign the five streams in 11.2 to named developers.
2. Days 1 to 3: agree the data model, the `core` API and the sync API, and write them down in the repo.
3. Set up the monorepo, CI and the Supabase project (US or Canadian region).
4. Run the week 1 spikes, starting with notifications.
5. Line up a pilot farmer and an agronomy reviewer for the week 2 setup test and the week 5 to 6 plan check.
