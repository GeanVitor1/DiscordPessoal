import { usePreferences } from './context/PreferencesContext';
import FriendsHome from './components/FriendsHome';
import React, { useState, useEffect } from 'react';
import axios from './api';
import ServerList from './components/ServerList';
import ChannelList from './components/ChannelList';
import ChatArea from './components/ChatArea';
import VoiceRoom from './components/VoiceRoom';
import MemberList from './components/MemberList';
import UserSettingsModal from './components/UserSettingsModal';
import UserProfileModal from './components/UserProfileModal';
import InteractionRequestModal from './components/InteractionRequestModal';
import AssistancePanel from './components/AssistancePanel';
import { useVoice } from './context/VoiceContext';
import { useSocket } from './context/SocketContext';
import { API_BASE_URL, IS_BACKEND_CONFIGURED, ENVIRONMENT, isElectron } from './config';
import { WifiOff, RefreshCw, AlertTriangle, Download, ArrowUpCircle, CheckCircle } from 'lucide-react';

export default function App() {
  const { preferences } = usePreferences();
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewedUser, setViewedUser] = useState(null); // Usuário para exibir o perfil popover

  // Controle de Atualizações Automáticas (Electron)


  // Controle de Conexão com o Backend
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState(null);

  const { currentVoiceChannel, joinVoice } = useVoice();
  const { socket } = useSocket();

  // Escuta eventos de atualização automática vindos do Electron

  // Função centralizada para carregar ou reconectar aos servidores
  const fetchServers = async () => {
    if (!IS_BACKEND_CONFIGURED) {
      const msg = 'Backend de produção não configurado. Por favor, forneça a URL do backend central.';
      setConnectionError(msg);
      setIsConnecting(false);
      if (window.electronAPI?.log) {
        window.electronAPI.log('network', 'Inicialização abortada: backend não configurado');
      }
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (window.electronAPI?.log) {
        window.electronAPI.log('network', `Testando conexão com ${API_BASE_URL}/api/health`);
      }
      // Testa health check com timeout de 5 segundos
      await axios.get(`${API_BASE_URL}/api/health`, { timeout: 5000 });

      // Carrega lista de servidores
      const res = await axios.get(`${API_BASE_URL}/api/servers`, { timeout: 5000 });
      setServers(res.data);
      if (res.data.length > 0) {
        const firstServer = res.data[0];
        setCurrentServer(firstServer);
        const firstTextChannel = firstServer.channels?.find((c) => c.type === 'text');
        setCurrentChannel(firstTextChannel || firstServer.channels?.[0]);
      }
      setIsConnecting(false);
      if (window.electronAPI?.log) {
        window.electronAPI.log('network', 'Conectado com sucesso ao backend central', { serversCount: res.data.length });
      }
    } catch (err) {
      console.error('[Backend Connection Error]', err);
      const errMsg = err.code === 'ECONNABORTED'
        ? 'Tempo limite de conexão esgotado (Timeout).'
        : err.response
        ? `Servidor retornou erro: HTTP ${err.response.status}`
        : 'Não foi possível conectar ao servidor central.';
      
      setConnectionError(errMsg);
      setIsConnecting(false);

      if (window.electronAPI?.log) {
        window.electronAPI.log('network', 'Falha ao conectar com backend central', {
          error: err.message,
          code: err.code
        });
      }
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (!connectionError) return;
    const timer = setTimeout(fetchServers, 5000);
    return () => clearTimeout(timer);
  }, [connectionError]);

  // Escuta novos servidores criados em tempo real (Desacoplado de currentServer para não recriar listeners)
  useEffect(() => {
    if (!socket) return;

    const handleServerCreated = (newServer) => {
      setServers((prev) => {
        if (prev.some(s => s.id === newServer.id)) return prev;
        return [...prev, newServer];
      });
    };

    const handleServerUpdated = (updatedServer) => {
      setServers((prev) =>
        prev.map((s) => (s.id === updatedServer.id ? updatedServer : s))
      );
      setCurrentServer((prev) => (prev?.id === updatedServer.id ? updatedServer : prev));
    };

    const handleChannelCreated = ({ serverId, channel }) => {
      setServers((prev) =>
        prev.map((s) => {
          if (s.id === serverId) {
            const exists = s.channels?.some(c => c.id === channel.id);
            if (exists) return s;
            return { ...s, channels: [...(s.channels || []), channel] };
          }
          return s;
        })
      );
      setCurrentServer((prev) => {
        if (prev?.id === serverId) {
          const exists = prev.channels?.some(c => c.id === channel.id);
          if (exists) return prev;
          return {
            ...prev,
            channels: [...(prev.channels || []), channel]
          };
        }
        return prev;
      });
    };

    socket.on('server_created', handleServerCreated);
    socket.on('server_updated', handleServerUpdated);
    socket.on('channel_created', handleChannelCreated);

    return () => {
      socket.off('server_created', handleServerCreated);
      socket.off('server_updated', handleServerUpdated);
      socket.off('channel_created', handleChannelCreated);
    };
  }, [socket]);

  useEffect(() => {
    const home = () => { setCurrentServer(null); setCurrentChannel(null); };
    const channel = event => { const route=event.detail; const server=servers.find(s=>s.channels?.some(c=>c.id===route.channelId)); if (!server) return; const ch=server.channels.find(c=>c.id===route.channelId); setCurrentServer(server);setCurrentChannel(ch);if(route.join && ch.type==='voice') joinVoice(ch); };
    const joined=event=>{setServers(prev=>prev.some(s=>s.id===event.detail.id)?prev:[...prev,event.detail]);setCurrentServer(event.detail);setCurrentChannel(event.detail.channels?.find(c=>c.type==='text'));};
    window.addEventListener('server-joined',joined);
    window.addEventListener('navigate-home',home);window.addEventListener('navigate-channel',channel);
    return()=>{window.removeEventListener('server-joined',joined);window.removeEventListener('navigate-home',home);window.removeEventListener('navigate-channel',channel);};
  },[servers,joinVoice]);

  useEffect(() => { document.body.dataset.currentChannel = currentChannel?.id || ''; }, [currentChannel]);

  // Troca de servidor
  const handleSelectServer = (server) => {
    setCurrentServer(server);
    if (server) {
      const firstTextChannel = server.channels?.find((c) => c.type === 'text');
      setCurrentChannel(firstTextChannel || server.channels?.[0]);
    } else {
      setCurrentChannel(null);
    }
  };

  // Criação de Servidor com rastreamento completo de diagnóstico
  const handleCreateServer = async (name, icon) => {
    console.log('[ServerCreate] clicked');
    console.log('[ServerCreate] payload:', { name, icon });
    console.log(`[ServerCreate] POST ${API_BASE_URL}/api/servers`);

    if (window.electronAPI?.log) {
      window.electronAPI.log('app', 'Tentativa de criação de servidor', { name, icon });
    }

    try {
      const res = await axios.post(`${API_BASE_URL}/api/servers`, { name, icon }, { timeout: 8000 });
      console.log('[ServerCreate] status:', res.status);
      console.log('[ServerCreate] response:', res.data);

      const created = res.data;
      setServers((prev) => prev.some(s => s.id === created.id) ? prev : [...prev, created]);
      setCurrentServer(created);
      if (created.channels?.length > 0) {
        setCurrentChannel(created.channels[0]);
      }
      console.log('[ServerCreate] state updated');
      if (window.electronAPI?.log) {
        window.electronAPI.log('app', 'Servidor criado com sucesso', { id: created.id, name: created.name });
      }
    } catch (err) {
      console.error('[ServerCreate ERROR]', {
        status: err.response?.status,
        message: err.message,
        stack: err.stack
      });

      if (window.electronAPI?.log) {
        window.electronAPI.log('app', 'Falha ao criar servidor', {
          error: err.message,
          status: err.response?.status
        });
      }

      alert(`Falha ao criar servidor: ${err.response?.data?.error || err.message}`);
    }
  };

  // Criação de Canal
  const handleCreateChannel = async (name, type) => {
    if (!currentServer) return;
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/servers/${currentServer.id}/channels`,
        { name, type },
        { timeout: 8000 }
      );
      setCurrentChannel(res.data);
    } catch (err) {
      console.error('Erro ao criar canal:', err);
      alert(`Falha ao criar canal: ${err.response?.data?.error || err.message}`);
    }
  };

  // Tela de Conexão Offline / Falha de Backend
  if (isConnecting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-discord-darkest text-white">
        <RefreshCw className="w-10 h-10 text-discord-blurple animate-spin mb-4" />
        <h2 className="text-xl font-bold mb-2">Conectando…</h2>
        <p className="text-sm text-discord-textMuted max-w-md text-center">
          Aguarde enquanto carregamos suas conversas.
        </p>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-discord-darkest text-white p-6">
        <div className="w-16 h-16 rounded-full bg-discord-red/20 text-discord-red flex items-center justify-center mb-4">
          <WifiOff className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Conexão interrompida</h2>
        <p className="text-sm text-discord-textMuted max-w-lg text-center mb-6 leading-relaxed">
          Tentando reconectar automaticamente. Suas conversas continuam salvas.
        </p>

        {/* Diagnóstico visível */}
        {import.meta.env.DEV && <div className="bg-discord-darker border border-discord-active rounded-lg p-4 max-w-lg w-full mb-6 font-mono text-xs text-gray-300 space-y-1">
          <div><strong className="text-white">Ambiente:</strong> {ENVIRONMENT}</div>
          <div><strong className="text-white">Plataforma:</strong> {isElectron ? 'Desktop (Electron)' : 'Navegador Web'}</div>
          <div><strong className="text-white">API URL:</strong> {API_BASE_URL || '<Não configurada>'}</div>
          <div><strong className="text-white">Socket URL:</strong> {API_BASE_URL ? API_BASE_URL : '<Não configurada>'}</div>
        </div>}

        <button
          onClick={fetchServers}
          className="px-6 py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover text-white rounded-lg font-semibold flex items-center gap-2 transition shadow-lg"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-discord-chat text-discord-textNormal select-none">
      {/* 1. Barra Lateral de Servidores */}
      <ServerList
        servers={servers}
        currentServer={currentServer}
        onSelectServer={handleSelectServer}
        onCreateServer={handleCreateServer}
      />

      {/* 2. Barra de Canais & Perfil */}
      <ChannelList
        server={currentServer}
        currentChannel={currentChannel}
        onSelectChannel={(ch) => setCurrentChannel(ch)}
        onCreateChannel={handleCreateChannel}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={(u) => setViewedUser(u)}
      />

      {/* 3. Área Principal: Chat de Texto ou Sala de Voz */}
      <div className="flex-1 min-w-0 flex overflow-hidden">
        {!currentServer ? <FriendsHome /> : currentChannel?.type === 'voice' || (currentVoiceChannel && currentChannel?.id === currentVoiceChannel.id) ? (
          <VoiceRoom
            channel={currentVoiceChannel || currentChannel}
            server={currentServer}
            textChannel={currentServer?.channels?.find(c => c.type === 'text')}
            onOpenProfile={(u) => setViewedUser(u)}
          />
        ) : (
          <ChatArea
            server={currentServer}
            channel={currentChannel}
            onOpenProfile={(u) => setViewedUser(u)}
            onSwitchToVoice={(voiceChannel) => setCurrentChannel(voiceChannel)}
          />
        )}

        {/* 4. Barra Lateral Direita de Membros Online (apenas em servidor) */}
        {preferences.showMembers && currentServer && currentChannel?.type !== 'voice' && (
          <MemberList onOpenProfile={(u) => setViewedUser(u)} />
        )}
      </div>

      {/* Modal de Configurações */}
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Modal Bonito de Perfil do Usuário (Estilo Discord Popover) */}
      <UserProfileModal
        user={viewedUser}
        isOpen={!!viewedUser}
        onClose={() => setViewedUser(null)}
      />

      {/* Modal Global de Solicitação de Interação Remota */}
      <AssistancePanel />
      <InteractionRequestModal />

      {/* Notificação Flutuante de Atualização Automática (Electron Desktop) */}

    </div>
  );
}
