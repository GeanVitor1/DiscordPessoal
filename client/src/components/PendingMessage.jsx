import React from 'react';
import {Clock3, Paperclip} from 'lucide-react';
import ProtectedImage from './ProtectedImage';
import {t} from '../localization';

// This is local feedback only. The saved message and all its actions still come
// from the authenticated server event; a timeout never becomes "delivered".
export default function PendingMessage({pending, messages}) {
  if (!pending || messages.some(m=>!pending.knownIds.has(m.id) && m.sender.id===pending.sender.id && m.content===pending.content)) return null;
  return <div data-testid="pending-message" className="pending-message flex gap-3 px-2 py-3 opacity-70" role="status">
    <ProtectedImage src={pending.sender.avatar} alt={pending.sender.username} className="w-9 h-9 rounded-full"/>
    <div className="min-w-0 flex-1"><b className="text-sm text-discord-textHeader">{pending.sender.username}</b><p className="message-content break-words">{pending.content}</p>{pending.filename && <p className="text-xs text-discord-textMuted flex items-center gap-1"><Paperclip size={12}/>{pending.filename}</p>}<span className="text-xs text-discord-textMuted flex items-center gap-1 mt-1"><Clock3 size={12}/>{t('Enviando…')}</span></div>
  </div>;
}
