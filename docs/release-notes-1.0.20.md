Corrigido o caminho de movimento do mouse na assistência: o helper usa entrada absoluta do Windows e confere a posição física antes de confirmar a execução. A movimentação deixa de depender de uma chamada prévia a SetCursorPos. Quando necessário, há uma tentativa pela API de posicionamento físico, também com verificação do resultado.

O diagnóstico evita reutilizar um código de erro antigo de outra chamada do Windows. As proteções de autorização, desktop de entrada e privilégios permanecem ativas. Compartilhamento e assistência continuam com sessões e ciclos de vida independentes.

Validação: mouse, cliques, duplo clique, arraste, scroll, teclado, texto com acentos e liberação de entradas ao encerrar passaram com o Mouse Without Borders aberto neste PC. Dois clientes empacotados confirmaram controle real em uma janela de teste e assistência funcionando após parar o compartilhamento. O helper recompilado foi conferido dentro do instalador NSIS.

Limitações: os testes automatizados usam dois clientes no mesmo Windows e uma janela pertencente ao teste. Esta versão ainda precisa ser conferida pelo usuário entre os dois PCs, com o Mouse Without Borders aberto em ambos. UAC real, telas seguras e NAT/TURN externo não foram automatizados; não há garantia de compatibilidade com todas as configurações de terceiros.

Atualize os dois computadores para 1.0.20 pelo canal automático. Nenhuma mudança de backend é necessária para esta atualização.
