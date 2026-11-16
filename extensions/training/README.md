# Training

Assistant extension: training plans and workouts of any kind. Kind `native`, scope `profile`, schema
`training`. It took over from the Gym Tracker, which is no longer in this repository.

- A workout is a list of items in order: cardio (run, ride, swim, walk...: time, distance, blocks for the
  watch with pace or heart rate targets), exercises from the library (sets of reps with kg, seconds or
  minutes) and recovery (sauna, stretching). A run, a full body session and the sauna can be one workout;
  a day can hold any number of workouts.
- Many plans, one active. The week, the calendar and the dashboard tile show the workouts of the active
  plan and those of no plan.
- `/training`: the week, today, the active plan, templates, best sets.
- `/training/session/<id>` (and `/training/session/new`): the workout editor and logger. Pick from the
  library (search, muscle groups, easy on the back), tick sets, rest timer, effort and a note, finish or
  skip, save as a template.
- `/training/plans`: active, waiting and finished plans; `/training/plans/<id>`: a plan and its workouts.
- `/training/library`: the built-in exercises with how to do them and what to watch out for, and your own.
- Built mostly with Claude: `training__*` tools do everything the pages do. Claude puts a workout on the
  Garmin watch through the Training & Health app (`training__garmin_workout`, then `health__send_workout`)
  and names the real activity on Strava (`health__edit_activity`).

## Install

```sh
node scripts/ext.mjs install training
```
