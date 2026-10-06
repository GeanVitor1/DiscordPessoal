## Assistência remota no Windows

- Bloqueios temporários do Windows e teclas sem suporte agora mostram o motivo e preservam a autorização da assistência. Um comando válido permite continuar sem solicitar autorização novamente.
- A autorização local oferece controle de programas como administrador, com confirmação de UAC no computador compartilhado. Apenas o helper de entrada é elevado e ele encerra junto com a assistência.
- O helper verifica o desktop e o privilégio real antes de ativar o controle. O indicador não toma o foco da janela em uso.
- O diagnóstico identifica bloqueios conhecidos; erros de protocolo e perda de conexão continuam encerrando o controle e liberando as entradas mantidas.

## Atualização automática

O aplicativo baixa esta versão em segundo plano. Use **Reiniciar e atualizar** quando o download terminar, ou feche o aplicativo para aplicar a atualização. O canal recebe o instalador Windows x64, seu blockmap e o arquivo latest.yml correspondente.

## Validação

44 testes de lógica aprovados, frontend e C# compilados, testes nativos Windows, RTC, interface e aplicação empacotada aprovados. Dois clientes empacotados passaram em mouse, teclado, texto acentuado, arraste, scroll, recuperação após tecla rejeitada e encerramento da assistência. O conteúdo do instalador foi extraído e verificado contra o pacote testado.

Instalador gerado em **06/10/2026 às 07:45:37 (America/Sao_Paulo)**.

SHA-256: `5bfa905ec2a52e45ad520c9709d96d5828ac734cd9284bd186a6a3ddb59d7854`.

Os testes usam dois clientes no mesmo PC e janelas próprias. Dois PCs físicos, NAT/TURN externo, The Sims/mods e a confirmação real de elevação UAC não foram validados por automação. Avisos de UAC na tela protegida e o desbloqueio do Windows exigem ação local. A ocorrência exata das capturas originais não foi reproduzida.
