import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext';
import { playSound } from '../utils/sounds';
import { API_BASE_URL } from '../config';
import ScreenSourcePickerModal from '../components/ScreenSourcePickerModal';

const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const { socket, voiceRooms } = useSocket();
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [speakingParticipants, setSpeakingParticipants] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);

  // Controle de seleção de tela para ambiente Desktop (Electron)
  const [desktopSources, setDesktopSources] = useState(null);

  // Configuração dinâmica de ICE / STUN / TURN obtida do Backend
  const [rtcConfig, setRtcConfig] = useState({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  });

  useEffect(() => {
    if (!API_BASE_URL) return;

    fetch(`${API_BASE_URL}/api/ice-servers`)
      .then(res => res.json())
      .then(data => {
        if (data?.iceServers && Array.isArray(data.iceServers)) {
          console.log('[WebRTC] Servidores ICE atualizados via backend:', data.iceServers);
          setRtcConfig({ iceServers: data.iceServers });
        }
      })
      .catch(err => {
        console.warn('[WebRTC] Falha ao carregar ICE servers dinâmicos, usando padrão STUN:', err);
      });
  }, []);

  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);

  // Entrada em canal de voz
  const joinVoice = async (channel) => {
    if (currentVoiceChannel?.id === channel.id) return;
    leaveVoice();

    setCurrentVoiceChannel(channel);
    playSound('join'); // Toca som de entrada

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(stream);
      localStreamRef.current = stream;

      setupSpeakingDetection(stream);

      if (socket) {
        socket.emit('join_voice_channel', { channelId: channel.id });
      }
    } catch (err) {
      console.warn('Microfone não acessível ou sem permissão:', err);
      if (socket) {
        socket.emit('join_voice_channel', { channelId: channel.id });
      }
    }
  };

  const setupSpeakingDetection = (stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);

      let speakingTimer = null;
      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }
        const average = values / array.length;

        if (average > 25 && !isMuted) {
          if (!speakingTimer && socket && currentVoiceChannel) {
            socket.emit('voice_speaking', { channelId: currentVoiceChannel.id, isSpeaking: true });
          }
          clearTimeout(speakingTimer);
          speakingTimer = setTimeout(() => {
            if (socket && currentVoiceChannel) {
              socket.emit('voice_speaking', { channelId: currentVoiceChannel.id, isSpeaking: false });
            }
            speakingTimer = null;
          }, 300);
        }
      };
    } catch (e) { }
  };

  // Saída do canal
  const leaveVoice = () => {
    if (currentVoiceChannel) {
      playSound('leave'); // Toca som de saída
    }
    if (socket) {
      socket.emit('leave_voice_channel');
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
      setIsCameraOn(false);
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
    }
    setCurrentVoiceChannel(null);
  };

  // Mudo
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
      }
    }
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    playSound(nextMute ? 'mute' : 'unmute'); // Toca som de mudo / desmudo

    if (socket && currentVoiceChannel) {
      socket.emit('voice_state_toggle', {
        channelId: currentVoiceChannel.id,
        isMuted: nextMute
      });
    }
  };

  // Ensordecer
  const toggleDeafen = () => {
    const nextDeaf = !isDeafened;
    setIsDeafened(nextDeaf);
    playSound(nextDeaf ? 'deafen' : 'undeafen');

    if (socket && currentVoiceChannel) {
      socket.emit('voice_state_toggle', {
        channelId: currentVoiceChannel.id,
        isDeafened: nextDeaf
      });
    }
  };

  // Ativar / Desativar Webcam
  const toggleCamera = async () => {
    if (isCameraOn) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      setCameraStream(null);
      setIsCameraOn(false);
      playSound('camera_off');

      if (socket && currentVoiceChannel) {
        socket.emit('voice_state_toggle', {
          channelId: currentVoiceChannel.id,
          isCameraOn: false
        });
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setIsCameraOn(true);
        playSound('camera_on');

        if (socket && currentVoiceChannel) {
          socket.emit('voice_state_toggle', {
            channelId: currentVoiceChannel.id,
            isCameraOn: true
          });
        }

        stream.getVideoTracks()[0].onended = () => {
          setIsCameraOn(false);
          setCameraStream(null);
          cameraStreamRef.current = null;
          playSound('camera_off');
          if (socket && currentVoiceChannel) {
            socket.emit('voice_state_toggle', {
              channelId: currentVoiceChannel.id,
              isCameraOn: false
            });
          }
        };
      } catch (err) {
        console.error('Falha ao acessar webcam:', err);
        alert('Não foi possível acessar a webcam. Verifique suas permissões de câmera.');
      }
    }
  };

  // Compartilhamento de tela
  // Peers que estão assistindo a tela transmitida por nós: viewerSocketId -> RTCPeerConnection
  const screenPeerConnectionsRef = useRef({});
  // Conexão WebRTC do receptor assistindo tela remota: RTCPeerConnection
  const viewerPeerConnectionRef = useRef(null);
  const screenStreamRef = useRef(null);

  // Armazena stream remoto de quem está compartilhando tela:
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [activeScreenSharer, setActiveScreenSharer] = useState(null); // { socketId, user }
  const [isWatchingScreen, setIsWatchingScreen] = useState(false);

  // Notificações sonoras e estado quando alguém inicia ou para de compartilhar tela
  useEffect(() => {
    if (!socket) return;

    const handleScreenShareStarted = ({ channelId, sharerSocketId, user }) => {
      console.log(`[ScreenShare] ${sharerSocketId} started sharing`);
      if (currentVoiceChannel && currentVoiceChannel.id === channelId) {
        if (sharerSocketId !== socket.id) {
          playSound('screenshare_on');
          setActiveScreenSharer({ socketId: sharerSocketId, user });
        }
      }
    };

    const handleScreenShareStopped = ({ channelId, sharerSocketId, user }) => {
      console.log(`[ScreenShare] ${sharerSocketId} stopped sharing`);
      if (currentVoiceChannel && currentVoiceChannel.id === channelId) {
        if (sharerSocketId !== socket.id) {
          playSound('screenshare_off');
          setActiveScreenSharer(null);
          stopWatchingScreen();
        }
      }
    };

    socket.on('screen_share_started', handleScreenShareStarted);
    socket.on('screen_share_stopped', handleScreenShareStopped);

    return () => {
      socket.off('screen_share_started', handleScreenShareStarted);
      socket.off('screen_share_stopped', handleScreenShareStopped);
    };
  }, [socket, currentVoiceChannel]);

  // Sincroniza quem já está compartilhando na sala ao entrar ou atualizar voiceRooms
  useEffect(() => {
    if (!currentVoiceChannel || !voiceRooms || !voiceRooms[currentVoiceChannel.id]) return;
    const participants = voiceRooms[currentVoiceChannel.id];
    const remoteSharer = participants.find(p => p.isScreenSharing && p.socketId !== socket?.id);
    if (remoteSharer) {
      setActiveScreenSharer({ socketId: remoteSharer.socketId, user: remoteSharer.user });
    } else if (!isScreenSharing) {
      setActiveScreenSharer(null);
    }
  }, [voiceRooms, currentVoiceChannel, socket, isScreenSharing]);

  // Limpeza de conexões de screen share ao sair da sala
  const cleanupScreenShareConnections = () => {
    Object.values(screenPeerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    screenPeerConnectionsRef.current = {};

    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }
    setRemoteScreenStream(null);
    setIsWatchingScreen(false);
  };

  // --- LADO DO TRANSMISSOR (SHARER) ---
  const stopScreenShare = () => {
    console.log('[ScreenShare] stopping local screen share');
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    playSound('screenshare_off');

    Object.values(screenPeerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    screenPeerConnectionsRef.current = {};

    if (socket && currentVoiceChannel) {
      console.log('[ScreenShare] notifying room: screen_share_stopped');
      socket.emit('voice_state_toggle', {
        channelId: currentVoiceChannel.id,
        isScreenSharing: false
      });
    }
  };

  const handleDesktopSourceSelect = async (sourceId) => {
    setDesktopSources(null);
    try {
      let stream;
      try {
        // Tenta capturar vídeo com áudio loopback do sistema (Electron desktopCapturer)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        });
        console.log('[ScreenShare Desktop] Captura nativa com áudio do sistema ativada com sucesso');
      } catch (errWithAudio) {
        console.warn('[ScreenShare Desktop] Captura de áudio nativa não suportada para esta fonte, capturando somente vídeo:', errWithAudio);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        });
      }

      console.log('[ScreenShare Desktop] Captura nativa iniciada com sucesso:', sourceId, 'Tracks:', stream.getTracks().map(t => t.kind));
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      playSound('screenshare_on');

      if (socket && currentVoiceChannel) {
        socket.emit('voice_state_toggle', {
          channelId: currentVoiceChannel.id,
          isScreenSharing: true
        });
      }

      stream.getVideoTracks()[0].onended = () => {
        console.log('[ScreenShare Desktop] Track onended disparado');
        stopScreenShare();
      };
    } catch (err) {
      console.error('[ScreenShare Desktop] Erro ao capturar fonte selecionada:', err);
      alert('Não foi possível iniciar a captura da tela/janela selecionada.');
    }
  };

  const startScreenShare = async () => {
    console.log('[ScreenShare] toggleScreenShare -> startScreenShare called');

    if (!currentVoiceChannel) {
      console.warn('[ScreenShare] Cannot share screen without being in a voice channel');
      alert('Você precisa estar conectado a um canal de voz para compartilhar a tela.');
      return;
    }

    // Se estiver rodando dentro do aplicativo Desktop (Electron)
    if (window.electronAPI?.isDesktop && typeof window.electronAPI.getScreenSources === 'function') {
      try {
        console.log('[ScreenShare Desktop] Solicitando fontes de tela nativas...');
        const sources = await window.electronAPI.getScreenSources();
        if (!sources || sources.length === 0) {
          alert('Nenhuma tela ou janela disponível para compartilhamento.');
          return;
        }
        setDesktopSources(sources);
        return;
      } catch (err) {
        console.error('[ScreenShare Desktop] Falha ao obter janelas:', err);
      }
    }

    // Fluxo padrão para versão Web (Navegador)
    if (window.isSecureContext === false) {
      console.error('[ScreenShare Web] window.isSecureContext === false. Screen capture requires HTTPS or localhost.');
      alert('O compartilhamento de tela na versão Web exige HTTPS. No aplicativo Desktop instalado, essa restrição não existe.');
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      alert('A API de compartilhamento de tela não está disponível neste navegador.');
      return;
    }

    try {
      let stream;
      try {
        // Tenta capturar vídeo com áudio do sistema/aba
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false
          }
        });
      } catch (errWithAudio) {
        console.warn('[ScreenShare] Tentativa com áudio avançado falhou, tentando audio: true simples:', errWithAudio);
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
        } catch (errWithOpts) {
          console.warn('[ScreenShare] fallback sem áudio getDisplayMedia({ video: true }):', errWithOpts);
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }
      }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      playSound('screenshare_on');

      if (socket && currentVoiceChannel) {
        socket.emit('voice_state_toggle', {
          channelId: currentVoiceChannel.id,
          isScreenSharing: true
        });
      }

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('[ScreenShare Error Details]', error);
      if (error.name !== 'NotAllowedError') {
        alert(`Erro ao iniciar compartilhamento de tela: ${error.message}`);
      }
    }
  };

  const toggleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // Quando um espectador solicita assistir à transmissão (Lado do Transmissor)
  useEffect(() => {
    if (!socket || !isScreenSharing) return;

    const handleScreenRequestView = async ({ viewerSocketId, channelId }) => {
      if (!screenStreamRef.current) return;
      console.log(`[ScreenShare] Viewer ${viewerSocketId} requested to watch stream`);

      if (screenPeerConnectionsRef.current[viewerSocketId]) {
        try { screenPeerConnectionsRef.current[viewerSocketId].close(); } catch (e) {}
      }

      const pc = new RTCPeerConnection(rtcConfig);
      screenPeerConnectionsRef.current[viewerSocketId] = pc;

      // Adiciona a faixa de vídeo capturada
      screenStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, screenStreamRef.current);
      });

      pc.oniceconnectionstatechange = async () => {
        console.log(`[WebRTC ICE State: Sharer -> ${viewerSocketId}]`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          try {
            const stats = await pc.getStats();
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const local = stats.get(report.localCandidateId);
                const remote = stats.get(report.remoteCandidateId);
                console.log(`\n======================================================`);
                console.log(`📡 [WebRTC Conexão Ativa - Sharer]`);
                console.log(`   Candidato Local:  ${local?.candidateType?.toUpperCase()} (${local?.protocol})`);
                console.log(`   Candidato Remoto: ${remote?.candidateType?.toUpperCase()} (${remote?.protocol})`);
                if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') {
                  console.log(`   ⚡ Tipo de Rota:  TURN RELAY (Tráfego roteado via coturn)`);
                } else if (local?.candidateType === 'srflx' || remote?.candidateType === 'srflx') {
                  console.log(`   ⚡ Tipo de Rota:  P2P DIRETO via STUN (NAT atravessado com sucesso)`);
                } else {
                  console.log(`   ⚡ Tipo de Rota:  P2P LOCAL (Host / Mesma rede)`);
                }
                console.log(`======================================================\n`);
              }
            });
          } catch (e) { }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('screen_ice_candidate', {
            targetSocketId: viewerSocketId,
            channelId,
            candidate: event.candidate
          });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[ScreenShare] offer sent to ${viewerSocketId}`);
        socket.emit('screen_offer', {
          targetSocketId: viewerSocketId,
          channelId,
          sdp: pc.localDescription
        });
      } catch (err) {
        console.error('[ScreenShare] Error creating offer for viewer:', err);
      }
    };

    const handleScreenAnswer = async ({ viewerSocketId, sdp }) => {
      const pc = screenPeerConnectionsRef.current[viewerSocketId];
      if (pc) {
        console.log(`[ScreenShare] answer received from ${viewerSocketId}`);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
          console.error('[ScreenShare] Error setting remote description from answer:', e);
        }
      }
    };

    const handleScreenIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = screenPeerConnectionsRef.current[fromSocketId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[ScreenShare] Error adding ICE candidate from viewer:', e);
        }
      }
    };

    const handleScreenViewerLeft = ({ viewerSocketId }) => {
      console.log(`[ScreenShare] Viewer ${viewerSocketId} stopped watching`);
      if (screenPeerConnectionsRef.current[viewerSocketId]) {
        try { screenPeerConnectionsRef.current[viewerSocketId].close(); } catch (e) {}
        delete screenPeerConnectionsRef.current[viewerSocketId];
      }
    };

    socket.on('screen_request_view', handleScreenRequestView);
    socket.on('screen_answer', handleScreenAnswer);
    socket.on('screen_ice_candidate', handleScreenIceCandidate);
    socket.on('screen_viewer_left', handleScreenViewerLeft);

    return () => {
      socket.off('screen_request_view', handleScreenRequestView);
      socket.off('screen_answer', handleScreenAnswer);
      socket.off('screen_ice_candidate', handleScreenIceCandidate);
      socket.off('screen_viewer_left', handleScreenViewerLeft);
    };
  }, [socket, isScreenSharing]);

  // --- LADO DO RECEPTOR (ESPECTADOR / VIEWER) ---
  const startWatchingScreen = (sharerSocketId) => {
    if (!socket || !currentVoiceChannel) return;
    console.log(`[ScreenShare] Requesting to watch screen of ${sharerSocketId}`);
    setIsWatchingScreen(true);

    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }

    const pc = new RTCPeerConnection(rtcConfig);
    viewerPeerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      console.log('[ScreenShare] remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteScreenStream(event.streams[0]);
      } else {
        // Fallback para compor MediaStream com faixas de áudio e vídeo recebidas
        setRemoteScreenStream(prev => {
          if (!prev) {
            const newStream = new MediaStream();
            newStream.addTrack(event.track);
            return newStream;
          }
          if (!prev.getTracks().some(t => t.id === event.track.id)) {
            prev.addTrack(event.track);
          }
          return new MediaStream(prev.getTracks());
        });
      }
    };

    pc.oniceconnectionstatechange = async () => {
      console.log(`[WebRTC ICE State: Viewer]`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        try {
          const stats = await pc.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const local = stats.get(report.localCandidateId);
              const remote = stats.get(report.remoteCandidateId);
              console.log(`\n======================================================`);
              console.log(`📡 [WebRTC Conexão Ativa - Viewer]`);
              console.log(`   Candidato Local:  ${local?.candidateType?.toUpperCase()} (${local?.protocol})`);
              console.log(`   Candidato Remoto: ${remote?.candidateType?.toUpperCase()} (${remote?.protocol})`);
              if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') {
                console.log(`   ⚡ Tipo de Rota:  TURN RELAY (Tráfego roteado via coturn)`);
              } else if (local?.candidateType === 'srflx' || remote?.candidateType === 'srflx') {
                console.log(`   ⚡ Tipo de Rota:  P2P DIRETO via STUN (NAT atravessado com sucesso)`);
              } else {
                console.log(`   ⚡ Tipo de Rota:  P2P LOCAL (Host / Mesma rede)`);
              }
              console.log(`======================================================\n`);
            }
          });
        } catch (e) { }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('screen_ice_candidate', {
          targetSocketId: sharerSocketId,
          channelId: currentVoiceChannel.id,
          candidate: event.candidate
        });
      }
    };

    socket.emit('screen_request_view', {
      targetSocketId: sharerSocketId,
      channelId: currentVoiceChannel.id
    });
  };

  const stopWatchingScreen = () => {
    console.log('[ScreenShare] stopWatchingScreen called');
    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }
    if (activeScreenSharer && socket && currentVoiceChannel) {
      socket.emit('screen_stop_viewing', {
        targetSocketId: activeScreenSharer.socketId,
        channelId: currentVoiceChannel.id
      });
    }
    setRemoteScreenStream(null);
    setIsWatchingScreen(false);
  };

  // Tratamento de ofertas recebidas pelo receptor (Viewer)
  useEffect(() => {
    if (!socket || !isWatchingScreen) return;

    const handleScreenOffer = async ({ sharerSocketId, channelId, sdp }) => {
      console.log(`[ScreenShare] offer received from ${sharerSocketId}`);
      const pc = viewerPeerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[ScreenShare] answer sent to ${sharerSocketId}`);
        socket.emit('screen_answer', {
          targetSocketId: sharerSocketId,
          channelId,
          sdp: pc.localDescription
        });
      } catch (err) {
        console.error('[ScreenShare] Error handling screen offer:', err);
      }
    };

    const handleScreenIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = viewerPeerConnectionRef.current;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[ScreenShare] Error adding ICE candidate on viewer:', e);
        }
      }
    };

    socket.on('screen_offer', handleScreenOffer);
    socket.on('screen_ice_candidate', handleScreenIceCandidate);

    return () => {
      socket.off('screen_offer', handleScreenOffer);
      socket.off('screen_ice_candidate', handleScreenIceCandidate);
    };
  }, [socket, isWatchingScreen]);

  // Sons de participantes entrando/saindo da sala
  useEffect(() => {
    if (!socket) return;

    socket.on('user_joined_voice', () => {
      playSound('join');
    });

    socket.on('user_left_voice', () => {
      playSound('leave');
    });

    socket.on('participant_speaking', ({ socketId, isSpeaking }) => {
      setSpeakingParticipants(prev => ({ ...prev, [socketId]: isSpeaking }));
    });

    return () => {
      socket.off('user_joined_voice');
      socket.off('user_left_voice');
      socket.off('participant_speaking');
    };
  }, [socket]);

  // Limpeza geral quando o usuário sai da sala
  const handleLeaveVoice = () => {
    stopScreenShare();
    cleanupScreenShareConnections();
    leaveVoice();
  };

  return (
    <VoiceContext.Provider
      value={{
        currentVoiceChannel,
        joinVoice,
        leaveVoice: handleLeaveVoice,
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
        speakingParticipants,
        localStream,
        screenStream,
        remoteScreenStream,
        activeScreenSharer,
        isWatchingScreen,
        startWatchingScreen,
        stopWatchingScreen
      }}
    >
      {children}
      {desktopSources && (
        <ScreenSourcePickerModal
          sources={desktopSources}
          onSelect={handleDesktopSourceSelect}
          onClose={() => setDesktopSources(null)}
        />
      )}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => useContext(VoiceContext);
