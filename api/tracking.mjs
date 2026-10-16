import { lookupDocument } from '../lib/neon.mjs';
import { ConfigurationError, DocumentError, normalizeDocument } from '../lib/tracking.mjs';

async function readBody(req) {
  const size = Number(req.headers['content-length'] || 0);
  if (size > 1024) throw new DocumentError('Solicitação muito grande.');
  if (req.body !== undefined) {
    const serialized = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > 1024) throw new DocumentError('Solicitação muito grande.');
    return JSON.parse(serialized);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 1024) throw new DocumentError('Solicitação muito grande.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createHandler(lookup) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {res.statusCode = status;res.end(JSON.stringify(body));};
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(405, {error: 'Use POST para consultar.'});
    }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      return send(415, {error: 'Envie JSON.'});
    }
    try {
      const body = await readBody(req);
      const document = normalizeDocument(body?.document);
      return send(200, await lookup(document));
    } catch (error) {
      if (error instanceof DocumentError || error instanceof SyntaxError) {
        return send(400, {error: 'Informe um CPF ou CNPJ válido.'});
      }
      // Report only known diagnostic codes; never provider messages or credentials.
      let code = error instanceof ConfigurationError ? error.code : 'DATABASE_UNAVAILABLE';
      if (error?.code === '42P01') code = 'DATABASE_TABLES_MISSING';
      if (error?.code === '28P01') code = 'DATABASE_AUTH_FAILED';
      if (error?.code === '42501') code = 'DATABASE_PERMISSION_DENIED';
      const messages = {
        DATABASE_URL_MISSING: 'O banco Neon ainda não está conectado ao projeto na Vercel.',
        DATABASE_URL_INVALID: 'A conexão com o Neon está configurada incorretamente.',
        HASH_SECRET_MISSING: 'Falta configurar DOCUMENT_HASH_SECRET na Vercel e fazer novo deploy.',
        HASH_SECRET_CHANGED: 'A chave de identificação mudou. Restaure o segredo original para recuperar o histórico.',
        DATABASE_TABLES_MISSING: 'O banco está conectado, mas falta executar db/schema.sql no Neon.',
        DATABASE_AUTH_FAILED: 'O Neon recusou as credenciais. Revise a conexão salva na Vercel.',
        DATABASE_PERMISSION_DENIED: 'O usuário do banco não tem permissão para acessar o histórico.'
      };
      return send(503, {code, error: messages[code] || 'Histórico indisponível. Tente novamente; nenhuma data foi reiniciada.'});
    }
  };
}
export default createHandler(lookupDocument);
