# HANDOFF: Shift Hours

Last updated: 2026-10-16 (GSA per diem view)

## What it is

A single-file shift hours calculator (`index.html`, no build step) served by GitHub Pages at shifthours.app (`CNAME`). State lives in the visitor's `localStorage` under `shift-hours-v1`.

It also has a **Per diem** view (GSA lodging and M&IE rates for any U.S. city), switched with the Hours | Per diem control under the header. Its rate data is `data/perdiem-fy2027.json`, which is fetched only when that view opens.

## Status

- Dark, compact Liquid Glass layout. Decimal hours are the main result, with h:mm underneath.
- New visitors default to no break. There is no floating results bar on phones.
- **Decimal input:** a dot or comma in a time field means decimal hours. `9.5` is 9:30, `9.25` is 9:15, and `17.75` is 17:45 in 24-hour mode. A colon still means h:mm (`9:30`), and plain digits still work (`930`). Every decimal read shows a badge such as "Read 9.30 as 9:18", so a mistaken entry is visible.
- **Totals never include a guess.** In the calculator, a bad break (e.g. "7.5" minutes) or a start-and-end break with only one time pauses the total: it shows a dash, Copy is off, and a badge says why ("No total yet: add the end time of break 1"). Equal start and end show 0.00 with a note.
- **Weekly timesheet:** a card under the calculator with Mon to Sun rows (start, end, break minutes). Each day shows decimal hours with h:mm under it. The week total is the sum of minutes, shown as decimal hours with h:mm and a day count, and it has a Copy button. It uses the same clock format and rounding settings as the calculator. A day with something typed but missing a time says what is missing; a day with an invalid field shows field-named errors after the field loses focus. Either kind is left out of the total, the total dims, a red line names the days not counted, and week Copy stays off until they are finished or cleared. Zero-hour days are not counted as days. Clear week needs two taps. On phones (≤640px), each day takes two lines and AM/PM becomes one chip that flips when tapped.

- **Multiple tabs:** a tab writes only when its state differs from what it last read or wrote, and it takes other tabs' saves via the `storage` event (also re-read on becoming visible and on back/forward-cache restore). Unsaved edits in the current tab win. A save without a `week` key (from an old copy of the page) does not wipe the week rows.
- **24:00:** valid only in 24-hour mode. Switching to 12-hour leaves `2400` as typed and flags it; switching back restores it.
- Audit of 2026-10-11 (`fix/audit-2026-10-11`): all 3 Mediums fixed; Lows fixed except 15 and 19 (see open decisions), and 4 is only labelled.
- **Visitor counter (2026-10-11):** Cloudflare Web Analytics beacon at the end of `index.html`. It is cookieless. Set up in Cloudflare under Observability > Web Analytics with "Enable with JS Snippet installation". DNS is on Cloudflare but not proxied (A records point straight at GitHub Pages), so automatic injection does not apply and the manual snippet is needed.
- **Space pass (2026-10-12):** a 10-lead swarm cut wasted space. Phone page went from about 1950px to 1160px; the result shows right under Start/End. Changes: header on one row on phones (subtitle and the word "Calculator" hidden there); typing hint shows only while a time box is focused (also in How it works); on phones the order is Start/End card, result card, then a Breaks + Settings card (desktop keeps them on the left); stats box removed, h:mm line under the decimal with total minutes and break minutes; Clear sits beside the result title (old foot strip and its note removed); "No breaks deducted" placeholder removed; Settings is a `<details id="settingsDisc">` row showing the current rounding, opened by JS on desktop; "Round breaks too" only shows when there are breaks; week rows are one line per day on phones (AM/PM is a narrow tap-to-flip chip, break word hidden); week total slimmer, week footnote moved into How it works; seg buttons 40px tall on phones; Copy buttons have a larger invisible tap area. The result card is no longer sticky on desktop. Backdrop blur is turned off on all glass cards and pills (the page behind is plain near-black, so it drew nothing visible, and it flickered in Safari while scrolling).
- **Phone spacing touch-up (2026-10-14):** Clear and Clear week are the same 34px pill with a 10px gap under the card header, so they no longer touch the box below. The h:mm line uses the decimal box's insets (14px left, 12px right), so both numbers and both Copy buttons line up (all widths). The divider line between Breaks and the Settings box is gone on phones, and the Breaks label is centred on its switch. CSS block "phone spacing touch-up" sits just above the no-blur rules.

- **Per diem view (2026-10-16):** type a city, state or ZIP (suggestions as you type) to see the place, its GSA rate area and counties, lodging this month, M&IE per day, lodging for each month Oct–Sep, and the M&IE breakdown (breakfast, lunch, dinner, incidentals, full day, first and last day at 75%). An optional trip total sits below (dates, per-night lodging by month, 75% travel days, tap B/L/D to take off a meal you were given, Copy). A ZIP gives GSA's exact answer. A city or ZIP that sits in more than one rate area lists each choice (area, counties, lodging · M&IE) and the full rates appear once one is picked. Places not in a listed area get the standard rate ($113 / $68 for FY 2027). Alaska, Hawaii, territories and APO/FPO show a note pointing to the Defense Department lookup. Unknown text says "No U.S. place called …" and never falls back to the standard rate. New visitors still land on Hours; the last view is remembered (`shift-hours-view`), and `#perdiem` / `#hours` in the URL pick a view. Per diem state is in `shift-hours-perdiem-v1`, separate from the hours state. The Hours view is unchanged: a fingerprint of all 355 elements under the header and Hours section (position, size, font, colour, text) matched the old page exactly at 402px and 1200px.

## Per diem data

- **Sources** (all public, no keys):
  - GSA per diem files page, gsa.gov/travel/plan-a-trip/per-diem-rates/per-diem-files: the FY rates XLSX (`FY2027_PerDiemRates_Validated090126.xlsx`) and the "ZIP code file for developers" (`FY2027PerDiemZipCode_Validated090126.xlsx`).
  - M&IE tiers from gsa.gov's "M&IE breakdowns" page: $68 = 16/19/28/5, $74 = 18/20/31/5, $80 = 20/22/33/5, $86 = 22/23/36/5, $92 = 23/26/38/5 (in `MIE` in `scripts/build_perdiem.py`). The build fails if GSA uses a tier not in that table.
  - GeoNames US postal codes, download.geonames.org/export/zip/US.zip (CC BY 4.0, credited in "How per diem works").
  - Census 2020: www2.census.gov/geo/docs/reference/codes2020/ `national_county2020.txt`, `national_place_by_county2020.txt`, `national_cousub2020.txt`; and www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/ `tab20_zcta520_county20_natl.txt`, `tab20_zcta520_place20_natl.txt`, `tab20_zcta520_cousub20_natl.txt`.
- **How a lookup works:** ZIP → GSA's ZIP file. Town (Census place, town or township) → the ZIP areas that overlap it, weighted by land; each part goes by its county (GSA sets rates by county), except "City limits of …" areas (Sedona, Santa Monica, Falmouth, Roanoke) and Los Angeles (Edwards AFB), where GSA's ZIP file decides. Areas under 5% of a town's land are dropped as slivers. Named cities in a city-limits area (Cambridge MA, Grapevine TX…) get that area outright. Counties are searchable too ("Queens County, NY"). Post office names that aren't Census places go by their ZIPs. Same-name towns in one state (e.g. "Washington township" in many Indiana counties) are one entry; if they fall in different rate areas, each choice is labelled with its county.
- **Data format** (`data/perdiem-fy2027.json`, 1.2 MB, about 430 KB gzipped): `areas` = [name, state, GSA's county text, M&IE, lodging Oct..Sep], index 0 = standard. `places` = per state, `|`-separated records `Name[~rank][=area | =area:label;area:label]` (no `=` means standard; outside CONUS means Defense Dept.). `zips` = one string of 11-character records: ZIP + place index (4, base 36) + area (2, base 36; `zz` = split ZIP, see `zx`; `yy` = outside CONUS). `zinf` = ZIPs not in GSA's file whose rate comes from same-name or nearest ZIPs.
- **Checks** (2026-10-16): `scripts/check_perdiem.py` runs the page's own lookup code (the `pd-core` block in index.html) over everything: 40,426/40,426 GSA ZIPs match GSA's file exactly (1,839 are split and offer a choice); 41,488/41,488 GeoNames ZIPs resolve (921 outside CONUS, 168 not in GSA's file); 29,547/29,547 GeoNames places and 43,791/43,791 Census places, towns and counties come up as the first suggestion; 829 places offer a choice (271 straddle a county line, 546 are same-name towns, 12 are post office names). `scripts/spotcheck_perdiem.mjs` compares 27 cities against GSA's API (results below in Status of the spot check).

## Yearly per diem refresh (GSA posts the next year's files around August)

1. Make a folder outside the repo's tracked files, e.g. `.perdiem-src/` (ignored by `.gitignore`), with `gsa/`, `geonames/`, `census/` inside.
2. Download the new FY rates XLSX to `gsa/rates.xlsx` and the new ZIP code file to `gsa/zips.xlsx` from the GSA per diem files page. Get GeoNames `US.zip` and unzip `US.txt` into `geonames/`. Put the six Census files above in `census/` (they only change with a new census).
3. Check the M&IE breakdown page still shows the same tiers; update `MIE` in `scripts/build_perdiem.py` if not.
4. `python3 -I scripts/build_perdiem.py --fy 2028 --src .perdiem-src --out data/perdiem-fy2028.json --report .perdiem-src/multi.json` (it fails loudly if GSA changed columns, seasons don't run whole months, or the two GSA files disagree).
5. Change `DATA_URL` in index.html to the new file, and the `FY 2027` placeholder text in the per diem markup.
6. `python3 -I scripts/check_perdiem.py --src .perdiem-src --data data/perdiem-fy2028.json` must print ALL CHECKS PASSED. Then `node scripts/spotcheck_perdiem.mjs index.html data/perdiem-fy2028.json .perdiem-src/api-cache` (DEMO_KEY allows 10 calls an hour; the script waits and caches, so it takes about 3 hours unattended).
7. Delete the old year's JSON once the new one is live.

## Next steps

1. Check visits appear in Cloudflare Web Analytics after deploy.
2. Watch for feedback on the decimal change (see gotchas).
3. Possible: an "Add to week" button that copies the calculator's result into today's row.

## Open decisions

- Whether a dot should stay decimal. The alternative is to read `9.30` as 9:30, which is how dots worked before this change. (Not changed by the audit fixes.)
- Week total vs daily decimals: the total is the sum of minutes, so three 20-minute days show 0.33 each but 1.00 in total. Summing rounded daily decimals instead is a payroll choice, left as is.
- Decimal "Read as" notes show as soon as a field is read, even before the other time is entered. Kept on purpose as typing feedback.
- Decimal entries round to the nearest minute (16.01 is 16:01); the note says "(nearest minute)" when that happens.

## Gotchas

- **Per diem:** GSA's ZIP file puts a whole ZIP in one area, so it sometimes disagrees with GSA's own county rule. Examples: East Falmouth's ZIP 02536 is rated Hyannis (GSA's file), and Edwards AFB's ZIPs are rated Bakersfield, not Los Angeles. The ZIP answer follows GSA's file, because that's what GSA's own site and API return.
- The page's lookup lives between `/* pd-core:start` and `/* pd-core:end */` and must stay DOM-free, because the check scripts pull that block out and run it in Node.
- The search key (`key()` in both the Python build and the page) spells out St/Ste/Ft/Mt. State words are matched before that, or "MT" would become "mount".
- The hours script gives every `.seg` the sliding pill at startup, including the view switch. The per diem script sets its own pill when the view changes.
- The per diem CSS is all scoped to `#pdView`, `.viewbar` or `body[data-view="pd"]`. Keep it that way, because the hours view shares class names like `.stat`, `.k`, `.big` and `.label`.
- After FY 2027 ends (Sep 30, 2027) the view still works but shows a red "FY 2027 rates; newer ones may apply" badge until the data is refreshed.

- **Layout markup (2026-10-12):** `<form id="form">` is now the `.grid` wrapper holding `.col-in` (entry card + options card) and the result section. On phones `.col-in` is `display: contents` and the cards are reordered with `order`. `#dec` stays as a hidden span because the decimal copier reads it; `#mins` and `#brk` live in `.hmline`. The space-pass CSS block sits at the end of the main stylesheet; the week one-line rules include `.card.week` to beat the earlier 640px rules.

- **The decimal change alters old behaviour.** Before, `9.30` meant 9:30. It now means 9:18. The iOS decimal keypad has no colon, so phone users who typed `9.30` for 9:30 now need `930`. The badge and the hint text explain this.
- Saved state from before decimal input has no `week` key. On first load, `normalise()` rewrites its dotted times to colon form (`9.30` becomes `9:30`), so old saves keep their meaning. The rewrite runs only once, because the next save adds `week`.
- `normalise()` rebuilds state from a fixed shape. New stored fields must be added to `DEFAULT` and `normalise()`, or they are wiped on reload.
- If `build()` throws at startup, the saved state is copied to `shift-hours-v1-backup`, the page starts from defaults, and the error is logged. Keep new code defensive.
- `adopt()` replaces `S` with another tab's state and rebuilds. Anything holding a reference to an old `S` object (like the `moved` map of format-switch notes) must be reset there.
- `computeDay()` returns `state`: `empty`, `ok`, `open` (something missing) or `bad`. `renderWeek()` relies on it to decide which days are "not counted".
- The 12/24-hour toggle converts every stored time, including the week rows. Any new time field must be added to that list (with a label, used in the note shown when an invalid entry becomes valid in the other format).
- Test hooks: `window.__hours` exposes `parse`, `computeDay`, `renderWeek` and `normalise`.
- The repo is public, so keep this file about the site only.
