// catalog.json lists exactly the folders in extensions/, with their manifest's id, name, kind and scope.
// Run by CI (.github/workflows/ci.yml).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8')).extensions;
const dirs = readdirSync(path.join(root, 'extensions'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const errors = [];
for (const d of dirs) if (!catalog.some((c) => c.id === d)) errors.push(`extensions/${d} is not in catalog.json`);
for (const c of catalog) {
  const file = path.join(root, 'extensions', c.id, 'extension.json');
  if (!existsSync(file)) {
    errors.push(`catalog.json lists ${c.id}, but extensions/${c.id}/extension.json is missing`);
    continue;
  }
  const m = JSON.parse(readFileSync(file, 'utf8'));
  for (const k of ['name', 'kind', 'scope']) if (m[k] !== undefined && c[k] !== undefined && m[k] !== c[k]) errors.push(`${c.id}: catalog ${k} "${c[k]}" differs from the manifest's "${m[k]}"`);
}
if (errors.length) {
  for (const e of errors) console.error(`catalog: ${e}`);
  process.exit(1);
}
console.log(`catalog: ok (${catalog.length} extensions)`);
