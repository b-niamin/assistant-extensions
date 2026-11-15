# Training plan

Assistant extension: training plans and sessions of any sport (running, cycling, swimming, the gym, ...),
and the gym log. Kind `native`, scope `profile`, schema `training`. Replaces the Gym Tracker.

- The week at `/training`: every session per day, today's, active plans, best sets; add a session or start
  one from a template.
- A session at `/training/session/<id>`: its workout (steps or exercises), the logger (sets with kg and
  reps, a rest timer, effort and a note), finish or skip.
- On the calendar as one source, "Training plan", which can be switched on or off there.
- Built mostly with Claude: `training__*` tools create and change plans, sessions and templates. Claude puts
  a session on the Garmin watch through the Training & Health app (`training__garmin_workout`, then
  `health__send_workout`) and names the real activity on Strava (`health__edit_activity`).

## Install

```sh
node scripts/ext.mjs install training
```

Moving from the Gym Tracker: ask Claude to "import my Gym Tracker history into the training plan". It reads
`gym__read_data` and passes it to `training__import_gym` (workouts become strength sessions, plans become
templates; running it again adds nothing new). Then the Gym Tracker can be removed.
