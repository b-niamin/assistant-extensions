# Home

A calm, glanceable board for the house, made to live on a wall tablet as much as in the app. Few
distractions, a handful of answers:

- **Lights**: all off, or how many are on (tap for which and since when).
- **Doors and windows**: all closed, or which are open.
- **Weather** where you choose: now, the next four 6-hour periods, the next 24 hours as a chart or a list,
  heaviest rain, wind, the night's low, daylight. **Warnings** from the forecast itself (storms, freezing
  rain, heavy rain or snow, strong gusts, frost, heat) and, optionally, official ones from Home Assistant
  entities (Meteoalarm and the like).
- **Date and time**, with a small bar that empties until the next update and says when the data is from.
  The board refreshes itself (30 s to 5 min) and right away when a tablet wakes.
- **Alerts**: sensors you pick (a camera's person detection, the doorbell) show up at the bottom while on
  and for a few minutes after.
- **Today** from your Home Assistant calendars.

Beni wears its bulb in the top bar and keeps watch: asleep when the house is quiet at night, on its toes
on an alert, tired when it cannot reach Home Assistant. Full screen (top right) also keeps the screen on.

Read-only on purpose: it never switches anything in Home Assistant.

## Settings (System settings -> Home)

| Field | |
|---|---|
| Home Assistant address | e.g. `http://homeassistant.local:8123` |
| Long-lived access token | Home Assistant -> your profile -> Security -> Long-lived access tokens |
| Weather location | `Warszawa` or `52.23, 21.01`; empty = the home location set in Home Assistant |
| Refresh every | 30 s, 1 min (default), 2 min, 5 min |
| Lights to watch | entity ids, `*` allowed (`light.*, switch.lamp_*`); empty = every light (light groups are skipped) |
| Doors and windows to watch | empty = every `binary_sensor` with device class door, window, garage_door or opening |
| Alert sensors | e.g. `binary_sensor.*_person, event.doorbell`; empty = no alerts |
| Keep an alert for | minutes after the sensor goes quiet (default 10) |
| Weather warning sensors | optional official warnings from Home Assistant, e.g. `binary_sensor.meteoalarm` |
| Calendars | calendar entity ids, `*` allowed; empty = every calendar |

Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key). The token never leaves the server.
