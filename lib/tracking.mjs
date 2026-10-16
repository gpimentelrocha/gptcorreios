import { createHash, createHmac } from 'node:crypto';

export class ConfigurationError extends Error {}
export class DocumentError extends Error {}

export function normalizeDocument(value) {
  if (typeof value !== 'string') throw new DocumentError('Informe um CPF ou CNPJ válido.');
  const document = value.replace(/[.\-/\s]/g, '');
  if (!/^(?:\d{11}|\d{14})$/.test(document) || /^(\d)\1+$/.test(document)) {
    throw new DocumentError('Informe um CPF ou CNPJ válido.');
  }
  const weights = document.length === 11
    ? [[10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]]
    : [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]];
  let base = document.slice(0, -2);
  for (const weight of weights) {
    const remainder = [...base].reduce((sum, d, i) => sum + Number(d) * weight[i], 0) % 11;
    base += remainder < 2 ? '0' : String(11 - remainder);
  }
  if (base !== document) throw new DocumentError('CPF/CNPJ com verificadores inválidos.');
  return document;
}

export function createLookup(query, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new ConfigurationError('Configure DOCUMENT_HASH_SECRET com ao menos 32 caracteres.');
  }
  const fingerprint = createHash('sha256').update(secret).digest('hex');
  return async value => {
    const document = normalizeDocument(value);
    // Bind this database to the original secret. A changed key must never silently reset histories.
    const settings = await query(`
      INSERT INTO tracking_settings (name, value) VALUES ('document_secret_fingerprint', $1)
      ON CONFLICT (name) DO UPDATE SET value = tracking_settings.value
      RETURNING value`, [fingerprint]);
    if (settings[0]?.value !== fingerprint) {
      throw new ConfigurationError('A chave mudou. Restaure DOCUMENT_HASH_SECRET original.');
    }
    const key = createHmac('sha256', secret).update(document).digest('hex');
    const rows = await query(`
      WITH instant AS (
        SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now
      )
      INSERT INTO tracking_records (document_key, first_seen_at, posted_at)
      SELECT $1, now, now - 7200000 FROM instant
      ON CONFLICT (document_key) DO UPDATE SET document_key = EXCLUDED.document_key
      RETURNING first_seen_at, posted_at,
        floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS server_now`, [key]);
    const row = rows[0];
    return {
      version: 2,
      firstSeenAt: Number(row.first_seen_at),
      startedAt: Number(row.posted_at),
      serverNow: Number(row.server_now)
    };
  };
}
