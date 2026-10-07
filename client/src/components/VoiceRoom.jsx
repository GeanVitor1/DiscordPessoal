import {t as translate,useLocale} from '../localization';
import Soundboard from './Soundboard';
import MediaDiagnostics from './MediaDiagnostics';
import ParticipantControls from './ParticipantControls';
import VideoWindow,{createVideoWindow} from './VideoWindow';
import {useAudioPreferences} from '../context/AudioPreferencesContext';
import {useSocial} from '../context/SocialContext';
import ProtectedImage from '../components/ProtectedImage';
import React, { useRef, useEffect, useState } from 'react';
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
import { RemoteAudio,useVoice } from '../context/VoiceContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useInteraction } from '../context/InteractionContext';
import InteractionSurface from './InteractionSurface';
const desktopAssistance = Boolean(window.electronAPI?.isDesktop) || /Electron\//.test(navigator.userAgent);
const ShareSurface = desktopAssistance ? ({children})=><div className="relative">{children}</div> : InteractionSurface;
import ChatArea from './ChatArea';

export default function VoiceRoom({ channel, onOpenProfile, textChannel, server }) {
  useLocale();
  const{settings:audioSettings}=useAudioPreferences(),{endCall}=useSocial();
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
    speakingParticipants, remoteVoiceStreams, mediaError, connectionStatus, peerDiagnostics,
    devices, inputDeviceId, outputDeviceId, changeInputDevice, changeOutputDevice, screenQuality, changeScreenQuality, screenAudioCapture,screenFps,changeScreenFps,screenViewers,changeScreenSource
  } = useVoice();
  const { voiceRooms, socket } = useSocket();
  const { requestInteraction, sessionState, session, isHost, assistanceMode, activeGuest, revokeSession, interactionError, endedReason, transportStatus } = useInteraction();

  const [showChat, setShowChat] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const[showSoundboard,setShowSoundboard]=useState(false),[assistancePicker,setAssistancePicker]=useState(false);
  const screenContainerRef = useRef(null);
  const screenVideoRef = useRef(null);
  const remoteScreenVideoRef = useRef(null);
  const remoteScreenAudioRef = useRef(null);
  const [screenPlaybackError, setScreenPlaybackError] = useState('');
  const[participantMenu,setParticipantMenu]=useState(null),[focus,setFocus]=useState(null),[videoWindow,setVideoWindow]=useState(null);
  const cameraContainer=useRef(null);
  const disconnect=()=>channel?.isPrivateCall?endCall():leaveVoice();
  const showVideoWindow=async stream=>{try{const target=await createVideoWindow();setVideoWindow({target,stream});}catch(e){setScreenPlaybackError(e.message);}};
  const pictureInPicture=async element=>{try{if(!element?.requestPictureInPicture)throw Error('Picture-in-picture indisponível neste dispositivo');await element.requestPictureInPicture();}catch(e){setScreenPlaybackError(e.message);}};
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
      remoteScreenVideoRef.current.muted = true;
      remoteScreenVideoRef.current.play().catch(e => {
        if (e.name === 'AbortError') return;
        console.warn('[ScreenShare Audio] Autoplay com áudio bloqueado ou aguardando interação do usuário:', e);
      });
    }
  }, [remoteScreenStream]);

  const playScreenAudio = () => {
    const element = remoteScreenAudioRef.current;
    if (!element) return;
    element.play().then(() => setScreenPlaybackError('')).catch(error => {
      if (error.name !== 'AbortError') setScreenPlaybackError('Clique para ativar o áudio da transmissão.');
    });
  };
  // Encontra anfitrião que está compartilhando tela ou outro participante
  const isSelfSharing = isScreenSharing;
  const remoteSharerFromParticipants = [...participants].sort((a,b)=>Number(!!audioSettings.participants[b.user.id]?.prioritizeStream)-Number(!!audioSettings.participants[a.user.id]?.prioritizeStream)).find(p => p.isScreenSharing && p.socketId !== socket?.id);
  const effectiveSharer = activeScreenSharer || (remoteSharerFromParticipants ? { socketId: remoteSharerFromParticipants.socketId, user: remoteSharerFromParticipants.user } : null);

  useEffect(()=>{const prioritized=participants.find(p=>p.isScreenSharing && p.socketId!==socket?.id && audioSettings.participants[p.user.id]?.prioritizeStream);if(prioritized && (!isWatchingScreen || activeScreenSharer?.socketId!==prioritized.socketId))startWatchingScreen(prioritized.socketId);},[participants.filter(p=>p.isScreenSharing).map(p=>p.socketId).join(','),audioSettings.participants]);
  return (
    <div className="flex-1 min-w-0 bg-discord-darkest flex flex-col h-full overflow-hidden relative">
      {/* Top Header da Sala de Voz */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between shadow-sm shrink-0 bg-discord-chat">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔊</span>
          <span className="font-bold text-discord-textHeader">{channel?.name}</span>
          <span className="text-xs bg-discord-darker px-2 py-0.5 rounded text-discord-green font-semibold">{translate("Canal de Voz")}</span>
        </div>
        <div className="flex items-center gap-2 text-discord-textMuted text-xs">
          <span>{connectionStatus === 'connected' ? translate("Conectado à chamada") : connectionStatus === 'reconnecting' ? 'Reconectando a chamada…' : translate("Conectando…")}</span>
          <button onClick={() => setShowDevices(!showDevices)} className="px-2 py-1 rounded bg-discord-darker">{translate("Áudio e vídeo")}</button>
          {textChannel && <button onClick={() => setShowChat(!showChat)} className="px-2 py-1 rounded bg-discord-darker">{translate("Chat")}</button>}
          {isWatchingScreen && <button onClick={() => screenContainerRef.current?.requestFullscreen()} className="px-2 py-1 rounded bg-discord-darker">{translate("Tela cheia")}</button>}
          {isWatchingScreen&&<><button onClick={()=>showVideoWindow(remoteScreenStream)} className="px-2 py-1 rounded bg-discord-darker">{translate("Abrir transmissão em janela")}</button><button onClick={()=>pictureInPicture(remoteScreenVideoRef.current)} className="px-2 py-1 rounded bg-discord-darker">{translate("PiP")}</button></>}
          {focus&&<><button onClick={()=>setFocus(null)}>{translate("Mostrar todos")}</button><button onClick={()=>cameraContainer.current?.requestFullscreen()}>{translate("Vídeo em tela cheia")}</button></>}

          <Users className="w-4 h-4" />
          <span>{participants.length} {translate("participante(s)")}</span>
        </div>
      </div>

      {(mediaError || interactionError) && <div role="alert" className="bg-yellow-900/40 text-yellow-100 px-4 py-2 text-sm">{interactionError || mediaError}</div>}
      {endedReason && <div role="status" className="bg-discord-darker text-discord-textMuted px-4 py-2 text-sm">{endedReason}</div>}
      {screenPlaybackError&&<div role="alert" className="px-4 py-2 text-xs text-discord-textMuted">{screenPlaybackError}</div>}
      {isScreenSharing&&<div className="px-4 py-2 flex flex-wrap gap-4 text-xs bg-discord-darker"><button onClick={changeScreenSource}>{translate("Trocar janela / monitor")}</button><span>{translate("Assistindo:")} {Object.values(screenViewers || {}).map(u=>u.username).join(', ') || 'Nenhum espectador'}</span></div>}
      {participants.some(p=>p.isScreenSharing && p.socketId!==socket?.id)&&<div className="px-4 py-2 flex gap-3 text-xs">{participants.filter(p=>p.isScreenSharing && p.socketId!==socket?.id).map(p=><button key={p.socketId} onClick={()=>startWatchingScreen(p.socketId)}>{translate("Assistir")} {p.user.username}</button>)}</div>}
      {showDevices && <div className="bg-discord-darker px-4 py-3 flex flex-wrap gap-4 text-xs text-white">
        <label>{translate("Microfone")} <select aria-label={translate("Microfone")} value={inputDeviceId} onChange={e => changeInputDevice(e.target.value)} className="bg-[#111214] p-2 rounded"><option value="">{translate("Padrão")}</option>{devices.filter(d => d.kind === 'audioinput').map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}</select></label>
        <label>{translate("Saída de áudio")} <select aria-label={translate("Saída de áudio")} value={outputDeviceId} onChange={e => changeOutputDevice(e.target.value)} className="bg-[#111214] p-2 rounded"><option value="">{translate("Padrão")}</option>{devices.filter(d => d.kind === 'audiooutput').map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Saída ${i + 1}`}</option>)}</select></label>
        <label>{translate("Transmissão")} <select aria-label={translate("Qualidade da transmissão")} value={screenQuality} onChange={e => changeScreenQuality(e.target.value)} className="bg-[#111214] p-2 rounded"><option value="720">720p · 30 FPS</option><option value="1080">1080p · 30 FPS</option><option value="1440">1440p · 30 FPS</option></select></label>
        <MediaDiagnostics peers={peerDiagnostics} />
        <label>FPS <select aria-label={translate("FPS da transmissão")} value={screenFps} onChange={e=>changeScreenFps(Number(e.target.value))} className="bg-discord-darkest p-2 rounded">{[15,30,60].map(n=><option key={n} value={n}>{n} FPS</option>)}</select></label>
        {screenAudioCapture && <p>{translate("Áudio do computador:")} {screenAudioCapture.tracks.length ? 'capturado' : screenAudioCapture.requested ? 'indisponível' : 'desativado'} · {screenAudioCapture.tracks.map(t => `${t.readyState} / ${t.enabled ? 'habilitado' : 'desabilitado'}`).join(', ')}</p>}
      </div>}
      <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
      {/* Banner Permanente de Interação Remota Ativa (HOST) */}
      {!desktopAssistance && isHost && (sessionState === 'Authorized' || sessionState === 'Active') && (
        <div className="bg-[#da373c] text-white px-4 py-2.5 flex items-center justify-between text-sm shrink-0 shadow-lg border-b border-red-800 animate-pulse">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            <span>
              <strong>{assistanceMode === 'desktop' ? (['connected','fallback'].includes(transportStatus) ? 'Assistência ativa —' : 'Conectando assist\u00eancia...') : 'Interação na apresentação —'}</strong> {activeGuest?.username || 'Outro participante'} {assistanceMode === 'desktop' ? 'está controlando este computador' : 'está interagindo no canvas compartilhado'}
            </span>
          </div>
          <button
            onClick={() => revokeSession('Controle encerrado pelo anfitrião')}
            className="bg-white hover:bg-gray-100 text-[#da373c] text-xs px-4 py-1.5 rounded font-extrabold uppercase tracking-wide transition shadow cursor-pointer active:scale-95"
          >{translate("Encerrar assistência")}</button>
        </div>
      )}

      {/* Banner Superior caso o usuário esteja compartilhando sua própria tela */}
      {isSelfSharing && (
        <div className="bg-discord-green/15 border-b border-discord-green/30 px-4 py-2 flex items-center justify-between text-sm shrink-0">
          <div className="flex items-center gap-2 text-discord-green font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-pulse" />
            <span>{translate("Você está compartilhando sua tela ·")} {screenAudioCapture?.tracks.length ? 'com áudio do computador' : 'sem áudio do computador'}</span>
          </div>
          <button
            onClick={stopScreenShare}
            className="bg-discord-red hover:bg-red-700 text-white text-xs px-3 py-1 rounded font-semibold transition shadow"
          >{translate("Parar Compartilhamento")}</button>
        </div>
      )}


      {/* Banner Superior de Notificação caso outro participante esteja transmitindo tela e ainda não estejamos assistindo */}
      {!isSelfSharing && !isWatchingScreen && effectiveSharer && (
        <div className="bg-discord-green/20 border-b border-discord-green/40 px-4 py-2.5 flex items-center justify-between text-sm shrink-0 shadow-md">
          <div className="flex items-center gap-2 text-white font-medium">
            <span className="w-3 h-3 rounded-full bg-discord-green animate-ping" />
            <span>
              <strong className="text-discord-green">{effectiveSharer.user?.username || 'Alguém'}</strong>{translate("está compartilhando a tela ao vivo!")}</span>
          </div>
          <button
            onClick={() => startWatchingScreen(effectiveSharer.socketId)}
            className="bg-discord-green hover:bg-green-600 text-white text-xs px-4 py-1.5 rounded font-bold transition shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Monitor className="w-4 h-4" />{translate("Assistir Transmissão")}</button>
        </div>
      )}


      {/* Grade de Participantes / Stream de Tela */}
      <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto">
        {/* Caso 1: Própria tela transmitida pelo usuário local */}
        {isSelfSharing && screenStream ? (
          <div className="w-full max-w-4xl bg-black rounded-lg overflow-hidden border border-discord-active shadow-2xl relative mb-4">
            <ShareSurface width="100%" height="auto" isInteractive={false}>
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[60vh] object-contain mx-auto"
              />
            </ShareSurface>
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded text-xs text-white font-medium z-20 pointer-events-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />{translate("Sua Transmissão Ao Vivo (Anfitrião)")}</div>
          </div>
        ) : null}

        {/* Caso 2: Tela remota sendo assistida pelo usuário atual */}
        {isWatchingScreen && remoteScreenStream ? (
          <div ref={screenContainerRef} className="w-full max-w-4xl bg-black rounded-lg overflow-hidden border border-discord-active shadow-2xl relative mb-4">
            <RemoteAudio elementRef={remoteScreenAudioRef} testId="remote-screen-audio" stream={remoteScreenStream} volume={audioSettings.outputGain*(audioSettings.participants[activeScreenSharer?.user.id]?.volume??1)} muted={isDeafened || audioSettings.participants[activeScreenSharer?.user.id]?.muted===true} sinkId={outputDeviceId} onError={setScreenPlaybackError}/>
            {screenPlaybackError && <button onClick={playScreenAudio} className="absolute top-12 right-3 z-30 bg-discord-blurple text-white px-3 py-2 rounded">{screenPlaybackError}</button>}
            <ShareSurface width="100%" height="auto" sourceSocketId={activeScreenSharer?.socketId}>
              <video
                ref={remoteScreenVideoRef}
                data-testid="remote-screen-video"
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[60vh] object-contain mx-auto"
              />
            </ShareSurface>
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded text-xs text-white font-medium z-20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-discord-green animate-ping" />{translate("Assistindo:")}{activeScreenSharer?.user?.username || 'Anfitrião'}
              <button
                onClick={stopWatchingScreen}
                className="ml-3 bg-discord-red/80 hover:bg-discord-red text-white text-[11px] px-2 py-0.5 rounded font-medium transition"
              >{translate("Parar de Assistir")}</button>
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
              {effectiveSharer.user?.username || 'Um participante'}{translate("está transmitindo a tela!")}</h3>
            <p className="text-xs text-discord-textMuted max-w-md mb-4">{translate("Uma transmissão ao vivo está acontecendo neste canal de voz. Clique no botão verde abaixo para assistir em tempo real com áudio e vídeo via WebRTC.")}</p>
            <button
              onClick={() => startWatchingScreen(effectiveSharer.socketId)}
              className="bg-discord-green hover:bg-green-600 text-white px-8 py-3 rounded-md font-bold text-base flex items-center gap-2 shadow-xl transition active:scale-95"
            >
              <Monitor className="w-5 h-5" />{translate("Assistir Transmissão Ao Vivo")}</button>
          </div>
        ) : null}

        {/* Grade de Cards dos Participantes */}
        <div ref={cameraContainer} className="flex flex-wrap items-center justify-center gap-4 w-full max-w-4xl">
          {participants.length > 0 ? (
            participants.filter(p=>!focus || p.socketId===focus).map((p) => {
              const isSpeaking = speakingParticipants[p.socketId] || p.isSpeaking;
              const isSelf = p.socketId === socket?.id;
              const isRemotePeer = !isSelf;
              const hasCamera = (isSelf ? isCameraOn : p.isCameraOn) && !audioSettings.participants[p.user.id]?.hideVideo;

              return (
                <div
                  key={p.socketId}
                  onClick={() => onOpenProfile && onOpenProfile(p.user)}
                  className={`${focus?'w-full min-h-[60vh]':'w-64 h-52'} bg-discord-darker rounded-xl flex flex-col items-center justify-center p-3 relative transition-all duration-150 shadow-md overflow-hidden cursor-pointer hover:border-discord-blurple/60 ${
                    isSpeaking ? 'ring-2 ring-discord-green' : 'border border-discord-active'
                  }`}
                  title={`Ver perfil de ${p.user?.username}`}
                >
                  {/* Se a câmera estiver ligada e for o usuário atual */}
                  {isSelf && hasCamera && cameraStream ? (
                    <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
                      <RemoteVideo stream={cameraStream} peerId={p.socketId} mirror />
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                        <Video className="w-3 h-3 text-discord-green" />{translate("Webcam Ao Vivo")}</div>
                    </div>
                  ) : !isSelf && hasCamera && remoteVoiceStreams[p.socketId] ? (
                    <div className="absolute inset-0 z-0 bg-black/80 flex flex-col items-center justify-center text-center p-2">
                      <RemoteVideo stream={remoteVoiceStreams[p.socketId]} peerId={p.socketId}/>
                    </div>
                  ) : (
                    /* Foto de Perfil / Avatar (Estilo Discord) */
                    <div className="relative mb-2 z-10">
                      <ProtectedImage
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
                      {p.isDeafened&&<span title={translate("Ensurdecido")} aria-label={translate("Ensurdecido")}>🎧</span>}
                      {p.watchingScreenOf&&<span title={translate("Assistindo transmissão")} aria-label={translate("Assistindo transmissão")}>👁</span>}
                      {p.isScreenSharing && (
                        <span className="text-[10px] bg-discord-green/20 text-discord-green px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <Monitor className="w-3 h-3" />{translate("AO VIVO")}</span>
                      )}
                      {isSpeaking && (
                        <span className="text-[10px] text-discord-green font-bold animate-pulse">{translate("Falando...")}</span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas no Card */}
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                    {isRemotePeer&&<button type="button" onClick={e=>{e.stopPropagation();setParticipantMenu(p);}} title={`Configurações de ${p.user.username}`} className="bg-black/60 text-white rounded px-2">⋯</button>}
                    {/* Botão Assistir Tela caso este peer esteja transmitindo e ainda não estejamos assistindo */}
                    {isRemotePeer && p.isScreenSharing && !isWatchingScreen && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startWatchingScreen(p.socketId);
                        }}
                        className="text-[10px] bg-discord-green hover:bg-green-600 text-white px-2 py-0.5 rounded flex items-center gap-1 transition font-bold shadow"
                        title={translate("Assistir à transmissão deste usuário")}
                      >
                        <Monitor className="w-3 h-3" />{translate("Assistir")}</button>
                    )}

                    {/* Botão de Solicitar Interação em Tempo Real */}
                    {isRemotePeer && (desktopAssistance ? p.assistanceAvailable : p.canAssist && isWatchingScreen && remoteScreenStream && activeScreenSharer?.socketId === p.socketId) && !session && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestInteraction(p.socketId, channel.id);
                        }}
                        className="text-[10px] bg-discord-blurple hover:bg-discord-blurple-hover text-white px-2 py-0.5 rounded flex items-center gap-1 transition font-medium shadow"
                        title={p.assistanceMode === 'presentation' ? 'Interagir na apresentação (sem controlar o Windows)' : 'Solicitar controle compartilhado'}
                      >
                        <Hand className="w-3 h-3" />
                        {p.assistanceMode === 'presentation' ? 'Interagir na apresentação' : translate("Solicitar assistência")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-discord-textMuted py-10">
              <p className="text-lg font-semibold text-discord-textNormal mb-1">{translate("Ninguém na chamada ainda")}</p>
              <p className="text-sm">{translate("Fale no microfone ou aguarde outros membros entrarem.")}</p>
            </div>
          )}
        </div>
      </div>

      </div>
      {showChat && textChannel && <aside className="w-80 shrink-0 border-l border-discord-chat flex min-h-0"><ChatArea channel={textChannel} server={server} onOpenProfile={onOpenProfile} /></aside>}
      </div>
      {/* Barra de Controle de Voz Inferior */}
      <div className="h-20 bg-discord-darkest px-6 flex items-center justify-center gap-4 border-t border-discord-chat shrink-0">
        {/* Toggle Mudo */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isMuted ? 'bg-discord-red text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isMuted ? translate("Desativar Mudo") : translate("Ativar Mudo")}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Ensordecer */}
        <button
          onClick={toggleDeafen}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isDeafened ? 'bg-discord-red text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isDeafened ? translate("Ativar Som") : translate("Desativar Som")}
        >
          <Headphones className="w-5 h-5" />
        </button>

        {/* Toggle Webcam / Câmera */}
        <button
          onClick={toggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isCameraOn ? 'bg-discord-green text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isCameraOn ? translate("Desligar Câmera") : translate("Ligar Webcam")}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Compartilhar Tela */}
        <button
          onClick={toggleScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg ${
            isScreenSharing ? 'bg-discord-green text-white' : 'bg-[#3b3e45] text-white hover:bg-discord-hover'
          }`}
          title={isScreenSharing ? translate("Parar Compartilhamento") : translate("Compartilhar Tela")}
        >
          <Monitor className="w-5 h-5" />
        </button>

        <button type="button" title={translate("Soundboard")} className="p-3 rounded-full bg-discord-active" onClick={()=>setShowSoundboard(true)}>♪</button>
        <button type="button" title={translate("Solicitar assistência")} className="p-3 rounded-full bg-discord-active" onClick={()=>setAssistancePicker(v=>!v)}><Hand className="w-5 h-5"/></button>
        {assistancePicker&&<div className="absolute bottom-24 bg-discord-darker p-4 rounded shadow-xl"><p className="text-sm mb-2">{translate("Escolher participante para assistência")}</p>{participants.filter(p=>p.socketId!==socket?.id&&p.assistanceAvailable).map(p=><button key={p.socketId} className="block p-2 text-sm" onClick={()=>{requestInteraction(p.socketId,channel.id);setAssistancePicker(false);}}>{p.user.username}</button>)}{!participants.some(p=>p.socketId!==socket?.id&&p.assistanceAvailable)&&<p className="text-xs">{translate("Nenhum participante disponível")}</p>}</div>}
        {/* Botão Desconectar Vermelho */}
        <button
          onClick={disconnect}
          className="w-12 h-12 rounded-full bg-discord-red hover:bg-red-700 text-white flex items-center justify-center transition shadow-lg"
          title={translate("Desconectar da Chamada")}
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
      {participantMenu&&<ParticipantControls participant={participants.find(p=>p.socketId===participantMenu.socketId) || participantMenu} channel={channel} server={server} onClose={()=>setParticipantMenu(null)} onOpenProfile={onOpenProfile} onFocus={setFocus} onPopOut={id=>showVideoWindow(remoteVoiceStreams[id])} onPictureInPicture={id=>pictureInPicture(document.querySelector(`[data-video-peer="${id}"]`))}/>}
      {showSoundboard&&<Soundboard onClose={()=>setShowSoundboard(false)}/>}
      {videoWindow&&<VideoWindow window={videoWindow.target} stream={videoWindow.stream} title={channel?.name || translate("Vídeo")} onClose={()=>setVideoWindow(null)}/>}
    </div>
  );
}

function RemoteVideo({ stream, mirror = false,peerId }) {
  useLocale();
  const ref = useRef(null);
  useEffect(() => { const element = ref.current; element.srcObject = stream; element.play().catch(error => { if (error.name !== 'AbortError') console.warn('Não foi possível reproduzir vídeo:', error.message); }); return () => { element.srcObject = null; }; }, [stream]);
  return <video ref={ref} data-video-peer={peerId} autoPlay playsInline muted className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`} />;
}
