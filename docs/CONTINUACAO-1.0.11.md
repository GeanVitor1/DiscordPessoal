# Continuação da implementação — 1.0.11

Esta etapa preserva a chamada, captura e consentimento anteriores. Acrescenta contas reais, amigos, DMs, notificações desktop, diagnóstico contínuo e recuperação de voz. A versão desktop e o helper são reconstruídos juntos. O manifesto do artefato está em [validation/build.json](validation/build.json).

A migração também foi ensaiada sobre backup somente para leitura do banco existente: os 6 usuários, 2 servidores, 7 canais e 1 mensagem original foram preservados. O esquema antigo sem `owner_id`, `description` e `updated_at` recebe apenas essas colunas ausentes; dono desconhecido continua sem credenciais. Evidência: [migration.json](validation/migration.json).

## Identidade e migração

O backend cria contas novas com identificador próprio e nome de usuário único. Senhas usam scrypt com salt aleatório, N=32768, r=8, p=3; comparação de hashes em tempo constante. Sessões opacas de 256 bits expiram em sete dias; somente o hash do token fica no banco. Há limite de tentativas por IP e de cálculos concorrentes. Não há recuperação de senha por email nesta versão.

O Electron guarda a sessão por origem do backend, criptografada com `safeStorage`/Windows. O navegador usa `sessionStorage`. Ambos carregam o perfil verificado por `/api/auth/me`; o antigo `discord_user_v2` não autentica ninguém. REST e handshake Socket.IO exigem sessão; pacotes de socket revalidam expiração, bloqueio e acesso ao canal. Logout revoga a sessão e desconecta seus sockets. Criação/edição de servidores e convites usam o dono autenticado, nunca `ownerId` enviado pelo cliente. Canal privado por servidor exige associação; não há permissões individuais por canal nesta etapa.

Migrations 4 e 5 são aditivas e executadas em transações, mantendo mensagens, servidores e perfis anteriores. A comunidade inicial do bot é pública e recebe as contas novas. Servidores particulares antigos continuam protegidos. O operador do backend pode recuperar um dono legado com `node server/scripts/recover-ownership.js SERVER_ID ACCOUNT_HANDLE`; exige acesso administrativo ao banco, conta já registrada e dono ainda sem credenciais, e grava auditoria. Não existe endpoint público para assumir perfis legados.

Amizades, solicitações, bloqueios, conversas, mensagens e marcadores de leitura ficam no banco. Eventos privados são enviados somente às salas dos dois usuários. Cada leitura/envio de DM verifica participação; bloqueios impedem novas mensagens, convites e sinalização entre os usuários. Uploads exigem autenticação e autorização sobre o arquivo/contexto; o cliente carrega blobs autenticados sem colocar tokens nas URLs. Imagens externas não recebem o token. Convites de servidor duram 24 horas e têm até 25 usos.

## Mídia, escala e assistência

Opus é priorizado quando as capacidades e `setCodecPreferences` permitem; não há alteração cega do SDP. Captura pede cancelamento de eco, supressão de ruído e ganho automático. Envio de voz tenta limitar 64 kbps; DTX só é solicitado quando exposto pelo navegador. O diagnóstico informa FEC/DTX quando presentes nos parâmetros negociados, sem inventar suporte ausente.

O diagnóstico de conexão, em “Áudio e vídeo”, amostra `getStats` a cada dois segundos: par selecionado pelo transporte, candidatos local/remoto, Direct/STUN/TURN, RTT, taxas medidas, perda no intervalo, jitter, codec, resolução, FPS, quadros descartados quando disponíveis e limitação de qualidade. Um candidato relay coletado ou um par apenas nomeado não constitui prova de TURN. Campos não expostos aparecem como “—”.

Screen share tem teto inicial de 6 Mbps por viewer e 30 FPS; mantém resolução solicitada. Três amostras consecutivas ruins reduzem o teto em 20%, com piso de 750 kbps. Oito amostras boas recuperam 10%, até o teto. Um pico isolado não reduz a qualidade. Não há garantia de qualidade em redes externas sem o ensaio real.

Reconexão Socket.IO refaz a malha de voz e repõe as faixas de microfone/câmera existentes. A captura local de tela continua; o viewer abre novamente a transmissão. Toda assistência anterior é revogada e precisa de novo consentimento. Encerrar assistência normalmente mantém a chamada e a transmissão em andamento.

Coordenadas normalizadas são interpoladas sobre os limites físicos depois da conversão DIP do Windows; preservam bordas, escalas e origens negativas. O helper ativa consciência de DPI por monitor. Teclas de controle/atalhos usam scan codes, inclusive teclas ABNT; texto e composição PT-BR usam Unicode. Revogação/EOF liberam teclas e botões. O helper não contorna a área protegida do Windows, UAC ou restrições de integridade do `SendInput`.

## Custo da malha atual

| Participantes | Conexões por usuário | Conexões totais | Cópias de áudio/câmera enviadas por usuário |
|---|---:|---:|---:|
| 2 | 1 | 1 | 1 |
| 3 | 2 | 3 | 2 |
| 5 | 4 | 10 | 4 |
| 10 | 9 | 45 | 9 |

São N−1 conexões por usuário e N(N−1)/2 no grupo. Uma tela compartilhada cria mais uma conexão por viewer: com todos assistindo, o host de dez participantes mantém nove envios adicionais. No teto de 6 Mbps, a tela pode demandar até 54 Mbps de upload nesse cenário, além da voz/câmera; o consumo real depende da adaptação. Não foi executado benchmark com dez PCs. `client/src/rtc/transport.js` concentra a escolha de transporte e define o contrato para um futuro adaptador SFU; a implementação atual continua mesh.

## Validação desta etapa

Os testes de backend usam SQLite temporário e três contas: login, tentativa de impersonação, amizade, aceite/recusa/remover/bloqueio, DM persistida, terceiro impedido de ler/enviar, canais privados, convite, uploads privados, identidade autenticada na assistência e revogação de sessão.

Dois clientes Electron carregam a interface React e criam contas: request/accept, DM e resposta; áudio remoto, câmera, tela, chat/resposta persistida, consentimento, eventos e revogação mantendo a tela. Um reinício real do backend verifica retomada automática da voz sem recapturar microfone e persistência das conversas. Mídia deste ensaio é sintética. Evidências visuais: [DM](validation/dm.png), [chamada](validation/call.png).

O teste nativo utiliza uma janela Electron própria e `NativeInputHost.exe` real: texto acentuado, Ctrl+A, modificadores/navegação, movimento, drag, clique direito, duplo clique, scroll e soltura de teclas no EOF. Um modo restrito do helper recusa entrada quando a janela alvo do teste não está em foco. Resultado: [native.json](validation/native.json). Os testes de IPC verificam vault criptografado, rejeição de outra janela, recusa padrão de consentimento, bloqueio de entrada sem autorização, badge e criação/rota/supressão de notificações; o toast é interceptado para não exibir mensagens de teste no desktop.

Os testes matemáticos cobrem 100%, 125%, 150%, monitor à esquerda, origens negativas, redimensionamento, fullscreen e letterboxing. Isso não substitui um ensaio físico com monitores dessas escalas. Ainda precisam de validação externa: dois PCs Windows, layouts/monitores reais variados, TURN selecionado entre redes diferentes, notificações visíveis do instalador sob as preferências do Windows, PostgreSQL real e carga de 5–10 participantes. Docker está instalado, mas o daemon não está disponível neste ambiente; PostgreSQL não foi apresentado como validado.

## Entrega e execução

O instalador é `dist/MeuApp-Setup-1.0.11.exe`, Windows x64, NSIS. O app empacotado fica em `dist/win-unpacked/MeuApp.exe`; este último precisa da pasta inteira. O helper está em `resources/app.asar.unpacked/desktop/NativeInputHost.exe`, e o launcher resolve corretamente o caminho fora de `app.asar`. A verificação compara hashes dos arquivos empacotados com o código e helper recém-compilados.

O instalador mantém `https://discordpessoal.onrender.com` como origem inicial e permite escolher outro backend na tela de login. O servidor público precisa receber esta versão do backend antes de aceitar as contas novas. O backend JavaScript foi executado e testado localmente; não há etapa de transpilação. Nenhum deploy, release, commit, tag ou push foi executado. A regra permanente de testes + recompilação + instalador está em [AGENTS.md](../AGENTS.md), e `npm run build:desktop` executa a cadeia completa usando `--publish never`.

PostgreSQL remoto valida certificado TLS por padrão; `PG_SSL_CA` permite CA própria. `PG_SSL_MODE=disable` é usado exclusivamente para o PostgreSQL na rede interna do Compose. `TRUST_PROXY_HOPS` deve refletir o número conhecido de proxies, com padrão zero; Compose com Caddy usa um.

Referências técnicas: [Node crypto/scrypt](https://nodejs.org/api/crypto.html), [WebRTC Stats W3C](https://www.w3.org/TR/webrtc-stats/), [WebRTC capabilities W3C](https://www.w3.org/TR/webrtc/), [Electron Screen](https://www.electronjs.org/docs/latest/api/screen), [Windows Keyboard Input](https://learn.microsoft.com/en-us/windows/win32/inputdev/keyboard-input-functions).


O teste adicional do EXE empacotado confirmou login, preload, versão 1.0.11, helper fora de app.asar e evento `show` de uma notificação Windows real. Também capturou o desktop real em 1920×1080, com faixa ativa; não gravou nem transmitiu imagens privadas. O valor de 30 FPS em `getSettings` descreve a configuração, não uma medição de FPS recebido. Evidência: [packaged.json](validation/packaged.json). O teste nativo restringe mouse/texto/pressionamentos à sua própria janela; solturas de entradas que o helper injetou continuam permitidas no encerramento. Bloquear um usuário revoga apenas a assistência entre o par envolvido; o teste com terceira conta confirma que uma sessão alheia continua válida.

O ensaio de interface confirmou nove comandos recebidos pelo DataChannel, incluindo Ctrl+Alt+Q, e mensagens não lidas quando uma DM anteriormente selecionada fica fora da tela ao abrir um servidor. O diagnóstico retorna `Unknown` quando faltam os tipos dos candidatos selecionados; não presume conexão direta sem esses dados.

Pacote local do backend, sem dados/credenciais: `dist/MeuApp-Backend-1.0.11.zip`, com [manifesto](validation/backend.json). A cadeia final passou 26 testes Node e os quatro ensaios Electron (RTC, UI, SendInput nativo e IPC/vault), seguida da geração e verificação do instalador.
