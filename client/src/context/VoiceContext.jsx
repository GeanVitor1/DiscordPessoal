import api from '../api';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext';
import { playSound } from '../utils/sounds';
import { API_BASE_URL } from '../config';
import { createVoiceTransport } from '../rtc/transport';
import { ScreenAdaptation, preferOpus } from '../rtc/media';
import { requireMediaDevices, mediaUnavailableMessage } from '../rtc/capabilities';
import { DEFAULT_RTC_CONFIG, addRemoteCandidate, setRemoteDescription, selectedRoute } from '../rtc/ice';
import ScreenSourcePickerModal from '../components/ScreenSourcePickerModal';
import {useAudioPreferences} from './AudioPreferencesContext';
import {MicrophoneProcessor} from '../audio-settings';

const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const { socket, voiceRooms } = useSocket();
  const audioPreferences=useAudioPreferences(),audioSettings=audioPreferences.settings;
  const audioSettingsRef=useRef(audioSettings);audioSettingsRef.current=audioSettings;
  const microphoneProcessorRef=useRef(null),pushToTalkRef=useRef(false),inputChangeEpoch=useRef(0),actualInputId=useRef(''),cameraChangeEpoch=useRef(0),actualCameraId=useRef(audioSettings.cameraDeviceId);
  const serverVoiceRef=useRef({}),[serverVoice,setServerVoice]=useState({});
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
  const [sharedDisplaySource, setSharedDisplaySource] = useState(null); // { id, name, display_id }

  // Configuração dinâmica de ICE / STUN / TURN obtida do Backend
  const [rtcConfig, setRtcConfig] = useState(DEFAULT_RTC_CONFIG);
  const [remoteVoiceStreams, setRemoteVoiceStreams] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [mediaError, setMediaError] = useState(null);
  const [peerDiagnostics, setPeerDiagnostics] = useState({});
  const [devices, setDevices] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [screenQuality, setScreenQuality] = useState('1080');
  const [screenAudioCapture, setScreenAudioCapture] = useState(null);
  const voiceChannelRef = useRef(null);
  const joinGenerationRef = useRef(0);
  const meshRef = useRef(null);
  const speakingCleanupRef = useRef(null);
  const muteRef = useRef(false);
  const deafenRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const watchedSharerRef = useRef(null),watchedUserRef=useRef(null);
  const latestMediaRef = useRef({});
  latestMediaRef.current = { rtcConfig, sharedDisplaySource };

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const { data } = await api.get('/api/ice-servers');
        if (!cancelled && Array.isArray(data.iceServers)) setRtcConfig({ iceServers: data.iceServers, iceTransportPolicy: import.meta.env.VITE_FORCE_RELAY === 'true' ? 'relay' : 'all' });
      } catch { /* Keep the last working ICE configuration; never log credentials. */ }
    };
    refresh();
    const timer = setInterval(refresh, 20 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);

  // Entrada em canal de voz
  const refreshDevices = async () => {
    if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') { setDevices([]); return; }
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); }
    catch (error) { setMediaError(`Falha ao listar dispositivos: ${error.message}`); }
  };
  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  }, []);
  function installVoiceTransport(channelId) {
    meshRef.current = createVoiceTransport({ socket, channelId: channelId, rtcConfig: latestMediaRef.current.rtcConfig, audioSettings:audioSettingsRef.current,
      onStream: (id, remote) => setRemoteVoiceStreams(prev => { const next = { ...prev }; if (remote) next[id] = remote; else delete next[id]; return next; }),
      onStatus: (id, status) => setPeerDiagnostics(prev => { const next = { ...prev }; if (status) next[id] = status; else delete next[id]; return next; }),
      onError: error => setMediaError(`Conexão de mídia: ${error.message}`)
    });
  }
  const audioConstraints = id => ({ deviceId: id ? { exact: id } : undefined, echoCancellation: audioSettingsRef.current.echoCancellation, noiseSuppression: audioSettingsRef.current.noiseSuppression, autoGainControl: audioSettingsRef.current.autoGainControl });
  const joinVoice = async channel => {
    if (!socket?.connected) { setMediaError('Aguarde a conexão com o servidor antes de entrar na chamada.'); return false; }
    if (voiceChannelRef.current?.id === channel.id) return true;
    try { requireMediaDevices('getUserMedia'); }
    catch (error) { setMediaError(error.message); return false; }
    handleLeaveVoice();
    const generation = ++joinGenerationRef.current;
    voiceChannelRef.current = channel;
    setCurrentVoiceChannel(channel);
    setConnectionStatus('connecting');
    setMediaError(null);
    let stream = null;
    try { stream = await requireMediaDevices('getUserMedia').getUserMedia({ audio: audioConstraints(inputDeviceId), video: false }); }
    catch (error) { setMediaError(`Microfone indisponível. Você entrou para ouvir: ${error.message}`); }
    if (generation !== joinGenerationRef.current || !socket.connected) { stream?.getTracks().forEach(t => t.stop()); return; }
    if(stream){actualInputId.current=inputDeviceId;microphoneProcessorRef.current?.close();microphoneProcessorRef.current=new MicrophoneProcessor(stream,audioSettingsRef.current);stream=microphoneProcessorRef.current.stream;}
    localStreamRef.current = stream;
    stream?.getAudioTracks().forEach(t => { t.enabled = !muteRef.current && !deafenRef.current; });
    setLocalStream(stream);
    if (stream) setupSpeakingDetection(stream);
    await refreshDevices();
    if (generation !== joinGenerationRef.current) return;
    installVoiceTransport(channel.id);
    await meshRef.current.setTracks(stream?.getAudioTracks()[0] || null, null);
    try {
      const result = await socket.timeout(5000).emitWithAck('join_voice_channel', { channelId: channel.id });
      if (generation !== joinGenerationRef.current) return false;
      if (result?.error) throw new Error(result.error);
      setConnectionStatus('connected');
      socket.emit('voice_state_toggle', { channelId: channel.id, isMuted: muteRef.current, isDeafened: deafenRef.current });
      playSound('self_join');
      return true;
    } catch (error) {
      if (generation === joinGenerationRef.current) { handleLeaveVoice(); setMediaError(error.message || 'Não foi possível entrar na chamada'); }
      return false;
    }
  };
  const setupSpeakingDetection = stream => {
    speakingCleanupRef.current?.();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(microphoneProcessorRef.current?.raw || stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let speaking = false;
    let lastLoud = 0;
    let noiseLevel=0.008;
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
      const settings=audioSettingsRef.current,rms=Math.sqrt(energy / samples.length)*settings.inputGain;
      const threshold=settings.autoSensitivity?Math.min(0.08,Math.max(0.01,noiseLevel*3)):settings.sensitivity;
      if(rms<threshold)noiseLevel=noiseLevel*0.95+rms*0.05;
      if (rms > threshold) lastLoud = Date.now();
      const next = !muteRef.current && !deafenRef.current && !serverVoiceRef.current.muted && !serverVoiceRef.current.deafened && serverVoiceRef.current.canSpeak!==false && Date.now() - lastLoud < 250 && (settings.mode!=='ptt' || pushToTalkRef.current);
      const transmitting=settings.mode==='open' || settings.mode==='ptt' && pushToTalkRef.current || settings.mode==='voice' && next;
      localStreamRef.current?.getAudioTracks().forEach(t=>{t.enabled=!muteRef.current && !deafenRef.current && !serverVoiceRef.current.muted && !serverVoiceRef.current.deafened && serverVoiceRef.current.canSpeak!==false && transmitting;});
      if (next !== speaking && voiceChannelRef.current && socket?.connected) {
        speaking = next;
        socket.emit('voice_speaking', { channelId: voiceChannelRef.current.id, isSpeaking: next });
      }
    }, 80);
    speakingCleanupRef.current = () => { clearInterval(timer); source.disconnect(); context.close().catch(() => {}); };
  };
  const changeInputDevice = async id => {
    const previousId=actualInputId.current,epoch=++inputChangeEpoch.current;
    setInputDeviceId(id);audioPreferences.update({inputDeviceId:id});
    if (!voiceChannelRef.current){actualInputId.current=id;return;}
    const generation = joinGenerationRef.current;
    let captured = null,processed=null;
    try {
      let stream = await requireMediaDevices('getUserMedia').getUserMedia({ audio: audioConstraints(id), video: false });
      captured = stream;
      if (generation !== joinGenerationRef.current || epoch!==inputChangeEpoch.current) { stream.getTracks().forEach(t => t.stop()); return; }
      processed=new MicrophoneProcessor(stream,audioSettingsRef.current);stream=processed.stream;
      stream.getAudioTracks().forEach(t => { t.enabled = !muteRef.current && !deafenRef.current; });
      await meshRef.current?.setTracks(stream.getAudioTracks()[0], cameraStreamRef.current?.getVideoTracks()[0] || null);
      if(generation!==joinGenerationRef.current || epoch!==inputChangeEpoch.current){processed.close();return;}
      actualInputId.current=id;microphoneProcessorRef.current?.close();microphoneProcessorRef.current=processed;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      setupSpeakingDetection(stream);
    } catch (error) {
      if(microphoneProcessorRef.current!==processed)processed?.close();
      captured?.getTracks().forEach(t => t.stop());
      meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null, cameraStreamRef.current?.getVideoTracks()[0] || null).catch(() => {});
      if(epoch===inputChangeEpoch.current){setInputDeviceId(previousId);audioPreferences.update({inputDeviceId:previousId});setMediaError(`Não foi possível trocar o microfone: ${error.message}`);}
    }
  };

  const leaveVoice = () => {
    ++joinGenerationRef.current;
    ++cameraChangeEpoch.current;
    ++captureGenerationRef.current;
    voiceChannelRef.current = null;
    speakingCleanupRef.current?.();
    speakingCleanupRef.current = null;
    meshRef.current?.destroy();
    meshRef.current = null;
    setRemoteVoiceStreams({});
    setPeerDiagnostics({});
    setSpeakingParticipants({});
    setDesktopSources(null);
    setActiveScreenSharer(null);
    setConnectionStatus('disconnected');
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
    microphoneProcessorRef.current?.close();microphoneProcessorRef.current=null;pushToTalkRef.current=false;
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
        audioTrack.enabled = isMuted && !deafenRef.current;
      }
    }
    const nextMute = !isMuted;
    muteRef.current = nextMute;
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
    deafenRef.current = nextDeaf;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !nextDeaf && !muteRef.current; });
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
    if (!voiceChannelRef.current)return;
    const epoch=++cameraChangeEpoch.current;
    const generation = joinGenerationRef.current;
    let captured = null;
    if (isCameraOn) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      await meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null, null);
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
        const stream = await requireMediaDevices('getUserMedia').getUserMedia({ video: {deviceId:audioSettingsRef.current.cameraDeviceId?{exact:audioSettingsRef.current.cameraDeviceId}:undefined}, audio: false });
        captured = stream;
        if (generation !== joinGenerationRef.current || epoch!==cameraChangeEpoch.current) { stream.getTracks().forEach(t => t.stop()); return; }
        await meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null, stream.getVideoTracks()[0]);
        if(generation!==joinGenerationRef.current || epoch!==cameraChangeEpoch.current){stream.getTracks().forEach(t=>t.stop());return;}
        actualCameraId.current=audioSettingsRef.current.cameraDeviceId;
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
          meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null, null).catch(console.error);
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
        captured?.getTracks().forEach(t => t.stop());
        meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null, null).catch(() => {});
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
  const[screenViewers,setScreenViewers]=useState({});
  async function replaceSharedTracks(stream){const previous=screenStreamRef.current;if(!previous)return;for(const[viewerId,pc]of Object.entries(screenPeerConnectionsRef.current)){let negotiate=false;for(const kind of ['video','audio']){const sender=pc.getSenders().find(s=>s.track?.kind===kind),track=stream.getTracks().find(t=>t.kind===kind);if(sender)await sender.replaceTrack(track || null);else if(track){pc.addTrack(track,stream);negotiate=true;}}if(negotiate){const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit('screen_offer',{targetSocketId:viewerId,channelId:voiceChannelRef.current.id,sdp:pc.localDescription});}}previous.getTracks().forEach(t=>{t.onended=null;t.stop();});}

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
          if (watchedSharerRef.current === sharerSocketId) stopWatchingScreen();
          setActiveScreenSharer(prev => prev?.socketId === sharerSocketId ? null : prev);
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
      setActiveScreenSharer(prev => watchedSharerRef.current && prev ? prev : { socketId: remoteSharer.socketId, user: remoteSharer.user });
    } else if (!isScreenSharing) {
      setActiveScreenSharer(null);
    }
  }, [voiceRooms, currentVoiceChannel, socket, isScreenSharing]);

  // Limpeza de conexões de screen share ao sair da sala
  const cleanupScreenShareConnections = () => {
    Object.values(screenPeerConnectionsRef.current).forEach(pc => {
      try { pc.onconnectionstatechange = null; pc.close(); } catch (e) {}
    });
    screenPeerConnectionsRef.current = {};
    setScreenViewers({});

    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }
    setRemoteScreenStream(null);
    setIsWatchingScreen(false);
  };

  function monitorScreenConnection(pc, peerId, role) {
    pc.onconnectionstatechange = async () => {
      const state = pc.connectionState;
      setPeerDiagnostics(prev => ({ ...prev, [`screen:${peerId}`]: { state } }));
      if (state === 'connected') {
        try {
          const route = await selectedRoute(pc);
          if (pc.connectionState === 'connected') setPeerDiagnostics(prev => ({ ...prev, [`screen:${peerId}`]: { state, ...route } }));
        } catch { /* Diagnostic polling must not interfere with media. */ }
      }
      if (state === 'disconnected' || state === 'failed') {
        if (!window.electronAPI?.isDesktop) window.dispatchEvent(new CustomEvent('assistance-invalidated', { detail: { peerSocketId: peerId, reason: 'Conexão perdida' } }));
        if (role === 'viewer' && viewerPeerConnectionRef.current === pc) {
          setMediaError('Transmissão interrompida. Abra a transmissão novamente.');
          stopWatchingScreen();
        } else if (screenPeerConnectionsRef.current[peerId] === pc) {
          pc.onconnectionstatechange = null; pc.close(); delete screenPeerConnectionsRef.current[peerId];
        }
      }
    };
  }

  useEffect(() => {
    let alive=true,busy=false;
    const timer=setInterval(async()=>{
      if(busy)return;busy=true;
      try {
        const peers=[...Object.entries(screenPeerConnectionsRef.current),...(viewerPeerConnectionRef.current?[[watchedSharerRef.current,viewerPeerConnectionRef.current]]:[])];
        for(const [id,pc] of peers) {
          if(pc.connectionState!=='connected')continue;
          const stats=await selectedRoute(pc);
          if(!alive || pc.connectionState!=='connected')continue;
          setPeerDiagnostics(prev=>({...prev,['screen:'+id]:{state:pc.connectionState,...stats}}));
          if(screenPeerConnectionsRef.current[id]===pc) {
            const sender=pc.getSenders().find(s=>s.track?.kind==='video');
            if(sender && !pc.screenAdaptation){pc.screenAdaptation=new ScreenAdaptation(sender);await pc.screenAdaptation.initialize();}
            await pc.screenAdaptation?.sample(stats);
          }
        }
      }catch{}finally{busy=false;}
    },2000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);

  // --- LADO DO TRANSMISSOR (SHARER) ---
  const stopScreenShare = () => {
    console.log('[ScreenShare] stopping local screen share');
    ++captureGenerationRef.current;
    if (!window.electronAPI?.isDesktop) window.dispatchEvent(new Event('assistance-invalidated'));
    setSharedDisplaySource(null);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setScreenAudioCapture(null);
    setIsScreenSharing(false);
    playSound('screenshare_off');

    Object.values(screenPeerConnectionsRef.current).forEach(pc => {
      try { pc.onconnectionstatechange = null; pc.close(); } catch (e) {}
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

  const handleDesktopSourceSelect = async (sourceId, includeAudio = true) => {
    const generation = ++captureGenerationRef.current;
    const selected = desktopSources?.find(s => s.id === sourceId) || null;
    const previousSource=latestMediaRef.current.sharedDisplaySource,wasSharing=!!screenStreamRef.current;
    setSharedDisplaySource(selected);
    setDesktopSources(null);

    let stream;
    try {
      const devices = requireMediaDevices('getDisplayMedia');
      const supportsOwnAudioExclusion = devices.getSupportedConstraints?.().restrictOwnAudio === true;
      if (typeof window.electronAPI.prepareDisplayCapture === 'function') {
        if (includeAudio && !supportsOwnAudioExclusion) throw new Error('Esta versão não consegue excluir o áudio da chamada da captura. Atualize o aplicativo ou desmarque o áudio do computador.');
        const prepared = await window.electronAPI.prepareDisplayCapture(sourceId, includeAudio);
        if (!prepared?.success) throw new Error('Não foi possível preparar a fonte selecionada.');
        stream = await devices.getDisplayMedia({ video: true, audio: includeAudio ? { restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } : false, systemAudio: includeAudio ? 'include' : 'exclude' });
      } else {
        // Older bridges support video only. Never silently claim system audio or mix microphone audio.
        if (includeAudio) throw new Error('Atualize o aplicativo para compartilhar áudio do computador ou desmarque essa opção.');
        stream = await requireMediaDevices('getUserMedia').getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        });
      }
      const audioTrack = stream.getAudioTracks()[0];
      if (includeAudio && (!audioTrack || audioTrack.readyState !== 'live' || !audioTrack.enabled)) throw new Error('O Windows não disponibilizou áudio do computador. Verifique a saída de áudio ou compartilhe sem áudio.');
      if (includeAudio && audioTrack.getSettings().restrictOwnAudio !== true) throw new Error('A captura não confirmou a exclusão do áudio da chamada. Compartilhe sem áudio ou atualize o aplicativo.');
      setScreenAudioCapture({ requested: includeAudio, tracks: stream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, ownAudioExcluded: t.getSettings().restrictOwnAudio === true })) });

      console.log('[ScreenShare Desktop] Captura nativa iniciada com sucesso:', sourceId, 'Tracks:', stream.getTracks().map(t => t.kind));
      if (!voiceChannelRef.current || generation !== captureGenerationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      await applyScreenQuality(stream);
      if (!voiceChannelRef.current || generation !== captureGenerationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      await replaceSharedTracks(stream);screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      if(!wasSharing)playSound('screenshare_on');

      if (socket && currentVoiceChannel) {
        socket.emit('voice_state_toggle', {
          channelId: currentVoiceChannel.id,
          isScreenSharing: true,
          canAssist: Boolean(window.desktopInteraction?.isAvailable && selected?.id?.startsWith('screen:') && selected?.display_id),
          assistanceMode: 'desktop'
        });
      }

      stream.getVideoTracks()[0].onended = () => {
        console.log('[ScreenShare Desktop] Track onended disparado');
        stopScreenShare();
      };
      if(audioTrack)audioTrack.onended=()=>{if(screenStreamRef.current===stream){setScreenAudioCapture({requested:includeAudio,tracks:[]});setMediaError('A captura do áudio do computador foi interrompida. Reinicie o compartilhamento para recuperar o áudio.');}};
    } catch (err) {
      stream?.getTracks().forEach(t => t.stop());
      if (generation === captureGenerationRef.current) setSharedDisplaySource(previousSource || null);
      if(!wasSharing)setScreenAudioCapture(null);
      console.error('[ScreenShare Desktop] Erro ao capturar fonte selecionada:', err);
      setMediaError(err.message || 'Não foi possível iniciar a captura da tela/janela selecionada.');
    }
  };

  const startScreenShare = async () => {
    console.log('[ScreenShare] toggleScreenShare -> startScreenShare called');

    if (!currentVoiceChannel) {
      console.warn('[ScreenShare] Cannot share screen without being in a voice channel');
      alert('Você precisa estar conectado a um canal de voz para compartilhar a tela.');
      return;
    }
    if (/Electron\//.test(navigator.userAgent) && !window.electronAPI?.isDesktop) { setMediaError('A bridge do aplicativo está indisponível. Atualize ou reinstale o MeuApp para usar captura e controle nativos.'); return; }

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

    const generation = ++captureGenerationRef.current;
    // Fluxo padrão para versão Web (Navegador)
    if (window.isSecureContext === false) {
      setMediaError(mediaUnavailableMessage());
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      setMediaError(mediaUnavailableMessage());
      return;
    }

    let stream;
    setMediaError(null);
    try {
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
        if (errWithAudio.name === 'NotAllowedError' || errWithAudio.name === 'AbortError') return;
        console.warn('[ScreenShare] Tentativa com áudio avançado falhou, tentando audio: true simples:', errWithAudio);
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
        } catch (errWithOpts) {
          if (errWithOpts.name === 'NotAllowedError' || errWithOpts.name === 'AbortError') return;
          console.warn('[ScreenShare] fallback sem áudio getDisplayMedia({ video: true }):', errWithOpts);
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }
      }

      if (!voiceChannelRef.current || generation !== captureGenerationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      await applyScreenQuality(stream);
      if (!voiceChannelRef.current || generation !== captureGenerationRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      await replaceSharedTracks(stream);screenStreamRef.current = stream;
      setScreenAudioCapture({ requested: true, tracks: stream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, ownAudioExcluded: t.getSettings().restrictOwnAudio === true })) });
      if (!stream.getAudioTracks().length) setMediaError('Esta transmissão contém apenas vídeo: o navegador não disponibilizou áudio da fonte selecionada.');
      setScreenStream(stream);
      setIsScreenSharing(true);
      playSound('screenshare_on');

      if (socket && currentVoiceChannel) {
        socket.emit('voice_state_toggle', {
          channelId: currentVoiceChannel.id,
          isScreenSharing: true,
          canAssist: true,
          assistanceMode: 'presentation'
        });
      }

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      console.error('[ScreenShare Error Details]', error);
      if (error.name !== 'NotAllowedError') {
        alert(`Erro ao iniciar compartilhamento de tela: ${error.message}`);
      }
    }
  };
  const changeScreenSource=()=>startScreenShare();

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

    const handleScreenRequestView = async ({ viewerSocketId, channelId,viewerUser }) => {
      if (!screenStreamRef.current || channelId !== voiceChannelRef.current?.id) return;
      setScreenViewers(old=>({...old,[viewerSocketId]:viewerUser || {username:'Participante'}}));playSound('stream_join');
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
      pc.getTransceivers().filter(t => t.sender.track?.kind === 'audio').forEach(preferOpus);

      monitorScreenConnection(pc, viewerSocketId, 'sharer');

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
          await setRemoteDescription(pc, sdp);
        } catch (e) {
          console.error('[ScreenShare] Error setting remote description from answer:', e);
        }
      }
    };

    const handleScreenIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = screenPeerConnectionsRef.current[fromSocketId];
      if (pc && candidate) {
        try {
          await addRemoteCandidate(pc, candidate);
        } catch (e) {
          console.error('[ScreenShare] Error adding ICE candidate from viewer:', e);
        }
      }
    };

    const handleScreenViewerLeft = ({ viewerSocketId }) => {
      setScreenViewers(old=>{const next={...old};delete next[viewerSocketId];return next;});playSound('stream_leave');
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
  }, [socket, isScreenSharing, rtcConfig]);

  useEffect(()=>{const userId=watchedUserRef.current;if(!userId || !socket?.connected)return;const peer=voiceRooms[currentVoiceChannel?.id]?.find(p=>p.user.id===userId && p.isScreenSharing);if(peer && (peer.socketId!==watchedSharerRef.current || viewerPeerConnectionRef.current?.connectionState==='failed' || viewerPeerConnectionRef.current?.connectionState==='closed'))startWatchingScreen(peer.socketId);},[voiceRooms,currentVoiceChannel?.id,socket?.connected]);
  // --- LADO DO RECEPTOR (ESPECTADOR / VIEWER) ---
  const startWatchingScreen = (sharerSocketId) => {
    const channel = voiceChannelRef.current;
    if (!socket?.connected || !channel || sharerSocketId === socket.id) return;
    console.log(`[ScreenShare] Requesting to watch screen of ${sharerSocketId}`);
    stopWatchingScreen();
    watchedSharerRef.current = sharerSocketId;
    const user = voiceRooms[channel.id]?.find(p => p.socketId === sharerSocketId)?.user;watchedUserRef.current=user?.id;
    setActiveScreenSharer({ socketId: sharerSocketId, user });
    setIsWatchingScreen(true);

    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }

    const pc = new RTCPeerConnection(rtcConfig);
    viewerPeerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (viewerPeerConnectionRef.current !== pc) return;
      console.log('[ScreenShare] remote track received:', event.track.kind);
      // A fresh stream also triggers playback when audio arrives after video.
      setRemoteScreenStream(prev => new MediaStream([...new Map([...(prev?.getTracks() || []), ...(event.streams[0]?.getTracks() || []), event.track].map(t => [t.id, t])).values()]));
    };

    monitorScreenConnection(pc, sharerSocketId, 'viewer');

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('screen_ice_candidate', {
          targetSocketId: sharerSocketId,
          channelId: channel.id,
          candidate: event.candidate
        });
      }
    };

    socket.emit('screen_request_view', {
      targetSocketId: sharerSocketId,
      channelId: channel.id
    });
  };

  const stopWatchingScreen = () => {
    console.log('[ScreenShare] stopWatchingScreen called');
    if (!window.electronAPI?.isDesktop) window.dispatchEvent(new Event('assistance-invalidated'));
    if (viewerPeerConnectionRef.current) {
      try { viewerPeerConnectionRef.current.close(); } catch (e) {}
      viewerPeerConnectionRef.current = null;
    }
    if (watchedSharerRef.current && socket && voiceChannelRef.current) {
      socket.emit('screen_stop_viewing', {
        targetSocketId: watchedSharerRef.current,
        channelId: voiceChannelRef.current.id
      });
    }
    watchedSharerRef.current = null;watchedUserRef.current=null;
    setRemoteScreenStream(null);
    setIsWatchingScreen(false);
  };

  // Tratamento de ofertas recebidas pelo receptor (Viewer)
  useEffect(() => {
    if (!socket) return;

    const handleScreenOffer = async ({ sharerSocketId, channelId, sdp }) => {
      console.log(`[ScreenShare] offer received from ${sharerSocketId}`);
      const pc = viewerPeerConnectionRef.current;
      if (!pc || sharerSocketId !== watchedSharerRef.current || channelId !== voiceChannelRef.current?.id) return;

      try {
        await setRemoteDescription(pc, sdp);
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
      if (fromSocketId !== watchedSharerRef.current) return;
      if (pc && candidate) {
        try {
          await addRemoteCandidate(pc, candidate);
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
  }, [socket]);

  const applyScreenQuality = async stream => {
    const height = Number(screenQuality);
    await stream.getVideoTracks()[0]?.applyConstraints({ height: { ideal: height, max: height }, frameRate: { ideal: audioSettingsRef.current.screenFps, max: audioSettingsRef.current.screenFps } });
  };
  const changeScreenQuality = async quality => {
    setScreenQuality(quality);audioPreferences.update({screenQuality:quality});
    try { await screenStreamRef.current?.getVideoTracks()[0]?.applyConstraints({ height: { ideal: Number(quality), max: Number(quality) }, frameRate: { ideal: audioSettingsRef.current.screenFps, max: audioSettingsRef.current.screenFps } }); }
    catch (error) { setMediaError(`Não foi possível alterar a qualidade: ${error.message}`); }
  };
  const handleLeaveVoice = () => {
    if (!window.electronAPI?.isDesktop) window.dispatchEvent(new Event('assistance-invalidated'));
    stopScreenShare();
    stopWatchingScreen();
    cleanupScreenShareConnections();
    leaveVoice();
  };
  useEffect(()=>{
    setInputDeviceId(audioSettings.inputDeviceId);setOutputDeviceId(audioSettings.outputDeviceId);setScreenQuality(audioSettings.screenQuality);
    microphoneProcessorRef.current?.update(audioSettings).catch(error=>setMediaError(`Áudio: ${error.message}`));
    meshRef.current?.updateAudioSettings?.(audioSettings);
    screenStreamRef.current?.getVideoTracks()[0]?.applyConstraints({height:{ideal:Number(audioSettings.screenQuality),max:Number(audioSettings.screenQuality)},frameRate:{ideal:audioSettings.screenFps,max:audioSettings.screenFps}}).catch(error=>setMediaError(error.message));
  },[audioSettings]);
  useEffect(()=>{
    const matches=e=>{const parts=audioSettingsRef.current.pttKey.split('+'),code=parts.at(-1);return e.code===code && e.ctrlKey===parts.includes('Control') && e.altKey===parts.includes('Alt') && e.shiftKey===parts.includes('Shift') && e.metaKey===parts.includes('Meta');};
    const down=e=>{if(voiceChannelRef.current && audioSettingsRef.current.mode==='ptt' && matches(e)){pushToTalkRef.current=true;if(!e.target.closest?.('input,textarea,[contenteditable=true]'))e.preventDefault();}};
    const up=e=>{if(e.code===audioSettingsRef.current.pttKey.split('+').at(-1))pushToTalkRef.current=false;},blur=()=>{if(!window.electronAPI?.isDesktop)pushToTalkRef.current=false;};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    const clean=window.electronAPI?.desktop?.onAction(action=>{if(action==='ptt_down')pushToTalkRef.current=true;if(action==='ptt_up')pushToTalkRef.current=false;});
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);clean?.();pushToTalkRef.current=false;};
  },[]);
  const leaveRef = useRef(handleLeaveVoice);
  leaveRef.current = handleLeaveVoice;
  useEffect(()=>{const own=voiceRooms[currentVoiceChannel?.id]?.find(p=>p.socketId===socket?.id),state={muted:!!own?.serverMuted,deafened:!!own?.serverDeafened,canSpeak:own?.permissions?.speak,canVideo:own?.permissions?.video,canStream:own?.permissions?.stream};if(JSON.stringify(state)!==JSON.stringify(serverVoiceRef.current)){serverVoiceRef.current=state;setServerVoice(state);socket?.emit('voice_state_toggle',{channelId:currentVoiceChannel?.id,isMuted:muteRef.current,isDeafened:deafenRef.current});}if(state.canVideo===false && cameraStreamRef.current){cameraStreamRef.current.getTracks().forEach(t=>t.stop());cameraStreamRef.current=null;setCameraStream(null);setIsCameraOn(false);meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null,null).catch(()=>{});}if(state.canStream===false && screenStreamRef.current)stopScreenShare();},[voiceRooms,currentVoiceChannel?.id,socket]);
  useEffect(()=>{if(!socket)return;const removed=d=>{leaveRef.current();setMediaError(d.reason || 'Você foi desconectado do canal');},moved=async d=>{playSound('moved');await joinVoice(d.channel);window.dispatchEvent(new CustomEvent('navigate-channel',{detail:{channelId:d.channel.id}}));};socket.on('voice_removed',removed);socket.on('voice_moved',moved);return()=>{socket.off('voice_removed',removed);socket.off('voice_moved',moved);};},[socket,joinVoice]);
  useEffect(()=>{
    if(!cameraStreamRef.current){actualCameraId.current=audioSettings.cameraDeviceId;return;}
    let alive=true;const generation=joinGenerationRef.current,epoch=++cameraChangeEpoch.current,previousId=actualCameraId.current;
    navigator.mediaDevices.getUserMedia({video:{deviceId:audioSettings.cameraDeviceId?{exact:audioSettings.cameraDeviceId}:undefined},audio:false}).then(async stream=>{
      if(!alive || generation!==joinGenerationRef.current || epoch!==cameraChangeEpoch.current){stream.getTracks().forEach(t=>t.stop());return;}
      try{await meshRef.current?.setTracks(localStreamRef.current?.getAudioTracks()[0] || null,stream.getVideoTracks()[0]);}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
      if(!alive || generation!==joinGenerationRef.current || epoch!==cameraChangeEpoch.current){stream.getTracks().forEach(t=>t.stop());return;}
      actualCameraId.current=audioSettings.cameraDeviceId;cameraStreamRef.current?.getTracks().forEach(t=>t.stop());cameraStreamRef.current=stream;setCameraStream(stream);setIsCameraOn(true);
    }).catch(error=>{if(alive && epoch===cameraChangeEpoch.current){audioPreferences.update({cameraDeviceId:previousId});setMediaError(`Camera: ${error.message}`);}});
    return()=>{alive=false;};
  },[audioSettings.cameraDeviceId]);
  useEffect(() => {
    if (!socket) return;
    const disconnect = () => {
      if (!voiceChannelRef.current) return;
      if (!window.electronAPI?.isDesktop) window.dispatchEvent(new CustomEvent('assistance-invalidated', { detail: { reason: 'Conexao perdida' } }));
      meshRef.current?.destroy();meshRef.current=null;
      cleanupScreenShareConnections();setRemoteVoiceStreams({});setSpeakingParticipants({});setPeerDiagnostics({});
      setConnectionStatus('reconnecting');
    };
    const reconnect = async () => {
      const channel=voiceChannelRef.current;if(!channel)return;
      const generation=++joinGenerationRef.current;
      try {
        installVoiceTransport(channel.id);
        await meshRef.current.setTracks(localStreamRef.current?.getAudioTracks()[0] || null,cameraStreamRef.current?.getVideoTracks()[0] || null);
        const result=await socket.timeout(10000).emitWithAck('join_voice_channel',{channelId:channel.id});
        if(generation!==joinGenerationRef.current)return;
        if(result?.error)throw new Error(result.error);
        setConnectionStatus('connected');
        socket.emit('voice_state_toggle',{channelId:channel.id,isMuted:muteRef.current,isDeafened:deafenRef.current,isCameraOn:!!cameraStreamRef.current,isScreenSharing:!!screenStreamRef.current,canAssist:!!screenStreamRef.current && (!window.desktopInteraction?.isAvailable || !!latestMediaRef.current.sharedDisplaySource?.display_id),assistanceMode:window.desktopInteraction?.isAvailable?'desktop':'presentation'});
      }catch(error){if(generation===joinGenerationRef.current){leaveRef.current();setMediaError(error.message);}}
    };
    const speaking = ({ socketId, isSpeaking }) => setSpeakingParticipants(prev => ({ ...prev, [socketId]: isSpeaking }));
    const joined = () => playSound('join');
    const left = ({ socketId }) => { meshRef.current?.remove(socketId); playSound('leave'); };
    socket.on('disconnect', disconnect);
    socket.on('connect', reconnect);
    socket.on('participant_speaking', speaking);
    socket.on('user_joined_voice', joined);
    socket.on('user_left_voice', left);
    return () => {
      socket.off('disconnect', disconnect);
      socket.off('connect', reconnect);
      socket.off('participant_speaking', speaking);
      socket.off('user_joined_voice', joined);
      socket.off('user_left_voice', left);
      leaveRef.current();
    };
  }, [socket]);
  useEffect(() => {
    const channelId = currentVoiceChannel?.id;
    if (channelId && voiceRooms[channelId]) meshRef.current?.sync(voiceRooms[channelId].map(p => p.socketId));
  }, [voiceRooms, currentVoiceChannel]);

  return (
    <VoiceContext.Provider
      value={{
        rtcConfig, remoteVoiceStreams, connectionStatus, mediaError, peerDiagnostics,
        devices, refreshDevices,inputDeviceId, outputDeviceId, changeInputDevice, changeOutputDevice: id=>{setOutputDeviceId(id);audioPreferences.update({outputDeviceId:id});},
        screenQuality, changeScreenQuality,
        currentVoiceChannel,
        joinVoice,
        leaveVoice: handleLeaveVoice,
        isMuted:isMuted || serverVoice.muted,
        toggleMute,
        isDeafened:isDeafened || serverVoice.deafened,
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
        stopWatchingScreen,
        sharedDisplaySource,
        screenAudioCapture
        ,screenViewers,changeScreenSource,screenFps:audioSettings.screenFps,changeScreenFps:fps=>audioPreferences.update({screenFps:fps})
      }}
    >
      {children}
      {Object.entries(remoteVoiceStreams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} muted={isDeafened || serverVoice.deafened || !!voiceRooms[currentVoiceChannel?.id]?.find(p=>p.socketId===id)?.serverMuted || voiceRooms[currentVoiceChannel?.id]?.find(p=>p.socketId===id)?.permissions?.speak===false || !!audioSettings.participants[voiceRooms[currentVoiceChannel?.id]?.find(p=>p.socketId===id)?.user.id]?.muted} volume={audioSettings.outputGain*(audioSettings.participants[voiceRooms[currentVoiceChannel?.id]?.find(p=>p.socketId===id)?.user.id]?.volume??1)} sinkId={outputDeviceId} onError={setMediaError} />
      ))}
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

export function RemoteAudio({ stream, muted, volume=1, sinkId, onError,elementRef,testId='voice-audio' }) {
  const localRef=useRef(null),ref=elementRef || localRef,gainRef=useRef(null);
  useEffect(() => {
    const element = ref.current;
    if(!stream?.getAudioTracks().length){element.srcObject=null;return;}
    const context=new AudioContext(),source=context.createMediaStreamSource(stream),gain=context.createGain(),destination=context.createMediaStreamDestination();source.connect(gain);gain.connect(destination);gainRef.current=gain;gain.gain.value=volume;context.resume().catch(()=>{});
    element.srcObject = destination.stream;
    element.play().catch(error => { if (error.name !== 'AbortError') onError('Clique no aplicativo para ativar o áudio da chamada.'); });
    return () => { element.srcObject=null;source.disconnect();gain.disconnect();destination.stream.getTracks().forEach(t=>t.stop());context.close().catch(()=>{});gainRef.current=null; };
  }, [stream, onError]);
  useEffect(()=>{if(gainRef.current)gainRef.current.gain.value=volume;},[volume]);
  useEffect(() => {
    if (ref.current.setSinkId) ref.current.setSinkId(sinkId || '').catch(error => onError(`Saída de áudio: ${error.message}`));
  }, [sinkId, onError]);
  return <audio ref={ref} data-testid={testId} autoPlay muted={muted} />;
}
