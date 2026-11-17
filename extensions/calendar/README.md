# Calendar

One calendar for the house, and the place every other app puts its dates on:

- **Your own entries**: all day or with a time, over several days, with a place and a note. Add them on
  the page or ask Claude ("put the dentist on Thursday at 18:30").
- **Subscribed calendars**: Google, iCloud, Outlook or any ICS / webcal link, read-only, with repeating
  events, exceptions and moved occurrences.
- **What the other apps add**: sessions of the training plan, Garmin activities and planned workouts from
  Training & Health Data, Home Assistant calendars from Home. Any extension can do the same with one file
  (`web/calendar.server.ts`, core spec 002).

The month on the left, the chosen day on the right, and under it **Calendars**: every calendar on the page
with its colour and a switch. Your own entries, each subscribed calendar on its own, and every app that
puts dates here (whatever is installed, a new one shows up by itself). What a profile switches off stays
off for that profile, on the page and on the tile; Claude's tools still see everything. A dashboard tile shows what is on today and coming up this week, and Home puts today's entries
on its board. Pingo, holding its pencil, tells you how busy today is.

## Subscribing (System settings -> Calendar)

The **Subscribed calendars** card takes subscription links, one per row with [+] and [x]: Google's
"Secret address in iCal format" (calendar settings), an iCloud calendar shared as public, an Outlook
calendar published as ICS. Links are kept secret (anyone with one can read that calendar) and fetched at
most every 15 minutes.

## For Claude

`calendar__overview`, `calendar__entries` (any range, any app), `calendar__add_entry`,
`calendar__update_entry`, `calendar__remove_entry`.
