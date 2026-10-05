import {MessageActions,MessageEdit,DeleteMessageDialog,useMessageChanges} from './MessageTools';
import {InviteCard} from './ServerInvites';
import {getPreferences} from '../preferences';
import React,{useState,useEffect,useRef} from 'react';
import { Users,MessageCircle,Check,X,UserPlus,Phone,Shield } from 'lucide-react';
import { useSocial } from '../context/SocialContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import api from '../api';
import ProtectedImage from './ProtectedImage';
export function DirectMessageList() {
  const {conversations,selectedDm,setSelectedDm,unread}=useSocial();
  return <div className="p-3 space-y-1 overflow-auto"><button onClick={()=>setSelectedDm(null)} className={`w-full flex items-center gap-3 p-3 rounded ${!selectedDm?'bg-discord-active text-white':'text-discord-textMuted'}`}><Users size={20}/>Amigos{unread>0&&<span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2">{unread}</span>}</button><p className="text-xs font-bold text-discord-textMuted pt-5 pb-2">MENSAGENS DIRETAS</p>{conversations.map(c=><button key={c.id} data-testid={`dm-open-${c.user.handle}`} onClick={()=>setSelectedDm(c.id)} className={`w-full p-2 rounded flex items-center gap-2 hover:bg-discord-hover ${selectedDm===c.id?'bg-discord-active text-white':'text-discord-textMuted'}`}><Avatar user={c.user}/><span className="truncate">{c.user.username}</span>{c.unread>0&&<b className="ml-auto rounded-full px-2 text-xs bg-red-500 text-white">{c.unread}</b>}</button>)}</div>;
}
function Avatar({user}) {return user.avatar?<ProtectedImage src={user.avatar} alt="" className="w-9 h-9 rounded-full"/>:<span className="w-9 h-9 rounded-full bg-discord-blurple text-white flex items-center justify-center shrink-0">{Array.from(user.username || '?')[0].toUpperCase()}</span>;}
export default function FriendsHome() {
  const {friends,selectedDm,conversations,setSelectedDm,openDm,act,error,setError,invitation,setInvitation}=useSocial();
  const {socket}=useSocket(),{currentVoiceChannel}=useVoice();
  const [tab,setTab]=useState('Online'),[handle,setHandle]=useState(''),[success,setSuccess]=useState('');
  const dm=conversations.find(c=>c.id===selectedDm);
  const filtered=friends.filter(f=>tab==='Todos'?f.state==='accepted':tab==='Online'?f.state==='accepted' && f.status!=='offline':tab==='Pendentes'?f.state==='pending':tab==='Bloqueados'?f.state==='blocked':false);
  const run=fn=>Promise.resolve().then(fn).catch(()=>{});
  function invite(f) {if(!currentVoiceChannel){setError('Entre em um canal de voz antes de convidar.');return;}socket?.timeout(10000).emit('call_invite',{userId:f.id,channelId:currentVoiceChannel.id},(e,r)=>{if(e || r?.error)setError(r?.error || 'Convite não entregue');else setSuccess(`Convite enviado para ${f.username}`);});}
  return <section className="flex-1 min-w-0 flex flex-col bg-discord-chat text-discord-textNormal">
    {invitation&&<div className="px-5 py-3 bg-discord-blurple/30 flex gap-3 items-center"><Phone size={18}/><span>{invitation.user.username} convidou você para {invitation.channel.name}</span><button className="ml-auto bg-discord-blurple px-3 py-1 rounded" onClick={()=>{window.dispatchEvent(new CustomEvent('navigate-channel',{detail:{channelId:invitation.channel.id,serverId:invitation.channel.server_id,join:true}}));setInvitation(null);}}>Entrar</button><button onClick={()=>setInvitation(null)}><X size={18}/></button></div>}
    {selectedDm?<><header className="h-12 border-b border-black/20 flex items-center px-5 gap-3"><MessageCircle size={20}/><b>{dm?.user.username || 'Conversa privada'}</b><button className="ml-auto text-sm text-discord-textMuted" onClick={()=>setSelectedDm(null)}>Amigos</button></header><DmChat key={selectedDm} id={selectedDm} conversation={dm}/></>:<>
      <header className="h-14 border-b border-black/20 flex items-center px-5 gap-3 shrink-0 overflow-x-auto whitespace-nowrap"><Users size={22}/><b>Amigos</b><span className="h-6 border-r border-white/10"/>{['Online','Todos','Pendentes','Bloqueados','Adicionar amigo'].map(t=><button key={t} data-testid={`friends-tab-${t}`} onClick={()=>{setTab(t);setError('');setSuccess('');}} className={`text-sm px-2 py-1 rounded ${t==='Adicionar amigo'?'bg-[#248046] text-white':tab===t?'bg-discord-active text-white':'text-discord-textMuted'}`}>{t}{t==='Pendentes'&&friends.some(f=>f.state==='pending')?` (${friends.filter(f=>f.state==='pending').length})`:''}</button>)}</header>
      <div className="p-6 flex-1 overflow-auto">{tab==='Adicionar amigo'?<form onSubmit={e=>{e.preventDefault();run(async()=>{await act('post','/api/friends/requests',{handle});setSuccess('Solicitação enviada');setHandle('');});}}><h2 className="font-bold text-white">ADICIONAR AMIGO</h2><p className="text-sm text-discord-textMuted mt-2 mb-4">Digite o nome de usuário da conta.</p><div className="flex gap-3 bg-discord-darkest border border-white/10 p-3 rounded-lg"><input data-testid="friend-handle" required value={handle} onChange={e=>setHandle(e.target.value)} placeholder="nome.de.usuario" className="flex-1 min-w-0 bg-transparent outline-none"/><button data-testid="friend-send" className="bg-discord-blurple rounded px-4 py-2 text-sm text-white">Enviar solicitação</button></div></form>:<><h2 className="text-xs font-bold text-discord-textMuted uppercase mb-4">{tab} — {filtered.length}</h2>{filtered.length===0?<div className="text-center text-discord-textMuted py-24"><Users size={48} className="mx-auto mb-5 opacity-40"/><p>{tab==='Online'?'Nenhum amigo online agora. Adicione alguém para começar.':'Nada por aqui ainda.'}</p></div>:filtered.map(f=><div key={f.id} data-testid={`friend-${f.handle}`} className="border-t border-white/10 flex items-center gap-3 py-4 hover:bg-white/5 rounded px-2"><Avatar user={f}/><div><div className="font-semibold text-white">{f.username}<span className="ml-2 text-xs font-normal text-discord-textMuted">@{f.handle}</span></div><p className="text-xs text-discord-textMuted">{f.state==='pending'?(f.direction==='incoming'?'Solicitação recebida':'Solicitação enviada'):f.state==='blocked'?'Bloqueado':{online:'Disponível',idle:'Ausente',dnd:'Não perturbe',offline:'Offline'}[f.status]}</p></div><div className="ml-auto flex gap-2">
        {f.state==='accepted'&&<><button title="Abrir conversa" data-testid={`friend-dm-${f.handle}`} onClick={()=>run(()=>openDm(f))} className="p-2 bg-discord-darker rounded-full"><MessageCircle size={20}/></button><button title="Convidar para chamada" onClick={()=>invite(f)} className="p-2 bg-discord-darker rounded-full"><Phone size={20}/></button><button title="Bloquear" onClick={()=>run(()=>act('put',`/api/blocks/${f.id}`))} className="p-2 bg-discord-darker rounded-full"><Shield size={20}/></button></>}
        {f.state==='pending'&&f.direction==='incoming'&&<button title="Aceitar" data-testid={`friend-accept-${f.handle}`} onClick={()=>run(()=>act('put',`/api/friends/${f.id}/accept`))} className="p-2 bg-discord-darker text-green-400 rounded-full"><Check size={20}/></button>}
        <button title={f.state==='blocked'?'Desbloquear':f.state==='accepted'?'Remover amigo':'Recusar / cancelar'} onClick={()=>run(()=>act('delete',f.state==='blocked'?`/api/blocks/${f.id}`:`/api/friends/${f.id}`))} className="p-2 bg-discord-darker rounded-full text-red-300"><X size={20}/></button>
      </div></div>)}</>}{error&&<p role="alert" className="text-red-300 text-sm mt-4">{error}</p>}{success&&<p role="status" className="text-green-300 text-sm mt-4">{success}</p>}</div>
    </>}
  </section>;
}
function DmChat({id,conversation}) {
  const {socket}=useSocket(),{currentUser}=useAuth(),{markRead}=useSocial();
  const [messages,setMessages]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false),[loading,setLoading]=useState(true);
  const end=useRef(null),composer=useRef(null),lastMessage=useRef(null),historyCursor=useRef(null);
  const [hasOlder,setHasOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false);
  const [replyTo,setReplyTo]=useState(null),[editing,setEditing]=useState(null),[deleting,setDeleting]=useState(null);
  useMessageChanges('dms',id,setMessages);
  useEffect(()=>{
    let alive=true;
    // Register before fetching; merge history with events instead of overwriting a new arrival.
    const receive=m=>{if(m.conversationId===id){setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);markRead(id);}};
    socket?.on('dm_message',receive);
    api.get(`/api/dms/${id}/messages`).then(({data})=>{if(alive){setHasOlder(data.length===100);historyCursor.current=data[0]?.id;setMessages(prev=>{const map=new Map([...data,...prev].map(x=>[x.id,x]));return [...map.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));});}}).catch(e=>{if(alive)setError(e.response?.data?.error || 'Histórico indisponível');}).finally(()=>{if(alive){setLoading(false);markRead(id);}});
    return()=>{alive=false;socket?.off('dm_message',receive);};
  },[id,socket,markRead]);
  useEffect(()=>{const last=messages.at(-1)?.id;if(last && last!==lastMessage.current)end.current?.scrollIntoView({block:'end'});lastMessage.current=last;},[messages]);
  async function jump(messageId){try{if(!messages.some(m=>m.id===messageId)){const {data}=await api.get(`/api/dms/${id}/messages/${messageId}`);setMessages(prev=>[...prev,data].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)));}setTimeout(()=>document.getElementById(`dm-message-${messageId}`)?.scrollIntoView({behavior:getPreferences().reduceMotion?'instant':'smooth',block:'center'}),50);}catch(e){setError(e.response?.data?.error || 'Mensagem indisponível');}}
  async function older(){setLoadingOlder(true);try{const {data}=await api.get(`/api/dms/${id}/messages`,{params:{before:historyCursor.current}});setHasOlder(data.length===100);if(data.length)historyCursor.current=data[0].id;setMessages(prev=>[...new Map([...data,...prev].map(m=>[m.id,m])).values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)));}catch(e){setError(e.response?.data?.error || 'Histórico indisponível');}finally{setLoadingOlder(false);}}
  function send(e) {
    e.preventDefault();if(!text.trim() || sending || !socket?.connected)return;
    setSending(true);setError('');socket.timeout(10000).emit('dm_send',{conversationId:id,content:text,replyTo:replyTo?.id},(e,r)=>{setSending(false);if(e || r?.error)setError(r?.error || 'Envio não confirmado. Confira o histórico antes de tentar novamente.');else{setText('');setReplyTo(null);markRead(id);}});
  }
  return <>
    <div data-conversation-id={id} className="message-list flex-1 overflow-y-auto p-6 flex flex-col gap-2">
      <div className="mb-8"><h1 className="text-3xl font-bold text-discord-textHeader">{conversation?.user.username}</h1><p className="text-discord-textMuted mt-2">Este é o início da conversa privada de vocês.</p></div>
      {loading&&<p>Carregando histórico…</p>}
      {hasOlder&&<button type="button" disabled={loadingOlder} onClick={older} className="text-discord-blurple text-sm">{loadingOlder?'Carregando…':'Carregar mensagens anteriores'}</button>}
      {messages.map(m=><div key={m.id} id={`dm-message-${m.id}`} data-testid="dm-message" className="message-row group flex gap-3 py-2 hover:bg-discord-hover rounded">
        <Avatar user={m.sender}/><div className="min-w-0 flex-1">
          {m.reply&&<button type="button" className="text-xs text-discord-textMuted block truncate max-w-full mb-1" onClick={()=>jump(m.reply.id)}>↪ {m.reply.username}: {m.reply.content || 'Anexo'}</button>}
          <span className="font-semibold text-discord-textHeader">{m.sender.id===currentUser.id?currentUser.username:m.sender.username}</span><time className="ml-2 text-xs text-discord-textMuted">{new Date(m.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time>
          {m.deletedAt?<p className="text-xs italic text-discord-textMuted">Mensagem excluída</p>:editing?.id===m.id?<MessageEdit kind="dms" contextId={id} message={m} setMessages={setMessages} onClose={()=>setEditing(null)} onError={setError}/>:<p className="message-content break-words select-text">{m.content}{m.editedAt&&<span className="text-[10px] text-discord-textMuted ml-2">(editada)</span>}</p>}
          {!m.deletedAt&&m.inviteCode&&<InviteCard code={m.inviteCode}/>}
        </div>
        <MessageActions message={m} own={m.sender.id===currentUser.id} onReply={()=>{setReplyTo(m);composer.current?.focus();}} onEdit={()=>setEditing(m)} onDelete={()=>setDeleting(m)}/>
      </div>)}<div ref={end}/>
    </div>
    {deleting&&<DeleteMessageDialog kind="dms" contextId={id} message={deleting} setMessages={setMessages} onClose={()=>setDeleting(null)} onError={setError}/>}
    <form onSubmit={send} className="p-5 pt-0">
      {error&&<p role="alert" className="text-discord-red mb-2 text-sm">{error}</p>}
      {replyTo&&<div className="flex gap-3 justify-between bg-discord-darker p-3 rounded-t text-xs"><span className="truncate">Respondendo a <b>{replyTo.sender.username}</b>: {replyTo.content}</span><button type="button" onClick={()=>setReplyTo(null)}>Cancelar resposta</button></div>}
      <div className="flex gap-3 p-3 rounded-lg bg-discord-active"><input ref={composer} data-testid="dm-input" aria-label="Mensagem privada" maxLength={4000} disabled={conversation?.blocked || sending} value={text} onKeyDown={e=>{if(e.key==='Escape')setReplyTo(null);}} onChange={e=>setText(e.target.value)} placeholder={conversation?.blocked?'Conversa bloqueada':`Conversar com @${conversation?.user.username || 'amigo'}`} className="flex-1 min-w-0 bg-transparent outline-none"/><button data-testid="dm-send" disabled={sending || !text.trim() || !socket?.connected || conversation?.blocked} className="px-4 py-1 rounded bg-discord-blurple text-white disabled:opacity-40">Enviar</button></div>
    </form>
  </>;
}
