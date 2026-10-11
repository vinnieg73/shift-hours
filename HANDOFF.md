# HANDOFF: Shift Hours

Last updated: 2026-10-11 (audit fixes)

## What it is

A single-file shift hours calculator (`index.html`, no build step) served by GitHub Pages at shifthours.app (`CNAME`). State lives in the visitor's `localStorage` under `shift-hours-v1`.

## Status

- Dark, compact Liquid Glass layout. Decimal hours are the main result, with h:mm underneath.
- New visitors default to no break. There is no floating results bar on phones.
- **Decimal input:** a dot or comma in a time field means decimal hours. `9.5` is 9:30, `9.25` is 9:15, and `17.75` is 17:45 in 24-hour mode. A colon still means h:mm (`9:30`), and plain digits still work (`930`). Every decimal read shows a badge such as "Read 9.30 as 9:18", so a mistaken entry is visible.
- **Totals never include a guess.** In the calculator, a bad break (e.g. "7.5" minutes) or a start-and-end break with only one time pauses the total: it shows a dash, Copy is off, and a badge says why ("No total yet: add the end time of break 1"). Equal start and end show 0.00 with a note.
- **Weekly timesheet:** a card under the calculator with Mon to Sun rows (start, end, break minutes). Each day shows decimal hours with h:mm under it. The week total is the sum of minutes, shown as decimal hours with h:mm and a day count, and it has a Copy button. It uses the same clock format and rounding settings as the calculator. A day with something typed but missing a time says what is missing; a day with an invalid field shows field-named errors after the field loses focus. Either kind is left out of the total, the total dims, a red line names the days not counted, and week Copy stays off until they are finished or cleared. Zero-hour days are not counted as days. Clear week needs two taps. On phones (≤640px), each day takes two lines and AM/PM becomes one chip that flips when tapped.

- **Multiple tabs:** a tab writes only when its state differs from what it last read or wrote, and it takes other tabs' saves via the `storage` event (also re-read on becoming visible and on back/forward-cache restore). Unsaved edits in the current tab win. A save without a `week` key (from an old copy of the page) does not wipe the week rows.
- **24:00:** valid only in 24-hour mode. Switching to 12-hour leaves `2400` as typed and flags it; switching back restores it.
- Audit of 2026-10-11 (`fix/audit-2026-10-11`): all 3 Mediums fixed; Lows fixed except 15 and 19 (see open decisions), and 4 is only labelled.

## Next steps

1. Watch for feedback on the decimal change (see gotchas).
2. Possible: an "Add to week" button that copies the calculator's result into today's row.

## Open decisions

- Whether a dot should stay decimal. The alternative is to read `9.30` as 9:30, which is how dots worked before this change. (Not changed by the audit fixes.)
- Week total vs daily decimals: the total is the sum of minutes, so three 20-minute days show 0.33 each but 1.00 in total. Summing rounded daily decimals instead is a payroll choice, left as is.
- Decimal "Read as" notes show as soon as a field is read, even before the other time is entered. Kept on purpose as typing feedback.
- Decimal entries round to the nearest minute (16.01 is 16:01); the note says "(nearest minute)" when that happens.

## Gotchas

- **The decimal change alters old behaviour.** Before, `9.30` meant 9:30. It now means 9:18. The iOS decimal keypad has no colon, so phone users who typed `9.30` for 9:30 now need `930`. The badge and the hint text explain this.
- Saved state from before decimal input has no `week` key. On first load, `normalise()` rewrites its dotted times to colon form (`9.30` becomes `9:30`), so old saves keep their meaning. The rewrite runs only once, because the next save adds `week`.
- `normalise()` rebuilds state from a fixed shape. New stored fields must be added to `DEFAULT` and `normalise()`, or they are wiped on reload.
- If `build()` throws at startup, the saved state is copied to `shift-hours-v1-backup`, the page starts from defaults, and the error is logged. Keep new code defensive.
- `adopt()` replaces `S` with another tab's state and rebuilds. Anything holding a reference to an old `S` object (like the `moved` map of format-switch notes) must be reset there.
- `computeDay()` returns `state`: `empty`, `ok`, `open` (something missing) or `bad`. `renderWeek()` relies on it to decide which days are "not counted".
- The 12/24-hour toggle converts every stored time, including the week rows. Any new time field must be added to that list (with a label, used in the note shown when an invalid entry becomes valid in the other format).
- Test hooks: `window.__hours` exposes `parse`, `computeDay`, `renderWeek` and `normalise`.
- The repo is public, so keep this file about the site only.
