import React from 'react';
import { useInteraction } from '../context/InteractionContext';

export default function AssistanceDiagnostics({onClose}) {
  const {sessionState,transportStatus,nativeDiagnostics,lastNativeAck,isHost,getReceiverStats,auditLogs}=useInteraction();
  return <div role="dialog" aria-label="Diagnóstico da assistência" className="absolute inset-0 z-50 bg-[#111214] text-white p-4 overflow-auto text-sm">
    <button onClick={onClose} className="float-right px-3 py-1 rounded bg-discord-active">Fechar</button>
    <p>Transporte: {transportStatus==='connected'?'DataChannel aberto':transportStatus==='fallback'?'Socket.IO':transportStatus}</p>
    <p>ASSIST SESSION: {sessionState?.toUpperCase()} · Controle nativo do Windows</p>
    <p>HOST IPC: {nativeDiagnostics?.ipc || (lastNativeAck?'CONNECTED (ACK remoto)':'Aguardando confirmação')}</p>
    <p>NATIVE HOST: {nativeDiagnostics?.nativeHost || (lastNativeAck?.success?'RUNNING (ACK remoto)':'Aguardando confirmação')}</p>
    <p>LAST INPUT: {nativeDiagnostics?.lastInput || lastNativeAck?.eventType || '—'}</p>
    <p>LAST NATIVE ACK: {lastNativeAck?.nativeAck || nativeDiagnostics?.lastNativeAck || '—'} · seq {lastNativeAck?.sequence ?? nativeDiagnostics?.lastSequence ?? '—'}</p>
    <p>ÚLTIMO ERRO: {nativeDiagnostics?.lastError || lastNativeAck?.code || '—'}</p>
    {(nativeDiagnostics?.lastErrorDetail || lastNativeAck?.detail) && <p>Detalhe do Windows: {nativeDiagnostics?.lastErrorDetail || lastNativeAck.detail}</p>}
    <p>PERMISSÃO: {nativeDiagnostics?.privilege==='ADMINISTRATOR'?'Administrador':nativeDiagnostics?.privilege==='STANDARD'?'Padrão':'Computador remoto'}</p>
    {isHost && <p>Comandos recebidos: {getReceiverStats()?.totalAccepted || 0}</p>}
    {auditLogs.map((entry,index)=><p key={index} className="text-xs font-mono mt-2">{entry.details?.logLine || entry.action}</p>)}
  </div>;
}
