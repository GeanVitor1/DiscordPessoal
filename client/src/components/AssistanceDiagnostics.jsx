import {t as translate,useLocale} from '../localization';
import React from 'react';
import { useInteraction } from '../context/InteractionContext';

export default function AssistanceDiagnostics({onClose}) {
  useLocale();
  const {sessionState,transportStatus,nativeDiagnostics,lastNativeAck,isHost,getReceiverStats,auditLogs}=useInteraction();
  return <div role="dialog" aria-label={translate("Diagnóstico da assistência")} className="absolute inset-0 z-50 bg-[#111214] text-white p-4 overflow-auto text-sm">
    <button onClick={onClose} className="float-right px-3 py-1 rounded bg-discord-active">{translate("Fechar")}</button>
    <p>{translate("Transporte:")} {transportStatus==='connected'?'DataChannel aberto':transportStatus==='fallback'?'Socket.IO':transportStatus}</p>
    <p>ASSIST SESSION: {sessionState?.toUpperCase()} {translate("· Controle nativo do Windows")}</p>
    <p>HOST IPC: {nativeDiagnostics?.ipc || (lastNativeAck?'CONNECTED (ACK remoto)':'Aguardando confirmação')}</p>
    <p>NATIVE HOST: {nativeDiagnostics?.nativeHost || (lastNativeAck?.success?'RUNNING (ACK remoto)':'Aguardando confirmação')}</p>
    <p>LAST INPUT: {nativeDiagnostics?.lastInput || lastNativeAck?.eventType || '—'}</p>
    <p>LAST NATIVE ACK: {lastNativeAck?.nativeAck || nativeDiagnostics?.lastNativeAck || '—'} · seq {lastNativeAck?.sequence ?? nativeDiagnostics?.lastSequence ?? '—'}</p>
    <p>{translate("ÚLTIMO ERRO:")} {nativeDiagnostics?.lastError || lastNativeAck?.code || '—'}</p>
    {(nativeDiagnostics?.lastErrorDetail || lastNativeAck?.detail) && <p>{translate("Detalhe do Windows:")} {nativeDiagnostics?.lastErrorDetail || lastNativeAck.detail}</p>}
    <p>{translate("PERMISSÃO:")} {nativeDiagnostics?.privilege==='ADMINISTRATOR'?translate("Administrador"):nativeDiagnostics?.privilege==='STANDARD'?translate("Padrão"):'Computador remoto'}</p>
    {isHost && <p>{translate("Comandos recebidos:")} {getReceiverStats()?.totalAccepted || 0}</p>}
    {auditLogs.map((entry,index)=><p key={index} className="text-xs font-mono mt-2">{entry.details?.logLine || entry.action}</p>)}
  </div>;
}
