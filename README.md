# Vercel + Neon Postgres

Página de rastreamento fictício com API serverless Node.js na Vercel e persistência no Neon. Não consulta encomendas reais dos Correios. SQLite e disco local não são usados nesta versão.

## Publicar na Vercel

1. Crie um projeto Postgres no [Neon](https://console.neon.tech/) ou adicione a integração Neon ao projeto na Vercel.
2. No SQL Editor do Neon, execute o conteúdo de `db/schema.sql`. É idempotente: não remove registros.
3. Em **Vercel → Project Settings → Environment Variables**, configure no ambiente Production:
   - `DATABASE_URL`: connection string Postgres **pooled** fornecida pelo Neon, com `sslmode=require`. A integração Neon pode preencher essa variável automaticamente.
   - `DOCUMENT_HASH_SECRET`: segredo fixo e aleatório. Gere uma vez no seu terminal com o comando abaixo e salve o resultado diretamente nas configurações. Não coloque o valor em código, Git ou chat.
4. Importe o repositório na Vercel. A raiz deve ser a pasta que contém `package.json` e `vercel.json`. O framework é **Other**, build `npm run build`, saída `public`, Node.js 24.x. As configurações já estão em `vercel.json`.
5. Faça o deploy/redeploy depois de definir as variáveis. Abra o domínio da Vercel e consulte um documento de teste válido; repita em outro navegador para confirmar a mesma postagem.

Gerar `DOCUMENT_HASH_SECRET`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use sempre o mesmo segredo com o mesmo banco. Se o segredo for alterado, a API bloqueia a consulta em vez de criar um histórico duplicado. Restaure o segredo original para voltar a consultar. O banco guarda somente uma impressão do segredo e o identificador HMAC do documento.

Production e Preview devem usar bancos/branches Neon separados para que testes não criem registros no banco de leads. Configure as variáveis conforme o ambiente da Vercel. Não coloque `DATABASE_URL` ou o segredo em variáveis públicas do frontend.

## Desenvolvimento

Requer Node.js 24. Copie `.env.example` para `.env.local` e preencha os valores **localmente**. Esse arquivo é ignorado pelo Git.

```sh
npm ci
npm run db:setup
npm run build
npm run dev
```

`db:setup` executa o mesmo SQL de `db/schema.sql` usando Neon. Nenhuma tabela é criada durante o build da Vercel: o build não precisa de credenciais do banco. O servidor local atende a página e `/api/tracking` na porta 3000. `PORT` permite alterar a porta.

## Persistência e etapas

`POST /api/tracking` recebe `{"document":"CPF ou CNPJ"}`. O servidor valida os verificadores, normaliza a pontuação e cria um identificador HMAC-SHA-256. O documento não é salvo em texto nem colocado em URLs ou logs da aplicação. A API não autentica o visitante; não acrescente dados pessoais ou dados reais de encomendas a esse histórico público.

A primeira consulta fixa pelo relógio do **Postgres**:

- `firstSeenAt`: primeiro acesso.
- `startedAt`: exatamente duas horas antes, para a postagem fictícia.

Uma chave única e `INSERT ... ON CONFLICT` preservam ambas as datas mesmo em chamadas simultâneas, outros aparelhos, reinícios e novos deploys. As etapas seguintes aparecem 1, 3 e 6 dias depois do primeiro acesso. O frontend usa o horário do servidor e exibe horário de Brasília. Não depende de localStorage nem do relógio do aparelho.

Sem a API/banco, a página apresenta erro: não cria datas temporárias. A prévia do ChatGPT e o HTML avulso não acessam automaticamente o Neon. O frontend consulta a API no mesmo domínio da página publicada na Vercel.

`site-completo.html` embute o visual, mas também deve ser servido na Vercel. Para regenerá-lo após mudanças no visual, execute `python3 scripts/build_standalone.py` antes do build. A versão padrão servida é `index.html`.

A versão SQLite anterior não é migrada automaticamente. O banco local inspecionado nesta adaptação não tinha registros. O arquivo `.data` existente foi preservado e não é incluído no deploy. Se houver um banco anterior com dados em outra hospedagem, preserve-o e faça uma migração separada antes de atender novos leads.

## Validação

```sh
npm test
npm run build
```

Os testes executam o SQL em PGlite (motor Postgres local em WebAssembly), cobrindo duas horas de diferença, reinício do banco, consultas simultâneas, documento inválido, troca de segredo e contrato HTTP da função Vercel. Isso não substitui validar uma conexão real com Neon após configurar as credenciais. O build copia somente HTML, CSS, JS e imagens para `public`; banco, código de servidor e arquivos `.env` não são expostos como arquivos estáticos.
