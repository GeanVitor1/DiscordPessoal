# 💬 Discord Clone - Fullstack Web

## Nova entrega local: 1.0.15

Instalador Windows: `dist/MeuApp-Setup-1.0.15.exe`. Agora há seis opções de tema, cor de destaque, ajustes de fonte e densidade, redução de movimento, preferências de notificações, convites por link ou enviados diretamente aos amigos, respostas em DMs, edição/exclusão de mensagens próprias, busca nos canais e histórico paginado.

Veja a [comparação com os recursos do Discord e as prioridades restantes](docs/COMPARACAO-DISCORD-1.0.15.md). Dados existentes são preservados pela migração aditiva 006. O backend/site atualizado está preparado em `artifacts/server-1.0.15`; os recursos online dependem da atualização desse serviço. Esta tarefa não publica nem implanta componentes remotos.

Os resultados atuais estão em `docs/validation/build.json`, `docs/validation/features-ui.json`, `docs/validation/packaged.json` e `docs/validation/installer-payload.json`. As seções abaixo descrevem entregas anteriores.

## Uso do aplicativo 1.0.14

Instale `dist/MeuApp-Setup-1.0.14.exe` e abra **MeuApp** pelo atalho. O EXE escolhe automaticamente o serviço online; não é necessário abrir terminais nem informar uma URL. O navegador usa o próprio endereço do site para a API e a conexão em tempo real. As opções de servidor personalizado ficam em **Opções avançadas**.

O EXE verifica atualizações ao abrir e a cada 15 minutos, baixa em segundo plano e instala ao fechar normalmente. Uma atualização pronta também pode ser instalada pelo botão **Reiniciar e atualizar**, inclusive na tela de login.

**Situação da entrega local:** o backend público ainda é anterior à autenticação por sessões, e a última versão publicada no GitHub é 1.0.10. O instalador local 1.0.14, o manifesto de atualização em `dist/latest.yml` e o pacote de site/backend em `artifacts/server-1.0.14` estão preparados. Nenhum serviço ou release remoto foi alterado. O uso online sem terminais depende da publicação desses componentes, preservando banco e uploads. Veja [a validação desta entrega](docs/INICIALIZACAO-ATUALIZACOES-1.0.14.md).

Os comandos abaixo são para desenvolvimento e manutenção do projeto.

Sistema completo inspirado no Discord com tema escuro clássico, canais de texto em tempo real, canais de voz/vídeo com WebRTC, compartilhamento de tela e upload de mídia.

A experiência desktop inclui assistência temporária integrada ao compartilhamento de uma tela inteira no Windows. Quem assiste solicita; quem compartilha autoriza; um indicador nativo permanece visível e permite encerrar pelo botão ou por Ctrl+Alt+Esc. Veja a [auditoria e os limites de validação](docs/AUDITORIA_DESKTOP.md) antes de considerar o produto pronto para produção.

Verificação: `npm test`, `npm run test:rtc`, `npm run test:ui`, `npm run build:client` e `npm run build:native`. Os testes de Electron usam mídia sintética e banco isolado. Para iniciar o desktop existente: `npm run desktop`. Amigos/DMs e autenticação completa ainda exigem implementação.

---

## 🚀 Como Iniciar

Tanto o servidor backend quanto o frontend cliente já estão configurados e prontos para uso.

### Opção 1: Iniciar ambos juntos
Na raiz do projeto (`c:\Users\geand\OneDrive\Documentos\Discord`):
```bash
node start-all.js
```

O início conjunto (`npm start`, `npm run dev` ou `npm run dev:lan`) usa HTTPS para liberar microfone, câmera e compartilhamento de tela na rede. Abra `https://192.168.23.58:5173` (ou o IP exibido no terminal), em vez de HTTP. Os certificados existentes incluem esse IP. Cada computador da rede precisa confiar na CA do mkcert; se o IP mudar, gere novamente com `npm run certs:gen` e o mkcert instalado. A chave privada da CA nunca deve ser compartilhada. Se os certificados estiverem ausentes, o servidor HTTPS interrompe o início e informa como gerá-los.

Para desenvolvimento Desktop, `npm run desktop` usa HTTP em localhost, que permite captura. O frontend iniciado individualmente continua em HTTP/localhost; para acesso por IP, use o início conjunto com HTTPS.

### Opção 2: Iniciar individualmente

1. **Backend**:
   ```bash
   cd server
   npm start
   ```
   Roda em `http://localhost:5000`

2. **Frontend**:
   ```bash
   cd client
   npm run dev
   ```
   Roda em `http://localhost:5173`

---

## 🎨 Funcionalidades Prontas

1. **Design e Interface Fiel ao Discord**:
   - Barra de servidores lateral esquerda com animação pill ao passar o mouse.
   - Lista de canais (#texto e 🔊voz) organizada por servidor.
   - Barra lateral direita de membros do servidor separados por status (*Disponível*, *Ausente*, *Não Perturbe*, *Invisível*).
   - Cores e fontes originais do Discord (`#313338`, `#2b2d31`, `#1e1f22`, Blurple `#5865f2`).

2. **Chat de Texto em Tempo Real (Socket.io)**:
   - Envio de mensagens instantâneas.
   - Indicador de digitação (*Fulano está digitando...*).
   - Seletor de Emojis rápido.
   - Envio de fotos, imagens e anexos de arquivos com download e visualização direta.

3. **Canais de Voz e WebRTC**:
   - Conexão e desconexão de salas de voz.
   - Indicador visual verde ao redor do avatar quando o usuário está falando.
   - Controles de microfone (Mudo/Desmudo), fone (Ensordecer) e desconexão rápida.
   - Compartilhamento de tela em tempo real com prévia do vídeo.

4. **Gerenciamento de Servidores e Canais**:
   - Botão `+` para criar novos servidores com escolha de emojis/ícones.
   - Botão `+` para adicionar canais de texto ou canais de voz aos servidores.

5. **Configurações e Perfil do Usuário**:
   - Modal de configurações no ícone de engrenagem para mudar nome e avatar com seeds DiceBear.
   - Menu rápido para mudar status (*Disponível*, *Ausente*, *Não Perturbe*, *Invisível*).


## Desktop 1.0.11

Contas autenticadas, amigos, DMs persistidas, notificacoes desktop, recuperacao de voz e entrada nativa PT-BR: veja [a entrega e validacao](docs/CONTINUACAO-1.0.11.md). O Definition of Done esta em [AGENTS.md](AGENTS.md); alteracoes desktop exigem testes e instalador reconstruido, sem publicacao remota automatica.
