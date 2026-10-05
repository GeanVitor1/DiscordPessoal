# Backend 1.0.15 publicado no Render

Backend e site publicados em https://discordpessoal.onrender.com em **05/10/2026 às 15:33:18 (America/Sao_Paulo)**. Serviço `DiscordPessoal`, workspace confirmado `Gean's workspace`, deploy `dep-db1uqimgekts739cht5g`, commit `a81a942b9e5a1a463ea8e7b2ecb8dd6eb832f20f`, estado `live`.

A branch `deploy/render-1.0.15` contém o backend e o bundle web já validados. O avanço de `main` iniciou o deploy automático. A área de trabalho original e suas alterações em andamento foram preservadas. Nenhum release do instalador ou tag foi publicado.

O PostgreSQL externo e as variáveis existentes do serviço foram mantidos. As migrations 003, 004, 005 e 006 concluíram em produção. A comparação com a cópia obtida da API antiga confirmou a preservação do servidor, quatro canais e uma mensagem anteriores. Essa cópia está em `artifacts/render-backup-1.0.15`; não substitui um backup completo do PostgreSQL. A API antiga não retornou referências a uploads no conjunto acessível. O serviço usa plano gratuito, sem disco persistente apresentado pela API do Render; a durabilidade de novos uploads entre deploys não foi validada.

Antes do deploy, os 14 testes do workspace passaram. As quatro suites de integração também passaram na área isolada de deploy. A primeira execução concorrente após instalar dependências excedeu o prazo de inicialização do teste de saúde; a execução sequencial passou todas as suites.

Após o deploy, foram verificados HTTP 200 e `sessions-v1` em `/api/health`, hashes dos bundles JS/CSS, cadastro/login em PostgreSQL, identidade determinada pelo servidor, rejeição de acesso anônimo e token falso, Socket.IO autenticado e encerramento da conexão por revogação da sessão. Uma conta de verificação foi criada; suas credenciais não foram persistidas e suas sessões foram revogadas. Nenhuma mensagem, servidor, convite ou arquivo de teste foi criado em produção. A consulta de logs de erro entre 15:33 e 15:34:59 não encontrou erros.

Evidências: `docs/validation/render-deploy-1.0.15.json` e `docs/validation/render-live-1.0.15.json`.

O instalador local correspondente é `C:\Users\geand\OneDrive\Documentos\Discord\dist\MeuApp-Setup-1.0.15.exe`, versão **1.0.15**, construído em **05/10/2026 às 15:15:56 (America/Sao_Paulo)**. O helper foi compilado e verificado em `dist/win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe` e no conteúdo extraído do instalador. Não houve mudança no código desktop durante esta publicação; as evidências de build e aplicação empacotada permanecem em `docs/validation/features-delivery.json`, `build.json`, `installer-payload.json` e `packaged.json`.

Limitações: o navegador integrado estava indisponível nesta sessão; a validação online foi feita pela API e Socket.IO. Não houve teste entre dois computadores físicos ou NAT/TURN externo. Na entrega local anterior, o teste físico individual de input Windows passou na primeira construção e falhou em reexecuções por foco/duplo clique; essa limitação permanece. O helper empacotado respondeu a PING.
