Assistência remota agora possui sessão, autorização, captura de tela, conexão WebRTC e painel próprios. O vídeo compartilhado continua apenas como transmissão e visualização.

Encerrar a assistência remove o controle e libera as entradas, mantendo o compartilhamento. Parar de assistir, encerrar a transmissão ou sair da chamada preserva a sessão de assistência autorizada e sua própria imagem. Desconexão, encerramento explícito ou falha da assistência removem o controle.

Mouse, cliques, arraste, scroll, texto e teclado são aplicados pelo helper do Windows, com confirmação real de execução. O diagnóstico diferencia rejeições de autorização, comandos pendentes, restrições do Windows e falhas de comunicação. A escolha da tela autorizada é independente do compartilhamento.

Validação: testes de autenticação e isolamento, regressões de interface/WebRTC, helper compilado, instalador NSIS verificado e dois clientes empacotados com SendInput real em uma janela de teste. Limitações: os dois clientes usam o mesmo computador; dois PCs físicos, NAT/TURN externo, tela protegida e aprovação UAC real não foram automatizados.
