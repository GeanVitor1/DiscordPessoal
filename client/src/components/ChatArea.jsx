import {t as translate,useLocale} from '../localization';
import MessageComposer from './MessageComposer';
import {watchMessageNavigation} from '../message-navigation';
import { MessageActions,MessageEdit,DeleteMessageDialog,useMessageChanges } from './MessageTools';
import RichMessage,{Attachment} from './RichMessage';
import {useMessageFeatures,ConversationToolbar,MessageReactions} from './ConversationFeatures';
import MediaPicker,{VoiceRecorder} from './MediaPicker';
import {getPreferences} from '../preferences';
import ProtectedImage, { downloadAttachment } from '../components/ProtectedImage';
import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Send,
  PlusCircle,
  Smile,
  Paperclip,
  X,
  AlertCircle,
  Monitor
} from 'lucide-react';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useVoice } from '../context/VoiceContext';
import { API_BASE_URL, attachmentUrl } from '../config';

export default function ChatArea({ server, channel, onOpenProfile, onSwitchToVoice }) {
  useLocale();
  const { currentUser } = useAuth();
  const { socket, typingUsers, voiceRooms } = useSocket();
  const { currentVoiceChannel, activeScreenSharer, isWatchingScreen, startWatchingScreen, isScreenSharing } = useVoice();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing,setEditing]=useState(null),[deleting,setDeleting]=useState(null);
  const [query,setQuery]=useState(''),[results,setResults]=useState(null),[searching,setSearching]=useState(false);
  const [hasOlder,setHasOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false);
  const [mediaPicker,setMediaPicker]=useState(false);
  const manualUnread=useRef(false);
  const tools=useMessageFeatures('channels',channel?.id,jump);
  useEffect(()=>watchMessageNavigation('channels',channel?.id,jump),[channel?.id]);
  useEffect(()=>{manualUnread.current=false;const unread=e=>{if(e.detail.kind==='channels'&&e.detail.id===channel?.id)manualUnread.current=true;};window.addEventListener('manual-unread',unread);const mark=()=>{if(!manualUnread.current && channel?.id && document.hasFocus() && !document.hidden)axios.put(`/api/conversation/channels/${channel.id}/unread`,{unread:false}).catch(()=>{});};mark();window.addEventListener('focus',mark);const timer=setInterval(mark,5000);return()=>{clearInterval(timer);window.removeEventListener('focus',mark);window.removeEventListener('manual-unread',unread);};},[channel?.id]);
  const composerRef=useRef(null),lastMessage=useRef(null),channelRef=useRef(channel?.id);
  channelRef.current=channel?.id;
  const historyCursor=useRef(null);
  useMessageChanges('channels',channel?.id,setMessages);
  useEffect(()=>{setEditing(null);setDeleting(null);setResults(null);setQuery('');setInputText('');setSelectedFile(null);setUploadError('');},[channel?.id]);
  async function find(e){e.preventDefault();if(!query.trim())return;setSearching(true);setUploadError('');const id=channel.id;try{const {data}=await axios.get(`/api/channels/${id}/search`,{params:{q:query}});if(channelRef.current===id)setResults(data);}catch(e){setUploadError(e.response?.data?.error || 'Busca indisponível');}finally{setSearching(false);}}
  async function jump(id,route){if(route?.kind==='threads'){window.dispatchEvent(new CustomEvent('open-thread',{detail:{channelId:channel.id,threadId:route.contextId,messageId:id}}));return;}
    const contextId=channel.id;
    try {if(!messages.some(m=>m.id===id)){const {data}=await axios.get(`/api/channels/${contextId}/messages/${id}`);if(channelRef.current!==contextId)return;setMessages(prev=>[...prev,data].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)));}
      setResults(null);setTimeout(()=>document.getElementById(`message-${id}`)?.scrollIntoView({behavior:getPreferences().reduceMotion?'instant':'smooth',block:'center'}),50);
    }catch(e){setUploadError(e.response?.data?.error || 'Mensagem indisponível');}
  }
  async function older(){setLoadingOlder(true);const id=channel.id;try{const {data}=await axios.get(`/api/channels/${id}/messages`,{params:{before:historyCursor.current}});if(channelRef.current!==id)return;setHasOlder(data.length===100);if(data.length)historyCursor.current=data[0].id;setMessages(prev=>[...new Map([...data,...prev].map(m=>[m.id,m])).values()]);}catch(e){setUploadError(e.response?.data?.error || 'Histórico indisponível');}finally{setLoadingOlder(false);}}
  function reply(msg){setReplyTo(msg);composerRef.current?.focus();}


  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pickerRef = useRef(null);

  // Categorias de Emojis do Discord
  const emojiCategories = [
    {
      category: 'Populares',
      items: ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '👀', '💯', '✨', '💀', '🤖', '🎮', '🍕']
    },
    {
      category: 'Expressões',
      items: ['😎', '😍', '🥳', '🤔', '😭', '🤯', '😴', '🙄', '🥺', '🤐', '😇', '😈', '🤡', '👻']
    },
    {
      category: 'Gestos & Ícones',
      items: ['👋', '🙌', '🤝', '✌️', '💪', '🎯', '⚡', '⭐', '🌈', '💎', '🛡️', '⚔️', '🎵', '🕹️']
    }
  ];

  // Fecha o seletor ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carrega histórico de mensagens do canal atual
  useEffect(() => {
    if (!channel || channel.type !== 'text') return;
    let cancelled = false;
    setMessages([]);
    setReplyTo(null);
    axios.get(`${API_BASE_URL}/api/channels/${channel.id}/messages`)
      .then((res) => {
        if (!cancelled) { setHasOlder(res.data.length===100);historyCursor.current=res.data[0]?.id; setMessages(prev => [...new Map([...res.data, ...prev].map(m => [m.id, m])).values()]); }
      })
      .catch((err) => {
        if(!cancelled)setUploadError(err.response?.data?.error || 'Falha ao carregar o histórico');
      });
    return () => { cancelled = true; clearTimeout(typingTimeoutRef.current); };
  }, [channel?.id,channel?.type]);

  // Escuta novas mensagens em tempo real com som
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMsg) => {
      if (newMsg.channelId === channel?.id) {
        setMessages((prev) => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);

      }
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, channel, currentUser]);

  // Auto-scroll para a mensagem mais recente
  useEffect(() => {
    const last=messages.at(-1)?.id;if(last && last!==lastMessage.current)messagesEndRef.current?.scrollIntoView({ behavior: getPreferences().reduceMotion?'instant':'smooth' });lastMessage.current=last;
  }, [messages]);

  // Indicador de "digitando..."
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (socket && channel) {
      socket.emit('typing_start', { channelId: channel.id });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing_stop', { channelId: channel.id });
      }, 1500);
    }
  };

  // Seleção de arquivo com validação do limite de 10MB
  const handleFileSelect = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Arquivo excede o limite de 10MB! Escolha um arquivo menor para não pesar a rede.');
      setSelectedFile(null);
      return;
    }
    setUploadError('');
    setSelectedFile(file);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if(isUploading)return;
    setUploadError('');
    if (!socket?.connected) { setUploadError('Sem conexão. Sua mensagem foi mantida para tentar novamente.'); return; }
    if (!inputText.trim() && !selectedFile) return;

    setIsUploading(true);
    const contextId=channel.id;
    let attachment = null;

    if (selectedFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const uploadRes = await axios.post(`${API_BASE_URL}/api/upload`, formData);
        attachment = uploadRes.data;
      } catch (err) {
        setUploadError(err.response?.data?.error || 'Erro no envio do arquivo.');
        setIsUploading(false);
        return;
      }

    }

    if (socket && channel) {
      try {
        const response = await socket.timeout(5000).emitWithAck('send_message', { channelId: channel.id, content: inputText, attachment, replyTo: replyTo?.id });
        if (!response?.ok) throw new Error(response?.error || 'Mensagem não confirmada');
      } catch (error) { if(channelRef.current===contextId)setUploadError(error.message);setIsUploading(false); return; }

      socket.emit('typing_stop', { channelId: channel.id });
    }

    setIsUploading(false);
    if(channelRef.current!==contextId)return;
    setSelectedFile(null);setInputText('');
    setReplyTo(null);
  };

  const addEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  const currentTyping = (channel && typingUsers[channel.id]) || [];

  if (!channel || channel.type !== 'text') {
    return (
      <div className="flex-1 bg-discord-chat flex flex-col items-center justify-center text-discord-textMuted p-6">
        <Hash className="w-16 h-16 mb-4 text-discord-textMuted" />
        <h3 className="text-xl font-bold text-discord-textHeader">{translate("Nenhum canal de texto selecionado")}</h3>
        <p className="text-sm">{translate("Selecione um canal #texto na barra ao lado para começar a interagir.")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-discord-chat flex flex-col h-full overflow-hidden relative">
      {/* Top Header do Canal */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="w-6 h-6 text-discord-textMuted" />
          <span className="font-bold text-discord-textHeader">{channel.name}</span>
          {channel.topic && (
            <>
              <span className="text-discord-textMuted">|</span>
              <span className="text-xs text-discord-textMuted truncate max-w-md">{channel.topic}</span>
            </>
          )}
        </div>
      </div>

      <ConversationToolbar tools={tools}/>
      <form onSubmit={find} className="flex gap-2 mx-4 my-2 shrink-0">
        <input aria-label={translate("Buscar mensagens no canal")} value={query} onChange={e=>setQuery(e.target.value)} maxLength={200} placeholder={translate("Buscar mensagens neste canal")} className="flex-1 min-w-0 bg-discord-darkest rounded px-3 py-2 text-xs"/>
        <button disabled={searching || !query.trim()} className="text-xs text-discord-blurple disabled:opacity-50">{searching?'Buscando…':translate("Buscar")}</button>
      </form>
      {results&&<section aria-label={translate("Resultados da busca")} className="max-h-64 overflow-auto bg-discord-darker border-b border-discord-active p-4"><div className="flex justify-between text-sm"><b>{results.length} {translate("resultado(s)")}{results.length===100?' (até 100)':''}</b><button onClick={()=>setResults(null)}>{translate("Fechar busca")}</button></div>{results.length===0&&<p className="text-discord-textMuted text-sm mt-2">{translate("Nenhuma mensagem encontrada.")}</p>}{results.map(m=><button key={m.id} onClick={()=>jump(m.id)} className="block w-full text-left p-2 hover:bg-discord-hover rounded"><b className="text-xs">{m.sender.username}</b><p className="text-sm truncate">{m.content}</p></button>)}</section>}

      {/* Banner de Transmissão Ativa no Canal de Voz conectado */}
      {currentVoiceChannel && !isScreenSharing && (() => {
        const participants = voiceRooms[currentVoiceChannel.id] || [];
        const remoteSharer = participants.find(p => p.isScreenSharing && p.socketId !== socket?.id);
        const sharer = activeScreenSharer || (remoteSharer ? { socketId: remoteSharer.socketId, user: remoteSharer.user } : null);

        if (!sharer) return null;

        return (
          <div className="bg-discord-green/20 border-b border-discord-green/40 px-4 py-2 flex items-center justify-between text-xs shrink-0 shadow-md">
            <div className="flex items-center gap-2 text-white font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-discord-green animate-ping" />
              <span>
                <strong className="text-discord-green">{sharer.user?.username || 'Alguém'}</strong> {translate("está compartilhando a tela em")} <strong>{currentVoiceChannel.name}</strong>!
              </span>
            </div>
            <button
              onClick={() => {
                if (onSwitchToVoice) {
                  onSwitchToVoice(currentVoiceChannel);
                }
                startWatchingScreen(sharer.socketId);
              }}
              className="bg-discord-green hover:bg-green-600 text-white px-3 py-1 rounded font-bold transition shadow flex items-center gap-1.5 cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{isWatchingScreen ? 'Abrir Transmissão' : 'Assistir Tela'}</span>
            </button>
          </div>
        );
      })()}


      {/* Lista de Mensagens */}
      <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFileSelect(e.dataTransfer.files?.[0]);}} className="message-list flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Banner inicial de boas-vindas do canal */}
        <div className="pt-4 pb-2">
          <div className="w-16 h-16 rounded-full bg-discord-darker flex items-center justify-center mb-2">
            <Hash className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">{translate("Bem-vindo a #")}{channel.name}!</h2>
          <p className="text-discord-textMuted text-sm">{translate("Converse, compartilhe arquivos e responda aos seus amigos.")}</p>
        </div>

        <div className="w-full h-[1px] bg-discord-darker my-2" />

        {hasOlder&&<button type="button" disabled={loadingOlder} onClick={older} className="text-discord-blurple text-sm">{loadingOlder?translate("Carregando…"):translate("Carregar mensagens anteriores")}</button>}
        {/* Mensagens enviadas */}
        {messages.map((msg, index) => {
          const isSameSender =
            !msg.reply && index > 0 && messages[index - 1]?.sender?.id === msg.sender?.id;

          const date = new Date(msg.timestamp);
          const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateFormatted = date.toLocaleDateString();

          return (
            <div
              key={msg.id || index}
              id={`message-${msg.id}`} onContextMenu={e=>tools.openMenu(e,msg,{onReply:()=>reply(msg),onEdit:()=>setEditing(msg),onDelete:()=>setDeleting(msg)})}
              className={`message-row flex gap-4 group hover:bg-discord-hover -mx-4 px-4 py-1 rounded transition ${
                isSameSender ? 'pt-0.5' : 'pt-2'
              }`}
            >
              {!isSameSender ? (
                <ProtectedImage
                  src={msg.sender?.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=user'}
                  alt={msg.sender?.username}
                  onClick={() => onOpenProfile && onOpenProfile(msg.sender)}
                  className="w-10 h-10 rounded-full mt-0.5 shrink-0 bg-discord-darkest object-cover cursor-pointer hover:opacity-85 transition"
                  title={translate("Ver perfil")}
                />
              ) : (
                <div className="w-10 shrink-0 text-center">
                  <span className="text-[10px] text-discord-textMuted opacity-0 group-hover:opacity-100 transition">
                    {timeFormatted}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                {msg.reply && <button type="button" onClick={() => jump(msg.reply.id)} className="text-xs text-discord-textMuted mb-1 block text-left truncate max-w-full">↪ {msg.reply.username}: {msg.reply.content || 'Anexo'}</button>}
                {!isSameSender && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      onClick={() => onOpenProfile && onOpenProfile(msg.sender)}
                      className="font-semibold text-sm text-discord-textHeader hover:underline cursor-pointer"
                      title={translate("Ver perfil")}
                    >
                      {msg.sender?.username}
                    </span>
                    <span className="text-[11px] text-discord-textMuted">{dateFormatted} {translate("às")} {timeFormatted}</span>
                  </div>
                )}

                {msg.deletedAt?<p className="text-xs italic text-discord-textMuted">{translate("Mensagem excluída")}</p>:editing?.id===msg.id?<MessageEdit kind="channels" contextId={channel.id} message={msg} setMessages={setMessages} onClose={()=>setEditing(null)} onError={setUploadError}/>:msg.content && (
                  <RichMessage content={msg.content} editedAt={msg.editedAt}/>
                )}

                {/* Arquivos / Imagens / GIFs Anexados */}
                {!msg.deletedAt && msg.attachment && <Attachment attachment={msg.attachment} onError={setUploadError}/>}
                {!msg.deletedAt && <MessageReactions message={msg} tools={tools}/>}

              </div>
              <MessageActions message={msg} tools={tools} own={msg.sender?.id===currentUser.id} canManage={!!channel.permissions?.manageMessages} onReply={()=>reply(msg)} onEdit={()=>setEditing(msg)} onDelete={()=>setDeleting(msg)}/>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {deleting&&<DeleteMessageDialog kind="channels" contextId={channel.id} message={deleting} setMessages={setMessages} onClose={()=>setDeleting(null)} onError={setUploadError}/>}
      {mediaPicker&&<MediaPicker onClose={()=>setMediaPicker(false)} onSelect={async item=>{if(item.kind==='gif'){const r=await axios.get(item.url,{responseType:'blob'});handleFileSelect(new File([r.data],`${item.name}.gif`,{type:'image/gif'}));}else setInputText(prev=>prev+item.value);}}/>}
      {/* Indicador de quem está digitando */}
      <div className="h-5 px-4 text-xs text-discord-textMuted shrink-0">
        {currentTyping.length > 0 && (
          <div className="flex items-center gap-1.5 animate-pulse">
            <span className="font-semibold text-discord-textNormal">
              {currentTyping.map((u) => u.username).join(', ')}
            </span>
            <span>{currentTyping.length === 1 ? 'está digitando...' : 'estão digitando...'}</span>
          </div>
        )}
      </div>

      {/* Alerta de erro de upload */}
      {uploadError && (
        <div className="mx-4 mb-2 p-2 bg-discord-red/20 border border-discord-red/40 rounded flex items-center justify-between text-xs text-discord-red">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError('')} className="hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Prévia de anexo selecionado */}
      {selectedFile && (
        <div className="mx-4 mb-2 p-2 bg-discord-darker rounded flex items-center justify-between border border-discord-active">
          <div className="flex items-center gap-2 truncate">
            <Paperclip className="w-4 h-4 text-discord-blurple shrink-0" />
            <span className="text-xs text-discord-textNormal truncate">{selectedFile.name}</span>
            <span className="text-[10px] text-discord-textMuted">({Math.round(selectedFile.size / 1024)} {translate("KB / máx 10MB)")}</span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-discord-textMuted hover:text-discord-red"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Caixa de Entrada de Mensagem */}
      <form onSubmit={handleSendMessage} className="px-4 pb-6 shrink-0 relative">
        <div className="flex gap-3 mb-2 text-xs"><button type="button" onClick={()=>setMediaPicker(true)}>{translate("Emojis, GIFs e stickers")}</button><VoiceRecorder disabled={isUploading || !socket?.connected} onFile={handleFileSelect} onError={setUploadError}/></div>
        {replyTo && <div className="bg-discord-darker px-3 py-2 text-xs flex justify-between rounded-t"><span>{translate("Respondendo a")} <b>{replyTo.sender?.username}</b>: {replyTo.content?.slice(0,120) || "Anexo"}</span><button type="button" onClick={() => setReplyTo(null)}>{translate("Cancelar resposta")}</button></div>}
        <div className="bg-discord-active rounded-lg flex items-center px-4 py-2.5 gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-discord-textMuted hover:text-white transition"
            title={translate("Enviar anexo (máx 10MB)")}
          >
            <PlusCircle className="w-6 h-6" />
          </button>

          <MessageComposer kind="channels" id={channel.id}
            ref={composerRef}
            disabled={isUploading}
            aria-label={translate("Mensagem do canal")}
            onEscape={()=>setReplyTo(null)} onSubmit={handleSendMessage}
            maxLength={4000}
            value={inputText}
            onChange={handleInputChange}
            placeholder={`Conversar em #${channel.name}`}
            className="flex-1 min-w-0 bg-transparent text-discord-textHeader placeholder-discord-textMuted text-sm focus:outline-none"
          />

          {/* Seletor de Emojis Corrigido e Categorizado */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-discord-textMuted hover:text-white transition"
              title={translate("Abrir seletor de emojis")}
            >
              <Smile className="w-6 h-6" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 w-72 bg-discord-darker border border-discord-active rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-discord-active pb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">{translate("Emojis")}</span>
                  <span className="text-[10px] text-discord-textMuted">{translate("Clique para adicionar")}</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                  {emojiCategories.map((cat) => (
                    <div key={cat.category}>
                      <span className="text-[10px] font-bold text-discord-textMuted uppercase mb-1 block">
                        {cat.category}
                      </span>
                      <div className="grid grid-cols-7 gap-1">
                        {cat.items.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => addEmoji(emoji)}
                            className="text-lg p-1 hover:bg-discord-hover rounded transition hover:scale-125 flex items-center justify-center"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedFile) || isUploading}
            className="text-discord-textMuted hover:text-discord-blurple disabled:opacity-40 transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
