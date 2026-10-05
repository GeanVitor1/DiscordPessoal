import React from 'react';
import { useInteraction } from '../context/InteractionContext';
import { Shield, CheckCircle, XCircle } from 'lucide-react';

export default function InteractionRequestModal() {
  const { incomingRequest, answerInteractionRequest, answering } = useInteraction();

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
            <p className="text-xs text-discord-textMuted">Controle compartilhado de tela em tempo real</p>
          </div>
        </div>

        <div className="bg-discord-darkest border border-discord-active rounded-xl p-4 mb-6">
          {incomingRequest.fromUser?.handle && <p className="text-xs text-discord-textMuted mb-2">Conta autenticada: @{incomingRequest.fromUser.handle}</p>}
          <p className="text-sm text-discord-textNormal leading-relaxed">
            O participante <strong className="text-white font-bold">{incomingRequest.fromUser?.username || 'Usuário'}</strong> {incomingRequest.assistanceMode === 'presentation' ? 'solicita interação no canvas da apresentação compartilhada.' : 'está solicitando permissão para usar mouse e teclado neste computador durante o compartilhamento.'} Você pode encerrar a sessão a qualquer momento.
          </p>
        </div>

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
            disabled={answering}
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
