# src-dod sources

Fetched 2026-10-17 (~04:11–04:17 UTC) on Vinnie's Mac. travel.dod.mil (Akamai) returns 403 to plain curl; it serves files when the request carries full Chrome headers (UA + sec-ch-ua + Sec-Fetch-*). allowances.state.gov redirects to its homepage unless the request carries an ASP session cookie from a browser visit.

## DoD OCONUS per diem (DTMO)

Page: https://www.travel.dod.mil/Travel-Transportation-Rates/Per-Diem/Per-Diem-Rate-Lookup/
(The old `.../Per-Diem/Per-Diem-Rate-Files/` URL now just shows the generic Per Diem page with no files.)
The page says: "Foreign & Non-foreign OCONUS Rates … Last updated September 25, 2026." The year ZIP holds one file per month; the current one is effective **10/01/2026**.

| File | URL | Last-Modified |
|---|---|---|
| OCONUS-ASCII-2026.zip | https://www.travel.dod.mil/Portals/119/Documents/Allowances/Per_Diem/OCONUS/ASCII/OCONUS-ASCII-2026.zip | Fri, 25 Sep 2026 12:52:04 GMT |
| OCONUS-REL-2026.zip | https://www.travel.dod.mil/Portals/119/Documents/Allowances/Per_Diem/OCONUS/REL/OCONUS-REL-2026.zip | Fri, 25 Sep 2026 12:54:52 GMT |
| Current_OCONUS_Rates.pdf | https://www.travel.dod.mil/Portals/119/Documents/Allowances/Per_Diem/OCONUS/Current_OCONUS_Rates.pdf | Fri, 25 Sep 2026 13:02:54 GMT |

Not downloaded: `OCONUS/PDF-EXCEL/OCONUS-PDF-EXCEL-2026.zip` (7.4 MB, same data as PDF/Excel) and `Foreign_Per_Diem_Rate_Footnotes.pdf` (4.7 MB).

Extracted:
- `10-01-26oconus.txt` (from ASCII zip): current month, all OCONUS locations, foreign **and** non-foreign (Alaska, Hawaii, Guam, Puerto Rico, US Virgin Islands, American Samoa, Northern Marianas, Midway, Wake). There is no separate non-foreign-only file on the page.
- `10-01-26oconusnm.txt` (from ASCII zip): same file minus the military-installation rows (e.g. "MILITARY BASES IN KABUL", "BARTER ISLAND LRRS"). The "nm" meaning is inferred from the diff, not documented.
- `ocallhist-2026.txt` (from REL zip): full rate history, space-delimited with quoted strings. A few quoted fields contain long notes (one Tokyo row has a multi-sentence area description).
- `relational-file-format.pdf` (from REL zip): official layout for `ocallhist`. Not unzipped: `ocallhist-26.xml` (1.8 MB, same data as XML).

### ocallhist (relational) layout, from relational-file-format.pdf
State/Country Code X(3); State/Country Name X(42); CONUS/OCONUS Indicator X(1); City X(20); County X(32); Time Zone; Linked To State X(3); Linked Location X(42); DOD Indicator yes/no; Effective Date mm/dd/yyyy; Expiration Date mm/dd/yyyy; Seasonal Start mm/dd; Seasonal End mm/dd; Lodging; M&IE; No Government Meals Rate (meals only); Proportional Meals Rate; Incidental Rate; Footnote Number; Footnote Rate; Maximum Per Diem.

### ASCII layout (no official doc on the page; inferred)
Semicolon-delimited, trailing `;`:
`country/state;location;season start mm/dd;season end mm/dd;lodging;local meals;proportional meals;incidentals;footnote no.;footnote rate;max per diem;effective date`
Matched against the same row in ocallhist (HERAT (NON-US FACILITIES): lodging 99, M&IE 40, meals 32, proportional 25, incidentals 8, max 139). **M&IE = local meals + incidentals.** Checked: lodging + local meals + incidentals = max per diem on all 1,612 rows.

## M&IE breakdown (breakfast / lunch / dinner / incidentals)

DTMO has no breakdown page of its own. Its Per Diem and Meal Rates pages link "CONUS Meals & Incidentals Breakdown" to GSA and "Foreign Meals & Incidentals Breakdown" to State (`https://aoprals.state.gov/content.asp?content_id=114&menu_id=78`, which now redirects to the State homepage). The live table is State's copy of FTR Chapter 301 Appendix B, which says it applies to **both non-foreign areas (DoD rates) and foreign areas**:

- `mie-breakdown.html`: https://allowances.state.gov/Bypass/AppendixB.asp (fetched Sat, 17 Oct 2026 04:16 GMT; no Last-Modified header). Linked from https://allowances.state.gov/Perdiem.asp as "Breakdown of Meals/Incidentals".
- `mie-breakdown.csv`: the same table parsed to `mie,breakfast,lunch,dinner,incidentals`, rows $1–$265, no gaps.
- Rule under the table: for M&IE above $265, breakfast 15%, lunch 25%, dinner 40% of the total; the remainder is incidentals. This matters: the highest M&IE in the current OCONUS file is $287.
- Oddity: State's own table row **$26 = 4 / 7 / 11 / 5**, which sums to 27. Kept as published.

## GeoNames postal codes

Source page: https://download.geonames.org/export/zip/ (CC BY 4.0, GeoNames). Tab-separated; column 5 is the state/admin code.

| File | URL | Last-Modified |
|---|---|---|
| PR.txt | https://download.geonames.org/export/zip/PR.zip | Sat, 17 Oct 2026 02:10:40 GMT |
| GU.txt | https://download.geonames.org/export/zip/GU.zip | Sat, 17 Oct 2026 02:10:21 GMT |
| VI.txt | https://download.geonames.org/export/zip/VI.zip | Sat, 17 Oct 2026 02:10:47 GMT |
| AS.txt | https://download.geonames.org/export/zip/AS.zip | Sat, 17 Oct 2026 02:09:41 GMT |
| MP.txt | https://download.geonames.org/export/zip/MP.zip | Sat, 17 Oct 2026 02:10:28 GMT |

AS.txt is a single ZIP code (96799) and MP.txt has 3 rows; that is all GeoNames has.

`geonames-AK-HI.txt`: rows with column 5 = AK or HI from the existing local copy `.perdiem-src/geonames/US.txt` (273 AK, 137 HI), filtered with `awk -F'\t' '$5=="AK"||$5=="HI"'`.

## Census 2020 (Alaska and Hawaii rows)

Taken from the local copies in `.perdiem-src/census/` (downloaded 2026-10-16; saved there as `place_by_county2020.txt`, `county2020.txt`, `tab20_zcta520_county20_natl.txt`, the nationwide files without the `national_` prefix). Originals:
- https://www2.census.gov/geo/docs/reference/codes2020/national_place_by_county2020.txt
- https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt
- https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt

All pipe-separated, header line kept.
- `census-places-AK-HI.txt`: rows with STATE (col 1) = AK or HI. 355 AK + 163 HI.
- `census-counties-AK-HI.txt`: rows with STATE = AK or HI. 30 AK boroughs/census areas + 5 HI counties.
- `zcta-county-AK-HI.txt`: rows with GEOID_COUNTY_20 (col 10) starting 02 or 15. 287 AK + 102 HI. The header starts with a UTF-8 BOM, as in the original.
