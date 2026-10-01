import React from 'react';
import { Monitor, AppWindow, X } from 'lucide-react';

export default function ScreenSourcePickerModal({ sources, onSelect, onClose }) {
  const screens = sources.filter(s => s.id.startsWith('screen:'));
  const windows = sources.filter(s => s.id.startsWith('window:'));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#313338] text-discord-text w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#232428] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-discord-green" />
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Compartilhar Tela</h2>
              <p className="text-[11px] text-discord-green font-medium">Transmissão com áudio do sistema ativada</p>
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
          {/* Telas Inteiras */}
          {screens.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Telas Inteiras
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {screens.map(source => (
                  <button
                    key={source.id}
                    onClick={() => onSelect(source.id)}
                    className="group border border-[#2b2d31] bg-[#2b2d31] hover:border-discord-blurple rounded-lg p-2 text-left transition flex flex-col gap-2"
                  >
                    <div className="w-full h-32 bg-black rounded overflow-hidden flex items-center justify-center relative">
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
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
                <AppWindow className="w-4 h-4" />
                Janelas de Aplicativos
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {windows.map(source => (
                  <button
                    key={source.id}
                    onClick={() => onSelect(source.id)}
                    className="group border border-[#2b2d31] bg-[#2b2d31] hover:border-discord-blurple rounded-lg p-2 text-left transition flex flex-col gap-2"
                  >
                    <div className="w-full h-24 bg-black rounded overflow-hidden flex items-center justify-center relative">
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 w-full">
                      {source.appIcon && (
                        <img src={source.appIcon} alt="" className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-gray-300 truncate w-full">
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
        <div className="p-4 bg-[#2b2d31] border-t border-[#232428] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:underline font-medium"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
