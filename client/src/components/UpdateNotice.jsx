import React from 'react';
import { useUpdates } from '../hooks/useUpdates';
export default function UpdateNotice() {
  const state = useUpdates();
  if (!['available', 'downloading', 'ready'].includes(state.status)) return null;
  return <aside role="status" className="fixed bottom-5 right-5 z-[100] max-w-sm rounded-xl bg-discord-sidebar border border-discord-blurple shadow-xl p-4 text-white">
    <strong>{state.status === 'ready' ? `Atualização ${state.version} pronta` : `Atualizando para ${state.version || 'a nova versão'}…`}</strong>
    <p className="text-sm text-discord-textMuted mt-2">{state.status === 'ready' ? 'Será instalada automaticamente quando você fechar o aplicativo.' : `Baixando em segundo plano (${state.percent || 0}%).`}</p>
    {state.status === 'ready' && <button onClick={() => window.electronAPI.restartAndInstallUpdate()} className="bg-discord-blurple rounded px-3 py-2 mt-3 text-sm">Reiniciar e atualizar</button>}
  </aside>;
}
