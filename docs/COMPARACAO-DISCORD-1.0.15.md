# Comparação de funcionalidades: Discord e MeuApp 1.0.15

Análise em 05/10/2026 do código local, da interface e da documentação oficial do Discord. O estado abaixo corresponde à entrega local 1.0.15. Não implica que o backend público ou a atualização automática já tenham sido publicados. Funcionalidades do Discord variam por plataforma, assinatura, tipo de servidor e implantação gradual; esta matriz cobre as principais famílias de recursos, sem afirmar equivalência completa com cada variante do produto.

## Implementado nesta entrega

- Temas escuro, claro, meia-noite, floresta, pôr do sol e sincronização com o sistema. Cor de destaque personalizada, fonte de 12–20px, mensagens compactas, redução de movimento e opção para esconder membros.
- Abas Perfil, Aparência, Notificações e Atualizações. Preferências por conta e backend neste dispositivo, aplicadas imediatamente. Controle de sons, notificações desktop e conteúdo da prévia; Não perturbe silencia sons de mensagens e avisos.
- Convites por link, botão de copiar, prévia do servidor, envio direto a amigos por DM e cartão com entrada em um clique. O formulário aceita link ou código; abrir o link no site mantém o convite durante o login. Validade de 1h, 24h, 7 dias ou sem expiração; limites de 1, 5, 10, 25, 100 ou usos ilimitados. Membros podem convidar, criadores podem revogar seus convites e o dono pode revogar qualquer convite do servidor.
- Responder em canais e DMs, com autor e trecho original, foco no campo de escrita, cancelamento e salto para mensagens antigas. Editar e excluir mensagens próprias; atualização das citações em tempo real e após recarregar. A exclusão oculta o conteúdo da interface e preserva o registro no banco.
- Busca textual no canal, até 100 resultados, com acesso à mensagem encontrada. Histórico paginado em canais e DMs, 100 mensagens por página.

Referências do comportamento comparado: [aparência](https://support.discord.com/hc/en-us/articles/207260127-How-to-Change-Discord-Color-Themes-and-Customize-Appearance-Settings), [convites](https://support.discord.com/hc/en-us/articles/208866998-Invites-101) e [respostas](https://support.discord.com/hc/en-us/articles/360057382374-Replies-FAQ). Os temas e limites definidos no MeuApp são escolhas próprias deste projeto.

## Matriz do aplicativo

“Existente” significa implementado antes desta entrega. “Parcial” identifica limitações concretas. A existência de uma tabela no banco não conta como um recurso funcional.

| Área | Recurso comparado | Estado do MeuApp 1.0.15 e diferença |
| --- | --- | --- |
| Conta | Cadastro, login e sessão | Existente; identidade validada no servidor e credenciais locais protegidas no desktop. |
| Conta | Recuperação e troca de senha | Ausente; prioridade alta. |
| Conta | E-mail verificado, passkeys e autenticação em dois fatores | Ausente. |
| Conta | Gerenciar sessões e dispositivos | Parcial: logout revoga a sessão atual; falta lista de sessões e revogação individual. |
| Conta | Exportar/excluir conta e seus dados | Ausente na interface. |
| Perfil | Nome, avatar, GIF, banner, biografia e status personalizado | Existente. |
| Perfil | Status disponível, ausente, não perturbe e invisível | Existente; os avisos agora respeitam Não perturbe. |
| Perfil | Apelido e perfil específicos de cada servidor | Ausente. |
| Perfil | Conexões externas e atividade de jogos/música | Ausente. |
| Aparência | Temas e seguir o sistema | Novo: seis opções, incluindo tema do sistema. |
| Aparência | Cor de destaque | Novo: seletor de cor. |
| Aparência | Fonte, densidade e reduzir movimento | Novo. |
| Aparência | Ocultar membros | Novo. |
| Aparência | Zoom global e personalização completa da tipografia | Ausente nas configurações. |
| Aparência | Sincronizar preferências entre dispositivos | Ausente; preferências são locais e separadas por conta. |
| Amigos | Solicitar, aceitar, recusar e remover amizades | Existente. |
| Amigos | Bloquear e desbloquear | Existente; também interrompe assistência entre os participantes. |
| Amigos | Ignorar sem bloquear e solicitações de mensagens | Ausente. |
| Amigos | DMs persistentes e contagem de não lidas | Existente. |
| Amigos | Conversas privadas em grupo | Ausente. |
| Amigos | Ligações privadas e em grupo | Parcial: convite para canal de voz compartilhado; falta chamada independente do servidor. |
| Servidor | Criar servidor e canais de texto/voz | Existente. |
| Servidor | Nome, ícone e banner | Existente; edição depende de ser proprietário. |
| Servidor | Convidar por link e DM | Novo; prévia e entrada em um clique. |
| Servidor | Validade, usos, listagem e revogação dos convites | Novo. |
| Servidor | Convite personalizado, associação temporária e pausa global de convites | Ausente. |
| Servidor | Categorias, reordenação e canais favoritos | Ausente. |
| Servidor | Sair, excluir servidor e transferir propriedade pela interface | Ausente; há ferramenta administrativa de recuperação de propriedade, não um fluxo de usuário. |
| Servidor | Cargos, hierarquia e permissões por canal | Ausente como recurso utilizável. Tabelas existem, mas os controles atuais verificam membro/proprietário. |
| Servidor | Canais privados por cargo e sobrescritas de permissão | Ausente. |
| Servidor | Editar/excluir/reordenar canais | Ausente na interface. |
| Servidor | Fóruns e tópicos de discussão | Ausente. |
| Servidor | Threads públicas/privadas e arquivamento | Ausente. |
| Servidor | Anúncios, palco e eventos agendados | Ausente. |
| Servidor | Onboarding, regras, guia e candidaturas de membros | Ausente. |
| Servidor | Descoberta pública, modelos e pastas de servidores | Ausente. |
| Mensagens | Texto em tempo real e indicador de digitação | Existente nos canais; indicador de digitação ainda falta nas DMs. |
| Mensagens | Emojis e arquivos | Existente nos canais: upload de até 10MB, imagens e downloads autenticados. |
| Mensagens | Anexos e seletor de emojis nas DMs | Ausente; DMs suportam texto e cartões de convite. |
| Mensagens | Resposta com contexto | Aprimorado nos canais e novo nas DMs. |
| Mensagens | Editar/excluir próprias mensagens | Novo; marcador de edição e exclusão com confirmação. |
| Mensagens | Busca e histórico antigo | Novo; busca no canal e paginação em canais/DMs. |
| Mensagens | Busca global, por autor/data/tipo e busca em DMs | Ausente. |
| Mensagens | Reações, fixar mensagens, favoritos e lembretes | Ausente. |
| Mensagens | Markdown, blocos de código e spoilers | Ausente; texto é renderizado sem executar HTML. |
| Mensagens | Menções estruturadas de usuários/cargos e caixa de menções | Parcial: avisos reconhecem texto com @handle, sem seletor ou permissões de menção. |
| Mensagens | Prévia de links, encaminhar e copiar link de mensagem | Ausente. |
| Mensagens | Enquetes e mensagens de voz | Ausente. |
| Mensagens | Emojis personalizados, stickers e busca de GIFs | Ausente; há emojis Unicode e presets de GIF para perfil. |
| Mensagens | Rascunhos persistentes e textos com múltiplas linhas no compositor | Ausente; o compositor atual usa campo de uma linha. |
| Voz/vídeo | Voz, câmera, mudo, ensurdecer e indicação de fala | Existente. |
| Voz/vídeo | Compartilhar tela/janela com prévia e áudio | Existente, com limitações de captura registradas nas auditorias anteriores. |
| Voz/vídeo | Selecionar microfone, saída e qualidade da transmissão | Existente na sala de voz. |
| Voz/vídeo | Cancelamento de eco, supressão e ganho automático | Parcial: restrições WebRTC ativadas; não há ajustes detalhados nem equivalência ao processamento do Discord. |
| Voz/vídeo | Push-to-talk, sensibilidade e teste do microfone | Ausente. |
| Voz/vídeo | Volume individual, atalhos configuráveis e prioridade de fala | Ausente. |
| Voz/vídeo | Soundboard, atividades e assistir juntos | Ausente. |
| Voz/vídeo | Escala para grandes salas | Parcial: malha WebRTC entre participantes; falta infraestrutura SFU e validação de capacidade. |
| Notificações | Avisos desktop e badge | Existente; novos controles de sons, privacidade da prévia e Não perturbe. |
| Notificações | Preferências por servidor/canal, silenciar temporariamente e apenas menções | Ausente. |
| Notificações | Não lidas em canais, marcador de leitura e caixa de entrada | Ausente; há contagem de DMs. |
| Moderação | Expulsão, banimento, timeout e limpeza de mensagens | Ausente. |
| Moderação | AutoMod, slowmode e proteção contra raids | Ausente; há limites básicos de requisição/pacotes, sem automod de conteúdo. |
| Moderação | Logs de auditoria, denúncias e revisão administrativa | Parcial: logs técnicos e auditoria de recuperação de propriedade; falta produto de moderação. |
| Integrações | Bots, comandos slash, webhooks e diretório de apps | Ausente. |
| Desktop | Instalador, atualização automática e diagnóstico | Existente; esta entrega reconstrói e valida o pacote. |
| Desktop | Abrir convite no EXE por protocolo personalizado | Ausente; links abrem o site. No EXE, é possível colar o link ou aceitar o cartão na DM. |
| Plataforma | App móvel, overlay de jogos e experiência responsiva completa | Ausente. |
| Monetização | Nitro, boosts, loja, assinaturas e recursos comerciais | Ausente; a personalização local não exige assinatura. |

As famílias avançadas acima foram comparadas com a [visão geral oficial](https://support.discord.com/hc/en-us/articles/360045138571-Beginner-s-Guide-to-Discord), [cargos e permissões](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions), [threads](https://support.discord.com/hc/en-us/articles/4403205878423-Threads-FAQ), [fóruns](https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ), [enquetes](https://support.discord.com/hc/en-us/articles/22163184112407-Polls-FAQ), [AutoMod](https://support.discord.com/hc/en-us/articles/4421269296535-AutoMod-FAQ) e [apps e atividades](https://support-apps.discord.com/hc/en-us/articles/26593412574359-How-to-Use-Apps). As avaliações de presença/ausência são conclusões da leitura do repositório.

## Próximas etapas recomendadas

1. Cargos e permissões por canal, sair de servidores, editar/excluir canais e moderação básica. São a base para comunidades maiores e administração compartilhada.
2. Reações, mensagens fixadas, Markdown, menções estruturadas, não lidas nos canais e notificações por canal/servidor. Melhoram o uso diário das conversas existentes.
3. Recuperação de conta, gestão de sessões e autenticação em dois fatores.
4. Anexos nas DMs, grupos privados, chamadas privadas e rascunhos persistentes.
5. Threads, fóruns, enquetes, eventos, integração de bots e webhooks.
6. SFU, testes de carga e de redes externas, experiência móvel e abertura de convites diretamente no desktop.

## Escopo e limitações da entrega

A migração 006 acrescenta colunas de resposta nas DMs, convite, edição, exclusão e revogação. Nenhuma tabela ou mensagem antiga é descartada. Identidade, propriedade, amizade e participação são verificadas no backend. Os testes usam bancos isolados e incluem migração repetida, falsificação de remetente, acesso indevido, limite concorrente de convites, edição/exclusão, respostas entre contextos e paginação acima de 100 mensagens.

As preferências de aparência e notificações são locais. Reduzir movimento desliga animações CSS e rolagem animada, mas não congela GIFs ou vídeos. A busca usa texto literal, retorna até 100 resultados por consulta e não oferece normalização linguística completa. Respostas não implementam o botão específico de ping do Discord. Usuários moderadores ainda não podem editar ou remover mensagens alheias.

Os testes locais não substituem testes entre dois computadores físicos, NAT/TURN externo, PostgreSQL real, cargas altas, revisão completa de acessibilidade, instalação em máquina Windows limpa ou aceite visual de notificações do sistema. O teste físico individual de SendInput passou na primeira construção desta entrega, mas reexecuções posteriores falharam por foco/texto ou reconhecimento de duplo clique na janela pertencente ao teste. O teste nativo completo da última compilação não é considerado aprovado; não houve alteração no código C# nem redução das verificações. O helper recém-compilado é verificado por hash no pacote, extraído do NSIS e iniciado com PING. A assistência remota entre PCs físicos permanece fora do escopo desta validação.

O instalador contém cliente e helper; o backend/site correspondente precisa ser atualizado para usar os novos recursos online. O pacote local fica em `artifacts/server-1.0.15`, sem incluir banco, uploads ou segredos. Nada foi publicado ou implantado nesta tarefa.

Os caminhos, hashes, data/hora e resultados do pacote estão em `docs/validation/build.json`, `docs/validation/features-ui.json` e `docs/validation/packaged.json`.

## Artefatos e verificação final

Instalador: `C:\Users\geand\OneDrive\Documentos\Discord\dist\MeuApp-Setup-1.0.15.exe`, versão **1.0.15**, construído em **05/10/2026 às 15:15:56, America/Sao_Paulo** (18:15:56.464Z).

SHA-256 do instalador: `05ddc68b5cadd93dadca45598298c3e7150cd7204aaafbe07fe405d8da1521af`.

Helper verificado: `dist/win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe`. O arquivo extraído do instalador em `artifacts/installer-verification-1.0.15/resources/app.asar.unpacked/desktop/NativeInputHost.exe` corresponde à compilação atual de `desktop/NativeInputHost.cs`, inicia e responde a PING. SHA-256: `b9e432d49b6e4db186837f6022f38d60ce61c55d0288111c06edd0a59daf88f4`.

| Validação final | Resultado |
| --- | --- |
| `npm test` | 42 testes aprovados: 28 do cliente e 14 de backend/desktop. |
| Frontend e C# | Compilados novamente após a revisão visual. |
| Interface com duas contas | Aprovada: preferências após reload, convite direto a amigo, entrada em um clique, respostas em DMs, edição em tempo real, busca e exclusão; regressões de voz/vídeo também aprovadas. |
| RTC e smoke desktop | Aprovados com mídia sintética; consentimento, revogação e validações de IPC preservados. |
| Input físico Windows | Passou na primeira construção; últimas reexecuções falharam no fixture de foco/duplo clique. A última execução completa não é considerada aprovada. |
| Aplicação empacotada final | Aprovada: temas, preferências, responder/editar/excluir, atualização das citações, busca, link e revogação de convite, configurações, chamada, captura real 1920×1080 e helper. Sem ReferenceError/TypeError no renderer. |
| NSIS extraído | EXE, ASAR e helper correspondem byte a byte ao pacote validado. |
| Web de produção local | Backend serve o frontend compilado; conexão automática e recuperação de sessão verificadas sem Vite. |
| Lint | Executou sem erros; mantém avisos de estilo, hooks e variáveis não usadas. O build também avisa sobre o tamanho do bundle principal. |

Construção local com `electron-builder --win --publish never`. Nenhum release, commit, tag, push ou deploy executado. Os artefatos e instaladores anteriores foram preservados.
