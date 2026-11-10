# Shift Hours

A small work-hours tool that runs in the browser: **https://shifthours.app**

No account, no server. Everything you type stays in your own browser.

## What it does

- **Hours.** Type a start and end time (`845`, `8:45` or `8.75` all work) and get the shift in decimal hours and h:mm. Breaks, overnight shifts, 12 or 24-hour clocks, and time-clock rounding (15, 6 or 5 minutes).
- **Punch clock.** Punch in and the end time follows the clock until you punch out.
- **Weekly timecard.** Monday to Sunday with a week total. "Add to day" files the shift you just worked.
- **Per diem.** Lodging and meal (M&IE) rates for any U.S. city, state or ZIP: GSA rates for the 48 states and DC, Defense Department rates for Alaska, Hawaii and the territories. Optional trip total with meals given taken off.
- **Months.** Working hours in each month at 8 per weekday, with federal holidays marked.
- **Your data.** Save a backup file, restore it, or move the week to another device with a link or QR code.
- **Offline.** After the first visit the page opens with no signal, and it can be added to a phone's home screen.

## How it is built

One page, no build step.

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and scripts |
| `sw.js` | Offline cache |
| `qr.js` | QR code library (qrcode-generator, MIT), loaded only when you press Move |
| `data/perdiem-fy2027.json` | Per diem rates and place names, loaded only when the Per diem tab opens |
| `scripts/` | Yearly rebuild and checks for the per diem data |
| `tests/` | Page tests (Playwright) |
| `HANDOFF.md` | Working notes: how each part works, decisions, gotchas |

## Run it locally

```sh
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

## Tests

Needs Node, Playwright with Chromium, and Python 3.

```sh
tests/run.sh            # everything: phone and desktop, light and dark
tests/run.sh smoke      # one test: smoke backup punch oconus audit review months
```

## Deploy

GitHub Pages serves the `main` branch at shifthours.app. Pushing to `main` is the deploy.

## Data sources

Per diem rates: [GSA per diem files](https://www.gsa.gov/travel/plan-a-trip/per-diem-rates) and the Defense Travel Management Office's OCONUS file. Place names: [GeoNames](https://www.geonames.org/) (CC BY 4.0) and the U.S. Census Bureau. Rates are for reference; check your employer's policy.
