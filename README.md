# assistant-extensions

Extensions (apps) for [Beni Assistant](https://github.com/b-niamin/assistant), in two kinds:

| Folder | What | How |
|---|---|---|
| [`extensions/`](extensions) | **ready to use**: install as they are, update later | `ext install <id>` |
| [`inspirations/`](inspirations) | **skeletons to build from**: Claude copies one and adapts it to you | `ext new <id> --from inspiration:<name>` |

Ready to use:

| Extension | Kind | What |
|---|---|---|
| [`health`](extensions/health) | native, per profile | Training & Health: Garmin sleep, HRV, Body Battery, readiness, activities. Brings the `garmin-sync` service |
| [`gym`](extensions/gym) | onefile, per profile | Gym tracker: plans, sets and weights, progress, a muscle map |

Inspirations: [`home-assistant`](inspirations/home-assistant) (shared data, a settings panel with a token),
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
docker compose exec claude node scripts/ext.mjs available
docker compose exec claude node scripts/ext.mjs install health
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
