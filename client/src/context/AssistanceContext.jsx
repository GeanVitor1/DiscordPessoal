import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import api from '../api';
import { DEFAULT_RTC_CONFIG } from '../rtc/ice';
import { AssistanceTransport } from '../interaction/AssistanceTransport';
import { captureAssistanceDisplay } from '../interaction/AssistanceCapture';
import { InteractionSession, InteractionValidator, InteractionEventReceiver, CoordinateMapper, NativeDesktopInteractionTarget, SessionState, createInteractionEvent } from '../interaction';
import { traceAssist } from '../interaction/diagnostics';
import { isRecoverableNativeError, nativeErrorMessage } from '../interaction/nativeErrors';

const AssistanceContext = createContext();
export const AssistanceProvider = ({ children }) => {
  const { socket, voiceRooms } = useSocket();
  const { currentUser } = useAuth();
  const rtcConfigRef = useRef(DEFAULT_RTC_CONFIG);
  const captureRef = useRef(null);
  const [assistanceStream, setAssistanceStream] = useState(null);
  const [assistanceDisplay, setAssistanceDisplay] = useState(null);
  const [displays, setDisplays] = useState([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState('');
  const [protocolReady, setProtocolReady] = useState(false);
  useEffect(() => {
    let alive=true;
    const refresh=()=>api.get('/api/ice-servers').then(({data})=>{if(alive && Array.isArray(data.iceServers))rtcConfigRef.current={iceServers:data.iceServers,iceTransportPolicy:import.meta.env.VITE_FORCE_RELAY === 'true' ? 'relay':'all'};}).catch(()=>{});
    refresh();const timer=setInterval(refresh,20*60*1000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  const [session, setSession] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [activeGuest, setActiveGuest] = useState(null);
  const [targetPeerSocketId, setTargetPeerSocketId] = useState(null);
  const [transportStatus, setTransportStatus] = useState('disconnected');
  const [auditLogs, setAuditLogs] = useState([]);
  const [interactionError, setInteractionError] = useState(null);
  const [endedReason, setEndedReason] = useState(null);
  const [answering, setAnswering] = useState(false);
  const desktopRuntime = Boolean(window.electronAPI?.isDesktop) || /Electron\//.test(navigator.userAgent);
  const assistanceMode = 'desktop';
  const [nativeDiagnostics, setNativeDiagnostics] = useState(null);
  const [lastNativeAck, setLastNativeAck] = useState(null);
  const sessionRef = useRef(null);
  const transportRef = useRef(null);
  const receiverRef = useRef(null);
  const targetRef = useRef(null);
  const peerRef = useRef(null);
  const pendingRef = useRef(null);
  const sequenceRef = useRef(0);
  const epochRef = useRef(0);
  const answeringRef = useRef(false);
  const lastAuditRef = useRef(0);
  const mapperRef = useRef(new CoordinateMapper());
  const addAuditLog = useCallback(entry => {
    if (entry.action === 'EVENT_PROCESSED' && Date.now() - lastAuditRef.current < 200) return;
    if (entry.action === 'EVENT_PROCESSED') lastAuditRef.current = Date.now();
    if (entry.action === 'EVENT_PROCESSED') traceAssist('HOST', entry.details?.eventType, entry.details?.sequence, 'received / validated');
    setAuditLogs(prev => [entry, ...prev.slice(0, 99)]);
  }, []);
  const revokeSession = useCallback((reason = 'Assistência encerrada', notify = true) => {
    ++epochRef.current;
    const old = sessionRef.current;
    const request = pendingRef.current;
    if (old || request) setEndedReason(/conex|interromp|perdid/i.test(reason) ? 'Assist\u00eancia encerrada \u2014 conex\u00e3o perdida' : `Assist\u00eancia encerrada \u2014 ${reason}`);
    sessionRef.current = null;
    pendingRef.current = null;
    old?.revoke(reason); old?.destroy();
    targetRef.current?.deactivate?.();
    captureRef.current?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    captureRef.current=null;setAssistanceStream(null);setAssistanceDisplay(null);
    window.desktopInteraction?.revokeSession?.().catch(() => {});
    transportRef.current?.destroy(); transportRef.current = null;
    receiverRef.current?.resetSequence(); receiverRef.current = null;
    if (notify && socket?.connected && (old || request)) socket.emit('assistance_revoke', { sessionId: old?.sessionId || request.sessionId });
    sequenceRef.current = 0; peerRef.current = null;
    setSession(null); setSessionState(old || request ? SessionState.Revoked : null);
    setIncomingRequest(null); setActiveGuest(null); setIsHost(false); setTargetPeerSocketId(null); setTransportStatus('disconnected');
  }, [socket]);
  const makeSession = useCallback(options => new InteractionSession({ ...options, timeoutMs: 90000, onAudit: addAuditLog,
    onStateChange: state => { setSessionState(state); if (state === SessionState.Finished) revokeSession('Assistência expirada'); }
  }), [addAuditLog, revokeSession]);
  const startTransport = useCallback((active, peer, initiator) => {
    const transport = new AssistanceTransport({ socket, sessionId: active.sessionId, targetPeerSocketId: peer,
      isInitiator: initiator, rtcConfig: rtcConfigRef.current, captureStream: captureRef.current, onStream: setAssistanceStream, sessionToken: active.token,
      onMessage: raw => {
        const result = receiverRef.current?.receive(raw);
        if (result?.code === 'RATE_LIMIT_EXCEEDED') revokeSession('Limite de comandos excedido');
      },
      onAcknowledgement: ack => { setLastNativeAck(ack); setInteractionError(ack.success ? null : nativeErrorMessage(ack.code)); },
      onTransportStatus: status => { setTransportStatus(status); if (status === 'disconnected') revokeSession('Conexão da assistência interrompida'); }
    });
    transportRef.current = transport; transport.connect();
  }, [socket, revokeSession]);
  useEffect(() => {
    targetRef.current = new NativeDesktopInteractionTarget();
    return () => { targetRef.current?.destroy(); targetRef.current = null; };
  }, []);
  useEffect(() => {
    if (!socket) return;
    const request = data => {
      if (sessionRef.current || pendingRef.current || data.protocol !== 2 || !window.desktopInteraction?.isAvailable) {
        socket.emit('assistance_consent', { sessionId: data.sessionId, targetSocketId: data.fromSocketId, approved:false }); return;
      }
      window.desktopInteraction.getDisplays().then(list=>{
        if(pendingRef.current?.sessionId !== data.sessionId)return;
        setDisplays(list);setSelectedDisplayId(String((list.find(d=>d.isPrimary) || list[0])?.id || ''));
      }).catch(()=>setInteractionError('Não foi possível listar as telas para assistência.'));
      pendingRef.current = data; setIncomingRequest(data);
    };
    const consent = data => {
      const active = sessionRef.current;
      if (!active || active.sessionId !== data.sessionId || peerRef.current !== data.fromSocketId || active.getState() !== SessionState.WaitingForConsent) return;
      if (!data.approved || !data.token) { revokeSession('Solicitação recusada', false); return; }
      active.token = data.token; active.grantConsent(); startTransport(active, data.fromSocketId, true);
      setAssistanceDisplay(data.display);
    };
    const revoked = data => {
      if (data.sessionId === sessionRef.current?.sessionId || data.sessionId === pendingRef.current?.sessionId) revokeSession(data.reason, false);
    };
    const disconnected = () => revokeSession('Conexão interrompida', false);
    const invalidate = () => revokeSession('Aplicativo encerrado');
    socket.on('assistance_request', request); socket.on('assistance_consent', consent);
    socket.on('assistance_revoke', revoked); socket.on('disconnect', disconnected);
    window.addEventListener('beforeunload', invalidate);
    const announce = () => {
      setProtocolReady(false);socket.timeout(5000).emit('assistance_capabilities',{protocol:2,nativeControl:window.desktopInteraction?.isAvailable === true},(error,response)=>{if(!error && response?.protocol === 2)setProtocolReady(true);});
    };
    socket.on('connect',announce);if(socket.connected)announce();
    const cleanupNative = window.desktopInteraction?.onRevoked?.(data => {
      if(data.nativeStatus)setNativeDiagnostics(data.nativeStatus);
      if(data.nativeStatus?.lastNativeAck==='ERROR') {
        setLastNativeAck({success:false,nativeAck:'ERROR',sequence:data.nativeStatus.lastSequence,eventType:data.nativeStatus.lastInput,code:data.nativeStatus.lastError});
        setInteractionError(nativeErrorMessage(data.nativeStatus.lastError));
      }
      if (data.sessionId === sessionRef.current?.sessionId || data.sessionId === pendingRef.current?.sessionId) revokeSession(data.reason);
    });
    return () => {
      socket.off('assistance_request', request); socket.off('assistance_consent', consent);
      socket.off('assistance_revoke', revoked); socket.off('disconnect', disconnected);
      window.removeEventListener('beforeunload', invalidate);
      socket.off('connect',announce);cleanupNative?.(); revokeSession('Contexto encerrado');
    };
  }, [socket, revokeSession, startTransport]);
  const requestInteraction = (peer, channelId) => {
    if (!socket?.connected || !currentUser || sessionRef.current || pendingRef.current) return false;
    if (!protocolReady) { setInteractionError('O servidor precisa da atualização de assistência independente.');return false; }
    if (!voiceRooms[channelId]?.find(p=>p.socketId === peer)?.assistanceAvailable) {setInteractionError('A assistência exige o aplicativo desktop no computador remoto.');return false;}
    setLastNativeAck(null);
    setNativeDiagnostics(null);
    setInteractionError(null);
    setEndedReason(null);
    const active = makeSession({ sessionId: crypto.randomUUID(), hostId: peer, guestId: currentUser.id, token: crypto.randomUUID() });
    sessionRef.current = active; peerRef.current = peer;
    setSession(active); setIsHost(false); setTargetPeerSocketId(peer); active.requestConsent();
    socket.timeout(5000).emit('assistance_request', { targetSocketId: peer, sessionId: active.sessionId }, (error, response) => {
      if (sessionRef.current !== active) return;
      if (error || response?.error) { setInteractionError(response?.error || 'Não foi possível enviar a solicitação'); revokeSession('Solicitação falhou'); }
    });
    return true;
  };
  const answerInteractionRequest = async approved => {
    let capture;
    const request = pendingRef.current;
    if (!request || !socket?.connected || !currentUser || answeringRef.current) return;
    answeringRef.current = true; setAnswering(true);
    const epoch = epochRef.current;
    try {
      if (!approved) {
        socket.emit('assistance_consent', { targetSocketId: request.fromSocketId, sessionId: request.sessionId, approved: false });
        revokeSession('Solicitação recusada', false); return;
      }
      const selectedDisplay = displays.find(d=>String(d.id) === selectedDisplayId);
      if (!selectedDisplay) throw new Error('Selecione a tela que será autorizada para assistência.');
      const display = { id:String(selectedDisplay.id),width:Math.round(selectedDisplay.bounds.width),height:Math.round(selectedDisplay.bounds.height) };
      setLastNativeAck(null); setNativeDiagnostics(null); setInteractionError(null);
      setEndedReason(null);
      if (desktopRuntime && !window.desktopInteraction?.isAvailable) throw new Error('A bridge nativa está indisponível. Atualize ou reinstale o aplicativo Desktop.');
      if (window.desktopInteraction?.isAvailable) {
        const result = await window.desktopInteraction.setAuthorizedSession(request.sessionId, request.fromUser.id, display.id, `${request.fromUser.username} (@${request.fromUser.handle})`);
        if (epoch !== epochRef.current) return;
        if (!result?.success) throw new Error(result?.code ? nativeErrorMessage(result.code) : 'Assistência não autorizada no computador.');
      }
      capture = await captureAssistanceDisplay(display.id);
      if (epoch !== epochRef.current) { capture.getTracks().forEach(t=>t.stop());return; }
      captureRef.current=capture;setAssistanceStream(capture);setAssistanceDisplay(display);
      capture.getVideoTracks()[0].onended=()=>revokeSession('Captura da assistência encerrada');
      const response = await socket.timeout(5000).emitWithAck('assistance_consent' , { targetSocketId: request.fromSocketId, sessionId: request.sessionId, approved: true, display });
      if (epoch !== epochRef.current) return;
      if (!response?.ok || !response.token) throw new Error(response?.error || 'Autorização não confirmada pelo servidor');
      if (window.desktopInteraction?.isAvailable) {
        if (!await window.desktopInteraction.activateSession?.(request.sessionId, request.fromUser.id, response.token)) throw new Error('O helper nativo não confirmou a sessão ativa.');
        if (epoch !== epochRef.current) return;
      }
      const active = makeSession({ sessionId: request.sessionId, hostId: currentUser.id, guestId: request.fromUser.id, token: response.token });
      sessionRef.current = active; peerRef.current = request.fromSocketId; pendingRef.current = null; setIncomingRequest(null);
      setSession(active); setIsHost(true); setActiveGuest(request.fromUser); setTargetPeerSocketId(request.fromSocketId);
      if (targetRef.current instanceof NativeDesktopInteractionTarget) {
        targetRef.current.setSessionId(active.sessionId); targetRef.current.setDisplayId(display.id); targetRef.current.isActive = true;
      }
      receiverRef.current = new InteractionEventReceiver({ session: active, validator: new InteractionValidator({ maxEventsPerSecond: 120, burstCapacity: 200 }), coordinateMapper: mapperRef.current, target: targetRef.current, onAudit: addAuditLog,
        onApplied: (event, result) => {
          setLastNativeAck({sequence:event.sequence,eventType:event.eventType,...result});
          transportRef.current?.sendAcknowledgement(event,result);
          setInteractionError(result?.success ? null : nativeErrorMessage(result?.code));
          if(!result?.success && !isRecoverableNativeError(result?.code)) revokeSession(`Entrada nativa falhou (${result?.code || 'NATIVE_ERROR'})`);
        }
      });
      active.grantConsent(); startTransport(active, request.fromSocketId, false);
      socket.emit('assistance_ready', { sessionId: active.sessionId, targetSocketId: request.fromSocketId });
    } catch (error) { if (epoch === epochRef.current) { setInteractionError(error.message); revokeSession('Autorização falhou'); } }
    finally { answeringRef.current = false; setAnswering(false); }
  };
  useEffect(() => {
    if (!isHost || !session?.isAuthorized() || !window.desktopInteraction?.isAvailable) return;
    const heartbeat = () => {
      // Never extend a native grant solely because the renderer is still running.
      if (!transportRef.current?.isPeerAlive()) return;
      window.desktopInteraction.heartbeat(session.sessionId).then(ok => { if (!ok) revokeSession('Autorização nativa encerrada'); }).catch(() => revokeSession('Conexão nativa perdida'));
    };
    heartbeat(); const timer = setInterval(heartbeat, 2000);
    return () => clearInterval(timer);
  }, [isHost, session, revokeSession]);
  useEffect(() => {
    if (!isHost || !window.desktopInteraction?.getStatus) return;
    let alive=true;
    const refresh=()=>window.desktopInteraction.getStatus().then(status=>{if(alive)setNativeDiagnostics(status);}).catch(()=>{if(alive)setNativeDiagnostics({ipc:'ERROR',nativeHost:'ERROR'});});
    refresh();const timer=setInterval(refresh,1000);
    return()=>{alive=false;clearInterval(timer);};
  }, [isHost, session]);
  const sendEvent = (eventType, payload) => {
    const active = sessionRef.current;
    if (!active?.isAuthorized() || isHost || !transportRef.current) return false;
    const packet = createInteractionEvent({ sessionId: active.sessionId, participantId: currentUser.id, token: active.token, sequence: sequenceRef.current, eventType, payload });
    traceAssist('VIEWER', eventType, packet.sequence, 'captured');
    if (!transportRef.current.send(packet)) return false;
    sequenceRef.current++; active.activate(); return true;
  };
  const attachCanvas = useCallback(() => {}, []);
  const updateSurfaceDimensions = useCallback(() => {}, []);
  const getReceiverStats = useCallback(() => receiverRef.current?.getStats() || null, []);
  return <AssistanceContext.Provider value={{ session, sessionState, isHost, assistanceMode, assistanceStream, assistanceDisplay, displays, selectedDisplayId, setSelectedDisplayId, activeGuest, targetPeerSocketId, incomingRequest, transportStatus, auditLogs, interactionError, endedReason, answering, nativeDiagnostics, lastNativeAck, requestInteraction, answerInteractionRequest, revokeSession, finishSession: () => revokeSession('Sessão concluída'), sendEvent, attachCanvas, updateSurfaceDimensions, coordinateMapper: mapperRef.current, target: targetRef.current, getReceiverStats }}>{children}</AssistanceContext.Provider>;
};
export const useAssistance = () => useContext(AssistanceContext);
