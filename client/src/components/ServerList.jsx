import React, { useState } from 'react';
import { Plus, Compass, MessageSquare } from 'lucide-react';

export default function ServerList({ servers, currentServer, onSelectServer, onCreateServer }) {
  const [showModal, setShowModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerIcon, setNewServerIcon] = useState('🎮');

  const icons = ['🎮', '🚀', '🔥', '⚡', '🎧', '👾', '💻', '🔮', '🍕'];

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newServerName.trim()) return;
    onCreateServer(newServerName, newServerIcon);
    setNewServerName('');
    setShowModal(false);
  };

  return (
    <aside className="w-[72px] bg-discord-darkest flex flex-col items-center py-3 gap-2 shrink-0 select-none z-20">
      {/* Botão Home / Discord Direct Messages */}
      <div className="relative group flex items-center justify-center w-full">
        {/* Marcador pill lateral esquerdo */}
        <div
          className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
            currentServer === null ? 'h-10' : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'
          }`}
        />
        <button
          onClick={() => onSelectServer(null)}
          title="Mensagens Diretas"
          className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 ${
            currentServer === null
              ? 'bg-discord-blurple text-white rounded-[16px]'
              : 'bg-discord-darker hover:bg-discord-blurple text-discord-textNormal hover:text-white'
          }`}
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      </div>

      <div className="w-8 h-[2px] bg-[#35363c] rounded my-1" />

      {/* Lista de Servidores */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto overflow-x-hidden scrollbar-none">
        {servers.map((server) => {
          const isSelected = currentServer?.id === server.id;
          return (
            <div key={server.id} className="relative group flex items-center justify-center w-full">
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isSelected ? 'h-10' : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'
                }`}
              />
              <button
                onClick={() => onSelectServer(server)}
                title={server.name}
                className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center text-xl font-bold transition-all duration-200 shadow-md ${
                  isSelected
                    ? 'bg-discord-blurple text-white rounded-[16px]'
                    : 'bg-discord-darker hover:bg-discord-blurple text-discord-textNormal hover:text-white'
                }`}
              >
                {server.icon || server.name.substring(0, 2).toUpperCase()}
              </button>
            </div>
          );
        })}

        {/* Adicionar Servidor */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={() => setShowModal(true)}
            title="Criar um Servidor"
            className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-discord-darker hover:bg-discord-green text-discord-green hover:text-white flex items-center justify-center transition-all duration-200 group"
          >
            <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* Modal Criar Servidor */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-discord-darker w-full max-w-md rounded-lg p-6 shadow-2xl border border-[#3f4147]">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Crie seu servidor</h2>
            <p className="text-discord-textMuted text-sm text-center mb-6">
              Seu servidor é onde você e seus amigos se reúnem. Crie o seu e comece a conversar.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">
                  Ícone do Servidor
                </label>
                <div className="flex gap-2 flex-wrap mb-4">
                  {icons.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setNewServerIcon(emoji)}
                      className={`text-2xl w-10 h-10 rounded-lg flex items-center justify-center transition ${
                        newServerIcon === emoji ? 'bg-discord-blurple scale-110' : 'bg-discord-chat hover:bg-discord-hover'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <label className="text-xs font-bold text-discord-textMuted uppercase tracking-wider block mb-2">
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sala dos Amigos"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="w-full bg-discord-darkest text-discord-textHeader px-3 py-2.5 rounded focus:outline-none focus:ring-2 focus:ring-discord-blurple text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-discord-chat">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-white hover:underline font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm bg-discord-blurple hover:bg-discord-blurple-hover text-white rounded font-medium transition"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
