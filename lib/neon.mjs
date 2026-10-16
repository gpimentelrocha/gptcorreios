import { neon } from '@neondatabase/serverless';
import { ConfigurationError, createLookup } from './tracking.mjs';

export function neonQuery(env = process.env) {
  if (!env.DATABASE_URL) throw new ConfigurationError('Configure DATABASE_URL no servidor.');
  const sql = neon(env.DATABASE_URL);
  const signal = AbortSignal.timeout(12000);
  return (text, params) => sql.query(text, params, {fetchOptions: {signal}});
}

export async function lookupDocument(value) {
  const query = neonQuery();
  return createLookup(query, process.env.DOCUMENT_HASH_SECRET)(value);
}
