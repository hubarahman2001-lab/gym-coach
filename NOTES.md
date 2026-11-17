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

## Steps 2 and 3: camera rep counter

Built in `camera.js`. A new **Camera** tab counts squats, lunges, push-ups, shoulder press and plank; the Plank and
Shoulder press machine cards also get a "Count with camera" button that fills the result into the next unticked set.
It uses Google's MediaPipe pose model (`@mediapipe/tasks-vision@1.2.0`, lite model), which runs on the phone; the video
is never recorded or uploaded. The model downloads the first time (about 20 MB), so the first start needs internet.
Reps count when a joint angle goes past a target and comes back (squat/lunge knee under 100-105°, push-up elbow under
95°, press elbow over 155°); a rep that turns back early beeps low and shows "Too shallow, not counted". Plank time
only runs while shoulder-hip-ankle is straight. Camera-tab sets save to today's log as e.g. "Squats · 10, 12".

How to test: on the iPhone open the Camera tab, tap Count squats, Start camera, allow the camera, prop the phone up
side-on about 2 m away, wait for the 5-second countdown, then do a few squats and one half squat.

## Camera upgrade: hands-free sets, voice, depth bar, position check

Before starting you pick a goal (reps or seconds), number of sets and rest time (remembered per exercise on the Camera
tab; taken from the plan on workout cards). The screen has a green frame when your whole body is in view and red when
not, with a plain message like "Can't see your feet". After 1 second in view it counts down (5 s, then 3 s for later
sets), counts reps out loud, finishes and saves the set at the goal, runs the rest timer, and starts the next set.
A bar on the right fills as you go down and turns green when the rep is deep enough. Voice can be turned off (beeps instead).

How to test: Camera tab, Count squats, goal 5, sets 2, rest 30 sec, Start camera. Stand so the frame turns green, then do
5 squats without touching the phone. It should say "Set done", rest 30 s, then run set 2 and show a summary.

## Camera on every exercise, saves on its own

Every gym exercise in workouts A, B and C now has a 📷 button (all except the Incline walk), and the Camera tab lists
them all. Each machine watches one joint: knee for leg press/extension/curl, elbow for presses, pulldown, row, triceps
and biceps, hip angle for ab crunch/leg raises, and knee gap for hip abduction. Hip abduction and abs measure from your
own start position, because machines differ. A set saves itself when you hit the goal, or after 8 seconds of no movement
once at least one rep is counted (5 seconds for plank), with a "saving set in 3, 2, 1" warning first.

How to test: on workout A open Leg press, type your weight, tap Count with camera, do 5 reps, then sit still. After the
countdown it saves "5" into set 1 with your weight, rests, and waits for set 2.

## Step 4: offline app, muscle balance, monthly recap

**Offline / home screen:** `manifest.webmanifest`, `icons/` and `sw.js` make the app installable. On iPhone: open the app in
Safari, tap Share, then Add to Home Screen. It opens full-screen and works with no signal. The app's own files always
try the internet first, so updates still show up; the camera model, MediaPipe code and fonts are saved after first use.
When changing `coach.js`, `camera.js` or `extras.js`, bump the `?v=` number in `index.html` and in `FILES` in `sw.js`.

**Muscle balance and recap** (`extras.js`, Week tab): sets per muscle group this week (matched on exercise name, so
hand-typed Log entries count), and a monthly recap with ‹ › to change month and a Save as image button (share sheet on
iPhone, download on laptop). The recap image leaves out VLCC days and body measurements.

How to test: tick a few sets on workouts A and B, open Week, check the bars and the recap numbers, tap Save as image.
For offline: open the app once online, add it to the home screen, turn on Airplane mode and open it from the icon.
