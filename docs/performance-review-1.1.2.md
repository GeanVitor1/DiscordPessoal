# Revisão de desempenho e experiência — 1.1.2

O relato de lentidão também sem compartilhamento orientou a revisão de conversas, presença e sinalização, além da assistência. As alterações do desktop preservam o visual da 1.1.1 e são compatíveis com o backend atual.

## Gargalos corrigidos

- Cada tecla emitia um aviso de digitação. Agora o início é limitado a uma emissão por segundo, com parada após inatividade.
- A chamada aguardava a enumeração completa dos dispositivos após obter o microfone. A enumeração agora ocorre em paralelo à sinalização, preservando cancelamento e liberação do microfone.
- O mouse acumulava posições antigas na fila de confirmações nativas. Apenas movimentos consecutivos ainda pendentes são substituídos; cliques e outras entradas formam barreiras ordenadas. Revogação descarta os comandos pendentes.
- Diagnósticos de movimentos provocavam atualizações frequentes no React. Sucessos são amostrados por tipo a cada 200 ms; falhas continuam imediatas e as confirmações de transporte continuam reais.
- Presença idêntica era reenviada a cada dez segundos, além de eventos redundantes de entrada/status. O desktop publica mudanças e uma manutenção a cada cinco minutos. Atualizações sociais concorrentes usam uma execução ativa e uma atualização pendente.
- A conversa não mostrava feedback até chegar a confirmação. A prévia “Enviando…” aparece enquanto aguarda e não libera ações de mensagem salva. Confirmações canônicas retornadas pelo servidor são deduplicadas por ID; o protocolo anterior por evento continua funcionando.

## Comparação controlada

| Medição | 1.1.1 | 1.1.2 |
| --- | ---: | ---: |
| Primeiro feedback ao enviar | 326 ms | 167 ms |
| Confirmação da mensagem | 506 ms | 356 ms |
| Avisos de início de digitação em 34 teclas | 34 | 1 |
| Entrada na chamada | 457 ms | 99 ms |
| Fila de 80 posições, auxiliar simulado de 15 ms por comando | 1.433 ms | 20 ms |
| Fila de 80 posições com auxiliar real do instalador | 80 comandos / 61 ms | 1 comando / 1 ms |

As medições da interface usam o aplicativo empacotado e backend local isolado, com 250 ms artificiais no envio, 60 ms no microfone e 350 ms na enumeração. O teste nativo usa somente uma janela própria protegida; as duas versões terminam na mesma posição. Estes valores demonstram a eliminação de espera do aplicativo, não uma promessa sobre a rede do usuário. Com o backend anterior, a versão 1.1.2 confirmou envio e chamada normalmente (relatório `performance-packaged-1.1.2-legacy-backend.json`).

## Backend preparado, implantação pendente

O servidor aguarda a persistência, confirma primeiro o remetente e evita consultas de cargos quando não há menção de cargo. Mantém filtragem de privacidade por destinatário. Uma falha na entrega a outro cliente não informa falsamente que a mensagem salva falhou. Publicações repetidas de presença são agrupadas; atividade idêntica evita escrita e recarga de associação. Nenhuma migração nova é necessária; o esquema permanece na versão 8.

O pacote de produção em `artifacts/server-1.1.2` passou no teste local de web/API, sessões e esquema. A implantação em `discordpessoal.onrender.com` aguarda a autorização específica exigida pelo AGENTS.md. A publicação desktop usa o ramo de atualização, sem acionar implantação de backend.

## Pontos restantes da análise

1. Históricos de canais e DMs renderizam todas as mensagens já carregadas. Conversas longas merecem virtualização, preservando busca, respostas, posição da rolagem e acessibilidade; a contagem inicial de 100 não limita uma sessão longa.
2. A distribuição de presença ainda faz consultas de associação/privacidade por usuário. O agrupamento remove filas redundantes, mas servidores com muitos membros precisam de medição com carga e consultas em lote que mantenham as permissões.
3. O aplicativo opera com renderização por software por compatibilidade. Vídeos, GIFs e sombras podem consumir CPU; uma comparação de aceleração gráfica deve incluir o hardware do usuário e os testes de captura/entrada antes de alterar o padrão.
4. A interface agora diferencia “Enviando…” de uma mensagem salva. Chamadas e assistência ainda podem explicar melhor as fases de conexão e reconexão, com diagnóstico de rede mensurável. O rótulo atual “Conectado à chamada” sozinho não prova que o áudio do outro participante já chegou.

## Validação e limites

64 testes unitários/integração passaram. Fluxos completos de UI, WebRTC, cancelamento de mídia, entrada nativa, overlay e isolamento de credenciais passaram. Os testes de UI foram corrigidos para aguardar botões habilitados e a chegada assíncrona do estado do overlay, evitando corridas do próprio teste.

Build frontend, compilação dos dois helpers C#, extração/inspeção do NSIS, comparação do asar com o código e início do auxiliar extraído passaram. A validação empacotada confirmou ausência de erros de runtime. Dois aplicativos no mesmo Windows validaram captura, loopback, RTP, exclusão do áudio próprio e assistência completa com entrada nativa, cliques, arraste, rolagem, teclado, liberação de teclas e revogação. O teste confirmou a independência da captura da assistência e do compartilhamento e a manutenção da chamada ao parar a tela. Não houve medição em dois computadores físicos, internet do usuário, NAT, fluxo administrativo/UAC ou fluidez subjetiva em outros equipamentos. A publicação pública e o download pelo atualizador anterior são registrados separadamente após a publicação.
