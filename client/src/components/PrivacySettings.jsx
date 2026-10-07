import {t as translate,useLocale} from '../localization';
import React,{useState,useEffect} from 'react';
import api from '../api';
import ActivitySettings from './ActivitySettings';
import NotificationSettings from './NotificationSettings';
import {Field,Action,Notice,Toggle} from './FormControls';
import ServerProfileSettings from './ServerProfileSettings';
export default function PrivacySettings(){
  useLocale();
  const [settings,setSettings]=useState(null),[servers,setServers]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{Promise.all([api.get('/api/settings'),api.get('/api/servers')]).then(([s,g])=>{setSettings(s.data);setServers(g.data);}).catch(e=>setError(e.response?.data?.error || 'Não foi possível carregar a privacidade'));},[]);
  const change=(key,value)=>setSettings(s=>({...s,[key]:value}));
  if(!settings)return <Notice error={error} message="Carregando…"/>;
  const labels={profileVisibility:'Quem pode ver seu perfil completo',activityVisibility:'Quem pode ver sua atividade',dmPolicy:'Quem pode enviar mensagens privadas',callPolicy:'Quem pode chamar'};
  return <div className="space-y-5"><h3 className="font-bold text-lg">{translate("Privacidade e pedidos de amizade")}</h3><fieldset className="space-y-2"><legend>{translate("Permitir pedidos de")}</legend>{[['everyone','Todos'],['friendsOfFriends','Amigos de amigos'],['sharedServers','Membros de servidores em comum']].map(([key,label])=><Toggle key={key} label={translate(label)} checked={settings.friendRequests[key]} onChange={v=>change('friendRequests',{...settings.friendRequests,[key]:v})}/>)}<p className="text-xs text-discord-textMuted">{translate("Desative todas as opções para não receber pedidos.")}</p></fieldset>{Object.entries(labels).map(([key,label])=><label key={key} className="block text-sm">{translate(label)}<select value={settings[key]} onChange={e=>change(key,e.target.value)} className="block mt-2 p-3 rounded bg-discord-darkest w-full">{[['everyone','Todos'],['shared','Amigos e servidores em comum'],['friends','Somente amigos'],['none','Ninguém']].map(([v,t])=><option key={v} value={v}>{translate(t)}</option>)}</select></label>)}<Toggle label={translate("Mostrar atividade de jogos/programas")} checked={settings.allowActivity} onChange={v=>change('allowActivity',v)}/><fieldset><legend className="text-sm mb-2">{translate("Bloquear DMs de membros destes servidores")}</legend>{servers.map(s=><Toggle key={s.id} label={s.name} checked={settings.blockedDmServers.includes(s.id)} onChange={v=>change('blockedDmServers',v?[...settings.blockedDmServers,s.id]:settings.blockedDmServers.filter(id=>id!==s.id))}/>)}</fieldset><p className="text-sm text-discord-textMuted">{translate("Usuários bloqueados são gerenciados em Amigos → Bloqueados.")}</p><Action onClick={async()=>{try{const r=await api.put('/api/settings',settings);setSettings(r.data);window.dispatchEvent(new Event('social-settings-changed'));setMessage('Privacidade salva.');setError('');}catch(e){setError(e.response?.data?.error || 'Falha ao salvar');}}}>{translate("Salvar privacidade")}</Action><Notice error={error} message={message}/><NotificationSettings/><ActivitySettings/></div>;
}
export function ProfileDetails(){
  useLocale();
  const {currentUser,updateProfile}=useAuth();
  const [pronouns,setPronouns]=useState(currentUser.pronouns || ''),[statusEmoji,setEmoji]=useState(currentUser.statusEmoji || '');
  const localDate=value=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const [expiry,setExpiry]=useState(localDate(currentUser.statusExpires)),[connections,setConnections]=useState(currentUser.connections || []),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
  const changeLink=(index,key,value)=>setConnections(old=>old.map((c,i)=>i===index?{...c,[key]:value}:c));
  async function save(e){
    e.preventDefault();if(saving)return;setSaving(true);setError('');setMessage('');
    try{
      const links=connections.filter(c=>c.name.trim() || c.url.trim()).map(c=>({name:c.name.trim(),url:c.url.trim()}));
      for(const c of links){let u;try{u=new URL(c.url);}catch{throw Error('Use um link HTTPS válido em cada conexão.');}if(!c.name || u.protocol!=='https:' || u.username || u.password)throw Error('Informe um nome e um link HTTPS válido para cada conexão.');}
      await api.put('/api/profile/details',{pronouns,statusEmoji,statusExpires:expiry?new Date(expiry).toISOString():null,connections:links,activity:currentUser.activity});
      await updateProfile({});setConnections(links);setMessage('Informações salvas.');
    }catch(e){setError(e.response?.data?.error || e.message);}finally{setSaving(false);}
  }
  return <div className="space-y-6"><form onSubmit={save} className="space-y-5"><section className="profile-detail-card space-y-4"><h3 className="font-semibold">{translate('Mais informações do perfil')}</h3><p className="text-xs text-discord-textMuted">{translate('Pequenos detalhes ajudam seus amigos a conhecer você.')}</p><Field label={translate('Pronomes')} placeholder={translate('Como você prefere ser chamado')} maxLength={128} value={pronouns} onChange={e=>setPronouns(e.target.value)}/><Field label={translate('Emoji do status')} placeholder="✨" maxLength={32} value={statusEmoji} onChange={e=>setEmoji(e.target.value)}/><Field label={translate('Expiração do status (vazio: sem expiração)')} type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></section>
    <section className="profile-detail-card space-y-4"><h3 className="font-semibold">{translate('Contas conectadas')}</h3><p className="text-xs text-discord-textMuted">{translate('Mostre onde mais seus amigos podem encontrar você. Use o nome da conta e o endereço completo.')}</p>{connections.map((c,i)=><div key={i} className="connection-editor"><Field label={translate('Nome da conexão')+' '+(i+1)} required maxLength={80} placeholder="GitHub, YouTube…" value={c.name} onChange={e=>changeLink(i,'name',e.target.value)}/><Field label={translate('Link da conexão')+' '+(i+1)} required type="url" maxLength={2000} placeholder="https://" value={c.url} onChange={e=>changeLink(i,'url',e.target.value)}/><button type="button" className="text-discord-red text-xs" aria-label={translate('Remover conexão')+' '+(i+1)} onClick={()=>setConnections(old=>old.filter((_,j)=>j!==i))}>{translate('Remover')}</button></div>)}<button type="button" disabled={connections.length>=20} className="gallery-toggle" onClick={()=>setConnections(old=>[...old,{name:'',url:''}])}>{translate('+ Adicionar conexão')}</button></section>
    <Action type="submit" disabled={saving}>{translate(saving?'Salvando…':'Salvar informações')}</Action><Notice error={error} message={message}/></form><section className="profile-detail-card"><ServerProfileSettings/></section></div>;
}
import {useAuth} from '../context/AuthContext';
