# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/), versions follow
[Semantic Versioning](https://semver.org/) as described in ARTIFACTS-DEVELOPMENT.md.

## 1.5.0 - 2026-11-14

Workouts on the shared calendar (`web/calendar.server.ts`, shell 5): each one on its day, timed when it was
started and finished in the app, else all day, with its exercises and sets. Example data stays off it. The app is unchanged.

## 1.4.4 - 2026-11-14

- No plate calculator: the "Plates" quick action on the home screen and the "Plates" button on an exercise are gone.

## 1.4.3 - 2026-11-14

- A fresh install starts empty. The app no longer fills itself with example plans and about eight weeks of made-up
  workouts on first open; "Load example data" in Settings still adds them on request.

## 1.4.2 - 2026-11-12

The manifest's description is the store listing's too (catalog.json is made from it). The app is unchanged.

## 1.4.0 - 2026-11-11

Tools for Claude through the assistant's MCP server (`web/tools.server.ts`). The app itself is unchanged.

- `gym__overview`: the weekly goal, plans, workouts finished this week and in 30 days, recent workouts with sets.
- `gym__log_workout`: add a finished workout. `gym__save_plan`: add a plan. Both only add; the app shows them the next time it opens.

## 1.3.0 - 2026-11-11

- Speaks the assistant's language (System settings -> Language, spec 007) when it is English or Polish; the app's own language switch then hides. Name and description in Polish.

## 1.2.0 - 2026-11-11

Brings in Gym Tracker 1.1.0 from onefile-apps, in the assistant's look. Data unchanged (data version 1).

Workout
- The exercise where you tick the first set moves up, after the ones already started, and the page scrolls to it. The order is saved with the workout.
- The quick-fill bar (Same / +2.5 kg / +1 rep) folds away smoothly after the last set.

Timer
- Round floating button in the corner. Tap it for −15, +5 s, +15 and Start; Start opens a big timer over 3/4 of the screen.
- Starts only by hand, no longer after ticking a set.
- Takes its time from the last seconds field you entered (e.g. 40 s plank).

Library
- New exercises: prone swimmers and a low back set: cat-camel, bird dog, dead bug, side plank, glute bridge, hip flexor stretch.
- Photos from Free Exercise DB. Drawings only where it has no photos (halo, plank pull-through, bird dog).
- Nine simple categories instead of 15 muscles, including "Low back pain". Tapping a category no longer scrolls the page.

Look
- Desktop layout: side menu, two columns, library grid, centred dialogs.
- Messages (e.g. "New record") are full width and hide completely.
- The timer, its big view and the desktop side menu use the shell's surfaces and tokens.
- `sync-from-onefile.py` rebuilds `app.html` from the onefile sources with the restyle applied.

## 1.1.0 - 2026-11-06

- Wears the assistant's look: its colour tokens (light and dark), system sans, its radii and flat cards.
  The plate colours map to the shell's red, accent, yellow and green; the Barlow fonts are gone (the file
  is half the size).
- Beni, the assistant's mascot, in the header (charged when the weekly goal is met, steady while on it,
  idle before the first workout) and in the empty states.
- Data unchanged (data version 1).

## 1.0.0 - 2026-11-05

- First version. Data version 1.
