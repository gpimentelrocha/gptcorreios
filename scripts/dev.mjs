import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../api/tracking.mjs';
const root = resolve('public');
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (pathname === '/api/tracking') return await handler(req, res);
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);return res.end();}
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) {res.writeHead(404);return res.end();}
    const content = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {res.writeHead(404);res.end('Não encontrado.');}
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Servidor Node ativo na porta ${server.address().port}.`));
