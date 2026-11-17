# Gym Coach: build plan

An upgrade of my existing gym app, "My Gym Plan". It already has day plans, set/rep/weight logging, stretch routines, a rest timer, Log, Week and Progress tabs, and backups. Two things get added: it tells me what weight to lift next, and the phone camera counts my reps.

## Step 0: bring in the existing app
- [x] The owner's current `My Gym Plan` app is already in this folder as `index.html`. It has NOT been committed yet.
- [x] This repo is public. Before committing, check the file for personal details (names, appointments, body measurements, real logs) and ask the owner what to remove or rename. Sample data only.
- [x] Read the file and write `NOTES.md`: how exercises, sets, logs and backups are stored.
- [x] Do not rewrite or restyle existing features. Existing backups must still import.

## Step 1: next-weight suggestion (no camera needed)
- [x] For each lift, suggest the weight for next session from the logged sets:
  - all sets hit the target reps: go up by the step for that exercise (default 2.5 kg, editable per exercise)
  - missed reps: keep the same weight
  - missed three sessions in a row: drop about 10 percent
- [x] Show one short reason under each lift, for example "up 2.5 kg, all reps hit last time".
- [x] The owner can always override the suggestion.
- [x] Mark personal records when a logged set beats the previous best.

## Step 2: camera rep counter
- [x] A "Count with camera" button on supported exercises. The phone is propped up and the app counts.
- [x] Use an on-device pose model that runs in the browser (check the current MediaPipe pose docs). No video is recorded or uploaded.
- [x] Start with squats (count a rep when the knee angle goes down past a threshold and back up) and plank (time the hold while the body stays straight).
- [x] Show a big live count, a beep per rep, and a "too shallow, not counted" hint.
- [x] When the set ends, fill the reps into the normal log so Step 1 can use them.
- [ ] Works with the front camera in portrait on an iPhone in Safari. (Built for it; still needs a try on the real iPhone.)

## Step 3: more exercises
- [x] Add push-ups, lunges and shoulder press to the counter, one at a time.

## Limits to keep honest
- The camera is a counter and a motivator. It does not judge whether form is safe, and the app should say so once.

## Step 4: extras
- [x] Install to the home screen and work offline (app files, camera model and fonts saved on the phone).
- [x] Muscle balance on the Week tab: sets per muscle group since Monday, with the least trained group flagged.
- [x] Monthly recap on the Week tab: gym days, sets, kg lifted, PRs, best streak, minutes, heaviest lift; save as an image.
- [ ] Try the home-screen install and offline mode on the real iPhone.
