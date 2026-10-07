# Implementação da lista completa — entrega 1.1.0

## Retomada em 07/10/2026

**Versão 1.1.0 publicada e atualização automática verificada.** O desenvolvimento interrompido foi retomado e entregue a partir do commit `a6ba50a5d88761265cb7d2d2653ace84c4ae651c`. O instalador final em `artifacts/desktop-1.1.0/MeuApp-Setup-1.1.0.exe` foi gerado em **07/10/2026 às 09:08:47 (America/Sao_Paulo)**, SHA-256 `87d4409ad952828531c93a699d012cac28c580280a3084655c6b4d6e57ca89db`. O usuário autorizou explicitamente a implantação do backend em Gean's workspace no Render; ele está ativo e verificado. Release estável/latest: [v1.1.0](https://github.com/GeanVitor1/DiscordPessoal/releases/tag/v1.1.0), publicada às **09:17:35**. O app empacotado 1.0.20 detectou/baixou uma única vez o instalador correto e mostrou a ação de reinício; teste isolado não instalou sobre o app pessoal.

As pendências antigas abaixo são o registro histórico da interrupção, não o estado atual. Foram implementados perfis completos e por servidor, privacidade das respostas, busca global e navegação, menções, notificações por escopo, atividade automática, soundboard, idioma PT/en, atenuação real das sessões de áudio do Windows, clipboard com consentimento, revogação da assistência ao sair da voz, ordenação de categorias/cargos/canais e melhorias de mídia/reconexão. Migrações aditivas 7 e 8 preservam dados legados. SMTP está preparado e documentado em `CONFIGURACAO-EMAIL.md`; envio real depende da configuração do provedor escolhido pelo usuário.

Validação mais recente: **58 testes unitários/integração passaram**, incluindo migrações PostgreSQL em PGlite, soundboard e lembretes reais via Socket.IO. RTC, interface Electron, helper nativo, recursos desktop, inicialização, conteúdo do instalador, smoke do pacote e aceitação dos dois aplicativos empacotados passaram. A interface adicional criou servidor/categoria/cargo/override/evento e verificou limpeza de capturas tardias de microfone/webcam. O backend de produção preparado passou com banco isolado. A matriz `COBERTURA-LISTA-1.1.0.md` relaciona os 49 blocos ao código e registra limites.

### Etapas de entrega concluídas

1. Backend aprovado implantado no Render: deploy `dep-db33fubrjlhs7382aso0`, live em `2026-10-07T12:16:25Z`. Migrações 7/8 concluídas no PostgreSQL externo; configuração existente preservada. Sessão anterior e snapshot de 1 servidor/4 canais/1 mensagem preservados. Snapshot limitado em `artifacts/render-backup-1.1.0`; não equivale a um backup integral do PostgreSQL ou dos uploads. Relatórios `render-deploy-1.1.0.json` e `render-live-1.1.0.json`.
2. Mesmo instalador, blockmap e feed publicados pelo publisher; downloads públicos e checksums conferidos. `release-publication-1.1.0.json` registra os hashes e o commit da tag.
3. App 1.0.20 empacotado verificou o provedor GitHub real, download automático com SHA-512 correspondente e aviso de reinício. `published-updater-1.1.0.json` registra o perfil/cache isolados e instalação desabilitada durante o teste. As limitações da matriz de cobertura continuam aplicáveis; configurar SMTP externo continua sendo uma etapa do provedor escolhido pelo usuário.

Os cinco PNGs de validação que já estavam modificados foram preservados; os novos testes usam `community-call.png` e `community-dm.png`. Não versionar bancos, uploads, credenciais ou `artifacts/`.

---

## Registro histórico anterior à retomada

Pedido autorizado: implementar os ausentes e completar os parciais de `AUDITORIA-LISTA-COMPLETA-2026-10-06.md`, cobrindo os 49 blocos. Este arquivo é acompanhamento, não declaração de entrega.

O usuário informou que não há serviço de e-mail e escolheu **preparar a configuração**. Integração SMTP foi implementada e exercitada com um servidor SMTP local de teste; ainda é preciso documentar/configurar os parâmetros para ativar envio real. Não enviar credenciais ao chat.

Regras: migrações aditivas, identidade autenticada no servidor, preservar dados. Ao concluir: testes pertinentes, frontend, compilar NativeInputHost.cs, gerar instalador Windows com `--publish never` em `artifacts/desktop-<versão>`, verificar conteúdo do instalador/helper e aplicação empacotada. Publicação desktop está autorizada e é obrigatória; publicar exatamente os artefatos testados, commit/tag/push/release estável/latest via publisher e testar download pelo app antigo com perfil isolado. Implantação do backend precisa de aprovação explícita somente após preparar/testar a alteração. Não publicar um desktop dependente de backend ainda incompatível.

## Estado atual

- Versão continua 1.0.20 enquanto se desenvolve; ainda não há novo instalador/publicação desta solicitação.
- Migração 7 em desenvolvimento: contas, sessões, 2FA, preferências, categorias, cargos e overrides, moderação, grupos separados de DMs legadas, reações/pins/leitura, threads, assets, enquetes, eventos e chamadas privadas. Não foi aplicada no banco do usuário/produção.
- Backend: APIs de conta/privacidade/perfil, gerenciamento de servidores/canais/cargos/membros/banimentos/audit, DM/grupos/solicitações, mensagem avançada/threads/enquetes, mídia/eventos/prévia HTTPS com proteção SSRF, chamadas privadas e moderação de voz.
- Frontend: painéis de conta/privacidade/servidor; lista completa de membros por servidor; editor de categorias/canais/cargos/overrides/membros/eventos/assets; mensagens Markdown/spoiler/underline, anexos com players, picker/favoritos/recentes, gravação de voz; menus de mensagem, reações/pins/busca/threads/enquetes; grupos e solicitações; chamadas privadas com aceite/recusa/histórico; preferências de som/visual; processamento de microfone, ganho entrada/saída/por usuário, VAD/PTT, webcam e FPS; menus individuais e visualização de vídeo/PiP.
- Desktop: módulos novos de preferências, tray, hotkeys/PTT nativo via GetAsyncKeyState, overlay, APIs de processos/idle; integração e UI básica. Ainda precisa validar no Electron principal/empacotado.
- Testes existentes + 3 novos: 50 passaram no último `npm test`. Teste novo inclui vetores RFC 6238, SMTP local, reset de uso único, sessões, hierarquia/privacidade de canais, moderação, reações/pins/enquetes/threads/grupos e chamada privada antes/depois do consentimento.
- `test:rtc` passou. `test:ui` passou duas vezes após mudanças; última execução inclui pipeline de áudio e controles de participantes. Frontend compila em `artifacts/implementation-check/frontend` (aviso de tamanho de bundle).

## Pendências antes de considerar a lista completa

1. Conferir item a item contra auditoria, expandir testes e testar as novas telas; APIs e compilação sozinhas não concluem funcionalidades.
2. Concluir exposição do perfil (pronomes/conexões/mútuos/data/atividade), perfil por servidor, busca global/deep links/autocomplete/menções e permissões de notificação por servidor/canal.
3. Revisar privacidade das respostas e broadcasts: hoje publicUser carrega perfil completo; limitar segundo política e buscar perfil com acesso autenticado. Verificar asset references em edição/threads e custom reactions.
4. Completar atividade automática/idle usando APIs desktop, soundboard com transmissão e demais sons/controles; idioma selecionável precisa traduzir interface de fato, não somente mudar lang.
5. Atenuação de áudio precisa executar o comportamento (o slider ainda não altera sessões do Windows). Teste de ganho/microfone e configurações de dispositivos precisam cobertura adicional.
6. Revogar assistência ao deixar a chamada conforme item 19.20 do pedido, preservando independência do compartilhamento. Atualizar teste que atualmente exige sobrevivência ao sair da voz; adicionar nova verificação de revogação. Implementar clipboard opcional com consentimento específico e validação do grant.
7. Revisar lifecycle de chamadas privadas: timer vazio/reconexão/restart, saída de iniciador/grupo, bloqueio, política de chamada independente de política de DM, UI de chamada pelo perfil e erro de conexão.
8. Corrigir reorder/drag de categorias (hoje drop incorretamente pode trocar nome), permitir drag de cargos/canais, tornar payload/permissões da UI coerentes com ações autorizadas.
9. Revisar micropipeline e captura/troca de fonte: webcam reativa, preferências persistidas, rollback de erro, source replacement para branch navegador e observers/viewer state; adicionar indicadores/assistência central.
10. Verificar que drag & drop entrou no container real de mensagens e composição suporta multiline/Markdown sem quebrar testes. Melhorar seleção de usuário/participante sem expor IDs em fluxos comuns.
11. Scripts PowerShell com here-string piped ao Python podem ter perdido acentos nas strings inseridas; procurar/corrigir em FriendsHome.jsx, VoiceContext.jsx e quaisquer outros textos introduzidos dessa forma. Usar apply_patch para Unicode ou escapes Unicode no código Python.
12. Ajustar snapshots/validação para versão final, compilar helper, montar backend testado pronto para revisão, pedir aprovação de deploy conforme AGENTS.md, empacotar/verificar/publicar e testar atualização antiga.

## Preservação dos arquivos de validação

Havia cinco PNGs já modificados antes deste pedido. Cópias integrais estão em `artifacts/implementation-check/original-validation`. `test:ui` sobrescreve call.png/dm.png: salvar novos resultados em `artifacts/implementation-check/ui-validation` e restaurar os originais após o teste. A última segunda execução já foi restaurada. Não incluir essas modificações preexistentes em commit sem distinguir dos novos relatórios. Não adicionar artifacts, uploads, bancos ou credenciais ao Git.

## Referências técnicas consultadas

- [SMTP/Nodemailer](https://nodemailer.com/smtp).
- [TOTP/RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).
- [React Markdown](https://github.com/remarkjs/react-markdown), [GFM](https://github.com/remarkjs/remark-gfm).
- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray).
- [GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate), [Koffi](https://koffi.dev/load).
