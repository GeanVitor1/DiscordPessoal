# Backend 1.1.0 preparado para implantação

Estado: **implantado e verificado**, após autorização explícita do usuário em 07/10/2026 para Gean's workspace. Commit `a6ba50a5d88761265cb7d2d2653ace84c4ae651c`; deploy `dep-db33fubrjlhs7382aso0`, live em `2026-10-07T12:16:25Z`. Migrações 7/8 concluídas; sessão anterior e snapshot de dados preservados; site/API/Socket.IO verificados. Relatórios em `docs/validation/render-deploy-1.1.0.json` e `render-live-1.1.0.json`.

Origem prevista: `https://discordpessoal.onrender.com`. Código na branch `desktop-updates/v1.1.0-community`; Manter a publicação do código isolada de `main` enquanto não houver autorização para atualizar o backend. O instalador novo depende dessas APIs e não deve ser publicado para os clientes enquanto o backend hospedado for incompatível.

## Alteração concreta

- Contas: senha, e-mail/confirmação, recuperação, sessões, desativação/exclusão e TOTP com códigos de recuperação.
- Comunidades: categorias, cargos/hierarquia, permissões e overrides, membros/apelidos, moderação, banimentos e registro administrativo.
- Conversas: solicitações/spam, grupos, chamadas privadas com consentimento/histórico, reações, fixação, leitura, busca/contexto, threads, enquetes, menções e mídia.
- Soundboard autorizado por participante e chamada; eventos com interessados e lembretes; perfis por servidor e políticas de privacidade aplicadas às respostas e eventos.
- Revogação de assistência ao terminar a chamada. Identidades de operações continuam derivadas da sessão autenticada.

## Dados e configuração

Migrações **7 e 8 são aditivas**. Preservam contas, mensagens, conversas individuais e arquivos legados. Grupos usam tabelas próprias para preservar a restrição de pares das DMs antigas. Exclusões administrativas e de mensagens usam os campos de exclusão lógica previstos; não apagar o banco nem o volume de uploads. As migrações rodam na inicialização em transações.

Manter as variáveis de banco, TLS, uploads e TURN existentes. Nenhuma credencial está incluída no pacote preparado. SMTP é opcional: o usuário pediu preparar a configuração, sem serviço existente. `docs/CONFIGURACAO-EMAIL.md` documenta `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` e `PUBLIC_APP_URL`. Sem SMTP, o aplicativo informa indisponibilidade e não simula envio.

## Evidência local

`tests/community-features.test.js` verifica autorização, hierarquia, privacidade, migrações, sessões, SMTP isolado, TOTP, DMs/grupos/chamadas e mensagens avançadas. `tests/community-media.test.js` verifica transmissão/acesso ao soundboard, bloqueio de socket forjado, saída da voz, cooldown e lembrete de evento. Migrações PostgreSQL foram executadas no PGlite preservando linhas anteriores e permitindo reexecução; SQLite legado também passou. `tests/hosted-backend.js` inicia o pacote `artifacts/server-1.1.0` com dependências de produção e banco isolado, exercita site/API/sessões e oito migrações. Relatório: `docs/validation/hosted-backend-1.1.0.json`.

Limites locais: sem daemon Docker para testar a imagem; PGlite não verifica rede/TLS do PostgreSQL hospedado; SMTP de teste não comprova entrega de um provedor externo. Após a implantação, as migrações concluíram no PostgreSQL real e saúde, sessão anterior, APIs, Socket.IO, dados acessíveis e frontend foram conferidos na origem pública. Nenhum erro apareceu na consulta dos logs de erro entre 12:16:00Z e 12:17:47Z.

## Resultado após autorização

Workspace confirmado pelo usuário, serviço consultado e configuração existente preservada. O push do commit testado para `main` iniciou uma única implantação automática; não foi disparado outro deploy manual. Depois da aceitação pública, o mesmo instalador desktop foi publicado como versão estável/latest e o app anterior detectou/baixou o artefato validado. Os relatórios de implantação/publicação e o snapshot limitado documentam o escopo efetivamente conferido.
