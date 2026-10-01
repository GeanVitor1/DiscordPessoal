# 💬 Discord Clone - Fullstack Web

Sistema completo inspirado no Discord com tema escuro clássico, canais de texto em tempo real, canais de voz/vídeo com WebRTC, compartilhamento de tela e upload de mídia.

---

## 🚀 Como Iniciar

Tanto o servidor backend quanto o frontend cliente já estão configurados e prontos para uso.

### Opção 1: Iniciar ambos juntos
Na raiz do projeto (`c:\Users\geand\OneDrive\Documentos\Discord`):
```bash
node start-all.js
```

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
