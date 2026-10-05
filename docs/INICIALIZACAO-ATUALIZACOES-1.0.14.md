# Inicialização e atualização automática — 1.0.14

Entrega local em 05/10/2026. O instalador foi criado às **14:20:54, America/Sao_Paulo** (17:20:54.761Z).

## Resultado e pendência online

O aplicativo instalado conecta automaticamente a `https://discordpessoal.onrender.com`. O site usa sua própria origem para API, arquivos e Socket.IO; não precisa de Vite em produção. Endereços de desenvolvimento salvos por versões anteriores não substituem a conexão automática. Uma escolha explícita em **Opções avançadas** continua disponível, com contas e tokens isolados por origem. O retorno ao modo automático preserva os tokens de servidores personalizados.

O serviço público foi consultado nesta entrega, somente por leitura: responde `status: ok`, mas não identifica `authentication: sessions-v1`; portanto ainda está no backend antigo. O aplicativo detecta essa incompatibilidade antes de enviar credenciais e avisa que o serviço precisa ser atualizado. Não inventa uma conexão bem-sucedida nem cria um servidor local separado para cada PC. O último release público disponível é `v1.0.10`.

**O objetivo de uso online sem terminais ainda depende de publicar o backend/site preparado e o release 1.0.14.** Nenhum deploy, commit, tag, push ou release remoto foi realizado. Isso respeita a solicitação anterior de não executar release remoto e o AGENTS.md. Não há credencial Render ou GitHub configurada no ambiente desta entrega.

O pacote preparado em `artifacts/server-1.0.14` contém o backend, dependências declaradas e frontend compilado em `public/`, sem banco, uploads, credenciais ou dependências instaladas. Pode atualizar o serviço existente, mantendo suas variáveis de ambiente e volumes. As migrations existentes são aditivas. O usuário final apenas abre o site HTTPS ou o atalho do aplicativo, depois que esse serviço estiver atualizado.

## Correções

- `client/src/connection.js` e `config.js`: uma única origem para API e signaling; desktop com padrão online; web com origem do site; validação de URL; endereços antigos de desenvolvimento ignorados no modo automático.
- `context/AuthContext.jsx`, `main.jsx`, `components/LoginScreen.jsx` e `App.jsx`: health check antes de autenticar, reconhecimento de backend antigo, retentativas automáticas e reconexão ao recuperar a internet. Uma indisponibilidade temporária ao restaurar a sessão preserva o token. Apenas uma sessão recusada/expirada remove a credencial. Nenhum POST de login/cadastro é repetido automaticamente.
- `server/src/web.js` e `application.js`: frontend de produção servido junto do backend. HTML sem cache persistente; assets com hash têm cache imutável. API, uploads e Socket.IO não recebem HTML como fallback.
- `desktop/updates.js`, `main.js` e `preload.cjs`: atualizador existente corrigido. Verifica ao abrir e a cada 15 minutos; baixa automaticamente uma vez; instala no fechamento normal; impede downgrade; conserva estado no processo principal; permite instalar manualmente apenas após download validado. Falhas e ausência de releases nunca são apresentadas como “atualizado”.
- `hooks/useUpdates.js`, `components/UpdateNotice.jsx` e `UserSettingsModal.jsx`: estado consistente entre login, aplicativo e configurações. Atualização pronta aparece também antes de entrar na conta. Reinício imediato depende do botão do usuário; chamadas não são interrompidas para atualizar.
- `scripts/validate-production-build.js`, `verify-package.js`, `prepare-hosted-server.js` e `finalize-dist.ps1`: build com configuração padrão, verificação do canal de atualização/checksum, preparação do pacote hospedado e organização dos artefatos locais.

A política de download e instalação usa o electron-updater 6.8.9 já instalado; as instruções da [documentação oficial da versão 26 do electron-builder](https://www.electron.build/v26/docs/features/auto-update/) foram conferidas. O provider GitHub vem do `resources/app-update.yml` produzido pelo builder, sem endpoints fornecidos por um renderer. Nenhum token de publicação é distribuído no aplicativo.

## Verificação

| Verificação | Resultado e alcance |
| --- | --- |
| `npm test` | 39 testes passaram: 26 cliente e 13 backend/desktop, incluindo origem automática, backend legado, autenticação, migrations preservando dados e atualizador. |
| RTC e interface | Passaram: mídia bidirecional, chat, amigos/DMs, configurações, consentimento, revogação e reconexão de voz. Mídia e canvas desses testes são sintéticos. |
| Startup web de produção | Passou sem Vite: backend real isolado serve o bundle; reconexão automática, sessão preservada durante 503, remoção de sessão revogada e bloqueio de credenciais em backend antigo. |
| Frontend e helper | Frontend compilado; `NativeInputHost.cs` recompilado pelo compilador C# do Windows. |
| Aplicação empacotada | Versão 1.0.14 abriu; configurações abriram/salvaram/reabriram; chamada entrou/saiu; captura real de tela 1920×1080; helper respondeu a PING; nenhum ReferenceError/TypeError no renderer. Microfone sintético. |
| Atualizador real | Instalador atual foi baixado por electron-updater de um feed local de teste; download único; SHA-512 correto aceito; SHA-512 adulterado recusado; instalação indisponível após falha. Feed simula uma versão futura. Nenhum aplicativo instalado foi substituído. |
| Conteúdo real do NSIS | Instalador extraído: EXE principal, ASAR e helper correspondem byte a byte à aplicação validada. Helper extraído corresponde à compilação nova em `resources/app.asar.unpacked/desktop/NativeInputHost.exe`. |
| Dois EXEs: áudio da tela | Passou nesta execução até a fase de input: bytes RTP enviados/recebidos 4.793 → 14.121; pacotes 65 → 229; RMS decodificado 0,02173; elemento de áudio reproduzindo, sem mute e com volume 1. Loopback Windows real e tom externo ao Electron; microfones sintéticos. |
| Entrada Windows | O teste nativo individual passou na primeira execução desta entrega. Novas execuções do teste individual e de dois EXEs foram interrompidas por `TEST_WINDOW_NOT_FOREGROUND`: Windows recusou foco na janela pertencente ao teste. As proteções bloquearam input, sem injetá-lo em outra janela. O teste completo de controle empacotado não é considerado aprovado nesta execução. Nenhuma alteração no protocolo, consentimento, guard ou código C# foi feita nesta tarefa. |

Relatórios em `docs/validation/build.json`, `packaged.json`, `startup.json`, `updater.json`, `installer-payload.json` e `native-pipeline-probe.json`. Relatórios de versões anteriores não são evidência de aprovação da versão atual.

Não foram validados: deploy online, atualização substituindo uma instalação real, dois PCs físicos, microfone físico ou NAT/TURN externo. A indisponibilidade do serviço hospedado não pode ser resolvida apenas com um novo EXE local.

## Artefatos

- Instalador único em `dist/MeuApp-Setup-1.0.14.exe`.
- SHA-256: `0fb08bbe15cd66f8b3094a7567d2a33080cfbd9b2dab3e102748ae44346a6fce`.
- `dist/latest.yml` e o blockmap atual permanecem para o canal de atualização; não são outros executáveis.
- Aplicação desembrulhada para auditoria em `artifacts/desktop-1.0.14/win-unpacked`; helper em `resources/app.asar.unpacked/desktop/NativeInputHost.exe`.
- Site/backend preparado em `artifacts/server-1.0.14`.

Instaladores antigos foram removidos de `dist`. Dados do projeto, contas, mensagens, uploads e instalações existentes foram preservados.
