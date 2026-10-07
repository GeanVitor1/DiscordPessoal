import {t as translate,useLocale} from '../localization';
import React, { useEffect, useRef, useState } from 'react';
import { useInteraction } from '../context/InteractionContext';
import InteractionSurface from './InteractionSurface';
import AssistanceDiagnostics from './AssistanceDiagnostics';

export default function AssistancePanel() {
  useLocale();
  const { session,sessionState,isHost,assistanceMode,assistanceStream,assistanceDisplay,targetPeerSocketId,interactionError,lastNativeAck,transportStatus,revokeSession,sendEvent,clipboardText,setClipboardText }=useInteraction();
  const video=useRef(null);
  const panel=useRef(null);
  const [expanded,setExpanded]=useState(true);
  const [fullscreen,setFullscreen]=useState(false);
  const [diagnostics,setDiagnostics]=useState(false);
  const [fullscreenError,setFullscreenError]=useState(null);
  useEffect(()=>{
    const changed=()=>setFullscreen(document.fullscreenElement===panel.current);
    document.addEventListener('fullscreenchange',changed);
    return()=>document.removeEventListener('fullscreenchange',changed);
  },[]);
  useEffect(()=>{if(!session){setExpanded(true);setDiagnostics(false);setFullscreenError(null);if(document.fullscreenElement===panel.current && panel.current)document.exitFullscreen().catch(()=>{});}},[session]);
  const toggleFullscreen=async()=>{try{setFullscreenError(null);if(document.fullscreenElement===panel.current)await document.exitFullscreen();else await panel.current.requestFullscreen();}catch{setExpanded(true);setFullscreenError('Não foi possível abrir tela cheia. A visualização ampliada continua disponível.');}};
  useEffect(()=>{
    const element=video.current;if(!element)return;
    element.srcObject=assistanceStream || null;
    if(assistanceStream)element.play().catch(()=>{});
    return()=>{element.srcObject=null;};
  },[assistanceStream,isHost,session]);
  if(assistanceMode !== 'desktop' || !session)return null;
  const large=!isHost && (expanded || fullscreen);
  const status=sessionState==='WaitingForConsent'?'Aguardando autorização':interactionError?'Controle pausado':transportStatus==='connecting'?'Conectando assistência…':lastNativeAck?.success?'Controle confirmado pelo Windows':'Assistência autorizada';
  return <aside ref={panel} aria-label={translate("Sessão de assistência remota")} data-layout={large?'expanded':isHost?'host':'compact'} className="fixed z-40 flex flex-col bg-discord-darker border border-discord-active shadow-2xl rounded-xl overflow-hidden" style={large?{inset:fullscreen?0:12}:{bottom:16,right:16,width:isHost?460:'min(56vw,900px)',maxWidth:'calc(100vw - 32px)'}}>
    <header className="px-4 py-3 text-white flex flex-wrap items-center gap-3 shrink-0 border-b border-discord-active">
      <p className="font-semibold flex-1">{isHost?'Você autorizou assistência neste computador':'Assistência remota'}{assistanceDisplay ? ` · Tela ${assistanceDisplay.id}`:''}</p>
      {!isHost && <><button onClick={()=>setExpanded(value=>!value)} disabled={fullscreen} className="px-3 py-1 bg-discord-active rounded">{expanded?'Reduzir janela':'Ampliar janela'}</button><button onClick={toggleFullscreen} className="px-3 py-1 bg-discord-active rounded">{fullscreen?'Sair de tela cheia':translate("Tela cheia")}</button></>}
    </header>
    {interactionError && <p role="alert" className="px-4 py-2 bg-yellow-900 text-yellow-100 text-sm">{interactionError}</p>}
    {fullscreenError && <p role="alert" className="px-4 py-2 text-yellow-100">{fullscreenError}</p>}
    {!isHost && <div className={large?'flex-1 min-h-0':'h-[42vh]'}>
      <InteractionSurface sourceSocketId={targetPeerSocketId} showControls={false}>
        <video ref={video} data-testid="assistance-video" autoPlay playsInline muted className="w-full h-full object-contain" />
      </InteractionSurface>
    </div>}
    {!isHost && session.clipboard && <div className="p-3 text-sm space-y-2"><label>{translate("Texto para transferência")}<textarea aria-label={translate("Texto da área de transferência remota")} maxLength={16000} value={clipboardText} onChange={e=>setClipboardText(e.target.value)} className="block w-full bg-discord-darkest rounded p-2"/></label><button className="mr-3" onClick={()=>sendEvent('ClipboardRead',{})}>{translate("Ler texto do computador remoto")}</button><button className="mr-3" onClick={()=>sendEvent('ClipboardWrite',{text:clipboardText})}>{translate("Enviar texto ao computador remoto")}</button><button onClick={()=>navigator.clipboard.writeText(clipboardText).catch(()=>setFullscreenError('Não foi possível copiar o texto.'))}>{translate("Copiar texto recebido")}</button></div>}
    <footer className="flex flex-wrap gap-3 items-center text-white text-sm px-4 py-3 shrink-0 border-t border-discord-active">
      <span className="flex-1">{status}{!isHost && !interactionError && lastNativeAck?.success?' · Clique na imagem para usar mouse e teclado':''}</span>
      <button onClick={()=>setDiagnostics(true)} className="underline">{translate("Diagnóstico")}</button>
      <button onClick={()=>revokeSession()} className="bg-discord-red px-3 py-2 rounded">{translate("Encerrar assistência")}</button>
    </footer>
    {diagnostics && <AssistanceDiagnostics onClose={()=>setDiagnostics(false)} />}
  </aside>;
}
