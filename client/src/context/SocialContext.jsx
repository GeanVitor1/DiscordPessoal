import {notificationAllowed,isMention,unreadCount} from '../notifications';
import {getPreferences} from '../preferences';
import React,{createContext,useContext,useState,useEffect,useCallback,useRef} from 'react';
import api from '../api';
import {createCoalescedTask} from '../coalesced-task';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import {useVoice} from './VoiceContext';
import {playSound} from '../utils/sounds';
const SocialContext=createContext();
export function SocialProvider({children}) {
  const {socket,onlineUsers}=useSocket(),{currentUser}=useAuth();
  const voice=useVoice(),voiceRef=useRef(voice);voiceRef.current=voice;
  const[incomingCall,setIncomingCall]=useState(null),[activeCall,setActiveCall]=useState(null);const activeRef=useRef(null);activeRef.current=activeCall;
  const [friends,setFriends]=useState([]),[conversations,setConversations]=useState([]),[selectedDm,setSelectedDm]=useState(null),[error,setError]=useState(''),[invitation,setInvitation]=useState(null);
  const[notificationSettings,setNotificationSettings]=useState({}),[channelUnreads,setChannelUnreads]=useState([]);const notificationRef=useRef({});notificationRef.current=notificationSettings;
  const selectedRef=useRef(selectedDm);selectedRef.current=selectedDm;
  const refresh=React.useMemo(()=>createCoalescedTask(async()=>{
    try {const [f,d]=await Promise.all([api.get('/api/friends'),api.get('/api/dms')]);setFriends(f.data);setConversations(d.data);setSelectedDm(old=>old && !d.data.some(c=>c.id===old)?null:old);}
    catch(e){setError(e.response?.data?.error || 'Não foi possível atualizar suas conversas');}
  }),[]);
  useEffect(()=>{refresh();const load=()=>api.get('/api/settings').then(r=>setNotificationSettings(r.data)).catch(()=>{});load();window.addEventListener('social-settings-changed',load);return()=>window.removeEventListener('social-settings-changed',load);},[refresh]);
  useEffect(()=>{if(!socket)return;const load=()=>api.get('/api/notifications/unread').then(r=>setChannelUnreads(r.data)).catch(()=>{});load();socket.on('new_message',load);socket.on('social_update',load);socket.on('server_updated',load);socket.on('connect',load);return()=>{socket.off('new_message',load);socket.off('social_update',load);socket.off('server_updated',load);socket.off('connect',load);};},[socket]);
  async function act(method,url,data) {setError('');try{const r=await api[method](url,data);await refresh();return r.data;}catch(e){setError(e.response?.data?.error || 'Operação indisponível');throw e;}}
  const markRead=useCallback(async id=>{if(!document.hasFocus() || document.hidden || document.querySelector('[data-conversation-id]')?.dataset.conversationId!==id)return;try{await api.put(`/api/dms/${id}/read`);await refresh();}catch{}},[refresh]);
  const openDm=async user=>{const c=await act('post','/api/dms',{userId:user.id});setSelectedDm(c.id);window.dispatchEvent(new Event('navigate-home'));return c.id;};
  const startCall=async(conversationId,video=false)=>{try{setError('');const r=await api.post(`/api/dms/${conversationId}/calls`,{video});if(!await voiceRef.current.joinVoice(r.data.channel)){await api.post(`/api/calls/${r.data.id}/end`);return;}setActiveCall({...r.data,video});setSelectedDm(conversationId);window.dispatchEvent(new Event('navigate-home'));if(video){await new Promise(resolve=>setTimeout(resolve,0));if(!voiceRef.current.isCameraOn)await voiceRef.current.toggleCamera();}}catch(e){setError(e.response?.data?.error || 'Não foi possível iniciar a chamada');throw e;}};
  const callUser=async(user,video=false)=>{const r=await api.post(`/api/users/${user.id}/call-conversation`);await refresh();await startCall(r.data.id,video);};
  const respondCall=async action=>{if(!incomingCall)return;try{const r=await api.post(`/api/calls/${incomingCall.id}/respond`,{action});if(action==='accept'){await refresh();if(!await voiceRef.current.joinVoice(r.data.channel))throw Error('Não foi possível entrar na chamada');setActiveCall({...r.data.call,video:incomingCall.video});setSelectedDm(incomingCall.conversation_id);window.dispatchEvent(new Event('navigate-home'));if(incomingCall.video){await new Promise(resolve=>setTimeout(resolve,0));if(!voiceRef.current.isCameraOn)await voiceRef.current.toggleCamera();}}setIncomingCall(null);}catch(e){setError(e.response?.data?.error || e.message);}};
  const endCall=async()=>{if(activeRef.current){try{await api.post(`/api/calls/${activeRef.current.id}/end`);}catch(e){setError(e.response?.data?.error || 'Não foi possível confirmar o encerramento');}}voiceRef.current.leaveVoice();setActiveCall(null);};
  useEffect(()=>{if(!socket)return;const invite=d=>{refresh();if(d.initiator_id===currentUser.id)return;setIncomingCall(d);const p=getPreferences();if(p.desktopNotifications && document.body.dataset.userStatus!=='dnd')window.electronAPI?.notifications?.show({type:'call',title:'Chamada recebida',body:`${d.caller?.username || 'Um amigo'} está chamando.`,route:{dmId:d.conversation_id}});},updated=d=>{if(activeRef.current?.id===d.id)setActiveCall(old=>({...old,...d}));},ended=d=>{setIncomingCall(old=>old?.id===d.id?null:old);if(voiceRef.current.currentVoiceChannel?.callId===d.id)voiceRef.current.leaveVoice();if(activeRef.current?.id===d.id)setActiveCall(null);refresh();};socket.on('private_call_invitation',invite);socket.on('private_call_updated',updated);socket.on('private_call_ended',ended);return()=>{socket.off('private_call_invitation',invite);socket.off('private_call_updated',updated);socket.off('private_call_ended',ended);};},[socket,currentUser.id,refresh]);
  useEffect(()=>{const type=incomingCall?'call_incoming':activeCall?.state==='ringing'?'call_outgoing':null;if(!type)return;playSound(type);const timer=setInterval(()=>playSound(type),3000);return()=>clearInterval(timer);},[incomingCall?.id,activeCall?.id,activeCall?.state]);
  useEffect(()=>{
    if(!socket)return;
    const show=data=>{const p=getPreferences();if(p.desktopNotifications && currentUser.status!=='dnd') window.electronAPI?.notifications?.show({...data,body:p.notificationPreview?data.body:'Você recebeu uma nova notificação.'});};
    const dm=m=>{
      if(m.sender.id===currentUser.id)return;
      if(selectedRef.current===m.conversationId && document.hasFocus() && !document.hidden && document.querySelector('[data-conversation-id]')?.dataset.conversationId===m.conversationId) markRead(m.conversationId);
      else if(notificationAllowed(notificationRef.current)){playSound(isMention(m.content,currentUser)?'mention':'message');show({type:'dm',title:m.sender.username,body:m.content,route:{dmId:m.conversationId}});}
    };
    const friend=d=>show({type:'friend',title:'Solicitação de amizade',body:`${d.user.username} quer adicionar você.`,route:{friends:true}});
    const call=d=>{setInvitation(d);show({type:'call',title:'Convite para chamada',body:`${d.user.username} • ${d.channel.name}`,route:{channelId:d.channel.id,serverId:d.channel.server_id}});};
    const assistance=d=>show({type:'assistance',title:'Solicitação de assistência',body:`${d.fromUser.username} solicita controle temporário.`,route:{assistance:true}});
    const chat=m=>{if(m.sender.id===currentUser.id || currentUser.status==='dnd')return;const mention=m.mentioned===true || isMention(m.content,currentUser),route={channelId:m.channelId,serverId:m.serverId};if(!notificationAllowed(notificationRef.current,route,mention))return;playSound(mention?'mention':'message');if(m.channelId!==document.body.dataset.currentChannel || !document.hasFocus()){show({type:'chat',title:`Mensagem de ${m.sender.username}`,body:m.content,route});}};
    const accepted=d=>show({type:'friend',title:'Amizade aceita',body:`${d.user?.username || 'Um amigo'} aceitou seu pedido.`,route:{friends:true}});
    const reminder=d=>show({type:'chat',title:'Evento em breve',body:d.name,route:{serverId:d.serverId,channelId:d.channelId}});socket.on('friend_accepted',accepted);socket.on('event_reminder',reminder);
    const blocked=()=>{refresh();};
    socket.on('social_update',refresh);socket.on('users_update',refresh);socket.on('connect',refresh);socket.on('dm_message',dm);socket.on('friend_request',friend);socket.on('call_invitation',call);socket.on('interaction_request',assistance);socket.on('assistance_request',assistance);socket.on('new_message',chat);socket.on('peer_blocked',blocked);
    const focus=()=>{if(selectedRef.current)markRead(selectedRef.current);};window.addEventListener('focus',focus);
    const cleanup=window.electronAPI?.notifications?.onOpen(route=>{
      if(route.dmId){setSelectedDm(route.dmId);window.dispatchEvent(new Event('navigate-home'));}
      else if(route.friends){setSelectedDm(null);window.dispatchEvent(new Event('navigate-home'));}
      else window.dispatchEvent(new CustomEvent('navigate-channel',{detail:route}));
    });
    return()=>{socket.off('friend_accepted',accepted);socket.off('event_reminder',reminder);socket.off('social_update',refresh);socket.off('users_update',refresh);socket.off('connect',refresh);socket.off('dm_message',dm);socket.off('friend_request',friend);socket.off('call_invitation',call);socket.off('interaction_request',assistance);socket.off('assistance_request',assistance);socket.off('new_message',chat);socket.off('peer_blocked',blocked);window.removeEventListener('focus',focus);cleanup?.();};
  },[socket,currentUser.id,currentUser.status,currentUser.handle,refresh,markRead]);
  useEffect(()=>{document.body.dataset.userStatus=currentUser.status;},[currentUser.status]);
  const directUnread=conversations.reduce((n,c)=>n+c.unread,0)+friends.filter(f=>f.state==='pending'&&f.direction==='incoming').length;
  const unread=directUnread+channelUnreads.reduce((n,c)=>n+unreadCount(notificationSettings,c),0);
  useEffect(()=>{window.electronAPI?.notifications?.badge(unread);},[unread]);
  const presenceFriends=friends.map(f=>({...f,status:f.state==='blocked'?'offline':onlineUsers.find(u=>u.id===f.id)?.status || f.status}));
  return <SocialContext.Provider value={{channelUnreads,notificationSettings,friends:presenceFriends,conversations,selectedDm,setSelectedDm,openDm,act,refresh,markRead,error,setError,directUnread,unread,invitation,setInvitation,incomingCall,activeCall,startCall,callUser,respondCall,endCall}}>{children}</SocialContext.Provider>;
}
export const useSocial=()=>useContext(SocialContext);
