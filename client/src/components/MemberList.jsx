import ProtectedImage from '../components/ProtectedImage';
import React from 'react';
import { useSocket } from '../context/SocketContext';

export default function MemberList({ onOpenProfile }) {
  const { onlineUsers } = useSocket();

  const statusColors = {
    online: 'bg-discord-green',
    idle: 'bg-discord-yellow',
    dnd: 'bg-discord-red',
    offline: 'bg-gray-500'
  };

  const statusLabels = {
    online: 'Disponível',
    idle: 'Ausente',
    dnd: 'Não Perturbe',
    offline: 'Offline'
  };

  const onlineList = onlineUsers.filter((u) => u.status !== 'offline');
  const offlineList = onlineUsers.filter((u) => u.status === 'offline');

  return (
    <aside className="w-60 bg-discord-darker flex flex-col shrink-0 select-none border-l border-discord-darkest overflow-y-auto px-4 py-6">
      {/* Categoria Online */}
      <div className="mb-4">
        <h3 className="text-xs font-bold text-discord-textMuted uppercase tracking-wider mb-2">
          Disponível — {onlineList.length}
        </h3>
        <div className="space-y-1">
          {onlineList.map((user) => (
            <div
              key={user.socketId || user.id}
              onClick={() => onOpenProfile && onOpenProfile(user)}
              className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-discord-hover cursor-pointer group transition"
              title="Ver perfil de usuário"
            >
              <div className="relative shrink-0">
                <ProtectedImage
                  src={user.avatar}
                  alt={user.username}
                  className="w-8 h-8 rounded-full bg-discord-darkest object-cover"
                />
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-discord-darker ${
                    statusColors[user.status || 'online']
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-discord-textHeader truncate group-hover:text-white">
                  {user.username}
                </p>
                {user.customStatus && (
                  <p className="text-[11px] text-discord-textMuted truncate">
                    {user.customStatus}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categoria Offline */}
      {offlineList.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-discord-textMuted uppercase tracking-wider mb-2">
            Offline — {offlineList.length}
          </h3>
          <div className="space-y-1 opacity-60">
            {offlineList.map((user) => (
              <div
                key={user.socketId || user.id}
                onClick={() => onOpenProfile && onOpenProfile(user)}
                className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-discord-hover cursor-pointer"
                title="Ver perfil de usuário"
              >
                <div className="relative shrink-0">
                  <ProtectedImage
                    src={user.avatar}
                    alt={user.username}
                    className="w-8 h-8 rounded-full bg-discord-darkest grayscale object-cover"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-discord-darker bg-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-discord-textMuted truncate">
                    {user.username}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
