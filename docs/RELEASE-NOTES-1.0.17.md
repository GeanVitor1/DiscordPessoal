## Movimento do mouse com o aplicativo aberto

- O aplicativo passa a usar renderização por software no Windows, para evitar a competição da interface com o compositor/GPU e problemas de compatibilidade que podem afetar o cursor mesmo sem chamada ou assistência.
- Uma segunda abertura do mesmo perfil ativa a janela existente e encerra o processo duplicado. Os processos internos de renderização continuam fazendo parte do funcionamento normal do Electron.
- O helper de controle permanece desligado quando não há assistência autorizada. As configurações do mouse e os drivers do Windows não são alterados.

## Atualização automática

O aplicativo baixa esta versão em segundo plano. Após concluir, use **Reiniciar e atualizar** ou feche o app para aplicar a atualização. Não é necessário baixar outro instalador manualmente.

## Validação e limites

44 testes de lógica aprovados, frontend de produção construído e helper C# recompilado. O pacote Windows confirmou aceleração de hardware desativada, bloqueio de segunda instância do mesmo perfil, 60 eventos de mouse recebidos em repouso e helper nativo inativo. Interface, RTC e captura de tela real 1920×1080 foram validados; mídia foi verificada em dois clientes empacotados. A entrada Windows passou no teste separado inicial; reexecuções do teste completo de assistência falharam por perda de foco no fixture e não são consideradas aprovadas. O helper de controle não mudou nesta versão.

O teste verifica a configuração e a resposta da interface. A sensação de atraso relatada no mouse físico não foi reproduzida em um benchmark de hardware; a correção aplica o modo de compatibilidade e elimina instâncias duplicadas. Renderização por software pode aumentar o uso de CPU durante vídeo. Não houve teste entre dois PCs físicos ou confirmação real de UAC.

Instalador construído em **06/10/2026 às 08:58:26 (America/Sao_Paulo)**.

SHA-256: `64d9fcc93d41684a9096a02617f68f136db445738bed9a204a101705e60c7b00`.
