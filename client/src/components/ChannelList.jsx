import {t as translate,useLocale} from '../localization';
import { CreateInviteButton } from './ServerInvites';
import { DirectMessageList } from './FriendsHome';
import UnreadMark from './UnreadMark';
import CategorizedChannels from './CategorizedChannels';
import ProtectedImage, { useProtectedSource } from '../components/ProtectedImage';
import React, { useState, useRef } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  Mic,
  MicOff,
  Headphones,
  Settings,
  PhoneOff,
  Monitor,
  Video,
  VideoOff,
  Image,
  Sparkles,
  Upload,
  X,
  Check
} from 'lucide-react';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useSocket } from '../context/SocketContext';
import { API_BASE_URL } from '../config';

export default function ChannelList({
  server,
  currentChannel,
  onSelectChannel,
  onCreateChannel,
  onOpenSettings,
  onOpenProfile,
  onManageServer
}) {
  useLocale();
  const { currentUser, updateStatus } = useAuth();
  const {
    currentVoiceChannel,
    joinVoice,
    leaveVoice,
    isMuted,
    toggleMute,
    isDeafened,
    toggleDeafen,
    isCameraOn,
    toggleCamera,
    isScreenSharing,
    toggleScreenShare,
    startWatchingScreen
  } = useVoice();
  const { voiceRooms, isConnected: signalingConnected } = useSocket();

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('text');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Modal para editar Banner do Servidor (Animado ou Imagem)
  const [showServerBannerModal, setShowServerBannerModal] = useState(false);
  const [serverBanner, setServerBanner] = useState(server?.banner || '');
  const [uploadingServerBanner, setUploadingServerBanner] = useState(false);
  const serverBannerFileRef = useRef(null);

  const resolvedBanner=useProtectedSource(server?.banner);
  const resolvedDraftBanner=useProtectedSource(serverBanner);
  const canManage=server?.permissions?.manageServer || server?.owner_id===currentUser.id;
  const canCreate=server?.permissions?.manageChannels || server?.owner_id===currentUser.id;
  const textChannels = server?.channels?.filter((c) => c.type === 'text' && !c.category_id) || [];
  const voiceChannels = server?.channels?.filter((c) => c.type === 'voice' && !c.category_id) || [];

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    onCreateChannel(channelName, channelType);
    setChannelName('');
    setShowChannelModal(false);
  };

  const statusColors = {
    online: 'bg-discord-green',
    idle: 'bg-discord-yellow',
    dnd: 'bg-discord-red',
    offline: 'bg-gray-400'
  };

  const animatedServerBannerPresets = [
    { name: 'Cyberpunk Neon', url: 'https://media.giphy.com/media/26tn33aiTi1jkl6H6/giphy.gif' },
    { name: 'Galáxia Roxa', url: 'https://media.giphy.com/media/3o7TKTDnUxE0g2fSE8/giphy.gif' },
    { name: 'Synthwave Retrô', url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif' },
    { name: 'Chuva Anime Lo-Fi', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
    { name: 'Vaporwave Sunset', url: 'https://media.giphy.com/media/xUPGcm345LTJWFION2/giphy.gif' },
    { name: 'Matrix Digital Code', url: 'https://media.giphy.com/media/ule4vhcY1xEKQ/giphy.gif' }
  ];

  const handleServerBannerUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploadingServerBanner(true);
      const res = await axios.post(`${API_BASE_URL}/api/upload`, formData);
      setServerBanner(res.data.url);
    } catch (err) {
      alert('Erro ao enviar banner. Máximo 10MB.');
    } finally {
      setUploadingServerBanner(false);
    }
  };

  const handleSaveServerBanner = async () => {
    if (!server) return;
    try {
      await axios.put(`${API_BASE_URL}/api/servers/${server.id}`, {
        banner: serverBanner
      });
      setShowServerBannerModal(false);
    } catch (err) {
      console.error('Erro ao salvar banner do servidor:', err);
    }
  };

  return (
    <aside className="w-60 bg-discord-darker flex flex-col shrink-0 select-none">
      {/* Header do Servidor com Suporte a Banner Animado */}
      {server?.banner ? (
        <div
          onClick={() => {
            if (!canManage) return;
            setServerBanner(server.banner || '');
            setShowServerBannerModal(true);
          }}
          className="relative h-28 w-full bg-cover bg-center cursor-pointer group shadow-md overflow-hidden shrink-0"
          style={{ backgroundImage: resolvedBanner ? `url(${resolvedBanner})` : undefined }}
          title={translate("Clique para trocar o banner do servidor")}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#1e1f22] via-black/30 to-black/50 group-hover:from-[#1e1f22]/90 transition" />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-black/60 backdrop-blur-sm p-1 rounded text-white text-[10px] flex items-center gap-1">
            <Image className="w-3 h-3 text-discord-blurple" />{translate("Editar Banner")}</div>
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between font-bold text-white drop-shadow-md">
            <span className="truncate text-sm">{server.name}</span>
            <ChevronDown className="w-4 h-4 text-white/80 group-hover:rotate-180 transition-transform" />
          </div>
        </div>
      ) : (
        <div
          onClick={() => {
            if (server && canManage) {
              if (!canManage) return;
            setServerBanner(server.banner || '');
              setShowServerBannerModal(true);
            }
          }}
          className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between font-bold text-discord-textHeader shadow-sm hover:bg-discord-hover cursor-pointer transition shrink-0"
          title={server ? 'Clique para adicionar banner ao servidor' : ''}
        >
          <span className="truncate">{server ? server.name : translate("Mensagens Diretas")}</span>
          {server && (
            <div className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-discord-blurple opacity-60 hover:opacity-100 transition" />
              <ChevronDown className="w-5 h-5 text-discord-textMuted" />
            </div>
          )}
        </div>
      )}

      {server && <CreateInviteButton key={server.id} serverId={server.id} />}
      {server&&<button type="button" onClick={onManageServer} className="text-left text-xs px-4 py-2 text-discord-blurple" title={translate("Configurações do servidor")}>{translate("Servidor, membros e eventos")}</button>}
      {/* Lista de Canais */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {server ? (
          <>
            <CategorizedChannels key={server.id} server={server} onSelectChannel={onSelectChannel} onOpenProfile={onOpenProfile}/>
            {/* Canais de Texto */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-discord-textMuted px-2 mb-1 tracking-wider uppercase">
                <span>{translate("Canais de Texto")}</span>
                <button
                  onClick={() => {
                    setChannelType('text');
                    setShowChannelModal(true);
                  }}
                  className="hover:text-white"
                  disabled={!canCreate}
                  title={canCreate ? translate("Criar canal") : "Sem permissão para criar canais"}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-0.5">
                {textChannels.map((channel) => {
                  const isSelected = currentChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelectChannel(channel)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition group ${
                        isSelected
                          ? 'bg-discord-active text-white'
                          : 'text-discord-textMuted hover:bg-discord-hover hover:text-discord-textNormal'
                      }`}
                    >
                      <Hash className="w-4 h-4 shrink-0 text-discord-textMuted group-hover:text-discord-textNormal" />
                      <span className="truncate font-medium">{channel.name}</span><UnreadMark channelId={channel.id}/>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Canais de Voz */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-discord-textMuted px-2 mb-1 tracking-wider uppercase">
                <span>{translate("Canais de Voz")}</span>
                <button
                  onClick={() => {
                    setChannelType('voice');
                    setShowChannelModal(true);
                  }}
                  className="hover:text-white"
                  title={translate("Criar canal de voz")}
                  disabled={!canCreate}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-0.5">
                {voiceChannels.map((channel) => {
                  const isConnected = currentVoiceChannel?.id === channel.id;
                  const participants = voiceRooms[channel.id] || [];

                  return (
                    <div key={channel.id} className="space-y-0.5">
                      <button
                        disabled={!signalingConnected}
                        onClick={() => { if (signalingConnected) { onSelectChannel(channel); joinVoice(channel); } }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition group ${
                          isConnected
                            ? 'bg-discord-active text-discord-green font-medium'
                            : 'text-discord-textMuted hover:bg-discord-hover hover:text-discord-textNormal'
                        }`}
                      >
                        <Volume2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">{channel.name}</span>
                      </button>

                      {/* Usuários conectados ao canal de voz */}
                      {participants.length > 0 && (
                        <div className="pl-6 space-y-1 py-1">
                          {participants.map((p) => (
                            <div
                              key={p.socketId}
                              onClick={() => onOpenProfile && onOpenProfile(p.user)}
                              className="flex items-center gap-2 text-xs text-discord-textNormal cursor-pointer hover:bg-discord-hover/50 p-1 rounded"
                              title={`Ver perfil de ${p.user.username}`}
                            >
                              <ProtectedImage
                                src={p.user.avatar}
                                alt={p.user.username}
                                className={`w-5 h-5 rounded-full object-cover ${
                                  p.isSpeaking ? 'ring-2 ring-discord-green' : ''
                                }`}
                              />
                              <span className="truncate">{p.user.username}</span>
                              <div className="ml-auto flex items-center gap-1.5">
                                {p.isScreenSharing && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!isConnected) {
                                        if (!await joinVoice(channel)) return;
                                      }
                                      onSelectChannel(channel);
                                      startWatchingScreen(p.socketId);
                                    }}
                                    className="flex items-center gap-1 text-[10px] bg-discord-green hover:bg-green-600 text-white px-2 py-0.5 rounded font-bold shadow transition animate-pulse"
                                    title={translate("Clique para assistir à transmissão ao vivo")}
                                  >
                                    <Monitor className="w-3 h-3" />
                                    <span>{translate("ASSISTIR")}</span>
                                  </button>
                                )}
                                {p.isCameraOn && <Video className="w-3 h-3 text-discord-green" />}
                                {p.isMuted && <MicOff className="w-3 h-3 text-discord-red" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <DirectMessageList />
        )}
      </div>

      {/* Painel de Status de Voz Ativo */}
      {currentVoiceChannel && (
        <div className="bg-[#242629] border-t border-discord-darkest p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-pulse" />
              <div>
                <p className="font-semibold text-discord-green">{translate("Voz Conectada")}</p>
                <p className="text-discord-textMuted truncate">{currentVoiceChannel.name}</p>
              </div>
            </div>
            <button
              onClick={leaveVoice}
              title={translate("Desconectar")}
              className="p-1.5 rounded hover:bg-discord-hover text-discord-textMuted hover:text-discord-red"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-around pt-1 border-t border-discord-chat">
            {/* Botão de Câmera na barra lateral */}
            <button
              onClick={toggleCamera}
              className={`p-1.5 rounded hover:bg-discord-hover text-xs flex items-center gap-1 transition ${
                isCameraOn ? 'text-discord-green font-bold' : 'text-discord-textMuted'
              }`}
              title={isCameraOn ? translate("Desligar Câmera") : 'Ligar Câmera'}
            >
              {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span>{translate("Vídeo")}</span>
            </button>

            {/* Botão de Tela */}
            <button
              onClick={toggleScreenShare}
              className={`p-1.5 rounded hover:bg-discord-hover text-xs flex items-center gap-1 transition ${
                isScreenSharing ? 'text-discord-green font-bold' : 'text-discord-textMuted'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>{translate("Tela")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Painel do Usuário Logado */}
      <div className="h-[52px] bg-discord-sidebar px-2 flex items-center justify-between">
        <div className="relative">
          <div className="flex items-center gap-2 p-1 rounded-md hover:bg-discord-hover">
            <div
              className="relative cursor-pointer group"
              onClick={() => onOpenProfile && onOpenProfile(currentUser)}
              title={translate("Abrir meu perfil")}
            >
              <ProtectedImage
                src={currentUser?.avatar}
                alt={currentUser?.username}
                className="w-8 h-8 rounded-full bg-discord-darkest group-hover:opacity-80 transition"
              />
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusMenuOpen(!statusMenuOpen);
                }}
                title={translate("Mudar status")}
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-discord-sidebar hover:scale-125 transition ${
                  statusColors[currentUser?.status || 'online']
                }`}
              />
            </div>
            <div
              onClick={() => onOpenProfile && onOpenProfile(currentUser)}
              className="flex flex-col leading-tight max-w-[85px] cursor-pointer"
              title={translate("Ver meu perfil")}
            >
              <span className="text-xs font-semibold text-discord-textHeader truncate hover:underline">
                {currentUser?.username}
              </span>
              <span className="text-[10px] text-discord-textMuted truncate">
                #{currentUser?.discriminator}
              </span>
            </div>
          </div>

          {/* Menu Dropdown de Status */}
          {statusMenuOpen && (
            <div className="absolute bottom-12 left-0 w-44 bg-discord-darkest border border-discord-active rounded-md shadow-xl py-1 z-50">
              {['online', 'idle', 'dnd', 'offline'].map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    updateStatus(st);
                    setStatusMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-discord-textNormal hover:bg-discord-blurple hover:text-white flex items-center gap-2 capitalize"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${statusColors[st]}`} />
                  {st === 'online'
                    ? translate("Disponível")
                    : st === 'idle'
                    ? translate("Ausente")
                    : st === 'dnd'
                    ? 'Não Perturbe'
                    : 'Invisível'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botões de Ação do Perfil: Microfone, Headphone, Configurações */}
        <div className="flex items-center">
          <button
            onClick={toggleMute}
            className={`p-1.5 rounded hover:bg-discord-hover ${
              isMuted ? 'text-discord-red' : 'text-discord-textMuted hover:text-discord-textNormal'
            }`}
            title={isMuted ? translate("Desativar Mudo") : translate("Ativar Mudo")}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleDeafen}
            className={`p-1.5 rounded hover:bg-discord-hover ${
              isDeafened ? 'text-discord-red' : 'text-discord-textMuted hover:text-discord-textNormal'
            }`}
            title={isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
          >
            <Headphones className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-discord-hover text-discord-textMuted hover:text-discord-textNormal"
            title={translate("Configurações de Usuário")}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal Criar Canal */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-discord-darker w-full max-w-md rounded-lg p-6 shadow-2xl border border-discord-active">
            <h2 className="text-xl font-bold text-white mb-2">{translate("Criar Canal")}</h2>
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">{translate("Tipo de Canal")}</label>
                <div className="space-y-2">
                  <div
                    onClick={() => setChannelType('text')}
                    className={`flex items-center gap-3 p-2.5 rounded cursor-pointer ${
                      channelType === 'text' ? 'bg-discord-active' : 'bg-discord-chat'
                    }`}
                  >
                    <Hash className="w-5 h-5 text-discord-textMuted" />
                    <div>
                      <div className="font-semibold text-sm text-white">{translate("Texto")}</div>
                      <div className="text-xs text-discord-textMuted">{translate("Poste mensagens, imagens e memes")}</div>
                    </div>
                  </div>
                  <div
                    onClick={() => setChannelType('voice')}
                    className={`flex items-center gap-3 p-2.5 rounded cursor-pointer ${
                      channelType === 'voice' ? 'bg-discord-active' : 'bg-discord-chat'
                    }`}
                  >
                    <Volume2 className="w-5 h-5 text-discord-textMuted" />
                    <div>
                      <div className="font-semibold text-sm text-white">{translate("Voz")}</div>
                      <div className="text-xs text-discord-textMuted">{translate("Converse por voz, vídeo e compartilhe tela")}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">{translate("Nome do Canal")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-discord-textMuted">
                    {channelType === 'text' ? '#' : '🔊'}
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={translate("novo-canal")}
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full bg-discord-darkest text-discord-textHeader pl-8 pr-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-discord-blurple text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-discord-chat">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-4 py-2 text-sm text-white hover:underline font-medium"
                >{translate("Cancelar")}</button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm bg-discord-blurple hover:bg-discord-blurple-hover text-white rounded font-medium transition"
                >{translate("Criar Canal")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Banner do Servidor */}
      {showServerBannerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-discord-chat w-full max-w-lg rounded-xl p-6 shadow-2xl border border-discord-active flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-discord-sidebar pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-discord-blurple" />{translate("Banner do Servidor (Animado / GIF)")}</h2>
              <button
                onClick={() => setShowServerBannerModal(false)}
                className="p-1 rounded-full text-discord-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pré-visualização */}
            <div>
              <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">{translate("Pré-visualização do Banner")}</label>
              <div
                className="h-28 w-full rounded-lg bg-cover bg-center border border-discord-active relative overflow-hidden bg-discord-darkest"
                style={{ backgroundImage: resolvedDraftBanner ? `url(${resolvedDraftBanner})` : undefined }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                <div className="absolute bottom-2 left-3 font-bold text-white text-sm">
                  {server?.name}
                </div>
              </div>
            </div>

            {/* Upload do Computador */}
            <div className="bg-discord-darker p-3 rounded-lg flex items-center justify-between border border-discord-active">
              <div>
                <p className="text-xs font-semibold text-white">{translate("Carregar GIF ou Imagem do PC")}</p>
                <p className="text-[11px] text-discord-textMuted">{translate("Suporta GIFs animados e fotos (máx 10MB)")}</p>
              </div>
              <input
                type="file"
                ref={serverBannerFileRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => handleServerBannerUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploadingServerBanner}
                onClick={() => serverBannerFileRef.current?.click()}
                className="px-3 py-1.5 bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-semibold rounded flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingServerBanner ? 'Enviando...' : 'Carregar GIF'}
              </button>
            </div>

            {/* Presets de Banners Animados */}
            <div>
              <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">{translate("Ou Escolha um Banner Animado Pronto")}</label>
              <div className="grid grid-cols-3 gap-2">
                {animatedServerBannerPresets.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => setServerBanner(b.url)}
                    className={`h-14 rounded-lg overflow-hidden relative border-2 transition group ${
                      serverBanner === b.url ? 'border-discord-blurple ring-2 ring-discord-blurple' : 'border-transparent hover:border-white/50'
                    }`}
                  >
                    <ProtectedImage src={b.url} alt={b.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-[10px] font-bold text-white text-center px-1">
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-discord-sidebar">
              {serverBanner ? (
                <button
                  type="button"
                  onClick={() => setServerBanner('')}
                  className="text-xs text-discord-red hover:underline"
                >{translate("Remover Banner")}</button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowServerBannerModal(false)}
                  className="px-4 py-2 text-xs text-discord-textNormal hover:underline font-medium"
                >{translate("Cancelar")}</button>
                <button
                  type="button"
                  onClick={handleSaveServerBanner}
                  className="px-5 py-2 bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs rounded-lg font-semibold flex items-center gap-1.5 shadow transition"
                >
                  <Check className="w-3.5 h-3.5" />{translate("Salvar Banner")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
