# Layout of an extension

What a folder in [`extensions/`](../extensions) or [`inspirations/`](../inspirations) holds. Back to the [README](../README.md).

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
  i18n/<lang>.json     translations: English text -> that language (spec 007); onefile apps list
                       the languages they speak in the manifest's "languages"
```

The full contract is [spec 002](https://github.com/b-niamin/assistant/blob/main/specs/002-extensions.md)
in the core repo. Extensions import only `$shell` from the core.
