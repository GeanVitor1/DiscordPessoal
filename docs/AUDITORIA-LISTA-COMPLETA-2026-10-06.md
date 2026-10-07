# Auditoria da lista completa — MeuApp

Data: 2026-10-06T15:14:08-03:00 (America/Sao_Paulo). Versão do código: 1.0.20. Commit: `80e0e468870b5b48d302a944e937fd15e2591807`.

**Conclusão: a lista não está integralmente implementada.** Há uma base de comunicação, perfil, amizade e assistência; várias funcionalidades sociais, administrativas e de configuração ainda estão parciais ou ausentes.

Escopo: confronto dos 49 blocos do arquivo fornecido com frontend, backend, migrações, Electron/helper nativo e testes. Não foram alterados código de aplicação, versão, banco de produção ou instalação do usuário. Esta entrega é um relatório de verificação, não uma nova versão desktop.

“Implementado” indica fluxo correspondente localizado no código, sem prometer equivalência total ao Discord ou teste manual individual de cada item. “Parcial” indica infraestrutura, limitação de interface, regra fixa em lugar de configuração ou comportamento diferente do requisito. “Ausente” significa que não foi localizado fluxo funcional. Tabela no banco, import de ícone, comentário ou função não chamada não contam como recurso pronto. “Contexto” identifica comentários, subtítulos e recomendações, excluídos da contagem.

Linhas avaliadas: **168 implementadas, 117 parciais e 300 ausentes**; 55 linhas de contexto. A lista repete recursos entre blocos e contém itens compostos; esses números contam linhas de checklist, não recursos únicos nem percentual de conclusão do produto.

## Validação executada nesta auditoria

- `npm test`: 28 testes do cliente e 19 testes de backend/desktop; 47 passaram, 0 falhas e 0 ignorados. Inclui identidade autenticada, amizade, bloqueio, DM, convites, edição/exclusão, busca, migração e protocolo do helper compilado já existente.
- `npm run test:rtc`: passou no Electron com áudio/vídeo sintéticos bidirecionais, DataChannel aberto, cinco comandos no alvo canvas e revogação preservando a voz; rota direta local.
- `npm run build --prefix client -- --outDir ../artifacts/auditoria-lista-2026-10-06/frontend`: compilação passou. Aviso de bundle maior que 500 kB; build isolado sem sobrescrever o frontend da instalação.
- Limitações: sem dois PCs físicos, microfone/webcam/áudio de loopback reais, NAT/TURN externo, PostgreSQL real, instalação limpa do Windows ou nova conferência do backend hospedado. O E2E React completo e fixtures que injetam mouse/teclado não foram repetidos nesta auditoria. O teste RTC usa mídia sintética e canvas, não comprova sozinho controle de um PC físico.
- Os relatórios anteriores `docs/validation/features-ui.json`, `build.json` e `published-updater-1.0.20.json` registram validações da versão 1.0.20. Foram lidos como evidência histórica, não apresentados como execuções novas.

## Diferenças que merecem atenção

1. **Chamadas em DM:** botão de Amigos envia convite para canal de servidor; falta ligação privada independente, duração e histórico de chamadas.
2. **Membros:** a lateral usa sockets/presença visíveis por amizade ou servidor em comum. Não carrega todos os membros do servidor selecionado e não mantém todos os desconectados na lista.
3. **Cargos/permissões:** banco contém roles e role_id, mas autorização usa proprietário/associação ao servidor. Não há hierarquia ou permissões configuráveis.
4. **DM versus canal:** anexos e picker de emojis são de canais; DM tem somente texto, respostas, edição/exclusão e cartão de convite. Busca é somente no canal.
5. **Sons:** gerador contém um som call sem chamada no fluxo de convites. DMs não ligam playSound. Configuração disponível é só um toggle global.
6. **Assistência:** separação está implementada. Porém sair da chamada mantém a assistência desktop; o requisito de revogar ao terminar a chamada não está atendido literalmente. A sessão revoga ao encerrar, desconectar, bloquear ou expirar.
7. **Administração:** faltam sair/excluir/transferir servidor pela interface, categorias, editar/excluir/reordenar canais, kick/ban/timeout e audit log geral.
8. **Desktop:** não há bandeja, iniciar com Windows, fechar para bandeja ou atalhos de voz personalizados. Existe atalho de emergência da assistência.

## Checklist completo

### 1. Conta e autenticação

Cadastro/login com senha e sessões autenticadas; logout revoga somente a sessão atual. Nome de exibição (users.username) é separado do login (@handle / auth_accounts.login_name). Não há recuperação/troca de senha, e-mail, troca do login, gestão de dispositivos ou exclusão/desativação de conta.

Evidências: [server/src/auth.js](../server/src/auth.js), [client/src/context/AuthContext.jsx](../client/src/context/AuthContext.jsx), [client/src/components/LoginScreen.jsx](../client/src/components/LoginScreen.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Login. | Implementado | Funcionalidade localizada no código. |
| Cadastro. | Implementado | Funcionalidade localizada no código. |
| Logout. | Implementado | Funcionalidade localizada no código. |
| Recuperação de senha. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alterar senha. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alterar e-mail. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alterar nome de usuário. | Ausente | É possível alterar o nome de exibição; o @handle usado no login não pode ser alterado. |
| Nome de exibição separado do username. | Implementado | Funcionalidade localizada no código. |
| Avatar. | Implementado | Funcionalidade localizada no código. |
| Status da conta. | Implementado | Presença disponível/ausente/não perturbe/invisível; não há ciclo de conta desativada. |
| Sessões/dispositivos conectados. | Parcial | Há tokens de sessão com expiração; não há listagem de dispositivos/sessões para o usuário. |
| Encerrar outras sessões. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir conta. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Desativar conta temporariamente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Opcional: autenticação em dois fatores. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu projeto: implementar. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 2. Perfil do usuário

Avatar, banner, biografia e status são persistidos e exibidos. Sem pronomes, conexões externas, informações em comum ou perfil por servidor.

Evidências: [client/src/components/UserSettingsModal.jsx](../client/src/components/UserSettingsModal.jsx), [client/src/components/UserProfileModal.jsx](../client/src/components/UserProfileModal.jsx), [server/src/application.js](../server/src/application.js), [server/src/migrations/index.js](../server/src/migrations/index.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Avatar. | Implementado | Funcionalidade localizada no código. |
| Nome de exibição. | Implementado | Funcionalidade localizada no código. |
| @username. | Implementado | @handle existe e aparece em amigos e perfis de terceiros com handle; não é exibido de forma uniforme em todos os perfis. |
| Bio/"Sobre mim". | Implementado | Funcionalidade localizada no código. |
| Pronomes. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Banner do perfil. | Implementado | Funcionalidade localizada no código. |
| Cor/tema do perfil. | Parcial | Cor de banner disponível; não existe um tema completo por perfil. |
| Status personalizado. | Implementado | Funcionalidade localizada no código. |
| Emoji no status. | Parcial | Pode digitar emoji Unicode no texto; não há campo/picker específico de emoji do status. |
| Expiração do status. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Contas conectadas. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Amigos em comum. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Servidores em comum. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Data aproximada de criação da conta. | Parcial | created_at existe no banco, mas não é devolvido em publicUser nem exibido como data no perfil. |
| Perfil diferente por servidor é algo que o Discord oferece, embora ligado a recursos específicos da plataforma. Suporte Discord | Ausente | Não existe perfil específico por servidor. |
| Para seu app eu faria avatar, banner, bio, status e cor do perfil; dispensaria perfil diferente por servidor inicialmente. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 3. Status/presença

Presença manual e status textual disponíveis; desconexão remove presença ativa. Não há integração com processos/jogos.

Evidências: [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx), [server/src/application.js](../server/src/application.js), [client/src/context/SocketContext.jsx](../client/src/context/SocketContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Online. | Implementado | Funcionalidade localizada no código. |
| Ausente. | Implementado | Funcionalidade localizada no código. |
| Não perturbe. | Implementado | Funcionalidade localizada no código. |
| Invisível. | Implementado | A opção Invisível usa status offline. |
| Offline. | Implementado | Amigos desconectados aparecem offline; a lista lateral de membros não é um cadastro completo de offline. |
| Status personalizado. | Implementado | Funcionalidade localizada no código. |
| Mostrar atividade/jogo atual. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Detectar automaticamente jogo/programa aberto. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar "Jogando X". | Parcial | É possível escrever Jogando X no status manual; não é atividade detectada automaticamente. |
| Mostrar há quanto tempo está executando o jogo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Opcional: esconder atividade. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu projeto: implementar. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 4. Sistema de amizade

Ciclo de amizade e bloqueio completo no backend e na tela Amigos. DM pelo perfil exige amizade aceita e handle disponível. Sem informações em comum ou chamada iniciada pelo perfil.

Evidências: [server/src/social.js](../server/src/social.js), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx), [client/src/components/UserProfileModal.jsx](../client/src/components/UserProfileModal.jsx), [client/src/components/ServerInvites.jsx](../client/src/components/ServerInvites.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Enviar pedido de amizade. | Implementado | Funcionalidade localizada no código. |
| Aceitar pedido. | Implementado | Funcionalidade localizada no código. |
| Recusar pedido. | Implementado | Funcionalidade localizada no código. |
| Cancelar pedido enviado. | Implementado | Funcionalidade localizada no código. |
| Remover amigo. | Implementado | Funcionalidade localizada no código. |
| Bloquear pessoa. | Implementado | Funcionalidade localizada no código. |
| Desbloquear pessoa. | Implementado | Funcionalidade localizada no código. |
| Lista de amigos. | Implementado | Funcionalidade localizada no código. |
| Amigos online. | Implementado | Funcionalidade localizada no código. |
| Todos os amigos. | Implementado | Funcionalidade localizada no código. |
| Pedidos pendentes. | Implementado | Funcionalidade localizada no código. |
| Pessoas bloqueadas. | Implementado | Funcionalidade localizada no código. |
| Pesquisar amigo. | Parcial | Há filtro de amigos apenas no modal de enviar convite; falta busca na lista principal de amigos. |
| Ver amigos em comum. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ver servidores em comum. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir DM pelo perfil. | Implementado | Funcionalidade localizada no código. |
| Iniciar chamada pelo perfil. | Ausente | O botão da lista Amigos convida para canal de voz existente; não há botão de chamada no perfil. |
| Segundo o Discord, é possível definir quem pode enviar pedido entre todos, amigos de amigos e membros de servidores compartilhados, inclusive desativar todas essas opções. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 5. Configurações de pedidos de amizade

Não há configurações de quem pode enviar pedido. A regra fixa aceita qualquer conta não bloqueada, exceto a própria conta.

Evidências: [server/src/social.js](../server/src/social.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Permitir pedidos de: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Todos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Amigos de amigos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pessoas do mesmo servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir combinação dessas opções. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Não permitir pedidos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu app: copiaria exatamente essa lógica. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 6. Mensagens privadas — DM

DM individual com texto, histórico paginado, resposta, edição, exclusão lógica e contagem de não lidas. Não possui anexos, busca própria, reações, fixação ou menu de contexto.

Evidências: [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx), [server/src/social.js](../server/src/social.js), [client/src/components/MessageTools.jsx](../client/src/components/MessageTools.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Conversa individual. | Implementado | Funcionalidade localizada no código. |
| Histórico de mensagens. | Implementado | Funcionalidade localizada no código. |
| Indicador digitando. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Status online da pessoa. | Parcial | Presença aparece na lista de amigos; o cabeçalho/lista de DM não mostra o estado online do interlocutor. |
| Enviar texto. | Implementado | Funcionalidade localizada no código. |
| Emoji. | Parcial | Emoji Unicode digitado/colado funciona; não há emoji picker em DM. |
| GIF. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sticker. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Arquivos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Imagens. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Vídeos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Links. | Parcial | URLs podem ser enviadas como texto, sem transformação em links clicáveis. |
| Preview de links. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Responder mensagem. | Implementado | Funcionalidade localizada no código. |
| Editar mensagem. | Implementado | Funcionalidade localizada no código. |
| Apagar mensagem. | Implementado | Funcionalidade localizada no código. |
| Reagir à mensagem. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Copiar texto. | Parcial | Texto selecionável para Ctrl+C; não existe ação Copiar no menu. |
| Copiar link da mensagem. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Fixar mensagem. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pesquisar mensagens. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Saltar para mensagem encontrada. | Parcial | Salto funciona para uma mensagem citada; não existe busca de mensagens em DM. |
| Marcar como não lida. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar data/hora. | Parcial | Hora exibida; falta data/calendário no histórico de DM. |
| Separador de mensagens novas. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Indicador de mensagem não lida. | Implementado | Funcionalidade localizada no código. |
| Menu de contexto com botão direito. | Ausente | Sem fluxo funcional correspondente localizado no código. |

### 7. DMs de grupo

dm_conversations admite exatamente dois usuários. Voz, vídeo e compartilhamento existentes pertencem a canais de servidor, não a DMs de grupo.

Evidências: [server/src/migrations/identity.js](../server/src/migrations/identity.js), [server/src/social.js](../server/src/social.js), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar grupo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Adicionar amigos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Remover membro. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sair do grupo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Nome do grupo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ícone do grupo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Chamada de voz do grupo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Vídeo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Compartilhamento de tela. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para grupo de amigos isso vale bastante a pena. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 8. Solicitações de mensagem

Não existe caixa de solicitações/spam. Abrir uma nova DM exige amizade aceita; bloqueio é geral, acessível pela tela Amigos.

Evidências: [server/src/social.js](../server/src/social.js), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Pessoas desconhecidas não entram necessariamente direto na caixa principal. | Parcial | Desconhecidos não podem iniciar nova DM, mas não há fila de solicitações. |
| Caixa "Solicitações de mensagem". | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Aceitar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ignorar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Bloquear. | Parcial | Bloqueio geral existe; falta ação em uma caixa de solicitações. |
| Spam separado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir ou não DM de pessoas do servidor. | Parcial | Regra fixa por amizade; não há opção de permitir DMs por servidor. |
| Discord atualmente usa uma caixa própria para solicitações e spam. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Para seu aplicativo privado: opcional, mas simples e útil. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 9. Servidor

Criação, proprietário, canais, convites e banner funcionam. Não há sair/excluir servidor, categorias, moderação, eventos ou mídia própria de servidor.

Evidências: [server/src/application.js](../server/src/application.js), [server/src/migrations/index.js](../server/src/migrations/index.js), [client/src/components/ServerList.jsx](../client/src/components/ServerList.jsx), [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx), [client/src/components/MemberList.jsx](../client/src/components/MemberList.jsx), [server/scripts/recover-ownership.js](../server/scripts/recover-ownership.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar servidor. | Implementado | Funcionalidade localizada no código. |
| Nome do servidor. | Implementado | Nome definido na criação; API do dono permite atualizar, mas não há editor de nome na interface. |
| Ícone. | Parcial | Ícone por emoji/texto; não há upload de imagem de ícone. |
| Banner. | Implementado | Funcionalidade localizada no código. |
| Descrição. | Parcial | Coluna description existe; falta leitura/edição funcional na interface e gravação pela API de servidor. |
| Dono do servidor. | Implementado | Funcionalidade localizada no código. |
| Lista de membros. | Parcial | A lateral usa presença de usuários visíveis (amigos ou servidores em comum), não todos os membros do servidor selecionado. |
| Sair do servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Transferir propriedade. | Parcial | Há script administrativo de recuperação de proprietário, sem fluxo de transferência no aplicativo. |
| Convites. | Implementado | Funcionalidade localizada no código. |
| Canais. | Implementado | Funcionalidade localizada no código. |
| Categorias. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Cargos. | Parcial | Tabela roles e referência role_id existem, sem sistema utilizável de cargos. |
| Permissões. | Parcial | Só há verificações fixas de proprietário/membro; não há permissões por cargo/categoria/canal. |
| Emojis próprios. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Stickers próprios. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Eventos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Registro administrativo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Banimentos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| No Discord moderno o perfil de servidor também suporta nome, ícone, banner, descrição, características e informações adicionais. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Para seu app: nome + ícone + banner + descrição são suficientes. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 10. Categorias

Canais são agrupados visualmente em Texto e Voz. Não existem entidades de categoria, ordenação por arraste ou sincronização de permissões.

Evidências: [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx), [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/application.js](../server/src/application.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar categoria. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Renomear. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Arrastar posição. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Colocar canais dentro. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Reordenar canais. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ocultar categoria. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permissões próprias. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sincronizar permissões dos canais com a categoria. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord possui justamente esse sistema de categoria + canais sincronizados. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 11. Canais de texto

Criação pelo dono e histórico por membro implementados. Não há editar/excluir/reordenar canal, slow mode, threads ou políticas configuráveis de mensagem.

Evidências: [server/src/application.js](../server/src/application.js), [server/src/auth.js](../server/src/auth.js), [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx), [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar. | Implementado | Funcionalidade localizada no código. |
| Renomear. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Tópico/descrição. | Parcial | API aceita topic na criação e a tela o exibe; falta campo no formulário e edição posterior. |
| Alterar posição. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Canal privado. | Parcial | Servidor restringe acesso a membros; não há canal privado dentro de um servidor. |
| Controle por cargo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Histórico. | Implementado | Funcionalidade localizada no código. |
| Slow mode. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| NSFW você provavelmente não precisa. | Ausente | Sem classificação/configuração NSFW; o texto original a considera dispensável. |
| Permitir anexos. | Parcial | Anexos permitidos para membros; sem permissão configurável. |
| Permitir links. | Parcial | URL como texto; sem política de links ou preview. |
| Permitir reações. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir GIFs. | Parcial | Upload de GIF de imagem, sem política de GIFs. |
| Permitir emojis externos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir menções. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir comandos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ver canal. | Parcial | Acesso fixo por associação ao servidor; sem permissão Ver canal por cargo. |
| Enviar mensagens. | Parcial | Membro envia mensagens; sem permissão configurável por cargo. |
| Ver histórico. | Parcial | Membro acessa histórico; sem permissão separada de histórico. |
| Gerenciar mensagens. | Parcial | Só editar/excluir mensagem própria; não há administração de mensagens de outros membros. |
| Criar threads. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Gerenciar threads. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| As permissões por servidor, categoria e canal são parte central da arquitetura atual do Discord. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 12. Mensagens nos canais

Conteúdo é renderizado como texto simples. Reply, edição/exclusão próprias, upload até 10 MB, imagem/GIF e picker Unicode funcionam. Sem Markdown, reações, pins, encaminhamento, drag & drop, gravação de voz, stickers ou enquete.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx), [client/src/components/MessageTools.jsx](../client/src/components/MessageTools.jsx), [server/src/application.js](../server/src/application.js), [server/src/conversation-tools.js](../server/src/conversation-tools.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Texto comum. | Implementado | Funcionalidade localizada no código. |
| Markdown. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Negrito. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Itálico. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sublinhado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Tachado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Spoiler. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Código inline. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Bloco de código. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quote. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Links. | Parcial | URL aparece como texto, sem linkificação. |
| Menção @usuário. | Parcial | Notificação usa comparação textual com @handle; não há entidade de menção, autocomplete ou renderização dedicada. |
| @everyone. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| @here. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Menção de cargo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Menção de canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Resposta. | Implementado | Funcionalidade localizada no código. |
| Reação. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Editar. | Implementado | Funcionalidade localizada no código. |
| Apagar. | Implementado | Funcionalidade localizada no código. |
| Fixar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Copiar. | Parcial | Seleção e Ctrl+C; falta botão/ação Copiar. |
| Encaminhar, caso queira. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Upload de arquivo. | Implementado | Funcionalidade localizada no código. |
| Drag & drop. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Imagem. | Implementado | Funcionalidade localizada no código. |
| Vídeo. | Parcial | Arquivo de vídeo pode ser anexado e baixado; não há player no chat. |
| Áudio. | Parcial | Arquivo de áudio pode ser anexado e baixado; não há player no chat. |
| Mensagem de voz. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| GIF. | Implementado | GIF enviado como arquivo de imagem e exibido animado; sem busca/picker de GIFs. |
| Emoji. | Implementado | Funcionalidade localizada no código. |
| Sticker. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Enquete. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu aplicativo: texto, reply, reação, edição, exclusão, imagem, arquivo, GIF e emoji já entregam quase toda a experiência. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 13. Threads

Não há modelo, API ou interface de threads.

Evidências: [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/application.js](../server/src/application.js), [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar thread a partir de mensagem. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Criar thread independente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Entrar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sair. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Adicionar usuário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Renomear. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Arquivar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Reabrir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Slow mode separado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para servidor pequeno de amigos: opcional. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 14. Canais de voz

Voz usa conexões WebRTC entre participantes, com entrada/saída, mute e deafen próprios. Sem volume/mute individual, moderação de voz, limite de participantes ou permissões de mídia por cargo.

Evidências: [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [server/src/realtime.js](../server/src/realtime.js), [client/src/rtc/VoiceMesh.js](../client/src/rtc/VoiceMesh.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar canal. | Implementado | Funcionalidade localizada no código. |
| Nome. | Implementado | Funcionalidade localizada no código. |
| Entrar. | Implementado | Funcionalidade localizada no código. |
| Sair. | Implementado | Funcionalidade localizada no código. |
| Mostrar usuários conectados. | Implementado | Funcionalidade localizada no código. |
| Microfone ligado/desligado. | Implementado | Funcionalidade localizada no código. |
| Ficar ensurdecido/deafen. | Implementado | Funcionalidade localizada no código. |
| Alterar volume de cada usuário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mutar outro usuário localmente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador mutar pessoa no servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador ensurdecer usuário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador desconectar usuário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mover usuário entre canais. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Limite de usuários. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Região automática/servidor de voz. | Parcial | STUN/TURN configurável e diagnóstico de rota; não há região selecionável nem servidor central de mídia/SFU. |
| Permitir/impedir entrada. | Parcial | Entrada exige associação ao servidor; não há permissão configurável por canal/cargo. |
| Permitir/impedir fala. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir/impedir vídeo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permitir/impedir compartilhamento. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu app: fundamental. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 15. Controles individuais durante chamada

Cards abrem perfil. Não há controle de volume/mute por participante ou controles administrativos.

Evidências: [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [client/src/components/UserProfileModal.jsx](../client/src/components/UserProfileModal.jsx), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Volume individual 0–200%. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Silenciar uma pessoa apenas para você. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir perfil. | Implementado | Funcionalidade localizada no código. |
| Enviar mensagem. | Parcial | É possível abrir DM pelo perfil se forem amigos e o perfil trouxer handle; não há ação direta dedicada no card da chamada. |
| Alterar volume. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mutar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador mover. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador desconectar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador silenciar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador ensurdecer. | Ausente | Sem fluxo funcional correspondente localizado no código. |

### 16. Configuração de áudio

Seletores de microfone/saída na chamada e detecção de fala por energia. Processamento de áudio solicitado ao navegador com opções fixas. Sem ganho/volume ajustável, teste de microfone, PTT, sensibilidade manual, QoS, atenuação ou reset de áudio.

Evidências: [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Escolher microfone. | Implementado | Funcionalidade localizada no código. |
| Escolher alto-falante/headset. | Implementado | Funcionalidade localizada no código. |
| Volume de entrada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Volume de saída. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Testar microfone. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Detecção automática de voz. | Implementado | Detector automático de fala com limiar fixo; não há sensibilidade automática ajustável. |
| Sensibilidade manual. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Voice Activity. | Parcial | Detecta e sinaliza fala; não implementa modo configurável de transmissão ativada por voz. |
| Push-to-Talk. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atalho Push-to-Talk. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Supressão de ruído. | Parcial | noiseSuppression=true solicitado ao navegador; sem toggle ou processador próprio e sujeito ao dispositivo/browser. |
| Cancelamento de eco. | Parcial | echoCancellation=true solicitado ao navegador; sem toggle ou validação acústica física nesta auditoria. |
| Redução de ruído. | Parcial | Usa a mesma noiseSuppression do navegador; não existe segundo controle independente. |
| Controle automático de ganho. | Parcial | autoGainControl=true solicitado ao navegador; sem ajuste/toggle. |
| QoS/prioridade de pacotes. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atenuação quando outras pessoas falam. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Resetar configurações de áudio. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| O cliente Discord oferece atualmente sensibilidade automática, supressão de ruído, cancelamento de eco, redução de ruído e ganho automático, além da seleção de dispositivos. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 17. Câmera

Liga/desliga a webcam padrão e mostra vídeo local/remoto no grid. Sem seleção/troca de webcam, foco, tela cheia específica de câmera, pop-out ou PiP.

Evidências: [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Ligar/desligar câmera. | Implementado | Funcionalidade localizada no código. |
| Escolher webcam. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Preview. | Implementado | Funcionalidade localizada no código. |
| Alterar câmera durante chamada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Grid de participantes. | Implementado | Funcionalidade localizada no código. |
| Focar em uma pessoa. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Tela cheia. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pop-out. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Picture-in-picture. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Você pode deixar efeitos/fundos virtuais para depois. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 18. Compartilhamento de tela

Seleção de monitor/janela, qualidade 720/1080/1440p, parada e reprodução com fullscreen. FPS fixo em 30; não há troca de fonte sem reiniciar, pop-out ou PiP.

Evidências: [client/src/components/ScreenSourcePickerModal.jsx](../client/src/components/ScreenSourcePickerModal.jsx), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [desktop/main.js](../desktop/main.js), [server/src/realtime.js](../server/src/realtime.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Compartilhar monitor inteiro. | Implementado | Funcionalidade localizada no código. |
| Compartilhar janela. | Implementado | Funcionalidade localizada no código. |
| Compartilhar aplicativo/jogo. | Parcial | Captura janela de aplicativo/jogo quando exposta pelo capturador; não há integração específica com jogos ou garantia de fullscreen exclusivo. |
| Compartilhar áudio do computador. | Parcial | Loopback do Windows e fallbacks do navegador; depende de suporte e seleção. Não foi revalidado com áudio físico nesta auditoria. |
| Escolher resolução. | Implementado | 720p, 1080p ou 1440p, com aplicação de constraints e adaptação de bitrate. |
| Escolher FPS. | Ausente | Todas as opções usam 30 FPS; falta seletor de FPS. |
| Trocar janela sem encerrar stream. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Parar transmissão. | Implementado | Funcionalidade localizada no código. |
| Ver quem está assistindo. | Parcial | Backend sabe quais sockets assistem e o emissor mantém peers; não há lista de espectadores na interface. |
| Várias pessoas compartilhando simultaneamente. | Parcial | Vários emissores podem sinalizar e transmitir; cada receptor assiste uma fonte por vez. Não há visualização múltipla. |
| Assistir stream. | Implementado | Funcionalidade localizada no código. |
| Maximizar stream. | Parcial | Visualização grande e fullscreen existem; falta controle independente de maximizar/restaurar a transmissão. |
| Tela cheia. | Implementado | Funcionalidade localizada no código. |
| Pop-out. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Picture-in-picture. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord atualmente permite escolher janela ou tela inteira, alterar qualidade/FPS e compartilhar áudio em plataformas suportadas. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 19. No SEU aplicativo: Assistência remota

Assistência desktop separada do compartilhamento, com pedido, autorização explícita, captura própria, token próprio e helper nativo de mouse/teclado. Há indicador sempre visível e Ctrl+Alt+Esc para encerrar. Sem sincronização de clipboard.

Evidências: [server/src/assistance.js](../server/src/assistance.js), [client/src/context/AssistanceContext.jsx](../client/src/context/AssistanceContext.jsx), [client/src/components/InteractionRequestModal.jsx](../client/src/components/InteractionRequestModal.jsx), [client/src/components/AssistancePanel.jsx](../client/src/components/AssistancePanel.jsx), [client/src/components/InteractionSurface.jsx](../client/src/components/InteractionSurface.jsx), [desktop/main.js](../desktop/main.js), [desktop/NativeInputHost.cs](../desktop/NativeInputHost.cs).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Aqui eu separaria completamente do compartilhamento, como já conversamos. | Implementado | Sessão/transporte/captura de assistência independentes; descoberta/pedido começa entre participantes da mesma chamada. |
| Compartilhar tela ≠ assistência remota. | Implementado | Parar stream ou deixar a chamada não encerra automaticamente a assistência desktop. |
| Botão "Compartilhar tela". | Implementado | Funcionalidade localizada no código. |
| Botão independente "Solicitar assistência". | Implementado | Funcionalidade localizada no código. |
| Solicitação aparece no PC remoto. | Implementado | Funcionalidade localizada no código. |
| "Fulano deseja controlar seu computador." | Implementado | Modal identifica a conta autenticada e informa o controle real de mouse/teclado. |
| Aceitar. | Implementado | Funcionalidade localizada no código. |
| Recusar. | Implementado | Funcionalidade localizada no código. |
| Sessão com ID/token próprio. | Implementado | Funcionalidade localizada no código. |
| Controle do mouse real. | Implementado | Funcionalidade localizada no código. |
| Clique esquerdo. | Implementado | Funcionalidade localizada no código. |
| Clique direito. | Implementado | Funcionalidade localizada no código. |
| Duplo clique. | Implementado | Sequência de cliques down/up é enviada ao Windows; há fixture nativa de duplo clique no projeto, não repetida nesta auditoria. |
| Scroll. | Implementado | Funcionalidade localizada no código. |
| Teclado. | Implementado | Funcionalidade localizada no código. |
| Combinações de teclas. | Implementado | Funcionalidade localizada no código. |
| Área de transferência opcional. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Indicador permanente "Controle remoto ativo". | Implementado | Janela nativa alwaysOnTop e painel no app mostram autorização ativa e botão de encerramento. |
| Encerrar controle a qualquer momento. | Implementado | Funcionalidade localizada no código. |
| Consentimento expira quando chamada ou sessão termina. | Parcial | Expira ao terminar/revogar a sessão, bloquear participante, desconectar ou atingir timeout. Na implementação atual, deixar somente a chamada mantém a assistência. Portanto difere desta exigência da lista. |
| Isso é recurso seu, não um recurso normal do Discord. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 20. Interface durante chamada

Cards de participantes com nome/avatar/fala/mute/câmera/stream e controles principais. Assistência solicitada no card de participante.

Evidências: [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [server/src/realtime.js](../server/src/realtime.js), [client/src/components/MediaDiagnostics.jsx](../client/src/components/MediaDiagnostics.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Avatar dos participantes. | Implementado | Funcionalidade localizada no código. |
| Borda/indicador quando alguém fala. | Implementado | Funcionalidade localizada no código. |
| Nome. | Implementado | Funcionalidade localizada no código. |
| Status do microfone. | Implementado | Funcionalidade localizada no código. |
| Status de deafen. | Parcial | Estado remoto isDeafened circula no servidor, mas falta indicador dedicado de deafen nos cards. |
| Câmera. | Implementado | Funcionalidade localizada no código. |
| Compartilhamento. | Implementado | Funcionalidade localizada no código. |
| Ping/conexão opcional. | Parcial | Estado da chamada e diagnóstico de rota/RTT existem; falta ping diretamente em cada card. |
| Botões centrais: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| microfone; | Implementado | Funcionalidade localizada no código. |
| áudio/deafen; | Implementado | Funcionalidade localizada no código. |
| câmera; | Implementado | Funcionalidade localizada no código. |
| compartilhar; | Implementado | Funcionalidade localizada no código. |
| assistência, no seu caso; | Parcial | Botão existe no card de participante disponível, fora da barra central. |
| desligar chamada. | Implementado | Funcionalidade localizada no código. |

### 21. Chamadas em DM

Não há chamadas privadas independentes em DM, estados de ligação, duração ou histórico de chamadas. Alternativa existente: botão na lista Amigos envia convite para canal de voz em que ambos já são membros; aceitar entra nesse canal e fechar o aviso ignora o convite. Isso não implementa chamada em DM.

Evidências: [server/src/social.js](../server/src/social.js), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx), [client/src/context/SocialContext.jsx](../client/src/context/SocialContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Chamada de áudio. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Chamada de vídeo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Recusar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atender. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ignorar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar duração. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Histórico "chamada perdida". | Ausente | Sem fluxo funcional correspondente localizado no código. |
| "Fulano iniciou uma chamada". | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Compartilhamento durante a chamada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alternar áudio/vídeo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord suporta compartilhamento também diretamente em DMs. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 22. Sons do Discord

Sons são sintetizados com Web Audio, sem depender desses MP3. A classificação avalia o evento equivalente funcionando, não o nome do arquivo.

Evidências: [client/src/utils/sounds.js](../client/src/utils/sounds.js), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx), [client/src/context/SocialContext.jsx](../client/src/context/SocialContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Essa parte achei particularmente útil para o seu projeto. Os nomes internos encontrados nos assets/clientes Discord incluem: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| message1.mp3 → nova mensagem. | Parcial | Som tocado para mensagens do canal aberto; DMs não chamam playSound. |
| mention1.mp3 → menção. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| call_ringing.mp3 → você está recebendo chamada. | Parcial | Existe som call no gerador, mas não há chamada dele no recebimento de convite. |
| call_calling.mp3 → chamada que você iniciou está tocando. | Parcial | Existe som call no gerador, mas não há chamada dele ao convidar. |
| user_join.mp3 → alguém entrou na call. | Implementado | Funcionalidade localizada no código. |
| user_leave.mp3 → alguém saiu. | Implementado | Funcionalidade localizada no código. |
| user_moved.mp3 → pessoa movida de canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| mute.mp3 → mutar microfone. | Implementado | Funcionalidade localizada no código. |
| unmute.mp3 → desmutar. | Implementado | Funcionalidade localizada no código. |
| deafen.mp3 → ensurdecer. | Implementado | Funcionalidade localizada no código. |
| undeafen.mp3 → remover deafen. | Implementado | Funcionalidade localizada no código. |
| disconnect.mp3 → sair/desconectar da chamada. | Implementado | Usa o mesmo evento leave de saída de voz. |
| stream_started.mp3 → compartilhamento iniciado. | Implementado | Funcionalidade localizada no código. |
| stream_ended.mp3 → compartilhamento encerrado. | Implementado | Funcionalidade localizada no código. |
| stream_user_joined.mp3 → alguém começou a assistir. | Ausente | Eventos de espectador existem, sem chamada de efeito sonoro. |
| stream_user_left.mp3 → alguém parou de assistir. | Ausente | Eventos de espectador existem, sem chamada de efeito sonoro. |
| Esses nomes aparecem em dumps/repositórios dos assets do cliente, não em uma API oficial pública do Discord. GitHub | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Eu não copiaria os MP3 do Discord para o seu produto. Criaria sons próprios, curtos, com eventos equivalentes. Assim você obtém a mesma sensação de feedback sem distribuir assets proprietários. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 23. Configurações dos sons

Som pode ser ligado/desligado globalmente em Notificações. Não existe seção Sons com toggles por evento, seletor de arquivo ou volume de efeitos. Parcial significa que o evento sonoro existe, mas falta configuração individual.

Evidências: [client/src/components/AppearanceSettings.jsx](../client/src/components/AppearanceSettings.jsx), [client/src/preferences.js](../client/src/preferences.js), [client/src/utils/sounds.js](../client/src/utils/sounds.js), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Som de mensagem. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Som de menção. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Entrar em canal. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Sair de canal. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Pessoa entrando. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Pessoa saindo. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Mute. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Unmute. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Deafen. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Undeafen. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Chamada recebida. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Chamada efetuada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Compartilhamento iniciado. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Compartilhamento encerrado. | Parcial | Cobertura limitada conforme observação deste bloco. |
| Alguém entrou no compartilhamento. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alguém saiu. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ativar/desativar cada som. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Volume dos efeitos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu projeto eu faria uma seção chamada Sons com toggles individuais. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 24. Notificações

Notificações nativas e badge para DMs/pedidos. Preferências globais de habilitação/prévia e respeito a Não perturbe. Sem overrides por servidor/canal, silenciamento temporário ou modo só menções.

Evidências: [desktop/services.js](../desktop/services.js), [client/src/context/SocialContext.jsx](../client/src/context/SocialContext.jsx), [client/src/components/AppearanceSettings.jsx](../client/src/components/AppearanceSettings.jsx), [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Notificação desktop. | Implementado | Funcionalidade localizada no código. |
| Badge. | Implementado | Funcionalidade localizada no código. |
| Som. | Parcial | Som de mensagem no canal aberto; DM e convite de chamada não ligam os efeitos próprios. |
| Flash da janela opcional. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mensagens. | Parcial | DM notifica fora da conversa ativa; canal só notifica sem foco quando é o canal atual ou contém @handle. |
| Menções. | Parcial | Detecta @handle por substring; sem modelo completo de menções, cargos/@everyone/@here. |
| Chamadas. | Implementado | Funcionalidade localizada no código. |
| Pedidos de amizade. | Implementado | Funcionalidade localizada no código. |
| Amizade aceita. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Convites. | Parcial | Convite de voz notifica; convite de servidor chega como mensagem DM, sem categoria própria. |
| Notificações por servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Notificações por canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Silenciar servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Silenciar canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Silenciar temporariamente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Todas as mensagens. | Parcial | Não há modo Todas as mensagens por servidor/canal; comportamento é fixo e parcial. |
| Somente menções. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Nenhuma. | Parcial | Pode desativar notificações globalmente; não há modo Nenhuma por servidor/canal. |
| Discord permite overrides específicos por canal/categoria além das configurações do servidor. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 25. Configuração visual

Seis temas, seguir sistema, fonte de mensagens 12–20 px, modo compacto e reduzir movimento. Sem zoom/escala explícitos ou preferências de link preview/GIF.

Evidências: [client/src/components/AppearanceSettings.jsx](../client/src/components/AppearanceSettings.jsx), [client/src/preferences.js](../client/src/preferences.js), [client/src/context/PreferencesContext.jsx](../client/src/context/PreferencesContext.jsx), [client/src/index.css](../client/src/index.css).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Tema escuro. | Implementado | Funcionalidade localizada no código. |
| Tema claro. | Implementado | Funcionalidade localizada no código. |
| Seguir sistema. | Implementado | Funcionalidade localizada no código. |
| Tamanho da fonte. | Implementado | Ajusta fonte do conteúdo de mensagens, não de todos os textos da interface. |
| Zoom. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Escala da interface. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Densidade das mensagens. | Implementado | Funcionalidade localizada no código. |
| Compacto. | Implementado | Funcionalidade localizada no código. |
| Confortável. | Implementado | Estado não compacto funciona como disposição confortável; não há opção com esse rótulo. |
| Mostrar avatar nas mensagens. | Parcial | Avatares são exibidos (com agrupamento em canais), sem toggle para ocultar. |
| Mostrar preview de links. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar GIFs automaticamente. | Parcial | GIF anexado aparece como imagem; não há configuração de exibição automática. |
| Reproduzir GIFs automaticamente. | Parcial | GIF anima como imagem; não há toggle de autoplay. |
| Animações reduzidas. | Implementado | Funcionalidade localizada no código. |
| Para seu projeto: tema + fonte + zoom já bastam. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 26. Acessibilidade

Há redução de movimento, fonte de mensagens, labels e alguns indicadores textuais. Não há modo de alto contraste, zoom controlado, auditoria completa de teclado, legendas ou TTS.

Evidências: [client/src/components/AppearanceSettings.jsx](../client/src/components/AppearanceSettings.jsx), [client/src/index.css](../client/src/index.css), [client/src/components/MemberList.jsx](../client/src/components/MemberList.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Reduzir animações. | Implementado | Funcionalidade localizada no código. |
| Tamanho da fonte. | Implementado | Funcionalidade localizada no código. |
| Zoom. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Contraste. | Parcial | Temas claro/escuro e cores ajustáveis existem; não há modo específico de alto contraste nem medição de conformidade nesta auditoria. |
| Navegação por teclado. | Parcial | Inputs/botões aceitam teclado; elementos clicáveis como cards/perfis usam div sem suporte equivalente e não há foco gerenciado completo. |
| Indicação visual além de cor. | Parcial | Existem ícones/textos de fala/mute, mas algumas presenças dependem de bolinha/color e não há cobertura uniforme. |
| Legendas, se futuramente implementar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Text-to-speech pode ser dispensado inicialmente. | Ausente | Sem fluxo funcional correspondente localizado no código. |

### 27. Configurações de privacidade

Bloqueio funcional e regras fixas de acesso; não existe painel de privacidade com escolhas independentes.

Evidências: [server/src/social.js](../server/src/social.js), [server/src/application.js](../server/src/application.js), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx), [client/src/context/SocialContext.jsx](../client/src/context/SocialContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Quem vê perfil. | Parcial | Presença é filtrada por amigos/servidores em comum e bloqueio. Não há seletor de visibilidade de perfil; assets marcados como perfil podem ser lidos por qualquer conta autenticada. |
| Quem vê atividade. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem pode mandar DM. | Parcial | Nova DM exige amizade e ausência de bloqueio; conversa já existente segue acessível conforme regras fixas. Sem seletor. |
| Quem pode enviar amizade. | Parcial | Regra fixa: conta não bloqueada pode solicitar; sem opções sociais configuráveis. |
| Quem pode chamar. | Parcial | Convite de voz exige amizade, ausência de bloqueio e membros do mesmo servidor; sem seletor de quem pode chamar. |
| Usuários bloqueados. | Implementado | Funcionalidade localizada no código. |
| Servidores bloqueados para DM. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord atualmente separa visibilidade completa do perfil e permissões sociais; por exemplo, esconder o perfil não impede automaticamente DMs ou pedidos de amizade. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Essa separação é boa para copiar. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 28. Convites de servidor

Convites por código/link HTTP(S), expiração, limites, permanência, revogação e compartilhamento por DM. Não há registro de protocolo app:// no desktop.

Evidências: [server/src/conversation-tools.js](../server/src/conversation-tools.js), [client/src/components/ServerInvites.jsx](../client/src/components/ServerInvites.jsx), [client/src/invites.js](../client/src/invites.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Gerar convite. | Implementado | Funcionalidade localizada no código. |
| Copiar link/código. | Implementado | Funcionalidade localizada no código. |
| Entrar usando código. | Implementado | Funcionalidade localizada no código. |
| Expiração. | Implementado | Funcionalidade localizada no código. |
| Limite de usos. | Implementado | Funcionalidade localizada no código. |
| Convite permanente. | Implementado | Funcionalidade localizada no código. |
| Revogar convite. | Implementado | Funcionalidade localizada no código. |
| Ver quem criou convite. | Parcial | API/listagem armazena created_by; a interface mostra código/usos/expiração e não o nome de quem criou. |
| Para amigos você pode simplificar para: | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 29. Membros do servidor

Lista lateral deriva de presença global visível, sem consulta a todos os membros do servidor selecionado. Abre perfil e permite ações de amizade/DM quando o perfil contém handle; sem ferramentas de moderação.

Evidências: [client/src/components/MemberList.jsx](../client/src/components/MemberList.jsx), [client/src/components/UserProfileModal.jsx](../client/src/components/UserProfileModal.jsx), [server/src/application.js](../server/src/application.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Lista de membros. | Parcial | Pode incluir amigos/membros de outro servidor compartilhado e excluir membros realmente desconectados; não é roster completo do servidor selecionado. |
| Separar online/offline. | Parcial | Separa status online/offline entre sockets ativos; não inclui automaticamente usuários desconectados. |
| Mostrar cargos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pesquisar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir perfil. | Implementado | Funcionalidade localizada no código. |
| Enviar DM. | Parcial | Via perfil, se amizade aceita; falta ação direta/listagem consistente. |
| Adicionar amigo. | Parcial | Via perfil com handle disponível; falta ação direta/listagem consistente. |
| Bloquear. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Alterar apelido. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| expulsar; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| banir; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| silenciar; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| mover; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| alterar cargos. | Ausente | Sem fluxo funcional correspondente localizado no código. |

### 30. Apelido por servidor

Há identidade global e nome de exibição global. Não existe nickname por servidor ou alteração administrativa de apelido.

Evidências: [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/auth.js](../server/src/auth.js), [client/src/components/UserProfileModal.jsx](../client/src/components/UserProfileModal.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Username global continua o mesmo. | Implementado | Funcionalidade localizada no código. |
| Apelido pode mudar naquele servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administradores podem alterar apelido de membros com permissão. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para grupo de amigos é uma função simples e boa. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 31. Cargos

Somente estrutura de banco: roles(name,color,position,permissions) e server_members.role_id. Não há rotas de cargos, editor, atribuição funcional, hierarquia aplicada ou @everyone.

Evidências: [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/auth.js](../server/src/auth.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Nome. | Parcial | Coluna name existe, sem fluxo de edição. |
| Cor. | Parcial | Coluna color existe, sem renderização/edição de cargo. |
| Hierarquia. | Parcial | Coluna position existe, sem regras de hierarquia. |
| Arrastar posição. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atribuir a usuários. | Parcial | role_id existe no vínculo de membro, sem API/interface para atribuição. |
| Remover. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar membros separadamente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permissões. | Parcial | Coluna permissions existe, mas channelAccess usa somente associação ao servidor. |
| Cargo padrão @everyone. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Administrador. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord usa hierarquia: um cargo normalmente só administra cargos abaixo dele. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 32. Permissões que fazem sentido para seu aplicativo

Não existe sistema configurável de permissões. Os itens parciais têm comportamento fixo por proprietário/membro/autor, sem grants por cargo, categoria ou canal.

Evidências: [server/src/auth.js](../server/src/auth.js), [server/src/application.js](../server/src/application.js), [server/src/conversation-tools.js](../server/src/conversation-tools.js), [server/src/realtime.js](../server/src/realtime.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Administrador. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Gerenciar servidor. | Parcial | Dono altera nome/ícone/banner por API; sem permissão delegável. |
| Gerenciar canais. | Parcial | Dono cria canal; sem permissão delegável nem gerenciamento completo. |
| Gerenciar cargos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Expulsar membros. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Banir membros. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Gerenciar apelidos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Criar convite. | Parcial | Membro pode criar convite; sem toggle por cargo. |
| Ver canal. | Parcial | Ver canal depende de pertencer ao servidor. |
| Enviar mensagem. | Parcial | Enviar depende de pertencer ao servidor. |
| Apagar mensagens. | Parcial | Autor só exclui mensagens próprias; não há apagar mensagens de outros. |
| Fixar mensagens. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Anexar arquivos. | Parcial | Membros enviam anexos; sem toggle por cargo/canal. |
| Reagir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mencionar everyone. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Entrar em voz. | Parcial | Entrada em voz depende de pertencer ao servidor. |
| Falar. | Parcial | Participante pode transmitir áudio; não há restrição por cargo. |
| Vídeo. | Parcial | Participante pode transmitir câmera; não há restrição por cargo. |
| Compartilhar tela. | Parcial | Participante pode compartilhar tela; não há restrição por cargo. |
| Mutar membros. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ensurdecer membros. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mover membros. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu projeto não precisa copiar as dezenas de permissões obscuras do Discord. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 33. Banimento/moderação

Não existem kick, ban/unban, timeout, moderação de mensagens ou silêncio imposto pelo servidor. Bloqueio pessoal não substitui banimento de servidor.

Evidências: [server/src/social.js](../server/src/social.js), [server/src/application.js](../server/src/application.js), [server/src/realtime.js](../server/src/realtime.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Kick. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ban. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Unban. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Motivo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excluir mensagens recentes opcional. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Timeout temporário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mutar no canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Logs básicos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para amigos é suficiente. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 34. Logs administrativos

Não há registro de ações administrativas. Logs de aplicação e ownership_recovery_audit são técnicos/específicos, não um audit log de servidor.

Evidências: [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/conversation-tools.js](../server/src/conversation-tools.js), [desktop/logging.js](../desktop/logging.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Quem criou canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem apagou. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem alterou cargo. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem expulsou alguém. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem baniu. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem alterou configuração. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem criou convite. | Parcial | Convite armazena created_by/created_at; não existe evento em um log administrativo consultável. |
| Data/hora. | Parcial | Datas existem em registros de convites e recuperação de propriedade, sem linha do tempo de ações administrativas. |
| Para servidor de amigos: opcional, porém ajuda bastante a descobrir quem fez besteira. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 35. Busca

Busca textual dentro do canal atual, até 100 resultados, com salto à mensagem. Sem busca global, de DM/conversa, canal/usuário ou filtros avançados.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx), [server/src/application.js](../server/src/application.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Pesquisar conversa. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pesquisar canal. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pesquisar usuário. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Pesquisar mensagem. | Implementado | Funcionalidade localizada no código. |
| Resultado com contexto. | Parcial | Resultados trazem autor e texto e permitem abrir a mensagem; não trazem mensagens ao redor como contexto. |
| Clicar e ir para mensagem. | Implementado | Funcionalidade localizada no código. |
| Filtro: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| de usuário; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| com arquivo; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| com imagem; | Ausente | Sem fluxo funcional correspondente localizado no código. |
| período. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para primeira versão, uma busca textual global basta. | Contexto | A sugestão de busca textual global ainda não foi implementada; a busca existente é por canal. |

### 36. Emojis

Picker Unicode com categorias fixas nos canais. Sem recentes/favoritos/busca/emojis de servidor ou reações.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Emoji normal. | Implementado | Funcionalidade localizada no código. |
| Emoji picker. | Implementado | Funcionalidade localizada no código. |
| Recentes. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Favoritos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Busca. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Emojis próprios do servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Upload pelo administrador. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Usar na mensagem. | Implementado | Funcionalidade localizada no código. |
| Usar como reação. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu projeto: vale a pena. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 37. GIFs

GIF funciona como arquivo de imagem anexado ao canal. Não há catálogo de GIFs, busca, recentes/favoritos ou integração de busca com Tenor/Giphy.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Busca. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Recentes. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Favoritos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Preview. | Parcial | GIF aparece animado depois do envio; antes do envio a prévia mostra só nome/tamanho do arquivo. |
| Envio. | Implementado | Funcionalidade localizada no código. |
| Pode deixar integração com Tenor/Giphy para depois. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 38. Stickers

Não há biblioteca, picker ou entidade de sticker. Enviar uma imagem comum não implementa stickers.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx), [server/src/migrations/index.js](../server/src/migrations/index.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Stickers padrão. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Stickers do servidor. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Picker. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seu app: dispensável no começo. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 39. Reações

Não há tabela/API/socket/interface de reações. Picker de emoji insere texto na mensagem, não reação.

Evidências: [client/src/components/ChatArea.jsx](../client/src/components/ChatArea.jsx), [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/conversation-tools.js](../server/src/conversation-tools.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Clicar emoji. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mostrar quantidade. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Ver quem reagiu. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Remover reação própria. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Vários emojis. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Excelente custo-benefício para seu projeto. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 40. Soundboard

Não há soundboard. Os efeitos locais de interface não são clipes transmitidos aos participantes da chamada.

Evidências: [client/src/utils/sounds.js](../client/src/utils/sounds.js), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Discord possui soundboard dentro de canais de voz com pequenos clipes reproduzidos para todos. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Botão Soundboard. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Lista de sons. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Som personalizado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Volume. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Favoritos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Permissão de uso. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para seus amigos isso poderia ser muito legal, embora não seja prioridade. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 41. Indicadores de estado em tempo real

Presença, fala, câmera, microfone e stream são sinalizados. Digitando é exclusivo de canais; alguns estados não têm visualização completa para terceiros.

Evidências: [client/src/context/SocketContext.jsx](../client/src/context/SocketContext.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [server/src/realtime.js](../server/src/realtime.js), [client/src/components/MemberList.jsx](../client/src/components/MemberList.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Digitando… | Parcial | Indicador em canais de texto; ausente nas DMs. |
| Falando. | Implementado | Funcionalidade localizada no código. |
| Microfone mutado. | Implementado | Funcionalidade localizada no código. |
| Deafen. | Parcial | Deafen próprio funciona e estado remoto é distribuído; sem indicador remoto dedicado no card. |
| Câmera ligada. | Implementado | Funcionalidade localizada no código. |
| Compartilhando. | Implementado | Funcionalidade localizada no código. |
| Assistindo compartilhamento. | Parcial | O próprio espectador vê Assistindo e backend registra vínculo; outros participantes não veem um indicador geral de espectadores. |
| Online. | Implementado | Funcionalidade localizada no código. |
| Ausente. | Implementado | Funcionalidade localizada no código. |
| Offline. | Parcial | Amigos possuem fallback offline; a lista de membros do servidor não lista todos os desconectados. |
| Em chamada. | Implementado | Funcionalidade localizada no código. |
| Fundamental para fazer o aplicativo parecer polido. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 42. Menu inferior estilo Discord

Painel inferior de perfil/voz e ações principais existe.

Evidências: [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Seu avatar. | Implementado | Funcionalidade localizada no código. |
| Username. | Implementado | Funcionalidade localizada no código. |
| Status. | Implementado | Funcionalidade localizada no código. |
| Microfone. | Implementado | Funcionalidade localizada no código. |
| Deafen. | Implementado | Funcionalidade localizada no código. |
| Configurações. | Implementado | Funcionalidade localizada no código. |
| Quando conectado: | Contexto | Orientação/comentário da lista; não contado como requisito. |
| canal atual; | Implementado | Funcionalidade localizada no código. |
| status da conexão; | Parcial | Painel lateral escreve Voz Conectada enquanto há currentVoiceChannel, sem refletir reconexão; estado dinâmico existe no cabeçalho da sala de voz. |
| compartilhar; | Implementado | Funcionalidade localizada no código. |
| desconectar. | Implementado | Funcionalidade localizada no código. |

### 43. Configurações de chamada/voz por usuário

Abrir perfil funciona; não há volume/mute/vídeo por pessoa ou preferência de prioridade de stream.

Evidências: [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Volume da pessoa. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Silenciar localmente. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Desabilitar vídeo dela opcional. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Priorizar stream. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir perfil. | Implementado | Funcionalidade localizada no código. |
| Para seu projeto: volume + mute local já resolve. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 44. Atalhos de teclado

Não há os atalhos de chamada enumerados nem editor de atalhos. Existe Ctrl+Alt+Esc global apenas para encerrar assistência; Escape cancela edição/resposta em alguns formulários.

Evidências: [desktop/main.js](../desktop/main.js), [client/src/components/MessageTools.jsx](../client/src/components/MessageTools.jsx), [client/src/components/FriendsHome.jsx](../client/src/components/FriendsHome.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Mutar/desmutar. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Deafen. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Push-to-Talk. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atender chamada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Recusar chamada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Iniciar/parar compartilhamento. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir overlay. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir app. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atalhos personalizáveis. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para Desktop vale muito a pena. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 45. Overlay durante jogos

Não há overlay de jogo. Indicador nativo da assistência e badge de tarefa do Windows têm funções diferentes.

Evidências: [desktop/main.js](../desktop/main.js), [desktop/services.js](../desktop/services.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Lista de pessoas na chamada. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Quem está falando. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mute. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mensagens recentes. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Notificação. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Chat rápido. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Compartilhamento. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| No seu projeto isso combina especialmente bem com o launcher/cloud gaming, mas não é prioridade para a primeira versão. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 46. Bandeja do Windows

Não existe Tray/menu de bandeja, inicialização com Windows ou fechar para bandeja. No Windows fechar todas as janelas encerra o Electron.

Evidências: [desktop/main.js](../desktop/main.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Minimizar para tray. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Abrir. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Mute. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Deafen. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Sair. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Iniciar com Windows. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Manter rodando quando fechar janela. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Para Electron/Desktop: implementar. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 47. Configuração do aplicativo

Perfil/Aparência/Notificações/Atualizações são as abas existentes. Sem preferências de autostart, iniciar minimizado, tray, aceleração de hardware, idioma ou atalhos.

Evidências: [client/src/components/UserSettingsModal.jsx](../client/src/components/UserSettingsModal.jsx), [client/src/components/AppearanceSettings.jsx](../client/src/components/AppearanceSettings.jsx), [client/src/components/VoiceRoom.jsx](../client/src/components/VoiceRoom.jsx), [desktop/updates.js](../desktop/updates.js), [desktop/main.js](../desktop/main.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Iniciar com Windows. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Iniciar minimizado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Fechar para bandeja. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Aceleração de hardware. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Atualizações automáticas. | Implementado | Updater automático com download e instalação/reinício verificado; esta auditoria não repetiu o teste público de atualização. |
| Idioma. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Tema. | Implementado | Funcionalidade localizada no código. |
| Notificações. | Parcial | Habilitação/prévia global, sem granularidade por servidor/canal. |
| Sons. | Parcial | Apenas on/off global; sem volume ou controles por evento. |
| Voz e vídeo. | Parcial | Controles e seletor de mídia dentro da chamada, sem painel completo de voz/vídeo. |
| Privacidade. | Parcial | Bloqueio e regras fixas; sem aba de privacidade ou seletores. |
| Atalhos. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Dispositivos. | Parcial | Microfone e saída; webcam e volumes ainda sem seleção/ajuste. |
| Para seu Desktop: extremamente importante. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 48. Conexão/reconexão

Socket.IO reconecta com backoff; VoiceMesh tenta ICE restart e VoiceContext recria mídia/sala após reconectar. Há estados de conexão/erro e preservação de trilhas locais. Fluxo localizado no código e coberto por testes existentes; nesta auditoria não foi repetido o E2E React de restart do backend. Recuperação de assistir stream é menos completa que recuperação da voz e consentimento de assistência é revogado quando a conexão cai.

Evidências: [client/src/context/SocketContext.jsx](../client/src/context/SocketContext.jsx), [client/src/context/VoiceContext.jsx](../client/src/context/VoiceContext.jsx), [client/src/rtc/VoiceMesh.js](../client/src/rtc/VoiceMesh.js), [client/src/context/AuthContext.jsx](../client/src/context/AuthContext.jsx), [client/src/App.jsx](../client/src/App.jsx), [tests/ui-electron.js](../tests/ui-electron.js).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Reconectar automaticamente Socket/WebSocket. | Implementado | Funcionalidade localizada no código. |
| Reconectar voz/WebRTC. | Implementado | Funcionalidade localizada no código. |
| Mostrar "Reconectando". | Implementado | Funcionalidade localizada no código. |
| Mostrar "Conectado". | Implementado | Funcionalidade localizada no código. |
| Mostrar erro. | Implementado | Funcionalidade localizada no código. |
| Não exigir reiniciar aplicativo. | Implementado | Funcionalidade localizada no código. |
| Restaurar chamada após pequenas quedas. | Implementado | Funcionalidade localizada no código. |
| Isso é uma das coisas que mais fazem diferença na sensação de qualidade. | Contexto | Orientação/comentário da lista; não contado como requisito. |

### 49. Eventos no servidor

Não há entidades/API/interface de eventos agendados, interessados ou lembretes.

Evidências: [server/src/migrations/index.js](../server/src/migrations/index.js), [server/src/application.js](../server/src/application.js), [client/src/components/ChannelList.jsx](../client/src/components/ChannelList.jsx).

| Item da lista | Estado | Observação |
| --- | --- | --- |
| Criar evento. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Nome. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Data. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Hora. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Descrição. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Canal relacionado. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Lembrete. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Interessados. | Ausente | Sem fluxo funcional correspondente localizado no código. |
| Discord suporta eventos agendados atualmente. Suporte Discord | Contexto | Orientação/comentário da lista; não contado como requisito. |
| Para seus amigos: dispensável inicialmente. | Contexto | Orientação/comentário da lista; não contado como requisito. |

## Ordem sugerida para completar o núcleo do aplicativo

1. Conta: recuperação/troca de senha e gestão de sessões; ciclo de exclusão/desativação com preservação de dados conforme política definida.
2. Servidor: roster completo por servidor, sair/excluir/transferir propriedade, cargos/hierarquia/permissões e moderação básica.
3. Mensagens: reações, fixação, anexos em DM, links clicáveis, busca em DM/global e estados de leitura.
4. Voz: volume/mute por participante, seleção de webcam, sensibilidade/PTT e chamadas privadas independentes.
5. Desktop: bandeja/autostart, atalhos personalizáveis e sons por evento.
6. Em seguida: categorias, políticas de privacidade/notificação, threads, grupos de DM e recursos opcionais como eventos/stickers/soundboard/overlay.

Esta ordem é uma sugestão de trabalho baseada nas lacunas locais; não modifica a aplicação nem inicia implementação/publicação.
