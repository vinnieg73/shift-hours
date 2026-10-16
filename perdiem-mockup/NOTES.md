# Shift Hours + GSA per diem: feasibility (2026-10-16)

Status: feasibility done; clickable mockup built 2026-10-16 (not shipped, live site untouched). Thread "GSA per diem in Shift Hours".

## Findings
- Data sources: GSA Per Diem API (api.gsa.gov/travel/perdiem/v2, free api.data.gov key; routes by city/state, ZIP, state, year) and GSA's yearly downloadable rate files on gsa.gov. Rates also in the Federal Register notice.
- api.gsa.gov, gsa.gov and open.gsa.gov are blocked from the cloud container, so CORS and DEMO_KEY limits were NOT tested. Reported limits: personal key ~1,000 requests/hour; DEMO_KEY is tiny and shared. A key in browser JS on a public site is visible to anyone.
- FY2027 (Oct 1 2026 to Sep 30 2027): standard CONUS $113 lodging + $68 M&IE = $181/day; ~295 non-standard areas with higher (sometimes monthly/seasonal) lodging caps; M&IE tiers $68 to $92. FY2026 was $110 + $68.
- Math: per night, lodging cap for that location and month (actual cost up to the cap). M&IE full on middle days, 75% on first and last day. Optional deductions for provided meals (breakfast/lunch/dinner split per tier). Trips crossing Oct 1 switch to new-year rates. Same-day trips: FTR gives no per diem at 12h or less, 75% M&IE over 12h (agency rules vary).
- Scope: GSA covers CONUS (48 states + DC). Alaska, Hawaii, territories (DoD) and foreign (State Dept) are separate systems; skip for v1.

## Recommendation
Bundle the current fiscal year's rates as a small JSON in the repo (no key, no live calls, works offline), picked by State then City/County, with standard-rate fallback. Refresh once a year (Aug/Sep). Optional later: ZIP lookup via a lazy-loaded ZIP map.
UI: an "Hours | Per diem" switch at the top; same compact dark glass card; big number = trip total $, with lodging / meals / travel-day lines and a per-night list like the week rows.

## Next steps
- Vinnie decides: build or mockup first; CONUS only OK; ZIP lookup wanted?
- To build: fetch the official FY2027 rate file (needs a host that can reach gsa.gov, e.g. his Mac), convert to JSON, add view to index.html in vinnieg73/shift-hours (public; don't change visibility). No backdrop-filter.

## Mockup (2026-10-16)
- Artifact: https://claude.ai/artifact/9WRqFapULXwv6DMBYMgoXE (source mockup/shift-hours-per-diem.html = live index.html + additions).
- Additions are separate files in mockup/: viewbar.html (Hours | Per diem switch under header), pd.html (per diem view), pd.css, pd.js. Rates in pd.js are SAMPLE numbers, not GSA's.
- Layout: Trip card (state + city, leave/return dates, rate line), result card ($ total, Copy, Hotel/Meals/Travel days/Meals given breakdown, badges), Day by day list with B/L/D tap chips for provided meals, Hotel card (Max rate / What I paid) + Rates disclosure with "How per diem works".
- Screens: mockup/side-by-side.png (phone hours vs per diem), desk-perdiem.png.
- v2 (2026-10-16 05:50Z) after Vinnie's feedback "type the city you're going to and it shows lodging and M&IE rates" (like gsa.gov/travel/plan-book/per-diem-rates): per diem view now leads with a city/state/ZIP search box with suggestions; rates card shows place + rate area/counties, lodging this month and M&IE per day, lodging by month (Oct-Sep grid), M&IE breakdown (B/L/D/incidentals, full day, first & last day 75%). Unlisted "City, ST" gets standard rate. Trip total moved below as optional.
- Real build needs city->rate-area matching for every city: GSA API does this per query; bundled data needs city/county/ZIP lists (GSA ZIP file). Decide at build time.
- v3: removed the "Try" city buttons (Vinnie: not needed). He said v2 is "closer"; waiting on further notes or go-ahead to build.

## Reliability plan (2026-10-16, Vinnie: "needs to work reliably for every city")
- GSA publishes on gsa.gov/travel/plan-a-trip/per-diem-rates/per-diem-files: the FY rates XLSX and a "ZIP code file for developers" (every ZIP -> its rate area / Destination ID, ~3 MB XLSX).
- Lookup: ZIP -> GSA ZIP file (official). City -> its ZIPs (Census/USPS city-ZIP list) -> GSA ZIP file. City spanning two rate areas -> show both and let the user pick (gsa.gov does the same). Anything not in a special area -> standard rate.
- Check: script runs every city/ZIP through the lookup; spot-check a few hundred against the GSA API.
- Cloud container can't reach gsa.gov, census.gov or api.data.gov (only GitHub/npm/PyPI). Downloads must run on the Mac via Remote Control, then commit the data to vinnieg73/shift-hours.
- Yearly refresh when GSA posts new files (Aug/Sep).
