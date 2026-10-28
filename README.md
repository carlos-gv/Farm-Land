# FarmLand Morning Advisory (demo)

A static, installable web app that gives growers a plain-language irrigation briefing per field, with a scenario simulator for customer demos. No backend, no sensors, no API keys.

## Run locally

```
python3 -m http.server 8000
```

Open http://localhost:8000.

## How it works

- `index.html`, `styles.css`, `app.js`: the app (vanilla JS, no build step). Leaflet is loaded from a CDN for the map.
- `data/`: all content as JSON, and the source of truth.
  - `crops.json`: growth stages by GDD, moisture sensitivity, water factor
  - `scenarios.json`: weather scenarios (rain, ET deficit, temperature, 3-day forecast)
  - `fields.json`: fields, current GDD, starting scenario, map outlines
  - `rules.json`: decision thresholds
- `advise()` in `app.js` decides per field: skip irrigation if 24h rain is at or above the skip threshold; otherwise apply the ET deficit times the stage's water factor, capped at the maximum.
- `manifest.webmanifest` and `sw.js` make it installable and available offline (network-first, cache fallback).

## Rules (`data/rules.json`)

| Key | Default |
| --- | --- |
| `rain_skip_threshold_in` | 0.5 |
| `high_urgency_deficit_in` | 1.0 |
| `max_application_in` | 1.5 |

## Demo flow

1. Open the Morning Advisory tab; fields are sorted by urgency.
2. On a card, use the Demo Scenario Simulator dropdown to switch between heatwave, heavy rain and normal conditions. The headline and amount update live.
3. Drag the crop progress slider to move a field between growth stages.
4. Switch to Farm Map to see field outlines and pins coloured by urgency.

## Notes

- All field data is made up for demonstration and labelled "Demo data" in the app.
- Map tiles (Esri World Imagery) and the field photo need an internet connection.
- Scenario and GDD changes are saved in the browser's localStorage.
