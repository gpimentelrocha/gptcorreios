import { neon } from '@neondatabase/serverless';
import { ConfigurationError, createLookup } from './tracking.mjs';

export function neonQuery(env = process.env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new ConfigurationError('Configure DATABASE_URL no servidor.', 'DATABASE_URL_MISSING');
  let sql;
  try {
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) throw new Error('Invalid DSN');
    sql = neon(url);
  } catch {
    throw new ConfigurationError('Revise a conexão Postgres do Neon.', 'DATABASE_URL_INVALID');
  }
  const signal = AbortSignal.timeout(12000);
  return (text, params) => sql.query(text, params, {fetchOptions: {signal}});
}

export async function lookupDocument(value) {
  const query = neonQuery();
  return createLookup(query, process.env.DOCUMENT_HASH_SECRET)(value);
}
