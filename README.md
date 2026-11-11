<p align="center">
  <img src="docs/beni.svg" alt="Beni, the assistant's mascot: an orange jelly-bean runner in a sweatband" width="120" />
</p>

<h1 align="center">assistant-extensions</h1>

<p align="center">Extensions (apps) for <a href="https://github.com/b-niamin/assistant">Beni Assistant</a>.</p>

Two kinds:

| Folder | What | How |
|---|---|---|
| [`extensions/`](extensions) | **ready to use**: install as they are, update later | `ext install <id>` |
| [`inspirations/`](inspirations) | **skeletons to build from**: Claude copies one and adapts it to you | `ext new <id> --from inspiration:<name>` |

Ready to use:

| [Training & Health](extensions/health) · `health` | [Gym Tracker](extensions/gym) · `gym` | [Home](extensions/home) · `home` |
|---|---|---|
| <a href="docs/screenshots/health.png"><img src="docs/screenshots/health.png" width="300" alt="Training & Health: readiness, sleep, HRV, Body Battery and more"></a> | <a href="docs/screenshots/gym.png"><img src="docs/screenshots/gym.png" width="300" alt="Gym Tracker: this week, plans and a muscle map"></a> | <a href="docs/screenshots/home.png"><img src="docs/screenshots/home.png" width="300" alt="Home: weather, lights, doors and windows, today's calendar"></a> |
| Native, per profile. Garmin sleep, HRV, Body Battery, readiness, activities with route, laps and charts. Brings the `garmin-sync` service | Onefile, per profile. Plans, sets and weights, progress, a muscle map | Native, shared. A calm board from Home Assistant (lights, doors and windows, camera alerts), weather with warnings, today's calendar, auto refresh |

<details>
<summary>Larger screenshots, light and dark</summary>

| Light | Dark |
|---|---|
| <img src="docs/screenshots/health.png" alt="Training & Health, light"> | <img src="docs/screenshots/health-dark.png" alt="Training & Health, dark"> |
| <img src="docs/screenshots/health-activity.png" alt="An activity: distance, pace, heart rate, route and charts"> | |
| <img src="docs/screenshots/gym.png" alt="Gym Tracker, light"> | <img src="docs/screenshots/gym-dark.png" alt="Gym Tracker, dark"> |
| <img src="docs/screenshots/home.png" alt="Home, light"> | <img src="docs/screenshots/home-dark.png" alt="Home, dark"> |

</details>

Screenshots use demo data.

Inspirations: [`home-assistant`](inspirations/home-assistant) (shared data, a settings panel with a token; the
ready-made [`home`](extensions/home) grew from it),
[`calendar`](inspirations/calendar) (shared, dashboard tiles), [`learning`](inspirations/learning) (per
profile, dashboard tiles). Anything outside this repo (someone's repo, an app from onefile-apps, an idea)
can be an inspiration too: Claude builds the extension fresh and records the source as `inspiredBy`.

`catalog.json` lists both for the core's System settings → Extend the system; add an entry there
when you add a folder.

## Install

With the core installer (fresh machine):

```sh
curl -fsSL https://raw.githubusercontent.com/b-niamin/assistant/main/install.sh | sh -s -- health gym
```

Into a running instance, from its checkout:

```sh
docker compose exec llm node scripts/ext.mjs available
docker compose exec llm node scripts/ext.mjs install health
./install.sh        # once, for an extension with a compose.yml (starts its service)
```

`ext install` copies `extensions/<id>/` into the instance's `extensions/<id>/` and records this repo's
commit; `ext update <id>` takes a newer one.

## Layout of an extension

```
<id>/
  extension.json       manifest (id, name, kind native|onefile, scope profile|shared, settings, services)
  README.md AGENTS.md  rules for AI agents (CLAUDE.md: `@AGENTS.md`)
  web/routes/**        native: SvelteKit routes, mounted at /<id>
  web/lib/**           components, helpers, *.test.ts (run by the core's vitest)
  web/tiles.server.ts  dashboard tiles;  web/tools.server.ts  tools for Claude
  db/migrations/*.sql  additive SQL for schema <id>; tables named secret_* are for its service only
  compose.yml          background services (paths relative to the core checkout)
  services/<name>/     their code
  app.html             onefile: one self-contained HTML file
```

The full contract is [spec 002](https://github.com/b-niamin/assistant/blob/main/specs/002-extensions.md)
in the core repo. Extensions import only `$shell` from the core.
