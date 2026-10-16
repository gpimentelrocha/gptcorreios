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
      // Do not expose connection strings, documents or provider errors in responses/logs.
      return send(503, {error: error instanceof ConfigurationError
        ? 'Banco não configurado ou chave incompatível. O responsável precisa revisar a configuração do servidor.'
        : 'Histórico indisponível. Tente novamente; nenhuma data foi reiniciada.'});
    }
  };
}
export default createHandler(lookupDocument);
