# Training

Assistant extension: training plans and workouts of any kind. Kind `native`, scope `profile`, schema
`training`. It took over from the Gym Tracker, which is no longer in this repository.

- A workout is a list of items in order: cardio (run, ride, swim, walk...: time, distance, blocks for the
  watch with pace or heart rate targets), exercises from the library (sets of reps with kg, seconds or
  minutes) and recovery (sauna, stretching). A run, a full body session and the sauna can be one workout;
  a day can hold any number of workouts.
- Many plans, one active. The week, the calendar and the dashboard tile show the workouts of the active
  plan and those of no plan.
- Phone first, in the look of Piotr's gym log: soft cards, a navy hero, big round ticks, bottom sheets,
  a floating tab bar (Workout, Plans, Exercises).
- `/training`: this week against a weekly goal, Start / Repeat / Run, the workout in progress, a week
  ago (copy it), the week's workouts, templates, recovery of the muscles on a body map.
- `/training/session/<id>` (and `/training/session/new`): the workout. Saved a moment after every change.
  Last time's sets as hints and quick fills (the same, a step heavier, one more rep), tick sets, records
  with confetti, the muscles at work, the rest timer, the plate calculator, notes; runs with time,
  distance and blocks for the watch (repeats, pace or heart rate targets); a summary at the end.
- `/training/plans`: active, waiting and finished plans; `/training/plans/<id>`: a plan and its workouts.
- `/training/library`: every exercise with its photos (start and end of the movement, animated), the
  muscles on the body, how to do it, what to avoid, your progress with a chart; and your own entries.
- Photos: Free Exercise DB (public domain); body shapes: react-body-highlighter (MIT); font: Barlow
  Condensed (OFL).
- Built mostly with Claude: `training__*` tools do everything the pages do. Claude puts a workout on the
  Garmin watch through the Training & Health app (`training__garmin_workout`, then `health__send_workout`)
  and names the real activity on Strava (`health__edit_activity`).

## Install

```sh
node scripts/ext.mjs install training
```
