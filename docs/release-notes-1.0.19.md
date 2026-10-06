Corrigida uma falha de conexão do helper ao desktop de entrada que podia impedir mouse e teclado e aparecer incorretamente como “tela protegida”. As entradas agora são executadas por uma thread MTA dedicada, com reconexão por uma thread nova quando necessário. Desktops normais com nomes diferentes de Default são aceitos; login, bloqueio, UAC e restrições reais de integridade continuam protegidos.

A assistência abre ampliada, ocupando a área principal do aplicativo, com opções de tela cheia e redução. Os controles ficam fora da imagem para preservar a área clicável. No computador assistido, o aviso é compacto e identifica claramente que ele está recebendo assistência.

A captura consulta diretamente o monitor autorizado, sem buscar miniaturas e ícones de outras janelas. O diagnóstico preserva o código e o detalhe da falha nativa e só confirma controle após execução pelo Windows.

Validação: regressão reproduzida na 1.0.18, helper recompilado, entradas reais em uma janela pertencente ao teste, instalador NSIS conferido e testes com dois clientes empacotados. Dois PCs físicos, NAT/TURN externo, tela segura real e aprovação UAC não foram automatizados. Atualize os dois computadores para 1.0.19.
