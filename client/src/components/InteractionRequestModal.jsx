import React from 'react';
import { useInteraction } from '../context/InteractionContext';
import { Shield, CheckCircle, XCircle } from 'lucide-react';

export default function InteractionRequestModal() {
  const { incomingRequest, answerInteractionRequest, answering, displays, selectedDisplayId, setSelectedDisplayId } = useInteraction();

  if (!incomingRequest) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-discord-darker border border-discord-active p-6 rounded-2xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-discord-blurple/20 rounded-full text-discord-blurple">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Solicitação de assistência</h3>
            <p className="text-xs text-discord-textMuted">Autorização temporária de mouse e teclado</p>
          </div>
        </div>

        <div className="bg-discord-darkest border border-discord-active rounded-xl p-4 mb-6">
          {incomingRequest.fromUser?.handle && <p className="text-xs text-discord-textMuted mb-2">Conta autenticada: @{incomingRequest.fromUser.handle}</p>}
          <p className="text-sm text-discord-textNormal leading-relaxed">
            O participante <strong className="text-white font-bold">{incomingRequest.fromUser?.username || 'Usuário'}</strong> {incomingRequest.assistanceMode === 'presentation' ? 'solicita interação no canvas da apresentação compartilhada.' : 'solicita uma sessão própria para visualizar esta tela e controlar realmente mouse e teclado deste computador. Parar o compartilhamento não encerra a assistência.'} Você pode encerrar a sessão a qualquer momento.
          </p>
        </div>

        {incomingRequest.assistanceMode === 'desktop' && displays && <label className="block text-white text-sm mb-4">Tela autorizada para assistência
          <select aria-label="Tela da assistência" value={selectedDisplayId} disabled={answering} onChange={e=>setSelectedDisplayId(e.target.value)} className="block w-full mt-2 bg-discord-darkest p-2 rounded">
            {displays.map(d=><option key={d.id} value={String(d.id)}>Tela {d.index+1} · {d.bounds.width} × {d.bounds.height}{d.isPrimary?' · Principal':''}</option>)}
          </select>
        </label>}

        <div className="flex items-center justify-end gap-3">
          <button
            disabled={answering}
            onClick={() => answerInteractionRequest(false)}
            className="px-4 py-2.5 rounded-lg bg-discord-active hover:bg-[#474a51] text-white text-sm font-semibold transition flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4 text-discord-red" />
            Recusar
          </button>
          <button
            disabled={answering || (displays && !selectedDisplayId)}
            onClick={() => answerInteractionRequest(true)}
            className="px-5 py-2.5 rounded-lg bg-discord-green hover:bg-green-600 text-white text-sm font-bold flex items-center gap-2 transition shadow-lg active:scale-95"
          >
            <CheckCircle className="w-4 h-4" />
            Autorizar assistência
          </button>
        </div>
      </div>
    </div>
  );
}
