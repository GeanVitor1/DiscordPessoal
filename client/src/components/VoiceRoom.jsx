import React, { useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Monitor,
  Share2,
  Users,
  Video,
  VideoOff,
  Hand
} from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useInteraction } from '../context/InteractionContext';
import InteractionSurface from './InteractionSurface';

export default function VoiceRoom({ channel, onOpenProfile }) {
  const { currentUser } = useAuth();
  const {
    leaveVoice,
    isMuted,
    toggleMute,
    isDeafened,
    toggleDeafen,
    isCameraOn,
    toggleCamera,
    cameraStream,
    isScreenSharing,
    toggleScreenShare,
    stopScreenShare,
    screenStream,
    remoteScreenStream,
    activeScreenSharer,
    isWatchingScreen,
    startWatchingScreen,
    stopWatchingScreen,
    speakingParticipants
  } = useVoice();
  const { voiceRooms, socket } = useSocket();
  const { requestInteraction, sessionState, session, isHost, activeGuest, revokeSession } = useInteraction();

  const screenVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const participants = (channel && voiceRooms[channel.id]) || [];

  // Conecta o vídeo caso o usuário esteja compartilhando a própria tela
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Conecta o vídeo caso o usuário esteja assistindo à tela de um participante remoto
  useEffect(() => {
    if (remoteScreenVideoRef.current && remoteScreenStream) {
      remoteScreenVideoRef.current.srcObject = remoteScreenStream;
      remoteScreenVideoRef.current.muted = false;
      remoteScreenVideoRef.current.volume = 1.0;
      remoteScreenVideoRef.current.play().catch(e => {
        console.warn('[ScreenShare Audio] Autoplay com áudio bloqueado ou aguardando interação do usuário:', e);
      });
    }
  }, [remoteScreenStream]);

  // Conecta o vídeo da webcam do usuário
  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Encontra anfitrião que está compartilhando tela ou outro participante
  const isSelfSharing = isScreenSharing;
  const remoteSharerFromParticipants = participants.find(p => p.isScreenSharing && p.socketId !== socket?.id);
  const effectiveSharer = activeScreenSharer || (remoteSharerFromParticipants ? { socketId: remoteSharerFromParticipants.socketId, user: remoteSharerFromParticipants.user } : null);

  return (
    <div className="flex-1 bg-[#1e1f22] flex flex-col h-full overflow-hidden relative">
      {/* Top Header da Sala de Voz */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between shadow-sm shrink-0 bg-discord-chat">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔊</span>
          <span className="font-bold text-discord-textHeader">{channel?.name}</span>
          <span className="text-xs bg-discord-darker px-2 py-0.5 rounded text-discord-green font-semibold">
            Canal de Voz
          </span>
        </div>
        <div className="flex items-center gap-2 text-discord-textMuted text-xs">
          <Users className="w-4 h-4" />
          <span>{participants.length} participante(s)</span>
        </div>
      </div>

      {/* Banner Permanente de Interação Remota Ativa (HOST) */}
      {isHost && (sessionState === 'Authorized' || sessionState === 'Active') && (
        <div className="bg-[#da373c] text-white px-4 py-2.5 flex items-center justify-between text-sm shrink-0 shadow-lg border-b border-red-800 animate-pulse">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            <span>
              <strong>Interação Remota Ativa:</strong> {activeGuest?.username || 'Outro participante'} está controlando este computador
            </span>
          </div>
          <button
            onClick={() => revokeSession('Controle encerrado pelo anfitrião')}
            className="bg-white hover:bg-gray-100 text-[#da373c] text-xs px-4 py-1.5 rounded font-extrabold uppercase tracking-wide transition shadow cursor-pointer active:scale-95"
          >
            Encerrar Interação
          </button>
        </div>
      )}

      {/* Banner Superior caso o usuário esteja compartilhando sua própria tela */}
      {isSelfSharing && (
        <div className="bg-discord-green/15 border-b border-discord-green/30 px-4 py-2 flex items-center justify-between text-sm shrink-0">
          <div className="flex items-center gap-2 text-discord-green font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-pulse" />
            <span>Você está compartilhando sua tela</span>
          </div>
          <button
            onClick={stopScreenShare}
            className="bg-discord-red hover:bg-red-700 text-white text-xs px-3 py-1 rounded font-semibold transition shadow"
          >
            Parar Compartilhamento
          </button>
        </div>
      )}


      {/* Banner Superior de Notificação caso outro participante esteja transmitindo tela e ainda não estejamos assistindo */}
      {!isSelfSharing && !isWatchingScreen && effectiveSharer && (
        <div className="bg-discord-green/20 border-b border-discord-green/40 px-4 py-2.5 flex items-center justify-between text-sm shrink-0 shadow-md">
          <div className="flex items-center gap-2 text-white font-medium">
            <span className="w-3 h-3 rounded-full bg-discord-green animate-ping" />
            <span>
              <strong className="text-discord-green">{effectiveSharer.user?.username || 'Alguém'}</strong> está compartilhando a tela ao vivo!
            </span>
          </div>
          <button
            onClick={() => startWatchingScreen(effectiveSharer.socketId)}
            className="bg-discord-green hover:bg-green-600 text-white text-xs px-4 py-1.5 rounded font-bold transition shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
            Assistir Transmissão
          </button>
        </div>
      )}


      {/* Grade de Participantes / Stream de Tela */}
      <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto">
        {/* Caso 1: Própria tela transmitida pelo usuário local */}
        {isSelfSharing && screenStream ? (
          <div className="w-full max-w-4xl bg-black rounded-lg overflow-hidden border border-[#3f4147] shadow-2xl relative mb-4">
            <InteractionSurface width="100%" height="auto">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[60vh] object-contain mx-auto"
              />
            </InteractionSurface>
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded text-xs text-white font-medium z-20 pointer-events-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />
              Sua Transmissão Ao Vivo (Anfitrião)
            </div>
          </div>
        ) : null}

        {/* Caso 2: Tela remota sendo assistida pelo usuário atual */}
        {isWatchingScreen && remoteScreenStream ? (
          <div className="w-full max-w-4xl bg-black rounded-lg overflow-hidden border border-[#3f4147] shadow-2xl relative mb-4">
            <InteractionSurface width="100%" height="auto">
              <video
                ref={remoteScreenVideoRef}
                autoPlay
                playsInline
                className="w-full h-auto max-h-[60vh] object-contain mx-auto"
              />
            </InteractionSurface>
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded text-xs text-white font-medium z-20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />
              Assistindo: {activeScreenSharer?.user?.username || 'Anfitrião'}
              <button
                onClick={stopWatchingScreen}
                className="ml-3 bg-discord-red/80 hover:bg-discord-red text-white text-[11px] px-2 py-0.5 rounded font-medium transition"
              >
                Parar de Assistir
              </button>
            </div>
          </div>
        ) : null}

        {/* Caso 3: Transmissão Ativa detectada na sala mas ainda não assistida */}
        {!isSelfSharing && !isWatchingScreen && effectiveSharer ? (
          <div className="w-full max-w-xl bg-[#111214] border-2 border-discord-green/60 rounded-xl p-6 shadow-2xl flex flex-col items-center justify-center text-center mb-6 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-discord-green/20 flex items-center justify-center mb-3">
              <Monitor className="w-8 h-8 text-discord-green" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-ping" />
              {effectiveSharer.user?.username || 'Um participante'} está transmitindo a tela!
            </h3>
            <p className="text-xs text-discord-textMuted max-w-md mb-4">
              Uma transmissão ao vivo está acontecendo neste canal de voz. Clique no botão verde abaixo para assistir em tempo real com áudio e vídeo via WebRTC.
            </p>
            <button
              onClick={() => startWatchingScreen(effectiveSharer.socketId)}
              className="bg-discord-green hover:bg-green-600 text-white px-8 py-3 rounded-md font-bold text-base flex items-center gap-2 shadow-xl transition active:scale-95"
            >
              <Monitor className="w-5 h-5" />
              Assistir Transmissão Ao Vivo
            </button>
          </div>
        ) : null}

        {/* Caso 4: Sessão de interação ativa sem stream de vídeo direto */}
        {session && !screenStream && !remoteScreenStream ? (
          <div className="w-full max-w-4xl bg-[#111214] rounded-lg overflow-hidden border border-[#3f4147] shadow-2xl relative mb-4">
            <InteractionSurface width="100%" height="auto">
              <div className="w-full h-[52vh] flex flex-col items-center justify-center bg-gradient-to-br from-[#1e1f22] to-[#111214] border border-[#2b2d31] rounded-md p-6 text-center">
                <Monitor className="w-16 h-16 text-discord-blurple/60 mb-3 animate-pulse" />
                <h4 className="text-white font-bold text-base mb-1">
                  Transmissão e Superfície Controlada
                </h4>
                <p className="text-xs text-discord-textMuted max-w-md mb-2">
                  Área interativa ativa. Movimente o mouse, clique, role a página ou digite no teclado para enviar comandos em tempo real.
                </p>
                <div className="flex items-center gap-2 text-[11px] text-discord-green font-mono bg-discord-green/10 px-3 py-1 rounded-full border border-discord-green/20">
                  <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />
                  Sessão conectada via WebRTC DataChannel
                </div>
              </div>
            </InteractionSurface>
            <div className="absolute top-3 left-3 bg-black/70 px-2 py-1 rounded text-xs text-white font-medium z-20 pointer-events-none">
              Superfície de Interação Remota
            </div>
          </div>
        ) : null}

        {/* Grade de Cards dos Participantes */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-4xl">
          {participants.length > 0 ? (
            participants.map((p) => {
              const isSpeaking = speakingParticipants[p.socketId] || p.isSpeaking;
              const isSelf = p.socketId === socket?.id;
              const isRemotePeer = !isSelf;
              const hasCamera = isSelf ? isCameraOn : p.isCameraOn;

              return (
                <div
                  key={p.socketId}
                  onClick={() => onOpenProfile && onOpenProfile(p.user)}
                  className={`w-64 h-52 bg-discord-darker rounded-xl flex flex-col items-center justify-center p-3 relative transition-all duration-150 shadow-md overflow-hidden cursor-pointer hover:border-discord-blurple/60 ${
                    isSpeaking ? 'ring-2 ring-discord-green' : 'border border-[#383a40]'
                  }`}
                  title={`Ver perfil de ${p.user?.username}`}
                >
                  {/* Se a câmera estiver ligada e for o usuário atual */}
                  {isSelf && isCameraOn && cameraStream ? (
                    <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                        <Video className="w-3 h-3 text-discord-green" />
                        Webcam Ao Vivo
                      </div>
                    </div>
                  ) : !isSelf && p.isCameraOn ? (
                    <div className="absolute inset-0 z-0 bg-black/80 flex flex-col items-center justify-center text-center p-2">
                      <Video className="w-8 h-8 text-discord-green mb-1 animate-pulse" />
                      <span className="text-xs text-white font-medium">Câmera Ligada</span>
                      <span className="text-[10px] text-discord-textMuted">Transmitindo vídeo</span>
                    </div>
                  ) : (
                    /* Foto de Perfil / Avatar (Estilo Discord) */
                    <div className="relative mb-2 z-10">
                      <img
                        src={p.user?.avatar}
                        alt={p.user?.username}
                        className={`w-20 h-20 rounded-full bg-discord-darkest object-cover shadow-lg ${
                          isSpeaking ? 'ring-4 ring-discord-green scale-105 transition-all' : ''
                        }`}
                      />
                      {p.isMuted && (
                        <div className="absolute bottom-0 right-0 bg-discord-red p-1 rounded-full text-white shadow">
                          <MicOff className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Informações do Usuário no Card */}
                  <div className="z-10 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md mt-auto w-full flex items-center justify-between border border-white/5">
                    <span className="font-semibold text-xs text-white truncate max-w-[120px]">
                      {p.user?.username}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {p.isScreenSharing && (
                        <span className="text-[10px] bg-discord-green/20 text-discord-green px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                          AO VIVO
                        </span>
                      )}
                      {isSpeaking && (
                        <span className="text-[10px] text-discord-green font-bold animate-pulse">
                          Falando...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas no Card */}
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                    {/* Botão Assistir Tela caso este peer esteja transmitindo e ainda não estejamos assistindo */}
                    {isRemotePeer && p.isScreenSharing && !isWatchingScreen && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startWatchingScreen(p.socketId);
                        }}
                        className="text-[10px] bg-discord-green hover:bg-green-600 text-white px-2 py-0.5 rounded flex items-center gap-1 transition font-bold shadow"
                        title="Assistir à transmissão deste usuário"
                      >
                        <Monitor className="w-3 h-3" />
                        Assistir
                      </button>
                    )}

                    {/* Botão de Solicitar Interação em Tempo Real */}
                    {isRemotePeer && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestInteraction(p.socketId, channel.id);
                        }}
                        className="text-[10px] bg-discord-blurple hover:bg-discord-blurple-hover text-white px-2 py-0.5 rounded flex items-center gap-1 transition font-medium shadow"
                        title="Solicitar controle compartilhado"
                      >
                        <Hand className="w-3 h-3" />
                        Interagir
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-discord-textMuted py-10">
              <p className="text-lg font-semibold text-discord-textNormal mb-1">Ninguém na chamada ainda</p>
              <p className="text-sm">Fale no microfone ou aguarde outros membros entrarem.</p>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Controle de Voz Inferior */}
      <div className="h-20 bg-discord-darkest px-6 flex items-center justify-center gap-4 border-t border-[#313338] shrink-0">
        {/* Toggle Mudo */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isMuted ? 'bg-discord-red text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isMuted ? 'Desativar Mudo' : 'Ativar Mudo'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Ensordecer */}
        <button
          onClick={toggleDeafen}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isDeafened ? 'bg-discord-red text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isDeafened ? 'Ativar Som' : 'Desativar Som'}
        >
          <Headphones className="w-5 h-5" />
        </button>

        {/* Toggle Webcam / Câmera */}
        <button
          onClick={toggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isCameraOn ? 'bg-discord-green text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isCameraOn ? 'Desligar Câmera' : 'Ligar Webcam'}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Compartilhar Tela */}
        <button
          onClick={toggleScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isScreenSharing ? 'bg-discord-green text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isScreenSharing ? 'Parar Compartilhamento' : 'Compartilhar Tela'}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Botão Desconectar Vermelho */}
        <button
          onClick={leaveVoice}
          className="w-12 h-12 rounded-full bg-discord-red hover:bg-red-700 text-white flex items-center justify-center transition shadow-lg"
          title="Desconectar da Chamada"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
