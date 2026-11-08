# Inspirations

Skeletons for Claude to start new extensions from; not installable as they are. Each folder is a
complete extension skeleton:

| Inspiration | Shows |
|---|---|
| `home-assistant` | a native extension with **shared** data and a settings panel (address, token as a secret, a select, a switch) |
| `calendar` | a native, shared extension with dashboard tiles |
| `learning` | a native, **per profile** extension with dashboard tiles |

Start one with `node scripts/ext.mjs new <id> --from inspiration:<name>` in the core checkout: it copies the
folder into `extensions/<id>/`, renamed, to adapt from there (the `add-extension` skill). They are not
compiled or type-checked, so treat their code as a sketch and check it against `apps/web/src/lib/sdk` (the
`$shell` API) in the core repo.
