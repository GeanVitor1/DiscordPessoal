MeuApp 1.1.2 reduz trabalho repetido e melhora a resposta das conversas, chamadas e assistência.

- Mensagens mostram imediatamente uma prévia com “Enviando…”. A confirmação continua dependendo do servidor; falhas preservam o rascunho.
- Avisos de digitação são limitados durante a digitação contínua, reduzindo tráfego e consultas repetidas.
- A entrada em chamada deixa de esperar pela enumeração de dispositivos depois da permissão do microfone.
- Na assistência, posições antigas ainda aguardando execução são substituídas pela posição mais recente. Cliques, teclas, rolagem e comandos de área de transferência mantêm sua ordem e autorização.
- Atualizações de diagnóstico do mouse são amostradas, reduzindo renderizações; erros e confirmações reais continuam tratados.
- Atualizações repetidas de conversas são agrupadas. Presença é enviada quando muda ou no intervalo de manutenção, evitando avisos idênticos a cada dez segundos.

Compatibilidade validada com o servidor atualmente publicado. As otimizações adicionais do backend foram preparadas e testadas, mas sua implantação é separada e aguarda autorização. Esta publicação não altera o servidor nem o banco de dados.

Validação: 64 testes automatizados, fluxos de interface e WebRTC, helpers C# recompilados, instalador NSIS inspecionado e aplicativo empacotado testado. Dois clientes no mesmo Windows validaram captura, áudio loopback, RTP e assistência completa: mouse, cliques, arraste, rolagem, teclado e revogação. A fila do cursor também foi comparada separadamente com o auxiliar real em janela própria. Microfones e atrasos de comparação são sintéticos. As medições locais não representam latência de internet entre dois computadores físicos, NAT ou UAC.
