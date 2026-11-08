# assistant-extensions

Ready-made extensions (apps) for [assistant-core](https://github.com/b-niamin/assistant-core), plus
reference skeletons Claude can start new ones from.

| Extension | Kind | What |
|---|---|---|
| [`health`](health) | native, per profile | Training & Health: Garmin sleep, HRV, Body Battery, readiness, activities. Brings the `garmin-sync` service |
| [`gym`](gym) | onefile, per profile | Gym tracker: plans, sets and weights, progress, a muscle map |
| [`examples/`](examples) | skeletons | `home-assistant`, `calendar`, `learning`: not installable as they are |

## Install

With the core installer (fresh machine):

```sh
curl -fsSL https://raw.githubusercontent.com/b-niamin/assistant-core/main/install.sh | sh -s -- health gym
```

Into a running instance, from its checkout:

```sh
docker compose exec claude node scripts/ext.mjs available
docker compose exec claude node scripts/ext.mjs install health
./install.sh        # once, for an extension with a compose.yml (starts its service)
```

`ext install` copies `<id>/` into the instance's `extensions/<id>/` and records this repo's commit;
`ext update <id>` takes a newer one. `ext new <id> --from example:<name>` starts a new extension from a
skeleton in `examples/`.

## Layout of an extension

```
<id>/
  extension.json       manifest (id, name, kind native|onefile, scope profile|shared, settings, services)
  README.md CLAUDE.md
  web/routes/**        native: SvelteKit routes, mounted at /<id>
  web/lib/**           components, helpers, *.test.ts (run by the core's vitest)
  web/tiles.server.ts  dashboard tiles;  web/tools.server.ts  tools for Claude
  db/migrations/*.sql  additive SQL for schema <id>; tables named secret_* are for its service only
  compose.yml          background services (paths relative to the core checkout)
  services/<name>/     their code
  app.html             onefile: one self-contained HTML file
```

The full contract is [spec 002](https://github.com/b-niamin/assistant-core/blob/main/specs/002-extensions.md)
in the core repo. Extensions import only `$shell` from the core.
