import { readFile } from 'node:fs/promises';
import { neonQuery } from '../lib/neon.mjs';
import { createLookup } from '../lib/tracking.mjs';
try {
  // Validate requirements before touching the database; never generate a new secret here.
  createLookup(() => {}, process.env.DOCUMENT_HASH_SECRET);
  const query = neonQuery();
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await query(statement, []);
  console.log('Tabelas preparadas. Nenhum histórico foi apagado.');
} catch {
  console.error('Não foi possível preparar o banco. Revise DATABASE_URL, DOCUMENT_HASH_SECRET e acesso ao Neon.');
  process.exitCode = 1;
}
