import {t as translate,useLocale} from '../localization';
import React,{useState,useEffect} from 'react';
import {Reply,Pencil,Trash2} from 'lucide-react';
import api from '../api';
import {useSocket} from '../context/SocketContext';
export function applyMessageChange(messages,change) {
  return messages.map(m=>{
    const result=m.id===change.id?{...m,...change}:m;
    if(result.reply?.id===change.id) return {...result,reply:{...result.reply,content:change.deletedAt?'Mensagem excluída':change.content ?? result.reply.content}};
    return result;
  });
}
export function useMessageChanges(kind,id,setMessages) {
  const {socket}=useSocket();
  useEffect(()=>{
    const update=change=>{if((kind==='dms'?change.conversationId:change.channelId)===id)setMessages(prev=>applyMessageChange(prev,change));};
    const prefix=kind==='dms'?'dm':'message';socket?.on(`${prefix}_updated`,update);socket?.on(`${prefix}_deleted`,update);
    return()=>{socket?.off(`${prefix}_updated`,update);socket?.off(`${prefix}_deleted`,update);};
  },[socket,kind,id,setMessages]);
}
export function MessageActions({message,own,canManage=false,tools,onReply,onEdit,onDelete}) {
  useLocale();
  if(message.deletedAt)return null;
  return <div className="message-actions self-start text-discord-textMuted"><button type="button" aria-label={`Responder mensagem de ${message.sender?.username}`} title={translate("Responder")} onClick={onReply} className="flex gap-1 items-center"><Reply size={16}/><span>{translate("Responder")}</span></button>{own&&!message.inviteCode&&message.content&&<button type="button" aria-label={translate("Editar mensagem")} title={translate("Editar mensagem")} onClick={onEdit}><Pencil size={16}/></button>}{(own || canManage)&&<button type="button" aria-label={translate("Excluir mensagem")} title={translate("Excluir mensagem")} onClick={onDelete}><Trash2 size={16}/></button>}{tools&&<button type="button" aria-label={translate("Ações da mensagem")} title={translate("Ações da mensagem")} onClick={e=>tools.openMenu(e,message,{onReply,onEdit,onDelete})}>⋯</button>}</div>;
}
export function MessageEdit({kind,contextId,message,setMessages,onClose,onError}) {
  useLocale();
  const [text,setText]=useState(message.content),[busy,setBusy]=useState(false);
  async function save(e){e.preventDefault();setBusy(true);try{const {data}=await api.put(`/api/${kind}/${contextId}/messages/${message.id}`,{content:text});setMessages(prev=>applyMessageChange(prev,data));onClose();}catch(e){onError(e.response?.data?.error || 'Falha ao editar mensagem');}finally{setBusy(false);}}
  return <form onSubmit={save} className="my-2"><textarea autoFocus aria-label={translate("Editar conteúdo da mensagem")} maxLength={4000} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')onClose();}} className="bg-discord-darkest w-full p-3 rounded text-discord-textNormal"/><div className="flex gap-3 text-xs mt-2"><button disabled={busy || !text.trim()} className="bg-discord-blurple text-white px-3 py-1 rounded disabled:opacity-40">{translate("Salvar mensagem")}</button><button type="button" disabled={busy} onClick={onClose}>{translate("Cancelar edição")}</button></div></form>;
}
export function DeleteMessageDialog({kind,contextId,message,setMessages,onClose,onError}) {
  useLocale();
  const [busy,setBusy]=useState(false);
  async function remove(){setBusy(true);try{const {data}=await api.delete(`/api/${kind}/${contextId}/messages/${message.id}`);setMessages(prev=>applyMessageChange(prev,data));onClose();}catch(e){onError(e.response?.data?.error || 'Falha ao excluir mensagem');}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><section role="dialog" aria-label={translate("Excluir mensagem")} className="bg-discord-chat text-discord-textNormal rounded-xl p-6 w-full max-w-md shadow-2xl"><h2 className="text-lg font-bold text-discord-textHeader">Excluir mensagem?</h2><p className="my-4 text-sm">{translate("A mensagem deixará de aparecer na conversa.")}</p><blockquote className="text-discord-textMuted bg-discord-darker p-3 rounded max-h-32 overflow-auto break-words">{message.content || 'Anexo'}</blockquote><div className="flex gap-3 justify-end mt-5"><button disabled={busy} onClick={onClose}>{translate("Cancelar")}</button><button disabled={busy} onClick={remove} className="bg-discord-red text-white rounded px-4 py-2">{busy?'Excluindo…':translate("Excluir")}</button></div></section></div>;
}
