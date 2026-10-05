import { useSocial } from '../context/SocialContext';
import { useAuth } from '../context/AuthContext';
import ProtectedImage, { useProtectedSource } from '../components/ProtectedImage';
import React from 'react';
import { X, MessageSquare, Shield, Sparkles, Calendar, Volume2 } from 'lucide-react';

export default function UserProfileModal({ user, isOpen, onClose }) {
  const { friends, openDm, act } = useSocial();
  const { currentUser } = useAuth();
  const [actionError, setActionError] = React.useState('');
  const resolvedBanner=useProtectedSource(user?.banner);
  if (!isOpen || !user) return null;

  const statusColors = {
    online: 'bg-discord-green ring-discord-sidebar',
    idle: 'bg-discord-yellow ring-discord-sidebar',
    dnd: 'bg-discord-red ring-discord-sidebar',
    offline: 'bg-gray-500 ring-discord-sidebar'
  };

  const statusLabels = {
    online: 'Disponível',
    idle: 'Ausente',
    dnd: 'Não Perturbe',
    offline: 'Offline'
  };

  const bannerBg = resolvedBanner
    ? `url(${resolvedBanner})`
    : undefined;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      {/* Container Principal estilo Card Perfil Discord Nitro */}
      <div className="bg-discord-sidebar w-full max-w-[380px] rounded-2xl shadow-2xl overflow-hidden border border-discord-active relative flex flex-col">
        {/* Botão Fechar Flutuante */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/80 transition"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Banner com Altura Aumentada e visual cinematográfico */}
        <div
          className="h-44 w-full bg-cover bg-center relative transition-all duration-300"
          style={{
            backgroundColor: user.bannerColor || '#5865F2',
            backgroundImage: bannerBg
          }}
        >
          {/* Gradiente suave no rodapé do banner */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#232428] via-transparent to-black/20" />
          
          {user.banner && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-discord-blurple" />
              Banner Animado
            </div>
          )}
        </div>

        {/* Corpo do Perfil */}
        <div className="px-5 pb-5 relative -mt-16 z-20 flex flex-col">
          {/* Avatar com Borda e Status */}
          <div className="relative inline-block mb-3 w-fit">
            <ProtectedImage
              src={user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=user'}
              alt={user.username}
              className="w-24 h-24 rounded-full border-[6px] border-discord-sidebar bg-discord-darkest object-cover shadow-2xl"
            />
            <span
              className={`absolute bottom-2 right-2 w-5 h-5 rounded-full ring-4 ${statusColors[user.status || 'online']}`}
              title={statusLabels[user.status || 'online']}
            />
          </div>

          {/* Nome, Tag e Distintivos */}
          <div className="bg-[#111214] p-4 rounded-xl border border-discord-darker space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white leading-tight truncate">
                  {user.username}
                </h3>
                <span className="text-[11px] bg-discord-blurple/20 text-discord-blurple font-bold px-2 py-0.5 rounded">
                  MEMBRO
                </span>
              </div>
              <p className="text-xs text-discord-textMuted mt-0.5">
                #{user.discriminator || '1000'}
              </p>
            </div>

            {user.id !== currentUser.id && user.handle && <div className="flex gap-2">
              <button className="bg-discord-blurple px-3 py-2 rounded text-sm text-white" onClick={async()=>{try{setActionError('');if(friends.some(f=>f.id===user.id && f.state==='accepted')){await openDm(user);onClose();}else await act('post','/api/friends/requests',{handle:user.handle});}catch(e){setActionError(e.response?.data?.error || 'Operacao indisponivel');}}}>{friends.some(f=>f.id===user.id && f.state==='accepted')?'Mensagem':'Adicionar amigo'}</button>
              <span className="text-xs text-discord-textMuted self-center">@{user.handle}</span>
            </div>}
            {actionError && <p className="text-red-300 text-xs" role="alert">{actionError}</p>}
            {/* Status Customizado (se houver) */}
            {user.customStatus && (
              <div className="bg-discord-darkest p-2.5 rounded-lg border border-discord-darker flex items-center gap-2 text-xs text-discord-textNormal">
                <span className="text-sm">💬</span>
                <span className="truncate">{user.customStatus}</span>
              </div>
            )}

            <div className="h-[1px] bg-discord-darker" />

            {/* Seção Sobre Mim */}
            <div>
              <h4 className="text-[11px] font-bold text-discord-textMuted uppercase tracking-wider mb-1.5">
                Sobre Mim
              </h4>
              <p className="text-xs text-discord-textNormal whitespace-pre-wrap leading-relaxed">
                {user.bio || 'Este usuário ainda não adicionou uma biografia.'}
              </p>
            </div>

            <div className="h-[1px] bg-discord-darker" />

            {/* Informações de Membro */}
            <div className="space-y-1.5 text-xs text-discord-textMuted">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-discord-textMuted" />
                <span>Membro no Discord Clone</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-discord-green" />
                <span>Perfil de membro</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
