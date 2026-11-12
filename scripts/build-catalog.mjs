// catalog.json is made from the extensions' own files (audit R13): id, name, description, kind, scope,
// needs and accessory from extension.json, `service` from its services/jobs, and every language of
// i18n/<lang>.json. Nothing is typed twice.
//   node scripts/build-catalog.mjs           writes catalog.json
//   node scripts/build-catalog.mjs --check   fails when catalog.json is not what it would write (CI)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const dirs = readdirSync(path.join(root, 'extensions'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const errors = [];
const extensions = dirs.map((id) => {
  const dir = path.join(root, 'extensions', id);
  const m = read(path.join(dir, 'extension.json'));
  if (m.id !== id) errors.push(`extensions/${id}: the manifest's id is "${m.id}"`);
  const entry = { id, name: m.name, description: m.description, kind: m.kind, scope: m.scope };
  if (m.services?.length || m.jobs?.length) entry.service = true;
  if (m.needs) entry.needs = m.needs;
  if (m.accessory) entry.accessory = m.accessory;
  const i18n = {};
  const langs = existsSync(path.join(dir, 'i18n')) ? readdirSync(path.join(dir, 'i18n')).filter((f) => /^[a-z]{2,3}\.json$/.test(f)).sort() : [];
  for (const f of langs) {
    const t = read(path.join(dir, 'i18n', f));
    const lang = f.replace(/\.json$/, '');
    const words = {};
    for (const k of ['name', 'description', 'needs']) {
      if (!entry[k]) continue;
      if (typeof t[entry[k]] === 'string' && t[entry[k]]) words[k] = t[entry[k]];
      else errors.push(`extensions/${id}/i18n/${f}: no translation of its ${k} "${entry[k]}"`);
    }
    i18n[lang] = words;
  }
  if (Object.keys(i18n).length) entry.i18n = i18n;
  return entry;
});

const text = JSON.stringify({ extensions }, null, 2) + '\n';
const file = path.join(root, 'catalog.json');
if (errors.length) {
  for (const e of errors) console.error(`catalog: ${e}`);
  process.exit(1);
}
if (process.argv.includes('--check')) {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
    console.error('catalog: catalog.json is not made from the extensions: run node scripts/build-catalog.mjs and commit it');
    process.exit(1);
  }
  console.log(`catalog: ok (${extensions.length} extensions)`);
} else {
  writeFileSync(file, text);
  console.log(`catalog: wrote ${extensions.length} extensions`);
}
