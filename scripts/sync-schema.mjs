// ============================================================================
// Sincroniza el esquema de referencia (schema.sql + migración del portal) hacia
// supabase/migrations, que es lo que aplica la base de datos local (Docker).
// Uso: npm run db:sync
// ============================================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'supabase', 'migrations');

const files = [
  { from: 'schema.sql', to: '20260101000000_schema.sql' },
  { from: 'migration_portal_cliente.sql', to: '20260101000001_portal_cliente.sql' },
];

await mkdir(outDir, { recursive: true });

for (const { from, to } of files) {
  const sql = await readFile(path.join(root, from), 'utf8');
  const body = sql.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  await writeFile(path.join(outDir, to), body, 'utf8');
  console.log(`✓ ${from} → supabase/migrations/${to}`);
}

console.log('Esquema local sincronizado. Aplícalo con: npm run db:reset');
