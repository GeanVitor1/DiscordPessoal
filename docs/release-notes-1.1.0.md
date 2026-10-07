# MeuApp 1.1.0

Esta versão amplia a comunicação entre amigos e a administração das comunidades:

- Conta e segurança: gestão de senha, e-mail, sessões e dispositivos, autenticação em dois fatores e desativação/exclusão de conta. Recuperação e confirmação de e-mail usam SMTP quando configurado no backend.
- Perfis e privacidade: pronomes, status com expiração, links, informações em comum, perfil por servidor e políticas separadas para perfil, atividade, amizade, mensagens e chamadas.
- Comunidades: categorias, cargos com hierarquia, permissões por canal/categoria, apelidos, moderação, banimentos, registros administrativos e eventos com lembretes.
- Conversas: grupos, solicitações/spam, chamadas privadas com consentimento e histórico, Markdown, mídia/voz, reações, fixação, enquetes, threads e busca com navegação para o resultado.
- Voz e desktop: seleção e teste de dispositivos, volume por participante, VAD/PTT, atenuação de outros áudios no Windows, soundboard, notificações por escopo, atalhos, overlay, bandeja e interface em português/inglês.
- Assistência: clipboard opcional com consentimento específico e encerramento imediato do controle ao sair da chamada. Compartilhamento e assistência mantêm capturas e sessões independentes.

Instalador, helpers e atualização automática conferidos contra o código correspondente. Validação inclui 58 testes, interface Electron, migrações aditivas, backend de produção isolado e dois aplicativos empacotados no Windows com captura/áudio reais e input limitado a uma janela pertencente ao teste. Microfones/webcam de interface usam mídia sintética; duas máquinas físicas, UAC elevado e NAT/TURN externo não são cobertos por essa aceitação. SMTP externo precisa da configuração do serviço escolhido.
