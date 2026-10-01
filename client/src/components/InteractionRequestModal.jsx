import React from 'react';
import { useInteraction } from '../context/InteractionContext';
import { Shield, CheckCircle, XCircle } from 'lucide-react';

export default function InteractionRequestModal() {
  const { incomingRequest, answerInteractionRequest } = useInteraction();

  if (!incomingRequest) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#2b2d31] border border-[#3f4147] p-6 rounded-2xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-discord-blurple/20 rounded-full text-discord-blurple">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Solicitação de Interação</h3>
            <p className="text-xs text-discord-textMuted">Controle compartilhado de tela em tempo real</p>
          </div>
        </div>

        <div className="bg-[#1e1f22] border border-[#383a40] rounded-xl p-4 mb-6">
          <p className="text-sm text-discord-textNormal leading-relaxed">
            O participante <strong className="text-white font-bold">{incomingRequest.fromUser?.username || 'Usuário'}</strong> está solicitando permissão para interagir (mouse/cliques) com a sua transmissão.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => answerInteractionRequest(false)}
            className="px-4 py-2.5 rounded-lg bg-[#383a40] hover:bg-[#474a51] text-white text-sm font-semibold transition flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4 text-discord-red" />
            Recusar
          </button>
          <button
            onClick={() => answerInteractionRequest(true)}
            className="px-5 py-2.5 rounded-lg bg-discord-green hover:bg-green-600 text-white text-sm font-bold flex items-center gap-2 transition shadow-lg active:scale-95"
          >
            <CheckCircle className="w-4 h-4" />
            Autorizar Interação
          </button>
        </div>
      </div>
    </div>
  );
}
