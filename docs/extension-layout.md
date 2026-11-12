# Layout of an extension

What a folder in [`extensions/`](../extensions) holds. Back to the [README](../README.md).

```
<id>/
  extension.json       manifest (id, name, kind native|onefile, scope profile|shared, settings,
                       services and jobs: background work the core's worker runs, spec 002)
  README.md AGENTS.md  rules for AI agents (CLAUDE.md: `@AGENTS.md`)
  web/routes/**        native: SvelteKit routes, mounted at /<id>
  web/lib/**           components, helpers, *.test.ts (run by the core's vitest)
  web/routes/settings/ native: an extra view at /<id>/settings, linked from its panel in System settings
  web/tiles.server.ts  dashboard tiles (a onefile app writes its tile to the `__tile` key instead)
  web/tools.server.ts  MCP tools for Claude, native and onefile (a read-only overview, one tool per write)
  web/sources.server.ts  "Connected accounts" in its panel: list(ctx) and act(ctx, source, action, input)
  db/migrations/*.sql  additive SQL for schema <id>; tables named secret_* are for its service only
  services/<name>/     background work's code (Python with requirements.txt, or Node), run by the worker
  compose.yml          only for what the worker cannot run (another image, a device): needs install.sh
  app.html             onefile: one self-contained HTML file
  i18n/<lang>.json     translations: English text -> that language (spec 007); onefile apps list
                       the languages they speak in the manifest's "languages"
```

The full contract is [spec 002](https://github.com/b-niamin/assistant/blob/main/specs/002-extensions.md)
in the core repo. Extensions import only `$shell` from the core.

The manifest's fields and limits, the `$shell` SDK and the tools contract are in
[docs/extensions.md](https://github.com/b-niamin/assistant/blob/main/docs/extensions.md) in the core repo.

## `catalog.json`

What "Extend the system" in the app and `ext available` list. Never edited by hand: `node
scripts/build-catalog.mjs` makes it from every folder in `extensions/` (CI fails when it is stale):

| Field | What |
| --- | --- |
| `id`, `name`, `description`, `kind`, `scope`, `accessory` | the manifest's |
| `needs` | the manifest's optional `needs`: what the owner needs before it works, e.g. "A Garmin Connect account" |
| `service` | `true` when the manifest has `services` or `jobs` (the worker runs them) |
| `i18n.<lang>` | `name`, `description`, `needs` from the extension's `i18n/<lang>.json` |

