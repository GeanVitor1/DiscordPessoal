import React from 'react';
import {CalendarDays, Link2, ExternalLink} from 'lucide-react';
import ProtectedImage, {useProtectedSource} from './ProtectedImage';
import {t} from '../localization';

const labels = {online:'Disponível', idle:'Ausente', dnd:'Não perturbe', offline:'Offline'};
export default function ProfileCard({user, preview=false, children}) {
  const banner = useProtectedSource(user.banner);
  return <article className="profile-identity" style={{'--profile-accent':user.bannerColor || '#5865f2'}}>
    <div className="profile-cover" style={{backgroundImage:banner ? `url(${banner})` : undefined}} />
    <div className="profile-identity-body">
      <div className="profile-avatar-wrap"><ProtectedImage src={user.avatar} alt={user.username || 'Perfil'} loading="eager" className="profile-avatar"/><span className={`presence-dot presence-${user.status || 'offline'}`} title={t(labels[user.status || 'offline'])}/></div>
      <h3 className="profile-name">{user.displayName || user.username || t('Seu nome')}</h3>
      <p className="profile-handle">@{user.handle || user.username || 'usuario'}{user.pronouns ? ` · ${user.pronouns}` : ''}</p>
      {user.customStatus && <p className="profile-status">{user.statusEmoji || '💬'} {user.customStatus}</p>}
      {children}
      <section className="profile-bio"><h4>{t('Sobre mim')}</h4><p>{user.bio || (preview ? t('Conte um pouco sobre você. Sua biografia aparece aqui.') : t('Este usuário ainda não adicionou uma biografia.'))}</p></section>
      {!preview && user.createdAt && <div className="profile-membership"><CalendarDays size={16}/><span>{t('Membro desde')}<b>{new Date(user.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</b></span></div>}
      {!!user.connections?.length && <section className="profile-connections"><h4>{t('Conexões')}</h4>{user.connections.map(c=><a key={`${c.name}-${c.url}`} href={c.url} target="_blank" rel="noopener noreferrer"><Link2 size={17}/><span>{c.name}</span><ExternalLink size={14}/></a>)}</section>}
    </div>
  </article>;
}
