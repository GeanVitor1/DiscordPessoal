# Assistência no Windows — 1.0.16

## Diagnóstico

A captura fornecida mostra uma sessão autorizada que termina com “Entrada nativa falhou”. O código anterior revogava a autorização após qualquer erro do helper, inclusive uma tecla sem mapeamento ou um bloqueio temporário do Windows. O erro exato do computador do usuário não estava nos logs disponíveis: os detalhes de ACK ficavam desabilitados na versão de produção.

O teste inicial do pacote 1.0.15 passou com dois clientes no mesmo Windows. Portanto, a causa específica daquela ocorrência não foi reproduzida nem atribuída definitivamente a permissões de administrador.

## Referências consultadas

- [AnyDesk: privilégios administrativos e UAC](https://support.anydesk.com/administrative-privileges-and-elevation-uac): programas elevados exigem elevação do controle remoto; a instalação com serviço oferece capacidades adicionais para avisos de UAC.
- [Microsoft: SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput): a injeção obedece aos níveis de integridade; UIPI pode bloquear a entrada sem indicar claramente a causa no código Win32.
- [Microsoft: SetCursorPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setcursorpos): a thread precisa estar associada ao desktop de entrada.
- [Microsoft: segurança de named pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) e [níveis de impersonação](https://learn.microsoft.com/en-us/windows/win32/secauthz/impersonation-levels): controle de acesso e identificação do processo no canal entre helpers.

## Alterações

O helper verifica o desktop de entrada e o nível de integridade do programa em foco e da janela sob o ponto enviado. A inicialização consulta STATUS antes de conceder acesso: confirma acesso ao desktop, tamanho da estrutura de entrada e privilégio real do helper, sem injetar mouse ou teclado.

Bloqueios de desktop protegido, exigência de elevação, bloqueios temporários de entrada e teclas sem suporte são reportados aos clientes sem encerrar a sessão. O próximo comando válido limpa o aviso. Falhas de protocolo, perda do processo, falta de ACK e revogação continuam encerrando o controle. Após um bloqueio, o helper tenta soltar entradas anteriores antes de continuar.

O diálogo local oferece “Permitir controle de programas como administrador (o Windows pedirá confirmação)”, desmarcado por padrão. Ao marcar, apenas um processo do helper é elevado por runas. O canal de comunicação tem ACL explícita para o usuário e administradores, verifica o PID do processo em ambas as pontas e usa identificação sem impersonação do cliente. O encerramento do processo Electron, do broker ou da sessão fecha o canal e encerra o helper; a limpeza também ocorre se a leitura do pipe falhar.

O indicador é exibido sem tomar o foco. Solicitações locais simultâneas são recusadas e callbacks de processos antigos não podem revogar a sessão de outro helper. Rejeições passam a ser registradas também em produção, com comando, sequência, código e privilégio; texto digitado e credenciais não são registrados.

O banco e o backend não precisam de alteração para estas correções. A identidade e o token continuam vinculados à conta autenticada e à autorização da sessão.

## Como usar

Instale MeuApp 1.0.16 nos computadores que utilizam o aplicativo desktop. O computador a ser controlado deve compartilhar uma tela inteira. O outro participante solicita assistência; a pessoa no computador compartilhado autoriza o diálogo local. Para programas abertos como administrador, marque a opção de administrador e confirme o aviso do Windows nesse computador.

Se o Windows mostrar uma tela protegida de UAC ou bloquear a sessão, a pessoa no computador compartilhado precisa confirmar o aviso ou desbloquear a tela localmente. Esta implementação não instala um serviço de sistema para controlar Winlogon/UAC, nem oferece acesso sem autorização.

## Validação e limites

- 44 testes de lógica passaram; os testes específicos do protocolo nativo foram repetidos após a compilação final.
- Frontend de produção construído e NativeInputHost.cs recompilado.
- RTC, interface Electron e smoke de IPC passaram.
- Entrada Windows real em janela pertencente ao teste: mouse, drag, clique direito, duplo clique, scroll, Unicode, Ctrl+A e soltura de teclas no EOF.
- O mesmo teste passou usando o broker e o pipe real com ACL e verificação de PID, no privilégio atual. O teste não confirma UAC automaticamente.
- Dois clientes do pacote 1.0.16 passaram: ponteiros e texto gerados por CDP, entrada física no alvo Windows, clique esquerdo/direito/central, duplo clique, arraste, scroll nas duas direções, texto acentuado e atalhos. A rejeição real de uma tecla desconhecida chegou ao viewer, preservou a autorização e desapareceu após um comando válido. Encerrar a assistência soltou entradas e preservou voz e transmissão; fechar o DataChannel encerrou o helper.
- A aplicação empacotada passou no smoke de interface e captura real 1920×1080, sem erros de renderer. O instalador NSIS foi extraído, incluindo seu arquivo app-64.7z interno; EXE, ASAR e helper foram comparados ao pacote validado. O helper extraído é idêntico à compilação final e inicia corretamente.
- Os resultados finais do instalador e dos clientes empacotados estão em `validation/build.json`, `validation/installer-payload.json`, `validation/packaged.json` e `validation/two-desktops.json`. Os testes nativos estão em `validation/native.json` e `validation/native-relay.json`.

Os testes usam janelas próprias e bancos temporários. Não substituem um teste entre dois PCs físicos, através de NAT/TURN, com The Sims e mods reais. A elevação com confirmação de UAC e o controle de programas elevados não foram validados por automação. A falha original depende da situação do Windows no outro computador; a versão nova identifica os bloqueios conhecidos e preserva a sessão nos erros recuperáveis.

Construção local com `electron-builder --win --publish never`. Caminho, versão, hashes e data/hora exatos do instalador são registrados em `validation/build.json`. A publicação no canal automático ocorreu depois da autorização permanente do usuário, conforme registrado abaixo.

Instalador: `C:\Users\geand\OneDrive\Documentos\Discord\dist\MeuApp-Setup-1.0.16.exe`, versão **1.0.16**, gerado em **06/10/2026 às 07:45:37 (America/Sao_Paulo)**, equivalente a `2026-10-06T10:45:37.999Z`.

SHA-256 do instalador: `5bfa905ec2a52e45ad520c9709d96d5828ac734cd9284bd186a6a3ddb59d7854`.

Helper verificado em `dist/win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe` e no conteúdo extraído do NSIS em `artifacts/installer-verification-1.0.16/resources/app.asar.unpacked/desktop/NativeInputHost.exe`. SHA-256: `ebc1cf3ab94f6e7fb95510a432132e33d0b69549520cc60df5dfde90d8190cdc`.

Os primeiros testes com ponteiros Chromium precisaram de correção no fixture: `sendInputEvent` exige foco na janela do viewer, incompatível com reservar o foco físico para a janela protegida do host num único PC. A versão final usa CDP no viewer e um FOCUS_TEST restrito ao alvo do teste antes de cada comando no helper. A validação da elevação usa o mesmo canal entre processos, mas sem solicitar elevação real durante o teste. Estas substituições não fazem parte da execução normal do aplicativo distribuído.

## Publicação no atualizador

O usuário concedeu autorização permanente em 06/10/2026 para publicar as próximas atualizações validadas. A regra está em AGENTS.md. O código da 1.0.16 foi associado ao commit `f9d48ad821cd446bec655a0d1c048d458aae5be6` e publicado na branch `desktop-updates/v1.0.16`, preservando o backend existente.

A [release 1.0.16](https://github.com/GeanVitor1/DiscordPessoal/releases/tag/v1.0.16) foi publicada como estável e mais recente em **06/10/2026 às 08:10:47 (America/Sao_Paulo)**. Ela contém o instalador validado, seu `.blockmap` e `latest.yml`. Os três downloads públicos correspondem aos arquivos locais e o feed público aponta para a versão correta. Relatório: `validation/release-publication-1.0.16.json`.

Uma cópia real e isolada do pacote 1.0.15 encontrou a atualização 1.0.16 usando seu próprio provider GitHub, baixou o instalador automaticamente uma única vez, confirmou o SHA-512 esperado e exibiu “Reiniciar e atualizar”. O perfil e o cache foram isolados e a instalação foi desativada somente no teste, para preservar a instalação real do usuário. Relatório: `validation/published-updater-1.0.16.json`.

A criação da tag pela API também disparou o workflow legado de build, que falhou na etapa de compilação e não publicou artefatos. A publicação direta dos arquivos já testados passou. O publisher foi atualizado para pausar temporariamente esse rebuild durante publicações futuras e restaurar o estado original do workflow; assim ele preserva os arquivos que passaram na validação local.
