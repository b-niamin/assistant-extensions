# Home

A calm, glanceable board for the house, made to live on a wall tablet as much as in the app. Few
distractions, a handful of answers:

- **Lights**: all off, or how many are on (tap for which and since when). Lamps on smart plugs count too.
- **Doors and windows**: all closed, or which are open.
- **Weather** where you choose: now, the next four 6-hour periods, the next 24 hours as a chart and a list
  taking turns every 10 s (pick a tab to hold it for 2 min),
  heaviest rain, wind, the night's low, daylight. **Warnings** from the forecast itself (storms, freezing
  rain, heavy rain or snow, strong gusts, frost, heat) and, optionally, official ones from Home Assistant
  entities (Meteoalarm and the like).
- **Date and time**, with a small bar that empties until the next update and says when the data is from.
  The board refreshes itself (30 s to 5 min) and right away when a tablet wakes.
- **Alerts**: sensors you pick (a camera's person detection, the doorbell) show up at the bottom while on
  and for a few minutes after.
- **Today** from calendar subscription links (ICS / webcal: Google, iCloud, Outlook) and your Home
  Assistant calendars.

Beni wears its bulb in the top bar and keeps watch: asleep when the house is quiet at night, on its toes
on an alert, tired when it cannot reach Home Assistant. Full screen (top right) also keeps the screen on.

Read-only on purpose: it never switches anything in Home Assistant.

## Connecting (System settings -> Home)

At the top, under **Connected accounts**, the **Home Assistant** card takes the address (e.g.
`http://homeassistant.local:8123`) and a long-lived access token (Home Assistant -> your profile ->
Security). Connect checks it right away and the card then shows the version and what the board watches.
The **Calendars** card takes subscription links (ICS or webcal), one per row with [+] and [x]: Google's "Secret
address in iCal format", an iCloud public calendar, an Outlook published calendar. They are read-only,
need no Home Assistant, and are kept as a secret because such a link opens the calendar to anyone who has
it; the card lists each calendar by name with what it has today.
Below, under Settings, the **weather location**: `Warszawa` or `52.23, 21.01`; empty = the home location
set in Home Assistant.

Everything else is set by talking to Claude or Codex in the terminal ("watch only the living room lamps",
"alert me when the driveway camera sees a person", "refresh every 30 s"). They use the extension's
tools: `home__entities` to find ids, `home__configure` to change what the board watches:

| Key | Default |
|---|---|
| `lights` | every `light.*` plus switches that drive a lamp (a lamp word in the id or name, English or Polish, or a lamp icon); a group counts only when none of its members does |
| `contacts` | every `binary_sensor` with device class door, window, garage_door or opening |
| `alerts` | none; e.g. `binary_sensor.*_person, event.doorbell` |
| `alert_minutes` | 10: how long an alert stays after the sensor goes quiet |
| `weather_alerts` | none; official warnings such as `binary_sensor.meteoalarm` |
| `calendars` | every calendar |
| `refresh_seconds` | 60 (15 to 3600) |

Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key). The token never leaves the server.
