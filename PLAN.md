# FarmLand demo: new architecture (GitHub Pages, all free)

## Context
Replace Google Sheets + Glide with a zero-cost static PWA hosted on GitHub Pages. Goal unchanged: a 2-minute demo where a grower sees a "Morning Advisory" card and flips weather scenarios live. The downloaded `Farm_Land_Prototype_DB.xlsx` is the data source.

## What the xlsx contains
- `Crop_Phenology`: Russet Potato (POT-01), 4 stages by GDD band (0-300 Vegetative/LOW, 301-600 Tuber Initiation/MODERATE, 601-1300 Tuber Bulking/CRITICAL RISK, 1301-2000 Maturation/LOW), plus a stage description.
- `Weather_Scenarios`: SCEN-A Heatwave (rain 0.0, ET deficit 1.20, 92F), SCEN-B Heavy Rain (1.5, 0.10, 70F), SCEN-C Normal (0.45 rain, 78F; ET cell appears blank in the export).
- `Fields_Overview`: FLD-02 North Pivot, planted 2026-05-01, 120 acres, 43.6150,-116.2023, GDD 750, active SCEN-A. The derived columns (stage, risk, header, water, reasoning) were exported as "(Formula)" placeholders, so the real formulas are lost and the decision logic must be redefined.

## Architecture
```
repo/
  index.html, app.js, styles.css      vanilla JS, no build step
  manifest.webmanifest, sw.js          PWA install + offline
  data/crops.json, scenarios.json, fields.json   converted from the xlsx
  scripts/xlsx_to_json.py              one-off converter (optional)
```
- Hosting: GitHub Pages (free; repo must be public on a free account).
- Data: static JSON, fetched at load. Scenario choice lives in memory/localStorage, no backend.
- Logic in `app.js`, a pure function `advise(field, crop, scenario)`:
  1. stage = crop row where Min_GDD <= field GDD <= Max_GDD
  2. if rain24h >= ~0.5 in then "DO NOT IRRIGATE, rain expected" (low risk)
  3. else water = ET deficit, urgency from stage sensitivity (CRITICAL RISK stage + deficit >= 1.0 = "IRRIGATE TODAY, HIGH URGENCY")
  4. reasoning string templated from stage description + deficit
- UI: card list sorted by urgency, scenario dropdown on the card, "Agronomic Reasoning" expander, bottom tabs (Advisory / Farm Map).
- Map: Leaflet (CDN) with Esri World Imagery satellite tiles (free, no API key), pin per field, pinch-zoom built in.
- Bonus: GDD slider in the demo panel to show stage changes live.

## Data additions (beyond the xlsx)
- `fields.json`: add 3 more fields so the list sorting and every card state appear in one demo.
  - FLD-01 South 40 (Russet Potato, GDD ~1450, Maturation, low risk)
  - FLD-03 East Block (Russet Potato, GDD ~450, Tuber Initiation, moderate)
  - FLD-04 West Quarter (Sweet Corn or Alfalfa, to show multi-crop)
  - Per field: boundary polygon (4-5 lat/long points, near Boise ID, to draw on the map), soil type, irrigation type (pivot/drip), last irrigation date, and a photo URL.
- `crops.json`: add a second crop with its own stages. Add per stage: `water_factor` (multiplier on ET deficit), `stress_days_tolerance` (e.g. 48h for Tuber Bulking), and a plain-language `advice_tip`.
- `scenarios.json`: fill SCEN-C ET deficit (0.45), and add a 3-day forecast array per scenario (rain/temp per day) for the reasoning text and a mini forecast strip.
- `rules.json` (the lost formulas, now explicit and editable):
  - `rain_skip_threshold_in`: 0.5
  - `high_urgency_deficit_in`: 1.0
  - `max_application_in`: 1.5
  - risk to color/label mapping (LOW, MODERATE, CRITICAL RISK)
- Estimated values only: label all data "demo data" in the UI so it is not mistaken for real field readings.
- Confirmed by the user: skip irrigation at >= 0.5 in rain; recommended water = ET deficit, capped at 1.5 in.

## Verification
- Serve locally (`python3 -m http.server`), check SCEN-A/B/C produce the expected headlines.
- Lighthouse PWA check; install to phone home screen from the Pages URL.
- Test on phone over mobile data (map tiles, offline reload).

## Working rules
- Everything stays local for now: no pushing, no GitHub repo creation, no Pages deployment until the user says so.
- Every commit needs the user's explicit approval before it is made. Show what will be committed and the message, then wait.
