# Pacing Forecaster (GitHub Pages)

A static, browser-only pacing + end-of-day revenue forecaster.

## What it does
- Uses a baked-in day×hour dataset by default (no upload needed)
- Optionally replace the dataset via CSV upload (computed locally in-browser)
- Pick weekday (Mon–Sun) + current hour
- Enter revenue so far (and optionally impressions/clicks/sessions)
- See:
  - Highlighted EOD revenue estimate
  - Range (low–high) based on historical completion percentiles
  - Pacing vs baseline for that weekday/hour
  - Diagnostics (traffic + efficiency deviations)
  - Expected revenue/traffic per hour table (weekday-filtered)

## Expected CSV columns
Case-insensitive:
- `dh.date` (or `date`) — `YYYY-MM-DD`
- `dh.hour` (or `hour`) — 0..23
- `revenue`
- `impressions`
- `clicks`
- `sessions`

Extra columns are ignored.

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages (recommended)
This repo is preconfigured for GitHub Pages when the repository name is **`pacing-forecaster`**.

1. Create a GitHub repo named **`pacing-forecaster`** and push this code to branch `main`.
2. In GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or re-run the workflow). The included workflow builds and deploys automatically.

## Notes
- `vite.config.js` is set with `base: '/pacing-forecaster/'` to match GitHub Pages routing.
- The app runs fully in the browser (no backend).
