# HANDOFF: Shift Hours

Last updated: 2026-10-11

## What it is

A single-file shift hours calculator (`index.html`, no build step) served by GitHub Pages at shifthours.app (`CNAME`). State lives in the visitor's `localStorage` under `shift-hours-v1`.

## Status

- Dark, compact Liquid Glass layout. Decimal hours are the main result, with h:mm underneath.
- New visitors default to no break. There is no floating results bar on phones.
- **Decimal input:** a dot or comma in a time field means decimal hours. `9.5` is 9:30, `9.25` is 9:15, and `17.75` is 17:45 in 24-hour mode. A colon still means h:mm (`9:30`), and plain digits still work (`930`). Every decimal read shows a badge such as "Read 9.30 as 9:18", so a mistaken entry is visible.
- **Weekly timesheet:** a card under the calculator with Mon to Sun rows (start, end, break minutes). Each day shows decimal hours with h:mm under it. The week total is the sum of minutes, shown as decimal hours with h:mm and a day count, and it has a Copy button. It uses the same clock format and rounding settings as the calculator. Clear week needs two taps. On phones (≤640px), each day takes two lines and AM/PM becomes one chip that flips when tapped.

## Next steps

1. Watch for feedback on the decimal change (see gotchas).
2. Possible: an "Add to week" button that copies the calculator's result into today's row.

## Open decisions

- Whether a dot should stay decimal. The alternative is to read `9.30` as 9:30, which is how dots worked before this change.

## Gotchas

- **The decimal change alters old behaviour.** Before, `9.30` meant 9:30. It now means 9:18. The iOS decimal keypad has no colon, so phone users who typed `9.30` for 9:30 now need `930`. The badge and the hint text explain this.
- Saved state from before decimal input has no `week` key. On first load, `normalise()` rewrites its dotted times to colon form (`9.30` becomes `9:30`), so old saves keep their meaning. The rewrite runs only once, because the next save adds `week`.
- `normalise()` rebuilds state from a fixed shape. New stored fields must be added to `DEFAULT` and `normalise()`, or they are wiped on reload.
- If `build()` throws at startup, the catch removes all saved data. Keep new code defensive.
- The 12/24-hour toggle converts every stored time, including the week rows. Any new time field must be added to that list.
- Test hooks: `window.__hours` exposes `parse`, `computeDay`, `renderWeek` and `normalise`.
- The repo is public, so keep this file about the site only.
