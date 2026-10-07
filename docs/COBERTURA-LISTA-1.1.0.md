# Cobertura dos 49 blocos — versão em preparação 1.1.0

Esta matriz relaciona a implementação retomada à lista fornecida. A auditoria de 06/10 descreve a situação anterior. **Não é declaração de publicação nem comprovação manual de cada linha da lista.** A entrega depende dos artefatos finais, implantação compatível do backend e publicação/atualizador. O acompanhamento é `IMPLEMENTACAO-LISTA-2026-10-06.md`.

| Bloco | Implementação e evidência principal |
| --- | --- |
| 1. Conta/autenticação | `accounts.js`, `account-security.js`, `AccountSettings.jsx`, `LoginScreen.jsx`; sessões, senha/e-mail/recuperação/TOTP e ciclo de conta. SMTP isolado testado; configuração externa preparada. |
| 2. Perfil | `accounts.js`, `profiles.js`, `UserProfileModal.jsx`, `ProfileDetails`, `ServerProfileSettings.jsx`; perfil, expiração, links de contas, mútuos e perfil por servidor. Links declarados não constituem verificação OAuth de uma conta externa. |
| 3. Presença/atividade | `DesktopRuntime.jsx`, `ActivitySettings.jsx`, `desktop/features.js`; presença, idle, atividade opt-in dos programas escolhidos e duração. |
| 4. Amizade | `social.js`, `FriendsHome.jsx`, `SocialContext.jsx`; pedidos/listas/bloqueios, perfil, DM e chamada privada. |
| 5. Políticas de amizade | `settings.js`, `PrivacySettings.jsx`; combinação todos/amigos de amigos/servidores ou nenhuma. |
| 6. DMs | `conversations.js`, `PrivateChat.jsx`, `ConversationFeatures.jsx`, `RichMessage.jsx`; texto/mídia/histórico/digitação, ferramentas e leitura. |
| 7. Grupos | Tabelas separadas em migration 7; `conversations.js`, `PrivateChat.jsx`, `private-calls.js`; gestão de participantes e chamada. |
| 8. Solicitações/spam | `conversations.js`, `FriendsHome.jsx`, `PrivateChat.jsx`; estados separados e políticas/bloqueios. |
| 9. Servidor | `community.js`, `ServerManagement.jsx`, `community-media.js`; identidade, propriedade, gestão e mídia/eventos. |
| 10. Categorias | `CategorizedChannels.jsx`, `ServerManagement.jsx`, `permissions.js`; colapso, ordenação, associação e sincronização. |
| 11. Canais de texto | `community.js`, `message-validation.js`; gestão, slowmode e autorização por escopo. |
| 12. Mensagens | `RichMessage.jsx`, `MessageComposer.jsx`, `ConversationFeatures.jsx`; Markdown, menções, mídia/voz, drag/drop, reply e enquetes. |
| 13. Threads | `message-features.js`, `ConversationFeatures.jsx`; criação, participantes, gestão, slowmode e navegação/contexto. |
| 14. Voz | `realtime.js`, `voice-moderation.js`, `VoiceContext.jsx`; limites, permissões, moderação e reconexão. A rota é selecionada automaticamente por WebRTC/ICE direto ou TURN; não há serviço SFU nem seleção manual de região de mídia. |
| 15. Controles individuais | `ParticipantControls.jsx`, `AudioPreferencesContext.jsx`; volume 0–200%, mute local/perfil/DM e moderação autorizada. |
| 16. Áudio | `AudioSettings.jsx`, `audio-settings.js`, `VoiceContext.jsx`, `AudioSessionHost.cs`; dispositivos, teste, VAD/PTT, processamento e atenuação Windows. |
| 17. Câmera | `AudioSettings.jsx`, `VoiceContext.jsx`, `VideoWindow.jsx`; prévia, seleção/troca e modos de visualização. |
| 18. Compartilhamento | `ScreenSourcePickerModal.jsx`, `VoiceContext.jsx`, `VideoWindow.jsx`; fontes, qualidade/FPS, substituição, espectadores e visualização. Loopback Windows confirmado no pacote por sinal de 700 Hz e RTP. |
| 19. Assistência | Grants autenticados, `AssistanceContext.jsx`, `AssistancePanel.jsx`, `NativeInputHost.cs`, `clipboard-transfer.js`; consentimento independente, input real e clipboard opcional. Dois pacotes verificam revogação ao sair da voz. |
| 20. Interface da chamada | `VoiceRoom.jsx`, `PrivateCallView.jsx`, `DesktopRuntime.jsx`; participantes, fala, estados e controles. |
| 21. Chamadas em DM | `private-calls.js`, `PrivateCallView.jsx`; convite/aceite/recusa/ignore, duração/histórico e mídia. |
| 22. Sons | `utils/sounds.js`; sons próprios sintetizados para os eventos correspondentes, sem distribuir MP3 do Discord. |
| 23. Configuração de sons | `AppearanceSettings.jsx`, `preferences.js`; habilitação por evento e volume dos efeitos. |
| 24. Notificações | `notifications.js`, `NotificationSettings.jsx`, `SocialContext.jsx`, `desktop/services.js`; herança por servidor/canal, mute temporário, mentions, badge e flash. |
| 25. Visual | `AppearanceSettings.jsx`, `PreferencesContext.jsx`, `index.css`; temas/sistema, fonte, zoom/escala, densidade, mídia e movimento. |
| 26. Acessibilidade | Labels, foco/modal/teclado, tamanho/contraste/movimento e indicadores de estado. Legendas e TTS foram indicados como futuros/dispensáveis na lista. |
| 27. Privacidade | `settings.js`, `auth.js`, `profiles.js`, `PrivacySettings.jsx`; visibilidade e permissões sociais separadas, bloqueios e servidores bloqueados para DM. |
| 28. Convites | `conversation-tools.js`, `ServerInvites.jsx`; criação, limites, expiração, revogação, autor, compartilhamento e entrada. |
| 29. Membros | `community.js`, `MemberList.jsx`, `ServerManagement.jsx`; roster completo, offline, cargos, pesquisa e ações autorizadas. |
| 30. Apelidos | `server_profiles`, `server_members`, `profiles.js`, `community.js`; nome global preservado e gestão por servidor. |
| 31. Cargos | `permissions.js`, `community.js`, `ServerManagement.jsx`; @everyone, hierarquia, cor/hoist, atribuição e ordenação limitada à hierarquia. |
| 32. Permissões | `permissions.js`, `message-validation.js`, `voice-moderation.js`; verificação no servidor por conta autenticada, com escopos distintos. |
| 33. Moderação | `community.js`, `voice-moderation.js`; kick/ban/unban/motivo/timeout e voz. |
| 34. Logs | `audit_entries`, `community.js`, `conversation-tools.js`, `ServerManagement.jsx`; ator, ação e data. |
| 35. Busca | `message-features.js`, `GlobalSearch.jsx`, `message-navigation.js`; resultados autorizados, filtros e contexto/navegação, incluindo grupos. |
| 36. Emojis | `MediaPicker.jsx`, `community-media.js`; catálogo, pesquisa/recentes/favoritos e assets protegidos em mensagem/reação. |
| 37. GIFs | Biblioteca pesquisável própria com upload/recentes/favoritos/preview; Tenor/Giphy foram explicitamente deixados para depois na lista. |
| 38. Stickers | `MediaPicker.jsx`, `RichMessage.jsx`, `community-media.js`; padrão e personalizados do servidor. |
| 39. Reações | `message-features.js`, `ConversationFeatures.jsx`; quantidade, autores, adicionar/remover e emoji customizado com autorização. |
| 40. Soundboard | `soundboard.js`, `Soundboard.jsx`; sons customizados, volume/favoritos, permissão, broadcast e acesso temporário só na chamada. Integração real testada. |
| 41. Estados em tempo real | Socket.IO, `VoiceContext.jsx`, `SocialContext.jsx`; digitação, fala, presença, mídia, espectadores e chamada. |
| 42. Menu inferior | `ChannelList.jsx`; conta/presença, mic/deafen/configuração e canal/conexão/compartilhamento/desconexão. |
| 43. Preferências por participante | `AudioPreferencesContext.jsx`, `ParticipantControls.jsx`; volume, mute, vídeo, prioridade e perfil. |
| 44. Atalhos | `desktop/features.js`, `DesktopSettings.jsx`, `DesktopRuntime.jsx`; ações globais configuráveis e PTT enquanto em chamada. |
| 45. Overlay | `desktop/overlay.*`, `DesktopRuntime.jsx`; participantes/fala/mute, mensagens/notificação/chat e compartilhamento. Janela de sobreposição Windows; jogos em tela cheia exclusiva podem não permitir sua exibição. |
| 46. Tray | `desktop/features.js`, `DesktopSettings.jsx`; abrir/mute/deafen/sair, fechar para tray e início Windows. |
| 47. Configuração do app | `DesktopSettings.jsx`, `UserSettingsModal.jsx`, `localization.js`; preferências de runtime, updater e interface PT/en. Algumas mensagens de erro do backend ainda usam português. |
| 48. Reconexão | `SocketContext.jsx`, `VoiceContext.jsx`, `VoiceMesh.js`; estados, retenção e recuperação. Queda/restart local exercitados. |
| 49. Eventos | `community-media.js`, `EventManager`; data/hora/canal, interessados e lembretes. Lembrete real via Socket.IO testado em backend isolado. |

## Limites das verificações

Os testes não substituem duas máquinas físicas, redes externas/NAT/TURN, diálogo UAC elevado, instalação limpa ou jogos em modo exclusivo. Dispositivos reais são enumerados; microfones/webcam dos testes de interface usam tracks sintéticas. Captura de desktop, áudio de loopback e SendInput contra janela pertencente ao teste são reais na aceitação empacotada. O teste não altera a instalação nem bancos do usuário.

Autostart Windows e atalho físico PTT não são exercitados alterando o registro/perfil real do usuário. A atenuação foi medida/restaurada numa sessão de áudio silenciosa pertencente ao teste. A área de transferência é testada por consentimento/guard/replay sem ler ou escrever o clipboard pessoal.

Relatórios de build e aceitação em `docs/validation` registram versão, escopo e limites. A confirmação de atualização pública deve constar em `release-publication-1.1.0.json` e `published-updater-1.1.0.json`; esses arquivos só podem ser considerados evidência após a publicação e execução correspondentes.
