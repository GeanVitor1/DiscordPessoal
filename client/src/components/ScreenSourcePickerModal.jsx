import {t as translate,useLocale} from '../localization';
import ProtectedImage from '../components/ProtectedImage';
import React from 'react';
import { Monitor, AppWindow, X } from 'lucide-react';

export default function ScreenSourcePickerModal({ sources, onSelect, onClose }) {
  useLocale();
  const [includeAudio, setIncludeAudio] = React.useState(true);
  // Filtra telas e janelas válidas, removendo entradas duplicadas ou sem título real
  const screens = sources.filter(s => s.id.startsWith('screen:'));
  const windows = sources.filter(s => {
    if (!s.id.startsWith('window:')) return false;
    const name = (s.name || '').trim();
    if (!name || name === 'Desktop Buddy' && !s.thumbnail) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-discord-chat text-discord-text w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-discord-sidebar flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-discord-green" />
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{translate("Compartilhar Tela")}</h2>
              <p className="text-[11px] text-discord-green font-medium">{translate("Selecione uma tela inteira ou janela aberta")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={includeAudio} onChange={event => setIncludeAudio(event.target.checked)} />{translate("Compartilhar áudio do computador")}</label>
          {/* Telas Inteiras */}
          {screens.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                <Monitor className="w-4 h-4" />{translate("Telas Inteiras")}</h3>
              <div className="grid grid-cols-2 gap-4">
                {screens.map(source => (
                  <button
                    key={source.id}
                    onClick={() => onSelect(source.id, includeAudio)}
                    className="group border border-discord-darker bg-discord-darker hover:border-discord-blurple rounded-lg p-2 text-left transition flex flex-col gap-2"
                  >
                    <div className="w-full h-32 bg-black/50 rounded overflow-hidden flex items-center justify-center relative border border-white/5">
                      {source.thumbnail ? (
                        <ProtectedImage
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                        />
                      ) : (
                        <Monitor className="w-12 h-12 text-gray-500" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-200 truncate w-full">
                      {source.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Janelas de Aplicativos */}
          {windows.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                <AppWindow className="w-4 h-4" />{translate("Janelas de Aplicativos")}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {windows.map(source => (
                  <button
                    key={source.id}
                    onClick={() => onSelect(source.id, includeAudio)}
                    className="group border border-discord-darker bg-discord-darker hover:border-discord-blurple rounded-lg p-2 text-left transition flex flex-col gap-2"
                  >
                    <div className="w-full h-24 bg-black/40 rounded overflow-hidden flex items-center justify-center relative border border-white/5">
                      {source.thumbnail ? (
                        <ProtectedImage
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                        />
                      ) : (
                        <AppWindow className="w-8 h-8 text-gray-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 w-full">
                      {source.appIcon && (
                        <ProtectedImage src={source.appIcon} alt="" className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-gray-300 truncate w-full" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-discord-darker border-t border-discord-sidebar flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:underline font-medium"
          >{translate("Cancelar")}</button>
        </div>
      </div>
    </div>
  );
}
