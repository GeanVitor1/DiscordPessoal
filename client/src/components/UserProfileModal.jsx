import {t as translate,useLocale} from '../localization';
import React,{useState,useEffect} from 'react';
import {X,MessageSquare,Phone,Video,Users,Gamepad2,UserRound,PenLine} from 'lucide-react';
import {useSocial} from '../context/SocialContext';
import {useAuth} from '../context/AuthContext';
import {useDialog} from '../hooks/useDialog';
import ProfileCard from './ProfileCard';
import ProtectedImage from './ProtectedImage';
import api from '../api';
import {Modal,Action,Notice} from './FormControls';

export default function UserProfileModal({user:sourceUser,isOpen,onClose,onEditProfile}) {
  useLocale();
  const {friends,openDm,act,callUser}=useSocial(),{currentUser}=useAuth();
  const [loaded,setLoaded]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState('about');
  const loadedForSource=loaded?.id===sourceUser?.id && loaded?.serverId===sourceUser?.serverId;
  const globalUser=loadedForSource?loaded?.profile:null;
  const user=globalUser?{...globalUser,...Object.fromEntries(Object.entries(globalUser.serverProfile || {}).filter(([key,value])=>value && key!=='displayName')),displayName:globalUser.serverProfile?.displayName}:null;
  const ref=useDialog(isOpen && !!user,onClose);
  useEffect(()=>{
    if(!isOpen || !sourceUser?.id)return;
    let alive=true;const controller=new AbortController();setError('');setTab('about');setLoaded(null);
    api.get(`/api/users/${sourceUser.id}/profile`,{params:{serverId:sourceUser.serverId},signal:controller.signal}).then(r=>{if(alive)setLoaded({id:sourceUser.id,serverId:sourceUser.serverId,profile:r.data});}).catch(e=>{if(alive)setError(e.response?.data?.error || 'Perfil indisponível');});
    return()=>{alive=false;controller.abort();};
  },[isOpen,sourceUser?.id,sourceUser?.serverId]);
  async function run(fn){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e.response?.data?.error || 'Não foi possível concluir a ação. Tente novamente.');}finally{setBusy(false);}}
  if(!isOpen || !sourceUser)return null;
  if(!user)return <Modal title={sourceUser.username || translate('Perfil')} onClose={onClose}><Notice error={error} message={!error?translate('Carregando perfil…'):null}/>{sourceUser.handle && sourceUser.id!==currentUser.id && <Action disabled={busy} onClick={()=>run(()=>openDm(sourceUser).then(onClose))}>{translate('Mensagem')}</Action>}</Modal>;
  const own=user.id===currentUser.id;
  const friend=friends.some(f=>f.id===user.id && f.state==='accepted');
  return <div className="dialog-backdrop">
    <section ref={ref} className="profile-shell" role="dialog" aria-modal="true" aria-label={translate('Perfil de')+' '+user.username}>
      <button type="button" className="dialog-close" aria-label={translate('Fechar perfil')} onClick={onClose}><X size={19}/></button>
      <ProfileCard user={user}>
        <div className="profile-actions">
          {own ? onEditProfile && <button type="button" className="primary" onClick={onEditProfile}><PenLine size={16}/>{translate('Editar perfil')}</button> : <>
            <button type="button" className="primary" disabled={busy} onClick={()=>run(async()=>{if(friend){await openDm(user);onClose();}else await act('post','/api/friends/requests',{handle:user.handle});})}><MessageSquare size={16}/>{translate(friend?'Mensagem':'Adicionar amigo')}</button>
            <button type="button" disabled={busy} title={translate('Chamada de áudio')} aria-label={translate('Chamada de áudio')} onClick={()=>run(()=>callUser(user).then(onClose))}><Phone size={16}/></button>
            <button type="button" disabled={busy} title={translate('Chamada de vídeo')} aria-label={translate('Chamada de vídeo')} onClick={()=>run(()=>callUser(user,true).then(onClose))}><Video size={16}/></button>
          </>}
        </div>
        {error && <p role="alert" className="text-discord-red text-xs mt-3">{error}</p>}
      </ProfileCard>
      <div className="profile-details">
        <div className="profile-tabs" role="tablist" aria-label={translate('Informações do perfil')}>{[['about','Sobre'],['activity','Atividade'],['mutual','Em comum']].map(([id,label])=><button type="button" key={id} role="tab" id={`profile-tab-${id}`} aria-controls="profile-tab-panel" aria-selected={tab===id} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['about','activity','mutual'];const next=e.key==='Home'?0:e.key==='End'?2:(tabs.indexOf(id)+(e.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);document.getElementById(`profile-tab-${tabs[next]}`)?.focus();}}>{translate(label)}</button>)}</div>
        <div id="profile-tab-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
          {tab==='about' && <><h3 className="profile-section-title">{translate('Um pouco mais sobre')} {user.displayName || user.username}</h3><p className="profile-section-detail">{translate('Conheça a pessoa por trás das conversas.')}</p><div className="profile-detail-card"><h4>{translate('Sobre mim')}</h4><p className="whitespace-pre-wrap">{user.bio || translate('Este usuário ainda não adicionou uma biografia.')}</p></div><div className="profile-detail-card"><h4>{translate('Agora')}</h4>{user.activity?<p className="flex items-center gap-2"><Gamepad2 size={18}/>{user.activity}</p>:<div className="profile-empty"><UserRound size={24}/><span>{user.customStatus || translate('Nenhuma atividade compartilhada no momento.')}</span></div>}</div><p className="profile-section-detail">{translate('As informações exibidas respeitam as configurações de privacidade deste perfil.')}</p></>}
          {tab==='activity' && <><h3 className="profile-section-title">{translate('Atividade')}</h3><p className="profile-section-detail">{translate('Veja o que está acontecendo agora.')}</p>{user.activity?<div className="profile-detail-card"><Gamepad2 className="text-discord-blurple mb-4" size={30}/><h4>{user.activity}</h4>{user.activityStarted && <p>{translate('Em atividade há')} {Math.max(0,Math.floor((Date.now()-Date.parse(user.activityStarted))/60000))} min</p>}</div>:<div className="profile-empty"><Gamepad2 size={28}/><span>{translate('Nenhuma atividade compartilhada no momento.')}</span></div>}</>}
          {tab==='mutual' && <><h3 className="profile-section-title">{translate('Vocês têm em comum')}</h3><p className="profile-section-detail">{translate('Amizades e comunidades que conectam vocês.')}</p><div className="profile-detail-card"><h4>{translate('Amigos em comum (')}{user.mutualFriends?.length || 0})</h4>{user.mutualFriends?.length?user.mutualFriends.map(f=><div className="profile-mutual-row" key={f.id}><ProtectedImage src={f.avatar} alt={f.username}/><span>{f.username}</span></div>):<div className="profile-empty"><Users size={24}/><span>{translate('Nenhum amigo em comum ainda.')}</span></div>}</div><div className="profile-detail-card"><h4>{translate('Servidores em comum (')}{user.mutualServers?.length || 0})</h4>{user.mutualServers?.length?user.mutualServers.map(s=><div className="profile-mutual-row" key={s.id}><span>{s.icon || '✦'}</span><span>{s.name}</span></div>):<div className="profile-empty"><Users size={24}/><span>{translate('Nenhum servidor em comum ainda.')}</span></div>}</div></>}
        </div>
        {!own && <button type="button" disabled={busy} className="profile-block" onClick={()=>run(()=>act('put',`/api/blocks/${user.id}`).then(onClose))}>{translate('Bloquear')}</button>}
      </div>
    </section>
  </div>;
}
