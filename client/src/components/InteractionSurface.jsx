import React, { useEffect, useRef, useState } from 'react';
import { useInteraction } from '../context/InteractionContext';
import { InteractionEventType } from '../interaction';
import { Shield, ShieldAlert, ShieldCheck, Activity, MousePointer, XCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function InteractionSurface({
  width = '100%',
  height = '100%',
  isInteractive = true,
  children
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const {
    session,
    sessionState,
    isHost,
    incomingRequest,
    transportStatus,
    auditLogs,
    answerInteractionRequest,
    revokeSession,
    sendEvent,
    attachCanvas,
    updateSurfaceDimensions,
    coordinateMapper,
    getReceiverStats
  } = useInteraction();

  // Metrics polling for Host HUD display
  const [metrics, setMetrics] = useState({
    totalAccepted: 0,
    totalRejected: 0,
    totalOutOfOrder: 0,
    totalDropped: 0,
    lastLatencyMs: 0,
    lastSequence: -1
  });

  useEffect(() => {
    if (!session || !isHost) return;
    const interval = setInterval(() => {
      const stats = getReceiverStats?.();
      if (stats) {
        setMetrics(stats);
      }
    }, 1500); // Polling suave a cada 1.5s em vez de 250ms contínuos
    return () => clearInterval(interval);
  }, [session, isHost, getReceiverStats]);

  // Attach canvas to target engine
  useEffect(() => {
    if (canvasRef.current) {
      attachCanvas(canvasRef.current);
    }
  }, [attachCanvas]);

  // Sync canvas width/height with container bounding rect com requestAnimationFrame
  useEffect(() => {
    let animationFrameId = null;

    const handleResize = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!containerRef.current || !canvasRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (canvasRef.current.width !== rect.width || canvasRef.current.height !== rect.height) {
          canvasRef.current.width = rect.width;
          canvasRef.current.height = rect.height;
          updateSurfaceDimensions(rect.width, rect.height, { width: 16, height: 9 });
        }
      });
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [updateSurfaceDimensions]);

  // Capture local interaction events if user is authorized guest
  const canSend = !isHost && (sessionState === 'Authorized' || sessionState === 'Active');

  const handleMouseMove = (e) => {
    if (!canSend || !containerRef.current || !coordinateMapper) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const { normX, normY } = coordinateMapper.mapPixelsToNormalized(localX, localY);
    sendEvent(InteractionEventType.PointerMove, { x: normX, y: normY });
  };

  const handleMouseDown = (e) => {
    if (!canSend || !containerRef.current || !coordinateMapper) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const { normX, normY } = coordinateMapper.mapPixelsToNormalized(localX, localY);
    sendEvent(InteractionEventType.PointerDown, { button: e.button, x: normX, y: normY });
  };

  const handleMouseUp = (e) => {
    if (!canSend || !containerRef.current || !coordinateMapper) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const { normX, normY } = coordinateMapper.mapPixelsToNormalized(localX, localY);
    sendEvent(InteractionEventType.PointerUp, { button: e.button, x: normX, y: normY });
  };

  const handleWheel = (e) => {
    if (!canSend) return;
    const delta = e.deltaY > 0 ? 1 : -1;
    sendEvent(InteractionEventType.Scroll, { delta });
  };

  const handleKeyDown = (e) => {
    if (!canSend) return;
    // Evita propagar teclas comuns fora do canvas
    sendEvent(InteractionEventType.KeyPressed, { key: e.key });
  };

  const handleKeyUp = (e) => {
    if (!canSend) return;
    sendEvent(InteractionEventType.KeyReleased, { key: e.key });
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className="relative outline-none select-none overflow-hidden flex items-center justify-center bg-black/60 rounded-lg"
      style={{ width, height }}
    >
      {/* Visual content underneath (e.g. video, shared screen, canvas presentation) */}
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        {children}
      </div>

      {/* Controlled safe Canvas Target Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* Top Session Security & Status Banner with Real-time Diagnostics */}
      {session && (
        <div className="absolute top-2 left-2 z-20 flex flex-wrap items-center gap-2 bg-[#111214]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#3f4147] text-xs shadow-xl">
          <div className="flex items-center gap-1.5">
            {sessionState === 'Active' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-pulse" />
            ) : sessionState === 'Authorized' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-discord-blurple" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-discord-red" />
            )}
            <span className="font-semibold text-white">
              Sessão: {sessionState}
            </span>
          </div>

          <span className="text-discord-textMuted">•</span>
          <span className="text-discord-textMuted font-medium">
            {isHost ? 'Host (Anfitrião)' : 'Guest (Interativo)'}
          </span>

          <span className="text-discord-textMuted">•</span>
          <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
            transportStatus === 'connected'
              ? 'bg-discord-green/20 text-discord-green'
              : transportStatus === 'fallback'
              ? 'bg-discord-yellow/20 text-discord-yellow'
              : 'bg-discord-red/20 text-discord-red'
          }`}>
            {transportStatus === 'fallback' ? '⚡ WS Fallback' : `DC: ${transportStatus}`}
          </span>

          {/* Métricas ao vivo do receptor no Host */}
          {isHost && (
            <>
              <span className="text-discord-textMuted">•</span>
              <span className="font-mono text-[11px] text-discord-green font-semibold">
                Ping: ~{metrics.lastLatencyMs}ms
              </span>
              <span className="text-discord-textMuted">•</span>
              <span className="font-mono text-[11px] text-gray-300">
                Seq: #{metrics.lastSequence >= 0 ? metrics.lastSequence : 0}
              </span>
              {metrics.totalOutOfOrder > 0 && (
                <span className="font-mono text-[11px] text-discord-yellow font-bold">
                  Fora de ordem: {metrics.totalOutOfOrder}
                </span>
              )}
              {metrics.totalDropped > 0 && (
                <span className="font-mono text-[11px] text-discord-red font-bold">
                  Descartados: {metrics.totalDropped}
                </span>
              )}
            </>
          )}

          <button
            onClick={() => setShowAuditModal(true)}
            className="ml-1 text-[11px] text-discord-blurple hover:underline flex items-center gap-1 font-semibold"
          >
            <Activity className="w-3.5 h-3.5" />
            Auditoria ({auditLogs.length})
          </button>

          {/* Revogação Imediata */}
          {(sessionState === 'Authorized' || sessionState === 'Active') && (
            <button
              onClick={() => revokeSession('Revogação imediata solicitada pelo usuário')}
              className="ml-1 bg-discord-red/80 hover:bg-discord-red text-white px-2.5 py-0.5 rounded text-[11px] font-semibold transition shadow"
            >
              Revogar
            </button>
          )}
        </div>
      )}



      {/* Audit Modal Log */}
      {showAuditModal && (
        <div className="absolute inset-0 z-40 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#2b2d31] border border-[#3f4147] rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#3f4147] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-discord-blurple" />
                <h3 className="font-bold text-white text-sm">Registro de Auditoria de Eventos</h3>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-discord-textMuted hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Painel de Auditoria estilo Terminal/Dev */}
            <div className="p-4 flex-1 overflow-y-auto space-y-1.5 font-mono text-xs bg-[#111214]">
              {auditLogs.length === 0 ? (
                <p className="text-discord-textMuted text-center py-6">Nenhum evento auditado ainda.</p>
              ) : (
                auditLogs.map((log, idx) => {
                  const logLine = log.details?.logLine;
                  const isRejected = log.action === 'VALIDATION_FAILED' || log.details?.logLine?.includes('rejected');
                  const isDuplicate = log.action === 'DUPLICATE_EVENT_DROPPED';
                  const isStale = log.action === 'OUT_OF_ORDER_DROPPED';

                  return (
                    <div
                      key={idx}
                      className={`px-2.5 py-1.5 rounded flex items-center justify-between border ${
                        isRejected || isDuplicate || isStale
                          ? 'bg-red-950/40 border-red-900/60 text-red-300'
                          : logLine
                          ? 'bg-gray-900 border-gray-800 text-green-400'
                          : 'bg-[#1e1f22] border-[#383a40] text-gray-300'
                      }`}
                    >
                      <span className="font-bold font-mono">
                        {logLine || `[${log.action}] ${JSON.stringify(log.details || {})}`}
                      </span>
                      <span className="text-[10px] text-gray-500 shrink-0 ml-2">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
