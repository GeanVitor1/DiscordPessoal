import React, { useEffect, useRef } from 'react';
import { useInteraction } from '../context/InteractionContext';
import InteractionSurface from './InteractionSurface';

export default function AssistancePanel() {
  const { session,isHost,assistanceMode,assistanceStream,assistanceDisplay,targetPeerSocketId,interactionError }=useInteraction();
  const video=useRef(null);
  useEffect(()=>{
    const element=video.current;if(!element)return;
    element.srcObject=assistanceStream || null;
    if(assistanceStream)element.play().catch(()=>{});
    return()=>{element.srcObject=null;};
  },[assistanceStream,isHost,session]);
  if(assistanceMode !== 'desktop' || !session)return null;
  return <aside aria-label="Sessão de assistência remota" className="fixed bottom-4 right-4 z-40 bg-discord-darker border border-discord-active shadow-2xl rounded-xl overflow-hidden" style={{width:isHost?480:'min(56vw, 900px)',maxWidth:'calc(100vw - 32px)'}}>
    <p className="px-4 py-2 text-white font-semibold">{isHost?'Este computador está em assistência':'Assistência remota'}{assistanceDisplay ? ` · Tela ${assistanceDisplay.id}`:''}</p>
    {interactionError && <p role="alert" className="px-4 py-2 bg-yellow-900 text-yellow-100 text-sm">{interactionError}</p>}
    <InteractionSurface sourceSocketId={targetPeerSocketId} height={isHost?100:'auto'}>
      {!isHost && <video ref={video} data-testid="assistance-video" autoPlay playsInline muted className="w-full object-contain" style={{height:'42vh'}} />}
    </InteractionSurface>
  </aside>;
}
