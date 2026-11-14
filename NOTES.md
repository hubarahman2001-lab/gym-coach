# Notes

## How the app stores things (Step 0)

Everything lives in the browser's `localStorage` under one key, `gymplan`, as one JSON object `S`.

- **Workout plan**: fixed in the code (`PLAN` in `index.html`). Tabs A, B, C (gym) and W (walk). Each exercise row is
  `[name, "sets × reps", muscles, tip]`, for example `["Leg press","3 × 12",...]`. An exercise's key is tab + position, e.g. `A0`.
- **Stretch routines**: fixed in the code (`R`), with drawn animations in `FG`.
- **Today's ticks**: `S.done[key] = [true, false, ...]`, one per set. Cleared automatically each new day (`S.day`).
- **Reps and weight typed per set**: `S.sets[key][setIndex] = {r, k}`. `S.w[key]` is the last weight typed for that exercise.
- **Calendar log** (the real history): `S.cal["YYYY-MM-DD"] = [entry, ...]`.
  - Entries made by ticking sets: `{n: name, auto: key, s: setCount, ls: [{r, k}, ...]}`.
  - Entries added by hand on the Log tab: `{n, s, r, k, m}` (sets, reps, kg, minutes).
- **Day status** (Gym / VLCC / None chips): `S.st[date] = {g: 0|1, v: 0|1}`.
- **Day notes**: `S.notes[date]`.
- **Body measurements**: `S.log = [{d, w, wa, a, t}]`.
- **Backup**: the Log tab shows the whole `S` object as text; restore pastes it back. A backup must have `cal` to be accepted.

Step 0 change: removed a one-time block that put a real past workout into the calendar. Nothing else changed.

## Step 1: next-weight suggestion

Built in `coach.js`. Each weighted lift now shows a "Try X kg" box with a one-line reason and a **Use** button that fills
the weight into the sets you have not ticked yet. You can still type any weight. The step size (default 2.5 kg) can be
changed per exercise and is saved in `S.step[exerciseName]`. A gold **PR** mark shows on a set that beats your best
from earlier days, and on Log entries that were a record. Old backups still load (no new required fields).

How to test: on the Log tab, add a past day with e.g. "Leg press, 3 sets, 12 reps, 40 kg", go to workout A and check
the Leg press box says "Try 42.5 kg". Then tick a set at 45 kg to see the PR mark.
