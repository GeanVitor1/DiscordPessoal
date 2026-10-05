import React, { useEffect, useRef, useState } from 'react';
import { useInteraction } from '../context/InteractionContext';
import { InteractionEventType, CoordinateMapper } from '../interaction';

export default function InteractionSurface({ width = '100%', height = '100%', isInteractive = true, sourceSocketId, children }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const mapperRef = useRef(new CoordinateMapper());
  const heldKeys = useRef(new Map());
  const textRef = useRef(null);
  const composingRef = useRef(false);
  const heldButtons = useRef(new Set());
  const positionRef = useRef({ x: 0.5, y: 0.5 });
  const lastMoveRef = useRef(0);
  const [diagnostics, setDiagnostics] = useState(false);
  const { session, sessionState, isHost, assistanceMode, targetPeerSocketId, transportStatus, auditLogs, nativeDiagnostics, lastNativeAck, revokeSession, sendEvent, attachCanvas, updateSurfaceDimensions, getReceiverStats } = useInteraction();
  const canSend = isInteractive && !isHost && sourceSocketId === targetPeerSocketId && ['Authorized', 'Active'].includes(sessionState) && ['connected', 'fallback'].includes(transportStatus);
  const sendRef = useRef(sendEvent);
  const canSendRef = useRef(canSend);
  sendRef.current = sendEvent; canSendRef.current = canSend;
  useEffect(() => {
    const container = containerRef.current;
    const video = container.querySelector('video');
    const resize = () => {
      const rect = container.getBoundingClientRect();
      mapperRef.current.updateBounds(rect.width, rect.height);
      mapperRef.current.contentAspectRatio = video?.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : null;
      if (isHost && assistanceMode === 'presentation') {
        updateSurfaceDimensions(rect.width, rect.height, mapperRef.current.contentAspectRatio);
        if (canvasRef.current) { canvasRef.current.width = rect.width; canvasRef.current.height = rect.height; }
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    video?.addEventListener('loadedmetadata', resize); video?.addEventListener('resize', resize);
    const wheel = event => {
      if (!canSendRef.current || event.target.closest('button')) return;
      const { normX, normY, insideViewport } = point(event);
      if (!insideViewport) return;
      event.preventDefault();
      const factor = event.deltaMode === 0 ? .01 : event.deltaMode === 1 ? .4 : 8;
      const delta = Math.max(-12, Math.min(12, event.deltaY * factor));
      const deltaX = Math.max(-12, Math.min(12, event.deltaX * factor));
      sendRef.current(InteractionEventType.Scroll, { delta, deltaX, x: normX, y: normY });
    };
    container.addEventListener('wheel', wheel, { passive: false });
    resize();
    return () => { observer.disconnect(); video?.removeEventListener('loadedmetadata', resize); video?.removeEventListener('resize', resize); container.removeEventListener('wheel', wheel); };
  }, [isHost, assistanceMode, updateSurfaceDimensions]);
  useEffect(() => {
    if (!isHost || assistanceMode !== 'presentation') return;
    attachCanvas(canvasRef.current);
    return () => attachCanvas(null);
  }, [isHost, assistanceMode, attachCanvas]);
  const point = event => {
    const rect = containerRef.current.getBoundingClientRect();
    return mapperRef.current.mapPixelsToNormalized(event.clientX - rect.left, event.clientY - rect.top);
  };
  const pointer = (event, type) => {
    if (!canSend || event.target.closest('button, [role="dialog"]')) return;
    const { normX, normY, insideViewport } = point(event);
    if (!insideViewport && type !== InteractionEventType.PointerUp) return;
    const payload = { x: normX, y: normY };
    positionRef.current = payload;
    if (type === InteractionEventType.PointerMove) {
      if (performance.now() - lastMoveRef.current < 33) return;
      lastMoveRef.current = performance.now();
    } else {
      event.preventDefault();
      payload.button = event.button;
      if (type === InteractionEventType.PointerDown) {
        (textRef.current || containerRef.current).focus();
        // Capture may be lost during a fullscreen/DOM transition. It must not
        // prevent the validated down event from reaching the host.
        try { containerRef.current.setPointerCapture(event.pointerId); } catch { /* Release is still handled by up/cancel/blur and the native watchdog. */ }
        heldButtons.current.add(event.button);
      } else heldButtons.current.delete(event.button);
    }
    sendEvent(type, payload);
  };
  const release = () => {
    for (const [code, key] of heldKeys.current) sendRef.current(InteractionEventType.KeyReleased, { key, code });
    for (const button of heldButtons.current) sendRef.current(InteractionEventType.PointerUp, { button, ...positionRef.current });
    heldKeys.current.clear(); heldButtons.current.clear();
  };
  useEffect(() => () => release(), []);
  const key = (event, down) => {
    if (!canSend || ![containerRef.current,textRef.current].includes(event.target)) return;
    if (event.ctrlKey && event.altKey && event.key === 'Escape') { event.preventDefault(); revokeSession(); return; }
    if (event.isComposing || event.nativeEvent.isComposing || composingRef.current || event.key === 'Dead' || event.key === 'Process') return;
    const altGr=event.getModifierState?.('AltGraph') && heldKeys.current.has('AltRight');
    const textKey=event.key.length===1 && (!event.ctrlKey && !event.metaKey && !event.altKey || altGr);
    if (textKey && !heldKeys.current.has(event.code)) return;
    event.preventDefault();
    if (down) heldKeys.current.set(event.code,event.key); else heldKeys.current.delete(event.code);
    sendEvent(down ? InteractionEventType.KeyPressed : InteractionEventType.KeyReleased, { key: event.key, ...(event.code?{code:event.code}:{}) });
  };
  const inputText = event => {
    if (!canSend || composingRef.current || event.nativeEvent?.isComposing) return;
    const text=event.target.value;
    if (text) sendEvent(InteractionEventType.TextInput,{text:text.slice(0,256)});
    event.target.value='';
  };
  return <div ref={containerRef} tabIndex={canSend ? 0 : -1} onBlur={e => { if (!containerRef.current?.contains(e.relatedTarget)) release(); }}
    onPointerMove={e => pointer(e, InteractionEventType.PointerMove)} onPointerDown={e => pointer(e, InteractionEventType.PointerDown)} onPointerUp={e => pointer(e, InteractionEventType.PointerUp)} onLostPointerCapture={() => { if (heldButtons.current.size) release(); }}
    onPointerCancel={release}
    onKeyDown={e => key(e, true)} onKeyUp={e => key(e, false)} onContextMenu={e => { if (canSend) e.preventDefault(); }}
    className={`relative outline-none overflow-hidden flex items-center justify-center bg-black rounded-lg ${canSend ? 'ring-2 ring-discord-green' : ''}`} style={{ width, height, touchAction: canSend ? 'none' : 'auto' }}>
    {canSend && <textarea ref={textRef} aria-label="Teclado remoto" tabIndex={-1} autoComplete="off" autoCorrect="off" spellCheck={false} className="absolute w-px h-px opacity-0 pointer-events-none" onInput={inputText} onCompositionStart={()=>{composingRef.current=true;}} onCompositionEnd={event=>{composingRef.current=false;inputText(event);}} />}
    <div className="w-full h-full flex items-center justify-center pointer-events-none">{children}</div>
    {isHost && assistanceMode === 'presentation' && session && <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />}
    {session && <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2 bg-black/90 text-white text-xs px-3 py-2 rounded">
      <span>{sessionState === 'WaitingForConsent' ? 'Aguardando autorização' : canSend ? 'Assistência ativa • Clique na tela para interagir' : sessionState === 'Revoked' ? 'Assistência encerrada' : transportStatus === 'connecting' ? 'Conectando assistência…' : 'Assistência autorizada'}</span>
      <button onClick={() => revokeSession()} className="bg-discord-red px-2 py-1 rounded">Encerrar assistência</button>
      <button onClick={() => setDiagnostics(true)} className="text-gray-300 underline">Diagnóstico</button>
    </div>}
    {diagnostics && <div role="dialog" aria-label="Diagnóstico da assistência" className="absolute inset-0 z-40 bg-[#111214] text-white p-4 overflow-auto">
      <button onClick={() => setDiagnostics(false)} className="float-right">Fechar</button>
      <p>Transporte: {transportStatus === 'connected' ? 'DataChannel aberto' : transportStatus === 'fallback' ? 'Socket.IO' : transportStatus}</p>
      <p>ASSIST SESSION: {sessionState?.toUpperCase()} · {assistanceMode === 'desktop' ? 'Controle nativo do Windows' : 'Apresentação — sem controle do Windows'}</p>
      {assistanceMode === 'desktop' && <><p>HOST IPC: {nativeDiagnostics?.ipc || (lastNativeAck ? 'CONNECTED (ACK remoto)' : 'Aguardando confirmação')}</p><p>NATIVE HOST: {nativeDiagnostics?.nativeHost || (lastNativeAck?.success ? 'RUNNING (ACK remoto)' : 'Aguardando confirmação')}</p><p>LAST INPUT: {nativeDiagnostics?.lastInput || lastNativeAck?.eventType || '—'}</p><p>LAST NATIVE ACK: {lastNativeAck?.nativeAck || nativeDiagnostics?.lastNativeAck || '—'} · seq {lastNativeAck?.sequence ?? nativeDiagnostics?.lastSequence ?? '—'}</p></>}
      {isHost && <p>Comandos recebidos: {getReceiverStats()?.totalAccepted || 0}</p>}
      {auditLogs.map((entry, index) => <p key={index} className="text-xs font-mono mt-2">{entry.details?.logLine || entry.action}</p>)}
    </div>}
  </div>;
}
