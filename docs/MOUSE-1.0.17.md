# Mouse e aplicativo em repouso — 1.0.17

O usuário confirmou que o cursor apresenta dificuldade mesmo com o aplicativo em repouso, sem chamada, transmissão ou assistência. Na inspeção dos processos em execução havia um processo principal MeuApp e seus processos Chromium; nenhum NativeInputHost estava ativo. Não havia evidência de injeção de mouse naquele momento. Não foi identificado um driver específico nem reproduzida a percepção de atraso do mouse físico.

A correção estabelece o modo de renderização por software no Windows antes de iniciar o Electron e aplica uma trava por perfil. Uma segunda abertura do mesmo perfil retorna à janela existente. Perfis isolados podem continuar coexistindo, como nos testes de dois clientes. Não há alteração em aceleração/sensibilidade do mouse, registro, drivers ou dados do usuário.

Referência: [Electron — disableHardwareAcceleration e requestSingleInstanceLock](https://www.electronjs.org/docs/latest/api/app). A composição por software foi confirmada pelo Electron empacotado: hardwareAcceleration=false e gpu_compositing=disabled_software.

O build usa `artifacts/desktop-1.0.17`, porque o aplicativo 1.0.16 estava aberto a partir de `dist/win-unpacked`. Nenhum executável dessa instalação em uso precisou ser substituído durante a construção. O publisher, verificador de instalador e testes agora aceitam a pasta de saída isolada.

## Artefatos

Instalador: `C:\Users\geand\OneDrive\Documentos\Discord\artifacts\desktop-1.0.17\MeuApp-Setup-1.0.17.exe`.

Versão: **1.0.17**. Construído em **06/10/2026 às 08:58:26 (America/Sao_Paulo)**, equivalente a `2026-10-06T11:58:26.762Z`.

SHA-256 do instalador: `64d9fcc93d41684a9096a02617f68f136db445738bed9a204a101705e60c7b00`.

Helper conferido no pacote em `artifacts/desktop-1.0.17/win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe` e no NSIS extraído em `artifacts/installer-verification-1.0.17/resources/app.asar.unpacked/desktop/NativeInputHost.exe`. SHA-256: `79a0de275215ef1500a5da6c815729c1b364b9ae98254ca89baa540b5bc9daa7`.

## Verificação

- 44 testes de lógica aprovados.
- Frontend construído e NativeInputHost.cs recompilado.
- RTC, interface Electron, IPC e entrada Windows em janela própria aprovados.
- Pacote Windows: renderização por software confirmada; uma segunda execução do mesmo perfil encerrou com código zero e manteve uma única janela principal.
- Em repouso: os 60 eventos de ponteiro CDP foram recebidos; helper STOPPED, sessão INACTIVE e lastInput=null. Esses eventos não reposicionam o cursor físico do Windows.
- Smoke de temas, preferências, chat, convites, chamada e captura real 1920×1080 aprovado, sem erros de renderer.
- Os arquivos de aplicação e helper extraídos do NSIS correspondem ao pacote e à compilação atuais.
- Os resultados de assistência/mídia e do atualizador estão em `validation/two-desktops.json` e `validation/published-updater-1.0.17.json`, respectivamente. Metadados e checksums: `validation/build.json`, `validation/installer-payload.json` e `validation/release-publication-1.0.17.json`.

## Limites

O teste não mede a sensação de atraso do mouse físico nem identifica um driver gráfico culpado. A mudança elimina o uso de aceleração GPU pelo app no Windows e previne aberturas duplicadas do mesmo perfil. Renderização por software pode consumir mais CPU com vídeo; captura e mídia foram aprovadas no modo novo em dois clientes no mesmo PC.

O teste nativo separado inicial passou; as reexecuções do teste completo de assistência falharam por recusa/perda de foco da janela protegida do teste, inclusive na contagem de keyup após revogação. Esses runs não são considerados aprovados. O teste final de dois clientes foi restrito à regressão de mídia, sem reposicionar o cursor físico nem injetar teclado. As alterações tentadas para estabilizar o foco do fixture no C# foram revertidas; o código do helper é o mesmo da 1.0.16, recompilado, e o protocolo do helper final passou novamente. Não houve teste entre dois PCs físicos, sob NAT/TURN externo ou em UAC protegido.

A instalação da atualização não é executada sobre a instalação real do usuário pelo teste. O atualizador é verificado com perfil/cache isolados e a instalação no fechamento é desativada somente nessa cópia de teste.
