import {getPreferences} from '../preferences';
import React,{createContext,useContext,useState,useEffect,useCallback,useRef} from 'react';
import api from '../api';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
const SocialContext=createContext();
export function SocialProvider({children}) {
  const {socket,onlineUsers}=useSocket(),{currentUser}=useAuth();
  const [friends,setFriends]=useState([]),[conversations,setConversations]=useState([]),[selectedDm,setSelectedDm]=useState(null),[error,setError]=useState(''),[invitation,setInvitation]=useState(null);
  const selectedRef=useRef(selectedDm);selectedRef.current=selectedDm;
  const refresh=useCallback(async()=>{
    try {const [f,d]=await Promise.all([api.get('/api/friends'),api.get('/api/dms')]);setFriends(f.data);setConversations(d.data);}
    catch(e){setError(e.response?.data?.error || 'Não foi possível atualizar suas conversas');}
  },[]);
  useEffect(()=>{refresh();},[refresh]);
  async function act(method,url,data) {setError('');try{const r=await api[method](url,data);await refresh();return r.data;}catch(e){setError(e.response?.data?.error || 'Operação indisponível');throw e;}}
  const markRead=useCallback(async id=>{if(!document.hasFocus() || document.hidden || document.querySelector('[data-conversation-id]')?.dataset.conversationId!==id)return;try{await api.put(`/api/dms/${id}/read`);await refresh();}catch{}},[refresh]);
  const openDm=async user=>{const c=await act('post','/api/dms',{userId:user.id});setSelectedDm(c.id);window.dispatchEvent(new Event('navigate-home'));return c.id;};
  useEffect(()=>{
    if(!socket)return;
    const show=data=>{const p=getPreferences();if(p.desktopNotifications && currentUser.status!=='dnd') window.electronAPI?.notifications?.show({...data,body:p.notificationPreview?data.body:'Você recebeu uma nova notificação.'});};
    const dm=m=>{
      if(m.sender.id===currentUser.id)return;
      if(selectedRef.current===m.conversationId && document.hasFocus() && !document.hidden && document.querySelector('[data-conversation-id]')?.dataset.conversationId===m.conversationId) markRead(m.conversationId);
      else show({type:'dm',title:m.sender.username,body:m.content,route:{dmId:m.conversationId}});
    };
    const friend=d=>show({type:'friend',title:'Solicitação de amizade',body:`${d.user.username} quer adicionar você.`,route:{friends:true}});
    const call=d=>{setInvitation(d);show({type:'call',title:'Convite para chamada',body:`${d.user.username} • ${d.channel.name}`,route:{channelId:d.channel.id,serverId:d.channel.server_id}});};
    const assistance=d=>show({type:'assistance',title:'Solicitação de assistência',body:`${d.fromUser.username} solicita controle temporário.`,route:{assistance:true}});
    const chat=m=>{if(m.sender.id!==currentUser.id && !document.hasFocus() && (m.channelId===document.body.dataset.currentChannel || m.content?.includes('@'+currentUser.handle)))show({type:'chat',title:`Mensagem de ${m.sender.username}`,body:m.content,route:{channelId:m.channelId}});};
    const blocked=()=>{refresh();};
    socket.on('social_update',refresh);socket.on('users_update',refresh);socket.on('connect',refresh);socket.on('dm_message',dm);socket.on('friend_request',friend);socket.on('call_invitation',call);socket.on('interaction_request',assistance);socket.on('new_message',chat);socket.on('peer_blocked',blocked);
    const focus=()=>{if(selectedRef.current)markRead(selectedRef.current);};window.addEventListener('focus',focus);
    const cleanup=window.electronAPI?.notifications?.onOpen(route=>{
      if(route.dmId){setSelectedDm(route.dmId);window.dispatchEvent(new Event('navigate-home'));}
      else if(route.friends){setSelectedDm(null);window.dispatchEvent(new Event('navigate-home'));}
      else window.dispatchEvent(new CustomEvent('navigate-channel',{detail:route}));
    });
    return()=>{socket.off('social_update',refresh);socket.off('users_update',refresh);socket.off('connect',refresh);socket.off('dm_message',dm);socket.off('friend_request',friend);socket.off('call_invitation',call);socket.off('interaction_request',assistance);socket.off('new_message',chat);socket.off('peer_blocked',blocked);window.removeEventListener('focus',focus);cleanup?.();};
  },[socket,currentUser.id,currentUser.status,currentUser.handle,refresh,markRead]);
  useEffect(()=>{document.body.dataset.userStatus=currentUser.status;},[currentUser.status]);
  const unread=conversations.reduce((n,c)=>n+c.unread,0)+friends.filter(f=>f.state==='pending'&&f.direction==='incoming').length;
  useEffect(()=>{window.electronAPI?.notifications?.badge(unread);},[unread]);
  const presenceFriends=friends.map(f=>({...f,status:f.state==='blocked'?'offline':onlineUsers.find(u=>u.id===f.id)?.status || f.status}));
  return <SocialContext.Provider value={{friends:presenceFriends,conversations,selectedDm,setSelectedDm,openDm,act,refresh,markRead,error,setError,unread,invitation,setInvitation}}>{children}</SocialContext.Provider>;
}
export const useSocial=()=>useContext(SocialContext);
