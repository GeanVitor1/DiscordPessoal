import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useVoice } from './VoiceContext';
import {
  InteractionSession,
  InteractionValidator,
  InteractionEventReceiver,
  CoordinateMapper,
  CanvasInteractionTarget,
  NativeDesktopInteractionTarget,
  RealtimeTransport,
  SessionState,
  InteractionEventType,
  createInteractionEvent
} from '../interaction';


const InteractionContext = createContext();

export const InteractionProvider = ({ children }) => {
  const { socket } = useSocket();
  const { currentUser } = useAuth();

  // Active interaction session instance & state
  const [session, setSession] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [incomingRequest, setIncomingRequest] = useState(null); // { sessionId, fromSocketId, fromUser, metadata }
  const [targetPeerSocketId, setTargetPeerSocketId] = useState(null);
  const [activeGuest, setActiveGuest] = useState(null); // { id, username }
  const [isHost, setIsHost] = useState(false);
  const [transportStatus, setTransportStatus] = useState('disconnected');
  const [auditLogs, setAuditLogs] = useState([]);


  // Architecture refs
  const sessionRef = useRef(null);
  const receiverRef = useRef(null);
  const validatorRef = useRef(null);
  const coordinateMapperRef = useRef(null);
  const targetRef = useRef(null);
  const transportRef = useRef(null);
  const sequenceCounterRef = useRef(0);

  const { sharedDisplaySource } = useVoice?.() || {};

  // Initialize Target & Mapper on mount
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopInteraction?.isAvailable);
    let target;
    if (isDesktop) {
      console.log('[Interaction] Usando NativeDesktopInteractionTarget (Electron Host)');
      target = new NativeDesktopInteractionTarget({ sessionId: null, displayId: null });
    } else {
      console.log('[Interaction] Usando CanvasInteractionTarget (Web Browser)');
      target = new CanvasInteractionTarget(null);
    }

    const mapper = new CoordinateMapper({ width: 1280, height: 720 }, { width: 16, height: 9 });
    const validator = new InteractionValidator({ maxEventsPerSecond: 60, burstCapacity: 100 });

    targetRef.current = target;
    coordinateMapperRef.current = mapper;
    validatorRef.current = validator;

    return () => {
      target.destroy();
      if (transportRef.current) transportRef.current.destroy();
      if (sessionRef.current) sessionRef.current.destroy();
    };
  }, []);


  const addAuditLog = (entry) => {
    setAuditLogs((prev) => [entry, ...prev.slice(0, 99)]);
  };

  // Socket signaling events for interaction authorization and requests
  useEffect(() => {
    if (!socket) return;

    // Incoming request to interact
    const handleRequest = ({ fromSocketId, fromUser, sessionId, metadata }) => {
      setIncomingRequest({ fromSocketId, fromUser, sessionId, metadata });
    };

    // Consent response received (Host answered)
    const handleConsent = ({ fromSocketId, sessionId, token, approved }) => {
      if (sessionRef.current && sessionRef.current.sessionId === sessionId) {
        if (approved) {
          sessionRef.current.token = token;
          sessionRef.current.grantConsent();
          setSessionState(SessionState.Authorized);
          addAuditLog({ timestamp: Date.now(), action: 'CONSENT_GRANTED', sessionId });
        } else {
          sessionRef.current.revoke('Consent rejected by host');
          setSessionState(SessionState.Revoked);
          addAuditLog({ timestamp: Date.now(), action: 'CONSENT_REJECTED', sessionId });
        }
      }
    };

    // Immediate revocation from other peer
    const handleRevoke = ({ sessionId, reason }) => {
      if (sessionRef.current && sessionRef.current.sessionId === sessionId) {
        sessionRef.current.revoke(reason);
        setSessionState(SessionState.Revoked);
        if (targetRef.current && typeof targetRef.current.deactivate === 'function') {
          targetRef.current.deactivate();
        }
        if (typeof window !== 'undefined' && window.desktopInteraction?.revokeSession) {
          window.desktopInteraction.revokeSession().catch(() => {});
        }
        addAuditLog({ timestamp: Date.now(), action: 'SESSION_REVOKED_REMOTELY', sessionId, reason });
      }
    };


    socket.on('interaction_request', handleRequest);
    socket.on('interaction_consent', handleConsent);
    socket.on('interaction_revoke', handleRevoke);

    return () => {
      socket.off('interaction_request', handleRequest);
      socket.off('interaction_consent', handleConsent);
      socket.off('interaction_revoke', handleRevoke);
    };
  }, [socket]);

  // Request interaction permission (Guest initiates)
  const requestInteraction = (peerSocketId, channelId) => {
    if (!socket || !currentUser) return;
    const sessId = 'sess_' + Date.now();
    const token = 'tok_' + Math.random().toString(36).substring(2, 10);

    const newSession = new InteractionSession({
      sessionId: sessId,
      hostId: peerSocketId,
      guestId: currentUser.id,
      token,
      timeoutMs: 90000,
      onStateChange: (newState) => setSessionState(newState),
      onAudit: addAuditLog
    });

    newSession.requestConsent();
    sessionRef.current = newSession;
    setSession(newSession);
    setSessionState(SessionState.WaitingForConsent);
    setTargetPeerSocketId(peerSocketId);
    setIsHost(false);
    sequenceCounterRef.current = 0;

    // Setup transport as initiator
    if (transportRef.current) transportRef.current.destroy();
    const transport = new RealtimeTransport({
      socket,
      sessionId: sessId,
      channelId,
      targetPeerSocketId: peerSocketId,
      isInitiator: true,
      onTransportStatus: (status) => setTransportStatus(status)
    });
    transportRef.current = transport;
    transport.connect();

    // Signal request to host
    socket.emit('interaction_request', {
      targetSocketId: peerSocketId,
      sessionId: sessId,
      metadata: { requesterName: currentUser.username }
    });
  };

  // Host accepts or rejects incoming interaction request
  const answerInteractionRequest = (approved) => {
    if (!incomingRequest || !socket || !currentUser) return;
    const { fromSocketId, sessionId } = incomingRequest;

    if (approved) {
      const token = 'tok_' + Math.random().toString(36).substring(2, 10);
      const newSession = new InteractionSession({
        sessionId,
        hostId: currentUser.id,
        guestId: incomingRequest.fromUser?.id || fromSocketId,
        token,
        timeoutMs: 90000,
        onStateChange: (newState) => setSessionState(newState),
        onAudit: addAuditLog
      });

      newSession.grantConsent();
      sessionRef.current = newSession;
      setSession(newSession);
      setSessionState(SessionState.Authorized);
      setTargetPeerSocketId(fromSocketId);
      setActiveGuest(incomingRequest.fromUser || { id: fromSocketId, username: incomingRequest.metadata?.requesterName || 'Usuário Remoto' });
      setIsHost(true);

      // Configura target nativo se estiver no Desktop Electron
      const guestId = incomingRequest.fromUser?.id || fromSocketId;

      const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopInteraction?.isAvailable);

      if (isDesktop && targetRef.current instanceof NativeDesktopInteractionTarget) {
        targetRef.current.setSessionId(sessionId);
        targetRef.current.isActive = true;

        // Associar o display correto do compartilhamento
        if (sharedDisplaySource?.display_id) {
          targetRef.current.setDisplayId(sharedDisplaySource.display_id);
        } else if (sharedDisplaySource?.id?.startsWith('screen:')) {
          const rawId = sharedDisplaySource.id.replace('screen:', '');
          targetRef.current.setDisplayId(rawId);
        }

        // Notificar Main Process para autorizar inputs apenas desta sessão
        window.desktopInteraction.setAuthorizedSession?.(sessionId, guestId).catch(console.error);
        console.log(`[Interaction] Authorized session ${sessionId} configured in Desktop target`);
      }

      // Create receiver pipeline for Host with clean sequence
      const receiver = new InteractionEventReceiver({
        session: newSession,
        validator: validatorRef.current,
        coordinateMapper: coordinateMapperRef.current,
        target: targetRef.current,
        onAudit: addAuditLog
      });
      receiver.resetSequence();
      receiverRef.current = receiver;

      // Setup transport as responder with matched sessionId
      if (transportRef.current) transportRef.current.destroy();
      const transport = new RealtimeTransport({
        socket,
        sessionId,
        channelId: null,
        targetPeerSocketId: fromSocketId,
        isInitiator: false,
        onMessage: (rawData) => {
          receiverRef.current?.receive(rawData);
        },
        onTransportStatus: (status) => setTransportStatus(status)
      });
      transportRef.current = transport;
      transport.connect();

      socket.emit('interaction_consent', {
        targetSocketId: fromSocketId,
        sessionId,
        token,
        approved: true
      });
    } else {
      socket.emit('interaction_consent', {
        targetSocketId: fromSocketId,
        sessionId,
        approved: false
      });
    }

    setIncomingRequest(null);
  };

  // Immediate Revocation
  const revokeSession = (reason = 'Revogado pelo usuário') => {
    if (sessionRef.current) {
      const oldSessionId = sessionRef.current.sessionId;
      sessionRef.current.revoke(reason);
      sessionRef.current.token = null; // Invalida token na memória para evitar reaproveitamento
      setSessionState(SessionState.Revoked);

      if (socket && targetPeerSocketId) {
        socket.emit('interaction_revoke', {
          targetSocketId: targetPeerSocketId,
          sessionId: oldSessionId,
          reason
        });
      }
    }

    // Desativa target Desktop imediatamente
    setActiveGuest(null);
    if (targetRef.current && typeof targetRef.current.deactivate === 'function') {
      targetRef.current.deactivate();
    }
    if (typeof window !== 'undefined' && window.desktopInteraction?.revokeSession) {
      window.desktopInteraction.revokeSession().catch(() => {});
    }

    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
    }
    sequenceCounterRef.current = 0;
  };

  // End / Finish Session
  const finishSession = () => {
    if (sessionRef.current) {
      sessionRef.current.finish('Sessão concluída');
      sessionRef.current.token = null;
      setSessionState(SessionState.Finished);
    }

    // Desativa target Desktop imediatamente
    setActiveGuest(null);
    if (targetRef.current && typeof targetRef.current.deactivate === 'function') {
      targetRef.current.deactivate();
    }

    if (typeof window !== 'undefined' && window.desktopInteraction?.revokeSession) {
      window.desktopInteraction.revokeSession().catch(() => {});
    }

    if (transportRef.current) {
      transportRef.current.destroy();
      transportRef.current = null;
    }
    sequenceCounterRef.current = 0;
  };


  // Send interaction event from Guest
  const sendEvent = (eventType, payload) => {
    // Impede envio se a sessão não estiver estritamente autorizada/ativa
    if (!sessionRef.current || !sessionRef.current.isAuthorized()) {
      return false;
    }
    if (!transportRef.current) {
      return false;
    }

    const sequence = sequenceCounterRef.current++;
    const eventPacket = createInteractionEvent({
      sessionId: sessionRef.current.sessionId,
      participantId: currentUser.id,
      token: sessionRef.current.token,
      sequence,
      eventType,
      payload
    });

    transportRef.current.send(eventPacket);
    return true;
  };

  // Bind the canvas DOM element to CanvasInteractionTarget
  const attachCanvas = (canvasElement) => {
    if (targetRef.current && canvasElement) {
      targetRef.current.setCanvas(canvasElement);
    }
  };

  // Update visual container dimensions in CoordinateMapper
  const updateSurfaceDimensions = (width, height, contentAspect = null) => {
    if (coordinateMapperRef.current) {
      coordinateMapperRef.current.updateBounds(width, height);
      if (contentAspect) {
        coordinateMapperRef.current.contentAspectRatio = contentAspect;
      }
    }
  };

  return (
    <InteractionContext.Provider
      value={{
        session,
        sessionState,
        isHost,
        activeGuest,
        targetPeerSocketId,
        incomingRequest,
        transportStatus,
        auditLogs,
        requestInteraction,
        answerInteractionRequest,
        revokeSession,
        finishSession,
        sendEvent,
        attachCanvas,
        updateSurfaceDimensions,
        coordinateMapper: coordinateMapperRef.current,
        target: targetRef.current,
        getReceiverStats: () => receiverRef.current?.getStats() || null
      }}
    >
      {children}
    </InteractionContext.Provider>
  );
};

export const useInteraction = () => useContext(InteractionContext);
