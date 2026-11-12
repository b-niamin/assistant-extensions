# Install an extension

Back to the [README](../README.md).

With the core installer (fresh machine):

```sh
curl -fsSL https://raw.githubusercontent.com/b-niamin/assistant/main/install.sh | sudo sh -s -- health gym home
```

Into a running instance, from its checkout:

```sh
docker compose exec terminal node scripts/ext.mjs available
docker compose exec terminal node scripts/ext.mjs install health
# background work (health's garmin-sync, the monitor's collector) starts in the worker by itself
```

`ext install` copies `extensions/<id>/` into the instance's `extensions/<id>/` and records this repo's
commit; `ext update <id>` takes a newer one.

`catalog.json` lists both kinds for the core's System settings → Extend the system; add an entry there
when you add a folder.
