# Gym Tracker · Muscle map

Plan workouts, log sets and weights, track progress and see which muscles you trained on a body map.

**PL:** **Dziennik treningowy** · Planuj treningi, zapisuj serie i ciężary, śledź postępy i zobacz na mapie ciała, które mięśnie pracowały.

<p>
  <img src="screenshots/phone-light.png" width="240" alt="Main screen">
  <img src="screenshots/phone-dark.png" width="240" alt="Dark mode">
  <img src="screenshots/phone-progress.png" width="240" alt="Progress">
</p>

## Features

- Workout plans, quick start or repeat the last session
- Log sets, reps and weight with suggestions from last time
- Timer on a round floating button, with a big 3/4-screen view, sound and vibration; screen stays on
- Exercise library with photos, nine simple categories and a low back pain set
- Progress charts, estimated 1RM, calendar
- Muscle map of what you trained, kg or lb, plate calculator
- Phone and desktop layout (side menu, two columns)

## Use it

Download [`gym-tracker-muscle-map.html`](gym-tracker-muscle-map.html) and open it in any browser, or give the
file to an AI chat and ask it to show it as an artifact. English and Polish,
light and dark, works offline.

## Your data

- Stays in this browser only (local storage: `gym-notebook.v1`). Nothing is sent anywhere.
- Export: JSON · Import: JSON. Back up now and then.
- Sample data (CC0, free to reuse): [gym-tracker-sample.json](sample-data/gym-tracker-sample.json) (Three made-up workout plans and about eight weeks of logged sessions.)

## Credits

- Authors: [@piotr-liszka](https://github.com/piotr-liszka)
- Version 1.2.0 · MIT license · [Changelog](CHANGELOG.md)
- react-body-highlighter (MIT): Muscle map polygon shapes (src/body.json). <https://github.com/giavinh79/react-body-highlighter>
- Free Exercise DB (Unlicense): Exercise photos (src/img), resized to WebP and embedded as base64. <https://github.com/yuhonas/free-exercise-db>

## Updating from onefile-apps

The app is the Gym Tracker from [onefile-apps](https://github.com/b-niamin/onefile-apps/tree/main/apps/gym-tracker/muscle-map)
in the assistant's look. To bring in upstream changes, clone that repo and run
`python3 sync-from-onefile.py <onefile-apps>/apps/gym-tracker/muscle-map/src`; it rebuilds `app.html`.
