MeuApp 1.1.1 melhora a apresentação e a organização do aplicativo.

- Configurações em uma janela ampla, com menu vertical por categoria e busca que aceita palavras sem acentos.
- Edição de perfil com prévia ao vivo, campos de identidade primeiro e indicação de alterações pendentes. Rascunhos são mantidos ao trocar de categoria.
- Perfis com banner, cores, biografia e conexões organizados, além das abas Sobre, Atividade e Em comum. O próprio perfil tem um botão para abrir sua edição.
- Conexões preenchidas em campos separados de nome e endereço, com validação de links HTTPS.
- Ferramentas da conversa e chamadas com ícones, botões e explicações ao passar o mouse.
- Transições curtas que respeitam a opção Reduzir movimento e a preferência do sistema. Navegação por teclado com foco dentro das janelas e fechamento com Escape.
- Galerias animadas e seções de configurações carregadas sob demanda; abertura sem dependência de fontes externas; relógio de chamada atualizado apenas durante uma chamada ativa.

Dados existentes preservados. Esta atualização usa os recursos já disponíveis no servidor e não exige implantação do backend.

Validação: testes automatizados, fluxos completos de interface, compilação dos helpers C#, inspeção do instalador NSIS e testes do aplicativo empacotado. Microfones sintéticos nos testes; captura de tela, áudio loopback e entrada nativa verificados em um único computador Windows. Uso em dois computadores físicos, UAC e avaliação de fluidez em outros equipamentos não foram automatizados.

Limitação nesta sessão: o Windows recusou o foco da janela protegida na etapa de entrada nativa do teste completo entre dois clientes (`TEST_WINDOW_NOT_FOREGROUND`). O teste de mídia entre os dois clientes passou, e mouse, teclado e liberação de teclas foram validados separadamente na janela nativa de teste. O código do helper e do controle remoto não foi alterado por esta versão.
