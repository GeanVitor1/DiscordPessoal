# Backend da versão desktop 1.0.11

Este pacote contém o backend JavaScript, o lockfile e, quando preparado por `scripts/prepare-hosted-server.js`, o frontend de produção em `public/`. Não contém credenciais, banco, uploads ou dependências instaladas. O instalador Windows se conecta automaticamente ao serviço central; o backend não roda embutido no Electron.

No ambiente de hospedagem, execute `npm ci --omit=dev` e `npm start`, ou use o Dockerfile. O serviço serve o site, a API e o Socket.IO na mesma origem: usuários finais não iniciam Vite nem terminais. As migrations são aplicadas na inicialização, em transações. Preserve o banco e o volume de uploads e mantenha um backup antes de atualizar o serviço. O serviço precisa estar acessível por HTTPS para clientes remotos. `/api/health` continua público e identifica `authentication: sessions-v1`; as demais operações exigem contas/sessões.

Configurações: `PORT`, `HOST`, `DATABASE_URL` para PostgreSQL ou `SQLITE_PATH` para SQLite, `TRUST_PROXY_HOPS` para o número conhecido de proxies, `PG_SSL_CA` para CA privada e `TURN_SERVER_HOST`, `TURN_PORT`, `TURN_SECRET` para credenciais TURN temporárias. PostgreSQL remoto valida TLS por padrão; a configuração `PG_SSL_MODE=disable` é destinada à rede interna do Compose. Persista `/app/data` e `/app/uploads` quando usar SQLite em Docker.

Perfis antigos sem credenciais não podem ser assumidos pelo cliente. Cadastre uma conta e, se necessário, o administrador do serviço pode recuperar a propriedade de um servidor legado com `node scripts/recover-ownership.js SERVER_ID ACCOUNT_HANDLE`. Essa operação é local, exige acesso ao banco, recusa donos já autenticados e registra auditoria. Sem dono verificável, servidores antigos ficam privados até essa recuperação.

O código foi validado localmente com SQLite, inclusive em cópia do banco existente. O daemon Docker não estava disponível para testar PostgreSQL ou a imagem. O serviço público não foi atualizado automaticamente.
